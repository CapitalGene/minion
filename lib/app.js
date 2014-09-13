/**
 * the App
 *
 * * TODO: Create Task Dynamically?
 *
 * * RabbitMQ
 * * * `App` will handle rabbitmq connection, exchange and queue declarition
 * * * Currently, only one default `exchange` which will be `topic`
 * * * There will be one default `queue`
 * * * Each Task can be bounded to a different `queue` which can list to
 *     something like 'http.image.*', the **bound** part will be handled
 *     by `Worker`
 *
 */
'use strict';
var Promise = require('bluebird');
var _ = require('lodash');
var uuid = require('node-uuid');
var amqp = require('amqplib');
var poolModule = require('generic-pool');

var debug = require('debug')('minion:App');
var Task = require('./task');

/**
 * Minion App
 *
 * @param {[type]} options [description]
 * @param {String} options.backend rabbitmq uri: amqp://localhost
 * @param {String} options.exchangeName the default exchange name 'mytask'
 */
var App = function (options) {
  this.options = options || {};
  debug('new App');
  this.tasks = {};
  this.waitingForResult = {};
};



App.prototype.setupChannelPool = function (connection) {
  debug('setupChannelPool');
  // var poolDebug = require('debug')('minion:app:channelPool');
  this.channelPool = poolModule.Pool({
    name: 'minion-pool',
    create: function (callback) {
      // debug('setupChannelPool.create');
      connection.createChannel()
        .then(function (ch) {
          callback(null, ch);
        })
        .catch(callback);
      // parameter order: err, resource
      // new in 1.0.6
    },
    destroy: function (channel) {
      // debug('setupChannelPool.destroy');
      channel.close();
    },
    max: 10,
    // optional. if you set this, make sure to drain() (see step 3)
    min: 5,
    // specifies how long a resource can stay idle in pool before being removed
    idleTimeoutMillis: 30000,
    // if true, logs via console.log - can also be a function
    log: false
  });
};

App.prototype.getChannel = function () {
  // debug('getChannel');
  var self = this;
  return new Promise(function (resolve, reject) {
    self.channelPool.acquire(function (err, channel) {
      if (err) {
        return reject(err);
      }
      // debug('getChannel', 'acquire');
      return resolve(channel);
    });
  });
};

App.prototype.releaseChannel = function (channel) {
  // debug('releaseChannel');
  this.channelPool.release(channel);
};

App.prototype.useChannel = function (funPromise) {
  // debug('useChannel');
  var self = this;
  var disposible = this.getChannel().disposer(function (channel) {
    self.releaseChannel(channel);
  });
  return Promise.using(disposible, funPromise);
};

App.prototype.checkQueue = function (queueName) {
  return this.useChannel(function (channel) {
    return channel.checkQueue(queueName);
  });
};

App.prototype.declareDefaultExchange = function (channel) {
  debug('declareDefaultExchange');
  this.exchangeName = this.options.exchangeName || 'minion';
  this.exchangeType = 'topic';
  this.exchangeOptions = {
    durable: false
  };
  return channel.assertExchange(
    this.exchangeName, this.exchangeType, this.exchangeOptions);
};

/**
 * Declare a result queue to receive results
 *
 * @param  {[type]} channel [description]
 * @return {[type]}         [description]
 */
App.prototype.declareResultQueue = function (channel) {
  var self = this;
  var queueId = uuid.v4();
  var queueOptions = {
    exclusive: true,
    autoDelete: true,
    durable: false
  };
  return channel.assertQueue(queueId, queueOptions)
    .then(function (resultQueue) {
      debug('declareResultQueue', resultQueue);
      self.resultQueue = resultQueue.queue;
      // bind result queue to exchange
      return channel.bindQueue(
        resultQueue.queue, self.exchangeName, resultQueue.queue
      );
    })
    .then(function () {
      return self.bindResult();
    });
};

App.prototype.useChannelToDeclareResultQueue = function () {
  var self = this;
  return self.useChannel(function (channel) {
    return self.declareResultQueue(channel);
  });
};

