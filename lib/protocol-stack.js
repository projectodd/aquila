var Message = require('./message'),
    EE      = require('events').EventEmitter,
    os      = require('os'),
    util    = require('util'),
    Q       = require('q');

module.exports = ProtocolStack;

function ProtocolStack(cluster, protocols) {
  if (!(this instanceof ProtocolStack)) return new ProtocolStack(protocols);
  initProtocols(this);
  this.cluster = cluster;
  this.protocols = protocols;
  this.top = this.protocols[0];
  this.bottom = this.protocols[this.protocols.length - 1];
  this.address = cluster + '|' + os.hostname() + ':' + process.pid;
  this.members = {};

  function initProtocols(stack) {
    // Set up/down protocols for each
    for (var i = 0; i < protocols.length; i++) {
      var current = protocols[i];
      if (i > 0) {
        current.upProtocol = protocols[i - 1];
      }
      if (i + 1 < protocols.length) {
        current.downProtocol = protocols[i + 1];
      }
    }

    // Initialize each protocol
    for (var j = 0; j < protocols.length; j++) {
      var sender = createSender(stack, protocols[j]);
      var receiver = createReceiver(stack, protocols[j]);
      protocols[j].init(stack, sender, receiver);
    }
  }
  return this;
}
util.inherits(ProtocolStack, EE);

ProtocolStack.prototype.start = function() {
  return _startProtocol(this, this.protocols.length - 1);

  function _startProtocol(stack, i) {
    var protocol = stack.protocols[i];
    if (!protocol) { return Q(); }

    return protocol.start()
      .then(function() { _startProtocol(stack, i - 1); });
    }
};

/**
 * Send a message to other cluster members.
 * @param {Message} message the message to send
 * @returns {object} A promise, resolved when the message has been sent
 */
ProtocolStack.prototype.send = function(message) {
  return this.top.send(message, createNext(this, this.top));
};

/**
 * Receive a message from other cluster members. This gets called
 * automatically when a message makes its way to the top of the
 * protocol stack, but may be useful to call manually for testing
 * purposes.
 * @param {Message} message the message received
 */
ProtocolStack.prototype.receive = function(message) {
  switch(message.type) {
  case Message.MSG:
    this.emit('message', message);
    break;
  case Message.VIEW_CHANGE:
    this.emit('viewChanged', message.body);
    break;
  case Message.MEMBER_ADDED:
    this.emit('memberAdded', message.body[0], message.body[1]);
    break;
  case Message.MEMBER_REMOVED:
    this.emit('memberRemoved', message.body[0], message.body[1]);
    break;
  }
};

ProtocolStack.prototype.memberList = function() {
  return Object.keys(this.members);
};

ProtocolStack.prototype.stop = function() {
  return Q.all(this.protocols.reverse().map(function(p) {
    return p.stop();
  }));
};


function createNext(stack, protocol) {
  return {
    send: function(message) {
    },
    receive: function(message) {
    }
  };
}

function createSender(stack, protocol) {
  return function(message) {
    if (protocol.downProtocol) {
      return protocol.downProtocol.send(message);
    } else {
      console.log('end of the line, discarding sent message');
      return Q();
    }
  };
}

function createReceiver(stack, protocol) {
  return function(message) {
    if (protocol.upProtocol) {
      protocol.upProtocol.receive(message);
    } else {
      stack.receive(message);
    }
  };
}
