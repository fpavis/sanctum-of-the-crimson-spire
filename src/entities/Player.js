import * as THREE from 'three';
import { Viewmodel } from './Viewmodel.js';
import { audioSynth } from '../engine/AudioSynthesizer.js';

export class Player {
  constructor(camera, scene, domElement, textures, spellSystem) {
    this.camera = camera;
    this.scene = scene;
    this.domElement = domElement;
    this.spellSystem = spellSystem;

    // First person camera rig
    this.position = new THREE.Vector3(0, 1.75, 18);
    this.velocity = new THREE.Vector3();
    this.camera.position.copy(this.position);
    this.camera.rotation.order = 'YXZ';

    // Base & Scaled Player Stats (+1% per Arcane Level!)
    this.characterLevel = 1;
    this.xp = 0;
    this.xpToNextLevel = 100;
    this.statMultiplier = 1.0; // Increases by +1% (0.01) per level
    this.baseMaxHealth = 100;
    this.baseMaxMana = 100;
    this.maxHealth = 100;
    this.health = 100;
    this.maxMana = 100;
    this.mana = 100;
    this.manaRegenRate = 10;
    this.isDead = false;
    this.score = 0;
    this.grimoiresCollected = 0;

    // Level-Up Popup State
    this.levelUpTimer = 0;
    this.levelUpTitle = '';
    this.levelUpSubtitle = '';

    // Retro Dungeon-Crawler Physics + 3D Platforming Jump & Jump Dash
    this.walkSpeed = 4.35;
    this.sprintMultiplier = 1.35;
    this.jumpForce = 8.4;
    this.gravity = 18.0;
    this.isGrounded = true;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.hazardCooldown = 0;
    this.chillTimer = 0;
    this.playerRadius = 0.50;
    this.playerHeight = 1.75;
    this.currentFloorY = 0;

    // Jump Dash Mobility System (Unlocked by 2nd Grimoire between Ice & Lightning, or Cheat 5555 / Debug Button)
    this.jumpDashUnlocked = false;
    this.debugDashUnlocked = false;
    this.jumpDashCooldown = 0;
    this.jumpDashMaxCooldown = 1.35;
    this.dashTimer = 0;
    this.dashSpeed = 16.8;
    this.dashVector = new THREE.Vector3();
    this.hasAirDashed = false;
    this.lastShiftTapTime = 0;
    this.cheatCodeBuffer = '';

    // Input state
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
      jump: false,
      interact: false
    };

    // Spell inventory & Direct Mouse-Click Combo Bindings:
    // Left-Click (LMB) -> Pyrobomb (0)
    // Right-Click (RMB) -> Frost Lance (1) [Grimoire I]
    // Shift (In Air / 2x Ground) -> Jump Dash [Grimoire II]
    // Middle-Click (MMB) -> Arcane Arc (2) [Grimoire III]
    // Left+Right Click Together (L+R) -> Aegis Ward (3) [Grimoire IV]
    this.spells = [
      { id: 'fireball', name: 'Pyrobomb', manaCost: 15, cooldown: 0.72, key: 'LMB', unlocked: true },
      { id: 'frost', name: 'Frost Lance', manaCost: 12, cooldown: 0.58, key: 'RMB', unlocked: false },
      { id: 'lightning', name: 'Arcane Arc', manaCost: 22, cooldown: 0.85, key: 'MMB', unlocked: false },
      { id: 'aegis', name: 'Aegis Ward', manaCost: 28, cooldown: 2.2, key: 'L+R', unlocked: false }
    ];
    this.activeSpellIndex = 0;
    this.spellCooldowns = [0, 0, 0, 0];
    this.mouseButtons = { left: false, right: false, middle: false };
    this.pendingMouseCast = null;

    this.stepTimer = 0;
    this.hurtTimer = 0;

    this.isLocked = false;
    this.yaw = 0;
    this.pitch = 0;
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');

    // Initialize Viewmodel
    this.viewmodel = new Viewmodel(this.camera, textures.hands, textures.staff);

    this.enemyManager = null;
    this.level = null;
    this.onInteractCallback = null;

