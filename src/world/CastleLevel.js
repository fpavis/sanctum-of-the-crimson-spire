import * as THREE from 'three';
import { AnimatedBillboardSprite } from '../engine/SpriteAnimator.js';
import { audioSynth } from '../engine/AudioSynthesizer.js';
import { ProceduralDungeonGenerator } from './ProceduralDungeonGenerator.js';

/**
 * CastleLevel V3:
 * - Graph-Based Procedural Dungeon Generation (ProceduralDungeonGenerator)
 * - Diverse Biome PBR Textures (Stone Keep, Volcanic Obsidian Lava, Alchemical Emerald Sanctum, Glacial Nordic Ice)
 * - Rich Decorative World Assets (Iron Fire Braziers, Wizard Bookcases, Skull Ritual Altars, Castle Banners, Cauldrons, 3D Crystals)
 * - 3D Platforming Sections (4 Procedural Stepping-Stone Patterns, Elemental Hazard Basins & Arcane Jump Pads)
 */
export class CastleLevel {
  constructor(scene, pbrTextures, spriteTextures, telemetry) {
    this.scene = scene;
    this.pbrTextures = pbrTextures;
    this.spriteTextures = spriteTextures;
    this.telemetry = telemetry;

    this.dungeonGenerator = new ProceduralDungeonGenerator(Date.now());
    this.currentSeed = this.dungeonGenerator.seed;

    this.stageGroup = new THREE.Group();
    this.scene.add(this.stageGroup);

    this.walls = [];
    this.doors = [];
    this.torches = [];
    this.torchSprites = [];
    this.pickups = [];
    this.destructibles = [];
    this.animatedSprites = [];
    this.portals = [];
    this.heightZones = [];
    this.jumpPads = [];
    this.hazardZones = [];
    this.minimapRooms = [];
    this.minimapCorridors = [];
    this.graphEdges = [];

    this.currentStageId = 'overworld';
    this.onPortalEnter = null;
    this.nearestPortal = null;
    this.portalCooldown = 0;

    this.initSharedMaterials();
  }

