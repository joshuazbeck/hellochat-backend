const express = require("express");
const app = express();
const http = require("http");
const sqlite3 = require("sqlite3").verbose();

const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

var bodyParser = require("body-parser");
app.use(bodyParser.json());

const baseAPI = "/chatapi/v1";

let db = new sqlite3.Database(":memory:", (err) => {
  console.log("Connected to the in-memory SQlite database.");
});

// Create the temporary SQlite table
db.serialize(() => {
  db.run(`CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text VARCHAR CHARACTER,
    session_id INT
  )`);

  db.run(`CREATE TABLE sessions (
    session_id INTEGER PRIMARY KEY AUTOINCREMENT,
    color_hex VARCHAR(6),
    name VARCHAR CHARACTER,
    socket_id VARCHAR(255)
  )`);
});

// Listen on port 3000
server.listen(3000, () => {
  console.log("listening on *:3000");
});

const messageRoom = "send_message";
const sessionRoom = "add_session";

// Get a message by ID
app.post(baseAPI + "/message/get", (req, res) => {
  console.log("Entering '/message/get'");
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

// Get all the messages
app.get(baseAPI + "/message/list", (req, res) => {
  console.log("Entering '/message/list'");

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

// Post a message
app.post(baseAPI + "/message/post", (req, res) => {
  console.log("Entering '/message/post'");

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
      io.emit(messageRoom, response.id);
      res.json({ code: 200 });
    } else {
      res.json({ code: 401, error: response.error });
    }
  });
});

// Get a sessoin by ID
app.post(baseAPI + "/session/get", (req, res) => {
  console.log("Entering '/session/get'");

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

app.get(baseAPI + "/session/active", (req, res) => {
  console.log("Entering '/session/active'");

  res.json({ code: 200, socket_ids: io.of("/v1").sockets });
});

// Generate the session
app.post(baseAPI + "/session/generate", (req, res) => {
  console.log("Entering '/session/generate'");

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

// Connect to the socket
io.on("connection", (socket) => {
  // On capturing a session id, attach the socket to the session id specified
  socket.on(sessionRoom, (session_id) => {
    if (session_id) {
      attachToSession(socket.id, session_id, (response) => {
        if (response.error) {
          console.log("There was an error: " + response.error);
        } else {
          io.emit(sessionRoom, session_id);
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

// Helper methods ------>

function getSession(session_id, callback) {
  console.log("Checking session_id" + session_id);
  var sql = db.prepare("SELECT * FROM sessions WHERE session_id=?");
  sql.get([session_id], (err, row) => {
    console.log("Checking session_id" + session_id + " " + row + " " + err);
    if (err) {
      callback({ code: 403, error: err });
    } else if (row) {
      callback({
        code: 200,
        session: {
          session_id: row.session_id,
          name: row.name,
          color_hex: row.color_hex,
          socket_id: row.socket_id,
        },
      });
    } else {
      callback({ code: 403, error: "Unable to get from the DB" });
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
    "UPDATE sessions SET socket_id=? WHERE session_id = ?",
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
    "INSERT INTO sessions (name, color_hex) VALUES (?, ?)",
    name,
    colorHex,
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
    console.log("Saving the message");
    db.run(
      "INSERT INTO messages (text, session_id) VALUES (?, ?)",
      message,
      sessionId,
      function (err) {
        if (err) {
          console.log("There was an error: " + err);
          callback({ error: err });
        } else {
          console.log("We got the is of the message ${this.lastID}");
          callback({ id: this.lastID });
        }
      }
    );
  } catch (ex) {
    console.log("WE HAD AN ERROR ON INSERTMESSAGE: " + ex);
    callback({ error: ex });
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
        message: { id: row.id, text: row.text, session_id: row.session_id },
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
        session_id: row.session_id,
      });
    });
    callback({ messages: messages });
  });
}

function getCurrentUsers() {}
