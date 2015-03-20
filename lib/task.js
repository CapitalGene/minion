'use strict';
/**
 * minion.Task
 *
 * Can be `compiled` with `minion`, so task will inherit the `app`, which
 * includes all the `calling` related info.
 *
 * Since each task essentially is a Promise, they can be chained or groupped
 * naturally using `bluebird`
 *
 * @author Chen Liang [code@chen.technology]
 */

/*!
 * Module dependencies.
 */
var Promise = require('./utils').Promise;
var broker = require('broker-node');
var LocalStack = require('./utils').LocalStack;
var uuid = require('node-uuid');
var debug = require('debug')('minion:Task');
var _ = require('lodash');
var inherits = require('util').inherits;

/**
 *  Context that defines a task
 *
 *  @method  TaskContext
 *
 *  @param   {[type]}     object  [description]
 */
var TaskContext = function (object) {
  // default context
  this.id = null;
  this.status = null;
  this.object = null;
  this.retries = 0;
  this.eta = null;
  this.expires = null;
  this.isEager = false;
  this.headers = null;
  this.deliveryInfo = null;
  this.replyTo = null;
  this.correlationId = null;
  this.publishedAt = null;
  this.finishedAt = null;
  this.timelimit = null;

  _.merge(this, object);
};

TaskContext.headerMap = {
  'id': 'x-minion-task-id',
  'status': 'x-minion-status',
  'retries': 'x-minion-retries',
  'expires': 'x-minion-expires',
  'publishedAt': 'x-minion-published-at',
  'finishedAt': 'x-minion-finished-at'
};

TaskContext.populateFromHeaders = function (context, headers) {
  context.headers = headers;
  _.forEach(this.headerMap, function (field, key) {
    if (headers[field]) {
      context[key] = headers[field];
    }
  });
};

TaskContext.populateFromMessage = function (context, message) {
  TaskContext.populateFromHeaders(context, message.headers);
  context.deliveryInfo = message.deliveryInfo;
  context.correlationId = message.correlationId;
  context.replyTo = message.replyTo;
};

/**
 * when call task, return a promise
 *
 * @param {Object} config [description]
 * @param {App} config.app the app for the task
 * @param {String} config.name the task name
 * @param {String} config.routingKey optional routingKey for task
 * @param {Function} config.handler actual task function
 *                                  @optional
 * @param {broker.Exchange} config.exchange Exchange for task, should be set
 *                                          by App
 * @param {Boolean} config.ignoreResult If enabled the worker will not store
 *                                      task state and return values for this
 *                                      task.
 *                                      @default false
 * @param {Number} config.maxRetries Maximum number of retries before giving up.
 *                                   If set to `null`, it will **never**
 *                                   stop retrying.
 *                                   @default 3
 * @param {Number} config.retryDelay Default time in seconds before a retry of the
 *                            task should be executed.
 *                            @default 3 * 60 (3 minutes)
 */
var Task = function (config) {
  config = config || {};

  this.name = config.name;
  this.routingKey = config.routingKey || this.name;
  this.ignoreResult = config.ignoreResult;
  this.maxRetries = config.maxRetries || 3;
  this.retryDelay = config.retryDelay || 3 * 60;
  // this.app = config.app;
  // this.exchange = config.exchange;
  this.handler = config.handler;

};

Task.TaskContext = TaskContext;

/**
 * Generate a `broker.Message` for the task
 *
 * @param  {Object} object  payload, message body
 * @param  {Object} options [description]
 * @param  {Number} options.ttl `expiration` field for message in ms
 *                              @notimplemented
 * @param  {String} options.deadLetterExchange `x-dead-letter-exchange`
 *                                             if the message is for a delayed
 *                                             task, this value will be the
 *                                             actual task queue after the ttl
 *                                             expired
 *                                             @notimplemented
 * @return {broker.Message}         [description]
 */
Task.prototype.generateMessage = function (object, options) {
  debug('generateMessage');
  options = options || {};
  var taskId = this.getId();
  var correlationId = taskId;
  // meta data for the tasks
  var headers = {
    taskName: this.name,
    publishedAt: Date.now()
  };
  return new broker.Message({
    body: object,
    correlationId: correlationId,
    replyTo: this.resultQueue.name,
    deliveryModel: true,
    headers: headers
  });
};


