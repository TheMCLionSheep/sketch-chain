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

var Game = function(playerList) {
  var game = {
    players: playerList,
    gamePhase: "notStarted",
    roundNumber: 0,
    chains: [],
    teams: [],
    host: -1
  }
  game.addPlayer = function(player) {
    game.players[player.id] = player;
  }
  game.startGame = function() {
    if(game.gamePhase == "notStarted") {
      console.log("Game has started!");
      game.gamePhase = "prompt";
      for(var i in Player.list) {
        game.addPlayer(Player.list[i]);
        var tempSocket = SOCKET_LIST[i];
        if(tempSocket != null) {
          tempSocket.emit("saveID", i);
          tempSocket.emit("gamePhase", "prompt");
        }
        Player.updateLobby("red",game.players[i]);
      }

      Team.fillTeams(this);
      Chain.createChains(this);
    }
  }
  game.startNewPhase = function(phaseName) {
    game.gamePhase = phaseName;
    if(phaseName == "draw") {
      for(var i = 0; i < game.chains.length; i++) {
        game.chains[i].addToChain(new Drawing());
      }
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
      if(tempSocket != null) {
        tempSocket.emit("gamePhase",phaseName);
        if(phaseName == "draw") {
          tempSocket.emit("showPrompt",game.chains[game.teams[game.players[pl].teamID].curChain].chainLinks[game.roundNumber - 1]);
        }
        if(phaseName == "guess") {
          tempSocket.emit("showDrawing",game.chains[game.teams[game.players[pl].teamID].curChain].chainLinks[game.roundNumber - 1], false);
        }
        if(phaseName == "review") {
          tempSocket.emit("showResult",game.chains[game.teams[game.players[pl].teamID].curChain].chainLinks);
        }
      }
      Player.updateLobby("red",game.players[pl]);
    }
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
    console.log("Round " + game.roundNumber + " finished!");
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
      var tempSocket = SOCKET_LIST[i];
      if(tempSocket != null) {
        tempSocket.emit("joinGame",false,i);
        tempSocket.emit("restartGame");
      }
      if(game.host == i) {
        Player.updateLobby("stopHost",game.players[i]);
      }
      Player.updateLobby("blue",game.players[i]);
    }
    curGame = new Game([Player.list]);
  }
  return game;
}
var curGame = new Game([]);

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

var Phrase = function(text = "") {
  var phrase = {
    text: text
  }
  phrase.updateText = function(string) {
    phrase.text = string;
  }
  return phrase;
}

