'use strict';
/**
 * Minion Module
 *
 * @example
 * require('minion');
 *
 * @author Chen Liang [code@chen.technology]
 */

module.exports = {
  errors: require('./errors'),
  App: require('./app'),
  Task: require('./task'),
  Worker: require('./worker').Worker,
};
