const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let players = {};

io.on("connection", (socket) => {
  console.log("Oyuncu bağlandı:", socket.id);

  // Oyuncu adını kaydetme ve oyuna dahil etme
  socket.on("joinGame", (playerName) => {
    players[socket.id] = {
      id: socket.id,
      name: playerName || "Sürücü",
      x: (Math.random() - 0.5) * 8, // Rastgele şerit
      z: -5,
      color: '#' + Math.floor(Math.random() * 16777215).toString(16)
    };

    // Bağlanan oyuncuya kendi Socket ID'sini gönder
    socket.emit("init", socket.id);

    // Herkese güncel oyuncu listesini yayınla
    io.emit("stateUpdate", players);
  });

  // Oyuncudan gelen anlık konum güncellemesi (x, z pozisyonu)
  socket.on("playerMove", (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].z = data.z;
      // Performans için canlı veriyi diğer oyunculara dağıtıyoruz
      socket.broadcast.emit("playerMoved", players[socket.id]);
    }
  });

  // Oyuncu ayrıldığında
  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("playerLeft", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sunucu ${PORT} portunda aktif.`));
