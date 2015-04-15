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
 * @lends module:minion.errors.MaxRetriesExceededError
 * @constructor
 * @extends {minion.errors.MinionError}
 * @param {String} message
 */
function MaxRetriesExceededError(message) {
  Error.call(this);
  this.message = message;
}

inherits(MaxRetriesExceededError, MinionError);
MaxRetriesExceededError.prototype.name = 'MaxRetriesExceededError';

module.exports = MaxRetriesExceededError;
