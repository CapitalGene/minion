/**
 * worker related functions
 *
 * Should be a event emitter
 *
 * Each worker should have a generated workerId or specified workerId
 *
 * it will bind each task on the app with specified queue, or the default queue
 * * so, each `task` should have a fixed definition of queue, so when multiple
 *   workers exist, each worker will subscribe to queues for enabled tasks
 *
 * @author Chen Liang [code@chen.technology]
 */

var Worker = function(options) {

};

Worker.prototype.start = function() {

};

Worker.prototype.shutdown = function() {
  // body...
};

module.exports = Worker;
