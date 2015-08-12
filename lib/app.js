'use strict';
/**
 * @author Chen Liang [code@chen.technology]
 */

/*!
 * Module dependencies.
 */
var utils = require('./utils');
var Promise = utils.Promise;
var _ = require('lodash');
var uuid = require('node-uuid');
var broker = require('broker-node');

var debug = require('debug')('minion:App');
var Task = require('./task');

/**
 * @example
 * var app = new App({});
 *
 * @constructor
 * @exports App
 *
 * @param {Object} options
 * @param {String} options.backend rabbitmq uri: amqp://localhost
 * @param {String} options.exchangeName the default exchange name 'mytask'
 * @param {broker.Connection} options.connection using an existing connection
 *                                               so, one amqp connection can
 *                                               be shared between moduels
 *
 */
var App = function(options) {
  debug('new App');
  this.options = options || {};

  /**
   * rabbitmq connection
   * @type {broker.Connection}
   */
  this.connection = null;
  // set up connection
  if (this.options.connection &&
    (this.options.connection instanceof broker.Connection)) {
    this.connection = this.options.connection;
  } else {
    this.connection = new broker.Connection({
      uri: this.options.backend,
      transportOptions: {
        clientProperties: {
          'product': 'minion',
          'version': require('../package.json').version,
          'platform': 'Node.JS ' + process.version,
          'information': 'https://github.com/CapitalGene/minioin',
        },
      },
    });
  }

  /**
   * store registered tasks
   * @type {Object}
   */
  this.tasks = {};
  /**
   * store dispatched tasks which are waiting for response
   * @type {Object}
   */
  this.waitingForResult = {};
  /**
   * default Channel
   * @type {broker.Channel}
   */
  this.defaultChannel = this.channel();
  /**
   * default exchange
   * @type {broker.Exchange}
   */
  this.exchange = new broker.Exchange({
    name: this.options.exchangeName || 'minion-exchange',
    type: 'topic',
    deliveryMode: true,
    durable: true,
    autoDelete: false,
    channel: this.defaultChannel,
  });
  /**
   * default Producer
   * @type {broker.Producer}
   */
  this.producer = new broker.Producer({
    channel: this.channel(),
    exchange: this.exchange,
    autoDeclare: false,
  });
  /**
   * queue name for results
   * @type {String}
   */
  this.resultQueueName = 'results.' + uuid.v4();
  /**
   * default Queue
   * @type {broker.Queue}
   */
  this.resultQueue = new broker.Queue({
    name: this.resultQueueName,
    routingKey: this.resultQueueName,
    exchange: this.exchange,
    exclusive: true,
    autoDelete: true,
    durable: false,
  });
  /**
   * default Consumer
   * @type {broker.Consumer}
   */
  this.resultConsumer = new broker.Consumer({
    noAck: true,
    channel: this.channel(),
    queues: [this.resultQueue],
    messageHandler: this.returnMessageHandler.bind(this),
  });
};

/**
 * Return `queues` of `tasks` as an Array
 *
 * @for minion.Worker
 *
 * @param  {Object} options
 * @param  {Array<String>} options.queues specify what queues to consume from
 * @return {Array} queues of registered tasks
 */
App.prototype._getTaskQueues = function(options) {
  options = options || {};
  var self = this;
  if (options.queues && _.isArray(options.queues)) {
    return _.reduce(options.queues, function(result, queueName) {
      if (_.has(self.tasks, queueName)) {
        result.push(self.tasks[queueName].queue);
      }
      return result;
    }, []);
  }
  return _.reduce(this.tasks, function(result, task) {
    result.push(task.queue);
    return result;
  }, []);
};

/**
 * Initiate the connection to rabbitmq and set up `exchange` and `queue`
 *
 * * each task opens a channel
 *
 *
 * @return {Promise}
 */
App.prototype.connect = function() {
  debug('#connect');
  var self = this;
  return this.connection.connect()
    .then(function() {
      return self.producer.declare();
    })
    .then(function() {
      // declare result queue and consumer
      return self.resultConsumer.declare();
    })
    .then(function() {
      // start to consume results
      return self.resultConsumer.consume();
    })
    .then(function() {
      // delcare task queues
      var declaringTaskQueues = _.reduce(self._getTaskQueues(), function(result, queue) {
        result.push(queue.declare());
        return result;
      }, []);
      return Promise.all(declaringTaskQueues);
    });
};

/**
 * Create and return a new channel.
 *
 * @return {broker.Channel}
 */
App.prototype.channel = function() {
  return this.connection.channel();
};

/**
 * Construct a task
 *
 *
 * @example
 * var app = new App();
 * var taskAdd = app.task({
 *   name: 'my.add',
 *   handler: function(object){}
 * });
 *
 * // calling task
 * var resultPromise = taskAdd.delay({number1: 1, number2: 2});
 *
 * // get result
 * resultPromise.then(function(result){
 *   console.log(result); // 3
 * })
 *
 * @example
 * var taskAdd = new Task();
 *
 * @param {Object|Task} config @see minion/Task
 *
 * @returns {minion/Task} created task
 */
App.prototype.task = function(config) {
  var task;
  if (config.prototype instanceof Task) {
    task = config;
  } else {
    config = config || {};
    // config.app = this;
    // config.exchange = this.exchange;

    task = new Task(config).compile(this);
  }

  this.registerTask(task);
  // task.queue.declare();
  return task;
};

/**
 * Register a Compiled task
 *
 * @param {Task} task compiled task
 */
App.prototype.registerTask = function(task) {
  if (!(task.prototype instanceof Task)) {
    throw new Error('task must be an instance of Task');
  }
  if (this.tasks[task.taskName]) {
    throw new Error('task ' + task.taskName + ' is already registered');
  }
  this.tasks[task.taskName] = task;
};


/**
 * Execute a task by name
 *
 * @param  {String} taskName   [description]
 * @param  {Object} taskObject task payload
 * @param  {object} options see Task.delay(object, options)
 *
 * @return {Promise}            [description]
 */
App.prototype.do = function(taskName, taskObject, options) {
  if (!this.tasks[taskName]) {
    return Promise.reject(new Error('unable to find task ' + taskName));
  }
  return this.tasks[taskName].delay(taskObject, options);
};

/**
 *  Send task to amqp
 *
 *  @param   {Task}  task
 *  @param   {Object}  options
 *
 *  @return  {Promise}
 */
App.prototype.sendTask = function(task, options) {
  debug('sendTask');
  var self = this;
  var taskId = task.getId();

  var routingKey = task.routingKey;
  if (!taskId) {
    return Promise.reject(new Error('taskId is missing'));
  }
  // see if it's delayed tasks
  // handle delayed task
  var sending;
  if (task.countdown) {
    var ttl = 0;

    ttl = task.countdown * 1000;

    var delayedQueue = task.generateQueueForDelayedTask({
      taskId: taskId,
      messageTtl: ttl,
    });
    routingKey = delayedQueue.routingKey;
    sending = delayedQueue.declare();
  } else {
    sending = Promise.resolve();
  }
  var message = task.generateMessage(task.payload, {
    taskId: taskId,
  });
  debug('sendTask', 'taskId', taskId, 'to', routingKey);
  // debug('sendTask', 'message', message);
  return sending
    .then(function() {
      return self.producer.publish(message, {
        routingKey: routingKey,
      });
    });
};

App.prototype.returnMessageHandler = function(message) {
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

module.exports = App;
