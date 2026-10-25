import * as THREE from 'three';
import { AnimatedBillboardSprite } from '../engine/SpriteAnimator.js';
import { audioSynth } from '../engine/AudioSynthesizer.js';

/**
 * Enemy V4 (Boomer-Shooter Tier Balancing + Colossal 4-Phase World Boss):
 * - Raycast Line-of-Sight (LOS) occlusion checks against 3D level walls via THREE.Raycaster
 * - Distinct Boomer-Shooter Enemy Tiers (Fast crispy fodder creeps vs. tactical casters vs. heavy bruiser elites):
 *   1. Crimson Magma Imp  (55 HP  | Tier 1 Fodder Creep)   : 1-shot pop! Erratic zig-zag hop + twin fireball volley (Weak to Frost 1.5x)
 *   2. Gargoyle Stalker   (80 HP  | Tier 1 Melee Rusher)   : Snappy 1-1.5 shot rusher! Wing-flank dodge + leaping lunge (Weak to Lightning 1.35x)
 *   3. Skeleton Sorcerer  (115 HP | Tier 2 Toxic Sniper)   : 2-shot caster! Arcane Blink + homing 3D poison orbs (Weak to Fire 1.25x)
 *   4. Glacial Wraith     (160 HP | Tier 2 Spectral Caster): Phase-Shift absorbs 45% non-fire/lightning + 3-shard frost fan (Weak to Fire & Lightning 1.35x)
 *   5. Dread Knight       (330 HP | Tier 3 Heavy Bruiser)  : Armored Hell-Knight juggernaut with Runic Bulwark frontal shield + twin halberd wave
 *   6. Khar'zul Colossus  (6500 HP| 4-Phase World Boss)    : Towering 6-legged 3D Arachnid-Leviathan with Shifting Elemental Blocks,
 *                                                            Combo-Breaker Leg Bunker Shield, Elemental Gem Constellation Invulnerability,
 *                                                            Seismic Leg Slam Shockwave Rings, Brood Summons, and Weak-Spot Stagger Windows!
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
    this.aggroDelay = 0.55;
    this.attackCooldown = 1.0 + Math.random() * 0.45;
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

    // World Boss Multi-Phase Raid State
    this.isWorldBoss = this.type === 'arcane_eye';
    this.bossPhase = 1;
    this.bossRequiredElement = 'frost'; // 'fire' | 'frost' | 'lightning' | 'none'
    this.bossElementCycle = ['frost', 'fire', 'lightning'];
    this.bossElementIndex = 0;
    this.bossElementTimer = 14.0;
    this.bossElementBreakProgress = 0;
    this.bossElementBreakTarget = 620;
    this.bossComboShieldHits = 0;
    this.bossComboShieldMax = 4;
    this.bossComboTriggered85 = false;
    this.bossComboTriggered55 = false;
    this.bossComboTriggered35 = false;
    this.bossCrystalInvuln = false;
    this.bossVulnerableTimer = 0;
    this.slamCooldown = 6.5;
    this.slamWindupTimer = 0;
    this.summonCooldown = 14.0;
    this.bossRig = null;

    if (this.type === 'fire_imp') {
      // TIER 1 FODDER CREEP: 55 HP (1-shot with Pyrobomb or Arcane Arc!)
      this.maxHealth = 55;
      this.health = 55;
      this.xpValue = 35;
      this.baseSpeed = 2.85;
      this.aggroRange = 18.5;
      this.attackRange = 15.0;
      this.preferredDistance = 5.8;
      this.attackInterval = 1.85;
      this.damage = 10;
      this.spriteConfig = {
        cols: 4, rows: 1, width: 1.9, height: 1.9, fps: 4.8,
        animations: { idle: [0], walk: [0, 1], attack: [1, 2], hurt: [1], die: [3] }
      };
    } else if (this.type === 'gargoyle') {
      // TIER 1 FAST MELEE RUSHER: 80 HP (Crispy 1 to 1.5 shot kill, fast swoop & lunge)
      this.maxHealth = 80;
      this.health = 80;
      this.xpValue = 40;
      this.baseSpeed = 2.65;
      this.aggroRange = 17.5;
      this.attackRange = 2.3;
      this.attackInterval = 1.45;
      this.damage = 15;
      this.spriteConfig = {
        cols: 4, rows: 1, width: 2.05, height: 2.05, fps: 4.2,
        animations: { idle: [0], walk: [0, 1], attack: [1, 2], hurt: [1], die: [3] }
      };
    } else if (this.type === 'skeleton') {
      // TIER 2 RANGED TOXIC SNIPER: 115 HP (2-shot kill, blinks when rushed, fires 3D Poison Orb)
      this.maxHealth = 115;
      this.health = 115;
      this.xpValue = 50;
      this.baseSpeed = 1.75;
      this.aggroRange = 19.5;
      this.attackRange = 17.0;
      this.preferredDistance = 8.2;
      this.attackInterval = 2.25;
      this.damage = 16;
      this.spriteConfig = {
        cols: 4, rows: 1, width: 2.15, height: 2.15, fps: 3.4,
        animations: { idle: [0], walk: [0, 1], attack: [1, 2], hurt: [1], die: [3] }
      };
    } else if (this.type === 'frost_wraith') {
      // TIER 2 SPECTRAL CASTER: 160 HP (Phases on hit, weak to Fire & Lightning 1.35x)
      this.maxHealth = 160;
      this.health = 160;
      this.xpValue = 65;
      this.baseSpeed = 1.95;
      this.aggroRange = 19.5;
      this.attackRange = 17.5;
      this.preferredDistance = 8.5;
      this.attackInterval = 2.15;
      this.damage = 13;
      this.spriteConfig = {
        cols: 4, rows: 1, width: 2.25, height: 2.25, fps: 3.8,
        animations: { idle: [0], walk: [0, 1], attack: [1, 2], hurt: [1], die: [3] }
      };
    } else if (this.type === 'dread_knight') {
      // TIER 3 HEAVY ARMORED BRUISER ELITE: 330 HP (Frontal Runic Bulwark, weak to Freeze+Shatter / Superconduct)
      this.maxHealth = 330;
      this.health = 330;
      this.xpValue = 115;
      this.baseSpeed = 1.55;
      this.aggroRange = 18.5;
      this.attackRange = 14.5;
      this.meleeRange = 2.75;
      this.preferredDistance = 2.1;
      this.attackInterval = 1.95;
      this.damage = 24;
      this.radius = 1.05;
      this.spriteConfig = {
        cols: 4, rows: 1, width: 2.6, height: 2.6, fps: 3.5,
        animations: { idle: [0], walk: [0, 1], attack: [1, 2], hurt: [1], die: [3] }
      };
    } else {
      // TIER 4 PINNACLE WORLD BOSS: KHAR'ZUL, THE ABYSSAL WORLD-WEAVER (6,500 HP 4-Phase Raid Boss!)
      this.maxHealth = 6500;
      this.health = 6500;
      this.xpValue = 2000;
      this.baseSpeed = 1.85;
      this.aggroRange = 38.0;
      this.attackRange = 34.0;
      this.preferredDistance = 11.5;
      this.attackInterval = 2.05;
      this.damage = 22;
      this.radius = 2.85;
      this.spriteConfig = {
        cols: 4, rows: 1, width: 5.2, height: 5.2, fps: 4.5,
        animations: { idle: [0], walk: [0, 1], attack: [1, 2], hurt: [1], die: [3] }
      };
      this.position.y += 1.1;
    }

    this.sprite = new AnimatedBillboardSprite(texture, this.spriteConfig);
    this.sprite.setPosition(this.position.x, this.position.y, this.position.z);
    this.scene.add(this.sprite.mesh);

    if (this.isWorldBoss) {
      this.createWorldBossColossusRig();
    }

    const hitHeight = this.isWorldBoss ? 7.5 : this.spriteConfig.height + 0.35;
    const hitGeo = new THREE.CylinderGeometry(this.radius * 1.25, this.radius * 1.25, hitHeight, 12);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.hitMesh = new THREE.Mesh(hitGeo, hitMat);
    this.hitMesh.position.copy(this.position);
    this.hitMesh.position.y += hitHeight / 2;
    this.scene.add(this.hitMesh);

    this.createHealthBar();
  }

  /**
   * Builds the Colossal 6-Legged 3D Arachnid-Leviathan World Boss Rig inspired by the Corpser reference image:
   * - 6 towering articulated 3D dark-chitin legs (femur + glowing knee joint + armored scale-plated foreleg blade)
   * - Towering dorsal-spined carapace dome framing the Void Core & gaping fang mandibles
   * - 10 glowing fiery orange/red arachnid eyes arranged in sinister brow clusters
   * - Volumetric cold cyan/blue backlight mist & rotating 3D Elemental Ward / Combo Shield rings
   */
  createWorldBossColossusRig() {
    const root = new THREE.Group();
    root.position.set(this.position.x, this.baseFloorY, this.position.z);
    this.scene.add(root);

    const chitinMat = new THREE.MeshStandardMaterial({
      color: 0x161922,
      roughness: 0.42,
      metalness: 0.35,
      emissive: 0x060810,
      emissiveIntensity: 0.4
    });
    const armorScaleMat = new THREE.MeshStandardMaterial({
      color: 0x232836,
      roughness: 0.32,
      metalness: 0.45,
      emissive: 0x0a0d18,
      emissiveIntensity: 0.35
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
    const jointGlowMat = new THREE.MeshBasicMaterial({ color: 0xff4400 });
    const fangMat = new THREE.MeshStandardMaterial({
      color: 0xd8cbb8,
      roughness: 0.35,
      metalness: 0.15,
      emissive: 0x221108,
      emissiveIntensity: 0.25
    });

    // 1. Central Thorax & Armored Carapace Hood (Towering over the Void Core)
    const bodyGroup = new THREE.Group();
    bodyGroup.position.set(0, 3.4, 0);
    root.add(bodyGroup);

    const carapaceGeo = new THREE.SphereGeometry(2.85, 16, 14);
    carapaceGeo.scale(1.15, 0.92, 1.35);
    const carapaceMesh = new THREE.Mesh(carapaceGeo, chitinMat);
    carapaceMesh.position.set(0, 1.15, -0.85);
    bodyGroup.add(carapaceMesh);

    // Jagged Dorsal Chitin Spines along the top of the carapace
    for (let s = 0; s < 5; s++) {
      const spineGeo = new THREE.ConeGeometry(0.32 - s * 0.03, 1.45 - s * 0.1, 5);
      const spine = new THREE.Mesh(spineGeo, armorScaleMat);
      spine.position.set(0, 3.25 - s * 0.15, -0.2 - s * 0.72);
      spine.rotation.x = -0.38;
      bodyGroup.add(spine);
    }

    // 2. Cluster of 10 Glowing Orange Arachnid Eyes on the Brow (matching reference image!)
    const eyeOffsets = [
      [-0.55, 2.15, 1.75, 0.18],
      [0.55, 2.15, 1.75, 0.18],
      [-0.95, 2.38, 1.55, 0.14],
      [0.95, 2.38, 1.55, 0.14],
      [-1.32, 2.02, 1.42, 0.15],
      [1.32, 2.02, 1.42, 0.15],
      [-0.32, 1.65, 1.85, 0.12],
      [0.32, 1.65, 1.85, 0.12],
      [-0.78, 1.52, 1.72, 0.11],
      [0.78, 1.52, 1.72, 0.11]
    ];
    const eyeMeshes = [];
    eyeOffsets.forEach(([ex, ey, ez, er]) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(er, 8, 8), eyeMat);
      eye.position.set(ex, ey, ez);
      bodyGroup.add(eye);
      eyeMeshes.push(eye);
    });

    // 3. Articulated Pincer Mandibles & Fang Maw
    const leftMandible = new THREE.Group();
    leftMandible.position.set(-1.35, -0.35, 1.45);
    const rightMandible = new THREE.Group();
    rightMandible.position.set(1.35, -0.35, 1.45);
    bodyGroup.add(leftMandible, rightMandible);

    [-1, 1].forEach((side) => {
      const targetGroup = side < 0 ? leftMandible : rightMandible;
      const jawPincer = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.2, 6), armorScaleMat);
      jawPincer.rotation.x = Math.PI * 0.62;
      jawPincer.rotation.z = side * 0.42;
      jawPincer.position.set(side * 0.25, -0.45, 0.65);
      targetGroup.add(jawPincer);

      for (let f = 0; f < 3; f++) {
        const fang = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.55, 5), fangMat);
        fang.position.set(-side * (0.18 + f * 0.12), -0.35 - f * 0.22, 0.45 + f * 0.25);
        fang.rotation.z = -side * 1.1;
        targetGroup.add(fang);
      }
    });

    // 4. 6 Colossal Multi-Segmented 3D Arachnid Legs (3 Left, 3 Right)
    // Front pair (-1, +1) can swing inward to form the Armored Leg Combo Bunker!
    const legs = [];
    const legConfigs = [
      { side: -1, pairIdx: 0, yawBase: 0.48, zOff: 1.1, scale: 1.12 },   // Front-Left
      { side: 1, pairIdx: 0, yawBase: -0.48, zOff: 1.1, scale: 1.12 },   // Front-Right
      { side: -1, pairIdx: 1, yawBase: 1.12, zOff: 0.1, scale: 1.05 },   // Mid-Left
      { side: 1, pairIdx: 1, yawBase: -1.12, zOff: 0.1, scale: 1.05 },   // Mid-Right
      { side: -1, pairIdx: 2, yawBase: 1.72, zOff: -1.0, scale: 0.96 },  // Rear-Left
      { side: 1, pairIdx: 2, yawBase: -1.72, zOff: -1.0, scale: 0.96 }   // Rear-Right
    ];

    legConfigs.forEach((cfg, idx) => {
      const hipPivot = new THREE.Group();
      hipPivot.position.set(cfg.side * 1.85, 2.8, cfg.zOff);
      hipPivot.rotation.y = cfg.yawBase;
      root.add(hipPivot);

      // Glowing magma hip socket
      const hipSocket = new THREE.Mesh(new THREE.SphereGeometry(0.45 * cfg.scale, 8, 8), jointGlowMat);
      hipPivot.add(hipSocket);

      // Upper Femur rising high into the cathedral air (like the Corpser screenshot!)
      const femurGroup = new THREE.Group();
      femurGroup.rotation.z = cfg.side * 0.62;
      hipPivot.add(femurGroup);

      const femurLen = 4.6 * cfg.scale;
      const femurMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.46 * cfg.scale, 0.62 * cfg.scale, femurLen, 7),
        chitinMat
      );
      femurMesh.position.set(cfg.side * (femurLen * 0.42), femurLen * 0.36, 0);
      femurMesh.rotation.z = -cfg.side * 0.85;
      femurGroup.add(femurMesh);

      // High Knee Joint at the apex of the arch
      const kneePivot = new THREE.Group();
      kneePivot.position.set(cfg.side * (femurLen * 0.82), femurLen * 0.70, 0);
      femurGroup.add(kneePivot);

      const kneeNode = new THREE.Mesh(new THREE.SphereGeometry(0.50 * cfg.scale, 8, 8), jointGlowMat);
      kneePivot.add(kneeNode);

      const kneeSpike = new THREE.Mesh(new THREE.ConeGeometry(0.28 * cfg.scale, 1.35 * cfg.scale, 5), armorScaleMat);
      kneeSpike.position.set(0, 0.75 * cfg.scale, 0);
      kneePivot.add(kneeSpike);

      // Massive Foreleg Blade (Tibia + Tarsus Claw) plunging down to the arena floor
      const forelegLen = 6.8 * cfg.scale;
      const forelegMesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.68 * cfg.scale, forelegLen, 7),
        armorScaleMat
      );
      forelegMesh.rotation.z = Math.PI - cfg.side * 0.24;
      forelegMesh.position.set(cfg.side * 1.15 * cfg.scale, -forelegLen * 0.45, 0);
      kneePivot.add(forelegMesh);

      // Overlapping Armored Chitin Scales along the front of the foreleg (like the Corpser screenshot!)
      for (let p = 0; p < 4; p++) {
        const plate = new THREE.Mesh(
          new THREE.DodecahedronGeometry((0.44 - p * 0.06) * cfg.scale, 0),
          chitinMat
        );
        plate.scale.set(1.2, 0.85, 1.35);
        plate.position.set(cfg.side * (1.45 - p * 0.12) * cfg.scale, (-1.1 - p * 1.15) * cfg.scale, 0.25);
        kneePivot.add(plate);
      }

      legs.push({
        hipPivot,
        femurGroup,
        kneePivot,
        cfg,
        phaseOffset: idx * 1.05
      });
    });

    // 5. Cold Volumetric Cyan/Blue Backlight Mist (Recreating the dramatic blue backlight from the reference image!)
    const backLight = new THREE.PointLight(0x22ccff, 7.5, 34, 1.25);
    backLight.position.set(0, 5.2, -4.5);
    root.add(backLight);

    const mistMat = new THREE.MeshBasicMaterial({
      color: 0x33ddff,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const mistHalo = new THREE.Mesh(new THREE.CircleGeometry(7.2, 24), mistMat);
    mistHalo.position.set(0, 4.6, -3.2);
    root.add(mistHalo);

    // 6. 3D Elemental Block Ring & Invulnerability / Combo Barrier Cage
    const wardRingMat = new THREE.MeshBasicMaterial({
      color: 0x00eeff,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide
    });
    const wardRingMesh = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.13, 8, 32), wardRingMat);
    wardRingMesh.rotation.x = Math.PI / 2;
    wardRingMesh.position.y = 0.35;
    root.add(wardRingMesh);

    const shieldCageMat = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      wireframe: true,
      transparent: true,
      opacity: 0.0
    });
    const shieldCageMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(4.4, 1), shieldCageMat);
    shieldCageMesh.position.y = 3.6;
    shieldCageMesh.visible = false;
    root.add(shieldCageMesh);

    this.bossRig = {
      root,
      bodyGroup,
      leftMandible,
      rightMandible,
      legs,
      eyeMat,
      jointGlowMat,
      wardRingMesh,
      wardRingMat,
      shieldCageMesh,
      shieldCageMat,
      mistHalo,
      backLight
    };
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
    const hbGeo = new THREE.PlaneGeometry(this.isWorldBoss ? 2.6 : 1.35, this.isWorldBoss ? 0.24 : 0.16);
    this.hbMesh = new THREE.Mesh(hbGeo, hbMat);
    this.hbMesh.position.set(0, this.spriteConfig.height + (this.isWorldBoss ? 1.35 : 0.25), 0);
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
    if (this.isWorldBoss && this.bossCrystalInvuln) {
      ctx.fillStyle = '#ff00aa';
    } else if (this.isWorldBoss && this.bossComboShieldHits > 0) {
      ctx.fillStyle = '#ffcc00';
    } else {
      ctx.fillStyle = this.slowTimer > 0 ? '#00eeff' : pct > 0.5 ? '#22cc44' : pct > 0.25 ? '#ffaa00' : '#dd2222';
    }
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
   * Attempts a tactical lateral blink/teleport for Skeleton Sorcerer
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

  /**
   * Called by CastleLevel when the player shatters all tethered Elemental Gems in the Boss Arena before the countdown ends!
   */
  onBossConstellationBroken() {
    if (!this.isWorldBoss || this.isDead) return;
    this.bossCrystalInvuln = false;
    this.bossComboShieldHits = 0;
    this.bossVulnerableTimer = 10.5;
    this.health = Math.max(1, this.health - 420);
    this.updateHealthBar();

    audioSynth.playFireballExplode();
    if (this.spellSystem) {
      if (this.spellSystem.postProcessor) {
        this.spellSystem.postProcessor.triggerChromaticPulse(1.25);
      }
      this.spellSystem.createExplosionImpact(this.position.clone().add(new THREE.Vector3(0, 3.0, 0)), 2.4);
      this.spellSystem.spawnPhysicsDebris(this.position.clone().add(new THREE.Vector3(0, 2.5, 0)), 0x00ffcc, 16);
    }
    if (this.telemetry) {
      this.telemetry.registerHit(true, 'CONSTELLATION SHATTERED! BOSS INVULNERABILITY BROKEN (10s STAGGER)');
      this.telemetry.spawnFloatingText(
        this.position.clone().add(new THREE.Vector3(0, 6.2, 0)),
        'INVULNERABILITY SHATTERED! -420 (STUNNED 10s!)',
        '#00ffcc',
        1.65
      );
    }
  }

  /**
   * Cycles the World Boss's Shifting Elemental Block to the next element ('frost' -> 'fire' -> 'lightning')
   */
  cycleBossElementalBlock(announce = true) {
    this.bossElementIndex = (this.bossElementIndex + 1) % this.bossElementCycle.length;
    this.bossRequiredElement = this.bossElementCycle[this.bossElementIndex];
    this.bossElementBreakProgress = 0;
    this.bossElementTimer = 15.0;

    if (announce && this.telemetry && !this.bossCrystalInvuln && this.bossVulnerableTimer <= 0) {
      const labelMap = {
        fire: 'PYRO WARD ACTIVE — USE PYROBOMB [LMB]!',
        frost: 'CRYO WARD ACTIVE — USE FROST LANCE [RMB]!',
        lightning: 'VOLT WARD ACTIVE — USE ARCANE ARC [MMB]!'
      };
      const colorMap = {
        fire: '#ff6622',
        frost: '#00eeff',
        lightning: '#cc66ff'
      };
      this.telemetry.spawnFloatingText(
        this.position.clone().add(new THREE.Vector3(0, 6.0, 0)),
        labelMap[this.bossRequiredElement],
        colorMap[this.bossRequiredElement],
        1.35
      );
    }
  }

  /**
   * Returns a human-readable status string for the HUD World Boss Mechanic Banner
   */
  getBossMechanicStatus(level) {
    if (!this.isWorldBoss) return '';
    if (this.bossCrystalInvuln) {
      const st = level && level.constellationState ? level.constellationState : null;
      if (st && st.totalGems > 0) {
        const timerStr = st.active ? ` | COUNTDOWN: ${st.countdownTimer.toFixed(1)}s` : ' | SHOOT MATCHING ELEMENTAL GEMS!';
        return `[INVULNERABLE TETHER] SHATTER ELEMENTAL GEMS (${st.brokenGems}/${st.totalGems})${timerStr}`;
      }
      return '[INVULNERABLE TETHER] SHATTER ALL ELEMENTAL GEMS AROUND THE ARENA!';
    }
    if (this.bossVulnerableTimer > 0) {
      return `[WEAK-SPOT EXPOSED: ${this.bossVulnerableTimer.toFixed(1)}s] 1.8x DAMAGE FROM ALL SPELLS — GRAB OVERDRIVE POTION!`;
    }
    if (this.bossComboShieldHits > 0) {
      return `[ARMORED LEG COMBO SHIELD: ${this.bossComboShieldHits}/${this.bossComboShieldMax}] LAND 2x+ SPELL COMBOS OR ELEMENTAL SYNERGY TO BREAK!`;
    }
    if (this.bossRequiredElement === 'fire') {
      const rem = Math.max(0, Math.ceil(this.bossElementBreakTarget - this.bossElementBreakProgress));
      return `[ELEMENTAL BLOCK: FIRE ATTUNED] ONLY PYROBOMB [LMB] OR SHATTER PENETRATES (${rem} DMG TO STAGGER)`;
    }
    if (this.bossRequiredElement === 'frost') {
      const rem = Math.max(0, Math.ceil(this.bossElementBreakTarget - this.bossElementBreakProgress));
      return `[ELEMENTAL BLOCK: FROST ATTUNED] ONLY FROST LANCE [RMB] PENETRATES (${rem} DMG TO STAGGER)`;
    }
    if (this.bossRequiredElement === 'lightning') {
      const rem = Math.max(0, Math.ceil(this.bossElementBreakTarget - this.bossElementBreakProgress));
      return `[ELEMENTAL BLOCK: LIGHTNING ATTUNED] ONLY ARCANE ARC [MMB] OR SUPERCONDUCT PENETRATES (${rem} DMG TO STAGGER)`;
    }
    return '[COLOSSUS ACTIVE] USE ELEMENTAL COMBOS & OVERDRIVE ELIXIRS!';
  }

  takeDamage(amount, type = 'fire', player = null) {
    if (this.isDead) return;

    const normalizedElem =
      type === 'pyrobomb' ? 'fire' :
      type === 'frost' ? 'frost' :
      type === 'lightning' ? 'lightning' : type;
    const isSynergy =
      type === 'synergy_shatter' ||
      type === 'synergy_superconduct' ||
      type === 'synergy_aegis_nova';

    const comboMult = this.telemetry ? this.telemetry.getComboMultiplier() : 1.0;
    let rawDamage = amount * (isSynergy ? 1.0 : comboMult);

    // =========================================================================
    // A. REGULAR ENEMY BOOMER-SHOOTER ELEMENTAL COUNTERPLAY & DEFENSES
    // =========================================================================
    if (!this.isWorldBoss) {
      // 1. Fire Imp is weak to Frost (1.5x) -> 1-shot with Frost Lance too!
      if (this.type === 'fire_imp' && normalizedElem === 'frost') {
        rawDamage *= 1.5;
      }
      // 2. Gargoyle is weak to Arcane Lightning (1.35x) -> 1-shot with Arcane Arc!
      if (this.type === 'gargoyle' && normalizedElem === 'lightning') {
        rawDamage *= 1.35;
      }
      // 3. Skeleton Sorcerer is weak to Fire (1.25x)
      if (this.type === 'skeleton' && normalizedElem === 'fire') {
        rawDamage *= 1.25;
      }
      // 4. Frost Wraith Phase-Shift reduces Frost damage by 45%, but is WEAK to Fire & Lightning (1.35x)!
      if (this.type === 'frost_wraith') {
        if (normalizedElem === 'fire' || normalizedElem === 'lightning' || isSynergy) {
          rawDamage *= 1.35;
        } else if (this.phaseTimer > 0) {
          rawDamage *= 0.55;
        }
      }
      // 5. Dread Knight Runic Bulwark reduces un-frozen single hits by 45%, rewarding Freeze+Shatter or Superconduct!
      if (this.type === 'dread_knight') {
        if (isSynergy) {
          rawDamage *= 1.35;
        } else if (this.bulwarkTimer > 0 && this.slowTimer <= 0 && normalizedElem !== 'lightning') {
          rawDamage *= 0.55;
        }
      }
    }

    // =========================================================================
    // B. WORLD BOSS 4-PHASE MECHANICS (INVULNERABILITY, COMBO SHIELD & ELEMENTAL BLOCK)
    // =========================================================================
    if (this.isWorldBoss) {
      // 1. Crystal Constellation Invulnerability State (100% Immune until Elemental Gems are shattered!)
      if (this.bossCrystalInvuln) {
        audioSynth.playAegisCast();
        if (this.spellSystem) {
          this.spellSystem.createSparks(this.position.clone().add(new THREE.Vector3(0, 3.2, 0)), 0xff00aa, 8);
        }
        if (this.telemetry) {
          this.telemetry.spawnFloatingText(
            this.position.clone().add(new THREE.Vector3(0, 5.6, 0)),
            'INVULNERABLE! BREAK ELEMENTAL GEMS!',
            '#ff44cc',
            1.25
          );
        }
        return;
      }

      // 2. Vulnerable / Staggered Weak-Point Window (1.8x Critical Damage from all spells!)
      if (this.bossVulnerableTimer > 0) {
        rawDamage *= 1.8;
      } else if (this.bossComboShieldHits > 0) {
        // 3. Armored Leg Combo Shield: requires Spell Combo (2x+) or Elemental Synergy to strip layers!
        const currentCombo = this.telemetry ? this.telemetry.comboCount : 0;
        if (isSynergy) {
          this.bossComboShieldHits = Math.max(0, this.bossComboShieldHits - 2);
          rawDamage *= 0.65;
          if (this.telemetry) {
            this.telemetry.spawnFloatingText(
              this.position.clone().add(new THREE.Vector3(0, 5.8, 0)),
              this.bossComboShieldHits > 0
                ? `SYNERGY HIT! SHIELD: ${this.bossComboShieldHits} LEFT`
                : 'COMBO SHIELD SHATTERED! BOSS STUNNED!',
              '#00ffcc',
              1.35
            );
          }
        } else if (currentCombo >= 2) {
          this.bossComboShieldHits = Math.max(0, this.bossComboShieldHits - 1);
          rawDamage *= 0.45;
          if (this.telemetry) {
            this.telemetry.spawnFloatingText(
              this.position.clone().add(new THREE.Vector3(0, 5.8, 0)),
              this.bossComboShieldHits > 0
                ? `${currentCombo}x COMBO HIT! SHIELD: ${this.bossComboShieldHits} LEFT`
                : 'COMBO SHIELD SHATTERED! BOSS STUNNED!',
              '#ffdd44',
              1.3
            );
          }
        } else {
          // Un-comboed single poke is heavily blocked by crossed armored legs
          rawDamage *= 0.12;
          if (this.telemetry) {
            this.telemetry.registerHit(false);
            this.telemetry.spawnFloatingText(
              this.position.clone().add(new THREE.Vector3(0, 5.6, 0)),
              `COMBO SHIELD (${this.bossComboShieldHits}) — CHAIN SPELLS TO BREAK!`,
              '#ffaa22',
              1.15
            );
          }
        }

        if (this.bossComboShieldHits <= 0) {
          this.bossVulnerableTimer = 7.5;
          audioSynth.playFireballExplode();
          if (this.spellSystem) {
            this.spellSystem.createSparks(this.position.clone().add(new THREE.Vector3(0, 3.5, 0)), 0xffdd00, 18);
          }
        }
      } else if (this.bossRequiredElement && this.bossRequiredElement !== 'none') {
        // 4. Shifting Elemental Block: requires matching spell element (Fire / Frost / Lightning) or Synergy!
        if (normalizedElem === this.bossRequiredElement || isSynergy) {
          rawDamage *= 1.25;
          this.bossElementBreakProgress += rawDamage;
          if (this.bossElementBreakProgress >= this.bossElementBreakTarget) {
            this.bossElementBreakProgress = 0;
            this.bossVulnerableTimer = 6.0;
            audioSynth.playFireballExplode();
            if (this.telemetry) {
              this.telemetry.registerHit(true, 'ELEMENTAL CARAPACE CRACKED! 6s WEAK-POINT WINDOW (1.8x DMG)');
              this.telemetry.spawnFloatingText(
                this.position.clone().add(new THREE.Vector3(0, 6.0, 0)),
                'ELEMENTAL BLOCK SHATTERED! WEAK POINT EXPOSED!',
                '#00ff99',
                1.45
              );
            }
            this.cycleBossElementalBlock(false);
          }
        } else {
          // Wrong element hits the Elemental Carapace Block (90% blocked!)
          rawDamage *= 0.10;
          if (this.telemetry) {
            const blockMsg =
              this.bossRequiredElement === 'fire'
                ? 'BLOCKED! USE PYROBOMB [LMB]'
                : this.bossRequiredElement === 'frost'
                ? 'BLOCKED! USE FROST LANCE [RMB]'
                : 'BLOCKED! USE ARCANE ARC [MMB]';
            this.telemetry.spawnFloatingText(
              this.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 5.4, 0)),
              blockMsg,
              '#ff5555',
              1.2
            );
          }
        }
      }
    }

    const finalDamage = Math.max(1, Math.round(rawDamage));
    this.health -= finalDamage;
    this.isAggro = true;
    this.aggroDelay = 0;

    // Trigger stark white hit-flash on enemy sprite
    this.sprite.triggerHitFlash(0xffffff, 0.18);

    // Trigger distinct archetype reaction to being hit!
    if (this.health > 0 && !this.isWorldBoss) {
      if (this.type === 'gargoyle') {
        this.flankTimer = 0.65;
        this.flankDir = Math.random() < 0.5 ? 1 : -1;
      } else if (this.type === 'fire_imp') {
        if (this.leapOffsetY === 0) this.leapVelY = 5.4;
        this.flankTimer = 0.55;
        this.flankDir = -this.flankDir;
      } else if (this.type === 'frost_wraith') {
        this.phaseTimer = 1.25;
        this.flankTimer = 0.7;
      } else if (this.type === 'dread_knight') {
        this.bulwarkTimer = 1.3;
      } else if (this.type === 'skeleton') {
        if (this.blinkCooldown <= 0) {
          this.blinkCooldown = 3.2;
          this.flankTimer = 0.8;
          this.flankDir = Math.random() < 0.5 ? 1 : -1;
        }
      }
    }

    if (this.telemetry && !isSynergy) {
      this.telemetry.registerHit(false);
      const colorMap = {
        fire: '#ff8822',
        pyrobomb: '#ffaa22',
        frost: '#44eeff',
        lightning: '#dd66ff'
      };
      const heightOff = this.isWorldBoss ? 4.8 : this.spriteConfig.height + 0.1;
      this.telemetry.spawnFloatingText(
        this.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, heightOff, 0)),
        `-${finalDamage}`,
        colorMap[type] || '#ffcc33',
        finalDamage > 90 ? 1.35 : 1.0
      );
    }

    // =========================================================================
    // C. WORLD BOSS 4-PHASE PROGRESSION & MECHANIC TRIGGERS (6,500 HP)
    // =========================================================================
    if (this.isWorldBoss && this.health > 0) {
      const activeLevel = player && player.level ? player.level : (window.gameApp ? window.gameApp.level : null);
      const activeEnemyMgr = player && player.enemyManager ? player.enemyManager : (window.gameApp ? window.gameApp.enemyManager : null);

      // Sub-threshold Combo Shield triggers at 85% and 55% HP
      if (!this.bossComboTriggered85 && this.health <= this.maxHealth * 0.85 && this.health > this.maxHealth * 0.76) {
        this.bossComboTriggered85 = true;
        this.bossComboShieldHits = 4;
        this.bossComboShieldMax = 4;
        this.bossVulnerableTimer = 0;
        if (this.telemetry) {
          this.telemetry.showNotice('COLOSSUS RAISED ARMORED LEG SHIELD — CHAIN SPELL COMBOS OR SYNERGIES TO BREAK!', 3.5);
        }
      }

      // PHASE II AT 75% HP (4,875 HP): CRYSTAL CONSTELLATION INVULNERABILITY #1 + OVERDRIVE POTION + CREEPS
      if (this.bossPhase < 2 && this.health <= this.maxHealth * 0.75) {
        this.bossPhase = 2;
        this.enraged = true;
        this.attackInterval = 1.65;
        this.baseSpeed = 2.2;
        this.bossCrystalInvuln = true;
        this.bossVulnerableTimer = 0;
        this.bossComboShieldHits = 0;
        this.sprite.setStatusTint('enraged');

        if (activeLevel && activeLevel.spawnBossConstellationWave) {
          activeLevel.spawnBossConstellationWave(this, 1);
        }
        if (activeEnemyMgr && activeEnemyMgr.spawnBossMinion) {
          activeEnemyMgr.spawnBossMinion('fire_imp', -9.0, 0.0, -4.0);
          activeEnemyMgr.spawnBossMinion('gargoyle', 9.0, 0.0, -4.0);
        }
        if (this.telemetry) {
          this.telemetry.showNotice('PHASE II: CRYSTAL INVULNERABILITY! SHATTER ALL 3 ELEMENTAL GEMS BEFORE COUNTDOWN!', 4.2);
          this.telemetry.spawnFloatingText(
            this.position.clone().add(new THREE.Vector3(0, 6.2, 0)),
            'PHASE II: ELEMENTAL CONSTELLATION TETHER!',
            '#ff44ff',
            1.55
          );
        }
      }

      // PHASE III AT 50% HP (3,250 HP): ABYSSAL OVERDRIVE — 5-HIT COMBO SHIELD + MINION WAVE + OVERDRIVE POTION
      if (this.bossPhase < 3 && this.health <= this.maxHealth * 0.50) {
        this.bossPhase = 3;
        this.phase3 = true;
        this.attackInterval = 1.38;
        this.baseSpeed = 2.45;
        this.bossComboShieldHits = 5;
        this.bossComboShieldMax = 5;
        this.bossVulnerableTimer = 0;
        this.cycleBossElementalBlock(false);

        if (activeLevel && activeLevel.spawnSinglePickup) {
          activeLevel.spawnSinglePickup('overdrive', 0.0, 0.0, 2.0);
        }
        if (activeEnemyMgr && activeEnemyMgr.spawnBossMinion) {
          activeEnemyMgr.spawnBossMinion('fire_imp', -10.5, 0.0, 2.0);
          activeEnemyMgr.spawnBossMinion('fire_imp', 10.5, 0.0, 2.0);
          activeEnemyMgr.spawnBossMinion('skeleton', 0.0, 2.0, -14.0);
        }
        if (this.telemetry) {
          this.telemetry.showNotice('PHASE III: ABYSSAL OVERDRIVE! GRAB 2.5x OVERDRIVE POTION & BREAK 5x COMBO SHIELD!', 4.2);
          this.telemetry.spawnFloatingText(
            this.position.clone().add(new THREE.Vector3(0, 6.2, 0)),
            'PHASE III: ABYSSAL OVERDRIVE!',
            '#ffcc00',
            1.55
          );
        }
      }

      // PHASE IV AT 25% HP (1,625 HP): FINAL STAND — 4-GEM GRAND CONSTELLATION INVULNERABILITY!
      if (this.bossPhase < 4 && this.health <= this.maxHealth * 0.25) {
        this.bossPhase = 4;
        this.attackInterval = 1.15;
        this.baseSpeed = 2.75;
        this.bossCrystalInvuln = true;
        this.bossVulnerableTimer = 0;
        this.bossComboShieldHits = 0;

        if (activeLevel && activeLevel.spawnBossConstellationWave) {
          activeLevel.spawnBossConstellationWave(this, 2);
        }
        if (activeEnemyMgr && activeEnemyMgr.spawnBossMinion) {
          activeEnemyMgr.spawnBossMinion('gargoyle', -8.0, 0.0, 0.0);
          activeEnemyMgr.spawnBossMinion('gargoyle', 8.0, 0.0, 0.0);
        }
        if (this.telemetry) {
          this.telemetry.showNotice('PHASE IV: FINAL STAND! SHATTER ALL 4 ELEMENTAL GEMS BEFORE THE 25s COUNTDOWN!', 4.5);
          this.telemetry.spawnFloatingText(
            this.position.clone().add(new THREE.Vector3(0, 6.4, 0)),
            'PHASE IV: GRAND CONSTELLATION FINALE!',
            '#00ffff',
            1.65
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
    this.speedMultiplier = this.isWorldBoss ? Math.max(0.65, factor) : factor;
    this.slowTimer = duration;
    this.sprite.setStatusTint('frozen');
    this.updateHealthBar();
  }

  die(player = null) {
    if (this.isDead) return;
    this.isDead = true;
    this.hbMesh.visible = false;

    if (this.bossRig) {
      this.scene.remove(this.bossRig.root);
    }

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
      arcane_eye: 0xff4400
    };
    if (this.spellSystem) {
      this.spellSystem.spawnPhysicsDebris(
        this.position,
        debrisColors[this.type] || 0x777788,
        this.isWorldBoss ? 22 : 9
      );
    }
  }

  /**
   * Animates the 6-legged 3D Arachnid-Leviathan World Boss Rig, eyes, mandibles, and elemental barrier rings
   */
  updateWorldBossRig(delta, player, isMoving) {
    if (!this.bossRig) return;
    const r = this.bossRig;

    r.root.position.set(this.position.x, this.baseFloorY, this.position.z);

    // Smoothly orient the colossal arachnid body toward the player on XZ
    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const targetYaw = Math.atan2(dx, dz);
    r.root.rotation.y = targetYaw;

    // Keep the Volumetric Mist Halo facing the camera behind the boss
    r.mistHalo.quaternion.copy(player.camera.quaternion);

    // Thorax vertical breathing, stun slump, or slam windup rear-back
    if (this.bossVulnerableTimer > 0) {
      r.bodyGroup.position.y = THREE.MathUtils.lerp(r.bodyGroup.position.y, 2.0, Math.min(1, delta * 6.0));
      r.bodyGroup.rotation.x = THREE.MathUtils.lerp(r.bodyGroup.rotation.x, 0.28, Math.min(1, delta * 6.0));
    } else if (this.slamWindupTimer > 0) {
      r.bodyGroup.position.y = THREE.MathUtils.lerp(r.bodyGroup.position.y, 4.6, Math.min(1, delta * 8.0));
      r.bodyGroup.rotation.x = THREE.MathUtils.lerp(r.bodyGroup.rotation.x, -0.35, Math.min(1, delta * 8.0));
    } else {
      const breath = 3.4 + Math.sin(this.hoverTimer * 2.4) * 0.22;
      r.bodyGroup.position.y = THREE.MathUtils.lerp(r.bodyGroup.position.y, breath, Math.min(1, delta * 5.0));
      r.bodyGroup.rotation.x = THREE.MathUtils.lerp(r.bodyGroup.rotation.x, 0.0, Math.min(1, delta * 5.0));
    }

    // Animate Pincer Mandibles
    const jawSpread = Math.sin(this.hoverTimer * 4.5) * 0.18 + (this.slamWindupTimer > 0 ? 0.35 : 0);
    r.leftMandible.rotation.y = -jawSpread;
    r.rightMandible.rotation.y = jawSpread;

    // Animate the 6 Colossal Articulated Legs
    const walkFreq = isMoving ? 5.2 : 2.1;
    const walkAmp = isMoving ? 0.28 : 0.08;

    for (let i = 0; i < r.legs.length; i++) {
      const leg = r.legs[i];
      const { side, pairIdx, yawBase } = leg.cfg;
      const cycle = Math.sin(this.hoverTimer * walkFreq + leg.phaseOffset);
      const lift = Math.max(0, Math.cos(this.hoverTimer * walkFreq + leg.phaseOffset));

      if (pairIdx === 0 && this.bossComboShieldHits > 0) {
        // Front legs cross inward in front of the head to form the Armored Leg Combo Bunker!
        leg.hipPivot.rotation.y = THREE.MathUtils.lerp(leg.hipPivot.rotation.y, side * 0.12, Math.min(1, delta * 7.0));
        leg.femurGroup.rotation.z = THREE.MathUtils.lerp(leg.femurGroup.rotation.z, side * 0.25, Math.min(1, delta * 7.0));
        leg.kneePivot.rotation.z = THREE.MathUtils.lerp(leg.kneePivot.rotation.z, -side * 0.55, Math.min(1, delta * 7.0));
      } else if (pairIdx === 0 && this.slamWindupTimer > 0) {
        // Front legs rear high up into the cathedral ceiling before slamming down!
        leg.hipPivot.rotation.y = yawBase;
        leg.femurGroup.rotation.z = THREE.MathUtils.lerp(leg.femurGroup.rotation.z, side * 1.25, Math.min(1, delta * 9.0));
        leg.kneePivot.rotation.z = THREE.MathUtils.lerp(leg.kneePivot.rotation.z, side * 0.45, Math.min(1, delta * 9.0));
      } else if (this.bossVulnerableTimer > 0) {
        // Legs splay wide open while stunned/staggered!
        leg.hipPivot.rotation.y = yawBase + cycle * 0.05;
        leg.femurGroup.rotation.z = THREE.MathUtils.lerp(leg.femurGroup.rotation.z, side * 0.32, Math.min(1, delta * 5.0));
        leg.kneePivot.rotation.z = THREE.MathUtils.lerp(leg.kneePivot.rotation.z, side * 0.25, Math.min(1, delta * 5.0));
      } else {
        // Normal menacing arachnid step cycle
        leg.hipPivot.rotation.y = yawBase + cycle * walkAmp;
        leg.femurGroup.rotation.z = side * (0.62 + lift * 0.22);
        leg.kneePivot.rotation.z = -side * lift * 0.18;
      }
    }

    // Update 3D Elemental Ward Ring & Shield Cage Colors
    r.wardRingMesh.rotation.z += delta * 1.8;
    const elemColorMap = {
      fire: 0xff4411,
      frost: 0x00eeff,
      lightning: 0xbb44ff
    };

    if (this.bossCrystalInvuln) {
      r.wardRingMat.color.setHex(0xff00aa);
      r.eyeMat.color.setHex(0xff00aa);
      r.shieldCageMesh.visible = true;
      r.shieldCageMat.color.setHex(0xff00aa);
      r.shieldCageMat.opacity = 0.42 + Math.sin(this.hoverTimer * 6.0) * 0.15;
      r.shieldCageMesh.rotation.y += delta * 1.6;
      r.shieldCageMesh.rotation.x += delta * 1.1;
    } else if (this.bossVulnerableTimer > 0) {
      r.wardRingMat.color.setHex(0x00ff88);
      r.eyeMat.color.setHex(0x00ff88);
      r.shieldCageMesh.visible = false;
    } else if (this.bossComboShieldHits > 0) {
      r.wardRingMat.color.setHex(0xffcc00);
      r.eyeMat.color.setHex(0xffaa00);
      r.shieldCageMesh.visible = true;
      r.shieldCageMat.color.setHex(0xffcc00);
      r.shieldCageMat.opacity = 0.35;
      r.shieldCageMesh.rotation.y -= delta * 1.2;
    } else {
      const cHex = elemColorMap[this.bossRequiredElement] || 0xff6600;
      r.wardRingMat.color.setHex(cHex);
      r.eyeMat.color.setHex(0xff6600);
      r.shieldCageMesh.visible = false;
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

    if (this.bossVulnerableTimer > 0) {
      this.bossVulnerableTimer = Math.max(0, this.bossVulnerableTimer - delta);
      if (this.bossVulnerableTimer <= 0 && this.isWorldBoss) {
        this.cycleBossElementalBlock(true);
      }
    }

    // World Boss periodic Elemental Block rotation & Seismic Leg Slam timer
    if (this.isWorldBoss && this.isAggro) {
      if (!this.bossCrystalInvuln && this.bossVulnerableTimer <= 0 && this.bossComboShieldHits <= 0) {
        this.bossElementTimer -= delta;
        if (this.bossElementTimer <= 0) {
          this.cycleBossElementalBlock(true);
        }
      }

      // Seismic Leg Slam Windup & Shockwave Ring Release
      if (this.slamWindupTimer > 0) {
        this.slamWindupTimer -= delta;
        if (this.slamWindupTimer <= 0 && this.spellSystem) {
          audioSynth.playFireballExplode();
          const ringOrigin = new THREE.Vector3(this.position.x, this.baseFloorY, this.position.z);
          this.spellSystem.castBossShockwaveRing(
            ringOrigin,
            this.bossPhase >= 3 ? 0xff2266 : 0xff6611,
            25.0,
            this.bossPhase >= 3 ? 13.5 : 10.8,
            18
          );
          this.spellSystem.createSparks(ringOrigin.clone().add(new THREE.Vector3(0, 0.5, 0)), 0xff6611, 16);
        }
      } else if (this.bossVulnerableTimer <= 0) {
        this.slamCooldown -= delta;
        if (this.slamCooldown <= 0 && this.position.distanceTo(player.position) < 22.0) {
          this.slamCooldown = this.bossPhase >= 3 ? 6.2 : 8.5;
          this.slamWindupTimer = 0.95;
          if (this.telemetry) {
            this.telemetry.spawnFloatingText(
              this.position.clone().add(new THREE.Vector3(0, 5.8, 0)),
              'COLOSSAL LEG SLAM! [JUMP OVER SHOCKWAVE]',
              '#ff8822',
              1.35
            );
          }
        }
      }
    }

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

    // Aggro requires either Raycast Line-of-Sight within aggroRange OR close proximity (< 7.5m, or 32m for World Boss)
    if (!this.isAggro && distToPlayer < this.aggroRange && (this.hasLOS || distToPlayer < (this.isWorldBoss ? 32.0 : 7.5))) {
      this.isAggro = true;
      audioSynth.playEnemyAggro(this.type);
    }

    let isMoving = false;

    if (this.isAggro) {
      if (this.aggroDelay > 0) {
        this.aggroDelay -= delta;
        this.sprite.update(delta, player.camera);
        if (this.isWorldBoss) this.updateWorldBossRig(delta, player, false);
        return;
      }

      const dirToPlayer = new THREE.Vector3().subVectors(player.position, this.position);
      dirToPlayer.y = 0;
      const len = dirToPlayer.length();
      if (len > 0.001) dirToPlayer.divideScalar(len);

      const perpDir = new THREE.Vector3(-dirToPlayer.z * this.flankDir, 0, dirToPlayer.x * this.flankDir);

      let moveDir = new THREE.Vector3();
      let moveSpeedBoost = 1.0;

      // Skeleton Sorcerer emergency blink if player gets too close (< 4.2m)
      if (this.type === 'skeleton' && distToPlayer < 4.2 && this.blinkCooldown <= 0) {
        this.blinkCooldown = 4.0;
        this.tryBlinkTeleport(player, walls, level, 4.0);
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

          if (distToPlayer < 5.2 && distToPlayer > 2.6 && this.leapOffsetY === 0 && Math.random() < delta * 1.4) {
            this.leapVelY = 4.2;
            moveSpeedBoost = 1.8;
          }
        } else {
          this.sprite.setAnimation('attack');
          if (this.attackCooldown <= 0) {
            this.attackCooldown = this.attackInterval;
            player.takeDamage(this.damage);
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
        // Ranged Tactical Casters & Colossal World Boss
        if (this.isWorldBoss && this.bossVulnerableTimer > 0) {
          // Stunned during weak-point window
          isMoving = false;
          this.sprite.setAnimation('hurt');
        } else if (!this.hasLOS) {
          moveDir.copy(dirToPlayer).addScaledVector(perpDir, 1.15).normalize();
          isMoving = true;
          this.sprite.setAnimation('walk');
        } else if (distToPlayer > this.preferredDistance + 1.5) {
          moveDir.copy(dirToPlayer);
          if (this.flankTimer > 0) moveDir.addScaledVector(perpDir, 0.85).normalize();
          isMoving = true;
          this.sprite.setAnimation('walk');
        } else if (distToPlayer < this.preferredDistance - 1.5 && !this.isWorldBoss) {
          moveDir.copy(dirToPlayer).negate().addScaledVector(perpDir, 0.65).normalize();
          isMoving = true;
          this.sprite.setAnimation('walk');
        } else if (this.flankTimer > 0 || this.type === 'fire_imp' || this.isWorldBoss) {
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

        // Ranged Spell Volley (paused if World Boss is stunned in Weak-Point Window)
        if (
          this.hasLOS &&
          distToPlayer <= this.attackRange &&
          this.attackCooldown <= 0 &&
          (!this.isWorldBoss || this.bossVulnerableTimer <= 0)
        ) {
          this.attackCooldown = this.attackInterval;
          this.sprite.setAnimation('attack');

          const shootOrigin = this.position.clone();
          shootOrigin.y += this.isWorldBoss ? 3.2 : this.spriteConfig.height * 0.58;
          const aimDir = new THREE.Vector3()
            .subVectors(player.position, shootOrigin)
            .add(new THREE.Vector3(0, -0.2, 0))
            .normalize();

          if (this.type === 'skeleton') {
            this.spellSystem.castEnemyProjectile('soul', shootOrigin, aimDir, true);
          } else if (this.type === 'fire_imp') {
            const leftAim = aimDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.07);
            const rightAim = aimDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.07);
            this.spellSystem.castEnemyProjectile('imp_fire', shootOrigin, leftAim);
            this.spellSystem.castEnemyProjectile('imp_fire', shootOrigin, rightAim);
          } else if (this.type === 'frost_wraith') {
            [-0.14, 0, 0.14].forEach((ang) => {
              const fanDir = aimDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
              this.spellSystem.castEnemyProjectile('wraith_frost', shootOrigin, fanDir);
            });
          } else {
            // 6. KHAR'ZUL WORLD BOSS: Multi-Eye Void Laser Fan + Homing Abyssal Venom Orbs in Phase II-IV
            const angles =
              this.bossPhase >= 4
                ? [-0.36, -0.24, -0.12, 0, 0.12, 0.24, 0.36]
                : this.bossPhase >= 2
                ? [-0.26, -0.13, 0, 0.13, 0.26]
                : [-0.15, 0, 0.15];
            angles.forEach((ang) => {
              const fanDir = aimDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
              this.spellSystem.castEnemyProjectile('laser', shootOrigin, fanDir);
            });
            if (this.bossPhase >= 2 && Math.random() < 0.45) {
              this.spellSystem.castEnemyProjectile('soul', shootOrigin, aimDir, true);
            }
          }
        }
      }

      if (isMoving) {
        const currentSpeed = this.baseSpeed * this.speedMultiplier * moveSpeedBoost;
        const step = moveDir.clone().multiplyScalar(currentSpeed * delta);
        const newPos = this.position.clone().add(step);

        let blocked = false;
        if (walls) {
          const checkRad = this.isWorldBoss ? 1.45 : this.radius;
          for (let i = 0; i < walls.length; i++) {
            const box = walls[i].boundingBox;
            if (!box) continue;
            const enemyBox = new THREE.Box3(
              new THREE.Vector3(newPos.x - checkRad, newPos.y + 0.2, newPos.z - checkRad),
              new THREE.Vector3(newPos.x + checkRad, newPos.y + 2.0, newPos.z + checkRad)
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
    } else if (this.isWorldBoss) {
      visualY += (this.bossVulnerableTimer > 0 ? 0.35 : 1.05) + Math.sin(this.hoverTimer * 2.2) * 0.18;
    }
    this.position.y = visualY;

    this.sprite.setPosition(this.position.x, this.position.y, this.position.z);
    const hitH = this.isWorldBoss ? 7.5 : this.spriteConfig.height + 0.35;
    this.hitMesh.position.set(this.position.x, this.baseFloorY + hitH / 2, this.position.z);
    this.sprite.update(delta, player.camera);

    if (this.isWorldBoss) {
      this.updateWorldBossRig(delta, player, isMoving);
    }
  }

  dispose() {
    this.scene.remove(this.sprite.mesh);
    this.scene.remove(this.hitMesh);
    if (this.bossRig) {
      this.scene.remove(this.bossRig.root);
    }
    this.sprite.dispose();
    this.hitMesh.geometry.dispose();
    this.hitMesh.material.dispose();
    if (this.hbTexture) this.hbTexture.dispose();
  }
}
