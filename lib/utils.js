'use strict';
/**
 * utils
 *
 * @author Chen Liang [code@chen.technology]
 */

var Promise = require('bluebird/js/main/promise')();

Promise.prototype.getTaskId = function () {
  return this.taskId;
};

Promise.prototype.setTaskId = function (taskId) {
  this.taskId = taskId;
};

var stringifyError = function (err) {
  var plainObject = {};
  Object.getOwnPropertyNames(err).forEach(function (key) {
    plainObject[key] = err[key];
  });
  return plainObject;
};

module.exports = {
  Promise: Promise,
  stringifyError: stringifyError
};
