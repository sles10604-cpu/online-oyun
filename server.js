const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

let players = {};
let bullets = [];
let lootBoxes = [];
let gameStarted = false;
let zone = { x: 400, y: 300, radius: 450 }; // Daralan alan

// Rastgele Sandık / Airdrop Üret
function spawnLoot() {
  if (lootBoxes.length < 8) {
    lootBoxes.push({
      id: Math.random().toString(),
      x: Math.random() * 700 + 50,
      y: Math.random() * 500 + 50,
      type: Math.random() > 0.5 ? "health" : "ammo" // Can veya Mermi
    });
  }
}

// Oyunu Başlatma Sıfırlaması
function resetGame() {
  gameStarted = true;
  zone = { x: 400, y: 300, radius: 450 };
  bullets = [];
  lootBoxes = [];
  for (let i = 0; i < 5; i++) spawnLoot();

  let spawnPositions = [{ x: 100, y: 100 }, { x: 700, y: 500 }];
  let index = 0;

  for (let id in players) {
    players[id].x = spawnPositions[index % 2].x;
    players[id].y = spawnPositions[index % 2].y;
    players[id].health = 100;
    players[id].ammo = 30;
    players[id].isReady = false;
    index++;
  }
}

io.on("connection", (socket) => {
  console.log("Bağlandı:", socket.id);

  socket.on("joinGame", (name) => {
    players[socket.id] = {
      id: socket.id,
      name: name || "Oyuncu",
      x: 100, y: 100,
      health: 100, ammo: 30,
      isReady: false,
      angle: 0
    };
    socket.emit("init", socket.id);
    io.emit("stateUpdate", { players, bullets, lootBoxes, zone, gameStarted });
  });

  // Lobi Hazır Onayı
  socket.on("toggleReady", () => {
    if (players[socket.id]) {
      players[socket.id].isReady = !players[socket.id].isReady;
      
      let pKeys = Object.keys(players);
      // 2 kişi varsa ve ikisi de hazırsa oyunu başlat
      if (pKeys.length === 2 && players[pKeys[0]].isReady && players[pKeys[1]].isReady) {
        resetGame();
      }
      io.emit("stateUpdate", { players, bullets, lootBoxes, zone, gameStarted });
    }
  });

  // Oyuncu Hareketi ve Bakış Acısı
  socket.on("playerMove", (data) => {
    if (players[socket.id] && gameStarted && players[socket.id].health > 0) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].angle = data.angle;
    }
  });

  // Ateş Etme
  socket.on("shoot", () => {
    let p = players[socket.id];
    if (p && gameStarted && p.health > 0 && p.ammo > 0) {
      p.ammo--;
      bullets.push({
        id: Math.random().toString(),
        ownerId: socket.id,
        x: p.x,
        y: p.y,
        vx: Math.cos(p.angle) * 10,
        vy: Math.sin(p.angle) * 10
      });
    }
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    gameStarted = false;
    io.emit("stateUpdate", { players, bullets, lootBoxes, zone, gameStarted });
  });
});

// Airdrop zamanlayıcısı (10 saniyede bir düşer)
setInterval(() => {
  if (gameStarted) spawnLoot();
}, 10000);

// Oyun Fiziği ve Döngüsü (Saniyede 30 Kez)
setInterval(() => {
  if (!gameStarted) return;

  // 1. Alanı Daralt
  if (zone.radius > 50) {
    zone.radius -= 0.15;
  }

  // 2. Mermileri İlet/Çarpışma Kontrolü
  for (let i = bullets.length - 1; i >= 0; i--) {
    let b = bullets[i];
    b.x += b.vx;
    b.y += b.vy;

    // Harita dışına çıkan mermiyi sil
    if (b.x < 0 || b.x > 800 || b.y < 0 || b.y > 600) {
      bullets.splice(i, 1);
      continue;
    }

    // Oyunculara çarpma kontrolü
    for (let id in players) {
      let p = players[id];
      if (id !== b.ownerId && p.health > 0) {
        let dist = Math.hypot(p.x - b.x, p.y - b.y);
        if (dist < 15) { // Çarptı
          p.health -= 15;
          bullets.splice(i, 1);
          break;
        }
      }
    }
  }

  // 3. Sandık Toplama ve Alan Hasarı Kontrolü
  for (let id in players) {
    let p = players[id];
    if (p.health <= 0) continue;

    // Sandık toplama
    for (let j = lootBoxes.length - 1; j >= 0; j--) {
      let box = lootBoxes[j];
      let dist = Math.hypot(p.x - box.x, p.y - box.y);
      if (dist < 20) {
        if (box.type === "health") p.health = Math.min(100, p.health + 30);
        if (box.type === "ammo") p.ammo += 20;
        lootBoxes.splice(j, 1);
      }
    }

    // Alan dışında kalan oyuncuya zamanla hasar ver
    let distToZoneCenter = Math.hypot(p.x - zone.x, p.y - zone.y);
    if (distToZoneCenter > zone.radius) {
      p.health -= 0.2; // Güvenli alan dışında canı erir
    }
  }

  io.emit("stateUpdate", { players, bullets, lootBoxes, zone, gameStarted });
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Battlefield Sunucusu ${PORT} portunda aktif.`));
