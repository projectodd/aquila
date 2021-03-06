// emit viewChanged events once every X milliseconds
var VIEW_INTERVAL = 250;

function Ping() {
  if (!(this instanceof Ping)) return new Ping();
  this.pendingMessages = [];
}

var Message = require('../message'),
    Q       = require('q');

module.exports = Ping;


/** begin Protocol methods **/

Ping.prototype.init = function(stack, sender, receiver) {
  this.stack = stack;
  this.sender = sender;
  this.receiver = receiver;
};

Ping.prototype.start = function() {
  this.processorId = setInterval(this.processPendingMessages.bind(this), VIEW_INTERVAL);
  this.processorId.unref();
  this.sendDiscoverRequest();
  return Q();
};

Ping.prototype.stop = function() {
  clearInterval(this.processorId);
  this.pendingMessages = [];
};

Ping.prototype.send = function(message) {
  return this.sender(message);
};

Ping.prototype.receive = function(message) {
  switch(message.type) {
  case Message.FIND_MEMBERS:
    if (message.headers['members-request']) {
      this.sendDiscoverReply(message.source);
      // Add the member that just sent the request to our member list
      this.updateMembers(message);
    } else if (message.headers['members-response']) {
      this.updateMembers(message);
    }
    break;
  default:
    this.receiver(message);
  }
};

/** end Protocol methods **/

Ping.prototype.processPendingMessages = function() {
  var viewMsg = null;
  this.pendingMessages.forEach(function(message) {
    if (message.type === Message.VIEW_CHANGE) {
      // Only send the latest VIEW_CHANGE up the stack
      viewMsg = message;
    } else {
      this.receiver(message);
    }
  }.bind(this));
  if (viewMsg) {
    this.receiver(viewMsg);
  }
  this.pendingMessages = [];
};

Ping.prototype.sendDiscoverRequest = function() {
  var message = new Message({type: Message.FIND_MEMBERS});
  message.headers['members-request'] = true;
  this.sender(message);
};

Ping.prototype.sendDiscoverReply = function(destination) {
  var message = new Message({type: Message.FIND_MEMBERS,
                             destination: destination});
  message.headers['members-response'] = true;
  this.sender(message);
};

Ping.prototype.updateMembers = function(message) {
  var member = message.source;
  if (!this.stack.members[member]) {
    this.stack.members[member] = {};
    var viewMsg = new Message({type: Message.VIEW_CHANGE, body: this.stack.memberList()});
    this.pendingMessages.push(viewMsg);

    var memberMsg = new Message({type: Message.MEMBER_ADDED,
                                 body: [member, this.stack.memberList()]});
    this.pendingMessages.push(memberMsg);
  }
};
