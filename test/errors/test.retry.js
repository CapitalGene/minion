'use strict';
/**
 * test.retry.js
 *
 * @author Chen Liang [code@chen.technology]
 */

/*!
 * Module dependencies.
 */
var lib = require('./../../lib');
var errors = lib.errors;
var Retry = errors.Retry;
var MinionError = errors.MinionError;

describe('errors', function () {
  describe('Retry', function () {
    it('is an instance of MinionError', function () {
      var message = 'some error';
      var err = new Retry(message);
      expect(err).to.be.an.instanceOf(MinionError);
      err.message.should.equal(message);
    });
    it('is an instance of Error', function () {
      var message = 'some error';
      var err = new Retry(message);
      expect(err).to.be.an.instanceOf(Error);
      err.message.should.equal(message);
    });
    it('#name = `Retry`', function () {
      var err = new Retry();
      err.name.should.equal('Retry');
    });
    it('takes (message, originalError, eta)', function () {
      var message = 'some error';
      var originalError = new Error('original originalError');
      var eta = new Date(Date.now() + 5 * 1000);
      var retryError = new Retry(message, originalError, eta);
      retryError.should.have.property('originalError', originalError);
      retryError.should.have.property('eta')
        .that.is.an.instanceOf(Date);
    });
    it('eta can be timestamp', function () {
      var message = 'some error';
      var originalError = new Error('original originalError');
      var eta = new Date(Date.now() + 5 * 1000);
      var retryError = new Retry(message, originalError, eta.valueOf());
      retryError.should.have.property('originalError', originalError);
      retryError.should.have.property('eta')
        .that.is.an.instanceOf(Date);
      retryError.eta.valueOf().should.equal(eta.valueOf());
    });
  });
});
