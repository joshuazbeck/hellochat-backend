const express = require("express");
const app = express();
const http = require("http");
const sqlite3 = require("sqlite3").verbose();

const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

var bodyParser = require("body-parser");

app.use(bodyParser.json());

let db = new sqlite3.Database(":memory:", (err) => {
  // if (err) {
  //   return console.error(err.message);
  // }
  console.log("Connected to the in-memory SQlite database.");
});

db.serialize(() => {
  db.run(`CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text VARCHAR CHARACTER,
    session_id INT
  )`);

  db.run(`CREATE TABLE sessions (
    session_id INTEGER PRIMARY KEY AUTOINCREMENT,
    color_hex VARCHAR(6),
    name VARCHAR CHARACTER
    socket_id VARCHAR(255)
  )`);
});

server.listen(3000, () => {
  console.log("listening on *:3000");
});

const messageRoom = "send_message";
const typingRoom = "typing";
const sessionRoom = "add_session";

app.get("/message/get", (req, res) => {
  const { id } = req.body;
  if (id == null) {
    res.json({ code: 403, error: "No id field" });
    return;
  }
  getMessage(id, (response) => {
    if (response.code == 200) {
      res.json({ code: 200, message: response.message });
    } else {
      res.json({ code: 401, error: response.error });
    }
  });
});
app.get("/message/list", (req, res) => {
  getMessages((results) => {
    if (results.error) {
      res.json({ code: 401, error: results.error });
    } else if (results.messages) {
      res.json({ code: 200, messages: results.messages });
    } else {
      res.json({ code: 401 });
    }
  });
});
app.post("/message/post", (req, res) => {
  const { text, sessionId } = req.body;

  if (text == null) {
    res.json({ code: 403, error: "No message field" });
    return;
  }
  if (sessionId == null) {
    res.json({ code: 403, error: "No userId field" });
    return;
  }

  saveMessage(text, sessionId, (response) => {
    if (response.id) {
      // Emit to socket IO
      io.emit(messageRoom, response.id);
      res.json({ code: 200 });
    } else {
      res.json({ code: 401, error: response.error });
    }
  });
});

app.get("/session/get", (req, res) => {
  const { id } = req.body;
  if (id == null) {
    res.json({ code: 403, error: "No id field" });
    return;
  }
  getSession(id, (response) => {
    if (response.code == 200) {
      res.json({ code: 200, session: response.session });
    } else {
      res.json({ code: 401, error: response.error });
    }
  });
});
app.get("/session/active", (req, res) => {
  res.json({ code: 200, socket_ids: io.of("/v1").sockets });
});
app.get("/session/generate", (req, res) => {
  const { name, colorHex } = req.body;
  if (name == null) {
    res.json({ code: 403, error: "No name field" });
    return;
  }
  if (colorHex == null) {
    res.json({ code: 403, error: "No colorHex field" });
    return;
  }
  generateSession(name, colorHex, (response) => {
    if (response.id) {
      res.json({ code: 200, id: response.id });
    } else {
      res.json({ code: 401, error: response.error });
    }
  });
});
io.of("/v1").on("connection", (socket, data) => {
  // Send a notification to the user room that another user joined
  socket.on(sessionRoom, (session_id) => {
    if (username) {
      attachToSession(socket.id, session_id, (response) => {
        if (response.error) {
          console.log("There was an error: " + response.error);
        } else {
          console.log(
            "We attched the socket ID: " +
              socket.id +
              " to the session ID: " +
              data.sessionId
          );
          io.emit(userRoom, data.sessionId);
          // Recieve from the message room
        }
      });
    } else {
      console.log("A username was not provided");
    }
  });

  socket.on(messageRoom, (msg) => {
    io.emit(messageRoom, msg);
  });
});

// CREATE SOCKET CHANNELS TO:

// RECIEVE TYPING FROM USER ID AND BROADCAST (DISPLAY AND SEND EVERY ONE SECOND ON FRONT END)
// ON DISCONNECT, REMOVE USERS STATUS (PROBABLY NOT NECESSARY AS THE ACTIVE VARIABLE ONLY CHANGES THEF RONT END)

