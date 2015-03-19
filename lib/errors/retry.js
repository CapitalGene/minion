'use strict';
/**
 * minion.errors.Retry
 *
 * @author Chen Liang [code@chen.technology]
 */

/*!
 * Module dependencies.
 */
var MinionError = require('./minion_error');
var inherits = require('util').inherits;
var _ = require('lodash');

/**
 * The task is to be retried later.
 *
 * @extends {MinionError}
 *
 * @param {String} message message describing context of retry.
 *                         @optional
 * @param {Error} originalError  Exception (if any) that caused the retry to happen.
 * @param {Date|Number} eta Time of retry (ETA)
 */
function Retry(message, originalError, eta) {
  MinionError.call(this, message);
  this.originalError = originalError;
  if (eta) {
    if (_.isNumber(eta)) {
      eta = new Date(eta);
    }
  }
  this.eta = eta;
}

inherits(Retry, MinionError);
Retry.prototype.name = 'Retry';

module.exports = Retry;
