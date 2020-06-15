//node app.js

//heroku login
//git add .
//git commit -am "Make it better"
//git push heroku master
//heroku logs

var express = require("express");
var app = express();
var serv = require("http").Server(app);

app.get("/",function(req, res) {
  res.sendFile(__dirname + "/client/index.html");
});
app.use("/client",express.static(__dirname + "/client"));

serv.listen(process.env.PORT || 2000);
console.log("Server Started.");

var SOCKET_LIST = {};

var Game = function(playerList, timeLeft) {
  var game = {
    players: playerList,
    gamePhase: "notStarted",
    roundNumber: 0,
    timeEnd: (new Date().getTime()) + timeLeft*1000,
    mins: 0,
    secs: 0,
    chains: [],
    teams: [],
    host: -1
  }
  game.updateTime = function() {
    var timeLeft = game.timeEnd - (new Date().getTime());
    game.mins = Math.floor((timeLeft % (1000 * 60 * 60))/(1000 * 60));
    game.secs = Math.floor((timeLeft % (1000 * 60))/1000);

    return (game.mins >= 0 && game.secs >= 0);
  }
  game.addPlayer = function(player) {
    game.players[player.id] = player;
  }
  game.startGame = function() {
    if(game.gamePhase == "notStarted") {
      game.gamePhase = "prompt";
      game.addTime(10);
      for(var i in Player.list) {
        game.addPlayer(Player.list[i]);
        var tempSocket = SOCKET_LIST[i];
        tempSocket.emit("gamePhase", "prompt");
      }

      Team.fillTeams(this);
      Chain.createChains(this);
    }
  }
  game.startNewPhase = function(phaseName) {
    game.gamePhase = phaseName;
    if(phaseName == "draw") {
      for(var i = 0; i < game.chains.length; i++) {
        game.chains[i].addToChain(null);
      }
      game.addTime(3*60);
    }
    else if(phaseName == "guess") {
      for(var i = 0; i < game.chains.length; i++) {
        game.chains[i].addToChain(new Phrase());
      }
    }

    //Set unfinished and new chain
    for(var i = 0; i < game.teams.length; i++) {
      game.teams[i].finished = false;
      game.teams[i].curChain++;
      if(game.teams[i].curChain >= game.teams.length) {
        game.teams[i].curChain -= game.teams.length;
      }
    }

    //Set new phase for players
    for(var pl in game.players) {
      var tempSocket = SOCKET_LIST[pl];
      tempSocket.emit("gamePhase",phaseName);
      if(phaseName == "draw") {
        tempSocket.emit("showPrompt",game.chains[game.teams[game.players[pl].teamID].curChain].chainLinks[game.roundNumber - 1]);
      }
      if(phaseName == "guess") {
        tempSocket.emit("showDrawing",game.chains[game.teams[game.players[pl].teamID].curChain].chainLinks[game.roundNumber - 1]);
      }
      if(phaseName == "review") {
        tempSocket.emit("showResult",game.chains[game.teams[game.players[pl].teamID].curChain].chainLinks);
      }
    }
  }
  game.addTime = function(time) {
    game.timeEnd = (new Date().getTime()) + time*1000
  }
  game.checkFinished = function() {
    for(var i = 0; i < game.teams.length; i++) {
      if(!game.teams[i].finished) {
        return;
      }
    }
    game.finishRound();
  }
  game.finishRound = function() {
    game.roundNumber++;
    if(game.roundNumber >= game.chains.length) {
      game.startNewPhase("review");
    }
    else if(game.roundNumber > 0 && game.roundNumber%2 == 1) {
      game.startNewPhase("draw");
    }
    else if(game.roundNumber > 0 && game.roundNumber%2 == 0) {
      game.startNewPhase("guess");
    }
  }
  game.endGame = function() {
    for(var i in game.players) {
      var tempSocket = SOCKET_LIST[i]
      tempSocket.emit("joinGame",true);
      tempSocket.emit("restartGame");
    }
    curGame = new Game([], 0);
  }
  return game;
}
var curGame = new Game([], 0);

var Chain = function(id) {
  var chain = {
    id: id,
    chainLinks: []
  }
  chain.addToChain = function(link) {
    chain.chainLinks.push(link);
  }
  return chain;
}
Chain.createChains = function(game) {
  for(var i = 0; i < game.teams.length; i++) {
    var newChain = new Chain(i);
    game.chains.push(newChain);
    game.teams[i].curChain = i;

    newChain.addToChain(new Phrase());
  }
}

