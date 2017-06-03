'use strict';

const EventEmitter = require('events').EventEmitter;

const websocket = require('websocket');
const WebSocketServer = websocket.server;
const WebSocketClient = websocket.client;

const constants = require('./internal-constants');
const common = require('./common');
const transport = require('./transport-common');
const jsrs = require('./record-serialization');

// WebSocket transport for JSTP
//   connection - WebSocket connection
//
class Transport extends EventEmitter {
  constructor(connection) {
    super();

    this.connection = connection;
    this.remoteAddress = connection.remoteAddress;

    common.forwardMultipleEvents(this.connection, this, ['close', 'error']);

    this.connection.on('error', () => this.connection.drop());
    this.connection.on('message', message => this._onMessage(message));
  }

  // Send data over the connection
  //   data - Buffer or string
  //
  send(data) {
    if (Buffer.isBuffer(data)) {
      data = data.toString();
    }

    this.connection.sendUTF(data);
  }

  // End the connection optionally sending the last chunk of data
  //   data - Buffer or string (optional)
  //
  end(data) {
    if (data) this.send(data);

    this.connection.close();
  }

  // WebSocket message handler
  //   message - WebSocket message
  //
  _onMessage(message) {
    const data = (
      message.type === 'utf8' ? message.utf8Data : message.binaryData.toString()
    );

    let packet;
    try {
      packet = jsrs.parse(data);
    } catch (error) {
      return this.emit('error', error);
    }

    this.emit('packet', packet);
  }
}

// Default originCheckStrategy value for WebSocket Server constructor
//
const allowAllOriginCheckStrategy = function(/* origin */) {
  return true;
};

const initServer = function(options, httpServer) {
  options = Object.assign({}, options, {
    httpServer,
    autoAcceptConnections: false
  });

  this.isOriginAllowed =
      options.originCheckStrategy || allowAllOriginCheckStrategy;

  common.forwardEvent(this, this, 'clientError', 'error');

  this.on('request', (request, response) => {
    response.writeHead(400);
    response.end();
  });

  this.wsServer = new WebSocketServer(options);

  this.wsServer.on('request', (request) => {
    if (!this.isOriginAllowed(request.origin)) {
      return request.reject();
    }

    const connection =
      request.accept(constants.WEBSOCKET_PROTOCOL_NAME, request.origin);

    this._onRawConnection(connection);
  });
};

// Create and connect WebSocketClient to get WebSocketConnection
//
//   webSocketConfig - web socket client configuration, passed directly
//                     to WebSocketClient constructor
//   options - will be destructured and passed directly to
//             WebSocketClient.connect. The last argument of options
//             is optional callback that will be called when connection
//             is established.
//
const connectionFactory = (webSocketConfig, ...options) => {
  const callback = common.extractCallback(options);
  const wsClient = new WebSocketClient(webSocketConfig);
  options[1] = constants.WEBSOCKET_PROTOCOL_NAME;
  wsClient.once('connect', connection => callback(null, connection));
  wsClient.once('connectFailed', callback);
  wsClient.connect(...options);
};

const createConnection =
  transport.createConnectionFactory(
    connectionFactory,
    connection => new Transport(connection)
  );

const createConnectionAndInspect =
  transport.createConnectionAndInspectFactory(
    connectionFactory,
    connection => new Transport(connection)
  );

module.exports = {
  Transport,
  initServer,
  allowAllOriginCheckStrategy,
  // see transportCommon.createConnectionFactory
  //   webSocketConfig - web socket client configuration
  //                     (see connectionFactory)
  createConnection: (appName, client, webSocketConfig, ...options) =>
    createConnection(appName, client, webSocketConfig, ...options),
  // see transportCommon.createConnectionAndInspectFactory
  //   webSocketConfig - web socket client configuration
  //                     (see connectionFactory)
  createConnectionAndInspect: (
    appName, client, interfaces, webSocketConfig, ...options
  ) =>
    createConnectionAndInspect(appName, client, interfaces,
      webSocketConfig, ...options)
};