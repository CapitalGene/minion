'use strict';
/**
 * utils tests
 *
 * @author Chen Liang [code@chen.technology]
 */

/*!
 * Module dependencies.
 */
var Promise = require('./../lib/utils').Promise;

describe('utils', function () {
  describe('.Promise', function () {
    describe('#getTaskId()', function () {
      it('is a function', function () {
        var q = new Promise(function () {});
        expect(q.getTaskId).to.be.a('function');
      });
      it('returns `#taskId`', function () {
        var q = new Promise(function () {});
        q.taskId = 'sometaskId';
        q.getTaskId().should.equal('sometaskId');
      });
    });
    describe('#setTaskId(taskId)', function () {
      it('is a function', function () {
        var q = new Promise(function () {});
        expect(q.setTaskId).to.be.a('function');
      });
      it('sets `#taskId`', function () {
        var q = new Promise(function () {});
        expect(q.taskId).to.not.exist;
        q.setTaskId('sometaskId');
        q.taskId.should.equal('sometaskId');
      });
    });
  });
});