    this.setupInputs();
  }

  setCombatReferences(enemyManager, level) {
    this.enemyManager = enemyManager;
    this.level = level;
  }

  setSpawn(x, y, z, yaw = 0, pitch = 0) {
    this.currentFloorY = y;
    this.position.set(x, y + this.playerHeight, z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = THREE.MathUtils.clamp(pitch, -1.38, 1.38);
    this.euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this.euler);
    this.camera.position.copy(this.position);
  }

  /**
   * Awards Experience (XP) and triggers automatic +1% per level stat scaling & Level-Up Popup
   */
  gainXP(amount) {
    if (this.isDead || amount <= 0) return;
    this.xp += amount;

    while (this.xp >= this.xpToNextLevel) {
      this.xp -= this.xpToNextLevel;
      this.characterLevel++;
      this.xpToNextLevel = Math.round(100 * Math.pow(1.16, this.characterLevel - 1));

      // Behind-the-scenes +1% per level boost to Spell Damage, Max Health, and Max Mana
      this.statMultiplier = 1.0 + (this.characterLevel - 1) * 0.01;
      const prevMaxHp = this.maxHealth;
      const prevMaxMp = this.maxMana;

      this.maxHealth = Number((this.baseMaxHealth * this.statMultiplier).toFixed(1));
      this.maxMana = Number((this.baseMaxMana * this.statMultiplier).toFixed(1));

      this.health = Math.min(this.maxHealth, this.health + (this.maxHealth - prevMaxHp) + 10);
      this.mana = Math.min(this.maxMana, this.mana + (this.maxMana - prevMaxMp) + 15);

      const bonusPct = this.characterLevel - 1;
      this.levelUpTimer = 4.0;
      this.levelUpTitle = `ARCANE LEVEL ${this.characterLevel} ASCENDED`;
      this.levelUpSubtitle = `PASSIVE RESONANCE: +${bonusPct}% SPELL DAMAGE, MAX HEALTH & MAX MANA`;

      audioSynth.playGrimoirePickup();
      if (this.spellSystem && this.spellSystem.telemetry) {
        this.spellSystem.telemetry.spawnFloatingText(
          this.position.clone().add(new THREE.Vector3(0, 0.6, 0)),
          `LEVEL UP! LVL ${this.characterLevel} (+1% ALL STATS)`,
          '#ffd700',
          1.4
        );
      }
    }
  }

  applyChill(duration = 1.6) {
    this.chillTimer = Math.max(this.chillTimer, duration);
  }

  /**
   * Enables Jump Dash immediately via Cheat Code 5555 or the HUD Debug Button
   */
  enableJumpDashDebug(fromCheatCode = false) {
    this.debugDashUnlocked = true;
    this.jumpDashUnlocked = true;
    this.jumpDashCooldown = 0;
    this.hasAirDashed = false;

    this.levelUpTimer = 3.8;
    this.levelUpTitle = fromCheatCode ? 'CHEAT CODE 5555 ACTIVATED' : 'DEBUG JUMP DASH ENABLED';
    this.levelUpSubtitle = 'AETHER JUMP DASH UNLOCKED [SHIFT IN AIR OR 2x SHIFT ON GROUND]';

    audioSynth.playGrimoirePickup();
    if (this.spellSystem && this.spellSystem.postProcessor) {
      this.spellSystem.postProcessor.triggerChromaticPulse(0.85);
    }
    if (this.spellSystem && this.spellSystem.telemetry) {
      this.spellSystem.telemetry.spawnFloatingText(
        this.position.clone().add(new THREE.Vector3(0, 0.5, 0)),
        fromCheatCode ? 'CHEAT 5555: JUMP DASH UNLOCKED!' : 'DEBUG: JUMP DASH ENABLED!',
        '#00ffcc',
        1.35
      );
    }
  }

  /**
   * Executes an Aether Jump Dash in the movement or look direction
   */
  triggerJumpDash() {
    if (!this.jumpDashUnlocked) {
      if (this.spellSystem && this.spellSystem.telemetry) {
        this.spellSystem.telemetry.registerHit(
          true,
          'JUMP DASH LOCKED — COLLECT 2ND GRIMOIRE OR INPUT CHEAT 5555'
        );
      }
      return false;
    }

    if (this.jumpDashCooldown > 0 || (this.hasAirDashed && !this.isGrounded)) {
      return false;
    }

    const dir = new THREE.Vector3();
    if (this.keys.forward) dir.z -= 1;
    if (this.keys.backward) dir.z += 1;
    if (this.keys.left) dir.x -= 1;
    if (this.keys.right) dir.x += 1;

    if (dir.lengthSq() < 0.001) {
      dir.set(0, 0, -1);
    } else {
      dir.normalize();
    }

    const yawRotation = new THREE.Euler(0, this.euler.y, 0, 'YXZ');
    dir.applyEuler(yawRotation).normalize();

    this.dashVector.copy(dir);
    this.dashTimer = 0.24;
    this.velocity.x = dir.x * this.dashSpeed;
    this.velocity.z = dir.z * this.dashSpeed;
    this.velocity.y = Math.max(this.velocity.y, 5.8);
    this.isGrounded = false;
    this.coyoteTimer = 0;
    this.hasAirDashed = true;
    this.jumpDashCooldown = this.jumpDashMaxCooldown;

    audioSynth.playAegisCast();
    if (this.spellSystem) {
      if (this.spellSystem.postProcessor) {
        this.spellSystem.postProcessor.triggerChromaticPulse(0.7);
      }
      const sparkOrigin = this.position.clone().add(new THREE.Vector3(0, -0.4, 0));
      this.spellSystem.createSparks(sparkOrigin, 0x00ffcc, 12);
      if (this.spellSystem.telemetry) {
        this.spellSystem.telemetry.spawnFloatingText(
          this.position.clone().add(dir.clone().multiplyScalar(1.8)),
          'JUMP DASH',
          '#55ffff',
          1.1
        );
      }
    }
    return true;
  }

  setupInputs() {
    this.domElement.addEventListener('click', () => {
      if (!this.isLocked) {
        try {
          const lockPromise = this.domElement.requestPointerLock({ unadjustedMovement: true });
          if (lockPromise && typeof lockPromise.catch === 'function') {
            lockPromise.catch(() => this.domElement.requestPointerLock());
          }
        } catch (err) {
          this.domElement.requestPointerLock();
        }
      }
    });

    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked || this.isDead) return;

      const movementX = e.movementX || 0;
      const movementY = e.movementY || 0;

      // Reject abnormal OS pointer-lock re-centering spikes that cause camera twitching
      if (Math.abs(movementX) > 160 || Math.abs(movementY) > 160) return;

      const sensitivity = 0.0018;
      this.yaw -= movementX * sensitivity;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - movementY * sensitivity,
        -1.38,
        1.38
      );

      this.euler.set(this.pitch, this.yaw, 0, 'YXZ');
      this.camera.quaternion.setFromEuler(this.euler);
    });

    window.addEventListener('keydown', (e) => {
      if (this.isDead) return;
      audioSynth.ensureContext();

      // Track 4-digit cheat code 5555
      if (e.key && e.key.length === 1) {
        this.cheatCodeBuffer = (this.cheatCodeBuffer + e.key).slice(-8);
        if (this.cheatCodeBuffer.endsWith('5555')) {
          this.cheatCodeBuffer = '';
          this.enableJumpDashDebug(true);
        }
      }

      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.keys.forward = true; break;
        case 'KeyS': case 'ArrowDown': this.keys.backward = true; break;
        case 'KeyA': case 'ArrowLeft': this.keys.left = true; break;
        case 'KeyD': case 'ArrowRight': this.keys.right = true; break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.keys.sprint = true;
          if (!e.repeat) {
            const nowMs = performance.now();
            if (!this.isGrounded) {
              // Shift while in air triggers Jump Dash immediately
              this.triggerJumpDash();
              this.lastShiftTapTime = 0;
            } else if (nowMs - this.lastShiftTapTime <= 420) {
              // Double-press Shift while on ground triggers Jump Dash
              this.triggerJumpDash();
              this.lastShiftTapTime = 0;
            } else {
              this.lastShiftTapTime = nowMs;
            }
          }
          break;
        case 'Space':
          if (this.isGrounded || this.coyoteTimer > 0) {
            this.velocity.y = this.jumpForce;
            this.isGrounded = false;
            this.hasAirDashed = false;
            this.coyoteTimer = 0;
            this.jumpBufferTimer = 0;
            audioSynth.playFootstep();
          } else {
            this.jumpBufferTimer = 0.16;
          }
          break;
        case 'Digit1': this.selectSpell(0); break;
        case 'Digit2': this.selectSpell(1); break;
        case 'Digit3': this.selectSpell(2); break;
        case 'Digit4': this.selectSpell(3); break;
        case 'KeyQ': this.cycleSpell(-1); break;
        case 'KeyE':
          if (this.onInteractCallback && this.onInteractCallback()) {
            // Interacted with portal/stage gate
          } else {
            this.cycleSpell(1);
          }
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.keys.forward = false; break;
        case 'KeyS': case 'ArrowDown': this.keys.backward = false; break;
        case 'KeyA': case 'ArrowLeft': this.keys.left = false; break;
        case 'KeyD': case 'ArrowRight': this.keys.right = false; break;
        case 'ShiftLeft': case 'ShiftRight': this.keys.sprint = false; break;
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (this.isDead) return;
      if (e.target && e.target.closest && e.target.closest('button, .spell-slot, .modal-content, #loading-screen')) {
        return;
      }
      audioSynth.ensureContext();

      if (e.button === 1) {
        // Middle Click -> Arcane Arc (Lightning)
        e.preventDefault();
        this.mouseButtons.middle = true;
        this.pendingMouseCast = null;
        this.castSpellByIndex(2);
        return;
      }

      if (e.button === 0 || e.button === 2) {
        if (e.button === 0) this.mouseButtons.left = true;
        if (e.button === 2) this.mouseButtons.right = true;

        const targetIdx = e.button === 0 ? 0 : 1;
        const isChord =
          (this.mouseButtons.left && this.mouseButtons.right) ||
          (e.buttons & 3) === 3 ||
          (this.pendingMouseCast && this.pendingMouseCast.index !== targetIdx);

        if (isChord) {
          // Left + Right Click Together -> Aegis Ward
          this.pendingMouseCast = null;
          this.castSpellByIndex(3);
        } else {
          // 55ms chord window to allow simultaneous Left+Right click before firing LMB (Pyrobomb) or RMB (Frost Lance)
          this.pendingMouseCast = { index: targetIdx, timer: 0.055 };
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseButtons.left = false;
      if (e.button === 2) this.mouseButtons.right = false;
      if (e.button === 1) this.mouseButtons.middle = false;
    });

    window.addEventListener('wheel', (e) => {
      if (!this.isLocked || this.isDead) return;
      if (e.deltaY > 0) {
        this.cycleSpell(1);
      } else if (e.deltaY < 0) {
        this.cycleSpell(-1);
      }
    });
  }

  selectSpell(index) {
    const targetIdx = (index + this.spells.length) % this.spells.length;
    const spell = this.spells[targetIdx];

    if (!spell.unlocked) {
      if (this.spellSystem && this.spellSystem.telemetry) {
        this.spellSystem.telemetry.registerHit(
          true,
          `${spell.name.toUpperCase()} LOCKED — COLLECT AN ELDER GRIMOIRE TO UNLOCK`
        );
      }
      return false;
    }

    this.activeSpellIndex = targetIdx;
    if (spell.id === 'fireball' || spell.id === 'aegis') {
      this.viewmodel.setMode('hands');
    } else {
      this.viewmodel.setMode('staff');
    }
    return true;
  }

  castSpellByIndex(index) {
    if (!this.selectSpell(index)) return false;
    return this.castActiveSpell();
  }

  cycleSpell(direction) {
    const unlockedIndices = this.spells
      .map((s, idx) => (s.unlocked ? idx : -1))
      .filter((idx) => idx !== -1);
    if (unlockedIndices.length <= 1) return;

    const curPos = unlockedIndices.indexOf(this.activeSpellIndex);
    const nextPos = (curPos + direction + unlockedIndices.length) % unlockedIndices.length;
    this.selectSpell(unlockedIndices[nextPos]);
  }

  /**
   * Unlocks abilities in exact Grimoire progression order:
   * 1st Grimoire -> Frost Lance (Ice)
   * 2nd Grimoire -> Jump Dash (Mobility — between Ice and Lightning!)
   * 3rd Grimoire -> Arcane Arc (Lightning)
   * 4th Grimoire -> Aegis Ward (Shield)
   */
  unlockNextSpell(stageId = '') {
    this.grimoiresCollected++;
    this.gainXP(85);

    if (stageId === 'stage2' && !this.jumpDashUnlocked) {
      this.jumpDashUnlocked = true;
      return `GRIMOIRE RECOVERED: UNLOCKED JUMP DASH [SHIFT IN AIR / 2x SHIFT]`;
    }

    // 1. Frost Lance (Ice)
    if (!this.spells[1].unlocked) {
      this.spells[1].unlocked = true;
      this.selectSpell(1);
      return `GRIMOIRE RECOVERED: UNLOCKED ${this.spells[1].name.toUpperCase()} [${this.spells[1].key}]`;
    }

    // 2. Jump Dash (Unlocked with 2nd Grimoire, between Ice and Lightning!)
    if (!this.jumpDashUnlocked) {
      this.jumpDashUnlocked = true;
      return `GRIMOIRE RECOVERED: UNLOCKED JUMP DASH [SHIFT IN AIR / 2x SHIFT]`;
    }

    // 3. Arcane Arc (Lightning)
    if (!this.spells[2].unlocked) {
      this.spells[2].unlocked = true;
      this.selectSpell(2);
      return `GRIMOIRE RECOVERED: UNLOCKED ${this.spells[2].name.toUpperCase()} [${this.spells[2].key}]`;
    }

    // 4. Aegis Ward (Shield)
    if (!this.spells[3].unlocked) {
      this.spells[3].unlocked = true;
      this.selectSpell(3);
      return `GRIMOIRE RECOVERED: UNLOCKED ${this.spells[3].name.toUpperCase()} [${this.spells[3].key}]`;
    }

    this.baseMaxMana = 150;
    this.maxMana = Number((this.baseMaxMana * this.statMultiplier).toFixed(1));
    this.mana = this.maxMana;
    this.manaRegenRate = 18;
    return `ALL GRIMOIRES RECOVERED: ARCHMAGE OVERDRIVE ACTIVE`;
  }

  castActiveSpell() {
    const spell = this.spells[this.activeSpellIndex];
    if (!spell || !spell.unlocked) return false;
    if (this.spellCooldowns[this.activeSpellIndex] > 0) return false;
    if (this.mana < spell.manaCost) return false;

    this.mana -= spell.manaCost;
    this.spellCooldowns[this.activeSpellIndex] = spell.cooldown;

    this.viewmodel.triggerCast(spell.id);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const origin = this.camera.position.clone().add(forward.clone().multiplyScalar(0.75));
    origin.y -= 0.15;

    const activeEnemies = this.enemyManager ? this.enemyManager.getAliveEnemies() : [];
    const walls = this.level ? this.level.walls : [];
    const destructibles = this.level ? this.level.destructibles : [];

    // Apply character level statMultiplier (+1% per level) to all spells
    if (spell.id === 'fireball') {
      this.spellSystem.castPyrobomb(origin, forward, this.statMultiplier);
    } else if (spell.id === 'frost') {
      this.spellSystem.castFrostLance(origin, forward, this.statMultiplier);
    } else if (spell.id === 'lightning') {
      this.spellSystem.castArcaneLightning(origin, forward, activeEnemies, walls, destructibles, this.statMultiplier, this);
    } else if (spell.id === 'aegis') {
      this.spellSystem.castAegisShield(this, activeEnemies, this.statMultiplier);
    }

    return true;
  }

  takeDamage(amount) {
    if (this.isDead) return;
    if (this.spellSystem.shieldActive) {
      audioSynth.playAegisCast();
      return;
    }

    this.health = Math.max(0, this.health - amount);
    this.hurtTimer = 0.55;
    audioSynth.playPlayerHurt();

    if (this.health <= 0) {
      this.isDead = true;
    }
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
    audioSynth.playPotionDrink('health');
  }

  restoreMana(amount) {
    this.mana = Math.min(this.maxMana, this.mana + amount);
    audioSynth.playPotionDrink('mana');
  }

  update(delta, walls = [], doors = []) {
    if (this.isDead) return;

    // Flush pending single-button mouse spell cast after 55ms chord window
    if (this.pendingMouseCast) {
      this.pendingMouseCast.timer -= delta;
      if (this.pendingMouseCast.timer <= 0) {
        const idx = this.pendingMouseCast.index;
        this.pendingMouseCast = null;
        this.castSpellByIndex(idx);
      }
    }

    // 1. Mana regeneration
    if (this.mana < this.maxMana) {
      this.mana = Math.min(this.maxMana, this.mana + this.manaRegenRate * delta);
    }

    // 2. Spell & Jump Dash Cooldown & Status Timers
    for (let i = 0; i < this.spellCooldowns.length; i++) {
      if (this.spellCooldowns[i] > 0) {
        this.spellCooldowns[i] = Math.max(0, this.spellCooldowns[i] - delta);
      }
    }
    if (this.jumpDashCooldown > 0) this.jumpDashCooldown = Math.max(0, this.jumpDashCooldown - delta);
    if (this.dashTimer > 0) this.dashTimer = Math.max(0, this.dashTimer - delta);
    if (this.hurtTimer > 0) this.hurtTimer -= delta;
    if (this.levelUpTimer > 0) this.levelUpTimer = Math.max(0, this.levelUpTimer - delta);
    if (this.chillTimer > 0) this.chillTimer = Math.max(0, this.chillTimer - delta);

    // 3. Movement & Active Jump Dash Impulse Calculation
    const moveVector = new THREE.Vector3();
    if (this.keys.forward) moveVector.z -= 1;
    if (this.keys.backward) moveVector.z += 1;
    if (this.keys.left) moveVector.x -= 1;
    if (this.keys.right) moveVector.x += 1;

    const chillFactor = this.chillTimer > 0 ? 0.72 : 1.0;
    const isMoving = moveVector.lengthSq() > 0.001;

    if (this.dashTimer > 0) {
      // High-speed Jump Dash burst
      this.velocity.x = this.dashVector.x * this.dashSpeed;
      this.velocity.z = this.dashVector.z * this.dashSpeed;
    } else if (isMoving) {
      moveVector.normalize();

      const yawRotation = new THREE.Euler(0, this.euler.y, 0, 'YXZ');
      moveVector.applyEuler(yawRotation);

      const currentSpeed = this.walkSpeed * chillFactor * (this.keys.sprint ? this.sprintMultiplier : 1.0);
      const targetVx = moveVector.x * currentSpeed;
      const targetVz = moveVector.z * currentSpeed;

      this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, targetVx, Math.min(1, delta * 9.0));
      this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, targetVz, Math.min(1, delta * 9.0));

      if (this.isGrounded) {
        this.stepTimer += delta * (this.keys.sprint ? 1.35 : 1.0);
        if (this.stepTimer > 0.58) {
          this.stepTimer = 0;
          audioSynth.playFootstep();
        }
      }
    } else {
      this.velocity.x *= Math.pow(0.08, delta);
      this.velocity.z *= Math.pow(0.08, delta);
    }

    if (this.coyoteTimer > 0) this.coyoteTimer = Math.max(0, this.coyoteTimer - delta);
    if (this.jumpBufferTimer > 0) this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - delta);
    if (this.hazardCooldown > 0) this.hazardCooldown = Math.max(0, this.hazardCooldown - delta);

    const currentFeetY = this.position.y - this.playerHeight;
    const prevFloorY = this.currentFloorY;

    if (!this.isGrounded) {
      this.velocity.y -= this.gravity * (this.dashTimer > 0 ? 0.35 : 1.0) * delta;
    }

    const stepX = this.velocity.x * delta;
    const stepZ = this.velocity.z * delta;
    const stepY = this.velocity.y * delta;

    const testPosX = this.position.clone();
    testPosX.x += stepX;
    if (!this.checkWallCollision(testPosX, walls, doors)) {
      this.position.x = testPosX.x;
    }

    const testPosZ = this.position.clone();
    testPosZ.z += stepZ;
    if (!this.checkWallCollision(testPosZ, walls, doors)) {
      this.position.z = testPosZ.z;
    }

    const nextFeetY = currentFeetY + (this.isGrounded ? 0 : stepY);
    this.currentFloorY = (this.level && this.level.getFloorHeight)
      ? this.level.getFloorHeight(this.position.x, this.position.z, Math.max(currentFeetY, nextFeetY))
      : 0;

    if (this.isGrounded && this.currentFloorY < prevFloorY - 0.65) {
      this.isGrounded = false;
      this.coyoteTimer = 0.18;
    }

    const minEyeY = this.currentFloorY + this.playerHeight;

    if (this.isGrounded) {
      this.hasAirDashed = false;
      this.position.y = THREE.MathUtils.lerp(this.position.y, minEyeY, Math.min(1, delta * 28.0));
      if (this.jumpBufferTimer > 0) {
        this.velocity.y = this.jumpForce;
        this.isGrounded = false;
        this.jumpBufferTimer = 0;
      }
    } else {
      this.position.y += stepY;
      if (this.velocity.y <= 0 && this.position.y <= minEyeY + 0.08) {
        this.position.y = minEyeY;
        this.velocity.y = 0;
        this.isGrounded = true;
        this.hasAirDashed = false;
        if (this.jumpBufferTimer > 0) {
          this.velocity.y = this.jumpForce;
          this.isGrounded = false;
          this.jumpBufferTimer = 0;
        }
      }
    }

    this.camera.position.copy(this.position);

    const speedRatio = this.dashTimer > 0 ? 1.8 : this.keys.sprint ? 1.25 : 1.0;
    this.viewmodel.update(delta, isMoving || this.dashTimer > 0, speedRatio);
  }

  checkWallCollision(pos, walls, doors) {
    if (this.level && this.level.isWithinStageBounds && !this.level.isWithinStageBounds(pos.x, pos.z, 0.0)) {
      return true;
    }

    const rawFeetY = pos.y - this.playerHeight;
    const stepFloorY =
      this.isGrounded && this.level && this.level.getFloorHeight
        ? this.level.getFloorHeight(pos.x, pos.z, Math.max(rawFeetY, this.currentFloorY))
        : rawFeetY;
    const effectiveFeetY = Math.max(rawFeetY, this.isGrounded ? Math.max(this.currentFloorY, stepFloorY) : rawFeetY);

    const feetY = effectiveFeetY + 0.35;
    const headY = effectiveFeetY + this.playerHeight + 0.15;
    const playerBox = new THREE.Box3(
      new THREE.Vector3(pos.x - this.playerRadius, feetY, pos.z - this.playerRadius),
      new THREE.Vector3(pos.x + this.playerRadius, headY, pos.z + this.playerRadius)
    );

    const curFeetY = this.position.y - this.playerHeight + 0.35;
    const curHeadY = this.position.y + 0.15;
    const currentBox = new THREE.Box3(
      new THREE.Vector3(this.position.x - this.playerRadius, curFeetY, this.position.z - this.playerRadius),
      new THREE.Vector3(this.position.x + this.playerRadius, curHeadY, this.position.z + this.playerRadius)
    );

    for (let i = 0; i < walls.length; i++) {
      const wall = walls[i];
      if (!wall.boundingBox) {
        wall.geometry.computeBoundingBox();
        wall.boundingBox = new THREE.Box3().setFromObject(wall);
      }
      if (playerBox.intersectsBox(wall.boundingBox)) {
        // Anti-stuck safeguard: if already overlapping a collider, allow movement that increases horizontal distance from its center
        if (currentBox.intersectsBox(wall.boundingBox)) {
          const cx = (wall.boundingBox.min.x + wall.boundingBox.max.x) * 0.5;
          const cz = (wall.boundingBox.min.z + wall.boundingBox.max.z) * 0.5;
          const curDistSq = (this.position.x - cx) ** 2 + (this.position.z - cz) ** 2;
          const nextDistSq = (pos.x - cx) ** 2 + (pos.z - cz) ** 2;
          if (nextDistSq > curDistSq + 0.0001) {
            continue;
          }
        }
        return true;
      }
    }

    for (let i = 0; i < doors.length; i++) {
      const door = doors[i];
      if (!door.isOpen) {
        if (!door.boundingBox) {
          door.mesh.geometry.computeBoundingBox();
          door.boundingBox = new THREE.Box3().setFromObject(door.mesh);
        }
        if (playerBox.intersectsBox(door.boundingBox)) {
          return true;
        }
      }
    }

    return false;
  }
}