/**
 * We will use one queue for each delayed task. The queue will be deleted after
 * a certain amount of time (default 20s) by setting `x-expires` argument
 *
 * @param  {[type]} options [description]
 * @param  {[type]} options.taskId @required
 * @param  {Number} options.messageTtl `x-message-ttl` in ms
 * @param  {[type]} options.queueExpires `x-expires` argument in ms
 *                                       @optional
 * @param  {[type]} [varname] [description]
 *
 * @return {broker.Queue}         [description]
 */
Task.prototype.generateQueueForDelayedTask = function (options) {
  debug('generateQueueForDelayedTask');
  options = options || {};
  var queueName = 'minion.delayed.' + this.getId();
  var messageTtl = options.messageTtl || 0;
  var queueExpires = (options.queueExpires || 20 * 1000) + messageTtl;
  var queue = new broker.Queue({
    name: queueName,
    exchange: this.exchange,
    channel: this.exchange.channel,
    routingKey: queueName,
    durable: true,
    autoDelete: false,
    queueArguments: {
      'x-expires': queueExpires,
      'x-message-ttl': messageTtl,
      'x-dead-letter-exchange': this.exchange.name,
      'x-dead-letter-routing-key': this.routingKey
    }
  });
  return queue;
};

/**
 * execute the task by sending it to rabbitmq
 *
 * create a new message to `task queue` on `rabbitmq` and
 * returns a promise which will be fulfilled when the `task executed`
 * by `worker` and `rabbitmq` send back the result
 *
 * returned Promise will have `taskId` as the `correlationId`
 *
 * @param  {Object} object task payload
 * @param  {object} options overide task's default options
 * @param  {Boolean} options.ignoreResult If enabled the worker will not store
 *                                        task state and return values for this
 *                                        task. Task Promise will be resolved
 *                                        immediately with taskId
 *                                        @default false
 * @param  {Number} options.countdown a shortcut to set eta by seconds into the
 *                                    future.
 * @param  {Date|Number} options.eta The ETA (estimated time of arrival) lets
 *                                   you set a specific date and time that is
 *                                   the earliest time at which your task will
 *                                   be executed.
 * @return {Promise}             will be resolved when the task is executed
 *                               and succeed.
 *                               will be rejected when the task is executed
 *                               and failed.
 */
Task.prototype.applyAsync = function (object, options) {
  debug('delay', object, options);
  options = options || {};
  var self = this;
  var taskId = this.getId();
  debug('delay', 'taskId', taskId);
  this.payload = object;

  if (options.countdown) {
    self.countdown = options.countdown;
  }
  if (options.eta) {
    self.eta = options.eta;
  }
  if (options.ignoreResult) {
    self.ignoreResult = options.ignoreResult;
  }

  var taskPromise = new Promise(function (resolve, reject) {

    var ignoreResult = self.ignoreResult === true;
    debug('delay', 'ignoreResult', ignoreResult);
    if (!ignoreResult) {
      self.waitingForResult[taskId] = {
        taskName: self.name,
        resolver: null
      };
    }
    var publishingMessage = self.app.sendTask(self);

    // debug('delay', message.getPublishOptions());
    return publishingMessage
      .then(function (publishedResult) {
        debug('delay', 'publishedResult', publishedResult);
        if (!ignoreResult) {
          self.waitingForResult[taskId].resolver = resolve;
          self.waitingForResult[taskId].rejecter = reject;
        } else {
          resolve(taskId);
        }
      });
  });

  // set the custom prop to Bluebird promise
  taskPromise.setTaskId(taskId);
  return taskPromise;
};

/**
 * Retry a task
 *
 * @method  retry
 *
 * @param   {Object}  options  retry options
 * @param   {Number} options.countdown Time in seconds to delay the retry for.
 * @param   {Date|Number} options.eta Explicit time and date to run the retry at
 * @param   {Number} options.maxRetries If set, overrides the default retry limit.
 *                                      A value of `null`, means "use the default",
 *                                      so if you want infinite retries you would
 *                                      have to set the `maxRetries` attribute
 *                                      of the task to `null` first.
 * @param   {timeLimit} options.timeLimit If set, overrides the default time limit.
 *                                        @deprecated not implemented
 *
 * @return  {[type]}  [description]
 */
Task.prototype.retry = function (options) {
  debug('retry', options);
  options = options || {};
  var self = this;
  var taskId;
};

/**
 * Execute the directly by a `worker` and returns the result
 *
 * @param  {[type]} object [description]
 * @return {[type]}        [description]
 */
Task.prototype.exec = Promise.method(function (object) {
  return this.handler(object);
});

Task.prototype.getId = function () {
  if (!this.id) {
    this.id = uuid.v4();
  }
  return this.id;
};


