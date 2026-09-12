/* ============================================================
   Turbo Dodge — a tiny arcade car game
   Steer with ←/→ or A/D · speed with ↑/↓ · dodge the traffic
   ============================================================ */
(() => {
  "use strict";

  // ----- canvas setup -----
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;   // 420
  const H = canvas.height;  // 640

  // ----- DOM refs -----
  const $ = id => document.getElementById(id);
  const scoreEl = $("score"), speedEl = $("speed"), bestEl = $("best");
  const startScreen = $("startScreen"), overScreen = $("overScreen");
  const finalScoreEl = $("finalScore"), newBestEl = $("newBest");

  // ----- tunables -----
  const LANES = [105, 175, 245, 315];   // 4 lane centers
  const ROAD_L = 60, ROAD_R = W - 60;
  const BASE_SPEED = 4;                 // world scroll at speed 1
  const ACCEL = 0.02;                   // gentle auto-acceleration
  const SPAWN_BASE = 70;                // frames between cars at speed 1

  // ----- state -----
  let state = "menu";                   // menu | play | over
  const car = { x: LANES[1], y: H - 130, w: 44, h: 78, speed: 1, vx: 0 };
  let enemies = [];                     // {x,y,w,h,color,scored}
  let particles = [];                   // {x,y,vx,vy,life,max,color}
  let score = 0, best = 0, spawnTimer = 0, speedTarget = 1;
  let shake = 0, t = 0;

  best = Number(localStorage.getItem("turboBest") || 0);
  bestEl.textContent = best;

  const COLORS = ["#ef476f", "#06d6a0", "#118ab2", "#ffd166", "#9b5de5"];

  // ----- input -----
  const keys = { left: false, right: false, up: false, down: false };

  const KEYMAP = {
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
    ArrowUp: "up", KeyW: "up",
    ArrowDown: "down", KeyS: "down",
  };

  addEventListener("keydown", e => {
    const k = KEYMAP[e.code];
    if (k) { e.preventDefault(); keys[k] = true; }
    if (e.code === "Space" || e.code === "Enter") {
      e.preventDefault(); // don't scroll the page or re-click a focused button
      if (state === "menu" || state === "over") start();
    }
  });
  addEventListener("keyup", e => {
    const k = KEYMAP[e.code];
    if (k) keys[k] = false;
  });

  // touch / on-screen buttons
  function bindHold(id, key) {
    const btn = $(id);
    const on = e => { e.preventDefault(); keys[key] = true; btn.classList.add("held"); };
    const off = e => { e.preventDefault(); keys[key] = false; btn.classList.remove("held"); };
    btn.addEventListener("pointerdown", on);
    btn.addEventListener("pointerup", off);
    btn.addEventListener("pointerleave", off);
    btn.addEventListener("pointercancel", off);
  }
  bindHold("leftBtn", "left");
  bindHold("rightBtn", "right");
  bindHold("upBtn", "up");
  bindHold("downBtn", "down");

  $("startBtn").addEventListener("click", start);
  $("retryBtn").addEventListener("click", start);

  // swipe steering on the canvas itself
  let touchX = null;
  canvas.addEventListener("pointerdown", e => { touchX = e.clientX; });
  canvas.addEventListener("pointermove", e => {
    if (touchX === null || state !== "play") return;
    const dx = e.clientX - touchX;
    if (Math.abs(dx) > 6) {
      car.x = Math.max(ROAD_L + car.w / 2, Math.min(ROAD_R - car.w / 2, car.x + dx));
      touchX = e.clientX;
    }
  });
  canvas.addEventListener("pointerup", () => { touchX = null; });

  // ----- helpers -----
  const rand = (a, b) => a + Math.random() * (b - a);

  function spawnEnemy() {
    // pick a lane that has no enemy near its entry point
    const lane = LANES[Math.floor(Math.random() * LANES.length)];
    const tooClose = enemies.some(e => e.lane === lane && e.y < 220);
    if (tooClose) return; // try again next frame
    enemies.push({
      lane,
      x: lane,
      y: -90,
      w: 44,
      h: 78,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      scored: false,
    });
  }

  function explode(x, y, color) {
    for (let i = 0; i < 26; i++) {
      particles.push({
        x, y,
        vx: rand(-5, 5),
        vy: rand(-6, 3),
        life: rand(24, 48),
        max: 48,
        color: Math.random() < 0.5 ? color : "#f9c74f",
      });
    }
  }

  // ----- game flow -----
  function start() {
    state = "play";
    score = 0;
    enemies = [];
    particles = [];
    spawnTimer = 30;
    car.x = LANES[1];
    car.vx = 0;
    car.speed = 1;
    speedTarget = 1;
    shake = 0;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    startScreen.classList.add("hidden");
    overScreen.classList.add("hidden");
    updateHUD();
  }

  function gameOver() {
    state = "over";
    explode(car.x, car.y, "#ffd166");
    shake = 14;
    finalScoreEl.textContent = score;
    if (score > best) {
      best = score;
      localStorage.setItem("turboBest", best);
      bestEl.textContent = best;
      newBestEl.classList.remove("hidden");
    } else {
      newBestEl.classList.add("hidden");
    }
    overScreen.classList.remove("hidden");
  }

  function updateHUD() {
    scoreEl.textContent = score;
    speedEl.textContent = Math.round(car.speed * 60);
  }

  // ----- update -----
  function update() {
    t++;

    if (state !== "play") {
      // keep particles/shake animating behind the overlay
      updateParticles();
      if (shake > 0) shake *= 0.85;
      return;
    }

    // speed: hold up to boost, down to brake, plus slow auto-accel
    speedTarget += ACCEL;
    if (keys.up)   speedTarget += 0.035;
    if (keys.down) speedTarget -= 0.06;
    speedTarget = Math.max(0.7, Math.min(3.2, speedTarget));
    car.speed += (speedTarget - car.speed) * 0.08;

    // steering: smooth velocity toward held direction
    const targetVx = (keys.right - keys.left) * 5.2;
    car.vx += (targetVx - car.vx) * 0.2;
    car.x += car.vx;
    car.x = Math.max(ROAD_L + car.w / 2, Math.min(ROAD_R - car.w / 2, car.x));

    const scroll = BASE_SPEED * car.speed;

    // spawn traffic
    spawnTimer -= 1;
    if (spawnTimer <= 0) {
      spawnEnemy();
      spawnTimer = Math.max(22, SPAWN_BASE / car.speed + rand(-12, 12));
    }

    // move enemies
    for (const e of enemies) {
      e.y += scroll - 2.2; // traffic drives forward, slower than you
      if (!e.scored && e.y > car.y + car.h) {
        e.scored = true;
        score += 10;
      }
    }
    enemies = enemies.filter(e => e.y < H + 100);

    // collisions (slightly forgiving hitboxes)
    for (const e of enemies) {
      if (Math.abs(e.x - car.x) < (e.w + car.w) / 2 - 8 &&
          Math.abs(e.y - car.y) < (e.h + car.h) / 2 - 10) {
        gameOver();
        break;
      }
    }

    updateParticles();
    if (shake > 0) shake *= 0.85;
    updateHUD();
  }

  function updateParticles() {
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18;
      p.life--;
    }
    particles = particles.filter(p => p.life > 0);
  }

  // ----- drawing -----
  function drawCar(x, y, w, h, color, isPlayer) {
    ctx.save();
    ctx.translate(x, y);

    // shadow
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.fillRect(-w / 2 + 3, -h / 2 + 6, w, h);

    // body
    ctx.fillStyle = color;
    roundRect(-w / 2, -h / 2, w, h, 9);
    ctx.fill();

    // roof / windshield
    ctx.fillStyle = "rgba(10,15,25,.55)";
    roundRect(-w / 2 + 6, -h / 2 + 16, w - 12, h * 0.32, 5);
    ctx.fill();

    if (isPlayer) {
      // headlights
      ctx.fillStyle = "#fff3c4";
      ctx.fillRect(-w / 2 + 4, -h / 2 - 3, 10, 4);
      ctx.fillRect(w / 2 - 14, -h / 2 - 3, 10, 4);
      // taillights
      ctx.fillStyle = "#ff5d5d";
      ctx.fillRect(-w / 2 + 4, h / 2 - 2, 10, 3);
      ctx.fillRect(w / 2 - 14, h / 2 - 2, 10, 3);
    } else {
      // taillights facing the player
      ctx.fillStyle = "#ff5d5d";
      ctx.fillRect(-w / 2 + 4, -h / 2 - 2, 10, 3);
      ctx.fillRect(w / 2 - 14, -h / 2 - 2, 10, 3);
    }

    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw() {
    ctx.save();
    if (shake > 0.4) {
      ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);
    }

    // grass
    ctx.fillStyle = "#3a4d3f";
    ctx.fillRect(0, 0, W, H);

    // road
    ctx.fillStyle = "#31384a";
    ctx.fillRect(ROAD_L - 14, 0, ROAD_R - ROAD_L + 28, H);

    // lane dashes (scroll with world speed)
    ctx.fillStyle = "rgba(255,255,255,.5)";
    for (let x = 140; x <= 280; x += 70) {
      for (let y = -80; y < H + 80; y += 80) {
        const yy = ((y + t * BASE_SPEED * car.speed) % (H + 160)) - 80;
        ctx.fillRect(x - 3, yy, 6, 42);
      }
    }

    // road edges
    ctx.fillStyle = "#e8ecf5";
    ctx.fillRect(ROAD_L - 16, 0, 4, H);
    ctx.fillRect(ROAD_R + 12, 0, 4, H);

    drawCar(car.x, car.y, car.w, car.h, "#ffd166", true);

    for (const e of enemies) drawCar(e.x, e.y, e.w, e.h, e.color, false);

    // particles
    for (const p of particles) {
      ctx.globalAlpha = p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // ----- main loop -----
  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }
  loop();
})();