App.prototype.bindResult = function () {
  var self = this;
  // use a seperate channel not in pool
  return this.connection.createChannel()
    .then(function (channel) {
      self.resultChannel = channel;
      return channel.consume(self.resultQueue, self.handleResult.bind(self), {
        noAck: true
      });
    });
};


App.prototype.handleResult = function (message) {
  // debug('handleResult');
  // var self = this;
  if (!message.properties ||
    !message.properties.correlationId) {
    return;
  }
  // var taskName = message.properties.headers.taskName;
  var correlationId = message.properties.correlationId;
  if (!this.waitingForResult[correlationId]) {
    return;
  }
  var resultObject = JSON.parse(message.content.toString());
  if (message.properties.headers.taskStatus &&
    message.properties.headers.taskStatus === 'rejected') {
    var errObj = resultObject;
    var err = new Error(errObj.message);
    err.name = errObj.name;
    err.stack = errObj.stack;
    this.waitingForResult[correlationId].rejecter(err);
  } else {
    this.waitingForResult[correlationId].resolver(resultObject);
  }
  delete this.waitingForResult[correlationId];
};

App.prototype.declareQueueForTask = function (channel, task) {
  debug('declareQueueForTask', task.name);
  var self = this;
  return channel.assertQueue(task.name, {
      durable: true
    })
    .then(function (taskQueue) {
      debug('declareQueueForTask', 'assertQueue', taskQueue.queue);
      // bind queue to exchange
      task.queue = taskQueue;
      return channel.bindQueue(taskQueue.queue, self.exchangeName, task.name);
    });
};

App.prototype.useChannelToDeclareQueueForTask = function (task) {
  var self = this;
  return self.useChannel(function (channel) {
    return self.declareQueueForTask(channel, task);
  });
};

App.prototype.publishToQueue = function (channel, queue, object, options) {
  options = options || {
    deliveryMode: true,
    replyTo: this.resultQueue,
    correlationId: uuid.v4()
  };
  var serializedObject = JSON.stringify(object);
  return Promise.resolve(
    channel.sendToQueue(queue, new Buffer(serializedObject), options));
};

App.prototype.useChannelToPublishToQueue = function (queue, object, options) {
  var self = this;
  return self.useChannel(function (channel) {
    return self.publishToQueue(channel, queue, object, options);
  });
};

App.prototype.publishTask = function (channel, taskName, taskObject) {
  var self = this;
  var taskId = uuid.v4();
  var queue = taskName;
  var options = options || {
    deliveryMode: true,
    replyTo: this.resultQueue,
    correlationId: taskId,
    headers: {
      taskName: taskName,
      publishedAt: Date.now()
    }
  };
  return this.publishToQueue(channel, queue, taskObject, options)
    .then(function () {
      self.waitingForResult[taskId] = {
        taskName: taskName,
        resolver: null
      };
      return taskId;
    });
};

App.prototype.useChannelToPublishTask = function (taskName, taskObject) {
  var self = this;
  return self.useChannel(function (channel) {
    return self.publishTask(channel, taskName, taskObject);
  });
};

App.prototype.registerTaskWorker = function (taskName) {
  // create a new channel for task to listening to the queue
  var self = this;
  // use a seperate channel not in pool
  return this.connection.createChannel()
    .then(function (channel) {
      self.tasks[taskName].channel = channel;
      return channel.consume(taskName, self.execTask.bind(self), {
        noAck: false
      });
    });
};

var stringifyError = function (err) {
  var plainObject = {};
  Object.getOwnPropertyNames(err).forEach(function (key) {
    plainObject[key] = err[key];
  });
  return plainObject;
};

App.prototype.ackMessage = function (channel, message) {
  var self = this;
  return Promise.resolve(channel.ack(message));
};

