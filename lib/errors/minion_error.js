'use strict';
/**
 * minion.errors.MinionError
 *
 * @author Chen Liang [code@chen.technology]
 */

/*!
 * Module dependencies.
 */
var inherits = require('util').inherits;
var _ = require('lodash');

/**
 * Minion Error
 *
 * @extends {Error}
 *
 * @param {String} message [description]
 */
function MinionError(message) {
  Error.call(this);
  this.message = message;
}

inherits(MinionError, Error);
MinionError.prototype.name = 'MinionError';

module.exports = MinionError;
