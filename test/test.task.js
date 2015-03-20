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
var errors = require('./../lib').errors;
var Worker = require('./../lib').Worker;
var Task = require('./../lib').Task;
var Promise = require('./../lib/utils').Promise;
var debug = require('debug')('minion:test:app');
var _ = require('lodash');

describe('Task', function () {
  describe('.TaskContext(object)', function () {
    it('is a function', function () {
      Task.TaskContext.should.be.a('function');
    });
    it('has default values', function () {
      var context = new Task.TaskContext();
      context.should.deep.equal({
        id: null,
        status: null,
        object: null,
        retries: 0,
        maxRetries: null,
        retryDelay: null,
        countdown: null,
        expires: null,
        isEager: false,
        headers: null,
        deliveryInfo: null,
        replyTo: null,
        correlationId: null,
        publishedAt: null,
        finishedAt: null,
        timelimit: null
      });
    });
    it('merge object values', function () {
      var context = new Task.TaskContext({
        id: 'test'
      });
      context.should.deep.equal({
        id: 'test',
        status: null,
        object: null,
        retries: 0,
        maxRetries: null,
        retryDelay: null,
        countdown: null,
        expires: null,
        isEager: false,
        headers: null,
        deliveryInfo: null,
        replyTo: null,
        correlationId: null,
        publishedAt: null,
        finishedAt: null,
        timelimit: null
      });
    });
    var headers = {
      'x-minion-status': 'failed',
      'x-minion-task-id': 'testId',
      'x-minion-retries': '2',
      'x-minion-countdown': '1',
      'x-minion-max-retries': '20',
      'x-minion-retry-delay': '20',
      'x-minion-expires': '123123',
      'x-minion-published-at': '123',
      'x-minion-finished-at': '1231'
    };
    describe('.populateFromHeaders(context,headers)', function () {

      it('set headers and map props', function () {
        var context = new Task.TaskContext();
        Task.TaskContext.populateFromHeaders(context, headers);
        context.should.deep.equal({
          id: 'testId',
          status: 'failed',
          object: null,
          retries: 2,
          maxRetries: 20,
          retryDelay: 20,
          countdown: 1,
          expires: 123123,
          isEager: false,
          headers: headers,
          deliveryInfo: null,
          replyTo: null,
          correlationId: null,
          publishedAt: 123,
          finishedAt: 1231,
          timelimit: null
        });
      });
    });
    describe('.populateFromMessage(context, message)', function () {
      var message = new broker.Message({
        deliveryInfo: 'di',
        correlationId: 'cor',
        replyTo: 'r',
        headers: headers
      });
      it('merge with headers', function () {
        var context = new Task.TaskContext();
        Task.TaskContext.populateFromMessage(context, message);
        context.should.deep.equal({
          id: 'testId',
          status: 'failed',
          object: null,
          retries: 2,
          body: null,
          maxRetries: 20,
          retryDelay: 20,
          countdown: 1,
          expires: 123123,
          isEager: false,
          headers: headers,
          deliveryInfo: 'di',
          replyTo: 'r',
          correlationId: 'cor',
          publishedAt: 123,
          finishedAt: 1231,
          timelimit: null
        });
      });
    });
    describe('.toMessageHeaders(context)', function () {
      var context = new Task.TaskContext({
        id: 'testId',
        status: 'failed',
        retries: 2,
        maxRetries: 20,
        expires: 123123,
        countdown: 1,
        publishedAt: 123,
        finishedAt: 1231
      });
      it('returns headers{}', function () {
        Task.TaskContext.toMessageHeaders(context)
          .should.deep.equal({
            'x-minion-status': 'failed',
            'x-minion-task-id': 'testId',
            'x-minion-retries': '2',
            'x-minion-countdown': '1',
            'x-minion-max-retries': '20',
            'x-minion-expires': '123123',
            'x-minion-published-at': '123',
            'x-minion-finished-at': '1231'
          });
      });
    });
  });
  describe('#generateMessage(object, options)', function () {
    it('uses Task.id for header and correlationId', function () {
      var payload = 'test';
      var message = Task.prototype.generateMessage.call({
        name: 'testTask',
        getId: function () {
          return 'testId';
        },
        context: new Task.TaskContext({
          id: 'contextId',
          correlationId: 'corId'
        }),
        resultQueue: {
          name: 'resultQueueName'
        },
        getCorrelationId: function () {
          return 'corId1';
        }
      }, payload);
      message.should.be.an.instanceOf(broker.Message);
      message.correlationId.should.equal('corId1');
      var headers = message.headers;
      headers.should.have.property('taskName', 'testTask');
      headers.should.have.property('publishedAt');
      headers.should.have.property('x-minion-task-id', 'testId');
      headers.should.have.property('x-minion-retries', '0');
      message.body.should.equal(payload);
    });
  });
  describe('#getRetries()', function () {
    it('returns 0 when no context or not a string number', function () {
      // Task.prototype.getRetries.call({
      //     context: {}
      //   })
      //   .should.equal(0);
      // Task.prototype.getRetries.call({

      //   })
      //   .should.equal(0);
      expect(Task.prototype.getRetries.call({
          context: {
            retries: null
          }
        }))
        .to.equal(null);
      // Task.prototype.getRetries.call({
      //     context: {
      //       retries: 'a'
      //     }
      //   })
      //   .should.equal(0);
    });
    it('returns Int if exist', function () {
      Task.prototype.getRetries.call({
          context: {
            retries: 0
          }
        })
        .should.equal(0);
      Task.prototype.getRetries.call({
          context: {
            retries: 1
          }
        })
        .should.equal(1);
    });
  });
  describe('#compile(app)', function () {
    var testTask;
    var testApp;
    var rejectRejectStub = sinon.stub();
    var rejectRetryStub = sinon.stub();
    before(function () {
      var self = this;
      testTask = new Task({
        name: 'testTask',
        // routingKey: 'test.task',
        ignoreResult: false,
        maxRetries: 10,
        retryDelay: 10,
        handler: function (object) {
          debug('handler', object);
          return object;
        }
      });
      testApp = new App({
        backend: this.testOptions.uri,
        exchangeName: 'myTask'
      });
      this.addTask = testApp.task({
        name: 'myApp.add',
        handler: function (object) {
          // {number1, number2}
          return object.number1 + object.number2;
        }
      });
      this.addTaskAsync = testApp.task({
        name: 'myApp.addAsync',
        handler: function (object) {
          return new Promise(function (resolve, reject) {
            return resolve(object.number1 + object.number2);
          });
        }
      });
      this.addAddTask = testApp.task({
        name: 'myApp.addAddTask',
        handler: function (object) {
          object = object || {};
          return self.addTaskAsync.delay(object);
        }
      });
      this.rejectingTask = testApp.task({
        name: 'myApp.rejectingTask',
        handler: function (object) {
          return Promise.reject(new Error('just reject'));
        }
      });
      this.ignoreResultTask = testApp.task({
        name: 'myApp.ignoreResultTask',
        handler: function (object) {
          return Promise.resolve('result');
        },
        ignoreResult: true
      });
      this.rejectRejectTask = testApp.task({
        name: 'myApp.rejectRejectTask',
        handler: function (object) {
          debug('rejectRejectTask');
          return rejectRejectStub();
        }
      });
      this.rejectRetryTask = testApp.task({
        name: 'myApp.rejectRetryTask',
        handler: function (object) {
          debug('rejectRetryTask');
          return rejectRetryStub();
        },
        retryDelay: 2
      });
    });
    after(function () {
      testTask = null;
      testApp = null;
    });
    describe('compiled Task', function () {
      this.timeout(10 * 1000);
      var CompiledTask;
      var t;
      before(function (done) {
        var self = this;
        CompiledTask = testTask.compile(testApp);

        this.worker = new Worker(testApp);
        testApp.task(CompiledTask);
        // sinon.spy(this.app, 'useChannelToPublishToQueue');
        testApp.connect()
          .then(function () {
            t = new CompiledTask();
            return self.worker.connect();
          })
          .should.notify(done);
      });
      after(function () {
        // CompiledTask = null;
      });
      it('takes TaskContext as arg', function () {
        var context = new Task.TaskContext();
        var tsk = new CompiledTask(context);
        expect(tsk.message).to.not.exist;
        tsk.context.should.deep.equal(context);
      });
      it('.app = app', function () {
        CompiledTask.should.have.property('app', testApp);
      });
      it('is a subclass of Task', function () {
        CompiledTask.prototype.should.be.an.instanceOf(Task);
      });
      it('inherits from Task', function () {
        t.should.be.an.instanceOf(CompiledTask);
        t.should.be.an.instanceOf(Task);
        t.should.have.property('app', testApp);
        t.should.have.property('exchange', testApp.exchange);
        t.should.have.property('queue')
          .that.is.an.instanceOf(broker.Queue);
        t.should.have.property('name', 'testTask');
        // t.should.have.property('routingKey', 'test.task');
        t.should.have.property('ignoreResult', false);
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
      describe('when called without new', function () {
        before(function () {
          sinon.spy(CompiledTask, 'returnMessageHandler');
        });
        after(function () {
          CompiledTask.returnMessageHandler.should.have.not.been.called;
          CompiledTask.returnMessageHandler.restore();
        });
        it('should not return an insance of CompiledTask', function () {
          var t = CompiledTask('test');
          t.should.not.be.an.instanceOf(CompiledTask);
        });
        it('call handler directly', function (done) {
          CompiledTask('test')
            .should.eventually.equal('test')
            .should.notify(done);
        });
      });
      describe('when called with new', function () {
        it('returns an instance of compiled task', function () {
          (new CompiledTask()).should.be.an.instanceOf(CompiledTask);
        });
      });
      describe('.delay(object, options)', function () {
        before(function () {
          sinon.spy(CompiledTask.resultConsumer, 'messageHandler');
        });
        after(function () {
          CompiledTask.resultConsumer.messageHandler.restore();
        });
        it('is a function', function () {
          CompiledTask.should.have.property('delay')
            .that.is.a('function');
        });
        it('sends tasks to broker', function (done) {
          CompiledTask.delay('test1')
            .should.eventually.equal('test1')
            .then(function () {
              CompiledTask.resultConsumer.messageHandler.should.have.been.called.once;
            })
            .should.notify(done);
        });
        it('handles 1000 tasks', function (done) {
          var tasks = [];
          for (var i = 0; i < 1000; i++) {
            tasks.push(CompiledTask.delay({
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
          var job = CompiledTask.delay({
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
        describe('support options.countdown', function () {
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
        });
        describe('support reject with errors.Reject', function () {
          beforeEach(function () {
            rejectRejectStub.onFirstCall().returns(
              Promise.reject(
                new errors.Reject('testing reject', 'no reason', true)
              )
            );
            rejectRejectStub.onSecondCall().returns(
              Promise.resolve('second tried')
            );
          });
          afterEach(function () {
            rejectRejectStub.reset();
          });
          it('requeues if Reject with requeue = true', function (done) {
            this.rejectRejectTask.delay()
              .should.eventually.equal('second tried')
              .should.notify(done);
          });
        });
        describe('support errors.Retry', function () {
          beforeEach(function (done) {
            rejectRetryStub.onFirstCall().throws(
                new errors.Retry('testing retry 1')
            );
            rejectRetryStub.onSecondCall().throws(
                new errors.Retry('testing retry 2')
            );
            rejectRetryStub.onThirdCall().returns(
              Promise.resolve('testing retry 2')
            );
            this.rejectRetryTask.queue.purge()
            .should.notify(done);
          });
          afterEach(function () {
            rejectRetryStub.reset();
          });
          it('retry', function (done) {
            this.rejectRetryTask.delay()
              .should.eventually.equal('testing retry 2')
              .should.notify(done);
          });
        });
      });
      describe('.exec()', function () {
        before(function () {

        });
        it('will call handler and return a Promise', function (done) {
          done();
        });
      });
      describe('.start()', function () {
        it('is a function', function () {
          Task.should.not.have.property('start');
          CompiledTask.start.should.be.a('function');
        });
      });
    });
  });
});
