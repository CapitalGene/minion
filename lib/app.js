'use strict';
/**
 * minion.App
 *
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
 * Minion App
 *
 * @param {Object} options [description]
 * @param {String} options.backend rabbitmq uri: amqp://localhost
 * @param {String} options.exchangeName the default exchange name 'mytask'
 * @param {broker.Connection} options.connection using an existing connection
 *                                               so, one amqp connection can
 *                                               be shared between moduels
 *
 */
var App = function (options) {
  debug('new App');
  this.options = options || {};

  // set up connection
  if (this.options.connection &&
    (this.options.connection instanceof broker.Connection)) {
    this.connection = this.options.connection;
  } else {
    this.connection = new broker.Connection({
      uri: this.options.backend
    });
  }

  this.tasks = {};
  this.waitingForResult = {};

  this.defaultChannel = this.channel();

  this.exchange = new broker.Exchange({
    name: this.options.exchangeName || 'minion-exchange',
    type: 'topic',
    deliveryMode: true,
    durable: true,
    autoDelete: false,
    channel: this.channel()
  });

  var resultQueueName = 'results-' + uuid.v4();

  this.resultQueue = new broker.Queue({
    name: resultQueueName,
    routingKey: resultQueueName,
    exchange: this.exchange,
    exclusive: true,
    autoDelete: true,
    durable: false,
  });

  this.resultConsumer = new broker.Consumer({
    noAck: true,
    channel: this.channel(),
    queues: [this.resultQueue],
    messageHandler: this.handleResult.bind(this)
  });
};

/**
 * Return `queues` of `tasks` as an Array
 *
 * @for minion.Worker
 *
 * @param  {Object} options
 * @param  {Array<String>} options.queues specify what queues to consume from
 * @return {Array} [description]
 */
App.prototype._getTaskQueues = function (options) {
  options = options || {};
  var self = this;
  if (options.queues && _.isArray(options.queues)) {
    return _.reduce(options.queues, function (result, queueName) {
      if (_.has(self.tasks, queueName)) {
        result.push(self.tasks[queueName].queue);
      }
      return result;
    }, []);
  }
  return _.reduce(this.tasks, function (result, task) {
    result.push(task.queue);
    return result;
  }, []);
};

/**
 * Initiate the connection to rabbitmq and set up `exchange` and `queue`
 *
 * * each task opens a channel
 *
 * @return {[type]} [description]
 */
App.prototype.connect = function () {
  debug('#connect');
  var self = this;
  return this.connection.connect()
    .then(function () {
      return self.exchange.declare();
    })
    .then(function () {
      // declare result queue and consumer
      return self.resultConsumer.declare();
    })
    .then(function () {
      // start to consume results
      return self.resultConsumer.consume();
    })
    .then(function () {
      // delcare task queues
      var declaringTaskQueues = _.reduce(self._getTaskQueues(), function (result, queue) {
        result.push(queue.declare());
        return result;
      }, []);
      return Promise.all(declaringTaskQueues);
    });
};

/**
 * Create and return a new channel.
 *
 * @return {broker.Channel} [description]
 */
App.prototype.channel = function () {
  return this.connection.channel();
};

/**
 * Handle Task Result Message
 *
 * @param  {broker.Message} message [description]
 * @return {[type]}         [description]
 */
App.prototype.handleResult = function (message) {
  // debug('handleResult');

  // var self = this;
  if (!message.properties ||
    !message.properties.correlationId) {
    return;
  }
  // var taskName = message.properties.headers.taskName;
  var correlationId = message.properties.correlationId;
  if (!this.waitingForResult[correlationId]) {
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

/**
 * Construct a task
 *
 * @example
 * ```
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
 * ```
 *
 * @param {Object} config see `Task(config)`
 *
 * @returns {Task} created task
 */
App.prototype.task = function (config) {
  config = config || {};
  config.app = this;
  config.exchange = this.exchange;

  var task = new Task(config);
  this.tasks[task.name] = task;
  // task.queue.declare();
  return task;
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
App.prototype.do = function (taskName, taskObject, options) {
  if (!this.tasks[taskName]) {
    return Promise.reject(new Error('unable to find task ' + taskName));
  }
  return this.tasks[taskName].delay(taskObject, options);
};

module.exports = App;
