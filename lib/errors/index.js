'use strict';
/**
 * minion.errors
 *
 * @author Chen Liang [code@chen.technology]
 */

module.exports = {
  MinionError: require('./minion_error'),
  MaxRetriesExceededError: require('./max_retries_exceeded'),
  Retry: require('./retry'),
  Reject: require('./reject'),
  TimeLimitExceededError: require('./time_limit_exceeded'),
  TimeoutError: require('./timeout'),
  RequestTimeoutError: require('./request_timeout_error')
};
