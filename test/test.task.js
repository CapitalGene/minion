'use strict';
/**
 * Test Task
 *
 * @author Chen Liang [code@chen.technology]
 */

/*!
 * Module dependencies.
 */
var broker = require('broker-node');
var App = require('./../lib').App;
var Worker = require('./../lib').Worker;
var Task = require('./../lib').Task;
var Promise = require('./../lib/utils').Promise;
var debug = require('debug')('minion:test:app');
var _ = require('lodash');

describe('Task', function () {
  describe('#compile(app)', function () {
    var testTask;
    var testApp;
    before(function () {
      testTask = new Task({
        name: 'testTask',
        routingKey: 'test.task',
        ignoreResult: true,
        maxRetries: 10,
        retryDelay: 10
      });
      testApp = new App({
        backend: this.testOptions.uri,
        exchangeName: 'myTask'
      });
    });
    after(function () {
      testTask = null;
      testApp = null;
    });
    describe('compiled Task', function () {
      var CompiledTask;
      var t;
      before(function () {
        CompiledTask = testTask.compile(testApp);
        t = new CompiledTask();
      });
      after(function () {
        CompiledTask = null;
      });
      it('.app = app', function () {
        CompiledTask.should.have.property('app', testApp);
      });
      it('inherits from Task', function () {
        t.should.be.an.instanceOf(CompiledTask);
        t.should.be.an.instanceOf(Task);
        t.should.have.property('app', testApp);
        t.should.have.property('exchange', testApp.exchange);
        t.should.have.property('queue')
          .that.is.an.instanceOf(broker.Queue);
        t.should.have.property('name', 'testTask');
        t.should.have.property('routingKey', 'test.task');
        t.should.have.property('ignoreResult', true);
        t.should.have.property('maxRetries', 10);
        t.should.have.property('retryDelay', 10);


        t.should.have.property('generateMessage')
          .that.is.a('function');
        t.should.have.property('generateQueueForDelayedTask')
          .that.is.a('function');
        t.should.have.property('applyAsync')
          .that.is.a('function');
        t.should.have.property('retry')
          .that.is.a('function');
      });
      describe('#delay(object, options)', function () {
        it('is a function', function () {
          CompiledTask.should.have.property('delay')
            .that.is.a('function');
        });
      });

    });
  });
});
