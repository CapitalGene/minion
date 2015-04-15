'use strict';
/**
 * minion.errors.RequestTimeoutError
 *
 * @author Chen Liang [code@chen.technology]
 */

/*!
 * Module dependencies.
 */
var MinionError = require('./minion_error');
var inherits = require('util').inherits;

/**
 * Will be thrown/rejected when the task has been returned soon enough
 *
 * @exports minion.errors.RequestTimeoutError
 * @extends {minion.errors.MinionError}
 * @constructor
 *
 * @param {String} message
 */
function RequestTimeoutError(message) {
  Error.call(this);
  this.message = message;
}

inherits(RequestTimeoutError, MinionError);
RequestTimeoutError.prototype.name = 'RequestTimeoutError';

module.exports = RequestTimeoutError;
