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
    it('returns a `Task` instance', function () {
      this.addTask.should.an.instanceOf(Task);
      this.addTaskAsync.should.be.an.instanceOf(Task);
    });
    it('#taskName should equal taskName', function () {
      this.addTask.name.should.equal('myApp.add');
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
  describe('#task(object, options).delay(taskObject)', function () {
    this.timeout(10 * 1000);
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
      this.addAddTask = this.app.task({
        name: 'myApp.addAddTask',
        handler: function (object) {
          object = object || {};
          return self.addTaskAsync.delay(object);
        }
      });
      this.rejectingTask = this.app.task({
        name: 'myApp.rejectingTask',
        handler: function (object) {
          return Promise.reject(new Error('just reject'));
        }
      });
      this.ignoreResultTask = this.app.task({
        name: 'myApp.ignoreResultTask',
        handler: function (object) {
          return Promise.resolve('result');
        },
        ignoreResult: true
      });
      this.worker = new Worker(this.app);
      // sinon.spy(this.app, 'useChannelToPublishToQueue');
      this.app.connect()
        .then(function () {
          return self.worker.connect();
        })
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
    it('has `.taskId`', function () {
      var job = this.addTask.delay({
        number1: _.random(1, 100),
        number2: _.random(1, 100)
      });
      job.should.have.property('taskId')
        .that.is.a('string');
      job.getTaskId().should.be.a('string');
    });
    it('rejects if failed', function (done) {
      var self = this;
      this.rejectingTask.delay({})
        .should.be.rejectedWith('just reject')
        .should.notify(done);
    });
    it('supports calling task in task', function (done) {
      this.addAddTask.delay({
          number1: 100,
          number2: 200
        })
        .should.eventually.equal(300)
        .should.notify(done);
    });
    it('supports ignore result task', function (done) {
      var task = this.ignoreResultTask.delay({
        number1: 100,
        number2: 200
      });
      var taskId = task.getTaskId();

      task.delay(2 * 1000).should.eventually.equal(taskId)
        .should.notify(done);
    });
    it('supports calling task with ignoreResult=true', function (done) {
      var task = this.addTaskAsync.delay({
        number1: 100,
        number2: 200
      }, {
        ignoreResult: true
      });
      var taskId = task.getTaskId();

      task.delay(2 * 1000).should.eventually.equal(taskId)
        .should.notify(done);
    });
    describe('support options.countdown, eta', function () {
      it('delays countdown(ms)', function (done) {
        var startTime = Date.now();
        var task = this.addTaskAsync.delay({
          number1: 100,
          number2: 200
        }, {
          countdown: 4
        });

        task
          .then(function (result) {
            var endTime = Date.now();
            result.should.equal(300);
            (endTime - startTime).should.above(4 * 1000);
          })
          .should.notify(done);
      });
      it('delays until eta(timestamp)', function (done) {
        var startTime = Date.now();
        var task = this.addTaskAsync.delay({
          number1: 100,
          number2: 200
        }, {
          eta: Date.now() + 4 * 1000
        });

        task
          .then(function (result) {
            var endTime = Date.now();
            result.should.equal(300);
            (endTime - startTime).should.above(4 * 1000);
          })
          .should.notify(done);
      });
      it('delays until eta(Date)', function (done) {
        var startTime = Date.now();
        var task = this.addTaskAsync.delay({
          number1: 100,
          number2: 200
        }, {
          eta: new Date(Date.now() + 4 * 1000)
        });

        task
          .then(function (result) {
            var endTime = Date.now();
            result.should.equal(300);
            (endTime - startTime).should.above(4 * 1000);
          })
          .should.notify(done);
      });
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
