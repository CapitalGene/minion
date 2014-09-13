var chai = require('chai');
global.expect = chai.expect;
chai.should();
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
global.sinon = require('sinon');
