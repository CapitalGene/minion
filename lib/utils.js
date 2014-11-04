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

module.exports = {
  Promise: Promise
};
