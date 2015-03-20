'use strict';
/**
 * minion.errors.Reject
 *
 * @author Chen Liang [code@chen.technology]
 */

/*!
 * Module dependencies.
 */
var MinionError = require('./minion_error');
var inherits = require('util').inherits;

/**
 * A task can raise this if it wants to reject/requeue the message
 *
 * @extends {MinionError}
 *
 * @param {String} message [description]
 * @param {String} reason  [description]
 * @param {Boolean} requeue @default false
 */
function Reject(message, reason, requeue) {
  Error.call(this);
  this.message = message;
  this.reason = reason;
  this.requeue = !!requeue;
}

inherits(Reject, MinionError);
Reject.prototype.name = 'Reject';

module.exports = Reject;