var Drawing = function() {
  var drawing = {
    lineList: []
  }
  return drawing;
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
    name: name,
    online: true
  }
  self.updatePosition = function(x, y) {
    self.lastX = x;
    self.lastY = y;
  }
  Player.list[id] = self;
  return self;
}
Player.list = {};
Player.onConnect = function(socket, name, returningPlayer = false) {
  if(returningPlayer) {
    var player = Player.list[socket.id];
  }
  else {
    var player = Player(socket.id, name);
  }

  socket.emit("joinGame",(curGame.host != -1),socket.id);

  if(returningPlayer) {
    player.online = true;
    Player.loadLobby(socket, true);
    if(curGame.teams[player.teamID].finished) {
      socket.emit("gamePhase", "waiting");
      Player.updateLobby("green", player);
    }
    else {
      Player.updateLobby("red", player);
      var chainID = curGame.teams[player.teamID].curChain;
      var curLink = curGame.chains[chainID].chainLinks[curGame.roundNumber];
      if(curGame.gamePhase == "prompt") {
        socket.emit("gamePhase", "prompt");
        console.log("text: " + curLink.text);
        socket.emit("changeText", curLink.text, true);
      }
      else if(curGame.gamePhase == "draw") {
        console.log("chain: " + curLink.lineList);
        socket.emit("gamePhase", "draw");
        socket.emit("showDrawing", curLink, true);
        socket.emit("showPrompt",curGame.chains[chainID].chainLinks[curGame.roundNumber - 1]);
      }
      else if(curGame.gamePhase == "guess") {
        socket.emit("gamePhase", "guess");
        socket.emit("changeText",curLink.text, false);
        socket.emit("showDrawing",curGame.chains[chainID].chainLinks[curGame.roundNumber - 1], false);
      }
      else if(curGame.gamePhase == "review") {
        socket.emit("gamePhase", "review");
      }
    }
  }
  else {
    Player.loadLobby(socket, false);
    Player.updateLobby("add", player);
  }

  socket.on("becomeHost", function(become) {
    if(become) {
      curGame.host = socket.id;
      for(var pl in Player.list) {
        var tempSocket = SOCKET_LIST[pl];
        if(tempSocket != null) {
          tempSocket.emit("displayHost","none");
        }
      }
      Player.updateLobby("host",player);
      socket.emit("displayHost","host");
    }
    else {
      curGame.host = -1;
      socket.emit("displayHost","none");
      for(var pl in Player.list) {
        var tempSocket = SOCKET_LIST[pl];
        if(tempSocket != null) {
          tempSocket.emit("displayHost","normal");
        }
      }
      Player.updateLobby("stopHost",player);
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
        var chainID = curGame.teams[player.teamID].curChain;
        var line = new Line(player.lastX, player.lastY, event.x, event.y, event.size, event.color, curGame.chains[chainID].chainLinks[curGame.roundNumber].lineList);
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
    if(curGame.gamePhase == "prompt" || curGame.gamePhase == "guess") {
      var chainID = curGame.teams[player.teamID].curChain;
      curGame.chains[chainID].chainLinks[curGame.roundNumber].updateText(text);
      console.log("chain: " + chainID);

      //Adds text for all on team
      for(var i in curGame.teams[player.teamID].players) {
        var tempSoc = SOCKET_LIST[i];
        tempSoc.emit("changeText",text,(curGame.roundNumber == 0));
      }
    }
  });

  socket.on("promptSubmit", function() {
    console.log("Prompt Request from " + player.name);
    if(curGame.gamePhase == "prompt" || curGame.gamePhase == "guess") {
      //Set waiting for team
      for(var i in curGame.teams[player.teamID].players) {
        var tempSoc = SOCKET_LIST[i];
        tempSoc.emit("gamePhase","waiting");
        Player.updateLobby("green",curGame.players[i]);
      }

      curGame.teams[player.teamID].finished = true;
      curGame.checkFinished();
    }
  });

  socket.on("drawingSubmit", function() {
    console.log("Drawing Request from " + player.name);
    if(curGame.gamePhase == "draw") {
      //Set waiting for team
      for(var i in curGame.teams[player.teamID].players) {
        var tempSoc = SOCKET_LIST[i];
        tempSoc.emit("gamePhase","waiting");
        Player.updateLobby("green",curGame.players[i]);
      }

      curGame.teams[player.teamID].finished = true;
      curGame.checkFinished();
    }
  });

  socket.on("viewChains", function(link) {
    if(curGame.gamePhase == "review") {
      if(link.chainID >= curGame.chains.length) {
        curGame.endGame();
      }
      else {
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
          if(tempSocket != null) {
            tempSocket.emit("reviewLink",packet);
          }
        }
      }
    }
  });

  socket.on("startGame", function() {
    if(size(Player.list) >= 3 && curGame.host == socket.id) {
      curGame.startGame();
    }
  });
}
Player.loadLobby = function(socket, showSelf) {
  for(var pl in Player.list) {
    if(pl != socket.id || showSelf) {
      var pack = {
        add: "add",
        name: Player.list[pl].name
      };
      if(Player.list[pl].online) {
        socket.emit("playerLobby",pack);
        if(curGame.host == pl) {
          pack.add = "host";
          socket.emit("playerLobby",pack);
        }
        if(curGame.players[pl] != null) {
          if(curGame.teams[curGame.players[pl].teamID].finished) {
            pack.add = "green";
            socket.emit("playerLobby",pack);
          }
          else {
            pack.add = "red";
            socket.emit("playerLobby",pack);
          }
        }
      }
      else {
        pack.add = "gray";
        socket.emit("playerLobby",pack);
      }
    }
  }
}
Player.updateLobby = function(type, player) {
  var pack = {
    add: type,
    name: player.name
  };
  for(var pl in Player.list) {
    if(type == "remove" && player.id == pl) {
      continue;
    }
    var tempSocket = SOCKET_LIST[pl];
    if(tempSocket != null) {
      tempSocket.emit("playerLobby",pack);
    }
  }
}
Player.onDisconnect = function(id) {
  if(Player.list[id] != null) {
    console.log(Player.list[id].name + " left the game.");
    if(curGame.gamePhase == "notStarted") {
      Player.updateLobby("remove", Player.list[id]);
      delete Player.list[id];
      // if(curGame.host == id) {
      //   curGame.host = -1;
      //   for(var pl in Player.list) {
      //     var tempSocket = SOCKET_LIST[pl];
      //     if(tempSocket != null) {
      //       tempSocket.emit("displayHost","normal");
      //     }
      //   }
      // }
    }
    else {
      Player.updateLobby("gray", Player.list[id]);
      curGame.players[id].online = false;
      // for(var pl in curGame.teams[curGame.players[id].teamID].players) {
      //   if(curGame.players[pl].online) {
      //     continue;
      //   }
      //
      //   var chainID = curGame.teams[curGame.players[id].teamID].curChain;
      //   if(curGame.roundNumber >= 2) {
      //     curGame.chains[chainID].chainLinks[curGame.roundNumber] = curGame.chains[chainID].chainLinks[curGame.roundNumber-2];
      //   }
      //   else if(curGame.roundNumber == 0) {
      //     curGame.chains[chainID].chainLinks[curGame.roundNumber] = new Phrase("Prompt Not Entered");
      //   }
      //   else if(curGame.roundNumber == 1) {
      //     curGame.chains[chainID].chainLinks[curGame.roundNumber] = emptyImage;
      //   }
      //
      //   curGame.teams[curGame.players[id].teamID].finished = true;
      //   curGame.checkFinished();
      //
      //   console.log("Request from " + curGame.players[pl].name);
      //   break;
      // }
    }
  }
}

