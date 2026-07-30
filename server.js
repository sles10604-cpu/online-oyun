const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const MAP_WIDTH = 1100;
const MAP_HEIGHT = 700;

let players = {};
let bullets = [];
let lootBoxes = [];
let obstacles = [];
let gameStarted = false;
let zone = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2, radius: 650 };

// Sabit Engelleri Oluştur (Taş, Ağaç, Tahta)
function generateObstacles() {
  obstacles = [
    { x: 250, y: 180, r: 35, type: 'rock' },
    { x: 850, y: 180, r: 35, type: 'rock' },
    { x: 300, y: 500, r: 40, type: 'tree' },
    { x: 800, y: 500, r: 40, type: 'tree' },
    { x: 550, y: 350, r: 30, type: 'wood' },
    { x: 550, y: 150, r: 25, type: 'wood' },
    { x: 550, y: 550, r: 25, type: 'wood' }
  ];
}

function spawnLoot() {
  if (lootBoxes.length < 6) {
    lootBoxes.push({
      id: Math.random().toString(),
      x: Math.random() * (MAP_WIDTH - 100) + 50,
      y: Math.random() * (MAP_HEIGHT - 100) + 50,
      type: Math.random() > 0.5 ? "health" : "ammo"
    });
  }
}

function resetGame() {
  gameStarted = true;
  zone = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2, radius: 650 };
  bullets = [];
  lootBoxes = [];
  generateObstacles();

  for (let i = 0; i < 4; i++) spawnLoot();

  let spawnPositions = [{ x: 120, y: 120 }, { x: MAP_WIDTH - 120, y: MAP_HEIGHT - 120 }];
  let index = 0;

  for (let id in players) {
    players[id].x = spawnPositions[index % 2].x;
    players[id].y = spawnPositions[index % 2].y;
    players[id].health = 100;
    players[id].ammo = 12; // 1. Mermi sayısı azaltıldı
    players[id].isReady = false;
    players[id].rank = null;
    index++;
  }
}

io.on("connection", (socket) => {
  socket.on("joinGame", (name) => {
    players[socket.id] = {
      id: socket.id,
      name: name || "Oyuncu",
      x: 120, y: 120,
      health: 100, ammo: 12,
      isReady: false,
      angle: 0,
      rank: null
    };
    socket.emit("init", socket.id);
    io.emit("stateUpdate", { players, bullets, lootBoxes, obstacles, zone, gameStarted });
  });

  socket.on("toggleReady", () => {
    if (players[socket.id]) {
      players[socket.id].isReady = !players[socket.id].isReady;
      let pKeys = Object.keys(players);
      if (pKeys.length === 2 && players[pKeys[0]].isReady && players[pKeys[1]].isReady) {
        resetGame();
      }
      io.emit("stateUpdate", { players, bullets, lootBoxes, obstacles, zone, gameStarted });
    }
  });

  socket.on("playerMove", (data) => {
    let p = players[socket.id];
    if (p && gameStarted && p.health > 0) {
      let nextX = data.x;
      let nextY = data.y;

      // Engellerle oyuncu çarpışma kontrolü
      let collided = false;
      for (let obs of obstacles) {
        let dist = Math.hypot(nextX - obs.x, nextY - obs.y);
        if (dist < obs.r + 14) { // 14: oyuncu yarıçapı
          collided = true;
          break;
        }
      }

      if (!collided) {
        p.x = nextX;
        p.y = nextY;
      }
      p.angle = data.angle;
    }
  });

  socket.on("shoot", () => {
    let p = players[socket.id];
    if (p && gameStarted && p.health > 0 && p.ammo > 0) {
      p.ammo--;
      bullets.push({
        id: Math.random().toString(),
        ownerId: socket.id,
        x: p.x,
        y: p.y,
        vx: Math.cos(p.angle) * 12,
        vy: Math.sin(p.angle) * 12
      });
    }
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    gameStarted = false;
    io.emit("stateUpdate", { players, bullets, lootBoxes, obstacles, zone, gameStarted });
  });
});

setInterval(() => {
  if (gameStarted) spawnLoot();
}, 12000);

// Oyun Döngüsü
setInterval(() => {
  if (!gameStarted) return;

  // 2. Alan YAVAŞ daralıyor (0.15 yerine 0.05)
  if (zone.radius > 60) {
    zone.radius -= 0.05;
  }

  // Mermi Kontrolleri
  for (let i = bullets.length - 1; i >= 0; i--) {
    let b = bullets[i];
    b.x += b.vx;
    b.y += b.vy;

    // Sınır kontrolü
    if (b.x < 0 || b.x > MAP_WIDTH || b.y < 0 || b.y > MAP_HEIGHT) {
      bullets.splice(i, 1);
      continue;
    }

    // 4. Engellere çarpan mermiler yok olur
    let hitObstacle = false;
    for (let obs of obstacles) {
      if (Math.hypot(obs.x - b.x, obs.y - b.y) < obs.r) {
        bullets.splice(i, 1);
        hitObstacle = true;
        break;
      }
    }
    if (hitObstacle) continue;

    // Oyuncu Vurulma Kontrolü
    for (let id in players) {
      let p = players[id];
      if (id !== b.ownerId && p.health > 0) {
        if (Math.hypot(p.x - b.x, p.y - b.y) < 15) {
          p.health -= 20;
          bullets.splice(i, 1);
          break;
        }
      }
    }
  }

  // Alan Hasarı, Sandık Toplama ve Oyun Sonu Sıralama
  let alivePlayers = [];
  for (let id in players) {
    let p = players[id];
    if (p.health > 0) {
      // Sandıklar
      for (let j = lootBoxes.length - 1; j >= 0; j--) {
        let box = lootBoxes[j];
        if (Math.hypot(p.x - box.x, p.y - box.y) < 22) {
          if (box.type === "health") p.health = Math.min(100, p.health + 25);
          if (box.type === "ammo") p.ammo += 10;
          lootBoxes.splice(j, 1);
        }
      }

      // Alan Dışı
      if (Math.hypot(p.x - zone.x, p.y - zone.y) > zone.radius) {
        p.health -= 0.15;
      }

      if (p.health > 0) {
        alivePlayers.push(p);
      } else {
        // 5. Elenen oyuncu 2. olur
        p.rank = 2;
      }
    }
  }

  // 5. Kazanma durumu kontrolü
  if (alivePlayers.length === 1 && Object.keys(players).length >= 2) {
    alivePlayers[0].rank = 1; // Kazanan 1. olur
  }

  io.emit("stateUpdate", { players, bullets, lootBoxes, obstacles, zone, gameStarted });
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sunucu ${PORT} portunda aktif.`));
