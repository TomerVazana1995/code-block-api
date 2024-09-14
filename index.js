require('dotenv').config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const pg = require("pg");

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const PORT = process.env.PORT || 5000;

const app = express();
app.use(cors());

let users = {};
let usersInRoom = 0;
let studentsInRoom = 0;

const expressServer = http.createServer(app);

app.get("/:id", async (req, res) => {
  const {id} = req.params;
  try {
    const result = await pool.query("SELECT * FROM code_block WHERE title = $1", [id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  } 
});

const io = new Server(expressServer, {
  cors: {
    origin: "http://localhost:4173",
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// connect the user 
io.on("connection", (socket) => {
  // join user to the room and check if it is a mentor or student
  console.log("new client connected", socket.id);

  socket.on("joinRoom", async ({ codeBlockId }) => {
    socket.join(codeBlockId);
    usersInRoom = io.sockets.adapter.rooms.get(codeBlockId)?.size || 0;
    if (usersInRoom > 1) {
      studentsInRoom = usersInRoom - 1;
    }
    if (!users[codeBlockId]) {
      users[codeBlockId] = socket.id;
      socket.emit("role", "mentor");
    } else {
      socket.emit("role", "student");
      io.to(codeBlockId).emit("numberOfStudents", studentsInRoom);
    }
  });

  // broadcast code update to all the users
  socket.on("codeUpdate", (code) => {
    const room = Array.from(socket.rooms)[1];
    console.log(room)
    io.to(room).emit("updateCode", code);
  });

  // close the socket
  socket.on("disconnect", () => {
    for (const [codeBlockId, user] of Object.entries(users)) {
      if (user === socket.id) {
        delete users[codeBlockId];
        io.to(codeBlockId).emit("mentorLeft");
        studentsInRoom = 0;
      } else {
        studentsInRoom = Math.max(0, studentsInRoom - 1); // Ensure it doesn't go below 0
        io.to(codeBlockId).emit("numberOfStudents", studentsInRoom);
      }
    }
  });
});

expressServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
