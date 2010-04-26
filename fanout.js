/*
 * fanout.js
 * a fanout messaging server for node.js
 * by @jazzychad - Chad Etzel
 * MIT Licensed
 */

var tcp = require("net"),
    sys = require("sys");

// The .bind method from Prototype.js 
Function.prototype.bind = function(){ 
  var fn = this, args = Array.prototype.slice.call(arguments), object = args.shift(); 
  return function(){ 
    return fn.apply(object, 
                    args.concat(Array.prototype.slice.call(arguments))); 
  }; 
};

Array.prototype.remove = function(e) {
  for(var i = 0; i < this.length; i++)
    if(e == this[i]) this.splice(i, 1);
};

// Array Remove - By John Resig (MIT Licensed)
Array.remove = function(array, from, to) {
  var rest = array.slice((to || from) + 1 || array.length);
  array.length = from < 0 ? array.length + from : from;
  return array.push.apply(array, rest);
};

var msgEmitter = new process.EventEmitter();

var handleMessage = function handleMessage(conn, socket, data) {
  sys.puts('[' + conn.name + ']' + ' data: ' + data);
  if (data == "time") {
    socket.write(Date.now() + "\n");
  }
  if (data.indexOf("subscribe ") == 0) {
    conn.addchannel(data.split(' ')[1]);
    conn.subscribe();
  } else if (data.indexOf("unsubscribe ") == 0) {
    conn.removechannel(data.split(' ')[1]);
    /* update subscriptions by calling subscribe */
    conn.subscribe();
  }
};

var handleControllerMessage = function handleControllerMessage(socket, channel, data) {
  msgEmitter.emit(channel, channel, data);
};

function Client(connection) {
  this.socket = connection;
  this.name = null;
  this.timer = null;
  this.channels = [];
  this.listeners = [];

}

/* adds channel. must use "subscribe" to take effect */
Client.prototype.addchannel = function(channel) {
  sys.puts('adding sub: ' + channel);

  this.removechannel(channel);
  this.channels.push(channel);
};

/* removes channel. also removes associated listener immediately */
Client.prototype.removechannel = function(channel) {
  //sys.puts('removing sub');
  
  /* remove channel if it exists */
  this.channels.remove(channel);
  
  /* remove listener */
  var listener = this.listeners[channel];
  
  if (listener) {
    msgEmitter.removeListener(channel, listener);
  }
  
};

Client.prototype.subscribe = function() {
  
  sys.puts('subs:' + JSON.stringify(this.channels));
  this.channels.forEach(function(channel) {
      var listener = this.listeners[channel];
        
      if (listener) {
        msgEmitter.removeListener(channel, listener);
      }
    }.bind(this));
  this.listeners = [];
  this.channels.forEach(function(channel) {
      var listener = function(c, msg) {
        this.socket.write(c + "!" + msg + "\n");
      }.bind(this);
      this.listeners[channel] = listener;
      msgEmitter.addListener(channel, listener);
    }.bind(this));
};

Client.prototype.deconstruct = function() {
  this.channels.forEach(function(channel) {
      var listener = this.listeners[channel];
      if (listener) {
        msgEmitter.removeListener(channel, listener);
      }
    }.bind(this));
};

var connections = [];
var cnt = 0;

var server = tcp.createServer(function(socket) {
    var conn = new Client(socket);
    connections.push(conn);
    conn.name = ++cnt;
    socket.setTimeout(0);
    socket.setNoDelay();
    socket.setEncoding("utf8");

    sys.puts("client connected!");
    conn.addchannel("all");
    conn.subscribe();


    socket.addListener("connect", function() {
        socket.write("debug!connected...\n");
      });

    socket.addListener("data", function(data) {
        //sys.puts('raw data ' + data);
        var dataarr = data.split("\n");
        var l = dataarr.length;
        for (var jj = 0; jj < dataarr.length-1; jj++) {
          var dataline = dataarr[jj];
          handleMessage(conn, socket, dataline);
        }
      });
    socket.addListener("eof", function() {
        socket.close();
      });

    socket.addListener("end", function() {
        /* unsubscribe from all here (remove all listeners) */
        conn.deconstruct();
        connections.remove(conn);
        conn = null;
        sys.puts("Client connection closed.");
      });

  });

var controller = tcp.createServer(function(socket) {
    sys.puts("Controller connected");
    socket.setTimeout(0);
    socket.setEncoding("ascii");
    socket.setNoDelay();

    socket.addListener("eof", function() {
        socket.close();
      });

    socket.addListener("end", function() {
        sys.puts("Controller closed.");
      });


    socket.addListener("data", function(data) {
        sys.puts('raw data: ' + data);
        var dataarr = data.split("\n");
        var l = dataarr.length;
        for (var jj = 0; jj < dataarr.length-1; jj++) {
          var dataline = dataarr[jj];
          var i = dataline.indexOf(' ');
          var channel = dataline.slice(0,i);
          var msg = dataline.slice(i+1);
          handleControllerMessage(socket, channel, msg);
        }
      });
  });

var client_port = 8880;
var controller_port = 8890;

server.listen(client_port);
controller.listen(controller_port);