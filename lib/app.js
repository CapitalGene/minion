/**
 * the App
 *
 * @author Chen Liang [code@chen.technology]
 */
'use strict';
var Promise = require('bluebird');
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
 */
var App = function (options) {
  debug('new App');
  this.options = options || {};

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

  this.exchange = new broker.Exchange({
    name: this.options.exchangeName || 'minion-exchange',
    type: 'topic',
    deliveryMode: true,
    durable: true,
    autoDelete: false,
    channel: this.channel()
  });

  var resultQueueName = uuid.v4();

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

  this.taskConsumer = new broker.Consumer({
    noAck: false,
    channel: this.channel(),
    messageHandler: this.execTask.bind(this)
  });
};

/**
 * Return `queues` of `tasks` as an Array
 *
 * @return {Array} [description]
 */
App.prototype._getTaskQueues = function () {
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
      // result queue
      return self.resultConsumer.declare()
        .then(function () {
          self.resultConsumer.consume();
        });
    })
    .then(function () {
      return self.taskConsumer.declare();
    })
    .then(function () {
      var addingQueues = _.reduce(self._getTaskQueues(), function (result, queue) {
        result.push(self.taskConsumer.addQueue(queue));
        return result;
      }, []);
      return Promise.all(addingQueues);
    })
    .then(function () {
      return self.taskConsumer.consume();
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
    this.waitingForResult[correlationId].rejecter(err);
  } else {
    this.waitingForResult[correlationId].resolver(resultObject);
  }
  delete this.waitingForResult[correlationId];
};


var stringifyError = function (err) {
  var plainObject = {};
  Object.getOwnPropertyNames(err).forEach(function (key) {
    plainObject[key] = err[key];
  });
  return plainObject;
};

App.prototype.execTask = function (message) {
  // debug('execTask');
  var self = this;
  if (!message.properties ||
    !message.properties.headers ||
    !message.properties.headers.taskName) {
    return;
  }
  var taskName = message.properties.headers.taskName;
  if (!this.tasks[taskName]) {
    debug('execTask', 'invalid task', taskName);
  }
  var taskStatus;
  var resultObject;
  message.getPayload()
    .then(function (taskObject) {
      return self.tasks[taskName].exec(taskObject);
    })
    .then(function (result) {
      resultObject = result;
      // debug('execTask', 'result', result);
    })
    .catch(function (err) {
      // debug('execTask', 'catch err', err);
      taskStatus = 'rejected';
      resultObject = stringifyError(err);
    })
    .finally(function () {
      // debug('execTask', 'finally');
      var resultMessage = new broker.Message({
        body: resultObject,
        headers: {
          taskName: taskName,
          taskStatus: taskStatus,
          // publishedAt: message.headers.publishedAt,
          finishedAt: Date.now()
        },
        correlationId: message.correlationId,
        replyTo: message.replyTo,
      });

      return self.exchange
        .publish(resultMessage, {
          routingKey: message.replyTo
        })
        .then(function () {
          // debug('execTask', 'published result to ', message.replyTo);
          return message.ack();
        })
        .then(function () {
          // debug('execTask', 'acked');
          return;
        });
    });
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
 * var resultPromise = taskAdd({number1: 1, number2: 2});
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
  return task;
};


/**
 * Execute a task by name
 *
 * @param  {String} taskName   [description]
 * @param  {Object} taskObject task payload
 *
 * @return {Promise}            [description]
 */
App.prototype.do = function (taskName, taskObject) {
  if (!this.tasks[taskName]) {
    return Promise.reject(new Error('unable to find task ' + taskName));
  }
  return this.tasks[taskName].delay(taskObject);
};

module.exports = App;
