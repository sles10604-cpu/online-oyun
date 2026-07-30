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

  // Oyuncu katıldığında
  socket.on("joinGame", (playerName) => {
    players[socket.id] = {
      id: socket.id,
      name: playerName || "Sürücü",
      x: (Math.random() - 0.5) * 6, // Şeritte sabit/yok yakın x
      z: -5, // Herkes aynı başlangıç Z noktasında başlar
      color: '#' + Math.floor(Math.random() * 16777215).toString(16)
    };

    socket.emit("init", socket.id);
    io.emit("stateUpdate", players);
  });

  // Konum güncellemesi
  socket.on("playerMove", (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].z = data.z;
    }
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("playerLeft", socket.id);
  });
});

// Tüm cihazlar birbirini görsün diye saniyede 20 kez durum senkronizasyonu
setInterval(() => {
  io.emit("stateUpdate", players);
}, 50);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sunucu ${PORT} portunda aktif.`));
