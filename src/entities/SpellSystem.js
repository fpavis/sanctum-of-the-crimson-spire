import * as THREE from 'three';
import { audioSynth } from '../engine/AudioSynthesizer.js';

export class SpellSystem {
  constructor(scene, camera, projectileTexture, combatTelemetry, postProcessor) {
    this.scene = scene;
    this.camera = camera;
    this.projectileTexture = projectileTexture;
    this.telemetry = combatTelemetry;
    this.postProcessor = postProcessor;

    this.projectiles = [];
    this.impacts = [];
    this.lightningEffects = [];
    this.particles = [];
    this.debrisChunks = [];
    this.shockwaves = [];

    this.projGeometry = new THREE.PlaneGeometry(0.85, 0.85);
    this.impactGeometry = new THREE.PlaneGeometry(1.6, 1.6);
    this.particleGeometry = new THREE.PlaneGeometry(0.14, 0.14);
    this.debrisGeometry = new THREE.DodecahedronGeometry(0.16, 0);

    this.projMaterials = [0, 1, 2, 3].map((frameIdx) => {
      const tex = this.projectileTexture.clone();
      tex.needsUpdate = true;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.repeat.set(0.96 / 4, 0.96);
      tex.offset.set((frameIdx + 0.02) / 4, 0.02);
      return new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.05,
        side: THREE.DoubleSide
      });
    });

    // Shared 3D Frost Lance & Poison Orb Materials
    this.frostSpearOuterMat = new THREE.MeshBasicMaterial({
      color: 0x55f0ff,
      transparent: true,
      opacity: 0.94
    });
    this.frostSpearCoreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff
    });
    this.frostSpearFinMat = new THREE.MeshBasicMaterial({
      color: 0x00ccff,
      side: THREE.DoubleSide
    });

    this.poisonCoreMat = new THREE.MeshBasicMaterial({
      color: 0xd8ff33
    });
    this.poisonCageMat = new THREE.MeshBasicMaterial({
      color: 0x18ff44,
      wireframe: true
    });
    this.poisonHaloMat = new THREE.MeshBasicMaterial({
      color: 0x22ff55,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    });

    this.activeSpellLight = new THREE.PointLight(0xff6611, 0, 11);
    this.scene.add(this.activeSpellLight);

    this.particleGroup = new THREE.Group();
    this.scene.add(this.particleGroup);

    const shieldGeo = new THREE.SphereGeometry(1.25, 14, 14);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x33ccff,
      transparent: true,
      opacity: 0,
      wireframe: true
    });
    this.shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    this.shieldMesh.visible = false;
    this.scene.add(this.shieldMesh);
    this.shieldActive = false;
    this.shieldTimer = 0;
  }

  castPyrobomb(origin, direction, statMultiplier = 1.0) {
    audioSynth.playFireballCast();

    const mesh = new THREE.Mesh(this.projGeometry, this.projMaterials[0]);
    mesh.position.copy(origin);
    this.scene.add(mesh);

    this.activeSpellLight.color.setHex(0xff6611);
    this.activeSpellLight.intensity = 3.2;
    this.activeSpellLight.position.copy(origin);

    this.projectiles.push({
      type: 'pyrobomb',
      mesh,
      ownsLight: true,
      direction: direction.clone().normalize(),
      speed: 15.0,
      damage: Math.round(58 * statMultiplier),
      radius: 0.44,
      aoeRadius: 4.8,
      aoeDamage: Math.round(44 * statMultiplier),
      life: 4.5,
      isEnemy: false
    });
  }

  /**
   * Builds a true 3D forward-pointing crystalline Frost Lance spear oriented along +Z (lookAt target)
   */
  createFrostLanceMesh(scale = 1.0) {
    const root = new THREE.Group();
    const spinGroup = new THREE.Group();
    root.add(spinGroup);

    // Forward-pointing 6-faceted crystal spearhead (+Z tip)
    const tipGeo = new THREE.ConeGeometry(0.18 * scale, 1.05 * scale, 6);
    tipGeo.rotateX(Math.PI / 2);
    const tipMesh = new THREE.Mesh(tipGeo, this.frostSpearOuterMat);
    tipMesh.position.z = 0.28 * scale;
    spinGroup.add(tipMesh);

    // Bright pure-white inner ice core
    const coreGeo = new THREE.ConeGeometry(0.10 * scale, 0.88 * scale, 6);
    coreGeo.rotateX(Math.PI / 2);
    const coreMesh = new THREE.Mesh(coreGeo, this.frostSpearCoreMat);
    coreMesh.position.z = 0.22 * scale;
    spinGroup.add(coreMesh);

    // Rear tapered crystal tail (-Z point)
    const tailGeo = new THREE.ConeGeometry(0.15 * scale, 0.52 * scale, 6);
    tailGeo.rotateX(-Math.PI / 2);
    const tailMesh = new THREE.Mesh(tailGeo, this.frostSpearFinMat);
    tailMesh.position.z = -0.36 * scale;
    spinGroup.add(tailMesh);

    // 4 Radial Crystalline Fins around the shaft
    const finGeoH = new THREE.BoxGeometry(0.52 * scale, 0.04 * scale, 0.46 * scale);
    const finH = new THREE.Mesh(finGeoH, this.frostSpearFinMat);
    finH.position.z = -0.06 * scale;
    spinGroup.add(finH);

    const finGeoV = new THREE.BoxGeometry(0.04 * scale, 0.52 * scale, 0.46 * scale);
    const finV = new THREE.Mesh(finGeoV, this.frostSpearFinMat);
    finV.position.z = -0.06 * scale;
    spinGroup.add(finV);

    return { root, spinGroup };
  }

  /**
   * Builds a high-visibility opaque 3D Toxic-Green Poison Orb for Skeleton Sorcerers
   */
  createPoisonOrbMesh() {
    const root = new THREE.Group();
    const spinGroup = new THREE.Group();
    root.add(spinGroup);

    // Solid opaque bright lime-green toxic core
    const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), this.poisonCoreMat);
    spinGroup.add(coreMesh);

    // Spinning faceted toxic emerald outer cage
    const cageMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 0), this.poisonCageMat);
    spinGroup.add(cageMesh);

    // 3 Orbiting Venom Droplets
    for (let i = 0; i < 3; i++) {
      const ang = (i * Math.PI * 2) / 3;
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.085, 6, 6), this.poisonCoreMat);
      drop.position.set(Math.cos(ang) * 0.44, Math.sin(ang) * 0.44, 0);
      spinGroup.add(drop);
    }

    // Billboarded outer glowing poison ring
    const haloMesh = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.46, 16), this.poisonHaloMat);
    root.add(haloMesh);

    return { root, spinGroup, haloMesh };
  }

  castFrostLance(origin, direction, statMultiplier = 1.0) {
    audioSynth.playFrostCast();

    const dir = direction.clone().normalize();
    const { root, spinGroup } = this.createFrostLanceMesh(1.0);
    root.position.copy(origin);
    root.lookAt(origin.clone().add(dir));
    this.scene.add(root);

    this.activeSpellLight.color.setHex(0x22ddff);
    this.activeSpellLight.intensity = 2.6;
    this.activeSpellLight.position.copy(origin);

    this.projectiles.push({
      type: 'frost',
      mesh: root,
      spinGroup,
      orientToDirection: true,
      trailTimer: 0,
      ownsLight: true,
      direction: dir,
      speed: 19.5,
      damage: Math.round(40 * statMultiplier),
      radius: 0.40,
      slowDuration: 4.5,
      life: 4.5,
      isEnemy: false
    });
  }

  clearAll() {
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles = [];
    for (const imp of this.impacts) this.scene.remove(imp.mesh);
    this.impacts = [];
    for (const fx of this.lightningEffects) {
      this.scene.remove(fx.line);
      fx.line.geometry.dispose();
      fx.line.material.dispose();
    }
    this.lightningEffects = [];
    for (const pt of this.particles) this.particleGroup.remove(pt.mesh);
    this.particles = [];
    for (const d of this.debrisChunks) this.scene.remove(d.mesh);
    this.debrisChunks = [];
    for (const sw of this.shockwaves) {
      this.scene.remove(sw.mesh);
      sw.mesh.geometry.dispose();
      sw.mesh.material.dispose();
    }
    this.shockwaves = [];
    this.activeSpellLight.intensity = 0;
  }

  castBossShockwaveRing(origin, colorHex = 0xff5511, maxRadius = 22.0, speed = 11.5, damage = 18) {
    const geo = new THREE.TorusGeometry(1.0, 0.14, 8, 36);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.92
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(origin.x, origin.y + 0.22, origin.z);
    this.scene.add(mesh);

    this.shockwaves.push({
      mesh,
      origin: origin.clone(),
      radius: 1.0,
      maxRadius,
      speed,
      damage,
      hitPlayer: false
    });
  }

  castArcaneLightning(origin, direction, enemies, walls, destructibles = [], statMultiplier = 1.0, player = null) {
    audioSynth.playLightningCast();
    if (this.postProcessor) this.postProcessor.triggerChromaticPulse(0.6);

    const raycaster = new THREE.Raycaster(origin, direction.clone().normalize(), 0.1, 48);
    const wallMeshes = walls || [];
    const enemyHitBoxes = enemies.map((e) => e.hitMesh || e.sprite.mesh);
    const destructibleMeshes = destructibles.filter((d) => !d.destroyed).map((d) => d.hitMesh || d.mesh);
    const buttons = player && player.level && player.level.shootableButtons ? player.level.shootableButtons : [];
    const buttonMeshes = buttons.map((b) => b.hitMesh || b.mesh);

    const intersects = raycaster.intersectObjects([
      ...enemyHitBoxes,
      ...destructibleMeshes,
      ...buttonMeshes,
      ...wallMeshes
    ]);

    let targetPoint = origin.clone().add(direction.clone().normalize().multiplyScalar(36));
    let hitEnemy = null;
    let hitDestructible = null;
    let hitButton = null;

    if (intersects.length > 0) {
      const hit = intersects[0];
      targetPoint = hit.point;

      for (const enemy of enemies) {
        if (enemy.hitMesh === hit.object || enemy.sprite.mesh === hit.object) {
          hitEnemy = enemy;
          break;
        }
      }

      if (!hitEnemy) {
        for (const d of destructibles) {
          if ((d.hitMesh === hit.object || d.mesh === hit.object) && !d.destroyed) {
            hitDestructible = d;
            break;
          }
        }
      }

      if (!hitEnemy && !hitDestructible) {
        for (const b of buttons) {
          if (b.hitMesh === hit.object || b.mesh === hit.object) {
            hitButton = b;
            break;
          }
        }
      }
    }

    this.createLightningBolt(origin, targetPoint, 0xaa44ff);
    this.createSparks(targetPoint, 0xaa44ff, 12);

    if (hitDestructible) {
      hitDestructible.takeDamage(Math.round(70 * statMultiplier), this, 'lightning');
    }

    if (hitButton && hitButton.trigger) {
      hitButton.trigger(this, player);
    }

    if (hitEnemy && !hitEnemy.isDead) {
      const wasFrozen = hitEnemy.slowTimer > 0;
      hitEnemy.takeDamage(Math.round(72 * statMultiplier), 'lightning', player);

      if (wasFrozen) {
        if (this.telemetry) {
          this.telemetry.registerHit(true, 'SYNERGY: SUPERCONDUCT CHAIN LIGHTNING');
          this.telemetry.spawnFloatingText(
            hitEnemy.position.clone().add(new THREE.Vector3(0, 2.6, 0)),
            'SUPERCONDUCT!',
            '#55ffff',
            1.35
          );
        }

        // Direct Superconduct Overload surge on the primary frozen target (especially devastating against Boss Combo Shields!)
        if (!hitEnemy.isDead) {
          hitEnemy.takeDamage(Math.round(88 * statMultiplier), 'synergy_superconduct', player);
        }

        let chainCount = 0;
        for (const other of enemies) {
          if (other === hitEnemy || other.isDead) continue;
          const dist = other.position.distanceTo(hitEnemy.position);
          if (dist < 14.5 && chainCount < 3) {
            chainCount++;
            const pA = hitEnemy.position.clone().add(new THREE.Vector3(0, 1.3, 0));
            const pB = other.position.clone().add(new THREE.Vector3(0, 1.3, 0));
            this.createLightningBolt(pA, pB, 0x00ffff);
            other.takeDamage(Math.round(62 * statMultiplier), 'synergy_superconduct', player);
            other.applySlow(0.5, 2.5);
          }
        }
      }
    }

    return targetPoint;
  }

  createLightningBolt(startPoint, endPoint, colorHex = 0xaa44ff) {
    const points = [];
    const segments = 10;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const pt = new THREE.Vector3().lerpVectors(startPoint, endPoint, t);
      if (i > 0 && i < segments) {
        pt.x += (Math.random() - 0.5) * 0.45;
        pt.y += (Math.random() - 0.5) * 0.45;
        pt.z += (Math.random() - 0.5) * 0.45;
      }
      points.push(pt);
    }

    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({ color: colorHex });
    const line = new THREE.Line(lineGeo, lineMat);
    this.scene.add(line);

    this.activeSpellLight.color.setHex(colorHex);
    this.activeSpellLight.intensity = 4.0;
    this.activeSpellLight.position.copy(endPoint);

    this.lightningEffects.push({
      line,
      timer: 0.18
    });
  }

  castAegisShield(player, enemies = [], statMultiplier = 1.0) {
    audioSynth.playAegisCast();
    if (this.postProcessor) this.postProcessor.triggerChromaticPulse(0.45);

    if (this.shieldActive && player) {
      this.createSparks(player.position, 0x33ccff, 18);
      if (this.telemetry) {
        this.telemetry.registerHit(true, 'AEGIS REPULSION NOVA');
      }
      for (const enemy of enemies) {
        if (enemy.isDead) continue;
        const d = enemy.position.distanceTo(player.position);
        const reach = enemy.type === 'arcane_eye' ? 9.5 : 6.5;
        if (d < reach) {
          const pushDir = new THREE.Vector3().subVectors(enemy.position, player.position).normalize();
          if (enemy.type !== 'arcane_eye') {
            enemy.position.addScaledVector(pushDir, 3.2);
          }
          enemy.takeDamage(Math.round(52 * statMultiplier), 'synergy_aegis_nova', player);
          enemy.applySlow(0.4, 3.0);
        }
      }
    }

    this.shieldActive = true;
    this.shieldTimer = 7.5;
    this.shieldMesh.visible = true;
    this.shieldMesh.material.opacity = 0.65;
  }

  castEnemyProjectile(type, origin, direction, isHoming = false) {
    if (this.projectiles.length > 36) return;

    let matIdx = 2;
    let speed = 8.0;
    let damage = 13;

    if (type === 'soul') {
      matIdx = 2;
      damage = 13;
      speed = 7.6;
    } else if (type === 'imp_fire') {
      matIdx = 0;
      damage = 11;
      speed = 9.4;
    } else if (type === 'wraith_frost') {
      matIdx = 1;
      damage = 10;
      speed = 9.8;
    } else if (type === 'knight_wave') {
      matIdx = 2;
      damage = 15;
      speed = 8.8;
    } else if (type === 'laser') {
      matIdx = 0;
      damage = 16;
      speed = 10.8;
    }

    const dir = direction.clone().normalize();
    let mesh = null;
    let spinGroup = null;
    let haloMesh = null;
    let orientToDirection = false;

    if (type === 'soul') {
      // High-visibility opaque 3D Toxic-Green Poison Orb for Skeleton Sorcerer
      const orb = this.createPoisonOrbMesh();
      mesh = orb.root;
      spinGroup = orb.spinGroup;
      haloMesh = orb.haloMesh;
    } else if (type === 'wraith_frost') {
      // Forward-pointing 3D Ice Shard for Frost Wraith
      const lance = this.createFrostLanceMesh(0.78);
      mesh = lance.root;
      spinGroup = lance.spinGroup;
      orientToDirection = true;
    } else {
      mesh = new THREE.Mesh(this.projGeometry, this.projMaterials[matIdx]);
    }

    mesh.position.copy(origin);
    if (orientToDirection) {
      mesh.lookAt(origin.clone().add(dir));
    }
    this.scene.add(mesh);

    this.projectiles.push({
      type,
      mesh,
      spinGroup,
      haloMesh,
      orientToDirection,
      trailTimer: 0,
      ownsLight: false,
      direction: dir,
      speed,
      damage,
      radius: 0.35,
      life: 4.0,
      isEnemy: true,
      isHoming
    });
  }

  createExplosionImpact(position, scale = 1.0) {
    if (this.postProcessor) this.postProcessor.triggerChromaticPulse(0.8 * scale);

    const mesh = new THREE.Mesh(this.impactGeometry, this.projMaterials[3]);
    mesh.scale.set(scale, scale, scale);
    mesh.position.copy(position);
    this.scene.add(mesh);

    this.activeSpellLight.color.setHex(0xff7722);
    this.activeSpellLight.intensity = 5.0;
    this.activeSpellLight.position.copy(position);

    this.impacts.push({
      mesh,
      life: 0.28,
      maxLife: 0.28
    });

    this.createSparks(position, 0xffaa33, 12);
  }

  createSparks(pos, colorHex, count = 10) {
    if (this.particles.length > 45) return;

    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide
    });

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.particleGeometry, mat);
      mesh.position.copy(pos);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 7,
        Math.random() * 4.5 + 1,
        (Math.random() - 0.5) * 7
      );

      this.particleGroup.add(mesh);
      this.particles.push({
        mesh,
        mat,
        vel,
        life: 0.4 + Math.random() * 0.2
      });
    }
  }

  spawnPhysicsDebris(pos, colorHex = 0x44aaff, count = 7) {
    if (this.debrisChunks.length > 25) return;

    const mat = new THREE.MeshBasicMaterial({ color: colorHex });

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.debrisGeometry, mat);
      mesh.position.copy(pos);
      mesh.position.y += 0.4 + Math.random() * 0.6;

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        Math.random() * 5.5 + 2,
        (Math.random() - 0.5) * 8
      );
      const rotVel = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10
      );

      this.scene.add(mesh);
      this.debrisChunks.push({
        mesh,
        vel,
        rotVel,
        life: 1.6 + Math.random() * 0.5
      });
    }
  }

  update(delta, player, enemies, walls, destructibles = []) {
    if (this.activeSpellLight.intensity > 0) {
      this.activeSpellLight.intensity = Math.max(0, this.activeSpellLight.intensity - delta * 8.0);
    }

    if (this.shieldActive) {
      this.shieldTimer -= delta;
      this.shieldMesh.position.copy(player.position);
      this.shieldMesh.position.y += 0.8;
      this.shieldMesh.rotation.y += delta * 2.2;
      this.shieldMesh.rotation.x += delta * 1.5;

      if (this.shieldTimer <= 0) {
        this.shieldActive = false;
        this.shieldMesh.visible = false;
      }
    }

    for (let i = this.lightningEffects.length - 1; i >= 0; i--) {
      const fx = this.lightningEffects[i];
      fx.timer -= delta;
      if (fx.timer <= 0) {
        this.scene.remove(fx.line);
        fx.line.geometry.dispose();
        fx.line.material.dispose();
        this.lightningEffects.splice(i, 1);
      }
    }

    const camQuat = this.camera.quaternion;
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const imp = this.impacts[i];
      imp.life -= delta;
      imp.mesh.quaternion.copy(camQuat);
      imp.mesh.scale.multiplyScalar(1.0 + delta * 2.0);

      if (imp.life <= 0) {
        this.scene.remove(imp.mesh);
        this.impacts.splice(i, 1);
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= delta;
      p.vel.y -= delta * 9.8;
      p.mesh.position.addScaledVector(p.vel, delta);
      p.mesh.quaternion.copy(camQuat);

      if (p.life <= 0) {
        this.particleGroup.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }

    for (let i = this.debrisChunks.length - 1; i >= 0; i--) {
      const d = this.debrisChunks[i];
      d.life -= delta;
      d.vel.y -= delta * 16.0;
      d.mesh.position.addScaledVector(d.vel, delta);
      d.mesh.rotation.x += d.rotVel.x * delta;
      d.mesh.rotation.y += d.rotVel.y * delta;

      if (d.mesh.position.y < 0.15) {
        d.mesh.position.y = 0.15;
        d.vel.y *= -0.45;
        d.vel.x *= 0.75;
        d.vel.z *= 0.75;
      }

      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        this.debrisChunks.splice(i, 1);
      }
    }

    // Update World Boss Seismic Shockwave Rings (Jump or Dash over them!)
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.radius += sw.speed * delta;
      sw.mesh.scale.set(sw.radius, 1.0, sw.radius);
      sw.mesh.material.opacity = Math.max(0, 0.92 * (1.0 - sw.radius / sw.maxRadius));

      if (!sw.hitPlayer && player && !player.isDead) {
        const distXZ = Math.hypot(player.position.x - sw.origin.x, player.position.z - sw.origin.z);
        const feetY = player.position.y - player.playerHeight;
        // Player can jump over the seismic ring if feetY > sw.origin.y + 0.95
        if (Math.abs(distXZ - sw.radius) < 0.78 && feetY <= sw.origin.y + 0.95) {
          sw.hitPlayer = true;
          if (this.shieldActive) {
            audioSynth.playAegisCast();
            this.createSparks(player.position, 0x33ccff, 10);
          } else {
            player.takeDamage(sw.damage);
            if (this.telemetry) {
              this.telemetry.spawnFloatingText(
                player.position.clone().add(new THREE.Vector3(0, 0.4, 0)),
                'SEISMIC SLAM! [JUMP OVER RING]',
                '#ff6622',
                1.15
              );
            }
          }
        }
      }

      if (sw.radius >= sw.maxRadius) {
        this.scene.remove(sw.mesh);
        sw.mesh.geometry.dispose();
        sw.mesh.material.dispose();
        this.shockwaves.splice(i, 1);
      }
    }

    // 6. Update Projectiles with 4-Step Swept Cylindrical Collision & Homing Soul Orbs
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.life -= delta;

      // Homing Necrotic Soul Orb gently steers toward player
      if (proj.isEnemy && proj.isHoming && player && !player.isDead) {
        const desired = new THREE.Vector3().subVectors(player.position, proj.mesh.position).normalize();
        proj.direction.lerp(desired, Math.min(1, delta * 1.45)).normalize();
      }

      const subSteps = 4;
      const stepDist = (proj.speed * delta) / subSteps;
      let collided = false;
      let directHitEnemy = null;
      const hitPos = proj.mesh.position;

      for (let step = 0; step < subSteps && !collided; step++) {
        hitPos.addScaledVector(proj.direction, stepDist);

        // A. Check Enemies FIRST (Full Cylindrical Hitbox: XZ radius + full sprite height Y)
        if (!proj.isEnemy) {
          for (let e = 0; e < enemies.length; e++) {
            const enemy = enemies[e];
            if (enemy.isDead) continue;

            const dx = hitPos.x - enemy.position.x;
            const dz = hitPos.z - enemy.position.z;
            const distXZ = Math.hypot(dx, dz);
            const enemyH = enemy.spriteConfig ? enemy.spriteConfig.height : 2.15;
            const withinY =
              hitPos.y >= enemy.position.y - 0.45 &&
              hitPos.y <= enemy.position.y + enemyH + 0.50;

            if (distXZ < enemy.radius + proj.radius + 0.32 && withinY) {
              collided = true;
              directHitEnemy = enemy;

              if (proj.type === 'pyrobomb' && enemy.slowTimer > 0) {
                const shatterBonus = Math.floor(proj.damage * 2.2);
                enemy.takeDamage(shatterBonus, 'synergy_shatter', player);
                enemy.slowTimer = 0;
                enemy.speedMultiplier = 1.0;
                enemy.sprite.setStatusTint('none');
                this.spawnPhysicsDebris(enemy.position, 0x66eeff, 8);

                if (this.telemetry) {
                  this.telemetry.registerHit(true, 'SYNERGY: THERMAL SHOCK SHATTER (2.2X DMG)');
                  this.telemetry.spawnFloatingText(
                    enemy.position.clone().add(new THREE.Vector3(0, 2.6, 0)),
                    `SHATTER! ${shatterBonus}`,
                    '#00ffff',
                    1.45
                  );
                }
              } else {
                enemy.takeDamage(proj.damage, proj.type, player);
              }

              if (proj.type === 'frost' && proj.slowDuration && !enemy.isDead) {
                enemy.applySlow(0.42, proj.slowDuration);
              }
              break;
            }
          }
        } else if (player && !player.isDead) {
          const dx = hitPos.x - player.position.x;
          const dz = hitPos.z - player.position.z;
          const distXZ = Math.hypot(dx, dz);
          const feetY = player.position.y - player.playerHeight;
          const withinY = hitPos.y >= feetY - 0.25 && hitPos.y <= player.position.y + 0.35;

          if (distXZ < 0.85 && withinY) {
            collided = true;
            if (this.shieldActive) {
              audioSynth.playAegisCast();
              this.createSparks(hitPos, 0x33aaff, 8);
            } else {
              player.takeDamage(proj.damage);
              if (proj.type === 'wraith_frost') {
                player.applyChill(1.6);
              }
            }
          }
        }

        // B. Check Destructible Crystals & Shootable Arcane Rune Buttons
        if (!collided && !proj.isEnemy) {
          if (destructibles) {
            for (let d = 0; d < destructibles.length; d++) {
              const dest = destructibles[d];
              if (dest.destroyed) continue;
              const distXZ = Math.hypot(hitPos.x - dest.position.x, hitPos.z - dest.position.z);
              const dy = Math.abs(hitPos.y - dest.position.y);
              if (distXZ < dest.radius + proj.radius + 0.28 && dy < 1.65) {
                collided = true;
                const elem = proj.type === 'pyrobomb' ? 'fire' : proj.type;
                dest.takeDamage(proj.damage, this, elem);
                break;
              }
            }
          }

          const buttons = player && player.level && player.level.shootableButtons ? player.level.shootableButtons : null;
          if (!collided && buttons) {
            for (let b = 0; b < buttons.length; b++) {
              const btn = buttons[b];
              const dist = hitPos.distanceTo(btn.position);
              if (dist < (btn.radius || 0.75) + proj.radius + 0.25) {
                collided = true;
                btn.trigger(this, player);
                break;
              }
            }
          }
        }

        // C. Check Walls & Closed Portcullis Doors
        if (!collided && walls) {
          for (let w = 0; w < walls.length; w++) {
            if (walls[w].boundingBox && walls[w].boundingBox.containsPoint(hitPos)) {
              collided = true;
              break;
            }
          }
        }
        const doors = player && player.level && player.level.doors ? player.level.doors : null;
        if (!collided && doors) {
          for (let d = 0; d < doors.length; d++) {
            const door = doors[d];
            if (!door.isOpen && door.boundingBox && door.boundingBox.containsPoint(hitPos)) {
              collided = true;
              break;
            }
          }
        }

        // D. Check Local Terrain Floor & Ceiling
        if (!collided) {
          const localFloorY =
            player && player.level && player.level.getFloorHeight
              ? player.level.getFloorHeight(hitPos.x, hitPos.z, hitPos.y)
              : player
              ? player.currentFloorY
              : 0;
          if (hitPos.y < localFloorY + 0.06 || hitPos.y > localFloorY + 14.0) {
            collided = true;
          }
        }
      }

      if (proj.orientToDirection) {
        proj.mesh.lookAt(proj.mesh.position.clone().add(proj.direction));
      } else if (!proj.spinGroup) {
        proj.mesh.quaternion.copy(camQuat);
      }

      if (proj.spinGroup) {
        proj.spinGroup.rotation.z += delta * 14.0;
        if (proj.type === 'soul') {
          proj.spinGroup.rotation.x += delta * 7.5;
          proj.spinGroup.rotation.y += delta * 9.5;
        }
      }
      if (proj.haloMesh) {
        proj.haloMesh.quaternion.copy(camQuat);
      }

      // Emit subtle frost or poison trail sparks during flight
      proj.trailTimer = (proj.trailTimer || 0) + delta;
      if (proj.trailTimer >= 0.055) {
        proj.trailTimer = 0;
        if (proj.type === 'frost' || proj.type === 'wraith_frost') {
          this.createSparks(proj.mesh.position, 0x66f4ff, 1);
        } else if (proj.type === 'soul') {
          this.createSparks(proj.mesh.position, 0x44ff33, 2);
        }
      }

      if (proj.ownsLight) {
        this.activeSpellLight.position.copy(proj.mesh.position);
        this.activeSpellLight.intensity = 3.0;
      }

      if (collided || proj.life <= 0) {
        if (proj.type === 'pyrobomb') {
          audioSynth.playFireballExplode();
          this.createExplosionImpact(hitPos.clone(), 1.25);

          for (let e = 0; e < enemies.length; e++) {
            const enemy = enemies[e];
            if (enemy.isDead || enemy === directHitEnemy) continue;
            const enemyH = enemy.spriteConfig ? enemy.spriteConfig.height : 2.1;
            const torsoPos = new THREE.Vector3(enemy.position.x, enemy.position.y + enemyH * 0.5, enemy.position.z);
            const d = hitPos.distanceTo(torsoPos);
            if (d < proj.aoeRadius) {
              const falloff = 1.0 - d / proj.aoeRadius;
              enemy.takeDamage(Math.max(8, Math.floor(proj.aoeDamage * falloff)), 'fire', player);
            }
          }

          for (let d = 0; d < destructibles.length; d++) {
            const dest = destructibles[d];
            if (dest.destroyed) continue;
            if (hitPos.distanceTo(dest.position) < proj.aoeRadius) {
              dest.takeDamage(50, this, 'fire');
            }
          }

          const buttons = player && player.level && player.level.shootableButtons ? player.level.shootableButtons : null;
          if (buttons) {
            for (let b = 0; b < buttons.length; b++) {
              const btn = buttons[b];
              if (hitPos.distanceTo(btn.position) < proj.aoeRadius * 0.85) {
                btn.trigger(this, player);
              }
            }
          }
        } else if (proj.type === 'frost' || proj.type === 'wraith_frost') {
          audioSynth.playFrostHit();
          this.createSparks(hitPos, 0x55ddff, 10);
        } else if (proj.type === 'soul') {
          this.createSparks(hitPos, 0x44ff33, 10);
        } else {
          this.createSparks(hitPos, 0xaa44ff, 6);
        }

        this.scene.remove(proj.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }
}
