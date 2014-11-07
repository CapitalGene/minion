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
var Promise = require('./utils').Promise;
var broker = require('broker-node');
var uuid = require('node-uuid');
var debug = require('debug')('minion:Task');

/**
 * when call task, return a promise
 *
 * @param {Object} config [description]
 * @param {App} config.app the app for the task
 * @param {String} config.name the task name
 * @param {String} config.routingKey optional routingKey for task
 * @param {Function} config.handler actual task function
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
 * @return {broker.Message}         [description]
 */
Task.prototype.generateMessage = function (object, options) {
  options = options || {};
  var taskId = uuid.v4();
  var correlationId = taskId;
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
 * execute the task
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
 * @return {Promise}             will be resolved when the task is executed
 *                               and succeed.
 *                               will be rejected when the task is executed
 *                               and failed.
 */
Task.prototype.delay = function (object, options) {
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

    // debug('delay', message.getPublishOptions());
    return self.exchange.publish(message, {
        routingKey: self.routingKey
      })
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