var Line = function(startX, startY, endX, endY, radius, color, list) {
  var line = {
    startX: startX,
    startY: startY,
    endX: endX,
    endY: endY,
    radius: radius,
    color: color
  }
  list.push(line);
  return line;
}

var io = require("socket.io") (serv,{});
io.sockets.on("connection", function(socket) {
  socket.on("login", function(savedID) {
    if(savedID != null && Player.list[savedID] != null) {
      socket.emit("rejoinPopup");
    }
    else {
      socket.id = Math.random();
      SOCKET_LIST[socket.id] = socket;
    }

    socket.on("rejoinGame", function() {
      socket.id = savedID;
      SOCKET_LIST[socket.id] = socket;
      Player.onConnect(socket, Player.list[savedID].name, true);
      console.log(Player.list[savedID].name + " rejoined the game.");
    });

    socket.on("deleteAccount", function(id) {
      Player.onDisconnect(id);
    })

    socket.on("signInRequest", function(name) {
      if(name.length > 20) {
        socket.emit("signInReject","*Max character length of 20!");
      }
      else {
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
            console.log(name + " joined the game.");
          }
          else {
            socket.emit("signInReject","*Name is already taken!");
          }
        }
        else{
          socket.emit("signInReject","*Only use letters and numbers!");
        }
      }
    })

    socket.on("disconnect",function() {
      delete SOCKET_LIST[socket.id];
      Player.onDisconnect(socket.id);
    });
  });
});

function size(obj) {
  var size = 0;
  for(var key in obj) {
    size++;
  }
  return size;
}

// setInterval(function() {
//
// },1000);
