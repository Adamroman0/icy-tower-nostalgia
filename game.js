/**
 * Lava Tower — Jump Forever
 * Core Game JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const VIEW_WIDTH = 420;
  const VIEW_HEIGHT = 640;

  // DOM Elements
  const menuOverlay = document.getElementById('menu');
  const leaderboardOverlay = document.getElementById('leaderboard');
  const gameoverOverlay = document.getElementById('gameover');
  
  const btnNew = document.getElementById('btn-new');
  const btnLeaderboard = document.getElementById('btn-leaderboard');
  const btnBack = document.getElementById('btn-back');
  const btnRetry = document.getElementById('btn-retry');
  const menuButton = document.getElementById('btn-menu');
  
  const finalScoreSpan = document.getElementById('final-score');
  const bestTag = document.getElementById('best-tag');
  const scoresOl = document.getElementById('scores');
  const noScoresP = document.getElementById('no-scores');
  const controlsToggleButton = document.getElementById('btn-controls-toggle');
  const touchControls = document.getElementById('touch-controls');
  const movementZone = document.getElementById('movement-zone');
  const thumbpad = document.getElementById('thumbpad');
  const thumbstick = document.getElementById('thumbstick');
  const jumpButton = document.getElementById('jump-button');
  const pauseOverlay = document.getElementById('pause');
  const pauseButton = document.getElementById('btn-pause');
  const resumeButton = document.getElementById('btn-resume');
  const pauseMenuButton = document.getElementById('btn-pause-menu');
  const muteButton = document.getElementById('btn-mute');
  const gameStatus = document.getElementById('game-status');

  // Game Settings & Constants
  const CONFIG = {
    gravity: 0.35,
    jumpForce: -10.5,
    springJumpForce: -19,
    maxFallSpeed: 14, // terminal velocity — keeps fast descents readable
    groundAcceleration: 0.62,
    airAcceleration: 0.34,
    groundFriction: 0.82,
    airFriction: 0.992,
    maxPlayerVx: 7.2,
    momentumThreshold: 4.2,
    momentumJumpForce: -15.5,
    inputGraceFrames: 8,
    jumpBufferFrames: 8,
    platformWidth: 120,
    platformHeight: 12,
    springWidth: 20,
    springHeight: 8,
    minPlatformGap: 60,
    maxPlatformGap: 132,
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
  let keys = {};
  let animationFrameId;
  let screenShake = 0;
  let gameTime = 0;
  let jumpBufferFrames = 0;
  let thumbPointerId = null;
  let thumbOriginX = 0;
  let combo = 0;
  let bestCombo = 0;
  let comboMessageTime = 0;
  let lastTimestamp = 0;
  let accumulator = 0;
  const FIXED_STEP_MS = 1000 / 60;
  const savedTouchPreference = localStorage.getItem('lava_tower_touch_controls');
  let touchControlsEnabled = savedTouchPreference
    ? savedTouchPreference === 'on'
    : window.matchMedia('(pointer: coarse)').matches;
  let muted = localStorage.getItem('lava_tower_muted') === 'on';

  // Sound effects generator (Web Audio API)
  const sound = {
    ctx: null,
    init() {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!this.ctx && AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    },
    play(type) {
      if (muted) return;
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

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = VIEW_WIDTH * dpr;
    canvas.height = VIEW_HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

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
      this.x = VIEW_WIDTH / 2;
      this.y = VIEW_HEIGHT - 100;
      this.vx = 0;
      this.vy = 0;
      this.width = 24;
      this.height = 24;
      this.color = '#ffdd00';
      this.trailColor = '#ff6c00';
      this.facing = 'right';
      this.grounded = false;
      this.jumpStartY = this.y;
      this.momentumJump = false;
      this.jumpAnimation = 'none';
      this.jumpRotation = 0;
    }

    update() {
      this.tryBufferedJump();

      // Horizontal controls
      const moveDirection = getMoveDirection();
      const acceleration = this.grounded ? CONFIG.groundAcceleration : CONFIG.airAcceleration;
      if (moveDirection < 0) {
        this.vx -= acceleration;
        this.facing = 'left';
      } else if (moveDirection > 0) {
        this.vx += acceleration;
        this.facing = 'right';
      } else {
        this.vx *= this.grounded ? CONFIG.groundFriction : CONFIG.airFriction;
      }

      // Clamp horizontal speed
      if (this.vx > CONFIG.maxPlayerVx) this.vx = CONFIG.maxPlayerVx;
      if (this.vx < -CONFIG.maxPlayerVx) this.vx = -CONFIG.maxPlayerVx;

      // Apply gravity
      this.vy += CONFIG.gravity;
      if (this.vy > CONFIG.maxFallSpeed) this.vy = CONFIG.maxFallSpeed;

      // Move player
      this.x += this.vx;
      this.y += this.vy;

      // Solid side walls — block the player and bounce off (Icy Tower style)
      const wallBounce = 0.55;
      if (this.x < 0) {
        this.x = 0;
        this.vx = Math.abs(this.vx) * wallBounce;
      } else if (this.x + this.width > VIEW_WIDTH) {
        this.x = VIEW_WIDTH - this.width;
        this.vx = -Math.abs(this.vx) * wallBounce;
      }

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

    jump(force) {
      const momentum = TowerCore.getMomentumJump(
        this.vx,
        CONFIG.jumpForce,
        CONFIG.momentumJumpForce,
        CONFIG.momentumThreshold,
        CONFIG.maxPlayerVx
      );
      const isSpring = force === CONFIG.springJumpForce;
      this.vy = force ?? momentum.force;
      this.grounded = false;
      this.jumpStartY = this.y;
      this.momentumJump = !isSpring && momentum.isHighJump;
      this.jumpAnimation = isSpring || !momentum.isHighJump
        ? 'none'
        : (momentum.power >= 0.78 ? 'cartwheel' : 'stretch');
      this.jumpRotation = 0;
      jumpBufferFrames = 0;
      sound.play(isSpring ? 'spring' : 'jump');
      spawnExplosion(
        this.x + this.width / 2,
        this.y + this.height,
        isSpring ? '#ff3366' : (this.momentumJump ? '#ffd700' : '#00b4db'),
        isSpring ? 15 : (this.momentumJump ? 10 : 6),
        isSpring ? 4 : (this.momentumJump ? 2.5 : 1.5)
      );
    }

    tryBufferedJump() {
      if (this.grounded && jumpBufferFrames > 0) {
        this.jump();
        return true;
      }

      return false;
    }

    draw(ctx, camY) {
      ctx.save();

      const rx = this.x;
      const ry = this.y - camY;
      const rw = this.width;   // 24
      const rh = this.height;  // 24
      const dir = this.facing === 'right' ? 1 : -1;

      // Squash/stretch based on vertical velocity for juicy feel
      const stretch = Math.max(-0.18, Math.min(0.18, this.vy * 0.012));
      const cx = rx + rw / 2; // horizontal center
      const cy = ry + rh / 2;
      let animationStretch = 0;
      if (!this.grounded && this.jumpAnimation === 'stretch') {
        animationStretch = Math.max(0, Math.min(0.24, -this.vy * 0.018));
      }
      if (!this.grounded && this.jumpAnimation === 'cartwheel') {
        const jumpProgress = TowerCore.clamp((CONFIG.momentumJumpForce - this.vy) / (CONFIG.momentumJumpForce * 2), 0, 1);
        this.jumpRotation = jumpProgress * Math.PI * 2 * (this.vx >= 0 ? 1 : -1);
      }
      ctx.translate(cx, cy);
      ctx.rotate(this.jumpRotation);
      ctx.scale(1 - stretch - animationStretch * 0.35, 1 + stretch + animationStretch);
      ctx.translate(-cx, -cy);

      // ---- Color palette (Icy-Tower-inspired "homeboy") ----
      const skin = '#f3c08b';
      const skinShade = '#d99f68';
      const hoodie = '#e8542e';   // baggy orange hoodie
      const hoodieShade = '#b53a1c';
      const pants = '#2e3a59';    // baggy denim jeans
      const pantsShade = '#1f2742';
      const beanie = '#1e6fd0';   // blue beanie
      const beanieCuff = '#1456a8';
      const shoe = '#f5f5f5';

      // ---------- LEGS (baggy jeans) ----------
      ctx.fillStyle = pants;
      // left leg
      ctx.fillRect(rx + 3, ry + 17, 7, 6);
      // right leg
      ctx.fillRect(rx + 14, ry + 17, 7, 6);
      // inner shadow between legs
      ctx.fillStyle = pantsShade;
      ctx.fillRect(rx + 10, ry + 17, 4, 5);
      // shoes (oversized sneakers)
      ctx.fillStyle = shoe;
      ctx.fillRect(rx + 2, ry + 22, 9, 2);
      ctx.fillRect(rx + 13, ry + 22, 9, 2);

      // ---------- TORSO (baggy hoodie) ----------
      // wide, slightly trapezoidal body for the baggy look
      ctx.fillStyle = hoodie;
      ctx.beginPath();
      ctx.moveTo(rx + 1, ry + 18);     // bottom-left, hem flares out
      ctx.lineTo(rx + 4, ry + 9);      // shoulder-left
      ctx.lineTo(rx + rw - 4, ry + 9); // shoulder-right
      ctx.lineTo(rx + rw - 1, ry + 18);// bottom-right
      ctx.closePath();
      ctx.fill();
      // hoodie pocket / shading
      ctx.fillStyle = hoodieShade;
      ctx.fillRect(rx + 7, ry + 14, 10, 3);
      // baggy sleeves hanging at sides
      ctx.fillStyle = hoodie;
      ctx.fillRect(rx, ry + 10, 4, 7);
      ctx.fillRect(rx + rw - 4, ry + 10, 4, 7);
      ctx.fillStyle = skin; // hands poking out of sleeves
      ctx.fillRect(rx, ry + 16, 4, 2);
      ctx.fillRect(rx + rw - 4, ry + 16, 4, 2);

      // ---------- HEAD ----------
      ctx.fillStyle = skin;
      ctx.fillRect(rx + 6, ry + 4, 12, 8);
      // jaw/cheek shading on the back side
      ctx.fillStyle = skinShade;
      if (dir === 1) ctx.fillRect(rx + 6, ry + 4, 2, 8);
      else ctx.fillRect(rx + 16, ry + 4, 2, 8);

      // face: eyes (look toward facing direction)
      ctx.fillStyle = '#1a1a22';
      const eyeY = ry + 7;
      if (dir === 1) {
        ctx.fillRect(rx + 13, eyeY, 2, 2);
        ctx.fillRect(rx + 16, eyeY, 2, 2);
      } else {
        ctx.fillRect(rx + 6, eyeY, 2, 2);
        ctx.fillRect(rx + 9, eyeY, 2, 2);
      }
      // little grin
      ctx.fillStyle = skinShade;
      if (dir === 1) ctx.fillRect(rx + 14, ry + 10, 3, 1);
      else ctx.fillRect(rx + 7, ry + 10, 3, 1);

      // ---------- BLUE BEANIE ----------
      // rounded dome cap
      ctx.fillStyle = beanie;
      ctx.beginPath();
      ctx.moveTo(rx + 5, ry + 5);
      ctx.quadraticCurveTo(rx + rw / 2, ry - 4, rx + rw - 5, ry + 5);
      ctx.lineTo(rx + rw - 5, ry + 5);
      ctx.lineTo(rx + 5, ry + 5);
      ctx.closePath();
      ctx.fill();
      // folded cuff/brim
      ctx.fillStyle = beanieCuff;
      ctx.fillRect(rx + 4, ry + 4, rw - 8, 3);
      // little pom-pom on top
      ctx.fillStyle = '#dbe9ff';
      ctx.beginPath();
      ctx.arc(rx + rw / 2, ry - 2, 2, 0, Math.PI * 2);
      ctx.fill();

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
        if (this.x <= 0 || this.x + this.width >= VIEW_WIDTH) {
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

  // Touch/Mouse Controls for casual mobile gameplay
  const touchInput = {
    left: false,
    right: false,
    graceDirection: 0,
    graceFrames: 0
  };

  function queueJump() {
    if (gameState === 'playing') {
      jumpBufferFrames = CONFIG.jumpBufferFrames;
    }
  }

  function getMoveDirection() {
    const keyboardLeft = keys['ArrowLeft'] || keys['KeyA'];
    const keyboardRight = keys['ArrowRight'] || keys['KeyD'];

    if (keyboardLeft && !keyboardRight) return -1;
    if (keyboardRight && !keyboardLeft) return 1;
    if (touchInput.left) return -1;
    if (touchInput.right) return 1;

    if (touchInput.graceFrames > 0) {
      touchInput.graceFrames--;
      return touchInput.graceDirection;
    }

    touchInput.graceDirection = 0;
    return 0;
  }

  function setTouchDirection(direction) {
    touchInput.left = direction < 0;
    touchInput.right = direction > 0;
    touchInput.graceDirection = 0;
    touchInput.graceFrames = 0;
  }

  function handlePointerUp() {
    if (touchInput.left || touchInput.right) {
      touchInput.graceDirection = touchInput.left ? -1 : 1;
      touchInput.graceFrames = CONFIG.inputGraceFrames;
    }
    touchInput.left = false;
    touchInput.right = false;
  }

  function resetThumbpad() {
    thumbPointerId = null;
    thumbOriginX = 0;
    thumbpad.classList.remove('active');
    thumbpad.classList.remove('tracking');
    thumbstick.style.setProperty('--stick-x', '0px');
    handlePointerUp();
  }

  function updateThumbpad(e) {
    if (gameState !== 'playing' || !touchControlsEnabled) return;

    const rect = thumbpad.getBoundingClientRect();
    const maxTravel = rect.width * 0.28;
    const raw = Math.max(-maxTravel, Math.min(maxTravel, e.clientX - thumbOriginX));
    const normalized = raw / maxTravel;
    const direction = Math.abs(normalized) < 0.22 ? 0 : Math.sign(normalized);

    setTouchDirection(direction);
    thumbstick.style.setProperty('--stick-x', `${raw}px`);
    thumbpad.classList.toggle('active', direction !== 0);
  }

  function refreshTouchControlsUI() {
    const isPlaying = gameState === 'playing';
    const shouldShowControls = isPlaying && touchControlsEnabled;

    touchControls.classList.toggle('hidden', !shouldShowControls);
    touchControls.setAttribute('aria-hidden', String(!shouldShowControls));
    controlsToggleButton.classList.toggle('hidden', !isPlaying);
    controlsToggleButton.textContent = touchControlsEnabled ? 'Controls On' : 'Controls Off';
    controlsToggleButton.setAttribute('aria-pressed', String(touchControlsEnabled));

    if (!shouldShowControls) {
      resetThumbpad();
    }
  }

  movementZone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    thumbPointerId = e.pointerId;
    thumbOriginX = e.clientX;
    const zoneRect = movementZone.getBoundingClientRect();
    thumbpad.style.setProperty('--pad-x', `${e.clientX - zoneRect.left}px`);
    thumbpad.style.setProperty('--pad-y', `${e.clientY - zoneRect.top}px`);
    thumbpad.classList.add('tracking');
    movementZone.setPointerCapture(e.pointerId);
    updateThumbpad(e);
  });

  movementZone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== thumbPointerId) return;
    e.preventDefault();
    updateThumbpad(e);
  });

  movementZone.addEventListener('pointerup', (e) => {
    if (e.pointerId !== thumbPointerId) return;
    e.preventDefault();
    resetThumbpad();
  });

  movementZone.addEventListener('pointercancel', (e) => {
    if (e.pointerId !== thumbPointerId) return;
    resetThumbpad();
  });

  jumpButton.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    queueJump();
  });

  controlsToggleButton.addEventListener('click', () => {
    touchControlsEnabled = !touchControlsEnabled;
    localStorage.setItem('lava_tower_touch_controls', touchControlsEnabled ? 'on' : 'off');
    refreshTouchControlsUI();
  });

  function refreshSoundUI() {
    muteButton.textContent = muted ? 'Sound Off' : 'Sound On';
    muteButton.setAttribute('aria-pressed', String(muted));
  }

  muteButton.addEventListener('click', () => {
    muted = !muted;
    localStorage.setItem('lava_tower_muted', muted ? 'on' : 'off');
    refreshSoundUI();
  });

  // Keyboard Event Listeners
  window.addEventListener('keydown', (e) => {
    const wasDown = keys[e.code];
    keys[e.code] = true;

    if (!wasDown && ['Space', 'ArrowUp', 'KeyW'].includes(e.code)) {
      queueJump();
    }

    if (!wasDown && e.code === 'Escape') {
      if (gameState === 'playing') pauseGame();
      else if (gameState === 'paused') resumeGame();
    }

    if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) {
      touchInput.graceDirection = 0;
      touchInput.graceFrames = 0;
    }
    
    // Prevent scrolling with arrows/space keys when in game
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  function resetInput() {
    keys = {};
    jumpBufferFrames = 0;
    resetThumbpad();
  }

  window.addEventListener('blur', resetInput);
  document.addEventListener('visibilitychange', () => {
    resetInput();
    if (document.hidden && gameState === 'playing') pauseGame();
  });

  // Load Starfield Parallax Particles
  function initStars() {
    stars = [];
    for (let i = 0; i < 40; i++) {
      stars.push({
        x: Math.random() * VIEW_WIDTH,
        y: Math.random() * VIEW_HEIGHT,
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
      let sy = (star.y - camY * star.parallax) % VIEW_HEIGHT;
      if (sy < 0) sy += VIEW_HEIGHT;
      
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
    const basePlatform = new Platform(VIEW_WIDTH / 2 - CONFIG.platformWidth / 2, VIEW_HEIGHT - 50, 'normal');
    platforms.push(basePlatform);
    
    // Generate up the tower
    let currentY = VIEW_HEIGHT - 120;
    let previous = basePlatform;
    while (currentY > -1000) {
      previous = spawnPlatformAtY(currentY, previous);
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

  function spawnPlatformAtY(y, previous) {
    const gap = previous ? previous.y - y : CONFIG.minPlatformGap;
    const x = previous
      ? TowerCore.getReachablePlatformX(previous, gap, CONFIG.platformWidth, VIEW_WIDTH)
      : Math.random() * (VIEW_WIDTH - CONFIG.platformWidth);
    
    // Determine platform type based on current height
    const heightProgress = Math.min(Math.abs(y) / CONFIG.maxDifficultyHeight, 1);
    const roll = Math.random();
    
    let type = 'normal';
    
    if (heightProgress < 0.2) {
      // Basic platforms
      if (roll < 0.15) type = 'moving';
    } else if (heightProgress < 0.5) {
      // Mix in spring and a few crumbling platforms
      if (roll < 0.2) type = 'moving';
      else if (roll < 0.33) type = 'spring';
      else if (roll < 0.43) type = 'fragile';
    } else {
      // Advanced levels (fewer normal platforms, more hazards)
      if (roll < 0.32) type = 'moving';
      else if (roll < 0.5) type = 'spring';
      else if (roll < 0.68) type = 'fragile';
    }

    const platform = new Platform(x, y, type);
    platforms.push(platform);
    return platform;
  }

  function maintainPlatforms() {
    // Generate new platforms ahead of camera
    let highestPlatformY = VIEW_HEIGHT;
    let highestPlatform = null;
    platforms.forEach(p => {
      if (p.y < highestPlatformY) {
        highestPlatformY = p.y;
        highestPlatform = p;
      }
    });

    while (highestPlatformY > cameraY - 400) {
      highestPlatformY -= getRandomGap(highestPlatformY);
      highestPlatform = spawnPlatformAtY(highestPlatformY, highestPlatform);
    }

    // Clean up old platforms too far below camera
    platforms = platforms.filter(p => p.y < cameraY + VIEW_HEIGHT + 150);
  }

  // LocalStorage Leaderboard handling
  function getLeaderboard() {
    return TowerCore.parseLeaderboard(localStorage.getItem('lava_tower_leaderboard'));
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

    const skyGrad = ctx.createLinearGradient(0, 0, 0, VIEW_HEIGHT);
    skyGrad.addColorStop(0, topColor);
    skyGrad.addColorStop(1, bottomColor);
    
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
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
    for (let x = 0; x <= VIEW_WIDTH; x += 10) {
      const yOffset = Math.sin(x * 0.03 + gameTime * speed) * waveHeight;
      ctx.lineTo(x, relativeLavaY + yOffset);
    }
    ctx.lineTo(VIEW_WIDTH, VIEW_HEIGHT);
    ctx.lineTo(0, VIEW_HEIGHT);
    ctx.closePath();
    ctx.fill();

    // Wave 2
    ctx.shadowBlur = 0; // turn off shadow for second layer
    ctx.fillStyle = 'rgba(255, 110, 0, 0.4)';
    ctx.beginPath();
    ctx.moveTo(0, relativeLavaY + 5);
    for (let x = 0; x <= VIEW_WIDTH; x += 10) {
      const yOffset = Math.cos(x * 0.02 + gameTime * (speed * 0.8)) * (waveHeight * 0.8);
      ctx.lineTo(x, relativeLavaY + 5 + yOffset);
    }
    ctx.lineTo(VIEW_WIDTH, VIEW_HEIGHT);
    ctx.lineTo(0, VIEW_HEIGHT);
    ctx.closePath();
    ctx.fill();

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

  function registerLanding(platformY) {
    const climbed = player.jumpStartY - (platformY - player.height);
    if (player.momentumJump && climbed >= 75) {
      combo++;
      bestCombo = Math.max(bestCombo, combo);
      comboMessageTime = 90;
      gameStatus.textContent = `High jump combo ${combo}`;
      spawnExplosion(player.x + player.width / 2, player.y + player.height, '#ffd700', 5 + combo, 2);
    } else if (combo > 0) {
      combo = 0;
      comboMessageTime = 45;
      gameStatus.textContent = 'Combo ended';
    }
    player.momentumJump = false;
    player.jumpAnimation = 'none';
    player.jumpRotation = 0;
  }

  function updateGame() {
    gameTime++;
    player.update();
    player.grounded = false;

    if (player.y < cameraY + VIEW_HEIGHT * 0.45) {
      targetCameraY = player.y - VIEW_HEIGHT * 0.45;
    }
    if (jumpBufferFrames > 0) jumpBufferFrames--;
    if (comboMessageTime > 0) comboMessageTime--;
    cameraY += (targetCameraY - cameraY) * 0.12;

    lavaSpeed = Math.min(lavaSpeed + CONFIG.lavaAcceleration, CONFIG.maxLavaSpeed);
    const difficultyMultiplier = 1 + (Math.abs(player.y) / CONFIG.maxDifficultyHeight) * 0.7;
    lavaY -= Math.min(lavaSpeed * difficultyMultiplier, CONFIG.maxLavaSpeed);
    const viewportBottom = cameraY + VIEW_HEIGHT;
    lavaY = Math.min(lavaY, viewportBottom + 120);

    currentScore = Math.max(currentScore, Math.floor(Math.max(0, (VIEW_HEIGHT - 100) - player.y) / 10));
    maintainPlatforms();

    if (player.vy > 0) {
      for (const plat of platforms) {
        if (plat.broken) continue;
        const crossedTop = player.y + player.height >= plat.y &&
          player.y + player.height - player.vy <= plat.y + 12;
        const overlaps = player.x + player.width > plat.x && player.x < plat.x + plat.width;
        if (!crossedTop || !overlaps) continue;

        const hitSpring = plat.hasSpring &&
          player.x + player.width > plat.springX &&
          player.x < plat.springX + CONFIG.springWidth &&
          player.y + player.height - player.vy <= plat.springY + CONFIG.springHeight;
        player.y = plat.y - player.height;
        registerLanding(plat.y);

        if (hitSpring) {
          plat.springActivated = true;
          plat.springFrame = 0;
          screenShake = 8;
          player.jump(CONFIG.springJumpForce);
          spawnExplosion(plat.springX + CONFIG.springWidth / 2, plat.springY, '#ff3366', 8, 3);
        } else {
          player.vy = 0;
          player.grounded = true;
          player.tryBufferedJump();
          if (plat.type === 'fragile') plat.broken = true;
        }
        break;
      }
    }

    platforms = platforms.filter(platform => platform.update());
    particles = particles.filter(particle => {
      particle.update();
      return particle.life > 0;
    });
    if (Math.random() < 0.2) {
      particles.push(new Particle(Math.random() * VIEW_WIDTH, lavaY - Math.random() * 10, '#ffaa00', Math.random() * 3 + 1, (Math.random() - 0.5) * 1.5, -Math.random() * 2 - 0.5, Math.random() * 40 + 20));
    }

    if (player.y + player.height >= lavaY || player.y - cameraY > VIEW_HEIGHT + 100) gameOver();
  }

  function renderGame() {
    ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.save();
    applyScreenShake();
    drawSkyGradient(ctx, cameraY);
    updateAndDrawStars(ctx, cameraY);
    platforms.forEach(platform => platform.draw(ctx, cameraY));
    particles.forEach(particle => particle.draw(ctx, cameraY));
    drawLava(ctx, cameraY);
    if (player) player.draw(ctx, cameraY);
    ctx.restore();
    drawHUD();
  }

  // Fixed-step simulation keeps gameplay identical across display refresh rates.
  function tick(timestamp) {
    if (gameState !== 'playing') return;
    if (!lastTimestamp) lastTimestamp = timestamp;
    accumulator += Math.min(timestamp - lastTimestamp, 100);
    lastTimestamp = timestamp;
    while (accumulator >= FIXED_STEP_MS && gameState === 'playing') {
      updateGame();
      accumulator -= FIXED_STEP_MS;
    }
    if (gameState === 'playing') {
      renderGame();
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

    if (combo > 0 || comboMessageTime > 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = combo > 0 ? '#ffd700' : 'rgba(255,255,255,0.55)';
      ctx.font = "800 18px 'Outfit'";
      ctx.fillText(combo > 0 ? `HIGH JUMP x${combo}` : 'COMBO ENDED', VIEW_WIDTH / 2, 70);
      ctx.textAlign = 'left';
    }
    
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
      ctx.strokeRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
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
    bestTag.textContent = isNewRecord ? 'NEW PERSONAL BEST!' : (bestCombo > 1 ? `Best combo: x${bestCombo}` : '');
    if (isNewRecord) sound.play('highscore');
    
    // Show GameOver overlay
    gameoverOverlay.classList.remove('hidden');
    pauseButton.classList.add('hidden');
    refreshTouchControlsUI();
  }

  function pauseGame() {
    if (gameState !== 'playing') return;
    gameState = 'paused';
    resetInput();
    cancelAnimationFrame(animationFrameId);
    pauseOverlay.classList.remove('hidden');
    pauseButton.classList.add('hidden');
    refreshTouchControlsUI();
    gameStatus.textContent = 'Game paused';
  }

  function resumeGame() {
    if (gameState !== 'paused') return;
    gameState = 'playing';
    lastTimestamp = 0;
    accumulator = 0;
    pauseOverlay.classList.add('hidden');
    pauseButton.classList.remove('hidden');
    refreshTouchControlsUI();
    animationFrameId = requestAnimationFrame(tick);
    gameStatus.textContent = 'Game resumed';
  }

  function showMenu() {
    gameState = 'menu';
    menuOverlay.classList.remove('hidden');
    gameoverOverlay.classList.add('hidden');
    leaderboardOverlay.classList.add('hidden');
    pauseOverlay.classList.add('hidden');
    pauseButton.classList.add('hidden');
    refreshTouchControlsUI();
    initStars();
    cameraY = 0;
    lavaY = VIEW_HEIGHT + 40;
    generateInitialPlatforms();
    cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(menuTick);
  }

  // Start a fresh new round
  function startNewGame() {
    // Initialize Audio Context on user gesture
    sound.init();

    gameState = 'playing';
    currentScore = 0;
    combo = 0;
    bestCombo = 0;
    comboMessageTime = 0;
    cameraY = 0;
    targetCameraY = 0;
    lavaY = VIEW_HEIGHT + 150;
    lavaSpeed = CONFIG.baseLavaSpeed;
    keys = {};
    touchInput.left = false;
    touchInput.right = false;
    touchInput.graceDirection = 0;
    touchInput.graceFrames = 0;
    jumpBufferFrames = 0;
    lastTimestamp = 0;
    accumulator = 0;

    // Reset components
    player = new Player();
    generateInitialPlatforms();
    particles = [];
    initStars();

    // Hide overlays
    menuOverlay.classList.add('hidden');
    gameoverOverlay.classList.add('hidden');
    leaderboardOverlay.classList.add('hidden');
    pauseOverlay.classList.add('hidden');
    pauseButton.classList.remove('hidden');
    refreshTouchControlsUI();

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
    refreshTouchControlsUI();
  });

  btnBack.addEventListener('click', () => {
    gameState = 'menu';
    menuOverlay.classList.remove('hidden');
    leaderboardOverlay.classList.add('hidden');
    refreshTouchControlsUI();
  });

  btnRetry.addEventListener('click', () => {
    startNewGame();
  });

  pauseButton.addEventListener('click', pauseGame);
  resumeButton.addEventListener('click', resumeGame);
  pauseMenuButton.addEventListener('click', showMenu);

  menuButton.addEventListener('click', showMenu);

  // Main menu backdrop animation tick
  function menuTick() {
    gameTime++;
    ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    
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
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  initStars();
  cameraY = 0;
  lavaY = VIEW_HEIGHT + 50;
  generateInitialPlatforms();
  refreshTouchControlsUI();
  refreshSoundUI();
  animationFrameId = requestAnimationFrame(menuTick);
});
