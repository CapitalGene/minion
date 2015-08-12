'use strict';
/**
 * test.request_timeout_error.js
 *
 * @author Chen Liang [code@chen.technology]
 */

/*!
 * Module dependencies.
 */
var lib = require('./../../lib');
var errors = lib.errors;
var RequestTimeoutError = errors.RequestTimeoutError;
var MinionError = errors.MinionError;

describe('errors', function() {
  describe('RequestTimeoutError', function() {
    it('is an instance of MinionError', function() {
      var message = 'some error';
      var err = new RequestTimeoutError(message);
      expect(err).to.be.an.instanceOf(MinionError);
      err.message.should.equal(message);
    });
    it('is an instance of Error', function() {
      var message = 'some error';
      var err = new RequestTimeoutError(message);
      expect(err).to.be.an.instanceOf(Error);
      err.message.should.equal(message);
    });
    it('#name = `RequestTimeoutError`', function() {
      var err = new RequestTimeoutError();
      err.name.should.equal('RequestTimeoutError');
    });
  });
});
