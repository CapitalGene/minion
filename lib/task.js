'use strict';
/**
 * Define Tasks
 *
 * Can be `compiled` with `minion`, so task will inherit the `app`, which
 * includes all the `calling` related info.
 *
 * Since each task essentially is a Promise, they can be chained or groupped
 * naturally using `bluebird`
 */
var Promise = require('bluebird');

/**
 * when call task, return a promise
 * @param {[type]} object [description]
 */
var Task = function (object) {
  // if (!(this instanceof Task)) {
  //   // call the task
  //   return this.handler(object);
  // }
  object = object || {};
  this.name = object.name;
  this.handler = object.handler;
};

Task.prototype.setApp = function(app) {
  this.app = app;
};

/**
 * execute the task
 *
 * create a new message to `task queue` on `rabbitmq` and
 * returns a promise which will be fulfilled when the `task executed`
 * by `worker` and `rabbitmq` send back the result
 *
 * @param  {[type]} object [description]
 * @return {[type]}        [description]
 */
Task.prototype.delay = Promise.method(function (object, options) {
  return this.handler(object);
});

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
