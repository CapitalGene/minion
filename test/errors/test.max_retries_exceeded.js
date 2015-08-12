'use strict';
/**
 * test.max_retries_exceeded.js
 *
 * @author Chen Liang [code@chen.technology]
 */

/*!
 * Module dependencies.
 */
var lib = require('./../../lib');
var errors = lib.errors;
var MaxRetriesExceededError = errors.MaxRetriesExceededError;
var MinionError = errors.MinionError;

describe('errors', function() {
  describe('MaxRetriesExceededError', function() {
    it('is an instance of MinionError', function() {
      var message = 'some error';
      var err = new MaxRetriesExceededError(message);
      expect(err).to.be.an.instanceOf(MinionError);
      err.message.should.equal(message);
    });
    it('is an instance of Error', function() {
      var message = 'some error';
      var err = new MaxRetriesExceededError(message);
      expect(err).to.be.an.instanceOf(Error);
      err.message.should.equal(message);
    });
    it('#name = `MaxRetriesExceededError`', function() {
      var err = new MaxRetriesExceededError();
      err.name.should.equal('MaxRetriesExceededError');
    });
  });
});
