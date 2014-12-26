'use strict';
/**
 * Test minion.Worker
 *
 * @author Chen Liang [code@chen.technology]
 */

/*!
 * Module dependencies.
 */
var App = require('./../lib').App;
var Worker = require('./../lib').Worker;
var Task = require('./../lib').Task;
var Promise = require('./../lib/utils').Promise;
var debug = require('debug')('minion:test:app');
var _ = require('lodash');

describe('Worker(app, options)', function () {
  this.timeout(5 * 1000);

  describe('options.prefetchCount', function () {
    var taskResolvers;
    var taskPayloads;
    before(function (done) {
      var self = this;
      taskResolvers = [];
      taskPayloads = [];
      this.app = new App({
        backend: this.testOptions.uri,
        exchangeName: 'myTask'
      });
      this.demoTask = this.app.task({
        name: 'myApp.demo',
        handler: function (object) {
          taskPayloads.push(object);
          return new Promise(function (resolve) {
            taskResolvers.push(resolve);
          });
        }
      });
      this.worker = new Worker(this.app, {
        prefetchCount: 1
      });
      this.worker.connect()
        .delay(2 * 1000)
        .should.notify(done);
    });
    after(function (done) {
      this.worker.taskConsumer.queues[0].delete()
        .should.notify(done);
    });
    beforeEach(function (done) {
      this.worker.taskConsumer.purge()
        .delay(500)
        .should.notify(done);
    });
    it('sets `.prefetchCount`', function () {
      this.worker.prefetchCount.should.equal(1);
    });
    it('receives one task at a time', function (done) {
      var self = this;
      var publishingPromise = Promise.resolve();
      var publishAndSetPromise = function (i) {
        return function () {
          publishingPromise = self.demoTask.delay('m' + i, {
            ignoreResult: true
          });
        };
      };
      for (var i = 0; i < 10; i++) {
        publishingPromise
          .then(publishAndSetPromise(i));
      }
      publishingPromise
        .delay(500)
        .then(function () {
          taskPayloads.should.have.lengthOf(1);
          return taskPayloads[0];
        })
        .then(function (payload) {
          payload.should.equal('m0');
          return taskResolvers[0]();
        })
        .delay(200)
        .then(function () {
          taskPayloads.should.have.lengthOf(2);
          taskPayloads[1].should.equal('m1');
          return taskResolvers[1]();
        })
        .delay(200)
        .should.notify(done);
    });
  });
  describe('options.queues', function () {
    this.timeout(5 * 1000);
    var taskResolvers;
    var taskPayloads;
    var taskResolvers2;
    var taskPayloads2;
    before(function (done) {
      var self = this;
      taskResolvers = [];
      taskPayloads = [];
      taskResolvers2 = [];
      taskPayloads2 = [];
      this.app = new App({
        backend: this.testOptions.uri,
        exchangeName: 'myTask'
      });
      this.demoTask = this.app.task({
        name: 'myApp.demo',
        handler: function (object) {
          taskPayloads.push(object);
          return new Promise(function (resolve) {
            taskResolvers.push(resolve);
          });
        }
      });
      this.demoTask2 = this.app.task({
        name: 'myApp.demo2',
        handler: function (object) {
          debug('myApp.demo2', 'push to taskPayloads2', object);
          taskPayloads2.push(object);
          return new Promise(function (resolve) {
            taskResolvers2.push(resolve);
          });
        }
      });
      this.worker = new Worker(this.app, {
        prefetchCount: 1,
        queues: ['myApp.demo2']
      });
      this.worker.connect()
        .delay(2 * 1000)
        .should.notify(done);
    });
    after(function (done) {
      Promise.all([
          this.demoTask.queue.delete(),
          this.demoTask2.queue.delete()
        ])
        .should.notify(done);
    });
    it('subscribes only selected tasks', function (done) {
      var tasks = [];
      tasks.push(this.demoTask.delay('m0', {
        ignoreResult: true
      }));
      tasks.push(this.demoTask2.delay('m2', {
        ignoreResult: true
      }));
      Promise.all(tasks)
        .delay(1 * 1000)
        .then(function () {
          taskPayloads.should.have.lengthOf(0);
          taskResolvers.should.have.lengthOf(0);
          taskResolvers2.should.have.lengthOf(1);
          taskPayloads2.should.have.lengthOf(1);
        })
        .should.notify(done);
    });
  });
});
