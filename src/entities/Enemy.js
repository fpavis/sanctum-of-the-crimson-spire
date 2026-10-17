import * as THREE from 'three';
import { AnimatedBillboardSprite } from '../engine/SpriteAnimator.js';
import { audioSynth } from '../engine/AudioSynthesizer.js';

/**
 * Enemy V3:
 * - Raycast Line-of-Sight (LOS) occlusion checks against 3D level walls via THREE.Raycaster
 * - 6 Mechanically Distinct Enemy Archetypes with unique damage reactions & attack patterns:
 *   1. Gargoyle Stalker   : Wing-Flank lateral dodge on hit + leaping claw lunge
 *   2. Skeleton Sorcerer  : Arcane Blink Teleport when rushed/hit + homing soul orbs
 *   3. Crimson Magma Imp  : Erratic zig-zag aerial hop + twin fireball volley
 *   4. Glacial Wraith     : Ethereal Phase-Shift (semi-transparent damage reduction) + 3-shard frost fan
 *   5. Dread Knight       : Runic Iron Bulwark frontal armor + halberd shockwave & cleave
 *   6. Arch-Beholder Boss : 920 HP 3-Phase Pinnacle Boss with Void Teleport, 5/7-orb barrages & Void Ward
 */
export class Enemy {
  constructor(scene, type, position, texture, spellSystem, telemetry) {
    this.scene = scene;
    this.type = type;
    this.spellSystem = spellSystem;
    this.telemetry = telemetry;
    this.position = position.clone();
    this.baseFloorY = position.y;
    this.isDead = false;
    this.isAggro = false;
    this.aggroDelay = 0.65;
    this.attackCooldown = 1.1 + Math.random() * 0.5;
    this.slowTimer = 0;
    this.speedMultiplier = 1.0;
    this.radius = 0.85;
    this.enraged = false;
    this.phase3 = false;
    this.hoverTimer = Math.random() * 10;
    this.leapOffsetY = 0;
    this.leapVelY = 0;

    // Distinct Tactical Reaction Timers & Raycasting
    this.raycaster = new THREE.Raycaster();
    this.hasLOS = false;
    this.losCheckTimer = Math.random() * 0.2;
    this.flankTimer = 0;
    this.flankDir = Math.random() < 0.5 ? 1 : -1;
    this.blinkCooldown = 0;
    this.phaseTimer = 0;
    this.bulwarkTimer = 0;
    this.bossShieldTimer = 0;

    if (this.type === 'gargoyle') {
      this.maxHealth = 115;
      this.health = 115;
      this.xpValue = 38;
      this.baseSpeed = 2.35;
      this.aggroRange = 16.5;
      this.attackRange = 2.25;
      this.attackInterval = 1.65;
      this.damage = 13;
      this.spriteConfig = {
        cols: 4, rows: 1, width: 2.1, height: 2.1, fps: 3.8,
        animations: { idle: [0], walk: [0, 1], attack: [1, 2], hurt: [1], die: [3] }
      };
    } else if (this.type === 'skeleton') {
      this.maxHealth = 95;
      this.health = 95;
      this.xpValue = 45;
      this.baseSpeed = 1.65;
      this.aggroRange = 18.5;
      this.attackRange = 16.5;
      this.preferredDistance = 8.0;
      this.attackInterval = 2.35;
      this.damage = 14;
      this.spriteConfig = {
        cols: 4, rows: 1, width: 2.15, height: 2.15, fps: 3.2,
        animations: { idle: [0], walk: [0, 1], attack: [1, 2], hurt: [1], die: [3] }
      };
    } else if (this.type === 'fire_imp') {
      this.maxHealth = 90;
      this.health = 90;
      this.xpValue = 42;
      this.baseSpeed = 2.65;
      this.aggroRange = 17.5;
      this.attackRange = 15.0;
      this.preferredDistance = 5.8;
      this.attackInterval = 1.95;
      this.damage = 12;
      this.spriteConfig = {
        cols: 4, rows: 1, width: 1.95, height: 1.95, fps: 4.5,
        animations: { idle: [0], walk: [0, 1], attack: [1, 2], hurt: [1], die: [3] }
      };
    } else if (this.type === 'frost_wraith') {
      this.maxHealth = 115;
      this.health = 115;
      this.xpValue = 52;
      this.baseSpeed = 1.85;
      this.aggroRange = 19.0;
      this.attackRange = 17.0;
      this.preferredDistance = 8.5;
      this.attackInterval = 2.25;
      this.damage = 11;
      this.spriteConfig = {
        cols: 4, rows: 1, width: 2.2, height: 2.2, fps: 3.6,
        animations: { idle: [0], walk: [0, 1], attack: [1, 2], hurt: [1], die: [3] }
      };
    } else if (this.type === 'dread_knight') {
      this.maxHealth = 210;
      this.health = 210;
      this.xpValue = 80;
      this.baseSpeed = 1.50;
      this.aggroRange = 17.5;
      this.attackRange = 14.0;
      this.meleeRange = 2.65;
      this.preferredDistance = 2.1;
      this.attackInterval = 2.05;
      this.damage = 18;
      this.radius = 0.98;
      this.spriteConfig = {
        cols: 4, rows: 1, width: 2.45, height: 2.45, fps: 3.4,
        animations: { idle: [0], walk: [0, 1], attack: [1, 2], hurt: [1], die: [3] }
      };
    } else {
      // arcane_eye (Harder 3-Phase Pinnacle Boss: 920 HP!)
      this.maxHealth = 920;
      this.health = 920;
      this.xpValue = 450;
      this.baseSpeed = 2.05;
      this.aggroRange = 26.0;
      this.attackRange = 23.0;
      this.preferredDistance = 9.5;
      this.attackInterval = 1.95;
      this.damage = 20;
      this.radius = 1.25;
      this.spriteConfig = {
        cols: 4, rows: 1, width: 3.0, height: 3.0, fps: 4.5,
        animations: { idle: [0], walk: [0], attack: [1, 2], hurt: [1], die: [3] }
      };
      this.position.y += 0.7;
    }

    this.sprite = new AnimatedBillboardSprite(texture, this.spriteConfig);
    this.sprite.setPosition(this.position.x, this.position.y, this.position.z);
    this.scene.add(this.sprite.mesh);

    const hitGeo = new THREE.CylinderGeometry(this.radius * 1.25, this.radius * 1.25, this.spriteConfig.height + 0.35, 10);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.hitMesh = new THREE.Mesh(hitGeo, hitMat);
    this.hitMesh.position.copy(this.position);
    this.hitMesh.position.y += this.spriteConfig.height / 2;
    this.scene.add(this.hitMesh);

    this.createHealthBar();
  }

