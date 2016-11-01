'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _request = require('request');

var _request2 = _interopRequireDefault(_request);

var _ws = require('ws');

var _ws2 = _interopRequireDefault(_ws);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

if (!global._babelPolyfill) {
  require('babel-polyfill');
}

var STATES = {
  SUCCESS: 'Success',
  RUNNING: 'Running',
  STOPPED: 'Stopped',
  TERMINATED: 'Terminated'
};

var EVENT_TYPES = {
  STACK: 'stack',
  SERVICE: 'service',
  CONTAINER: 'container',
  ACTION: 'action'
};

var DockerCloudSubscribers = new WeakMap();

var DockerCloud = function () {
  function DockerCloud(username, password) {
    _classCallCheck(this, DockerCloud);

    this.stacks = {
      query: this.queryStacks.bind(this),
      findById: this.findStackById.bind(this),
      findByName: this.findStackByName.bind(this),
      create: this.createStack.bind(this),
      remove: this.removeStack.bind(this),

      start: this.startStack.bind(this),

      getServices: this.getStackServices.bind(this),

      waitUntilRunning: this.waitUntilStackIsRunning.bind(this),
      waitUntilTerminated: this.waitUntilStackIsTerminated.bind(this)
    };
    this.services = {
      findById: this.findServiceById.bind(this),
      findByName: this.findServiceByName.bind(this),
      create: this.createService.bind(this),
      remove: this.removeService.bind(this),

      start: this.startService.bind(this),
      redeploy: this.redeployService.bind(this),

      getContainers: this.getServiceContainers.bind(this)
    };
    this.containers = {
      findById: this.findContainerById.bind(this),

      waitUntilStopped: this.waitUntilContainerIsStopped.bind(this)
    };
    this.actions = {
      findById: this.findActionById.bind(this),

      waitUntilSuccess: this.waitUntilActionIsSuccess.bind(this)
    };

    this.credentials = {
      username: username,
      password: password
    };
    this.checkInterval = 5000;

    this.appRequest = _request2.default.defaults({
      baseUrl: 'https://cloud.docker.com/api/app/v1',
      headers: {
        'Content-Type': 'application/json'
      },
      auth: { username: username, password: password }
    });
    this.auditRequest = _request2.default.defaults({
      baseUrl: 'https://cloud.docker.com/api/audit/v1',
      headers: {
        'Content-Type': 'application/json'
      },
      auth: { username: username, password: password }
    });
    DockerCloudSubscribers.set(this, []);
  }

  _createClass(DockerCloud, [{
    key: 'connect',
    value: function connect() {
      var _this = this;

      return new Promise(function (resolve) {
        var _credentials = _this.credentials,
            username = _credentials.username,
            password = _credentials.password;

        _this.ws = new _ws2.default('wss://ws.cloud.docker.com/api/audit/v1/events/', null, {
          headers: { Authorization: 'Basic ' + new Buffer(username + ':' + password).toString('base64') }
        });

        _this.ws.on('open', function () {
          return resolve();
        });

        _this.ws.on('message', function (data) {
          var message = JSON.parse(data);
          var subscribers = DockerCloudSubscribers.get(_this);
          var _iteratorNormalCompletion = true;
          var _didIteratorError = false;
          var _iteratorError = undefined;

          try {
            for (var _iterator = subscribers[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
              var subscriber = _step.value;

              subscriber(message);
            }
          } catch (err) {
            _didIteratorError = true;
            _iteratorError = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion && _iterator.return) {
                _iterator.return();
              }
            } finally {
              if (_didIteratorError) {
                throw _iteratorError;
              }
            }
          }
        });
      });
    }
  }, {
    key: 'subscribeToAllMessages',
    value: function subscribeToAllMessages(func) {
      DockerCloudSubscribers.get(this).push(func);
    }
  }, {
    key: 'unSubscribeFromAllMessages',
    value: function unSubscribeFromAllMessages(func) {
      var subscribers = DockerCloudSubscribers.get(this);
      var index = subscribers.indexOf(func);
      if (~index) {
        subscribers.splice(index, 1);
      }
    }
  }, {
    key: 'subscribe',
    value: function subscribe(_ref) {
      var _this2 = this;

      var type = _ref.type,
          state = _ref.state,
          resourceUri = _ref.resourceUri;

      return new Promise(function (resolve) {
        var subscribeFunction = function subscribeFunction(message) {
          if (message.type === type && message.state === state && message.resource_uri.includes(resourceUri)) {
            _this2.unSubscribeFromAllMessages(subscribeFunction);
            resolve();
          }
        };
        _this2.subscribeToAllMessages(subscribeFunction);
      });
    }
  }, {
    key: 'disconnect',
    value: function disconnect() {
      this.ws.terminate();
    }

    // Stacks

  }, {
    key: 'queryStacks',
    value: function queryStacks() {
      var _this3 = this;

      return new Promise(function (resolve, reject) {
        _this3.appRequest.get('/stack', function (error, response, body) {
          if (error) return reject(error);

          var stacks = JSON.parse(body).objects;

          return resolve(stacks);
        });
      });
    }
  }, {
    key: 'findStackById',
    value: function findStackById(id) {
      var _this4 = this;

      return new Promise(function (resolve, reject) {
        _this4.appRequest.get('/stack/' + id + '/', function (error, response, body) {
          if (error) return reject(error);
          if (response.statusCode >= 300) return reject(body);

          return resolve(JSON.parse(body));
        });
      });
    }
  }, {
    key: 'findStackByName',
    value: function findStackByName(name) {
      var _this5 = this;

      return new Promise(function (resolve, reject) {
        _this5.appRequest.get('/stack', function (error, response, body) {
          if (error) return reject(error);
          if (response.statusCode >= 300) return reject(body);

          var stacks = JSON.parse(body).objects;
          var stack = stacks.find(function (x) {
            return x.name === name && x.state !== STATES.TERMINATED;
          });

          return resolve(stack);
        });
      });
    }
  }, {
    key: 'createStack',
    value: function createStack(props) {
      var _this6 = this;

      return new Promise(function (resolve, reject) {
        _this6.appRequest.post({
          url: '/stack/',
          body: JSON.stringify(props)
        }, function (error, response, body) {
          if (error) return reject(error);
          if (response.statusCode >= 300) return reject(body);

          var stack = JSON.parse(body);

          return resolve(stack);
        });
      });
    }
  }, {
    key: 'removeStack',
    value: function removeStack(stack) {
      var _this7 = this;

      return new Promise(function (resolve, reject) {
        if (stack.state === STATES.TERMINATED) {
          resolve();
        } else {
          _this7.appRequest.del('/stack/' + stack.uuid + '/', function () {
            var _ref2 = _asyncToGenerator(regeneratorRuntime.mark(function _callee(error, response, body) {
              var actionId, action;
              return regeneratorRuntime.wrap(function _callee$(_context) {
                while (1) {
                  switch (_context.prev = _context.next) {
                    case 0:
                      if (!error) {
                        _context.next = 2;
                        break;
                      }

                      return _context.abrupt('return', reject(error));

                    case 2:
                      if (!(response.statusCode >= 300)) {
                        _context.next = 4;
                        break;
                      }

                      return _context.abrupt('return', reject(body));

                    case 4:
                      actionId = _this7.extractUuid(response.headers['x-dockercloud-action-uri']);
                      _context.next = 7;
                      return _this7.findActionById(actionId);

                    case 7:
                      action = _context.sent;
                      return _context.abrupt('return', resolve(action));

                    case 9:
                    case 'end':
                      return _context.stop();
                  }
                }
              }, _callee, _this7);
            }));

            return function (_x, _x2, _x3) {
              return _ref2.apply(this, arguments);
            };
          }());
        }
      });
    }
  }, {
    key: 'startStack',
    value: function startStack(stack) {
      var _this8 = this;

      return new Promise(function (resolve, reject) {
        _this8.appRequest.post('/stack/' + stack.uuid + '/start/', function (error, response, body) {
          if (error) return reject(error);
          if (response.statusCode >= 300) return reject(body);

          return resolve();
        });
      });
    }
  }, {
    key: 'getStackServices',
    value: function getStackServices(stack) {
      var _this9 = this;

      var promises = stack.services.map(function (service) {
        var tokens = service.split('/');
        var serviceId = tokens[tokens.length - 2];

        return _this9.findServiceById(serviceId);
      });

      return Promise.all(promises);
    }
  }, {
    key: 'waitUntilStackIsTerminated',
    value: function waitUntilStackIsTerminated(stack) {
      var _this10 = this;

      return new Promise(function (resolve) {
        if (stack.state === STATES.TERMINATED) return resolve();

        return Promise.race([_this10.subscribe({
          type: EVENT_TYPES.STACK,
          state: STATES.TERMINATED,
          resourceUri: stack.uuid
        }), _this10.checkPeriodically('findStackById', stack.uuid, {
          state: STATES.TERMINATED
        }, _this10.checkInterval)]).then(resolve);
      });
    }
  }, {
    key: 'waitUntilStackIsRunning',
    value: function waitUntilStackIsRunning(stack) {
      var _this11 = this;

      return new Promise(function (resolve) {
        if (stack.state === STATES.RUNNING) return resolve();

        return Promise.race([_this11.subscribe({
          type: EVENT_TYPES.STACK,
          state: STATES.RUNNING,
          resourceUri: stack.uuid
        }), _this11.checkPeriodically('findStackById', stack.uuid, {
          state: STATES.RUNNING
        }, _this11.checkInterval)]).then(resolve);
      });
    }

    // Services

  }, {
    key: 'findServiceById',
    value: function findServiceById(id) {
      var _this12 = this;

      return new Promise(function (resolve, reject) {
        _this12.appRequest.get('/service/' + id + '/', function (error, response, body) {
          if (error) return reject(error);
          if (response.statusCode >= 300) return reject(body);

          return resolve(JSON.parse(body));
        });
      });
    }
  }, {
    key: 'findServiceByName',
    value: function findServiceByName(name) {
      var _this13 = this;

      return new Promise(function (resolve, reject) {
        _this13.appRequest.get('/service?name=' + name, function (error, response, body) {
          if (error) return reject(error);
          if (response.statusCode >= 300) return reject(body);

          var services = JSON.parse(body).objects;
          var service = services.find(function (x) {
            return x.state !== STATES.TERMINATED;
          });

          return resolve(service);
        });
      });
    }
  }, {
    key: 'createService',
    value: function createService(props) {
      var _this14 = this;

      return new Promise(function (resolve, reject) {
        _this14.appRequest.post({
          url: '/service/',
          body: JSON.stringify(props)
        }, function (error, response, body) {
          if (error) return reject(error);
          if (response.statusCode >= 300) return reject(body);

          var service = JSON.parse(body);

          return resolve(service);
        });
      });
    }
  }, {
    key: 'removeService',
    value: function removeService(service) {
      var _this15 = this;

      return new Promise(function (resolve, reject) {
        if (service.state === STATES.TERMINATED) {
          resolve();
        } else {
          _this15.appRequest.del('/service/' + service.uuid + '/', function () {
            var _ref3 = _asyncToGenerator(regeneratorRuntime.mark(function _callee2(error, response, body) {
              var actionId, action;
              return regeneratorRuntime.wrap(function _callee2$(_context2) {
                while (1) {
                  switch (_context2.prev = _context2.next) {
                    case 0:
                      if (!error) {
                        _context2.next = 2;
                        break;
                      }

                      return _context2.abrupt('return', reject(error));

                    case 2:
                      if (!(response.statusCode >= 300)) {
                        _context2.next = 4;
                        break;
                      }

                      return _context2.abrupt('return', reject(body));

                    case 4:
                      actionId = _this15.extractUuid(response.headers['x-dockercloud-action-uri']);
                      _context2.next = 7;
                      return _this15.findActionById(actionId);

                    case 7:
                      action = _context2.sent;
                      return _context2.abrupt('return', resolve(action));

                    case 9:
                    case 'end':
                      return _context2.stop();
                  }
                }
              }, _callee2, _this15);
            }));

            return function (_x4, _x5, _x6) {
              return _ref3.apply(this, arguments);
            };
          }());
        }
      });
    }
  }, {
    key: 'startService',
    value: function startService(service) {
      var _this16 = this;

      return new Promise(function (resolve, reject) {
        _this16.appRequest.post('/service/' + service.uuid + '/start/', function () {
          var _ref4 = _asyncToGenerator(regeneratorRuntime.mark(function _callee3(error, response, body) {
            var actionId, action;
            return regeneratorRuntime.wrap(function _callee3$(_context3) {
              while (1) {
                switch (_context3.prev = _context3.next) {
                  case 0:
                    if (!error) {
                      _context3.next = 2;
                      break;
                    }

                    return _context3.abrupt('return', reject(error));

                  case 2:
                    if (!(response.statusCode >= 300)) {
                      _context3.next = 4;
                      break;
                    }

                    return _context3.abrupt('return', reject(body));

                  case 4:
                    actionId = _this16.extractUuid(response.headers['x-dockercloud-action-uri']);
                    _context3.next = 7;
                    return _this16.findActionById(actionId);

                  case 7:
                    action = _context3.sent;
                    return _context3.abrupt('return', resolve(action));

                  case 9:
                  case 'end':
                    return _context3.stop();
                }
              }
            }, _callee3, _this16);
          }));

          return function (_x7, _x8, _x9) {
            return _ref4.apply(this, arguments);
          };
        }());
      });
    }
  }, {
    key: 'stopService',
    value: function stopService(service) {
      var _this17 = this;

      return new Promise(function (resolve, reject) {
        _this17.appRequest.post('/service/' + service.uuid + '/stop/', function () {
          var _ref5 = _asyncToGenerator(regeneratorRuntime.mark(function _callee4(error, response, body) {
            var actionId, action;
            return regeneratorRuntime.wrap(function _callee4$(_context4) {
              while (1) {
                switch (_context4.prev = _context4.next) {
                  case 0:
                    if (!error) {
                      _context4.next = 2;
                      break;
                    }

                    return _context4.abrupt('return', reject(error));

                  case 2:
                    if (!(response.statusCode >= 300)) {
                      _context4.next = 4;
                      break;
                    }

                    return _context4.abrupt('return', reject(body));

                  case 4:
                    actionId = _this17.extractUuid(response.headers['x-dockercloud-action-uri']);
                    _context4.next = 7;
                    return _this17.findActionById(actionId);

                  case 7:
                    action = _context4.sent;
                    return _context4.abrupt('return', resolve(action));

                  case 9:
                  case 'end':
                    return _context4.stop();
                }
              }
            }, _callee4, _this17);
          }));

          return function (_x10, _x11, _x12) {
            return _ref5.apply(this, arguments);
          };
        }());
      });
    }
  }, {
    key: 'updateService',
    value: function updateService(service, props) {
      var _this18 = this;

      return new Promise(function (resolve, reject) {
        _this18.appRequest.patch({
          url: '/service/' + service.uuid + '/',
          body: JSON.stringify(props)
        }, function () {
          var _ref6 = _asyncToGenerator(regeneratorRuntime.mark(function _callee5(error, response, body) {
            var actionId, action;
            return regeneratorRuntime.wrap(function _callee5$(_context5) {
              while (1) {
                switch (_context5.prev = _context5.next) {
                  case 0:
                    if (!error) {
                      _context5.next = 2;
                      break;
                    }

                    return _context5.abrupt('return', reject(error));

                  case 2:
                    if (!(response.statusCode >= 300)) {
                      _context5.next = 4;
                      break;
                    }

                    return _context5.abrupt('return', reject(body));

                  case 4:
                    actionId = _this18.extractUuid(response.headers['x-dockercloud-action-uri']);
                    _context5.next = 7;
                    return _this18.findActionById(actionId);

                  case 7:
                    action = _context5.sent;
                    return _context5.abrupt('return', resolve(action));

                  case 9:
                  case 'end':
                    return _context5.stop();
                }
              }
            }, _callee5, _this18);
          }));

          return function (_x13, _x14, _x15) {
            return _ref6.apply(this, arguments);
          };
        }());
      });
    }
  }, {
    key: 'redeployService',
    value: function redeployService(service) {
      var _this19 = this;

      return new Promise(function (resolve, reject) {
        _this19.appRequest.post('/service/' + service.uuid + '/redeploy/', function () {
          var _ref7 = _asyncToGenerator(regeneratorRuntime.mark(function _callee6(error, response, body) {
            var actionId, action;
            return regeneratorRuntime.wrap(function _callee6$(_context6) {
              while (1) {
                switch (_context6.prev = _context6.next) {
                  case 0:
                    if (!error) {
                      _context6.next = 2;
                      break;
                    }

                    return _context6.abrupt('return', reject(error));

                  case 2:
                    if (!(response.statusCode >= 300)) {
                      _context6.next = 4;
                      break;
                    }

                    return _context6.abrupt('return', reject(body));

                  case 4:
                    actionId = _this19.extractUuid(response.headers['x-dockercloud-action-uri']);
                    _context6.next = 7;
                    return _this19.findActionById(actionId);

                  case 7:
                    action = _context6.sent;
                    return _context6.abrupt('return', resolve(action));

                  case 9:
                  case 'end':
                    return _context6.stop();
                }
              }
            }, _callee6, _this19);
          }));

          return function (_x16, _x17, _x18) {
            return _ref7.apply(this, arguments);
          };
        }());
      });
    }
  }, {
    key: 'waitUntilServiceIsStopped',
    value: function waitUntilServiceIsStopped(service) {
      var _this20 = this;

      return new Promise(function (resolve) {
        if (service.state === STATES.STOPPED) return resolve();

        return Promise.race([
        // Subscribe to the websocket to get warned when the service is stopped
        _this20.subscribe({
          type: EVENT_TYPES.CONTAINER,
          state: STATES.STOPPED,
          resourceUri: service.uuid
        }),
        // Sometimes the websocket miss some message, check periodically if the service is stopped
        _this20.checkPeriodically('findServiceById', service.uuid, {
          state: STATES.STOPPED
        }, _this20.checkInterval)]).then(resolve);
      });
    }
  }, {
    key: 'waitUntilServiceIsRunning',
    value: function waitUntilServiceIsRunning(service) {
      var _this21 = this;

      return new Promise(function (resolve) {
        if (service.state === STATES.RUNNING) return resolve();

        return Promise.race([
        // Subscribe to the websocket to get warned when the service is stopped
        _this21.subscribe({
          type: EVENT_TYPES.CONTAINER,
          state: STATES.RUNNING,
          resourceUri: service.uuid
        }),
        // Sometimes the websocket miss some message, check periodically if the service is stopped
        _this21.checkPeriodically('findServiceById', service.uuid, {
          state: STATES.RUNNING
        }, _this21.checkInterval)]).then(resolve);
      });
    }
  }, {
    key: 'getServiceContainers',
    value: function getServiceContainers(service) {
      var _this22 = this;

      var promises = service.containers.map(function (container) {
        var tokens = container.split('/');
        var containerId = tokens[tokens.length - 2];

        return _this22.findContainerById(containerId);
      });

      return Promise.all(promises);
    }

    // Containers

  }, {
    key: 'findContainerById',
    value: function findContainerById(id) {
      var _this23 = this;

      return new Promise(function (resolve, reject) {
        _this23.appRequest.get('/container/' + id + '/', function (error, response, body) {
          if (error) return reject(error);
          if (response.statusCode >= 300) return reject(body);

          return resolve(JSON.parse(body));
        });
      });
    }
  }, {
    key: 'checkPeriodically',
    value: function checkPeriodically(action, uuid, until, interval) {
      var _this24 = this;

      return new Promise(function (resolve) {
        var checkStatus = function () {
          var _ref8 = _asyncToGenerator(regeneratorRuntime.mark(function _callee7() {
            var currentStatus, waitedStatus, key;
            return regeneratorRuntime.wrap(function _callee7$(_context7) {
              while (1) {
                switch (_context7.prev = _context7.next) {
                  case 0:
                    _context7.next = 2;
                    return _this24[action](uuid);

                  case 2:
                    currentStatus = _context7.sent;
                    waitedStatus = true;
                    _context7.t0 = regeneratorRuntime.keys(until);

                  case 5:
                    if ((_context7.t1 = _context7.t0()).done) {
                      _context7.next = 13;
                      break;
                    }

                    key = _context7.t1.value;

                    if (!until.hasOwnProperty(key)) {
                      _context7.next = 11;
                      break;
                    }

                    if (!(!currentStatus.hasOwnProperty(key) || currentStatus[key] !== until[key])) {
                      _context7.next = 11;
                      break;
                    }

                    waitedStatus = false;
                    return _context7.abrupt('break', 13);

                  case 11:
                    _context7.next = 5;
                    break;

                  case 13:
                    if (!waitedStatus) {
                      _context7.next = 15;
                      break;
                    }

                    return _context7.abrupt('return', resolve());

                  case 15:
                    return _context7.abrupt('return', setTimeout(checkStatus, interval));

                  case 16:
                  case 'end':
                    return _context7.stop();
                }
              }
            }, _callee7, _this24);
          }));

          return function checkStatus() {
            return _ref8.apply(this, arguments);
          };
        }();
        checkStatus();
      });
    }
  }, {
    key: 'waitUntilContainerIsStopped',
    value: function waitUntilContainerIsStopped(container) {
      var _this25 = this;

      return new Promise(function (resolve) {
        if (container.state === STATES.STOPPED) return resolve();

        return Promise.race([
        // Subscribe to the websocket to get warned when the container is stopped
        _this25.subscribe({
          type: EVENT_TYPES.CONTAINER,
          state: STATES.STOPPED,
          resourceUri: container.uuid
        }),
        // Sometimes the websocket miss some message, check periodically if the container is stopped
        _this25.checkPeriodically('findContainerById', container.uuid, {
          state: STATES.STOPPED
        }, 5000)]).then(resolve);
      });
    }

    // Actions

  }, {
    key: 'findActionById',
    value: function findActionById(id) {
      var _this26 = this;

      return new Promise(function (resolve, reject) {
        _this26.auditRequest.get('/action/' + id + '/', function (error, response, body) {
          if (error) return reject(error);
          if (response.statusCode >= 300) return reject(body);

          return resolve(JSON.parse(body));
        });
      });
    }
  }, {
    key: 'waitUntilActionIsSuccess',
    value: function waitUntilActionIsSuccess(action) {
      var _this27 = this;

      return new Promise(function (resolve) {
        if (action.state === STATES.SUCCESS) return resolve();

        return Promise.race([_this27.subscribe({
          type: EVENT_TYPES.ACTION,
          state: STATES.SUCCESS,
          resourceUri: action.uuid
        }), _this27.checkPeriodically('findActionById', action.uuid, {
          state: STATES.SUCCESS
        }, _this27.checkInterval)]).then(resolve);
      });
    }
  }, {
    key: 'extractUuid',
    value: function extractUuid(resourceUri) {
      var tokens = resourceUri.split('/');
      var uuid = tokens[tokens.length - 2];

      return uuid;
    }
  }]);

  return DockerCloud;
}();

exports.default = DockerCloud;