'use strict';
/**
 * minion.errors.MaxRetriesExceededError
 *
 * @author Chen Liang [code@chen.technology]
 */

/*!
 * Module dependencies.
 */
var MinionError = require('./minion_error');
var inherits = require('util').inherits;

/**
 * The tasks max restart limit has been exceeded.
 *
 * @extends {MinionError}
 *
 * @param {String} message [description]
 */
function MaxRetriesExceededError(message) {
  Error.call(this);
  this.message = message;
}

inherits(MaxRetriesExceededError, MinionError);
MaxRetriesExceededError.prototype.name = 'MaxRetriesExceededError';

module.exports = MaxRetriesExceededError;
