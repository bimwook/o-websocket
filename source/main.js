const NET = require('net');
const CRYPTO = require('crypto');
const WEBSOCKET_UUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
-function(mo){
  let fn = {};
  fn.sha1 = function(data){
    return CRYPTO.createHash('sha1').update(data + WEBSOCKET_UUID).digest('base64');
  };
  fn.parser = {};
  fn.parser.header = function(data){
    let ret = {};
    let mc = data.match(/^[^:]*:.*$/mg)||[];
    for(let i=0; i<mc.length; i++){
      let mcc = (mc[i]||"").match(/^([^:]*):(.*)$/m);
      ret[(mcc[1]||"").trim()] = (mcc[2]||"").trim();
    }
    return ret;
  };
  fn.builder = {};
  fn.builder.header = function(data){
    let ret = [];
    let headers = fn.parser.header(data.toString());
    ret.push("HTTP/1.1 101 Switching Protocols");
    ret.push("Upgrade: WebSocket");
    ret.push("Connection: Upgrade");
    ret.push("Server: Woo-WebSocket-Server");
    ret.push("Date: " + (new Date()).toGMTString());
    ret.push("Sec-WebSocket-Version: 13");
    ret.push("Sec-WebSocket-Accept: " + fn.sha1(headers["Sec-WebSocket-Key"]));
    ret.push("\r\n");
    return ret.join('\r\n');
  };
  fn.builder.frame = function(data){
    var ret = {
      fin: 0x0,
      rsv1:0x0,
      rsv2:0x0,
      rsv3:0x0,
      opcode: 0x0000,
      masked: 0x0,
      size: 0x0000000,
      masking: [0,0,0,0],
      data: [] 
    };
    //Buffer.isBuffer(data)
    var d = data[0]||0;
    var l = data[1]||0;
    var start = 2;
    ret.fin = d>>7;
    ret.rsv1 = (d>>6) & 1; 
    ret.rsv2 = (d>>5) & 1; 
    ret.rsv3 = (d>>4) & 1;
    ret.opcode = d & 15;
    ret.masked = (l>>7);
    ret.size = l & 127;
    if(ret.size==126){
      ret.size = (data[2]<<8) | data[3];
      start+=2;
    }
    if(ret.size==127){
      ret.size = (data[2]<<56) | (data[3]<<48) | (data[4]<<40) | (data[5]<<32) | (data[6]<<24) | (data[7]<<16) |(data[8]<<8) | data[9];
      start+=8;
    }
    if(ret.masked){
      ret.masking = [data[start],data[start+1],data[start+2],data[start+3]];
      start+=4;
    }
    ret.data = data.slice(start);
    if(ret.masked){
      for(let i=0; i<ret.data.length; i++){
        ret.data[i] = ret.data[i]^ret.masking[i%4];
      }
    }
    return ret;
  };
  fn.builder.close = function(){
    return new Buffer([136,0]);
  };
  fn.builder.ping = function(){
    return new Buffer([137,0]);
  };
  fn.builder.pong = function(){
    return new Buffer([138,0]);
  };
  fn.builder.echo = function(data){
    var buffer = Buffer.from(data, 'utf8');
    var d = ( (buffer.length<126) ? buffer.length : ( (buffer.length<65535) ? 126:127 ));
    var isbin = false;
    var header = [isbin?130:129];
    header.push(d);
    if(d==126){
      var l = buffer.length;
      header.push( (l>>8) & 255 );
      header.push( l & 255 );
    }
    if(d==127){
      var l = buffer.length;
      header.push( (l>>56) & 255 );
      header.push( (l>>48) & 255 );
      header.push( (l>>40) & 255 );
      header.push( (l>>32) & 255 );
      header.push( (l>>24) & 255 );
      header.push( (l>>16) & 255 );
      header.push( (l>>8) & 255 );
      header.push( l & 255 );
    }
    
    return Buffer.concat([Buffer.from(header), buffer]);
  };

  fn.sockets = [];
  fn.server = NET.createServer();
  fn.server.on("connection",function(socket){
    console.log('CONNECTED: ' + socket.remoteAddress + ':' + socket.remotePort);
    let connected = false;      
    fn.sockets.push(socket);
    
    socket.on("data", function(data) {
      if(connected){
        var frame = fn.builder.frame(data);
        if(frame.fin==1){
          if((frame.opcode==1)||(frame.opcode==2)){
            if(typeof(mo.ondata)=="function"){
              mo.ondata(this, frame);
            }          
          }
          else if(frame.opcode==8){
            this.write(fn.builder.close());
          }
          else if(frame.opcode==9){
            this.write(fn.builder.pong());
          }
          else if(frame.opcode==10){
            //console.log("PONG");
          }
        }
        else {

        }
      }
      else{
        try{
          this.write(fn.builder.header(data||""));
          if(typeof(mo.onconnected)=="function"){
            mo.onconnected(this);
          }
          connected = true;          
        }
        catch(e){
          this.close();
          console.log(e);
        }
      }
    });
    //setTimeout(function(){
    //  socket.write(fn.builder.ping());
    //}, 5000);
    socket.on("error", function(e){
      fn.sockets.splice(fn.sockets.indexOf(this), 1);
      socket.destroy();
      console.log('Remove: ' +  this.remoteAddress + ' ' + this.remotePort);
    });

    socket.on("end", function() {
      fn.sockets.splice(fn.sockets.indexOf(this), 1);
      console.log('Remove: ' +  this.remoteAddress + ' ' + this.remotePort);
    });
    socket.once("close", function() {
      //fn.sockets.splice(fn.sockets.indexOf(this), 1);
      //console.log('Remove: ' +  this.remoteAddress + ' ' + this.remotePort);
    });
  });

  fn.server.on("close", function(){
    console.log("Connection Closed.");
  });

  fn.server.on("error", function(err){
    console.log(err.toString());
    if(err.code = 'EADDRINUSE'){
      process.exit(500);
    }
  });
  fn.server.on("clientError", function(err){
    console.log(err.toString());
  });

  process.on('exit', function(code) {
    console.log("Exit-Code:" + code);
  });
  process.on('SIGINT', function() {
    console.log("");
    if(typeof(mo.onclose)=="function"){
      mo.onclose();
    }
    fn.sockets.forEach(function(socket){
      socket.destroy();
    });
    fn.server.close(function(){
      console.log("Server closed!");
    });
  });

  mo.sockets = fn.sockets;  
  fn.server.listen(mo.port, mo.host);

  if(typeof(mo.start)=="function"){
    mo.start({
      send: function(socket, data){
        try{
          socket.write(fn.builder.echo(data));
        }
        catch(e){
          console.log(e);
        }
      }
    });
  }
  console.log('Server listening on ' + mo.host +':'+ mo.port);
}(
  {
    host: "0.0.0.0", 
    port: 11111,
    sender: null,
    sockets:[],
    timer: null,
    now: function(){
      let d = new Date();
      let ret = [];
      ret.push(d.getFullYear());
      ret.push("-");
      ret.push( ('00' + (d.getMonth()+1)).slice(-2) );
      ret.push("-");
      ret.push( ('00' + d.getDate()).slice(-2) );
      ret.push(" ");
      ret.push( ('00' + d.getHours()).slice(-2) );
      ret.push(":");
      ret.push( ('00' + d.getMinutes()).slice(-2) );
      ret.push(":");
      ret.push( ('00' + d.getSeconds()).slice(-2) );
      return ret.join('');
    },
    onconnected: function(socket){
      this.sender.send(socket, "HI:" + Math.random().toString(36));
    },
    ondata: function(socket, frame){
      var text = frame.data.toString();
      console.log(text);
      //this.sender.send(socket, "OK.");
    },
    onclose: function(){
      if(this.timer){
        clearInterval(this.timer);
        this.timer = null;
      }
    },
    start: function(sender){
      let me = this;
      let host = "https://www.bimwook.com:11180";
      this.sender = sender;
      this.timer = setInterval(function(){
        let text = 'message: demo';
        console.log("[%s] Active: %s", me.now(), me.sockets.length);
        for(let i=0; i<me.sockets.length; i++){
          let socket = me.sockets[i];
          try{
            sender.send(socket, text);
          }
          catch(e){
            console.log(e);
          }
        }
      }, 7e3);
    }
  }
);
