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
var LocalStack = require('./../lib/utils').LocalStack;

describe('utils', function() {
  describe('.Promise', function() {
    describe('#getTaskId()', function() {
      it('is a function', function() {
        var q = new Promise(function() {});
        expect(q.getTaskId).to.be.a('function');
      });
      it('returns `#taskId`', function() {
        var q = new Promise(function() {});
        q.taskId = 'sometaskId';
        q.getTaskId().should.equal('sometaskId');
      });
    });
    describe('#setTaskId(taskId)', function() {
      it('is a function', function() {
        var q = new Promise(function() {});
        expect(q.setTaskId).to.be.a('function');
      });
      it('sets `#taskId`', function() {
        var q = new Promise(function() {});
        expect(q.taskId).to.not.exist;
        q.setTaskId('sometaskId');
        q.taskId.should.equal('sometaskId');
      });
    });
  });
  describe('.LocalStack', function() {
    var stack;
    beforeEach(function() {
      stack = new LocalStack();
    });

    it('LIFO', function() {
      stack.push('a');
      stack.push('b');
      stack.push('c');
      stack.pop().should.equal('c');
    });
    it('keeps last on the top', function() {
      stack.push('a');
      stack.push('b');
      stack.push('c');
      stack.top().should.equal('c');
      stack.pop().should.equal('c');
      stack.top().should.equal('b');
      stack.pop().should.equal('b');
      stack.top().should.equal('a');
    });
    it('keeps first on the tail', function() {
      stack.push('a');
      stack.push('b');
      stack.push('c');
      stack.tail().should.equal('a');
      stack.pop().should.equal('c');
      stack.tail().should.equal('a');
      stack.pop().should.equal('b');
      stack.tail().should.equal('a');
    });
    it('#(size) return stack size', function() {
      stack.push('a');
      stack.push('b');
      stack.push('c');
      stack.size().should.equal(3);
      stack.pop();
      stack.size().should.equal(2);
      stack.pop();
      stack.size().should.equal(1);
    });
    it('#flush() to empty', function() {
      stack.push('a');
      stack.push('b');
      stack.push('c');
      stack.size().should.equal(3);
      stack.flush();
      stack.size().should.equal(0);
    });
  });
});
