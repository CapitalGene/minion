'use strict';
/**
 * test.reject.js
 *
 * @author Chen Liang [code@chen.technology]
 */

/*!
 * Module dependencies.
 */
var lib = require('./../../lib');
var errors = lib.errors;
var Reject = errors.Reject;
var MinionError = errors.MinionError;

describe('errors', function () {
  describe('Reject', function () {
    it('is an instance of MinionError', function () {
      var message = 'some error';
      var err = new Reject(message);
      expect(err).to.be.an.instanceOf(MinionError);
      err.message.should.equal(message);
    });
    it('is an instance of Error', function () {
      var message = 'some error';
      var err = new Reject(message);
      expect(err).to.be.an.instanceOf(Error);
      err.message.should.equal(message);
    });
    it('#name = `Reject`', function () {
      var err = new Reject();
      err.name.should.equal('Reject');
    });
    it('take `reason`, `requeue`', function () {
      var message = 'some error';
      var reason = 'some reason';
      var requeue = true;
      var err = new Reject(message, reason, requeue);
      err.should.have.property('reason', reason);
      err.should.have.property('requeue', true);
    });
    it('#requeue default false', function () {
      var message = 'some error';

      var err = new Reject(message);
      err.should.have.property('requeue', false);
    });
  });
});
