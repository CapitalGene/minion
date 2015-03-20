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
    channel: this.defaultChannel
  });

  this.producer = new broker.Producer({
    channel: this.channel(),
    exchange: this.exchange,
    autoDeclare: false
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
      return self.producer.declare();
    })
    .then(function () {
      // delcare task queues
      var startingTasks = _.reduce(self.tasks, function (result, task) {
        result.push(task.start());
        return result;
      }, []);
      return Promise.all(startingTasks);
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

App.prototype.registerTask = function (task) {
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
App.prototype.do = function (taskName, taskObject, options) {
  if (!this.tasks[taskName]) {
    return Promise.reject(new Error('unable to find task ' + taskName));
  }
  return this.tasks[taskName].delay(taskObject, options);
};

/**
 *  Send task to amqp
 *
 *  @method  sendTask
 *
 *  @param   {Task}  task     [description]
 *  @param   {[type]}  options  [description]
 *
 *  @return  {[type]}  [description]
 */
App.prototype.sendTask = function (task, options) {
  debug('sendTask');
  var self = this;
  var taskId = task.getId();
  debug('sendTask', 'taskId', taskId);
  var routingKey = task.routingKey;
  if (!taskId) {
    return Promise.reject(new Error('taskId is missing'));
  }
  // see if it's delayed tasks
  // handle delayed task
  var sending;
  if (!!task.countdown || !!task.eta) {
    var ttl = 0;

    if (!task.countdown) {
      if (_.isNumber(task.eta)) {
        ttl = task.eta - Date.now();
      } else if (task.eta instanceof Date) {
        ttl = task.eta.valueOf() - Date.now();
      }
    } else {
      ttl = task.countdown * 1000;
    }

    var delayedQueue = task.generateQueueForDelayedTask({
      taskId: taskId,
      messageTtl: ttl
    });
    routingKey = delayedQueue.routingKey;
    sending = delayedQueue.declare();
  } else {
    sending = Promise.resolve();
  }
  var message = task.generateMessage(task.payload, {
    taskId: taskId
  });
  return sending
    .then(function () {
      return self.producer.publish(message, {
        routingKey: routingKey
      });
    });
};

module.exports = App;
