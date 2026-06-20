/**
 * Lava Tower — Jump Forever
 * Core Game JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // DOM Elements
  const menuOverlay = document.getElementById('menu');
  const leaderboardOverlay = document.getElementById('leaderboard');
  const gameoverOverlay = document.getElementById('gameover');
  
  const btnNew = document.getElementById('btn-new');
  const btnLeaderboard = document.getElementById('btn-leaderboard');
  const btnBack = document.getElementById('btn-back');
  const btnRetry = document.getElementById('btn-retry');
  const btnMenuElements = document.querySelectorAll('#btn-menu');
  
  const finalScoreSpan = document.getElementById('final-score');
  const bestTag = document.getElementById('best-tag');
  const scoresOl = document.getElementById('scores');
  const noScoresP = document.getElementById('no-scores');

  // Game Settings & Constants
  const CONFIG = {
    gravity: 0.35,
    jumpForce: -10.5,
    springJumpForce: -19,
    playerSpeed: 0.48, // acceleration (reduced by 20%)
    playerFriction: 0.86,
    maxPlayerVx: 6.0, // max velocity (reduced by 20%)
    platformWidth: 70,
    platformHeight: 12,
    springWidth: 20,
    springHeight: 8,
    minPlatformGap: 60,
    maxPlatformGap: 160,
    maxDifficultyHeight: 8000,
    baseLavaSpeed: 0.7,
    maxLavaSpeed: 4.8,
    lavaAcceleration: 0.0001, // speed increase per frame
  };

  // Game State variables
  let gameState = 'menu'; // 'menu', 'playing', 'gameover', 'leaderboard'
  let player;
  let platforms = [];
  let particles = [];
  let stars = [];
  let cameraY = 0;
  let targetCameraY = 0;
  let lavaY = 640;
  let lavaSpeed = CONFIG.baseLavaSpeed;
  let currentScore = 0; // in meters
  let maxReachedHeight = 0; // relative to starting Y
  let keys = {};
  let animationFrameId;
  let screenShake = 0;
  let gameTime = 0;

  // Sound effects generator (Web Audio API)
  const sound = {
    ctx: null,
    init() {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
    },
    play(type) {
      this.init();
      if (!this.ctx) return;
      
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      if (type === 'jump') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(450, now + 0.12);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'spring') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(900, now + 0.3);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'break') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.linearRampToValueAtTime(40, now + 0.25);
        
        // Add lowpass filter for crumply sound
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300, now);
        
        osc.disconnect(gain);
        osc.connect(filter);
        filter.connect(gain);
        
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'gameover') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.6);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.65);
        osc.start(now);
        osc.stop(now + 0.65);
      } else if (type === 'highscore') {
        // Play a nice arpeggio
        const notes = [261.63, 329.63, 392.00, 523.25]; // C major
        notes.forEach((freq, idx) => {
          const noteOsc = this.ctx.createOscillator();
          const noteGain = this.ctx.createGain();
          noteOsc.connect(noteGain);
          noteGain.connect(this.ctx.destination);
          
          noteOsc.type = 'sine';
          noteOsc.frequency.setValueAtTime(freq, now + idx * 0.1);
          noteGain.gain.setValueAtTime(0.15, now + idx * 0.1);
          noteGain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.1 + 0.25);
          
          noteOsc.start(now + idx * 0.1);
          noteOsc.stop(now + idx * 0.1 + 0.25);
        });
      }
    }
  };

  // Particles class for explosion/trail effects
  class Particle {
    constructor(x, y, color, size, vx, vy, life) {
      this.x = x;
      this.y = y;
      this.color = color;
      this.size = size;
      this.vx = vx;
      this.vy = vy;
      this.life = life; // in frames
      this.maxLife = life;
    }
    
    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.life--;
    }
    
    draw(ctx, camY) {
      ctx.save();
      ctx.globalAlpha = this.life / this.maxLife;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y - camY, this.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function spawnExplosion(x, y, color, count = 10, speed = 3) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = Math.random() * speed + 0.5;
      const vx = Math.cos(angle) * velocity;
      const vy = Math.sin(angle) * velocity;
      const size = Math.random() * 4 + 1.5;
      const life = Math.random() * 30 + 15;
      particles.push(new Particle(x, y, color, size, vx, vy, life));
    }
  }

  // Player Character Class
  class Player {
    constructor() {
      this.x = canvas.width / 2;
      this.y = canvas.height - 100;
      this.vx = 0;
      this.vy = 0;
      this.width = 24;
      this.height = 24;
      this.color = '#ffdd00';
      this.trailColor = '#ff6c00';
      this.facing = 'right';
      this.grounded = false;
      this.isJumping = false;
    }

    update() {
      // Horizontal controls
      if (keys['ArrowLeft'] || keys['KeyA'] || touchInput.left) {
        this.vx -= CONFIG.playerSpeed;
        this.facing = 'left';
      } else if (keys['ArrowRight'] || keys['KeyD'] || touchInput.right) {
        this.vx += CONFIG.playerSpeed;
        this.facing = 'right';
      } else {
        this.vx *= CONFIG.playerFriction;
      }

      // Clamp horizontal speed
      if (this.vx > CONFIG.maxPlayerVx) this.vx = CONFIG.maxPlayerVx;
      if (this.vx < -CONFIG.maxPlayerVx) this.vx = -CONFIG.maxPlayerVx;

      // Screen boundary wrap around
      if (this.x + this.width < 0) {
        this.x = canvas.width;
      } else if (this.x > canvas.width) {
        this.x = -this.width;
      }

      // Apply gravity
      this.vy += CONFIG.gravity;

      // Move player
      this.x += this.vx;
      this.y += this.vy;

      // Spawn trail particles when moving up rapidly
      if (this.vy < -2 && Math.random() < 0.4) {
        particles.push(new Particle(
          this.x + this.width / 2 + (Math.random() - 0.5) * 8,
          this.y + this.height,
          this.vy < -11 ? '#ff4e00' : this.trailColor,
          Math.random() * 3 + 1,
          (Math.random() - 0.5) * 1,
          Math.random() * 2 + 1,
          Math.random() * 20 + 10
        ));
      }
    }

    draw(ctx, camY) {
      ctx.save();
      // Draw character box with glow
      ctx.shadowBlur = 10;
      ctx.shadowColor = this.color;
      ctx.fillStyle = this.color;
      
      const rx = this.x;
      const ry = this.y - camY;
      const rw = this.width;
      const rh = this.height;
      const radius = 6; // rounded corners
      
      // Draw a cute rounded cube
      ctx.beginPath();
      ctx.moveTo(rx + radius, ry);
      ctx.lineTo(rx + rw - radius, ry);
      ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
      ctx.lineTo(rx + rw, ry + rh - radius);
      ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
      ctx.lineTo(rx + radius, ry + rh);
      ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
      ctx.lineTo(rx, ry + radius);
      ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
      ctx.closePath();
      ctx.fill();

      // Eye visor design (cyberpunk look)
      ctx.fillStyle = '#0f0f18';
      const visorY = ry + 5;
      const visorHeight = 6;
      if (this.facing === 'right') {
        ctx.fillRect(rx + 8, visorY, rw - 8, visorHeight);
        ctx.fillStyle = '#00ffff'; // glowing eye
        ctx.fillRect(rx + 16, visorY + 2, 4, 2);
      } else {
        ctx.fillRect(rx, visorY, rw - 8, visorHeight);
        ctx.fillStyle = '#00ffff'; // glowing eye
        ctx.fillRect(rx + 4, visorY + 2, 4, 2);
      }

      ctx.restore();
    }
  }

  // Platform Class
  class Platform {
    constructor(x, y, type = 'normal') {
      this.x = x;
      this.y = y;
      this.width = CONFIG.platformWidth;
      this.height = CONFIG.platformHeight;
      this.type = type; // 'normal', 'moving', 'fragile', 'spring'
      this.vx = type === 'moving' ? (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 1.2 + 0.8) : 0;
      this.broken = false;
      this.breakProgress = 0; // 0 to 1
      
      // Setup spring if appropriate
      this.hasSpring = type === 'spring';
      if (this.hasSpring) {
        this.springX = this.x + (this.width - CONFIG.springWidth) / 2;
        this.springY = this.y - CONFIG.springHeight;
        this.springActivated = false;
        this.springFrame = 0;
      }
    }

    update() {
      // Handle moving platforms
      if (this.type === 'moving') {
        this.x += this.vx;
        if (this.x <= 0 || this.x + this.width >= canvas.width) {
          this.vx *= -1; // Bounce off screen bounds
        }
        if (this.hasSpring) {
          this.springX = this.x + (this.width - CONFIG.springWidth) / 2;
        }
      }

      // Handle fragile crumbling platform
      if (this.broken) {
        this.breakProgress += 0.05;
        if (this.breakProgress >= 1) {
          // Trigger particles
          spawnExplosion(this.x + this.width / 2, this.y + this.height / 2, '#8b5a2b', 8, 2);
          sound.play('break');
          return false; // remove from list
        }
      }

      // Handle spring animation frame
      if (this.hasSpring && this.springActivated) {
        this.springFrame += 0.2;
        if (this.springFrame >= 3) {
          this.springFrame = 0;
          this.springActivated = false;
        }
      }

      return true;
    }

    draw(ctx, camY) {
      if (this.broken && this.breakProgress >= 1) return;

      ctx.save();
      
      // Determine colors based on platform type
      let fillGradient = ctx.createLinearGradient(this.x, this.y - camY, this.x, this.y + this.height - camY);
      let shadowColor = '';
      
      if (this.type === 'normal') {
        fillGradient.addColorStop(0, '#00b4db');
        fillGradient.addColorStop(1, '#0083b0');
        shadowColor = 'rgba(0, 180, 219, 0.4)';
      } else if (this.type === 'moving') {
        fillGradient.addColorStop(0, '#a8c0ff');
        fillGradient.addColorStop(1, '#3f2b96');
        shadowColor = 'rgba(168, 192, 255, 0.4)';
      } else if (this.type === 'fragile') {
        // Darken/fade as it crumbles
        const alpha = 1 - this.breakProgress;
        fillGradient.addColorStop(0, `rgba(186, 73, 73, ${alpha})`);
        fillGradient.addColorStop(1, `rgba(99, 29, 29, ${alpha})`);
        shadowColor = `rgba(186, 73, 73, ${0.4 * alpha})`;
      } else if (this.type === 'spring') {
        fillGradient.addColorStop(0, '#11998e');
        fillGradient.addColorStop(1, '#38ef7d');
        shadowColor = 'rgba(56, 239, 125, 0.4)';
      }

      ctx.shadowBlur = 8;
      ctx.shadowColor = shadowColor;
      ctx.fillStyle = fillGradient;

      // Draw platform round rectangle
      const rx = this.x;
      const ry = this.y - camY;
      const rw = this.width;
      const rh = this.height;
      const radius = 5;

      ctx.beginPath();
      ctx.moveTo(rx + radius, ry);
      ctx.lineTo(rx + rw - radius, ry);
      ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
      ctx.lineTo(rx + rw, ry + rh - radius);
      ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
      ctx.lineTo(rx + radius, ry + rh);
      ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
      ctx.lineTo(rx, ry + radius);
      ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
      ctx.closePath();
      ctx.fill();

      // Fragile crack markings
      if (this.type === 'fragile' && this.breakProgress > 0) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(this.x + 10, this.y - camY);
        ctx.lineTo(this.x + 18, this.y + 6 - camY);
        ctx.lineTo(this.x + 25, this.y - camY);
        ctx.moveTo(this.x + 40, this.y - camY);
        ctx.lineTo(this.x + 45, this.y + 9 - camY);
        ctx.lineTo(this.x + 52, this.y + 2 - camY);
        ctx.stroke();
      }

      // Draw spring (trampoline)
      if (this.hasSpring) {
        ctx.shadowBlur = 0; // reset shadow for spring
        ctx.fillStyle = '#ff3366';
        
        const sx = this.springX;
        let sy = this.springY - camY;
        let sh = CONFIG.springHeight;
        
        if (this.springActivated) {
          // squash effect based on animation frames
          if (this.springFrame < 1.5) {
            sy += 4;
            sh -= 4;
          } else {
            sy -= 2;
            sh += 2;
          }
        }
        
        // Spring base
        ctx.fillStyle = '#a0a0ab';
        ctx.fillRect(sx - 2, sy + sh - 2, CONFIG.springWidth + 4, 2);
        
        // Spring coil/legs
        ctx.strokeStyle = '#d4d4d8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx + 2, sy + sh - 2);
        ctx.lineTo(sx + 6, sy + 3);
        ctx.lineTo(sx + 10, sy + sh - 2);
        ctx.lineTo(sx + 14, sy + 3);
        ctx.lineTo(sx + 18, sy + sh - 2);
        ctx.stroke();

        // Spring top pad
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(sx, sy, CONFIG.springWidth, 3);
      }

      ctx.restore();
    }
  }

  // Touch/Mouse Controls for causal mobile gameplay
  const touchInput = { left: false, right: false };
  
  function handlePointerDown(e) {
    if (gameState !== 'playing') return;
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    if (clientX === undefined) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = clientX - rect.left;
    if (clickX < rect.width / 2) {
      touchInput.left = true;
      touchInput.right = false;
    } else {
      touchInput.right = true;
      touchInput.left = false;
    }
  }

  function handlePointerUp() {
    touchInput.left = false;
    touchInput.right = false;
  }

  canvas.addEventListener('mousedown', handlePointerDown);
  window.addEventListener('mouseup', handlePointerUp);
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handlePointerDown(e);
  }, { passive: false });
  window.addEventListener('touchend', handlePointerUp);

  // Keyboard Event Listeners
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    
    // Prevent scrolling with arrows/space keys when in game
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  // Load Starfield Parallax Particles
  function initStars() {
    stars = [];
    for (let i = 0; i < 40; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 1.5 + 0.5,
        parallax: Math.random() * 0.4 + 0.1, // Slower scrolling speed
        opacity: Math.random() * 0.5 + 0.3
      });
    }
  }

  function updateAndDrawStars(ctx, camY) {
    ctx.save();
    stars.forEach(star => {
      // Parallax scroll effect
      // Star position wraps around canvas size
      let sy = (star.y - camY * star.parallax) % canvas.height;
      if (sy < 0) sy += canvas.height;
      
      ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
      ctx.beginPath();
      ctx.arc(star.x, sy, star.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // Platform generation helper
  function generateInitialPlatforms() {
    platforms = [];
    
    // Solid base platform to start
    const basePlatform = new Platform(canvas.width / 2 - CONFIG.platformWidth / 2, canvas.height - 50, 'normal');
    platforms.push(basePlatform);
    
    // Generate up the tower
    let currentY = canvas.height - 120;
    while (currentY > -1000) {
      spawnPlatformAtY(currentY);
      // Random gap
      currentY -= getRandomGap(currentY);
    }
  }

  function getRandomGap(yCoord) {
    // Escalate gap size as height climbs (up to CONFIG.maxDifficultyHeight)
    const heightProgress = Math.min(Math.abs(yCoord) / CONFIG.maxDifficultyHeight, 1);
    const min = CONFIG.minPlatformGap;
    const max = min + (CONFIG.maxPlatformGap - min) * heightProgress;
    return Math.floor(Math.random() * (max - min) + min);
  }

  function spawnPlatformAtY(y) {
    const x = Math.random() * (canvas.width - CONFIG.platformWidth);
    
    // Determine platform type based on current height
    const heightProgress = Math.min(Math.abs(y) / CONFIG.maxDifficultyHeight, 1);
    const roll = Math.random();
    
    let type = 'normal';
    
    if (heightProgress < 0.2) {
      // Basic platforms
      if (roll < 0.15) type = 'moving';
    } else if (heightProgress < 0.5) {
      // Mix in some spring platforms
      if (roll < 0.2) type = 'moving';
      else if (roll < 0.35) type = 'spring';
    } else {
      // Advanced levels (fewer normal platforms)
      if (roll < 0.35) type = 'moving';
      else if (roll < 0.55) type = 'spring';
    }

    platforms.push(new Platform(x, y, type));
  }

  function maintainPlatforms() {
    // Generate new platforms ahead of camera
    let highestPlatformY = canvas.height;
    platforms.forEach(p => {
      if (p.y < highestPlatformY) highestPlatformY = p.y;
    });

    while (highestPlatformY > cameraY - 400) {
      highestPlatformY -= getRandomGap(highestPlatformY);
      spawnPlatformAtY(highestPlatformY);
    }

    // Clean up old platforms too far below camera
    platforms = platforms.filter(p => p.y < cameraY + canvas.height + 150);
  }

  // LocalStorage Leaderboard handling
  function getLeaderboard() {
    const localData = localStorage.getItem('lava_tower_leaderboard');
    return localData ? JSON.parse(localData) : [];
  }

  function saveScore(scoreVal) {
    const leaderboard = getLeaderboard();
    const newEntry = {
      score: scoreVal,
      date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    };
    leaderboard.push(newEntry);
    
    // Sort descending and slice to top 5
    leaderboard.sort((a, b) => b.score - a.score);
    const topScores = leaderboard.slice(0, 5);
    
    localStorage.setItem('lava_tower_leaderboard', JSON.stringify(topScores));
    
    // Check if it's the personal best
    return topScores[0].score === scoreVal;
  }

  function populateLeaderboardUI() {
    const leaderboard = getLeaderboard();
    scoresOl.innerHTML = '';
    
    if (leaderboard.length === 0) {
      noScoresP.classList.remove('hidden');
    } else {
      noScoresP.classList.add('hidden');
      leaderboard.forEach((entry, index) => {
        const li = document.createElement('li');
        
        const rankSpan = document.createElement('span');
        rankSpan.className = 'rank';
        rankSpan.textContent = `#${index + 1}`;
        
        const dateSpan = document.createElement('span');
        dateSpan.className = 'date';
        dateSpan.textContent = entry.date;
        
        const scoreSpan = document.createElement('span');
        scoreSpan.className = 'score-val';
        scoreSpan.textContent = `${entry.score}m`;
        
        li.appendChild(rankSpan);
        li.appendChild(dateSpan);
        li.appendChild(scoreSpan);
        scoresOl.appendChild(li);
      });
    }
  }

  // Draw scrolling cosmic background
  function drawSkyGradient(ctx, camY) {
    ctx.save();
    // Shift background colors as you climb higher
    const progress = Math.min(Math.abs(camY) / 10000, 1);
    
    // Bottom sky colors (reddish orange volcanic dust)
    // Middle sky colors (mystic deep purple)
    // Top sky colors (cosmic dark star space blue)
    let bottomColor, topColor;
    
    if (progress < 0.3) {
      // Volcanic orange to deep purple
      const localProg = progress / 0.3;
      bottomColor = interpolateColor('#2b0700', '#1a0b07', localProg);
      topColor = interpolateColor('#0d0c1d', '#05030f', localProg);
    } else if (progress < 0.7) {
      // Purple to space black
      const localProg = (progress - 0.3) / 0.4;
      bottomColor = interpolateColor('#1a0b07', '#080112', localProg);
      topColor = interpolateColor('#05030f', '#020005', localProg);
    } else {
      // Deep outer cosmic space
      bottomColor = '#030008';
      topColor = '#000000';
    }

    const skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    skyGrad.addColorStop(0, topColor);
    skyGrad.addColorStop(1, bottomColor);
    
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // Linear color interpolation helper
  function interpolateColor(color1, color2, factor) {
    // Parse hex
    const r1 = parseInt(color1.substring(1, 3), 16);
    const g1 = parseInt(color1.substring(3, 5), 16);
    const b1 = parseInt(color1.substring(5, 7), 16);

    const r2 = parseInt(color2.substring(1, 3), 16);
    const g2 = parseInt(color2.substring(3, 5), 16);
    const b2 = parseInt(color2.substring(5, 7), 16);

    const r = Math.round(r1 + factor * (r2 - r1));
    const g = Math.round(g1 + factor * (g2 - g1));
    const b = Math.round(b1 + factor * (b2 - b1));

    // Format back to hex
    const rHex = r.toString(16).padStart(2, '0');
    const gHex = g.toString(16).padStart(2, '0');
    const bHex = b.toString(16).padStart(2, '0');

    return `#${rHex}${gHex}${bHex}`;
  }

  // Draw Lava at the bottom of the screen
  function drawLava(ctx, camY) {
    ctx.save();
    
    const waveHeight = 15;
    const speed = 0.04;
    const relativeLavaY = lavaY - camY;
    
    // Set glowing shadow for lava
    ctx.shadowBlur = 25;
    ctx.shadowColor = 'rgba(255, 60, 0, 0.8)';
    
    // Lava gradient
    const lavaGrad = ctx.createLinearGradient(0, relativeLavaY, 0, relativeLavaY + 200);
    lavaGrad.addColorStop(0, '#ff3c00');
    lavaGrad.addColorStop(0.2, '#ff6200');
    lavaGrad.addColorStop(0.6, '#ec9f05');
    lavaGrad.addColorStop(1, '#500000');
    
    ctx.fillStyle = lavaGrad;
    
    // Draw two overlapping wave layers for dynamic motion
    ctx.beginPath();
    ctx.moveTo(0, relativeLavaY);
    for (let x = 0; x <= canvas.width; x += 10) {
      const yOffset = Math.sin(x * 0.03 + gameTime * speed) * waveHeight;
      ctx.lineTo(x, relativeLavaY + yOffset);
    }
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.closePath();
    ctx.fill();

    // Wave 2
    ctx.shadowBlur = 0; // turn off shadow for second layer
    ctx.fillStyle = 'rgba(255, 110, 0, 0.4)';
    ctx.beginPath();
    ctx.moveTo(0, relativeLavaY + 5);
    for (let x = 0; x <= canvas.width; x += 10) {
      const yOffset = Math.cos(x * 0.02 + gameTime * (speed * 0.8)) * (waveHeight * 0.8);
      ctx.lineTo(x, relativeLavaY + 5 + yOffset);
    }
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.closePath();
    ctx.fill();

    // Add rising lava sparks/bubbles
    if (Math.random() < 0.2) {
      particles.push(new Particle(
        Math.random() * canvas.width,
        lavaY - Math.random() * 10,
        '#ffaa00',
        Math.random() * 3 + 1,
        (Math.random() - 0.5) * 1.5,
        -Math.random() * 2 - 0.5,
        Math.random() * 40 + 20
      ));
    }

    ctx.restore();
  }

  // Handle game screen shaking
  function applyScreenShake() {
    if (screenShake > 0) {
      const dx = (Math.random() - 0.5) * screenShake;
      const dy = (Math.random() - 0.5) * screenShake;
      ctx.translate(dx, dy);
      screenShake *= 0.9; // decay
      if (screenShake < 0.1) screenShake = 0;
    }
  }

  // Main Playing/Tick Loop
  function tick() {
    gameTime++;

    // Clear Canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    applyScreenShake();

    // 1. Draw Background Sky & Parallax Starfield
    drawSkyGradient(ctx, cameraY);
    updateAndDrawStars(ctx, cameraY);

    if (gameState === 'playing') {
      // 2. Physics & Logic Updates
      player.update();

      // Scroll camera smoothly to follow player
      if (player.y < cameraY + canvas.height * 0.45) {
        targetCameraY = player.y - canvas.height * 0.45;
      }
      
      // Let camera scroll up smoothly
      cameraY += (targetCameraY - cameraY) * 0.12;

      // Handle Lava rising
      // Make lava speed up slightly as the player climbs higher
      const difficultyMultiplier = 1 + (Math.abs(player.y) / CONFIG.maxDifficultyHeight) * 0.7;
      const currentFrameLavaSpeed = Math.min(lavaSpeed * difficultyMultiplier, CONFIG.maxLavaSpeed);
      
      lavaY -= currentFrameLavaSpeed;

      // Make sure the lava doesn't fall too far behind the viewport bottom to keep urgency
      const maxLavaDistanceBelowViewport = 80;
      const viewportBottom = cameraY + canvas.height;
      if (lavaY > viewportBottom + maxLavaDistanceBelowViewport) {
        lavaY = viewportBottom + maxLavaDistanceBelowViewport;
      }

      // Calculate score based on height climbed (10px = 1m)
      const heightInPixels = Math.max(0, (canvas.height - 100) - player.y);
      const calculatedScore = Math.floor(heightInPixels / 10);
      if (calculatedScore > currentScore) {
        currentScore = calculatedScore;
      }

      // Maintain and clean platforms
      maintainPlatforms();

      // 3. Collision Checks
      
      // Check collision with platform landing from above
      if (player.vy > 0) { // only land when falling
        platforms.forEach(plat => {
          // AABB collision logic for landing
          if (
            player.x + player.width > plat.x &&
            player.x < plat.x + plat.width &&
            player.y + player.height >= plat.y &&
            player.y + player.height - player.vy <= plat.y + 12
          ) {
            // Spring collision
            if (plat.hasSpring) {
              const sx = plat.springX;
              const sy = plat.springY;
              
              if (
                player.x + player.width > sx &&
                player.x < sx + CONFIG.springWidth &&
                player.y + player.height >= sy &&
                player.y + player.height - player.vy <= sy + CONFIG.springHeight
              ) {
                // Spring activated jump
                player.vy = CONFIG.springJumpForce;
                plat.springActivated = true;
                plat.springFrame = 0;
                screenShake = 8;
                sound.play('spring');
                spawnExplosion(sx + CONFIG.springWidth / 2, sy, '#ff3366', 15, 4);
              }
            } else {
              // Normal landing / jumping
              player.vy = CONFIG.jumpForce;
              sound.play('jump');
              spawnExplosion(player.x + player.width / 2, player.y + player.height, '#00b4db', 6, 1.5);
            }
          }
        });
      }

      // Check gameover collision (Lava touch or falling way below camera)
      if (player.y + player.height >= lavaY || player.y - cameraY > canvas.height + 100) {
        gameOver();
      }
    }

    // Update and draw platforms
    platforms = platforms.filter(p => p.update());
    platforms.forEach(p => p.draw(ctx, cameraY));

    // Update and draw particles
    particles = particles.filter(part => {
      part.update();
      part.draw(ctx, cameraY);
      return part.life > 0;
    });

    // Draw Lava
    drawLava(ctx, cameraY);

    // Draw Player
    if (gameState === 'playing' && player) {
      player.draw(ctx, cameraY);
    }

    ctx.restore();

    // HUD overlays
    if (gameState === 'playing') {
      drawHUD();
      animationFrameId = requestAnimationFrame(tick);
    }
  }

  // Draw Height details on top-right during play
  function drawHUD() {
    ctx.save();
    
    // Height counter
    ctx.fillStyle = '#ffffff';
    ctx.font = "800 20px 'Outfit'";
    ctx.shadowBlur = 5;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.fillText(`${currentScore} m`, 20, 35);
    
    // Warning if lava is close
    const distToLava = lavaY - (player.y + player.height);
    if (distToLava < 180) {
      const dangerLevel = Math.max(0, 1 - (distToLava / 180)); // 0 to 1
      ctx.fillStyle = `rgba(255, 78, 0, ${0.4 + 0.6 * Math.sin(gameTime * 0.15)})`;
      ctx.font = "800 13px 'Outfit'";
      ctx.fillText("LAVA RISING!", 20, 60);
      
      // Red vignette borders showing danger
      ctx.strokeStyle = `rgba(255, 78, 0, ${dangerLevel * 0.6})`;
      ctx.lineWidth = 10;
      ctx.strokeRect(0, 0, canvas.width, canvas.height);
    }
    
    ctx.restore();
  }

  // Transition to game over state
  function gameOver() {
    gameState = 'gameover';
    cancelAnimationFrame(animationFrameId);
    sound.play('gameover');

    // Save height score
    const isNewRecord = saveScore(currentScore);
    
    finalScoreSpan.textContent = currentScore;
    bestTag.textContent = isNewRecord ? "🏆 NEW PERSONAL BEST!" : "";
    
    // Show GameOver overlay
    gameoverOverlay.classList.remove('hidden');
  }

  // Start a fresh new round
  function startNewGame() {
    // Initialize Audio Context on user gesture
    sound.init();

    gameState = 'playing';
    currentScore = 0;
    cameraY = 0;
    targetCameraY = 0;
    lavaY = canvas.height + 150;
    lavaSpeed = CONFIG.baseLavaSpeed;
    keys = {};
    touchInput.left = false;
    touchInput.right = false;

    // Reset components
    player = new Player();
    generateInitialPlatforms();
    particles = [];
    initStars();

    // Hide overlays
    menuOverlay.classList.add('hidden');
    gameoverOverlay.classList.add('hidden');
    leaderboardOverlay.classList.add('hidden');

    cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(tick);
  }

  // UI Event Bindings
  btnNew.addEventListener('click', () => {
    startNewGame();
  });

  btnLeaderboard.addEventListener('click', () => {
    gameState = 'leaderboard';
    populateLeaderboardUI();
    leaderboardOverlay.classList.remove('hidden');
    menuOverlay.classList.add('hidden');
  });

  btnBack.addEventListener('click', () => {
    gameState = 'menu';
    menuOverlay.classList.remove('hidden');
    leaderboardOverlay.classList.add('hidden');
  });

  btnRetry.addEventListener('click', () => {
    startNewGame();
  });

  btnMenuElements.forEach(btn => {
    btn.addEventListener('click', () => {
      gameState = 'menu';
      menuOverlay.classList.remove('hidden');
      gameoverOverlay.classList.add('hidden');
      leaderboardOverlay.classList.add('hidden');
      
      // Set background canvas display showing stars/lava inactive
      initStars();
      cameraY = 0;
      lavaY = canvas.height + 40;
      generateInitialPlatforms();
      
      // Run static animation loop for main menu visual
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(menuTick);
    });
  });

  // Main menu backdrop animation tick
  function menuTick() {
    gameTime++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Render static scrolling starfield and waves
    drawSkyGradient(ctx, 0);
    updateAndDrawStars(ctx, gameTime * 0.1);
    
    // Draw some random platforms
    platforms.forEach(p => p.draw(ctx, 0));
    
    // Render menu lava wave slightly lower
    drawLava(ctx, 40);

    if (gameState === 'menu' || gameState === 'leaderboard') {
      animationFrameId = requestAnimationFrame(menuTick);
    }
  }

  // Bootstrap Main Menu visual background
  initStars();
  cameraY = 0;
  lavaY = canvas.height + 50;
  generateInitialPlatforms();
  animationFrameId = requestAnimationFrame(menuTick);
});
