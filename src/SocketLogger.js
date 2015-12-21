import TyphonEvents     from 'typhonjs-core-backbone-common/src/TyphonEvents.js';

import Socket           from 'typhonjs-core-socket/src/core/Socket.js';
import Queue            from 'typhonjs-core-socket/src/core/Queue.js';

import setSocketOptions from 'pathSocketPlatformSrc/setSocketOptions.js';

'use strict';

const s_RECONNECT_INTERVAL = 5000;

const s_STR_EVENT_CONNECTED = 'socketlogger:connected';
const s_STR_EVENT_DISCONNECTED = 'socketlogger:disconnected';

/**
 * SocketLogger.js -- Provides logging functionality with all log messages posting to the socket specified by the
 * given `host`.
 *
 * The host should formatted as `domain:port`.
 *
 * Log messages are queued until a connection is made. The protocol `socketlogger` is extremely simple.
 *
 * Client:
 * send `msg: connect` -> receives a `msg: connected` message from the server.
 * receive `msg: ping` -> sends a keep alive `msg pong` to the server.
 * send `msg: log, type: <log level>, data: <data>` to send log messages to server.
 *
 * Automatic reconnection is attempted when the connection is lost.
 */
export default class SocketLogger extends TyphonEvents
{
   /**
    * Returns the `host` parameter for socket options.
    *
    * @returns {Object}
    */
   get host()           { return this._params.host; }

   /**
    * Returns the socket options used by SocketLogger.
    *
    * @returns {Object}
    */
   get socketOptions()  { return this._params.socketOptions; }

   /**
    * Creates SocketLogger with the following socket options.
    *
    * @param {string}   host - host name / port.
    * @param {boolean}  ssl - Indicates if an SSL connection is requested.
    * @param {object}   serializer - An instance of an object which conforms to JSON for serialization; default (JSON).
    * @param {boolean}  autoConnect - Indicates that SocketLogger will attempt to connect on construction.
    * @param {boolean}  autoReconnect - Indicates that SocketLogger will attempt to reconnection on connection lost.
    */
   constructor(host, ssl = false, serializer = JSON, autoConnect = true, autoReconnect = true)
   {
      super();

      /**
       * Defines the current connection status.
       * @type {string}
       */
      this.status = 'disconnected';

      /**
       * Defines the queue to buffer messages.
       * @type {Object}
       */
      this.messageQueue = new Queue((message) =>
      {
         if (this.status === 'connected') { this.socket.send(message); return true; }
         else { return false; }
      });

      this._params =
      {
         autoConnect,
         autoReconnect,
         host,
         socketOptions: setSocketOptions(host, ssl, serializer)
      };

      // Set 'protocol'
      this._params.socketOptions.protocol = 'socketlogger';

      /**
       * Defines the socket.
       * @type {Object}
       */
      this.socket = new Socket(this.socketOptions);

      if (autoConnect)
      {
         this.socket.connect();
      }

      this._init();
   }

   /**
    * Connects the socket connection.
    *
    * Note: A connection is automatically attempted on construction of SocketLogger.
    */
   connect()
   {
      this.socket.connect.bind(this.socket);
      this.socket.connect();
   }

   /**
    * Post debug message.
    */
   debug()
   {
      this.messageQueue.push({ msg: 'log', type: 'debug', data: arguments });
   }

   /**
    * Disconnects the socket connection.
    */
   disconnect()
   {
      this.socket.disconnect(...arguments);

      this.status = 'disconnected';

      this.messageQueue.empty();
      super.triggerDefer(s_STR_EVENT_DISCONNECTED, this.socketOptions);
   }

   /**
    * Post error message.
    */
   error()
   {
      this.messageQueue.push({ msg: 'log', type: 'error', data: arguments });
   }

   /**
    * Post fatal message.
    */
   fatal()
   {
      this.messageQueue.push({ msg: 'log', type: 'fatal', data: arguments });
   }

   /**
    * Post info message.
    */
   info()
   {
      this.messageQueue.push({ msg: 'log', type: 'info', data: arguments });
   }

   /**
    * Initializes all Socket callbacks.
    *
    * @private
    */
   _init()
   {
      // When the socket opens, send the `connect` message to establish the DDP connection.
      this.socket.on('socket:open', () =>
      {
         this.socket.send({ msg: 'connect' });
      });

      this.socket.on('socket:close', () =>
      {
         this.status = 'disconnected';

         this.messageQueue.empty();
         super.triggerDefer(s_STR_EVENT_DISCONNECTED, this.socketOptions);

         if (this._params.autoReconnect)
         {
            // Schedule a reconnection
            setTimeout(this.socket.connect.bind(this.socket), s_RECONNECT_INTERVAL);
         }
      });

      this.socket.on('socket:message:in', (message) =>
      {
         switch (message.msg)
         {
            case 'connected':
               this.status = 'connected';
               this.messageQueue.process();
               super.triggerDefer(s_STR_EVENT_CONNECTED, this.socketOptions);
               break;

            // Reply with a `pong` message to prevent the server from closing the connection.
            case 'ping':
               this.socket.send({ msg: 'pong', id: message.id });
               break;
         }
      });
   }

   /**
    * Post trace message.
    */
   trace()
   {
      this.messageQueue.push({ msg: 'log', type: 'trace', data: arguments });
   }

   /**
    * Post warn message.
    */
   warn()
   {
      this.messageQueue.push({ msg: 'log', type: 'warn', data: arguments });
   }
}