var Drawing = function() {
  var drawing = {
    lineList: []
  }
  return drawing;
}

var Phrase = function() {
  var phrase = {
    text: ""
  }
  phrase.updateText = function(string) {
    phrase.text = string;
  }
  return phrase;
}

var Team = function(playerList, id) {
  var team = {
    players: playerList,
    id: id,
    curChain: 0,
    finished: false
  }
  return team;
}
Team.fillTeams = function(game) {
  for(var i in game.players) {
    var players = {};
    players[i] = game.players[i];
    var newTeam = new Team(players, game.teams.length);
    game.players[i].teamID = game.teams.length;
    game.teams.push(newTeam);
  }
  // var players = Player.list;
  // var newTeam = new Team(players, game.teams.length);
  // for(var i in Player.list) {
  //   Player.list[i].teamID = game.teams.length;
  // }
  // game.teams.push(newTeam);
}

var Player = function(id, name) {
  var self = {
    lastX:250,
    lastY:250,
    id: id,
    painting: false,
    teamID: 0,
    name: name
  }
  self.updatePosition = function(x, y) {
    self.lastX = x;
    self.lastY = y;
  }
  Player.list[id] = self;
  return self;
}
Player.list = {};
Player.onConnect = function(socket, name) {
  var player = Player(socket.id, name);

  socket.emit("joinGame",(curGame.host != -1));
  for(var pl in Player.list) {
    var pack = {
      add: true,
      name: Player.list[pl].name
    }
    if(pl == player.id) {
      continue;
    }
    socket.emit("playerLobby",pack);
  }
  Player.updateLobby(true, player);

  // if(curGame.gamePhase == "draw") {
  //   //Load canvas
  //   for(var i in curGame.chains[curGame.teams[player.teamID].curChain].chainLinks[curGame.roundNumber]) {
  //     var drawLine = curGame.chains[curGame.teams[player.teamID].curChain].chainLinks[curGame.roundNumber][i];
  //     socket.emit("createLine",drawLine);
  //   }
  // }

  socket.on("becomeHost", function(become) {
    if(become) {
      curGame.host = socket.id;
      for(var pl in Player.list) {
        var tempSocket = SOCKET_LIST[pl];
        tempSocket.emit("displayHost","none");
      }
      socket.emit("displayHost","host");
    }
    else {
      curGame.host = -1;
      socket.emit("displayHost","none");
      for(var pl in Player.list) {
        var tempSocket = SOCKET_LIST[pl];
        tempSocket.emit("displayHost","normal");
      }
    }
  })

  socket.on("linePress", function(event) {
    if(curGame.gamePhase == "draw") {
      if(event.state == true) {
        player.painting = true;
        player.lastX = event.x;
        player.lastY = event.y;
      }
      else if(event.state == false) {
        player.painting = false;
      }

      if(player.painting) {
        // var chainID = curGame.teams[player.teamID].curChain;
        // var line = new Line(player.lastX, player.lastY, event.x, event.y, event.size, event.color, curGame.chains[chainID].chainLinks[curGame.roundNumber]);
        var line = new Line(player.lastX, player.lastY, event.x, event.y, event.size, event.color);
        player.updatePosition(event.x,event.y);

        //Adds line for all sockets in team
        for(var i in curGame.teams[player.teamID].players) {
          var tempSoc = SOCKET_LIST[i];
          tempSoc.emit("createLine",line);
        }
      }
    }
  });

  socket.on("textChange", function(text) {
    //Adds text for all on team
    for(var i in curGame.teams[player.teamID].players) {
      var tempSoc = SOCKET_LIST[i];
      tempSoc.emit("changeText",text);
    }
  });

  socket.on("promptSubmit", function(text) {
    console.log("Prompt Request from " + player.name);
    if(curGame.gamePhase == "prompt" || curGame.gamePhase == "guess") {
      var chainID = curGame.teams[player.teamID].curChain;
      curGame.chains[chainID].chainLinks[curGame.roundNumber].updateText(text);

      //Set waiting for team
      for(var i in curGame.teams[player.teamID].players) {
        var tempSoc = SOCKET_LIST[i];
        tempSoc.emit("gamePhase","waiting");
      }

      curGame.teams[player.teamID].finished = true;
      curGame.checkFinished();
    }
  });

  socket.on("drawingSubmit", function(drawingImg) {
    console.log("Drawing Request from " + player.name);
    if(curGame.gamePhase == "draw") {
      //Set waiting for team
      for(var i in curGame.teams[player.teamID].players) {
        var tempSoc = SOCKET_LIST[i];
        tempSoc.emit("gamePhase","waiting");
      }
      // var chainID = curGame.teams[player.teamID].curChain;
      // curGame.chains[chainID].chainLinks[curGame.roundNumber] = drawingImg;
      //
      // curGame.teams[player.teamID].finished = true;
      // curGame.checkFinished();
    }
  });

  socket.on("viewChains", function(link) {
    if(curGame.gamePhase == "review") {
      if(link.chainID >= curGame.chains.length) {
        curGame.endGame();
      }
      for(var i in curGame.players) {
        var packet = {
          link: curGame.chains[link.chainID].chainLinks[link.linkID],
          type: (link.linkID % 2 == 0 ? "text" : "drawing"),
          nextChain: link.chainID,
          nextLink: link.linkID
        };
        packet.nextLink++;
        if(packet.nextLink >= curGame.chains[link.chainID].chainLinks.length) {
          packet.nextChain++;
          packet.nextLink = 0;
        }
        var tempSocket = SOCKET_LIST[i];
        tempSocket.emit("reviewLink",packet);
      }
    }
  });

  socket.on("startGame", function() {
    if(size(Player.list) >= 3) {
      curGame.startGame();
    }
  });
}
Player.updateLobby = function(add, player) {
  var pack = {
    add: add,
    name: player.name
  };
  for(var pl in Player.list) {
    if(!add && player.id == pl) {
      continue;
    }
    var tempSocket = SOCKET_LIST[pl];
    tempSocket.emit("playerLobby",pack);
  }
}
Player.onDisconnect = function(socket) {
  if(Player.list[socket.id] != null) {
    console.log(Player.list[socket.id].name + " left the game.");
    if(curGame.gamePhase == "notStarted") {
      Player.updateLobby(false, Player.list[socket.id]);
    }
    if(curGame.gamePhase != "notStarted") {
      delete curGame.players[socket.id];
    }
    delete Player.list[socket.id];
    if(curGame.host == socket.id) {
      curGame.host = -1;
      for(var pl in Player.list) {
        var tempSocket = SOCKET_LIST[pl];
        tempSocket.emit("displayHost","normal")
      }
    }
  }
}