function getSession(session_id, callback) {
  var sql = db.prepare("SELECT * FROM sessions WHERE session_id=?");
  sql.get([session_id], (err, row) => {
    if (err) {
      callback({ code: 403, error: err });
    } else if (row) {
      callback({
        code: 200,
        session: {
          session_id: row.session_id,
          name: row.name,
          colorHex: row.color_hex,
          socket_id: row.socket_id,
        },
      });
    } else {
      callback({ code: 200, message: null });
    }
  });
}

// Might be unnecessary
function getSessionBySocketID(socket_id, callback) {
  var sql = db.prepare("SELECT * FROM sessions WHERE socket_id=?");
  sql.get([socket_id], (err, row) => {
    if (err) {
      callback({ code: 403, error: err });
    } else if (row) {
      callback({
        code: 200,
        session: {
          session_id: row.session_id,
          name: row.name,
          colorHex: row.color_hex,
          socket_id: row.socket_id,
        },
      });
    } else {
      callback({ code: 200, message: null });
    }
  });
}

function attachToSession(socketId, sessionId, callback) {
  db.run(
    "UPDATE sessions SET socket_id = ? WHERE sessionId = ?",
    [socketId, sessionId],
    function (err) {
      if (err) {
        callback({ error: err });
      } else {
        callback({ success: true });
      }
    }
  );
}

function generateSession(name, colorHex, callback) {
  db.run(
    "INSERT INTO sessions (color_hex, name) VALUES (?, ?)",
    colorHex,
    name,
    function (err) {
      if (err) {
        callback({ error: err });
      } else {
        callback({ id: this.lastID });
      }
    }
  );
}

function saveMessage(message, sessionId, callback) {
  try {
    db.run(
      "INSERT INTO messages (text, session_id) VALUES (?, ?)",
      message,
      sessionId,
      hexColor,
      function (err) {
        if (err) {
          callback({ error: err });
        } else {
          callback({ id: this.lastID });
        }
      }
    );
  } catch (ex) {
    callback({ error: err });
  }
}

function getMessage(id, callback) {
  var sql = db.prepare("SELECT * FROM messages WHERE id=?");
  sql.get([id], (err, row) => {
    if (err) {
      callback({ code: 403, error: err });
    } else if (row) {
      callback({
        code: 200,
        message: { id: row.id, text: row.text },
      });
    } else {
      callback({ code: 200, message: null });
    }
  });
}

function getMessages(callback) {
  let sql = `SELECT DISTINCT * FROM messages ORDER BY id`;

  let messages = [];
  db.all(sql, [], (err, rows) => {
    if (err) {
      callback({ error: err });
    }
    rows.forEach((row) => {
      messages.push({
        id: row.id,
        text: row.text,
        color: row.color_hex,
        userId: row.user_session_id,
      });
    });
    callback({ messages: messages });
  });
}

function getCurrentUsers() {}
// // Connect to the MESSAGE SOCKET

//   // Recieve a typing notification
//   socket.on(typingRoom, (typing) => {
//     console.log("TYPING " + typing);
//     io.emit(typingRoom, msg);
//   });

//   socket.on("disconnect", () => {
//     console.log("user disconnected");
//   });
// });

// io.on(messageRoom, (socket) => {
//   console.log(socket);
// });

// // Get the number of connected users
// app.get("/user_count", (req, res) => {
//   const count2 = io.of("/").sockets.size;
//   res.status(200).json(count2);
// });

// // Send a message
// app.get("/send", (req, res) => {
//   var message = {
//     msg: "hello",
//     time: "now",
//     color: "red",
//   };
// });

// app.get("/broadcast", (req, res) => {});
// // var room = io.sockets.adapter.rooms['my_room'];
// // room.length;

// //io.sockets.adapter.rooms[room].length;

// // API send a message (msg, time, color) (backend is socket)
// // Connect to the message socket
// // Send a notification that the user is typing
// // Get all previous messages

// // Create a API endpoint that gets all the collected users
// // Create a connected socket that captures user + color connect + disconnect

// // user session
// // message with id

// Have to have a username to create a new session (will create duplicates)
// Need to have a session id to create a new message
// We read only the active sessions (the users are persistant)

// POST to get a session ID

// Workflow

// Generate a sessionID

// Emit it to the session room to connect the socketId and provide the session_id as data

// Send future messages through the API with the sessionID

// View all active socketIDs to see active users
// Search based off of the table to get color, name, etc.

// Get individual users based on the session ID to render chat images

// Get message color based off of the session ID