  createHealthBar() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 16;
    this.hbCanvas = canvas;
    this.hbCtx = canvas.getContext('2d');

    this.hbTexture = new THREE.CanvasTexture(canvas);
    this.hbTexture.minFilter = THREE.NearestFilter;
    this.hbTexture.magFilter = THREE.NearestFilter;

    const hbMat = new THREE.MeshBasicMaterial({
      map: this.hbTexture,
      transparent: true,
      depthTest: false
    });
    const hbGeo = new THREE.PlaneGeometry(1.35, 0.16);
    this.hbMesh = new THREE.Mesh(hbGeo, hbMat);
    this.hbMesh.position.set(0, this.spriteConfig.height + 0.25, 0);
    this.hbMesh.visible = false;
    this.sprite.mesh.add(this.hbMesh);

    this.updateHealthBar();
  }

  updateHealthBar() {
    if (!this.hbCtx) return;
    const ctx = this.hbCtx;
    ctx.clearRect(0, 0, 128, 16);

    ctx.fillStyle = '#0c0a0e';
    ctx.fillRect(0, 0, 128, 16);

    const pct = Math.max(0, this.health / this.maxHealth);
    ctx.fillStyle = this.slowTimer > 0 ? '#00eeff' : pct > 0.5 ? '#22cc44' : pct > 0.25 ? '#ffaa00' : '#dd2222';
    ctx.fillRect(2, 2, Math.floor(124 * pct), 12);

    this.hbTexture.needsUpdate = true;
    this.hbMesh.visible = this.health < this.maxHealth && !this.isDead;
  }

  /**
   * Performs a 3D Raycast from the enemy's eye height to the player's camera to check Line-of-Sight
   */
  checkLineOfSight(player, walls) {
    if (!walls || walls.length === 0) return true;

    const eyeOrigin = new THREE.Vector3(
      this.position.x,
      this.position.y + this.spriteConfig.height * 0.65,
      this.position.z
    );
    const toPlayer = new THREE.Vector3().subVectors(player.position, eyeOrigin);
    const dist = toPlayer.length();
    if (dist < 1.5) return true;

    toPlayer.divideScalar(dist);
    this.raycaster.set(eyeOrigin, toPlayer);
    this.raycaster.near = 0.2;
    this.raycaster.far = dist - 0.35;

    const hits = this.raycaster.intersectObjects(walls, false);
    return hits.length === 0;
  }

  /**
   * Attempts a tactical lateral blink/teleport for Skeleton Sorcerer or Arch-Beholder Boss
   */
  tryBlinkTeleport(player, walls, level, distance = 3.8) {
    const dirToPlayer = new THREE.Vector3().subVectors(player.position, this.position);
    dirToPlayer.y = 0;
    if (dirToPlayer.lengthSq() < 0.01) return false;
    dirToPlayer.normalize();

    const side = Math.random() < 0.5 ? 1 : -1;
    const perp = new THREE.Vector3(-dirToPlayer.z * side, 0, dirToPlayer.x * side);
    const candidate = this.position.clone().addScaledVector(perp, distance);

    if (walls) {
      const testBox = new THREE.Box3(
        new THREE.Vector3(candidate.x - this.radius, candidate.y + 0.2, candidate.z - this.radius),
        new THREE.Vector3(candidate.x + this.radius, candidate.y + 2.0, candidate.z + this.radius)
      );
      for (let i = 0; i < walls.length; i++) {
        if (walls[i].boundingBox && walls[i].boundingBox.intersectsBox(testBox)) {
          return false;
        }
      }
    }

    if (this.spellSystem) {
      this.spellSystem.createSparks(this.position.clone().add(new THREE.Vector3(0, 1.0, 0)), 0xaa44ff, 10);
    }
    this.position.x = candidate.x;
    this.position.z = candidate.z;
    if (level && level.getFloorHeight) {
      this.baseFloorY = level.getFloorHeight(this.position.x, this.position.z, this.baseFloorY);
    }
    if (this.spellSystem) {
      this.spellSystem.createSparks(this.position.clone().add(new THREE.Vector3(0, 1.0, 0)), 0x00ffff, 10);
    }
    return true;
  }

  takeDamage(amount, type = 'fire', player = null) {
    if (this.isDead) return;

    const comboMult = this.telemetry ? this.telemetry.getComboMultiplier() : 1.0;
    let rawDamage = amount * (type === 'synergy_shatter' ? 1.0 : comboMult);

    // Distinct Archetype Defensive Reactions:
    // 1. Frost Wraith Phase-Shift reduces damage by 40% while phased
    if (this.type === 'frost_wraith' && this.phaseTimer > 0 && type !== 'lightning') {
      rawDamage *= 0.6;
    }
    // 2. Dread Knight Runic Bulwark reduces frontal projectile damage by 30% unless frozen or hit by lightning
    if (this.type === 'dread_knight' && this.bulwarkTimer > 0 && this.slowTimer <= 0 && type !== 'lightning') {
      rawDamage *= 0.7;
    }
    // 3. Boss Phase III Void Aegis Shield absorbs 45% damage while active
    if (this.type === 'arcane_eye' && this.bossShieldTimer > 0 && type !== 'synergy_shatter') {
      rawDamage *= 0.55;
    }

    const finalDamage = Math.max(1, Math.round(rawDamage));
    this.health -= finalDamage;
    this.isAggro = true;
    this.aggroDelay = 0;

    // Trigger stark white hit-flash on enemy sprite
    this.sprite.triggerHitFlash(0xffffff, 0.18);

    // Trigger distinct archetype reaction to being hit!
    if (this.health > 0) {
      if (this.type === 'gargoyle') {
        // Gargoyle darts sideways in a wing-flank dodge when hit
        this.flankTimer = 0.65;
        this.flankDir = Math.random() < 0.5 ? 1 : -1;
      } else if (this.type === 'fire_imp') {
        // Fire Imp performs an evasive vertical leap & zig-zag when hit
        if (this.leapOffsetY === 0) this.leapVelY = 5.4;
        this.flankTimer = 0.55;
        this.flankDir = -this.flankDir;
      } else if (this.type === 'frost_wraith') {
        // Frost Wraith shifts into semi-transparent spectral phase
        this.phaseTimer = 1.25;
        this.flankTimer = 0.7;
      } else if (this.type === 'dread_knight') {
        // Dread Knight raises its Runic Bulwark guard & surges forward
        this.bulwarkTimer = 1.3;
      } else if (this.type === 'skeleton') {
        // Skeleton Sorcerer blinks sideways if blink is off cooldown
        if (this.blinkCooldown <= 0) {
          this.blinkCooldown = 3.2;
          this.flankTimer = 0.8;
          this.flankDir = Math.random() < 0.5 ? 1 : -1;
        }
      }
    }

    if (this.telemetry && type !== 'synergy_shatter') {
      this.telemetry.registerHit(false);
      const colorMap = {
        fire: '#ff8822',
        pyrobomb: '#ffaa22',
        frost: '#44eeff',
        lightning: '#dd66ff'
      };
      this.telemetry.spawnFloatingText(
        this.position.clone().add(new THREE.Vector3(0, this.spriteConfig.height + 0.1, 0)),
        `-${finalDamage}`,
        colorMap[type] || '#ffcc33',
        finalDamage > 60 ? 1.25 : 1.0
      );
    }

    // Boss 3-Phase Progression (920 HP)
    if (this.type === 'arcane_eye' && this.health > 0) {
      if (!this.enraged && this.health <= this.maxHealth * 0.65) {
        this.enraged = true;
        this.attackInterval = 1.45;
        this.baseSpeed = 2.55;
        this.sprite.setStatusTint('enraged');
        if (this.telemetry) {
          this.telemetry.spawnFloatingText(
            this.position.clone().add(new THREE.Vector3(0, 3.0, 0)),
            'PHASE II: VOID OVERDRIVE',
            '#ff44ff',
            1.45
          );
        }
      }
      if (!this.phase3 && this.health <= this.maxHealth * 0.35) {
        this.phase3 = true;
        this.attackInterval = 1.15;
        this.baseSpeed = 2.85;
        this.bossShieldTimer = 3.0;
        if (this.telemetry) {
          this.telemetry.spawnFloatingText(
            this.position.clone().add(new THREE.Vector3(0, 3.2, 0)),
            'PHASE III: ASTRAL SINGULARITY',
            '#00ffff',
            1.5
          );
        }
      }
    }

    this.updateHealthBar();
    audioSynth.playEnemyHit(this.type);

    if (this.health <= 0) {
      this.die(player);
    } else {
      this.sprite.setAnimation('hurt');
    }
  }

  applySlow(factor = 0.45, duration = 4.0) {
    this.speedMultiplier = factor;
    this.slowTimer = duration;
    this.sprite.setStatusTint('frozen');
    this.updateHealthBar();
  }

  die(player = null) {
    if (this.isDead) return;
    this.isDead = true;
    this.hbMesh.visible = false;

    // Restore full opacity and drop corpse flat to floor level (Frame 3)
    this.sprite.material.opacity = 1.0;
    this.leapOffsetY = 0;
    this.leapVelY = 0;
    this.position.y = this.baseFloorY;
    this.sprite.setPosition(this.position.x, this.baseFloorY, this.position.z);
    this.sprite.setDeadCorpse();

    // Award XP & Score to Player
    const activePlayer = player || (window.gameApp ? window.gameApp.player : null);
    if (activePlayer) {
      activePlayer.score += this.xpValue * 5;
      activePlayer.gainXP(this.xpValue);
    }

    audioSynth.playEnemyDeath(this.type);
    const debrisColors = {
      gargoyle: 0x777788,
      skeleton: 0xccccaa,
      fire_imp: 0xff5511,
      frost_wraith: 0x44eeff,
      dread_knight: 0x33ff88,
      arcane_eye: 0xaa33ff
    };
    if (this.spellSystem) {
      this.spellSystem.spawnPhysicsDebris(this.position, debrisColors[this.type] || 0x777788, 9);
    }
  }

  update(delta, player, walls, level) {
    if (this.isDead) {
      this.position.y = this.baseFloorY;
      this.sprite.setPosition(this.position.x, this.baseFloorY, this.position.z);
      this.sprite.update(delta, player.camera);
      return;
    }

    this.hoverTimer += delta;
    if (this.flankTimer > 0) this.flankTimer = Math.max(0, this.flankTimer - delta);
    if (this.blinkCooldown > 0) this.blinkCooldown = Math.max(0, this.blinkCooldown - delta);
    if (this.bulwarkTimer > 0) this.bulwarkTimer = Math.max(0, this.bulwarkTimer - delta);
    if (this.bossShieldTimer > 0) this.bossShieldTimer = Math.max(0, this.bossShieldTimer - delta);

    if (this.phaseTimer > 0) {
      this.phaseTimer = Math.max(0, this.phaseTimer - delta);
      this.sprite.material.opacity = this.phaseTimer > 0 ? 0.45 : 1.0;
    }

    if (this.slowTimer > 0) {
      this.slowTimer -= delta;
      if (this.slowTimer <= 0) {
        this.speedMultiplier = 1.0;
        this.sprite.setStatusTint(this.enraged ? 'enraged' : 'none');
        this.updateHealthBar();
      }
    }

    if (this.attackCooldown > 0) {
      this.attackCooldown -= delta;
    }

    // Vertical leap physics for Fire Imp & Gargoyle lunge
    if (this.leapOffsetY > 0 || this.leapVelY > 0) {
      this.leapOffsetY += this.leapVelY * delta;
      this.leapVelY -= 14.5 * delta;
      if (this.leapOffsetY <= 0) {
        this.leapOffsetY = 0;
        this.leapVelY = 0;
      }
    }

    const distToPlayer = this.position.distanceTo(player.position);

    // Periodic Raycast Line-of-Sight Check (every 0.15s)
    this.losCheckTimer -= delta;
    if (this.losCheckTimer <= 0) {
      this.losCheckTimer = 0.15;
      this.hasLOS = this.checkLineOfSight(player, walls);
    }

    // Aggro requires either Raycast Line-of-Sight within aggroRange OR close proximity (< 7.5m)
    if (!this.isAggro && distToPlayer < this.aggroRange && (this.hasLOS || distToPlayer < 7.5)) {
      this.isAggro = true;
      audioSynth.playEnemyAggro(this.type);
    }

    if (this.isAggro) {
      if (this.aggroDelay > 0) {
        this.aggroDelay -= delta;
        this.sprite.update(delta, player.camera);
        return;
      }

      const dirToPlayer = new THREE.Vector3().subVectors(player.position, this.position);
      dirToPlayer.y = 0;
      const len = dirToPlayer.length();
      if (len > 0.001) dirToPlayer.divideScalar(len);

      const perpDir = new THREE.Vector3(-dirToPlayer.z * this.flankDir, 0, dirToPlayer.x * this.flankDir);

      let moveDir = new THREE.Vector3();
      let isMoving = false;
      let moveSpeedBoost = 1.0;

      // Skeleton Sorcerer emergency blink if player gets too close (< 4.2m)
      if (this.type === 'skeleton' && distToPlayer < 4.2 && this.blinkCooldown <= 0) {
        this.blinkCooldown = 4.0;
        this.tryBlinkTeleport(player, walls, level, 4.0);
      }

      // Boss Phase II/III tactical blink teleport
      if (this.type === 'arcane_eye' && this.enraged && this.blinkCooldown <= 0 && distToPlayer < 6.0) {
        this.blinkCooldown = 5.0;
        this.tryBlinkTeleport(player, walls, level, 5.2);
      }

      if (this.type === 'gargoyle') {
        // 1. GARGOYLE: High-speed swoop + Wing-Flank lateral dodge when damaged + Leaping Claw Lunge
        if (distToPlayer > this.attackRange * 0.85) {
          moveDir.copy(dirToPlayer);
          if (this.flankTimer > 0 || !this.hasLOS) {
            moveDir.addScaledVector(perpDir, 0.95).normalize();
            moveSpeedBoost = 1.55;
          }
          isMoving = true;
          this.sprite.setAnimation('walk');

          // Lunge leap when closing in (3.0m - 5.2m)
          if (distToPlayer < 5.2 && distToPlayer > 2.6 && this.leapOffsetY === 0 && Math.random() < delta * 1.4) {
            this.leapVelY = 4.2;
            moveSpeedBoost = 1.8;
          }
        } else {
          this.sprite.setAnimation('attack');
          if (this.attackCooldown <= 0) {
            this.attackCooldown = this.attackInterval;
            player.takeDamage(this.damage);
            // Knockback impulse on player
            player.velocity.addScaledVector(dirToPlayer, 3.2);
            audioSynth.playEnemyAggro(this.type);
          }
        }
      } else if (this.type === 'dread_knight') {
        // 2. DREAD KNIGHT: Relentless armored juggernaut with Runic Bulwark + Twin Shockwave & Heavy Cleave
        if (distToPlayer > this.meleeRange * 0.85) {
          moveDir.copy(dirToPlayer);
          if (!this.hasLOS) moveDir.addScaledVector(perpDir, 0.65).normalize();
          if (this.bulwarkTimer > 0) moveSpeedBoost = 1.32;
          isMoving = true;
          this.sprite.setAnimation('walk');

          if (this.hasLOS && distToPlayer <= this.attackRange && this.attackCooldown <= 0) {
            this.attackCooldown = this.attackInterval * 1.1;
            this.sprite.setAnimation('attack');
            const shootOrigin = this.position.clone().add(new THREE.Vector3(0, 1.35, 0));
            const aimDir = new THREE.Vector3().subVectors(player.position, shootOrigin).add(new THREE.Vector3(0, -0.2, 0)).normalize();
            // Fires a twin emerald halberd wave!
            this.spellSystem.castEnemyProjectile('knight_wave', shootOrigin, aimDir);
            const spreadDir = aimDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.12);
            this.spellSystem.castEnemyProjectile('knight_wave', shootOrigin, spreadDir);
          }
        } else {
          this.sprite.setAnimation('attack');
          if (this.attackCooldown <= 0) {
            this.attackCooldown = this.attackInterval * 0.85;
            player.takeDamage(this.damage);
            player.velocity.addScaledVector(dirToPlayer, 4.5);
            audioSynth.playEnemyAggro(this.type);
          }
        }
      } else {
        // Ranged Tactical Casters: skeleton, fire_imp, frost_wraith, arcane_eye
        if (!this.hasLOS) {
          // If raycast LOS is blocked by a wall/pillar, flank laterally to re-acquire line of sight!
          moveDir.copy(dirToPlayer).addScaledVector(perpDir, 1.15).normalize();
          isMoving = true;
          this.sprite.setAnimation('walk');
        } else if (distToPlayer > this.preferredDistance + 1.5) {
          moveDir.copy(dirToPlayer);
          if (this.flankTimer > 0) moveDir.addScaledVector(perpDir, 0.85).normalize();
          isMoving = true;
          this.sprite.setAnimation('walk');
        } else if (distToPlayer < this.preferredDistance - 1.5) {
          moveDir.copy(dirToPlayer).negate().addScaledVector(perpDir, 0.65).normalize();
          isMoving = true;
          this.sprite.setAnimation('walk');
        } else if (this.flankTimer > 0 || this.type === 'fire_imp' || this.type === 'arcane_eye') {
          moveDir.copy(perpDir);
          isMoving = true;
          this.sprite.setAnimation('walk');
        } else {
          isMoving = false;
          this.sprite.setAnimation('idle');
        }

        // Fire Imp periodically performs an erratic zig-zag hop
        if (this.type === 'fire_imp' && this.leapOffsetY === 0 && Math.random() < delta * 0.95) {
          this.leapVelY = 4.8;
          this.flankDir = -this.flankDir;
        }

        // Only fire ranged spells when Raycast Line-of-Sight (this.hasLOS) is clear!
        if (this.hasLOS && distToPlayer <= this.attackRange && this.attackCooldown <= 0) {
          this.attackCooldown = this.attackInterval;
          this.sprite.setAnimation('attack');

          const shootOrigin = this.position.clone();
          shootOrigin.y += this.spriteConfig.height * 0.58;
          const aimDir = new THREE.Vector3()
            .subVectors(player.position, shootOrigin)
            .add(new THREE.Vector3(0, -0.2, 0))
            .normalize();

          if (this.type === 'skeleton') {
            // 3. SKELETON SORCERER: Homing Necrotic Soul Orb
            this.spellSystem.castEnemyProjectile('soul', shootOrigin, aimDir, true);
          } else if (this.type === 'fire_imp') {
            // 4. FIRE IMP: Twin Fireball Volley
            const leftAim = aimDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.07);
            const rightAim = aimDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.07);
            this.spellSystem.castEnemyProjectile('imp_fire', shootOrigin, leftAim);
            this.spellSystem.castEnemyProjectile('imp_fire', shootOrigin, rightAim);
          } else if (this.type === 'frost_wraith') {
            // 5. FROST WRAITH: 3-Way Glacial Frost Shard Fan (Chills player on hit!)
            [-0.14, 0, 0.14].forEach((ang) => {
              const fanDir = aimDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
              this.spellSystem.castEnemyProjectile('wraith_frost', shootOrigin, fanDir);
            });
          } else {
            // 6. ARCH-BEHOLDER BOSS: Multi-Phase Void Laser Barrage
            const angles = this.phase3
              ? [-0.36, -0.24, -0.12, 0, 0.12, 0.24, 0.36]
              : this.enraged
              ? [-0.26, -0.13, 0, 0.13, 0.26]
              : [-0.14, 0, 0.14];
            angles.forEach((ang) => {
              const fanDir = aimDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
              this.spellSystem.castEnemyProjectile('laser', shootOrigin, fanDir);
            });
          }
        }
      }

      if (isMoving) {
        const currentSpeed = this.baseSpeed * this.speedMultiplier * moveSpeedBoost;
        const step = moveDir.clone().multiplyScalar(currentSpeed * delta);
        const newPos = this.position.clone().add(step);

        let blocked = false;
        if (walls) {
          for (let i = 0; i < walls.length; i++) {
            const box = walls[i].boundingBox;
            if (!box) continue;
            const enemyBox = new THREE.Box3(
              new THREE.Vector3(newPos.x - this.radius, newPos.y + 0.2, newPos.z - this.radius),
              new THREE.Vector3(newPos.x + this.radius, newPos.y + 2.0, newPos.z + this.radius)
            );
            if (box.intersectsBox(enemyBox)) {
              blocked = true;
              this.flankDir = -this.flankDir;
              break;
            }
          }
        }

        if (!blocked) {
          this.position.x = newPos.x;
          this.position.z = newPos.z;
          if (level && level.getFloorHeight) {
            this.baseFloorY = level.getFloorHeight(this.position.x, this.position.z, this.baseFloorY);
          }
        }
      }
    }

    let visualY = this.baseFloorY + this.leapOffsetY;
    if (this.type === 'frost_wraith') {
      visualY += 0.22 + Math.sin(this.hoverTimer * 2.6) * 0.18;
    } else if (this.type === 'arcane_eye') {
      visualY += 0.7 + Math.sin(this.hoverTimer * 2.0) * 0.22;
    }
    this.position.y = visualY;

    this.sprite.setPosition(this.position.x, this.position.y, this.position.z);
    this.hitMesh.position.set(this.position.x, this.position.y + this.spriteConfig.height / 2, this.position.z);
    this.sprite.update(delta, player.camera);
  }

  dispose() {
    this.scene.remove(this.sprite.mesh);
    this.scene.remove(this.hitMesh);
    this.sprite.dispose();
    this.hitMesh.geometry.dispose();
    this.hitMesh.material.dispose();
    if (this.hbTexture) this.hbTexture.dispose();
  }
}