var Line = function(startX, startY, endX, endY, radius, color) {
  var line = {
    startX: startX,
    startY: startY,
    endX: endX,
    endY: endY,
    radius: radius,
    color: color
  }
  return line;
}

var io = require("socket.io") (serv,{});
io.sockets.on("connection", function(socket) {
  socket.id = Math.random();
  SOCKET_LIST[socket.id] = socket;

  socket.on("signInRequest", function(name) {
    var letterNumber = /^[0-9a-zA-Z]+$/;
    if(name.match(letterNumber)) {
      var isValid = true;
      for(var pl in Player.list) {
        if(Player.list[pl].name == name) {
          isValid = false;
        }
      }
      if(isValid) {
        Player.onConnect(socket, name);
      }
      else {
        socket.emit("signInReject","*Name is already taken!");
      }
    }
    else{
      socket.emit("signInReject","*Only use letters and numbers!");
    }
  })

  socket.on("disconnect",function() {
    delete SOCKET_LIST[socket.id];
    Player.onDisconnect(socket);
  });
});

function size(obj) {
  var size = 0;
  for(var key in obj) {
    size++;
  }
  return size;
}

setInterval(function() {
  if(curGame.gamePhase == "draw") {
    if(curGame.updateTime()) {
      //Updates time for all sockets
      for(var i in SOCKET_LIST) {
        var socket = SOCKET_LIST[i];
        socket.emit("updateTime",curGame);
      }
    }
    else {
      curGame.finishRound();
    }
  }
  if(curGame.gamePhase != "notStarted") {
    curGame.checkFinished();
  }

  var packet = [];

},1000/25);
