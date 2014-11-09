'use strict';
/**
 * Root tests
 *
 * @author Chen Liang [code@chen.technology]
 */

/*!
 * Module dependencies.
 */
var chai = require('chai');
var urlLib = require('url');

global.expect = chai.expect;
chai.should();
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
global.sinon = require('sinon');

var debug = require('debug')('minion:test:root');
before(function () {
  var uri = process.env.URI || 'amqp://localhost';
  var parsedUri = urlLib.parse(uri);
  var username = parsedUri.auth ? parsedUri.auth.split(':')[0]: undefined;
  var password = parsedUri.auth ? parsedUri.auth.split(':')[1]: undefined;
  this.testOptions = {
    uri: uri,
    host: parsedUri.hostname,
    port: parsedUri.port,
    username: username,
    password: password,
    vhost: parsedUri.pathname,
  };
  debug(this.testOptions);
});
