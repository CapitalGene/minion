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
 * @exports minion.errors.MinionError
 * @extends {Error}
 * @constructor
 *
 * @param {String} message
 */
function MinionError(message) {
  Error.call(this);
  this.message = message;
}

inherits(MinionError, Error);
MinionError.prototype.name = 'MinionError';

module.exports = MinionError;
