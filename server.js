const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// CORS ayarı: Netlify'dan gelen Socket bağlantılarına izin verir
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let players = {};

io.on("connection", (socket) => {
  console.log("Yeni oyuncu bağlandı:", socket.id);

  // Yeni oyuncuyu ekle
  players[socket.id] = {
    x: Math.floor(Math.random() * 400) + 50,
    y: Math.floor(Math.random() * 250) + 50,
    color: '#' + Math.floor(Math.random()*16777215).toString(16)
  };

  // Tüm bağlı istemcilere güncel oyuncuları gönder
  io.emit("stateUpdate", players);

  // İstemciden gelen hareket verisi
  socket.on("move", (data) => {
    if (players[socket.id]) {
      players[socket.id].x += data.x;
      players[socket.id].y += data.y;
      io.emit("stateUpdate", players);
    }
  });

  // Oyuncu ayrılınca sil
  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("stateUpdate", players);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));