App.prototype.execTask = function (message) {
  // debug('execTask');
  var self = this;
  if (!message.properties ||
    !message.properties.headers ||
    !message.properties.headers.taskName) {
    return;
  }
  var taskName = message.properties.headers.taskName;
  if (!this.tasks[taskName]) {
    debug('execTask', 'invalid task', taskName);
  }
  var replyToQueue = message.properties.replyTo;
  var correlationId = message.properties.correlationId;
  var taskObject = JSON.parse(message.content.toString());
  var taskStatus;
  var resultObject;
  this.tasks[taskName].exec(taskObject)
    .then(function (result) {
      resultObject = result;
      // publish result to result queue `replyTo`
      // self.useChannelToPublishToQueue(replyToQueue, result, {
      //   correlationId: correlationId,
      //   headers: {
      //     taskName: taskName,
      //     finishedAt: Date.now()
      //   }
      // });
    })
    .catch(function (err) {
      debug('execTask', 'catch err', err);
      taskStatus = 'rejected';
      resultObject = stringifyError(err);
      // self.useChannelToPublishToQueue(replyToQueue, stringifyError(err), {
      //   correlationId: correlationId,
      //   headers: {
      //     taskStatus: 'rejected',
      //     taskName: taskName,
      //     finishedAt: Date.now()
      //   }
      // });
    })
    .finally(function () {
      self.useChannelToPublishToQueue(replyToQueue, resultObject, {
        correlationId: correlationId,
        headers: {
          taskStatus: taskStatus,
          taskName: taskName,
          finishedAt: Date.now()
        }
      })
        .then(function () {
          self.ackMessage(self.tasks[taskName].channel, message)
            .then(function () {
              return;
            });
        });

    });
};

/**
 * Initiate the connection to rabbitmq and set up `exchange` and `queue`
 *
 * * each task opens a channel
 *
 * @return {[type]} [description]
 */
App.prototype.connect = function () {
  debug('#connect');
  var self = this;
  return amqp.connect(this.options.backend)
    .bind(this)
    .then(function (connection) {
      debug('#connect', 'connected');
      process.once('SIGINT', function () {
        debug('#connect', 'close');
        connection.close();
      });
      this.connection = connection;
      this.setupChannelPool(connection);
      return this.useChannel(function (channel) {
        return self.declareDefaultExchange(channel);
      });
    })
    .then(function () {
      return self.useChannelToDeclareResultQueue();
    })
    .then(function () {
      // declare task queues
      var declaringTaskQueues = [];
      _.forEach(self.tasks, function (task, taskName) {
        var declaring = self.useChannelToDeclareQueueForTask(task);
        declaringTaskQueues.push(declaring);
      });
      return Promise.all(declaringTaskQueues);
    });
};

/**
 * Construct a task
 *
 * @example
 * ```
 * var app = new App();
 * var taskAdd = app.task({
 *   name: 'my.add',
 *   handler: function(object){}
 * });
 *
 * // calling task
 * var resultPromise = taskAdd({number1: 1, number2: 2});
 *
 * // get result
 * resultPromise.then(function(result){
 *   console.log(result); // 3
 * })
 *
 */
App.prototype.task = function (object, options) {
  var self = this;
  var createdTask = new Task(object, options);
  this.tasks[createdTask.name] = createdTask;

  var generatedTask = function (taskObject) {
    return createdTask.exec(taskObject);
  };
  generatedTask.delay = function (taskObject) {
    // send task to queue
    return new Promise(function (resolve, reject) {
      self.useChannelToPublishTask(generatedTask.taskName, taskObject)
        .then(function (taskId) {
          self.waitingForResult[taskId].resolver = resolve;
          self.waitingForResult[taskId].rejecter = reject;
        });
    });
  };
  generatedTask.taskName = createdTask.name;
  generatedTask.task = createdTask;
  return generatedTask;
};


App.prototype.do = function (taskName, taskObject) {
  if (!this.tasks[taskName]) {
    return Promise.reject(new Error('unable to find task ' + taskName));
  }
  return this.tasks[taskName].delay(taskObject);
};

module.exports = App;
