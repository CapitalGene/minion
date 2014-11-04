'use strict';
/**
 * Test App
 *
 * @author Chen Liang [code@chen.technology]
 */
var App = require('./../lib').App;
var Task = require('./../lib').Task;
var Promise = require('bluebird');
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
    it('returns Task', function () {
      this.addTask.should.an.instanceOf(Task);
      this.addTaskAsync.should.be.an.instanceOf(Task);
    });
    it('#taskName should equal taskName', function () {
      this.addTask.name.should.equal('myApp.add');
    });
    it('task can be called and return a promise', function (done) {
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
    it('promise task can be called and return a promise', function (done) {
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
  describe('#task(object, options).delay(taskObject)', function () {
    this.timeout(5000);
    before(function (done) {
      var self = this;
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
      this.rejectingTask = this.app.task({
        name: 'myApp.rejectingTask',
        handler: function (object) {
          return Promise.reject(new Error('just reject'));
        }
      });
      // sinon.spy(this.app, 'useChannelToPublishToQueue');
      this.app.connect()
        .should.notify(done);
    });
    it('will call `useChannelToPublishToQueue`', function (done) {
      var self = this;
      _.isEmpty(self.app.waitingForResult)
        .should.be.true;
      this.addTask.delay({
        number1: 1,
        number2: 2
      })
        .should.eventually.equal(3)
        .then(function () {
          // self.app.useChannelToPublishToQueue
          //  .should.have.been.called;
          _.isEmpty(self.app.waitingForResult)
            .should.be.true;
        })
        .should.notify(done);
    });
    it('handles 1000 tasks', function (done) {
      var tasks = [];
      for (var i = 0; i < 1000; i++) {
        tasks.push(this.addTask.delay({
          number1: _.random(1, 100),
          number2: _.random(1, 100)
        }));
      }
      Promise.all(tasks)
        .should.eventually.be.an('array')
        .then(function (result) {
          // debug(result);
          result.should.have.lengthOf(1000);
        })
        .should.notify(done);
    });
    it('rejects if failed', function (done) {
      var self = this;
      this.rejectingTask.delay({})
        .should.be.rejectedWith('just reject')
        .should.notify(done);
    });
  });
  describe('#do(taskName, taskObject)', function () {
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
  });
});
