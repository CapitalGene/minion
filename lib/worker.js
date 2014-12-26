'use strict';
/**
 * minion.Worker
 *
 * @author Chen Liang [code@chen.technology]
 */

/*!
 * Module dependencies.
 */
var cluster = require('cluster');
var EventEmitter = require('events').EventEmitter;
var _ = require('lodash');
var broker = require('broker-node');

var utils = require('./utils');
var Promise = utils.Promise;

var numCPUs = require('os').cpus().length;

var debug = require('debug')('minion:Worker');

// Master is a singleton, as is the cluster master
var WorkerController = new EventEmitter();

WorkerController.status = function () {
  var retval = {};

  retval.master = {
    pid: process.pid,
    setSize: this.size,
  };

  retval.workers = [];

  _.forEach(cluster.workers, function (value, key) {
    retval.workers.push({
      id: key,
      pid: value.process.pid,
    });
  });

  debug('master - status:', retval);

  return retval;
};

WorkerController.start = function () {

};

WorkerController.shutdown = function () {
  // body...
};

/**
 * Unmanaged worker instance.
 *
 * @param {minion.App} app     [description]
 * @param {Object} options [description]
 * @param {String} options.hostname [description]
 * @param {Number} options.prefetchCount prefetch count value for the task
 *                                       consumer
 * @param {Array<String>} options.queues A worker instance can consume from
 *                                       any number of queues. By default it
 *                                       will consume from all queues defined
 *                                       in the `app`.
 *                                       You can specify what queues to consume
 *                                       from at startup, by giving an array
 *                                       of queue/task names
 */
var Worker = function (app, options) {
  this.app = app;
  options = options || {};
  this.hostname = options.hostname;
  this.prefetchCount = options.prefetchCount;
  this.startupQueues = options.queues;
  // Consumer for receiving tasks
  this.taskConsumer = new broker.Consumer({
    noAck: false,
    channel: this.app.channel(),
    messageHandler: this.execTask.bind(this)
  });
};

Worker.prototype.connect = function () {
  debug('connect');
  var self = this;
  var step = this.app.connect()
    .then(function () {
      return self.taskConsumer.declare();
    })
    .then(function () {
      debug('connect', 'declared taskConsumer');
      // register queues of tasks to task broker consumer
      // @for minion.Worker
      var q = self.app._getTaskQueues({
        queues: self.startupQueues
      });
      var addingQueues = _.reduce(q, function (result, queue) {
        debug('connect', 'addingQueues', queue.name);
        result.push(self.taskConsumer.addQueue(queue));
        return result;
      }, []);

      debug('connect', 'addingQueues.length', addingQueues.length);
      return Promise.all(addingQueues);
    })
    .then(function () {
      // handle prefetch_count
      if (self.prefetchCount >= 0) {
        return self.taskConsumer.qos({
          prefetchCount: self.prefetchCount,
          applyGlobal: true
        });
      }
      return Promise.resolve();
    })
    .then(function () {
      // task consumer starts to consume
      return self.taskConsumer.consume();
    });

  return step;
};

/**
 * will execute the task.handler when receive a task
 *
 * @param  {[type]} message [description]
 * @return {[type]}         [description]
 */
Worker.prototype.execTask = function (message) {
  debug('execTask');
  var self = this;

  // check message props
  if (!message.properties ||
    !message.properties.headers ||
    !message.properties.headers.taskName) {
    return;
  }

  var taskName = message.properties.headers.taskName;
  debug('execTask', 'taskName', taskName);
  if (!this.app.tasks[taskName]) {
    debug('execTask', 'invalid task', taskName);
    // return Promise.reject(new Error('invalid task ' + taskName));
  }
  var taskStatus;
  var resultObject;

  message.getPayload()
    .then(function (taskObject) {
      // parsed payload object
      // run task handler
      return self.app.tasks[taskName].exec(taskObject);
    })
    .then(function (result) {
      // resolved result
      resultObject = result;
      debug('execTask', 'result', result);
    })
    .catch(function (err) {
      debug('execTask', 'catch err', err);
      taskStatus = 'rejected';
      resultObject = utils.stringifyError(err);
    })
    .finally(function () {
      debug('execTask', 'finally');
      // send result
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

      // send task result via exchange
      return self.app.exchange
        .publish(resultMessage, {
          routingKey: message.replyTo
        })
        .then(function () {
          // acknoledge message
          // debug('execTask', 'published result to ', message.replyTo);
          return message.ack();
        })
        .then(function () {
          // debug('execTask', 'acked');
          return;
        });
    });
};

module.exports = {
  WorkerController: WorkerController,
  Worker: Worker
};
