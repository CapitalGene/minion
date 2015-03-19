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
var uuid = require('node-uuid');
var debug = require('debug')('minion:Task');
var _ = require('lodash');

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
 */
var Task = function (config) {
  config = config || {};

  this.name = config.name;
  this.routingKey = config.routingKey || this.name;
  this.ignoreResult = config.ignoreResult;
  this.app = config.app;
  this.exchange = config.exchange;
  this.handler = config.handler;

  this.queue = new broker.Queue({
    name: this.name,
    exchange: this.exchange,
    channel: this.exchange.channel,
    routingKey: this.routingKey,
    durable: true,
    autoDelete: false
  });
};

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
  options = options || {};
  var taskId = uuid.v4();
  var correlationId = taskId;
  // meta data for the tasks
  var headers = {
    taskName: this.name,
    publishedAt: Date.now()
  };
  return new broker.Message({
    body: object,
    correlationId: correlationId,
    replyTo: this.app.resultQueue.name,
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
  var queueName = 'minion.delayed.' + options.taskId;
  var queueExpires = options.queueExpires || 20 * 1000;
  var messageTtl = options.messageTtl || 0;
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
Task.prototype.delay = function (object, options) {
  // debug('delay', object, options);
  options = options || {};
  var self = this;
  var taskId;

  var taskPromise = new Promise(function (resolve, reject) {
    var message = self.generateMessage(object);
    taskId = message.correlationId;
    var ignoreResult = options.ignoreResult === true || self.ignoreResult === true;

    if (!ignoreResult) {
      self.app.waitingForResult[taskId] = {
        taskName: self.name,
        resolver: null
      };
    }

    var publishingMessage;

    if (!!options.countdown || !!options.eta) {
      var ttl = 0;
      if (!options.countdown) {
        if (_.isNumber(options.eta)) {
          ttl = options.eta - Date.now();
        } else if (options.eta instanceof Date) {
          ttl = options.eta.valueOf() - Date.now();
        }
      } else {
        ttl = options.countdown * 1000;
      }
      var delayedQueue = self.generateQueueForDelayedTask({
        taskId: taskId,
        messageTtl: ttl
      });
      publishingMessage = delayedQueue.declare()
        .then(function () {
          return self.exchange.publish(message, {
            routingKey: delayedQueue.routingKey
          });
        });
    } else {
      publishingMessage = self.exchange
        .publish(message, {
          routingKey: self.routingKey
        });
    }


    // debug('delay', message.getPublishOptions());
    return publishingMessage
      .then(function (publishedResult) {
        if (!ignoreResult) {
          self.app.waitingForResult[taskId].resolver = resolve;
          self.app.waitingForResult[taskId].rejecter = reject;
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
 * Execute the directly by a `worker` and returns the result
 *
 * @param  {[type]} object [description]
 * @return {[type]}        [description]
 */
Task.prototype.exec = Promise.method(function (object) {
  return this.handler(object);
});

module.exports = Task;