  initSharedMaterials() {
    // 4 Distinct Biome Wall Materials
    this.wallMaterials = {
      stone: new THREE.MeshStandardMaterial({
        map: this.pbrTextures.wall.albedo,
        normalMap: this.pbrTextures.wall.normal,
        roughnessMap: this.pbrTextures.wall.roughness,
        roughness: 0.82,
        metalness: 0.08
      }),
      lava: new THREE.MeshStandardMaterial({
        map: (this.pbrTextures.lavaWall || this.pbrTextures.wall).albedo,
        normalMap: (this.pbrTextures.lavaWall || this.pbrTextures.wall).normal,
        roughnessMap: (this.pbrTextures.lavaWall || this.pbrTextures.wall).roughness,
        roughness: 0.75,
        metalness: 0.15,
        emissive: 0x330a00,
        emissiveIntensity: 0.35
      }),
      ice: new THREE.MeshStandardMaterial({
        map: (this.pbrTextures.iceWall || this.pbrTextures.wall).albedo,
        normalMap: (this.pbrTextures.iceWall || this.pbrTextures.wall).normal,
        roughnessMap: (this.pbrTextures.iceWall || this.pbrTextures.wall).roughness,
        roughness: 0.45,
        metalness: 0.25,
        emissive: 0x001a33,
        emissiveIntensity: 0.3
      }),
      sanctum: new THREE.MeshStandardMaterial({
        map: (this.pbrTextures.sanctumWall || this.pbrTextures.wall).albedo,
        normalMap: (this.pbrTextures.sanctumWall || this.pbrTextures.wall).normal,
        roughnessMap: (this.pbrTextures.sanctumWall || this.pbrTextures.wall).roughness,
        roughness: 0.68,
        metalness: 0.22,
        emissive: 0x061a12,
        emissiveIntensity: 0.25
      })
    };

    // 4 Distinct Biome Floor Materials
    this.floorMaterials = {
      stone: new THREE.MeshStandardMaterial({
        map: this.pbrTextures.floor.albedo,
        normalMap: this.pbrTextures.floor.normal,
        roughnessMap: this.pbrTextures.floor.roughness,
        roughness: 0.72,
        metalness: 0.14
      }),
      lava: new THREE.MeshStandardMaterial({
        map: (this.pbrTextures.lavaWall || this.pbrTextures.floor).albedo,
        normalMap: (this.pbrTextures.lavaWall || this.pbrTextures.floor).normal,
        roughness: 0.78,
        metalness: 0.18,
        color: 0xaa8877
      }),
      ice: new THREE.MeshStandardMaterial({
        map: (this.pbrTextures.iceWall || this.pbrTextures.floor).albedo,
        normalMap: (this.pbrTextures.iceWall || this.pbrTextures.floor).normal,
        roughness: 0.35,
        metalness: 0.3,
        color: 0x99ddff
      }),
      sanctum: new THREE.MeshStandardMaterial({
        map: (this.pbrTextures.sanctumWall || this.pbrTextures.floor).albedo,
        normalMap: (this.pbrTextures.sanctumWall || this.pbrTextures.floor).normal,
        roughness: 0.65,
        metalness: 0.2,
        color: 0x99ccaa
      })
    };

    this.activeWallMat = this.wallMaterials.stone;
    this.activeFloorMat = this.floorMaterials.stone;

    this.ceilMaterial = new THREE.MeshStandardMaterial({
      map: this.pbrTextures.wall.albedo,
      normalMap: this.pbrTextures.wall.normal,
      roughness: 0.85,
      metalness: 0.08,
      color: 0x665555,
      side: THREE.DoubleSide
    });

    this.stainedGlassMaterial = new THREE.MeshBasicMaterial({
      map: this.pbrTextures.stainedGlass.albedo,
      side: THREE.DoubleSide
    });

    this.pillarMaterial = new THREE.MeshStandardMaterial({
      map: this.pbrTextures.wall.albedo,
      normalMap: this.pbrTextures.wall.normal,
      roughness: 0.75,
      metalness: 0.12
    });

    // Shared Torch Sconce Material (Frame 3 of normalized pickups_and_props)
    this.sharedTorchTex = this.spriteTextures.props.clone();
    this.sharedTorchTex.needsUpdate = true;
    this.sharedTorchTex.repeat.set(1 / 4, 1);
    this.sharedTorchTex.offset.set(3 / 4, 0);

    this.sharedTorchMat = new THREE.MeshBasicMaterial({
      map: this.sharedTorchTex,
      transparent: true,
      alphaTest: 0.08,
      side: THREE.DoubleSide
    });
    this.sharedTorchGeo = new THREE.PlaneGeometry(0.95, 0.95);

    // Pre-create 4 Decorative Dungeon Prop Materials from dungeon_decor_props.jpg
    // 0: Brazier, 1: Bookshelf, 2: Skull Altar, 3: Hanging Banner
    this.decorMaterials = [0, 1, 2, 3].map((frameIdx) => {
      const baseTex = this.spriteTextures.decor || this.spriteTextures.props;
      const tex = baseTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(1 / 4, 1);
      tex.offset.set(frameIdx / 4, 0);
      return new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.08,
        side: THREE.DoubleSide
      });
    });
  }

  clearStage() {
    while (this.stageGroup.children.length > 0) {
      const child = this.stageGroup.children[0];
      this.stageGroup.remove(child);
    }
    this.walls = [];
    this.doors = [];
    this.torches = [];
    this.torchSprites = [];
    this.pickups = [];
    this.destructibles = [];
    this.animatedSprites = [];
    this.portals = [];
    this.heightZones = [];
    this.jumpPads = [];
    this.hazardZones = [];
    this.minimapRooms = [];
    this.minimapCorridors = [];
    this.graphEdges = [];
    this.nearestPortal = null;
  }

  loadStage(stageId, customSeed = null) {
    this.clearStage();
    this.currentStageId = stageId;
    this.portalCooldown = 1.25;

    if (customSeed !== null) {
      this.currentSeed = customSeed;
    } else {
      this.currentSeed = Math.floor(Math.random() * 900000) + 100000;
    }

    if (stageId === 'overworld') return this.buildOverworldAscent();
    if (stageId === 'stage1' || stageId === 'stage2' || stageId === 'stage3' || stageId === 'stage4') {
      return this.buildProceduralBiomeStage(stageId, this.currentSeed);
    }
    if (stageId === 'stage5') return this.buildStage5HighSpire(this.currentSeed);
    return this.buildOverworldAscent();
  }

  getFloorHeight(x, z, currentFeetY = 999) {
    let bestH = -999;
    let fallbackBaseH = 0;

    for (let i = 0; i < this.heightZones.length; i++) {
      const hz = this.heightZones[i];
      if (x >= hz.xMin && x <= hz.xMax && z >= hz.zMin && z <= hz.zMax) {
        if (hz.type === 'flat') {
          if (hz.isJumpPlatform) {
            if (currentFeetY >= hz.y - 0.65 && hz.y > bestH) {
              bestH = hz.y;
            }
          } else {
            if (currentFeetY >= hz.y - 0.85 && hz.y > bestH) {
              bestH = hz.y;
            }
            if (hz.y < fallbackBaseH || fallbackBaseH === 0) {
              fallbackBaseH = hz.y;
            }
          }
        } else if (hz.type === 'rampZ') {
          const t = THREE.MathUtils.clamp((z - hz.zStart) / (hz.zEnd - hz.zStart), 0, 1);
          const y = THREE.MathUtils.lerp(hz.yStart, hz.yEnd, t);
          if (currentFeetY >= y - 1.15 && y > bestH) {
            bestH = y;
          }
        } else if (hz.type === 'rampX') {
          const t = THREE.MathUtils.clamp((x - hz.xStart) / (hz.xEnd - hz.xStart), 0, 1);
          const y = THREE.MathUtils.lerp(hz.yStart, hz.yEnd, t);
          if (currentFeetY >= y - 1.15 && y > bestH) {
            bestH = y;
          }
        }
      }
    }

    return bestH > -900 ? bestH : fallbackBaseH;
  }

  // --- HELPER BUILDERS ---

  createWall(x, yBottom, z, width, depth, height = 6.5, isCollider = true) {
    const geo = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geo, this.activeWallMat);
    mesh.position.set(x, yBottom + height / 2, z);

    if (isCollider) {
      mesh.geometry.computeBoundingBox();
      mesh.boundingBox = new THREE.Box3().setFromObject(mesh);
      this.walls.push(mesh);
    }

    this.stageGroup.add(mesh);
    return mesh;
  }

  createPlatformBlock(x, yTop, z, width, depth, thickness = 2.0) {
    const geo = new THREE.BoxGeometry(width, thickness, depth);
    const mesh = new THREE.Mesh(geo, this.activeFloorMat);
    mesh.position.set(x, yTop - thickness / 2, z);
    this.stageGroup.add(mesh);

    this.heightZones.push({
      type: 'flat',
      isJumpPlatform: false,
      xMin: x - width / 2,
      xMax: x + width / 2,
      zMin: z - depth / 2,
      zMax: z + depth / 2,
      y: yTop
    });
    return mesh;
  }

  createJumpPlatform(x, yTop, z, width, depth, thickness = 0.7, trimColor = 0x00eeff) {
    const geo = new THREE.BoxGeometry(width, thickness, depth);
    const mesh = new THREE.Mesh(geo, this.activeFloorMat);
    mesh.position.set(x, yTop - thickness / 2, z);
    this.stageGroup.add(mesh);

    const trimGeo = new THREE.BoxGeometry(width + 0.12, 0.1, depth + 0.12);
    const trimMat = new THREE.MeshBasicMaterial({ color: trimColor });
    const trimMesh = new THREE.Mesh(trimGeo, trimMat);
    trimMesh.position.set(x, yTop - 0.06, z);
    this.stageGroup.add(trimMesh);

    const pillarGeo = new THREE.CylinderGeometry(
      Math.min(width, depth) * 0.22,
      Math.min(width, depth) * 0.3,
      Math.max(0.5, yTop + 2.0),
      8
    );
    const pillarMesh = new THREE.Mesh(pillarGeo, this.activeWallMat);
    pillarMesh.position.set(x, yTop - thickness - Math.max(0.5, yTop + 2.0) / 2, z);
    this.stageGroup.add(pillarMesh);

    this.heightZones.push({
      type: 'flat',
      isJumpPlatform: true,
      xMin: x - width / 2 - 0.22,
      xMax: x + width / 2 + 0.22,
      zMin: z - depth / 2 - 0.22,
      zMax: z + depth / 2 + 0.22,
      y: yTop
    });
    return mesh;
  }

  createJumpPad(x, yBottom, z, boostVelocity = 12.8, colorHex = 0x00ffcc) {
    const baseGeo = new THREE.CylinderGeometry(1.15, 1.3, 0.18, 16);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x222634,
      roughness: 0.4,
      metalness: 0.6
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.set(x, yBottom + 0.09, z);
    this.stageGroup.add(baseMesh);

    const ringGeo = new THREE.RingGeometry(0.45, 0.98, 20);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(x, yBottom + 0.2, z);
    this.stageGroup.add(ringMesh);

    const coreGeo = new THREE.CircleGeometry(0.32, 16);
    coreGeo.rotateX(-Math.PI / 2);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.set(x, yBottom + 0.21, z);
    this.stageGroup.add(coreMesh);

    this.jumpPads.push({
      position: new THREE.Vector3(x, yBottom, z),
      ringMesh,
      boostVelocity,
      radius: 1.25,
      cooldown: 0
    });
  }

  createHazardBasin(x, ySurface, z, width, depth, type = 'lava') {
    const colors = {
      lava: 0xff3300,
      acid: 0x11cc44,
      frost: 0x0088ff,
      void: 0x441188
    };
    const col = colors[type] || 0xff3300;

    const geo = new THREE.PlaneGeometry(width, depth);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.85
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, ySurface, z);
    this.stageGroup.add(mesh);

    this.heightZones.push({
      type: 'flat',
      isJumpPlatform: false,
      xMin: x - width / 2,
      xMax: x + width / 2,
      zMin: z - depth / 2,
      zMax: z + depth / 2,
      y: ySurface
    });

    this.hazardZones.push({
      xMin: x - width / 2,
      xMax: x + width / 2,
      zMin: z - depth / 2,
      zMax: z + depth / 2,
      ySurface,
      type,
      damage: 6
    });
  }

  createStaircaseZ(x, zStart, zEnd, yStart, yEnd, width = 4.6, stepCount = 12) {
    const zMin = Math.min(zStart, zEnd);
    const zMax = Math.max(zStart, zEnd);
    const stepDepth = (zMax - zMin) / stepCount;

    for (let i = 0; i < stepCount; i++) {
      const t = (i + 0.5) / stepCount;
      const stepY = THREE.MathUtils.lerp(yStart, yEnd, (i + 1) / stepCount);
      const stepZ = THREE.MathUtils.lerp(zStart, zEnd, t);
      const h = Math.max(0.5, stepY + 1.5);
      const geo = new THREE.BoxGeometry(width, h, stepDepth + 0.08);
      const mesh = new THREE.Mesh(geo, this.activeFloorMat);
      mesh.position.set(x, stepY - h / 2, stepZ);
      this.stageGroup.add(mesh);
    }

    this.heightZones.push({
      type: 'rampZ',
      xMin: x - width / 2 - 0.3,
      xMax: x + width / 2 + 0.3,
      zMin: zMin - 0.3,
      zMax: zMax + 0.3,
      zStart,
      zEnd,
      yStart,
      yEnd
    });
  }

  createStaircaseX(z, xStart, xEnd, yStart, yEnd, depth = 4.6, stepCount = 10) {
    const xMin = Math.min(xStart, xEnd);
    const xMax = Math.max(xStart, xEnd);
    const stepWidth = (xMax - xMin) / stepCount;

    for (let i = 0; i < stepCount; i++) {
      const t = (i + 0.5) / stepCount;
      const stepY = THREE.MathUtils.lerp(yStart, yEnd, (i + 1) / stepCount);
      const stepX = THREE.MathUtils.lerp(xStart, xEnd, t);
      const h = Math.max(0.5, stepY + 1.5);
      const geo = new THREE.BoxGeometry(stepWidth + 0.08, h, depth);
      const mesh = new THREE.Mesh(geo, this.activeFloorMat);
      mesh.position.set(stepX, stepY - h / 2, z);
      this.stageGroup.add(mesh);
    }

    this.heightZones.push({
      type: 'rampX',
      xMin: xMin - 0.3,
      xMax: xMax + 0.3,
      zMin: z - depth / 2 - 0.3,
      zMax: z + depth / 2 + 0.3,
      xStart,
      xEnd,
      yStart,
      yEnd
    });
  }

  createColumn(x, yBottom, z, radius = 0.58, height = 6.5) {
    const geo = new THREE.CylinderGeometry(radius, radius * 1.12, height, 10);
    const mesh = new THREE.Mesh(geo, this.activeWallMat);
    mesh.position.set(x, yBottom + height / 2, z);

    mesh.geometry.computeBoundingBox();
    mesh.boundingBox = new THREE.Box3().setFromObject(mesh);
    this.walls.push(mesh);
    this.stageGroup.add(mesh);

    const capGeo = new THREE.BoxGeometry(radius * 2.5, 0.45, radius * 2.5);
    const capMesh = new THREE.Mesh(capGeo, this.activeWallMat);
    capMesh.position.set(x, yBottom + height - 0.22, z);
    this.stageGroup.add(capMesh);
    return mesh;
  }

  /**
   * Spawns a 3D architectural / orthographic decorative prop from dungeon_decor_props.jpg:
   * type: 'brazier' (0), 'bookshelf' (1), 'skull_altar' (2), 'banner' (3)
   */
  createDecorProp(type, x, yBottom, z, scale = 1.0, rotY = null) {
    const idxMap = { brazier: 0, bookshelf: 1, skull_altar: 2, banner: 3 };
    const idx = idxMap[type] !== undefined ? idxMap[type] : 0;
    const mat = this.decorMaterials[idx];

    // Auto-orient wall-mounted props (bookshelf & banner) flush against the nearest room wall
    const resolvedRotY =
      rotY !== null
        ? rotY
        : x < -8.0
          ? Math.PI / 2
          : x > 8.0
            ? -Math.PI / 2
            : z > 15.0
              ? Math.PI
              : 0;

    if (type === 'bookshelf') {
      const w = 2.35 * scale;
      const h = 2.95 * scale;
      const cabinetW = w * 0.57; // Matches exact width of normalized orthographic bookcase sprite
      const depth = 0.56 * scale;

      const group = new THREE.Group();
      group.position.set(x, yBottom, z);
      group.rotation.y = resolvedRotY;

      if (!this.woodCabinetMat) {
        this.woodCabinetMat = new THREE.MeshStandardMaterial({
          color: 0x362010,
          roughness: 0.85,
          metalness: 0.06
        });
      }

      // 3D solid oak bookcase cabinet body aligned flush with the pixel-art frame
      const bodyGeo = new THREE.BoxGeometry(cabinetW, h * 0.96, depth);
      const bodyMesh = new THREE.Mesh(bodyGeo, this.woodCabinetMat);
      bodyMesh.position.set(0, (h * 0.96) / 2, 0);
      group.add(bodyMesh);

      // Orthographic front-facing bookcase shelves mapped cleanly onto the front face
      const frontGeo = new THREE.PlaneGeometry(w, h);
      const frontMesh = new THREE.Mesh(frontGeo, mat);
      frontMesh.position.set(0, h / 2, depth / 2 + 0.02);
      group.add(frontMesh);

      this.stageGroup.add(group);
      group.updateMatrixWorld(true);

      const collider = new THREE.Mesh(new THREE.BoxGeometry(cabinetW, h, depth + 0.1));
      collider.position.set(x, yBottom + h / 2, z);
      collider.rotation.y = resolvedRotY;
      collider.updateMatrixWorld(true);
      collider.boundingBox = new THREE.Box3().setFromObject(collider);
      this.walls.push(collider);
      return;
    }

    if (type === 'banner') {
      const w = 1.55 * scale;
      const h = 2.45 * scale;
      const group = new THREE.Group();
      group.position.set(x, yBottom + 2.55 * scale, z);
      group.rotation.y = resolvedRotY;

      const planeMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      planeMesh.position.set(0, 0, 0.06);
      group.add(planeMesh);

      this.stageGroup.add(group);
      return;
    }

    if (type === 'skull_altar') {
      const w = 2.15 * scale;
      const h = 1.95 * scale;
      const altarW = w * 0.86;
      const altarH = h * 0.38;
      const altarDepth = 0.78 * scale;

      const group = new THREE.Group();
      group.position.set(x, yBottom, z);
      group.rotation.y = resolvedRotY;

      // 3D stone altar block aligned with the room's floor tile grid
      const plinthGeo = new THREE.BoxGeometry(altarW, altarH, altarDepth);
      const plinthMesh = new THREE.Mesh(plinthGeo, this.activeWallMat);
      plinthMesh.position.set(0, altarH / 2, 0);
      group.add(plinthMesh);

      // Front-facing orthographic skull altar & green candles on the front face
      const frontMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      frontMesh.position.set(0, h / 2, altarDepth / 2 + 0.02);
      group.add(frontMesh);

      this.stageGroup.add(group);
      group.updateMatrixWorld(true);

      const collider = new THREE.Mesh(new THREE.BoxGeometry(altarW, altarH + 0.6, altarDepth));
      collider.position.set(x, yBottom + (altarH + 0.6) / 2, z);
      collider.rotation.y = resolvedRotY;
      collider.updateMatrixWorld(true);
      collider.boundingBox = new THREE.Box3().setFromObject(collider);
      this.walls.push(collider);
      return;
    }

    // Default: 'brazier' (radially symmetric wrought-iron fire brazier on 3D stone base ring)
    const w = 1.45 * scale;
    const h = 1.85 * scale;
    const baseGeo = new THREE.CylinderGeometry(0.52 * scale, 0.65 * scale, 0.16 * scale, 10);
    const baseMesh = new THREE.Mesh(baseGeo, this.activeWallMat);
    baseMesh.position.set(x, yBottom + 0.08 * scale, z);
    this.stageGroup.add(baseMesh);

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, yBottom + 0.10 * scale + h * 0.5, z);
    this.stageGroup.add(mesh);
    this.torchSprites.push(mesh);
  }

  createTorchSprite(x, y, z) {
    const spriteMesh = new THREE.Mesh(this.sharedTorchGeo, this.sharedTorchMat);
    spriteMesh.position.set(x, y, z);
    this.stageGroup.add(spriteMesh);
    this.torchSprites.push(spriteMesh);
  }

  createRoomLight(x, y, z, color, intensity = 4.5, dist = 26) {
    const light = new THREE.PointLight(color, intensity, dist, 1.35);
    light.position.set(x, y, z);
    this.stageGroup.add(light);
    this.torches.push({
      light,
      baseIntensity: intensity,
      flickerSeed: Math.random() * 100
    });
  }

  createStagePortal(x, yBottom, z, targetStageId, title, subtitle, colorHex = 0x8844ff) {
    const pillarLeft = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.8, 0.6), this.activeWallMat);
    pillarLeft.position.set(x - 1.6, yBottom + 1.9, z);
    this.stageGroup.add(pillarLeft);

    const pillarRight = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.8, 0.6), this.activeWallMat);
    pillarRight.position.set(x + 1.6, yBottom + 1.9, z);
    this.stageGroup.add(pillarRight);

    const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.7, 0.8), this.activeWallMat);
    lintel.position.set(x, yBottom + 3.9, z);
    this.stageGroup.add(lintel);

    const portalSprite = new AnimatedBillboardSprite(this.spriteTextures.portal, {
      cols: 4,
      rows: 4,
      width: 2.9,
      height: 2.9,
      fps: 10,
      animations: {
        idle: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
      },
      defaultAnim: 'idle'
    });
    portalSprite.setPosition(x, yBottom + 0.35, z);
    this.stageGroup.add(portalSprite.mesh);
    this.animatedSprites.push(portalSprite);

    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 128;
    const ctx = signCanvas.getContext('2d');
    ctx.fillStyle = 'rgba(10, 8, 18, 0.92)';
    ctx.fillRect(8, 8, 496, 112);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, 496, 112);

    ctx.font = 'bold 24px Cinzel, Georgia, serif';
    ctx.fillStyle = '#ffd766';
    ctx.textAlign = 'center';
    ctx.fillText(title, 256, 54);

    ctx.font = 'bold 17px Cinzel, Georgia, serif';
    ctx.fillStyle = '#88eeff';
    ctx.fillText(subtitle, 256, 92);

    const signTex = new THREE.CanvasTexture(signCanvas);
    const signMat = new THREE.MeshBasicMaterial({ map: signTex, transparent: true, side: THREE.DoubleSide });
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 0.95), signMat);
    signMesh.position.set(x, yBottom + 4.85, z);
    this.stageGroup.add(signMesh);
    this.torchSprites.push(signMesh);

    this.portals.push({
      position: new THREE.Vector3(x, yBottom + 1.5, z),
      targetStageId,
      title,
      subtitle,
      radius: 2.1,
      colorHex
    });
  }

  createFacetedCrystal(x, yBottom, z, colorHex) {
    const geo = new THREE.OctahedronGeometry(0.55, 0);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 0.18,
      roughness: 0.22,
      metalness: 0.3,
      flatShading: true
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, yBottom + 1.25, z);
    mesh.scale.set(0.75, 1.55, 0.75);
    mesh.rotation.y = 0.55;
    this.stageGroup.add(mesh);

    const pedGeo = new THREE.CylinderGeometry(0.42, 0.55, 0.5, 8);
    const pedMesh = new THREE.Mesh(pedGeo, this.activeWallMat);
    pedMesh.position.set(x, yBottom + 0.25, z);
    this.stageGroup.add(pedMesh);

    const crystalObj = {
      mesh,
      mat,
      position: new THREE.Vector3(x, yBottom + 1.1, z),
      baseY: yBottom + 1.25,
      radius: 0.75,
      health: 30,
      color: colorHex,
      destroyed: false,
      seed: Math.random() * 10,
      takeDamage: (dmg, spellSystem) => {
        if (crystalObj.destroyed) return;
        crystalObj.health -= dmg;
        audioSynth.playFrostHit();
        if (crystalObj.health <= 0) {
          crystalObj.destroyed = true;
          this.stageGroup.remove(crystalObj.mesh);
          if (window.gameApp && window.gameApp.player) {
            window.gameApp.player.gainXP(25);
          }
          if (spellSystem) {
            spellSystem.spawnPhysicsDebris(crystalObj.position, crystalObj.color, 8);
          }
          if (this.telemetry) {
            this.telemetry.spawnFloatingText(
              crystalObj.position.clone().add(new THREE.Vector3(0, 1.2, 0)),
              'CRYSTAL SHATTERED +150 (+25 XP)',
              '#66ffff',
              1.2
            );
          }
          this.spawnSinglePickup(
            Math.random() > 0.45 ? 'mana' : 'health',
            crystalObj.position.x,
            yBottom,
            crystalObj.position.z
          );
        }
      }
    };

    this.destructibles.push(crystalObj);
  }

  spawnSinglePickup(type, x, yBottom, z) {
    const frame = type === 'health' ? 0 : type === 'mana' ? 1 : 2;
    const tex = this.spriteTextures.props.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1 / 4, 1);
    tex.offset.set(frame / 4, 0);

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.08,
      side: THREE.DoubleSide
    });
    const sz = type === 'grimoire' ? 1.15 : 0.85;
    const geo = new THREE.PlaneGeometry(sz, sz);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, yBottom + (type === 'grimoire' ? 0.95 : 0.75), z);
    this.stageGroup.add(mesh);

    let ringMesh = null;
    if (type === 'grimoire') {
      const ringGeo = new THREE.RingGeometry(0.45, 0.85, 20);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffd700,
        side: THREE.DoubleSide
      });
      ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.set(x, yBottom + 0.06, z);
      this.stageGroup.add(ringMesh);
    }

    this.pickups.push({
      type,
      mesh,
      ringMesh,
      mat,
      x,
      z,
      baseY: yBottom + (type === 'grimoire' ? 0.95 : 0.75),
      bobSeed: Math.random() * 10,
      collected: false
    });
  }

  addMoonAndStars() {
    const moonGeo = new THREE.CircleGeometry(7.5, 32);
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xfff6d6, fog: false });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    moonMesh.position.set(12, 42, -78);
    this.stageGroup.add(moonMesh);

    const haloGeo = new THREE.CircleGeometry(14.5, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x6699ff,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      fog: false
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    haloMesh.position.set(12, 42, -78.2);
    this.stageGroup.add(haloMesh);

    const starPositions = [];
    for (let i = 0; i < 260; i++) {
      const sx = (Math.random() - 0.5) * 160;
      const sy = 15 + Math.random() * 65;
      const sz = -85 + (Math.random() - 0.5) * 130;
      starPositions.push(sx, sy, sz);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xe8f2ff, size: 0.42, fog: false });
    const stars = new THREE.Points(starGeo, starMat);
    this.stageGroup.add(stars);
  }

  /**
   * Builds an ornate Gothic stone & gold archway framing a room doorway
   */
  createDoorwayArchFrame(x, yBottom, z, doorW, doorH, axis = 'Z', trimColor = 0xffaa33) {
    const pillarGeo = new THREE.BoxGeometry(0.65, doorH + 0.3, 0.95);
    const lintelGeo =
      axis === 'Z'
        ? new THREE.BoxGeometry(doorW + 1.2, 0.65, 1.05)
        : new THREE.BoxGeometry(1.05, 0.65, doorW + 1.2);
    const trimMat = new THREE.MeshStandardMaterial({
      color: trimColor,
      emissive: trimColor,
      emissiveIntensity: 0.35,
      roughness: 0.4,
      metalness: 0.6
    });

    if (axis === 'Z') {
      const leftPillar = new THREE.Mesh(pillarGeo, this.pillarMaterial);
      leftPillar.position.set(x - doorW / 2 - 0.25, yBottom + doorH / 2, z);
      const rightPillar = new THREE.Mesh(pillarGeo, this.pillarMaterial);
      rightPillar.position.set(x + doorW / 2 + 0.25, yBottom + doorH / 2, z);
      const lintel = new THREE.Mesh(lintelGeo, trimMat);
      lintel.position.set(x, yBottom + doorH + 0.15, z);
      this.stageGroup.add(leftPillar, rightPillar, lintel);
    } else {
      const northPillar = new THREE.Mesh(pillarGeo, this.pillarMaterial);
      northPillar.position.set(x, yBottom + doorH / 2, z - doorW / 2 - 0.25);
      const southPillar = new THREE.Mesh(pillarGeo, this.pillarMaterial);
      southPillar.position.set(x, yBottom + doorH / 2, z + doorW / 2 + 0.25);
      const lintel = new THREE.Mesh(lintelGeo, trimMat);
      lintel.position.set(x, yBottom + doorH + 0.15, z);
      this.stageGroup.add(northPillar, southPillar, lintel);
    }
  }

  /**
   * Builds the 4 enclosing walls, ceiling, and doorway cutouts for an individual room node
   */
  buildRoomShell(node, biome) {
    const { x, y, z, w, d, doors } = node;
    const wallH = biome.openSky ? Math.min(7.2, node.wallH || 7.2) : (node.wallH || 9.6);
    const doorW = 5.8;
    const doorH = 5.4;

    if (!biome.openSky) {
      const ceilGeo = new THREE.PlaneGeometry(w + 1.2, d + 1.2);
      ceilGeo.rotateX(Math.PI / 2);
      const ceilMesh = new THREE.Mesh(ceilGeo, this.ceilMaterial);
      ceilMesh.position.set(x, y + wallH, z);
      this.stageGroup.add(ceilMesh);
    }

    // Helper for North/South walls (along X axis)
    const buildZWall = (zWall, hasDoor) => {
      if (!hasDoor) {
        this.createWall(x, y - 2.0, zWall, w + 1.0, 1.0, wallH + 2.0, true);
      } else {
        const segW = (w - doorW) / 2;
        this.createWall(x - doorW / 2 - segW / 2, y - 2.0, zWall, segW + 0.5, 1.0, wallH + 2.0, true);
        this.createWall(x + doorW / 2 + segW / 2, y - 2.0, zWall, segW + 0.5, 1.0, wallH + 2.0, true);
        // Overhead doorway lintel (visual only so player walks under freely)
        this.createWall(x, y + doorH, zWall, doorW + 0.4, 1.0, wallH - doorH, false);
        this.createDoorwayArchFrame(x, y, zWall, doorW, doorH, 'Z', biome.trimColor);
      }
    };

    // Helper for West/East walls (along Z axis)
    const buildXWall = (xWall, hasDoor) => {
      if (!hasDoor) {
        this.createWall(xWall, y - 2.0, z, 1.0, d + 1.0, wallH + 2.0, true);
      } else {
        const segD = (d - doorW) / 2;
        this.createWall(xWall, y - 2.0, z - doorW / 2 - segD / 2, 1.0, segD + 0.5, wallH + 2.0, true);
        this.createWall(xWall, y - 2.0, z + doorW / 2 + segD / 2, 1.0, segD + 0.5, wallH + 2.0, true);
        this.createWall(xWall, y + doorH, z, 1.0, doorW + 0.4, wallH - doorH, false);
        this.createDoorwayArchFrame(xWall, y, z, doorW, doorH, 'X', biome.trimColor);
      }
    };

    buildZWall(z - d / 2, doors.north);
    buildZWall(z + d / 2, doors.south);
    buildXWall(x - w / 2, doors.west);
    buildXWall(x + w / 2, doors.east);
  }

  /**
   * Builds an enclosed 3D stone hallway / staircase connecting two adjacent room doorways
   */
  buildGraphEdgeCorridor(edge, biome) {
    const corrW = 5.8;
    const wallH = biome.openSky ? 6.8 : 8.4;

    if (edge.dir === 'NS') {
      const zMid = (edge.zStart + edge.zEnd) / 2;
      const corrLen = Math.abs(edge.zEnd - edge.zStart);
      const yMin = Math.min(edge.yStart, edge.yEnd);
      const yAvg = (edge.yStart + edge.yEnd) / 2;

      this.createStaircaseZ(edge.x, edge.zStart, edge.zEnd, edge.yStart, edge.yEnd, corrW, 12);
      this.createWall(edge.x - corrW / 2 - 0.45, yMin - 2.0, zMid, 0.9, corrLen + 0.4, wallH + 3.0, true);
      this.createWall(edge.x + corrW / 2 + 0.45, yMin - 2.0, zMid, 0.9, corrLen + 0.4, wallH + 3.0, true);

      if (!biome.openSky) {
        const ceilGeo = new THREE.PlaneGeometry(corrW + 1.0, corrLen + 0.6);
        ceilGeo.rotateX(Math.PI / 2);
        const ceilMesh = new THREE.Mesh(ceilGeo, this.ceilMaterial);
        ceilMesh.position.set(edge.x, yMin + wallH + 1.2, zMid);
        this.stageGroup.add(ceilMesh);
      }

      this.createTorchSprite(edge.x - corrW / 2 + 0.25, yAvg + 2.6, zMid);
      this.minimapCorridors.push({
        x: edge.x - corrW / 2,
        z: Math.min(edge.zStart, edge.zEnd),
        rw: corrW,
        rd: corrLen
      });
    } else if (edge.dir === 'EW') {
      const xMid = (edge.xStart + edge.xEnd) / 2;
      const corrLen = Math.abs(edge.xEnd - edge.xStart);
      const yMin = Math.min(edge.yStart, edge.yEnd);
      const yAvg = (edge.yStart + edge.yEnd) / 2;

      this.createStaircaseX(edge.z, edge.xStart, edge.xEnd, edge.yStart, edge.yEnd, corrW, 12);
      this.createWall(xMid, yMin - 2.0, edge.z - corrW / 2 - 0.45, corrLen + 0.4, 0.9, wallH + 3.0, true);
      this.createWall(xMid, yMin - 2.0, edge.z + corrW / 2 + 0.45, corrLen + 0.4, 0.9, wallH + 3.0, true);

      if (!biome.openSky) {
        const ceilGeo = new THREE.PlaneGeometry(corrLen + 0.6, corrW + 1.0);
        ceilGeo.rotateX(Math.PI / 2);
        const ceilMesh = new THREE.Mesh(ceilGeo, this.ceilMaterial);
        ceilMesh.position.set(xMid, yMin + wallH + 1.2, edge.z);
        this.stageGroup.add(ceilMesh);
      }

      this.createTorchSprite(xMid, yAvg + 2.6, edge.z - corrW / 2 + 0.25);
      this.minimapCorridors.push({
        x: Math.min(edge.xStart, edge.xEnd),
        z: edge.z - corrW / 2,
        rw: corrLen,
        rd: corrW
      });
    }
  }

  /**
   * Populates an individual enclosed room node with procedural props, pillars, crystals, and enemies
   */
  populateRoomArchetype(node, biome, enemyList) {
    const { x, y, z, w, d, archetype } = node;
    // Scale all interior offsets proportionally to this room's own footprint (reference layout is 20x20)
    const fx = w / 20;
    const fz = d / 20;
    const X = (dx) => x + dx * fx;
    const Z = (dz) => z + dz * fz;
    // Wall-mounted props sit beside the doorway (>= 4.7 from centre) but never inside the side walls
    const wallDx = Math.min(w / 2 - 1.6, Math.max(4.7, 6.0 * fx));
    const northWallZ = z - d / 2 + 0.88;
    const northBannerZ = z - d / 2 + 0.62;
    const colH = Math.min(6.5, (node.wallH || 9.0) - 0.9);

    if (archetype === 'ARCANE_LIBRARY') {
      this.createDecorProp('bookshelf', x - wallDx, y, northWallZ, 1.0, 0);
      this.createDecorProp('bookshelf', x + wallDx, y, northWallZ, 1.0, 0);
      this.createDecorProp('brazier', x, y, Z(2.5), 0.95);
      this.createFacetedCrystal(x, y, Z(-2.0), 0x00eeff);
      this.spawnSinglePickup('mana', x, y, Z(4.5));
      enemyList.push({ type: 'skeleton', x: X(-3.6), y, z: Z(-2.0) });
      enemyList.push({ type: 'frost_wraith', x: X(3.6), y, z: Z(2.0) });
    } else if (archetype === 'RITUAL_SKULL_ALTAR') {
      this.createDecorProp('skull_altar', x, y, z, 1.1);
      this.createDecorProp('brazier', X(-4.2), y, Z(3.2), 0.9);
      this.createDecorProp('brazier', X(4.2), y, Z(3.2), 0.9);
      this.createFacetedCrystal(X(-4.2), y, Z(-3.2), 0xaa44ff);
      this.spawnSinglePickup('health', X(4.0), y, Z(-3.2));
      enemyList.push({ type: 'dread_knight', x: x, y, z: Z(3.6) });
      enemyList.push({ type: 'skeleton', x: X(-3.8), y, z: Z(-2.6) });
    } else if (archetype === 'BRAZIER_ARMORY') {
      this.createDecorProp('brazier', X(-4.0), y, Z(-3.2), 1.0);
      this.createDecorProp('brazier', X(4.0), y, Z(-3.2), 1.0);
      this.createDecorProp('banner', x - wallDx, y, northBannerZ, 1.0, 0);
      this.createDecorProp('banner', x + wallDx, y, northBannerZ, 1.0, 0);
      this.createColumn(X(-4.0), y, Z(3.2), 0.6, colH);
      this.createColumn(X(4.0), y, Z(3.2), 0.6, colH);
      this.spawnSinglePickup('health', x, y, z);
      enemyList.push({ type: 'gargoyle', x: X(-3.2), y, z: Z(1.5) });
      enemyList.push({ type: 'fire_imp', x: X(3.2), y, z: Z(-1.8) });
    } else if (archetype === 'ALCHEMICAL_CAULDRON_LAB') {
      const cauldron = new AnimatedBillboardSprite(this.spriteTextures.cauldron, {
        cols: 2,
        rows: 2,
        width: 2.2,
        height: 2.2,
        fps: 5,
        animations: { idle: [0, 1, 2, 3] },
        defaultAnim: 'idle'
      });
      cauldron.setPosition(x, y, z);
      this.stageGroup.add(cauldron.mesh);
      this.animatedSprites.push(cauldron);
      this.createDecorProp('bookshelf', x - wallDx, y, northWallZ, 1.0, 0);
      this.createFacetedCrystal(X(4.2), y, Z(-2.8), 0x33ff88);
      this.spawnSinglePickup('mana', X(-3.5), y, Z(3.2));
      enemyList.push({ type: 'frost_wraith', x: X(-3.2), y, z: Z(-1.5) });
      enemyList.push({ type: 'fire_imp', x: X(3.5), y, z: Z(2.0) });
    } else if (archetype === 'CRYSTAL_RELIQUARY') {
      this.createFacetedCrystal(X(-4.0), y, Z(-2.5), 0x00eeff);
      this.createFacetedCrystal(X(4.0), y, Z(-2.5), 0xffaa22);
      this.createDecorProp('skull_altar', x, y, Z(2.0), 1.0);
      this.spawnSinglePickup('mana', x, y, Z(-3.2));
      enemyList.push({ type: 'gargoyle', x: X(-3.2), y, z: z });
      enemyList.push({ type: 'skeleton', x: X(3.2), y, z: z });
    } else {
      // PILLAR_SANCTUARY
      this.createColumn(X(-4.0), y, Z(-3.2), 0.6, colH);
      this.createColumn(X(4.0), y, Z(-3.2), 0.6, colH);
      this.createDecorProp('brazier', x, y, z, 1.0);
      this.createDecorProp('banner', x - wallDx, y, northBannerZ, 1.0, 0);
      this.spawnSinglePickup('health', X(3.2), y, Z(2.8));
      enemyList.push({ type: biome.enemyPool[0], x: X(-3.2), y, z: Z(1.5) });
      enemyList.push({ type: biome.enemyPool[1], x: X(3.2), y, z: Z(-1.5) });
    }

    // Larger rooms get extra corner pillars, braziers and a bigger garrison so they never feel empty
    const area = w * d;
    if (area >= 280) {
      const cx = w / 2 - 2.6;
      const cz = d / 2 - 2.6;
      this.createColumn(x - cx, y, z - cz, 0.6, colH);
      this.createColumn(x + cx, y, z - cz, 0.6, colH);
      this.createColumn(x - cx, y, z + cz, 0.6, colH);
      this.createColumn(x + cx, y, z + cz, 0.6, colH);
      enemyList.push({ type: biome.enemyPool[2] || biome.enemyPool[0], x: x - cx * 0.6, y, z: z + cz * 0.5 });
    }
    if (area >= 450) {
      this.createDecorProp('brazier', x - w / 2 + 2.4, y, z, 1.0);
      this.createDecorProp('brazier', x + w / 2 - 2.4, y, z, 1.0);
      this.spawnSinglePickup('mana', x + w / 2 - 4.5, y, z + 3.0);
      enemyList.push({ type: biome.enemyPool[1], x: x + (w / 2 - 5.0), y, z: z - d * 0.2 });
      enemyList.push({ type: biome.enemyPool[0], x: x - (w / 2 - 5.0), y, z: z - d * 0.2 });
    }
  }

  // ============================================================================
  // MULTI-ROOM GRAPH-BASED PROCEDURAL STAGE BUILDER (STAGES I, II, III, IV)
  // ============================================================================
  buildProceduralBiomeStage(stageId, seed) {
    const graph = this.dungeonGenerator.generateStageGraph(stageId, seed);
    const { biome, nodes, edges, chosenPlatformPattern } = graph;

    this.activeWallMat = this.wallMaterials[biome.wallTheme] || this.wallMaterials.stone;
    this.activeFloorMat = this.floorMaterials[biome.floorTheme] || this.floorMaterials.stone;

    this.scene.fog = new THREE.FogExp2(biome.fogColor, biome.fogDensity);

    const ambient = new THREE.AmbientLight(biome.ambientColor, 1.35);
    this.stageGroup.add(ambient);
    const hemi = new THREE.HemisphereLight(biome.hemiSky, biome.hemiGround, 1.0);
    this.stageGroup.add(hemi);
    const dirLight = new THREE.DirectionalLight(biome.dirColor, 2.1);
    dirLight.position.set(16, 28, 20);
    this.stageGroup.add(dirLight);

    if (biome.openSky) {
      this.addMoonAndStars();
    }

    const enemies = [];
    this.graphEdges = edges;

    // 1. Build Individual Enclosed Room Shells, Floors & Contents for All 8 Graph Nodes
    nodes.forEach((node) => {
      // Build the 4 walls + doorway archways + ceiling for this room node
      this.buildRoomShell(node, biome);
      this.createRoomLight(node.x, node.y + 5.6, node.z, node.lightColor, 5.2, 26);

      if (node.archetype === 'CHASM_PLATFORMING_HUB') {
        // Sunken Elemental Hazard Basin inside this enclosed Chasm Room
        const basinY = node.y - 2.2;
        this.createHazardBasin(node.x, basinY, node.z, node.w - 1.0, node.d - 1.0, biome.hazardType);
        this.createJumpPad(node.x, basinY, node.z, 13.5, biome.trimColor);

        // Stepping-stone layout is authored for a 20x20 room; scale positions to this colossal footprint
        const sx = node.w / 20;
        const sz = node.d / 20;
        const PX = (dx) => node.x + dx * sx;
        const PZ = (dz) => node.z + dz * sz;

        // Solid stone doorway landing balconies at every open doorway (deeper so they meet the scaled stones)
        if (node.doors.south) {
          this.createPlatformBlock(node.x, node.y, node.z + node.d / 2 - 3.0, 7.2, 6.0, 3.5);
          this.createJumpPad(node.x - 2.4, node.y, node.z + node.d / 2 - 3.0, 11.8, biome.trimColor);
        }
        if (node.doors.north) {
          this.createPlatformBlock(node.x, node.y, node.z - node.d / 2 + 3.0, 7.2, 6.0, 3.5);
        }
        if (node.doors.west) {
          this.createPlatformBlock(node.x - node.w / 2 + 3.0, node.y, node.z, 6.0, 7.2, 3.5);
        }
        if (node.doors.east) {
          this.createPlatformBlock(node.x + node.w / 2 - 3.0, node.y, node.z, 6.0, 7.2, 3.5);
        }

        // Procedurally Selected 3D Stepping-Stone Platforms bridging the Chasm Room
        if (chosenPlatformPattern === 'DIAMOND_ASCENT') {
          this.createJumpPlatform(node.x, node.y + 0.3, PZ(4.4), 3.8, 3.4, 0.75, biome.trimColor);
          this.createJumpPlatform(PX(-4.4), node.y + 0.6, node.z, 3.6, 3.6, 0.75, 0x00eeff);
          this.createJumpPlatform(PX(4.4), node.y + 0.6, node.z, 3.6, 3.6, 0.75, 0x00eeff);
          this.createJumpPlatform(node.x, node.y + 0.9, node.z, 4.0, 3.8, 0.75, 0xffdd44);
          this.createJumpPlatform(node.x, node.y + 0.4, PZ(-4.4), 3.8, 3.4, 0.75, biome.trimColor);
          this.spawnSinglePickup('mana', node.x, node.y + 0.9, node.z);
        } else if (chosenPlatformPattern === 'ZIGZAG_GAUNTLET') {
          this.createJumpPlatform(PX(-3.2), node.y + 0.3, PZ(4.5), 3.6, 3.4, 0.75, biome.trimColor);
          this.createJumpPlatform(PX(3.2), node.y + 0.6, PZ(1.5), 3.6, 3.4, 0.75, 0x00eeff);
          this.createJumpPlatform(PX(-3.2), node.y + 0.8, PZ(-1.5), 3.8, 3.5, 0.75, 0xffdd44);
          this.createJumpPlatform(PX(3.2), node.y + 0.4, PZ(-4.5), 3.6, 3.4, 0.75, 0x00eeff);
          this.spawnSinglePickup('health', PX(-3.2), node.y + 0.8, PZ(-1.5));
        } else if (chosenPlatformPattern === 'TWIN_SPIRAL_STONES') {
          [-4.2, 4.2].forEach((px) => {
            this.createJumpPlatform(PX(px), node.y + 0.35, PZ(4.2), 3.4, 3.2, 0.75, biome.trimColor);
            this.createJumpPlatform(PX(px), node.y + 0.65, node.z, 3.4, 3.2, 0.75, 0x00eeff);
            this.createJumpPlatform(PX(px), node.y + 0.35, PZ(-4.2), 3.4, 3.2, 0.75, 0xffdd44);
          });
          this.createJumpPlatform(node.x, node.y + 0.85, node.z, 4.2, 4.0, 0.75, 0x44ff88);
          this.spawnSinglePickup('mana', node.x, node.y + 0.85, node.z);
        } else {
          // OBELISK_LEAP
          this.createJumpPlatform(node.x, node.y + 0.35, PZ(4.4), 4.2, 3.4, 0.75, biome.trimColor);
          this.createJumpPlatform(node.x, node.y + 0.95, node.z, 4.4, 4.0, 0.75, 0xffdd44);
          this.createJumpPlatform(PX(-4.6), node.y + 0.5, node.z, 3.4, 3.6, 0.75, 0x00eeff);
          this.createJumpPlatform(PX(4.6), node.y + 0.5, node.z, 3.4, 3.6, 0.75, 0x00eeff);
          this.createJumpPlatform(node.x, node.y + 0.35, PZ(-4.4), 4.2, 3.4, 0.75, biome.trimColor);
          this.spawnSinglePickup('health', node.x, node.y + 0.95, node.z);
        }
      } else {
        // Solid Room Node Platform Floor
        this.createPlatformBlock(node.x, node.y, node.z, node.w, node.d, Math.max(3.0, node.y + 3.0));
      }

      // Populate Room Contents according to Archetype
      if (node.id === 'entry_hall') {
        this.createColumn(node.x - 5.5, node.y, node.z - 3.5, 0.65, 9.5);
        this.createColumn(node.x + 5.5, node.y, node.z - 3.5, 0.65, 9.5);
        this.createDecorProp('brazier', node.x - 3.8, node.y, node.z - 4.2, 1.0);
        this.createDecorProp('brazier', node.x + 3.8, node.y, node.z - 4.2, 1.0);
        this.createDecorProp('banner', node.x - 6.0, node.y, node.z - node.d / 2 + 0.62, 1.0, 0);
        this.createDecorProp('banner', node.x + 6.0, node.y, node.z - node.d / 2 + 0.62, 1.0, 0);
        this.createFacetedCrystal(node.x - 5.8, node.y, node.z + 2.0, biome.trimColor);
        this.createFacetedCrystal(node.x + 5.8, node.y, node.z + 2.0, 0x00eeff);
        this.spawnSinglePickup('health', node.x - 6.5, node.y, node.z + 5.5);
        this.spawnSinglePickup('mana', node.x + 6.5, node.y, node.z + 5.5);
        enemies.push({ type: biome.enemyPool[0], x: node.x - 4.2, y: node.y, z: node.z - 2.0 });
        enemies.push({ type: biome.enemyPool[1], x: node.x + 4.2, y: node.y, z: node.z - 2.0 });
      } else if (node.id === 'north_sanctum') {
        this.createColumn(node.x - 6.2, node.y, node.z - 2.0, 0.65, 9.5);
        this.createColumn(node.x + 6.2, node.y, node.z - 2.0, 0.65, 9.5);
        this.createDecorProp('skull_altar', node.x - 5.6, node.y, node.z - 4.5, 1.0);
        this.createDecorProp('bookshelf', node.x + 6.0, node.y, node.z - node.d / 2 + 0.88, 1.0, 0);
        // Stage Elder Grimoire on glowing golden altar pedestal!
        this.spawnSinglePickup('grimoire', node.x, node.y, node.z + 2.0);
        this.createStagePortal(
          node.x,
          node.y,
          node.z - 6.8,
          biome.portalTarget,
          biome.portalTitle,
          biome.portalSubtitle,
          biome.portalColor
        );
        enemies.push({ type: 'dread_knight', x: node.x - 3.8, y: node.y, z: node.z - 1.5 });
        enemies.push({ type: 'dread_knight', x: node.x + 3.8, y: node.y, z: node.z - 1.5 });
        enemies.push({ type: biome.enemyPool[2], x: node.x, y: node.y, z: node.z + 4.5 });
      } else if (node.archetype !== 'CHASM_PLATFORMING_HUB') {
        this.populateRoomArchetype(node, biome, enemies);
      }

      this.minimapRooms.push({
        x: node.x - node.w / 2,
        z: node.z - node.d / 2,
        rw: node.w,
        rd: node.d,
        id: node.id,
        archetype: node.archetype,
        cx: node.x,
        cz: node.z
      });
    });

    // 2. Build Enclosed 3D Stone Corridors / Staircases for All Graph Edges
    edges.forEach((edge) => {
      this.buildGraphEdgeCorridor(edge, biome);
    });

    return {
      name: `${biome.name} [SEED ${seed % 1000}]`,
      elevation: biome.elevationLabel,
      spawn: { x: 0, y: 0.0, z: 25.0, yaw: 0, pitch: 0 },
      enemies
    };
  }

  // ============================================================================
  // SCENE 0: OVERWORLD HUB — "THE CASTLE ASCENT" (5 Terraces + Sky-Stone Platforming)
  // ============================================================================
  buildOverworldAscent() {
    this.activeWallMat = this.wallMaterials.stone;
    this.activeFloorMat = this.floorMaterials.stone;
    this.scene.fog = new THREE.FogExp2(0x090d1a, 0.011);

    const ambient = new THREE.AmbientLight(0x445888, 1.35);
    this.stageGroup.add(ambient);
    const hemi = new THREE.HemisphereLight(0x99bbff, 0x2a2430, 1.15);
    this.stageGroup.add(hemi);
    const dirLight = new THREE.DirectionalLight(0xddeeff, 2.2);
    dirLight.position.set(18, 42, 28);
    this.stageGroup.add(dirLight);

    this.addMoonAndStars();

    this.createPlatformBlock(0, 0.0, 21, 20, 14, 4.0);
    this.createStaircaseZ(0, 14, 6, 0.0, 4.0, 7.0, 14);
    this.createPlatformBlock(0, 4.0, 1, 22, 10, 6.0);
    this.createStaircaseZ(0, -4, -12, 4.0, 8.5, 7.0, 14);
    this.createPlatformBlock(0, 8.5, -17, 22, 10, 10.0);
    this.createStaircaseZ(0, -22, -30, 8.5, 13.0, 7.0, 14);
    this.createPlatformBlock(0, 13.0, -35, 22, 10, 14.0);

    this.createStaircaseZ(-5.0, -40, -50, 13.0, 17.5, 3.8, 14);
    this.createJumpPad(5.0, 13.0, -38.0, 12.5, 0x00ffcc);
    this.createJumpPlatform(4.5, 14.5, -42.5, 3.4, 3.4, 0.7, 0x00eeff);
    this.createJumpPlatform(4.5, 16.0, -46.5, 3.4, 3.4, 0.7, 0x44ff88);
    this.createJumpPlatform(4.5, 17.5, -50.5, 3.4, 3.4, 0.7, 0xffaa00);

    this.createPlatformBlock(0, 17.5, -55, 22, 10, 18.0);
    this.createStaircaseZ(0, -60, -68, 17.5, 22.0, 7.0, 14);
    this.createPlatformBlock(0, 22.0, -74, 22, 12, 22.0);

    this.createJumpPlatform(-7.5, 5.4, 3.5, 3.2, 3.2, 0.7, 0x00eeff);
    this.createJumpPlatform(7.5, 9.9, -14.5, 3.2, 3.2, 0.7, 0xff8800);

    // Decorative Braziers & Banners along the Castle Ascent
    this.createDecorProp('brazier', -4.5, 0.0, 16.5, 1.0);
    this.createDecorProp('brazier', 4.5, 0.0, 16.5, 1.0);
    this.createDecorProp('banner', -10.58, 4.0, 1.0, 1.0, Math.PI / 2);
    this.createDecorProp('banner', 10.58, 8.5, -17.0, 1.0, -Math.PI / 2);
    this.createDecorProp('skull_altar', 0.0, 17.5, -55.0, 1.0);

    this.createWall(-10.5, 0, 21, 1, 14, 2.5);
    this.createWall(10.5, 0, 21, 1, 14, 2.5);
    this.createWall(0, 0, 28, 21, 1, 4.5);

    this.createWall(-11.2, 4.0, 1, 1, 10, 4.5);
    this.createWall(11.2, 4.0, 1, 1, 10, 3.5);
    this.createWall(-11.2, 8.5, -17, 1, 10, 3.5);
    this.createWall(11.2, 8.5, -17, 1, 10, 4.5);
    this.createWall(-11.2, 13.0, -35, 1, 10, 4.5);
    this.createWall(11.2, 13.0, -35, 1, 10, 3.5);
    this.createWall(-11.2, 17.5, -55, 1, 10, 3.5);
    this.createWall(11.2, 17.5, -55, 1, 10, 4.5);
    this.createWall(-11.2, 22.0, -74, 1, 12, 5.0);
    this.createWall(11.2, 22.0, -74, 1, 12, 5.0);
    this.createWall(0, 22.0, -80, 22, 1, 18.0);

    this.createColumn(-13, 0, 4, 2.8, 26);
    this.createColumn(13, 0, 4, 2.8, 26);
    this.createColumn(-14, 6, -17, 3.0, 30);
    this.createColumn(14, 6, -17, 3.0, 30);
    this.createColumn(-14, 12, -45, 3.2, 34);
    this.createColumn(14, 12, -45, 3.2, 34);
    this.createColumn(-12, 18, -76, 3.5, 38);
    this.createColumn(12, 18, -76, 3.5, 38);

    const glass1 = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 7.5), this.stainedGlassMaterial);
    glass1.position.set(0, 31.0, -79.2);
    this.stageGroup.add(glass1);

    [
      { y: 7.5, z: 10 },
      { y: 12.2, z: -8 },
      { y: 16.8, z: -26 },
      { y: 25.5, z: -64 }
    ].forEach((a) => {
      const arch = new THREE.Mesh(new THREE.BoxGeometry(10.5, 1.5, 1.5), this.activeWallMat);
      arch.position.set(0, a.y, a.z);
      this.stageGroup.add(arch);
    });

    this.createStagePortal(-6.8, 4.0, 1.0, 'stage1', 'STAGE I: SUNKEN UNDERCROFT', 'Lower Keep (100m) [Walk In or Press E]', 0x44aaff);
    this.createStagePortal(6.8, 8.5, -17.0, 'stage2', 'STAGE II: THE MOLTEN FORGE', 'Deep Foundry (250m) [Walk In or Press E]', 0xff5522);
    this.createStagePortal(-6.8, 13.0, -35.0, 'stage3', 'STAGE III: ALCHEMICAL SANCTUM', 'Mid-Tower (450m) [Walk In or Press E]', 0x33ff88);
    this.createStagePortal(6.8, 17.5, -55.0, 'stage4', 'STAGE IV: GLACIAL AQUEDUCT', 'Upper Keep (700m) [Walk In or Press E]', 0x00ddff);
    this.createStagePortal(0.0, 22.0, -77.5, 'stage5', 'STAGE V: ASTRAL SPIRE BOSS', 'Castle Pinnacle (1000m) [Walk In or Press E]', 0xdd44ff);

    this.createRoomLight(0, 4.5, 18, 0xff9944, 4.5, 28);
    this.createRoomLight(0, 9.5, -4, 0x55aaff, 4.8, 28);
    this.createRoomLight(0, 15.0, -28, 0xff6622, 4.8, 28);
    this.createRoomLight(0, 22.0, -58, 0x44eeff, 5.2, 32);

    [
      { x: -3.5, y: 2.2, z: 14 },
      { x: 3.5, y: 2.2, z: 14 },
      { x: -3.5, y: 6.2, z: 6 },
      { x: 3.5, y: 6.2, z: 6 },
      { x: -3.5, y: 10.5, z: -12 },
      { x: 3.5, y: 10.5, z: -12 },
      { x: -3.5, y: 15.0, z: -30 },
      { x: 3.5, y: 15.0, z: -30 },
      { x: -3.5, y: 19.5, z: -50 },
      { x: 3.5, y: 19.5, z: -50 },
      { x: -3.5, y: 24.0, z: -68 },
      { x: 3.5, y: 24.0, z: -68 }
    ].forEach((t) => this.createTorchSprite(t.x, t.y, t.z));

    this.createFacetedCrystal(-3.8, 0.0, 15.5, 0x00ddff);
    this.createFacetedCrystal(3.8, 0.0, 15.5, 0x44ff88);
    this.createFacetedCrystal(0.0, 13.0, -35.0, 0xffaa22);

    this.spawnSinglePickup('health', -7.5, 5.4, 3.5);
    this.spawnSinglePickup('mana', 7.5, 9.9, -14.5);
    this.spawnSinglePickup('health', 4.5, 16.0, -46.5);
    this.spawnSinglePickup('mana', -5.5, 17.5, -55.0);

    this.minimapRooms = [
      { x: -10, z: 14, rw: 20, rd: 14 },
      { x: -11, z: -4, rw: 22, rd: 10 },
      { x: -11, z: -22, rw: 22, rd: 10 },
      { x: -11, z: -40, rw: 22, rd: 10 },
      { x: -11, z: -60, rw: 22, rd: 10 },
      { x: -11, z: -80, rw: 22, rd: 12 }
    ];

    return {
      name: 'OVERWORLD: THE CASTLE ASCENT',
      elevation: 'Exterior Ramparts (0m to 1000m)',
      spawn: { x: 0, y: 0.0, z: 21.5, yaw: 0, pitch: 0.12 },
      enemies: [
        { type: 'gargoyle', x: 3.5, y: 4.0, z: 1.5 },
        { type: 'fire_imp', x: -3.5, y: 8.5, z: -17.0 },
        { type: 'skeleton', x: 4.0, y: 13.0, z: -35.0 },
        { type: 'frost_wraith', x: -4.0, y: 17.5, z: -55.0 },
        { type: 'dread_knight', x: 0.0, y: 22.0, z: -71.0 }
      ]
    };
  }

  // ============================================================================
  // STAGE 5: ASTRAL SPIRE SANCTUM (1000m — Pinnacle Boss Citadel)
  // ============================================================================
  buildStage5HighSpire(seed = 100) {
    this.activeWallMat = this.wallMaterials.sanctum;
    this.activeFloorMat = this.floorMaterials.ice;
    this.scene.fog = new THREE.FogExp2(0x0c0618, 0.015);

    const ambient = new THREE.AmbientLight(0x443266, 1.35);
    this.stageGroup.add(ambient);
    const hemi = new THREE.HemisphereLight(0xaa77ff, 0x221433, 1.05);
    this.stageGroup.add(hemi);
    const dirLight = new THREE.DirectionalLight(0xeedbff, 2.2);
    dirLight.position.set(16, 35, 22);
    this.stageGroup.add(dirLight);

    this.addMoonAndStars();

    this.createPlatformBlock(0, 0.0, -5, 36, 46, 4.0);
    this.createStaircaseZ(0, -4, -10, 0.0, 2.0, 8.0, 10);
    this.createPlatformBlock(0, 2.0, -19, 20, 18, 4.0);

    this.createJumpPad(-12.5, 0.0, 6.0, 13.0, 0x00ffcc);
    this.createJumpPad(12.5, 0.0, 6.0, 13.0, 0x00ffcc);

    this.createJumpPlatform(-12.5, 1.4, 1.0, 3.8, 3.8, 0.7, 0x00eeff);
    this.createJumpPlatform(-12.5, 2.8, -5.0, 3.8, 3.8, 0.7, 0xaa55ff);
    this.createJumpPlatform(-12.5, 4.0, -11.5, 4.2, 4.2, 0.7, 0xffdd44);

    this.createJumpPlatform(12.5, 1.4, 1.0, 3.8, 3.8, 0.7, 0x00eeff);
    this.createJumpPlatform(12.5, 2.8, -5.0, 3.8, 3.8, 0.7, 0xaa55ff);
    this.createJumpPlatform(12.5, 4.0, -11.5, 4.2, 4.2, 0.7, 0xffdd44);

    // Decorative Braziers, Skull Altars & Banners in Boss Citadel
    this.createDecorProp('brazier', -6.5, 0.0, 6.5, 1.1);
    this.createDecorProp('brazier', 6.5, 0.0, 6.5, 1.1);
    this.createDecorProp('skull_altar', -7.5, 2.0, -16.0, 1.1);
    this.createDecorProp('skull_altar', 7.5, 2.0, -16.0, 1.1);
    this.createDecorProp('bookshelf', -17.12, 0.0, -2.0, 1.0, Math.PI / 2);
    this.createDecorProp('bookshelf', 17.12, 0.0, -2.0, 1.0, -Math.PI / 2);

    this.createWall(0, 0, 18, 36, 1, 6.5);
    this.createWall(-18, 0, -5, 1, 46, 6.5);
    this.createWall(18, 0, -5, 1, 46, 6.5);
    this.createWall(0, 0, -28, 36, 1, 11.0);

    [-9.5, 9.5].forEach((x) => {
      [8, 0, -8, -18].forEach((z) => this.createColumn(x, 0, z, 0.7, 9.5));
    });

    const glassNorth = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 7.0), this.stainedGlassMaterial);
    glassNorth.position.set(0, 5.8, -27.2);
    this.stageGroup.add(glassNorth);

    this.createStagePortal(-13.5, 0.0, 14.5, 'overworld_4', 'RETURN TO SPIRE SUMMIT', 'Castle Exterior (1000m) [Walk In or Press E]', 0x8844ff);

    this.createRoomLight(0, 5.5, 6, 0x9944ff, 4.8, 28);
    this.createRoomLight(-11, 6.0, -10, 0xffaa33, 4.6, 26);
    this.createRoomLight(11, 6.0, -10, 0xffaa33, 4.6, 26);
    this.createRoomLight(0, 7.0, -20, 0x44eeff, 5.8, 30);

    [
      { x: -8.8, y: 3.2, z: 8 },
      { x: 8.8, y: 3.2, z: 8 },
      { x: -8.8, y: 3.2, z: 0 },
      { x: 8.8, y: 3.2, z: 0 },
      { x: -8.8, y: 3.2, z: -8 },
      { x: 8.8, y: 3.2, z: -8 }
    ].forEach((t) => this.createTorchSprite(t.x, t.y, t.z));

    this.createFacetedCrystal(-5.5, 0, 4, 0x00eeff);
    this.createFacetedCrystal(5.5, 0, 4, 0x33ff88);
    this.createFacetedCrystal(-6.5, 2.0, -15, 0xaa55ff);
    this.createFacetedCrystal(6.5, 2.0, -15, 0x00eeff);

    this.spawnSinglePickup('health', -14, 0, 10);
    this.spawnSinglePickup('mana', 14, 0, 10);
    this.spawnSinglePickup('health', -12.5, 4.0, -11.5);
    this.spawnSinglePickup('mana', 12.5, 4.0, -11.5);
    this.spawnSinglePickup('health', -8, 2.0, -24);
    this.spawnSinglePickup('mana', 8, 2.0, -24);

    this.minimapRooms = [
      { x: -18, z: -28, rw: 36, rd: 46 },
      { x: -10, z: -28, rw: 20, rd: 18 }
    ];

    return {
      name: `STAGE V: ASTRAL SPIRE SANCTUM [SEED ${seed % 1000}]`,
      elevation: 'Castle Pinnacle (1000m)',
      spawn: { x: 0, y: 0.0, z: 12.0, yaw: 0, pitch: 0.05 },
      enemies: [
        { type: 'gargoyle', x: -5.5, y: 0.0, z: -2.0 },
        { type: 'gargoyle', x: 5.5, y: 0.0, z: -2.0 },
        { type: 'fire_imp', x: -12.5, y: 2.8, z: -5.0 },
        { type: 'fire_imp', x: 12.5, y: 2.8, z: -5.0 },
        { type: 'frost_wraith', x: -7.5, y: 2.0, z: -14.0 },
        { type: 'frost_wraith', x: 7.5, y: 2.0, z: -14.0 },
        { type: 'skeleton', x: -7.5, y: 2.0, z: -22.0 },
        { type: 'skeleton', x: 7.5, y: 2.0, z: -22.0 },
        { type: 'dread_knight', x: -3.8, y: 2.0, z: -16.5 },
        { type: 'dread_knight', x: 3.8, y: 2.0, z: -16.5 },
        { type: 'arcane_eye', x: 0.0, y: 2.2, z: -21.0 }
      ]
    };
  }

  // ============================================================================
  // UPDATE LOOP
  // ============================================================================
  update(delta, player) {
    const time = performance.now() * 0.001;

    if (this.portalCooldown > 0) {
      this.portalCooldown = Math.max(0, this.portalCooldown - delta);
    }

    for (let i = 0; i < this.torches.length; i++) {
      const t = this.torches[i];
      t.light.intensity = t.baseIntensity + Math.sin(time * 7.0 + t.flickerSeed) * 0.35;
    }

    for (let i = 0; i < this.torchSprites.length; i++) {
      this.torchSprites[i].lookAt(player.camera.position.x, this.torchSprites[i].position.y, player.camera.position.z);
    }

    for (let i = 0; i < this.animatedSprites.length; i++) {
      this.animatedSprites[i].update(delta, player.camera);
    }

    for (let i = 0; i < this.destructibles.length; i++) {
      const c = this.destructibles[i];
      if (c.destroyed) continue;
      c.mesh.rotation.y += delta * 1.1;
      c.mesh.position.y = c.baseY + Math.sin(time * 2.2 + c.seed) * 0.12;
    }

    for (let i = 0; i < this.jumpPads.length; i++) {
      const pad = this.jumpPads[i];
      pad.ringMesh.rotation.y += delta * 2.5;
      if (pad.cooldown > 0) pad.cooldown -= delta;

      const dx = player.position.x - pad.position.x;
      const dz = player.position.z - pad.position.z;
      const feetY = player.position.y - player.playerHeight;
      const dy = Math.abs(feetY - pad.position.y);

      if (pad.cooldown <= 0 && Math.hypot(dx, dz) < pad.radius && dy < 1.1) {
        pad.cooldown = 0.65;
        player.velocity.y = pad.boostVelocity;
        player.isGrounded = false;
        audioSynth.playAegisCast();
        if (this.telemetry) {
          this.telemetry.spawnFloatingText(
            player.position.clone().add(new THREE.Vector3(0, 0.5, 0)),
            'ARCANE JUMP PAD BOOST',
            '#00ffcc',
            1.15
          );
        }
      }
    }

    if (player.hazardCooldown <= 0) {
      const feetY = player.position.y - player.playerHeight;
      for (let i = 0; i < this.hazardZones.length; i++) {
        const hz = this.hazardZones[i];
        if (
          player.position.x >= hz.xMin &&
          player.position.x <= hz.xMax &&
          player.position.z >= hz.zMin &&
          player.position.z <= hz.zMax &&
          feetY <= hz.ySurface + 0.35
        ) {
          player.hazardCooldown = 1.1;
          player.takeDamage(hz.damage);
          if (this.telemetry) {
            this.telemetry.spawnFloatingText(
              player.position.clone(),
              `${hz.type.toUpperCase()} HAZARD — USE JUMP PAD`,
              '#ff5522',
              1.1
            );
          }
          break;
        }
      }
    }

    for (let i = 0; i < this.pickups.length; i++) {
      const p = this.pickups[i];
      if (p.collected) continue;

      p.mesh.position.y = p.baseY + Math.sin(time * 2.8 + p.bobSeed) * 0.14;
      p.mesh.lookAt(player.camera.position.x, p.mesh.position.y, player.camera.position.z);

      const dx = player.position.x - p.x;
      const dz = player.position.z - p.z;
      const dy = Math.abs(player.position.y - 0.9 - p.baseY);
      if (dx * dx + dz * dz < 2.1 && dy < 2.2) {
        if (p.type === 'health' && player.health < player.maxHealth) {
          p.collected = true;
          p.mesh.visible = false;
          player.heal(35);
          player.score += 100;
          player.gainXP(15);
        } else if (p.type === 'mana' && player.mana < player.maxMana) {
          p.collected = true;
          p.mesh.visible = false;
          player.restoreMana(45);
          player.score += 100;
          player.gainXP(15);
        } else if (p.type === 'grimoire') {
          p.collected = true;
          p.mesh.visible = false;
          if (p.ringMesh) p.ringMesh.visible = false;
          const unlockMsg = player.unlockNextSpell(this.currentStageId);
          player.score += 500;
          audioSynth.playGrimoirePickup();
          if (this.telemetry) {
            this.telemetry.registerHit(true, unlockMsg);
            this.telemetry.spawnFloatingText(
              new THREE.Vector3(p.x, p.baseY + 1.0, p.z),
              unlockMsg,
              '#ffd700',
              1.35
            );
          }
        }
      }
    }

    this.nearestPortal = null;
    let bestDist = 999;

    for (let i = 0; i < this.portals.length; i++) {
      const pt = this.portals[i];
      const dist = player.position.distanceTo(pt.position);
      if (dist < 3.6 && dist < bestDist) {
        bestDist = dist;
        this.nearestPortal = pt;
      }
      if (this.portalCooldown <= 0 && dist < 1.35 && this.onPortalEnter) {
        this.onPortalEnter(pt.targetStageId);
        break;
      }
    }
  }
}