/**
 *  Compile a new Task that inherits this task instance
 *
 *  @method  compile
 *
 *  @param   {minion.App} app the app this task is registered to
 *
 *  @return  {[type]}  [description]
 */
Task.prototype.compile = function (app) {

  var newTask = function () {
    if (!(this instanceof newTask)) {
      // not using new
      return newTask.exec(arguments[0]);
    }
    var obj = arguments[0];
    if (obj instanceof broker.Message) {
      this.message = obj;
      this.context = new TaskContext();
      TaskContext.populateFromMessage(this.context, obj);
    } else if (obj instanceof TaskContext) {
      this.context = new TaskContext(obj);
    } else {
      this.context = new TaskContext();
    }
  };
  inherits(newTask, Task);

  // inherit config
  newTask.app = app;
  newTask.prototype.app = app;
  newTask.exchange = app.exchange;
  newTask.prototype.exchange = app.exchange;
  var taskQueue = new broker.Queue({
    name: this.name,
    exchange: app.exchange,
    channel: app.exchange.channel,
    routingKey: this.routingKey,
    durable: true,
    autoDelete: false
  });
  newTask.taskName = this.name;
  newTask.queue = taskQueue;
  newTask.routingKey = this.routingKey;
  newTask.ignoreResult = this.ignoreResult;
  newTask.maxRetries = this.maxRetries;
  newTask.retryDelay = this.retryDelay;
  newTask.handler = this.handler;
  newTask.prototype.queue = taskQueue;
  newTask.prototype.name = this.name;
  newTask.prototype.routingKey = this.routingKey;
  newTask.prototype.ignoreResult = this.ignoreResult;
  newTask.prototype.maxRetries = this.maxRetries;
  newTask.prototype.retryDelay = this.retryDelay;
  newTask.prototype.handler = this.handler;

  // handling results
  newTask.waitingForResult = {};
  newTask.prototype.waitingForResult = newTask.waitingForResult;
  newTask.returnMessageHandler = function (message) {
    debug('returnMessageHandler');
    // var self = this;
    if (!message.properties ||
      !message.properties.correlationId) {
      debug('returnMessageHandler', 'no correlationId');
      return;
    }
    // var taskName = message.properties.headers.taskName;
    var correlationId = message.properties.correlationId;
    if (!this.waitingForResult[correlationId]) {
      debug('returnMessageHandler', 'correlationId not in waitingForResult');
      return;
    }
    var resultObject = JSON.parse(message.rawMessage.content.toString());
    if (message.properties.headers.taskStatus &&
      message.properties.headers.taskStatus === 'rejected') {
      var errObj = resultObject;
      var err = new Error(errObj.message);
      err.name = errObj.name;
      err.stack = errObj.stack;
      err.code = err.statusCode = errObj.statusCode;
      this.waitingForResult[correlationId].rejecter(err);
    } else {
      this.waitingForResult[correlationId].resolver(resultObject);
    }
    delete this.waitingForResult[correlationId];
  };

  // var requestStack = new LocalStack();
  var resultQueueName = 'results.' + uuid.v4();
  var resultQueue = new broker.Queue({
    name: resultQueueName,
    routingKey: resultQueueName,
    exchange: app.exchange,
    exclusive: true,
    autoDelete: true,
    durable: false,
  });
  newTask.resultQueueName = resultQueueName;
  newTask.prototype.resultQueueName = resultQueueName;
  newTask.resultQueue = resultQueue;
  newTask.prototype.resultQueue = resultQueue;

  var resultConsumer = new broker.Consumer({
    noAck: true,
    channel: newTask.exchange.channel,
    queues: [newTask.resultQueue],
    messageHandler: newTask.returnMessageHandler.bind(newTask)
  });
  // newTask.prototype.requestStack = requestStack;

  newTask.resultConsumer = resultConsumer;
  newTask.prototype.resultConsumer = resultConsumer;
  newTask.delay = function (object, options) {
    var t = new this();
    return t.applyAsync(object, options);
  };

  newTask.exec = function (object) {
    return (new this()).exec(object);
  };
  /**
   *  Start to handling this task
   *
   *  @method  start
   *
   *  @return  {[type]}  [description]
   */
  newTask.start = function () {
    debug('start');
    var self = this;
    return this.resultConsumer.declare()
      .then(function () {
        debug('resultConsumer', 'declared');
        return self.resultConsumer.consume();
      })
      .then(function () {
        debug('started to consume');
        return self.queue.declare();
      })
      .then(function () {
        debug('queue declared');
      });
  };

  return newTask;
};


module.exports = Task;
