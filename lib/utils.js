'use strict';
/**
 * @exports utils
 * @author Chen Liang [code@chen.technology]
 */

/*!
 * Module dependencies.
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

var LocalStack = function () {
  this.stack = [];
};

LocalStack.prototype.push = function () {
  return this.stack.push.apply(this.stack, arguments);
};

LocalStack.prototype.pop = function (k) {
  var stackLength = this.stack.length;
  var l = k ? Math.min(k, stackLength) : 0;
  return l ? this.stack.splice(stackLength - l, stackLength).reverse() : this.stack.pop();
};

LocalStack.prototype.top = function (k) {
  var l = k ? (+k ? Math.abs(k) : 0) : 0;
  var stack = this.stack;
  var hpos = stack.length - l - 1;
  return stack[hpos];
};

LocalStack.prototype.tail = function (k) {
  var stack = this.stack;
  var l = k ? (+k ? Math.abs(k) : 0) : 0;
  return stack[l];
};

LocalStack.prototype.size = function () {
  return this.stack.length;
};

LocalStack.prototype.indexOf = function (el, from) {
  var stack = this.stack;
  var r = stack.indexOf(el);
  var len = stack.length - 1;
  var f = len - (+from || 0);
  return ~r ? (r <= f ? len - r : -1) : -1;
};

LocalStack.prototype.flush = function (evict) {
  var stack = this.stack;
  var slen = stack.length;
  var empty = evict === undefined || evict === true;
  return empty ? (stack.length = 0) || slen : 0;
};

module.exports = {
  Promise: Promise,
  stringifyError: stringifyError,
  LocalStack: LocalStack
};
