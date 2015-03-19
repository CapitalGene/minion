'use strict';
/**
 * test.minion_error.js
 *
 * @author Chen Liang [code@chen.technology]
 */

/*!
 * Module dependencies.
 */
var lib = require('./../../lib');
var errors = lib.errors;
var MinionError = errors.MinionError;

describe('errors', function () {
  describe('MinionError', function () {
    it('is an instance of Error', function () {
      var message = 'some error';
      var err = new MinionError(message);
      expect(err).to.be.an.instanceOf(Error);
      err.message.should.equal(message);
    });
    it('#name = `MinionError`', function() {
      var err = new MinionError();
      err.name.should.equal('MinionError');
    });
  });
});
