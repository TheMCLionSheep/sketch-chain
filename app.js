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

      if(size(game.players) >= 6 || true) {
        for(pl in game.players) {
          var tempSocket = SOCKET_LIST[pl];
          if(tempSocket != null) {
            for(tm in game.teams[game.players[pl].teamID].players) {
              tempSocket.emit("addTeamMember", game.players[tm].name);
            }
            tempSocket.emit("teamListActive", true);
          }
        }
      }
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
          if(size(game.players) >= 6 || true) {
            tempSocket.emit("teamListActive", true);
          }
        }
        if(phaseName == "guess") {
          tempSocket.emit("showDrawing",game.chains[game.teams[game.players[pl].teamID].curChain].chainLinks[game.roundNumber - 1], "guess");
          if(size(game.players) >= 6 || true) {
            tempSocket.emit("teamListActive", true);
          }
        }
        if(phaseName == "review") {
          tempSocket.emit("showResult",game.chains[game.teams[game.players[pl].teamID].curChain].chainLinks,(game.host == pl));
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
    for(var i in Player.list) {
      var tempSocket = SOCKET_LIST[i];
      if(tempSocket != null) {
        tempSocket.emit("joinGame",false,i,false);
        tempSocket.emit("restartGame");
        if(game.host == i) {
          tempSocket.emit("displayHost","none");
          tempSocket.emit("displayHost","normal");
        }
      }
      if(game.host == i) {
        Player.updateLobby("stopHost",Player.list[i]);
      }
      Player.updateLobby("blue",Player.list[i]);
    }
    lobbyDrawing = new Drawing();
    curGame = new Game([]);
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

var Team = function(id) {
  var team = {
    players: {},
    id: id,
    curChain: 0,
    finished: false
  }
  team.addPlayer = function(player) {
    team.players[player.id] = player;
  }
  return team;
}
Team.fillTeams = function(game) {
  var teamAmount;
  if(size(game.players) <= 5) {
    teamAmount = size(game.players);
  }
  else if(size(game.players) <= 15) {
    teamAmount = 3;
  }
  else if(size(game.players) <= 21) {
    teamAmount = 7;
  }
  else {
    teamAmount = 9;
  }
  var curTeamID = 0;

  //Create teams
  for(var i = 0; i < teamAmount; i++) {
    var newTeam = new Team(i);
    game.teams.push(newTeam);
  }

  for(var pl in game.players) {
    game.teams[curTeamID].addPlayer(game.players[pl]);
    game.players[pl].teamID = curTeamID;
    curTeamID++;
    if(curTeamID >= teamAmount) {
      curTeamID -= teamAmount;
    }
  }
}

var Player = function(id, name, color) {
  var self = {
    lastX:250,
    lastY:250,
    id: id,
    painting: false,
    teamID: 0,
    name: name,
    online: true,
    lobbyColor: color
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
    var player = Player(socket.id, name, HSLToRGB(Math.floor(Math.random()*360) ,100, Math.floor(Math.random()*60)+20));
  }

  socket.emit("joinGame",(curGame.host != -1),socket.id,(curGame.gamePhase != "notStarted"));
  socket.emit("showDrawing", lobbyDrawing, "lobby");

  if(returningPlayer) {
    player.online = true;
    Player.loadLobby(socket, true);
    socket.emit("displayHost","host");
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
        socket.emit("changeText", curLink.text, true);
      }
      else if(curGame.gamePhase == "draw") {
        socket.emit("gamePhase", "draw");
        socket.emit("showDrawing", curLink, "main");
        socket.emit("showPrompt",curGame.chains[chainID].chainLinks[curGame.roundNumber - 1]);
      }
      else if(curGame.gamePhase == "guess") {
        socket.emit("gamePhase", "guess");
        socket.emit("changeText",curLink.text, false);
        socket.emit("showDrawing",curGame.chains[chainID].chainLinks[curGame.roundNumber - 1], "guess");
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

  socket.on("forceSubmit", function() {
    if(player.id == curGame.host && curGame.gamePhase != "notStarted") {
      console.log("Host forced submittions");
      for(var i = 0; i < curGame.teams.length; i++) {
        if(curGame.roundNumber % 2 == 0 && curGame.chains[curGame.teams[i].curChain].chainLinks[curGame.roundNumber].text == "") {
          curGame.chains[curGame.teams[i].curChain].chainLinks[curGame.roundNumber].updateText("Unanswered Prompt");
        }
        //Set waiting for team
        for(var pl in curGame.teams[i].players) {
          var tempSocket = SOCKET_LIST[pl];
          if(tempSocket != null) {
            tempSocket.emit("gamePhase","waiting");
          }
          Player.updateLobby("green",curGame.players[pl]);
        }
        curGame.teams[i].finished = true;
      }
      curGame.checkFinished();
    }
  })

  socket.on("linePress", function(event, lobby) {
    if(curGame.gamePhase == "draw" || lobby) {
      if(event.state == true) {
        player.painting = true;
        player.lastX = event.x;
        player.lastY = event.y;
      }
      else if(event.state == false) {
        player.painting = false;
      }

      if(player.painting || event.size == 1000) {
        if(lobby) {
          var line = new Line(player.lastX, player.lastY, event.x, event.y, 10, player.lobbyColor, lobbyDrawing.lineList);
          player.updatePosition(event.x,event.y);
        }
        else if(event.size == 1000) {
          var chainID = curGame.teams[player.teamID].curChain;
          var line = new Line(250, 250, 250, 250, 1000, event.color, curGame.chains[chainID].chainLinks[curGame.roundNumber].lineList);
        }
        else {
          var chainID = curGame.teams[player.teamID].curChain;
          var line = new Line(player.lastX, player.lastY, event.x, event.y, event.size, event.color, curGame.chains[chainID].chainLinks[curGame.roundNumber].lineList);
          player.updatePosition(event.x,event.y);
        }

        if(lobby) {
          for(var pl in Player.list) {
            var tempSocket = SOCKET_LIST[pl];
            if(tempSocket != null) {
              tempSocket.emit("createLine",line,lobby);
            }
          }
        }
        else {
          //Adds line for all sockets in team
          for(var i in curGame.teams[player.teamID].players) {
            var tempSocket = SOCKET_LIST[i];
            if(tempSocket != null) {
              tempSocket.emit("createLine",line,lobby);
            }
          }
        }
      }
    }
  });

  socket.on("textChange", function(text) {
    if(curGame.gamePhase == "prompt" || curGame.gamePhase == "guess") {
      var chainID = curGame.teams[player.teamID].curChain;
      curGame.chains[chainID].chainLinks[curGame.roundNumber].updateText(text);

      //Adds text for all on team
      for(var i in curGame.teams[player.teamID].players) {
        var tempSocket = SOCKET_LIST[i];
        if(tempSocket != null) {
          tempSocket.emit("changeText",text,(curGame.roundNumber == 0));
        }
      }
    }
  });

  socket.on("promptSubmit", function() {
    console.log("Prompt Request from " + player.name);
    if(curGame.gamePhase == "prompt" || curGame.gamePhase == "guess") {
      //Set waiting for team
      for(var i in curGame.teams[player.teamID].players) {
        var tempSocket = SOCKET_LIST[i];
        if(tempSocket != null) {
          tempSocket.emit("gamePhase","waiting");
        }
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
        var tempSocket = SOCKET_LIST[i];
        if(tempSocket != null) {
          tempSocket.emit("gamePhase","waiting");
        }
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
            tempSocket.emit("reviewLink",packet,(curGame.host == i));
          }
        }
      }
    }
  });

  socket.on("startGame", function() {
    if(size(Player.list) >= 3 && curGame.host == socket.id) {
      curGame.startGame();
    }
    else {
      socket.emit("startError","There must be at least 3 players!");
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
      if(curGame.host == id) {
        curGame.host = -1;
        for(var pl in Player.list) {
          var tempSocket = SOCKET_LIST[pl];
          if(tempSocket != null) {
            tempSocket.emit("displayHost","normal");
          }
        }
      }
    }
    else {
      Player.updateLobby("gray", Player.list[id]);
      curGame.players[id].online = false;
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
      if(name.length > 10) {
        socket.emit("signInReject","*Max character length of 10!");
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

function HSLToRGB(h,s,l) {
  // Must be fractions of 1
  s /= 100;
  l /= 100;

  let c = (1 - Math.abs(2 * l - 1)) * s,
      x = c * (1 - Math.abs((h / 60) % 2 - 1)),
      m = l - c/2,
      r = 0,
      g = 0,
      b = 0;

  if (0 <= h && h < 60) {
    r = c; g = x; b = 0;
  } else if (60 <= h && h < 120) {
    r = x; g = c; b = 0;
  } else if (120 <= h && h < 180) {
    r = 0; g = c; b = x;
  } else if (180 <= h && h < 240) {
    r = 0; g = x; b = c;
  } else if (240 <= h && h < 300) {
    r = x; g = 0; b = c;
  } else if (300 <= h && h < 360) {
    r = c; g = 0; b = x;
  }
  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);

  return "rgb(" + r + "," + g + "," + b + ")";
}

var lobbyDrawing = new Drawing();

// setInterval(function() {
//
// },1000);
