'use strict';
/**
 * Test App
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

describe('App', function () {
  this.timeout(5 * 1000);
  describe.skip('#connect()', function () {
    this.timeout(5000);
    beforeEach(function () {
      this.app = new App({
        backend: this.testOptions.uri,
        exchangeName: 'myTask'
      });
      this.addTask = this.app.task({
        name: 'myApp.add',
        handler: function (object) {
          // {number1, number2}
          return object.number1 + object.number2;
        }
      });
      this.addTaskAsync = this.app.task({
        name: 'myApp.addAsync',
        handler: function (object) {
          return new Promise(function (resolve, reject) {
            return resolve(object.number1 + object.number2);
          });
        }
      });
      // sinon.spy(this.app, 'declareDefaultExchange');
    });
    afterEach(function (done) {
      // this.app.declareDefaultExchange.restore();
      done();
    });
    it('connect and set `.connection`', function (done) {
      var self = this;
      expect(this.app.connection).to.not.exist;
      this.app.connect()
        .then(function () {
          expect(self.app.connection).to.exist;
        })
        .should.notify(done);
    });
    it('set `.channelPool`', function (done) {
      var self = this;
      expect(this.app.channelPool).to.not.exist;
      this.app.connect()
        .then(function () {
          expect(self.app.channelPool).to.exist;
        })
        .should.notify(done);
    });
    it('declare default exchange', function (done) {
      var self = this;
      expect(this.app.exchangeName).to.not.exist;
      this.app.connect()
        .then(function () {
          expect(self.app.exchangeName).to.exist;
          expect(self.app.exchangeType).to.exist;
          expect(self.app.exchangeOptions).to.exist;
          self.app.declareDefaultExchange
            .should.have.been.calledOnce;
        })
        .should.notify(done);
    });
    it('declare queue for tasks #checkQueue(myApp.add)', function (done) {
      var self = this;
      this.app.connect()
        .then(function () {
          return self.app.checkQueue('myApp.add');
        })
        .then(function (queue) {
          debug('checkQueue', queue);
          queue.should.have.property('queue', 'myApp.add');
          queue.should.have.property('messageCount')
            .that.is.a('number');
          queue.should.have.property('consumerCount')
            .that.is.a('number');
        })
        .should.notify(done);
    });
    it('declare result queue', function (done) {
      var self = this;
      expect(this.app.resultQueue).to.not.exist;
      this.app.connect()
        .then(function () {
          expect(self.app.resultQueue).to.exist;
          return self.app.checkQueue(self.app.resultQueue);
        })
        .then(function (queue) {
          debug('checkQueue', queue);
          queue.should.have.property('queue', self.app.resultQueue);
          queue.should.have.property('messageCount')
            .that.is.a('number');
          queue.should.have.property('consumerCount')
            .that.is.a('number');
        })
        .should.notify(done);
    });
  });
  describe('#task(object, options)', function () {
    before(function () {
      this.app = new App({
        backend: this.testOptions.uri,
        exchangeName: 'myTask'
      });
      this.addTask = this.app.task({
        name: 'myApp.add',
        handler: function (object) {
          // {number1, number2}
          return object.number1 + object.number2;
        }
      });
      this.addTaskAsync = this.app.task({
        name: 'myApp.addAsync',
        handler: function (object) {
          return new Promise(function (resolve, reject) {
            return resolve(object.number1 + object.number2);
          });
        }
      });
    });
    it('returns a `Task` subclass', function () {
      // this.addTask.constructor.should.equal(Task);
      // this.addTaskAsync.constructor.should.equal(Task);
      (new this.addTask()).should.be.an.instanceOf(this.addTask);
    });
    it('#taskName should equal taskName', function () {
      this.addTask.taskName.should.equal('myApp.add');
    });
    describe('returned task', function () {
      it('can be called `.exec` and return a promise', function (done) {
        var add12 = this.addTask.exec({
          number1: 1,
          number2: 2
        });
        var add23 = this.addTask.exec({
          number1: 2,
          number2: 3
        });
        Promise.all([add12, add23])
          .should.eventually.deep.equal([3, 5])
          .should.notify(done);
      });
      it('with `promise` can be called and return a promise', function (done) {
        var add12 = this.addTaskAsync.exec({
          number1: 1,
          number2: 2
        });
        var add23 = this.addTaskAsync.exec({
          number1: 2,
          number2: 3
        });
        Promise.all([add12, add23])
          .should.eventually.deep.equal([3, 5])
          .should.notify(done);
      });
    });
  });
  describe.skip('#do(taskName, taskObject)', function () {
    before(function () {
      this.app = new App({
        backend: this.testOptions.uri,
        exchangeName: 'myTask'
      });
      this.addTask = this.app.task({
        name: 'myApp.add',
        handler: function (object) {
          // {number1, number2}
          return object.number1 + object.number2;
        }
      });
      this.addTaskAsync = this.app.task({
        name: 'myApp.addAsync',
        handler: function (object) {
          return new Promise(function (resolve, reject) {
            return resolve(object.number1 + object.number2);
          });
        }
      });
      return this.app.connect();
    });
    it('rejects if task not registered', function (done) {
      this.app.do('my.someothertask', {})
        .should.be.rejected
        .should.notify(done);
    });
    it('task can be called and return a promise', function (done) {
      var add12 = this.app.do('myApp.add', {
        number1: 1,
        number2: 2
      });
      var add23 = this.app.do('myApp.add', {
        number1: 2,
        number2: 3
      });
      Promise.all([add12, add23])
        .should.eventually.deep.equal([3, 5])
        .should.notify(done);
    });
    it('promise task can be called and return a promise', function (done) {
      var add12 = this.app.do('myApp.addAsync', {
        number1: 1,
        number2: 2
      });
      var add23 = this.app.do('myApp.addAsync', {
        number1: 2,
        number2: 3
      });
      Promise.all([add12, add23])
        .should.eventually.deep.equal([3, 5])
        .should.notify(done);
    });
    it('has `.taskId`', function () {
      var job = this.app.do('myApp.addAsync', {
        number1: 1,
        number2: 2
      });
      job.should.have.property('taskId')
        .that.is.a('string');
      job.getTaskId().should.be.a('string');
    });
  });
  describe('#_getTaskQueues(options)', function () {
    before(function () {
      this.app = new App({
        backend: this.testOptions.uri,
        exchangeName: 'myTask'
      });
      this.addTask = this.app.task({
        name: 'myApp.add',
        handler: function (object) {
          // {number1, number2}
          return object.number1 + object.number2;
        }
      });
      this.addTaskAsync = this.app.task({
        name: 'myApp.addAsync',
        handler: function (object) {
          return new Promise(function (resolve, reject) {
            return resolve(object.number1 + object.number2);
          });
        }
      });
    });
    it('returns queues of tasks', function () {
      this.app._getTaskQueues()
        .should.have.lengthOf(2);
    });
    it('support config.queues=[queueName]', function () {
      this.app._getTaskQueues({
          queues: ['myApp.addAsync']
        })
        .should.have.lengthOf(1);
    });
  });
});
