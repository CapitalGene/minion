'use strict';
/**
 * minion.Worker
 *
 * @author Chen Liang [code@chen.technology]
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
 */
var Worker = function (app, options) {
  this.app = app;
  options = options || {};

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
  return this.app.connect()
    .then(function () {
      return self.taskConsumer.declare();
    })
    .then(function () {
      // register queues of tasks to task broker consumer
      // @for minion.Worker
      var addingQueues = _.reduce(self.app._getTaskQueues(), function (result, queue) {
        result.push(self.taskConsumer.addQueue(queue));
        return result;
      }, []);
      return Promise.all(addingQueues);
    })
    .then(function () {
      // task consumer starts to consume
      return self.taskConsumer.consume();
    });
};

/**
 * will execute the task.handler when receive a task
 *
 * @param  {[type]} message [description]
 * @return {[type]}         [description]
 */
Worker.prototype.execTask = function (message) {
  // debug('execTask');
  var self = this;

  // check message props
  if (!message.properties ||
    !message.properties.headers ||
    !message.properties.headers.taskName) {
    return;
  }

  var taskName = message.properties.headers.taskName;
  if (!this.app.tasks[taskName]) {
    debug('execTask', 'invalid task', taskName);
    // return Promise.reject(new Error('invalid task ' + taskName));
  }
  var taskStatus;
  var resultObject;

  message.getPayload()
    .then(function (taskObject) {
      return self.app.tasks[taskName].exec(taskObject);
    })
    .then(function (result) {
      resultObject = result;
      // debug('execTask', 'result', result);
    })
    .catch(function (err) {
      // debug('execTask', 'catch err', err);
      taskStatus = 'rejected';
      resultObject = utils.stringifyError(err);
    })
    .finally(function () {
      // debug('execTask', 'finally');
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
