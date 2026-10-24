import * as THREE from 'three';
import { AnimatedBillboardSprite } from '../engine/SpriteAnimator.js';
import { ChromaKeyProcessor } from '../engine/ChromaKeyProcessor.js';
import { audioSynth } from '../engine/AudioSynthesizer.js';
import { ProceduralDungeonGenerator } from './ProceduralDungeonGenerator.js';

/**
 * CastleLevel V4:
 * - Biome-Specific Procedural Graph Layouts & Architectural Setpieces
 * - 100% Watertight Perimeter Walls, Doorway Foundations, Stepped Stair Balustrades & Stage Bounds
 * - Branching Overworld Side Paths & Loop Shortcuts (Catacomb Watchtower, Smelter's Crucible, Apothecary Cloister, Frostwind Campanile)
 * - Vaulted Ceiling Ribs, Corner Buttresses, Crenellated Battlements, Furnaces, Alchemical Vats, Sarcophagi, Ice Spires & Astral Orreries
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
    this.animatedMeshes = [];
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

  cloneTiledSet(pbrSet, rx = 1, ry = 1) {
    const cloneTex = (t, isColor = false) => {
      if (!t) return null;
      const c = t.clone();
      c.wrapS = THREE.RepeatWrapping;
      c.wrapT = THREE.RepeatWrapping;
      c.repeat.set(rx, ry);
      if (isColor) c.colorSpace = THREE.SRGBColorSpace;
      c.needsUpdate = true;
      return c;
    };
    return {
      albedo: cloneTex(pbrSet.albedo, true),
      normal: cloneTex(pbrSet.normal, false),
      roughness: cloneTex(pbrSet.roughness, false)
    };
  }

  /**
   * Creates a BoxGeometry with world-space scaled UVs on all 6 faces so textures never stretch or squash
   */
  createTiledBoxGeometry(width, height, depth, tileSize = 3.2) {
    const geo = new THREE.BoxGeometry(width, height, depth);
    const uvAttr = geo.attributes.uv;
    const normAttr = geo.attributes.normal;
    if (uvAttr && normAttr) {
      for (let i = 0; i < uvAttr.count; i++) {
        const nx = Math.abs(normAttr.getX(i));
        const ny = Math.abs(normAttr.getY(i));
        const u = uvAttr.getX(i);
        const v = uvAttr.getY(i);
        if (nx > 0.5) {
          uvAttr.setXY(i, u * (depth / tileSize), v * (height / tileSize));
        } else if (ny > 0.5) {
          uvAttr.setXY(i, u * (width / tileSize), v * (depth / tileSize));
        } else {
          uvAttr.setXY(i, u * (width / tileSize), v * (height / tileSize));
        }
      }
      uvAttr.needsUpdate = true;
    }
    return geo;
  }

  /**
   * Creates a CylinderGeometry with world-space scaled UVs around its circumference and height
   */
  createTiledCylinderGeometry(rTop, rBot, height, radialSegments = 12, tileSize = 3.2) {
    const geo = new THREE.CylinderGeometry(rTop, rBot, height, radialSegments);
    const uvAttr = geo.attributes.uv;
    const normAttr = geo.attributes.normal;
    const circum = 2 * Math.PI * ((rTop + rBot) * 0.5);
    const uRepeats = Math.max(1, Math.round(circum / tileSize));
    const vRepeats = Math.max(0.25, height / tileSize);
    if (uvAttr && normAttr) {
      for (let i = 0; i < uvAttr.count; i++) {
        const ny = Math.abs(normAttr.getY(i));
        const u = uvAttr.getX(i);
        const v = uvAttr.getY(i);
        if (ny < 0.5) {
          uvAttr.setXY(i, u * uRepeats, v * vRepeats);
        } else {
          const capScale = (Math.max(rTop, rBot) * 2) / tileSize;
          uvAttr.setXY(i, u * capScale, v * capScale);
        }
      }
      uvAttr.needsUpdate = true;
    }
    return geo;
  }

  /**
   * Creates a PlaneGeometry with world-space scaled UVs
   */
  createTiledPlaneGeometry(width, height, tileSize = 3.2) {
    const geo = new THREE.PlaneGeometry(width, height);
    const uvAttr = geo.attributes.uv;
    if (uvAttr) {
      for (let i = 0; i < uvAttr.count; i++) {
        uvAttr.setXY(i, uvAttr.getX(i) * (width / tileSize), uvAttr.getY(i) * (height / tileSize));
      }
      uvAttr.needsUpdate = true;
    }
    return geo;
  }

  getPlatformMaterials() {
    const wMat = this.activeWallMat;
    const fMat = this.activeFloorMat;
    return [wMat, wMat, fMat, wMat, wMat, wMat];
  }

  initSharedMaterials() {
    const stoneWallSet = this.cloneTiledSet(this.pbrTextures.wall, 1, 1);
    const lavaWallSet = this.cloneTiledSet(this.pbrTextures.lavaWall || this.pbrTextures.wall, 1, 1);
    const iceWallSet = this.cloneTiledSet(this.pbrTextures.iceWall || this.pbrTextures.wall, 1, 1);
    const sanctumWallSet = this.cloneTiledSet(this.pbrTextures.sanctumWall || this.pbrTextures.wall, 1, 1);

    const stoneFloorSet = this.cloneTiledSet(this.pbrTextures.floor, 1, 1);
    const lavaFloorSet = this.cloneTiledSet(this.pbrTextures.lavaWall || this.pbrTextures.floor, 1, 1);
    const iceFloorSet = this.cloneTiledSet(this.pbrTextures.iceWall || this.pbrTextures.floor, 1, 1);
    const sanctumFloorSet = this.cloneTiledSet(this.pbrTextures.sanctumWall || this.pbrTextures.floor, 1, 1);

    // 5 Distinct Biome Wall Materials (using 1:1 repeat with world-space geometry UVs)
    this.wallMaterials = {
      stone: new THREE.MeshStandardMaterial({
        map: stoneWallSet.albedo,
        normalMap: stoneWallSet.normal,
        roughnessMap: stoneWallSet.roughness,
        color: 0xb8c4d8,
        roughness: 0.8,
        metalness: 0.1
      }),
      lava: new THREE.MeshStandardMaterial({
        map: lavaWallSet.albedo,
        normalMap: lavaWallSet.normal,
        roughnessMap: lavaWallSet.roughness,
        color: 0xffaa88,
        roughness: 0.72,
        metalness: 0.18,
        emissive: 0x441000,
        emissiveIntensity: 0.42
      }),
      ice: new THREE.MeshStandardMaterial({
        map: iceWallSet.albedo,
        normalMap: iceWallSet.normal,
        roughnessMap: iceWallSet.roughness,
        color: 0xc8f0ff,
        roughness: 0.32,
        metalness: 0.32,
        emissive: 0x002444,
        emissiveIntensity: 0.35
      }),
      sanctum: new THREE.MeshStandardMaterial({
        map: sanctumWallSet.albedo,
        normalMap: sanctumWallSet.normal,
        roughnessMap: sanctumWallSet.roughness,
        color: 0xa8f0cc,
        roughness: 0.58,
        metalness: 0.25,
        emissive: 0x062618,
        emissiveIntensity: 0.32
      }),
      astral: new THREE.MeshStandardMaterial({
        map: sanctumWallSet.albedo,
        normalMap: sanctumWallSet.normal,
        roughnessMap: sanctumWallSet.roughness,
        color: 0xd4b8ff,
        roughness: 0.52,
        metalness: 0.3,
        emissive: 0x1a0836,
        emissiveIntensity: 0.38
      })
    };

    // 5 Distinct Biome Floor Materials
    this.floorMaterials = {
      stone: new THREE.MeshStandardMaterial({
        map: stoneFloorSet.albedo,
        normalMap: stoneFloorSet.normal,
        roughnessMap: stoneFloorSet.roughness,
        color: 0x99aacc,
        roughness: 0.72,
        metalness: 0.14
      }),
      lava: new THREE.MeshStandardMaterial({
        map: lavaFloorSet.albedo,
        normalMap: lavaFloorSet.normal,
        roughnessMap: lavaFloorSet.roughness,
        color: 0x996655,
        roughness: 0.76,
        metalness: 0.22,
        emissive: 0x260800,
        emissiveIntensity: 0.25
      }),
      ice: new THREE.MeshStandardMaterial({
        map: iceFloorSet.albedo,
        normalMap: iceFloorSet.normal,
        roughnessMap: iceFloorSet.roughness,
        color: 0x99e8ff,
        roughness: 0.24,
        metalness: 0.38,
        emissive: 0x001833,
        emissiveIntensity: 0.22
      }),
      sanctum: new THREE.MeshStandardMaterial({
        map: sanctumFloorSet.albedo,
        normalMap: sanctumFloorSet.normal,
        roughnessMap: sanctumFloorSet.roughness,
        color: 0x88ddaa,
        roughness: 0.55,
        metalness: 0.24,
        emissive: 0x041a10,
        emissiveIntensity: 0.2
      }),
      astral: new THREE.MeshStandardMaterial({
        map: iceFloorSet.albedo,
        normalMap: iceFloorSet.normal,
        roughnessMap: iceFloorSet.roughness,
        color: 0xbbaaff,
        roughness: 0.36,
        metalness: 0.35,
        emissive: 0x120628,
        emissiveIntensity: 0.28
      })
    };

    // Biome-Specific Ceiling Materials
    this.ceilMaterials = {
      stone: new THREE.MeshStandardMaterial({
        map: stoneWallSet.albedo,
        normalMap: stoneWallSet.normal,
        roughness: 0.85,
        metalness: 0.1,
        color: 0x485468,
        side: THREE.DoubleSide
      }),
      lava: new THREE.MeshStandardMaterial({
        map: lavaWallSet.albedo,
        normalMap: lavaWallSet.normal,
        roughness: 0.78,
        metalness: 0.2,
        color: 0x552218,
        emissive: 0x220600,
        emissiveIntensity: 0.3,
        side: THREE.DoubleSide
      }),
      sanctum: new THREE.MeshStandardMaterial({
        map: sanctumWallSet.albedo,
        normalMap: sanctumWallSet.normal,
        roughness: 0.65,
        metalness: 0.24,
        color: 0x2c5c48,
        emissive: 0x041a10,
        emissiveIntensity: 0.25,
        side: THREE.DoubleSide
      }),
      ice: new THREE.MeshStandardMaterial({
        map: iceWallSet.albedo,
        normalMap: iceWallSet.normal,
        roughness: 0.38,
        metalness: 0.3,
        color: 0x5588aa,
        side: THREE.DoubleSide
      })
    };

    this.activeWallMat = this.wallMaterials.stone;
    this.activeFloorMat = this.floorMaterials.stone;
    this.ceilMaterial = this.ceilMaterials.stone;
    this.pillarMaterial = this.wallMaterials.stone;

    this.stainedGlassMaterial = new THREE.MeshBasicMaterial({
      map: this.pbrTextures.stainedGlass.albedo,
      side: THREE.DoubleSide
    });

    this.darkIronMat = new THREE.MeshStandardMaterial({
      color: 0x242832,
      roughness: 0.42,
      metalness: 0.78
    });

    this.gildedGoldMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      emissive: 0x443008,
      emissiveIntensity: 0.25,
      roughness: 0.32,
      metalness: 0.82
    });

    // Shared Torch Sconce Material & 8-Frame Animated Flame Materials (Frame 3 of normalized pickups_and_props)
    this.sharedTorchTex = this.spriteTextures.props.clone();
    this.sharedTorchTex.needsUpdate = true;
    this.sharedTorchTex.wrapS = THREE.ClampToEdgeWrapping;
    this.sharedTorchTex.wrapT = THREE.ClampToEdgeWrapping;
    this.sharedTorchTex.repeat.set(0.96 / 4, 0.96);
    this.sharedTorchTex.offset.set((3 + 0.02) / 4, 0.02);

    this.sharedTorchMat = new THREE.MeshBasicMaterial({
      map: this.sharedTorchTex,
      transparent: true,
      alphaTest: 0.08,
      side: THREE.DoubleSide
    });
    this.sharedTorchGeo = new THREE.PlaneGeometry(0.95, 0.95);

    this.torchAnimMaterials = ChromaKeyProcessor.createAnimatedFireMaterials(
      this.spriteTextures.props,
      3,
      4,
      'torch'
    );
    this.brazierAnimMaterials = ChromaKeyProcessor.createAnimatedFireMaterials(
      this.spriteTextures.decor || this.spriteTextures.props,
      0,
      4,
      'brazier'
    );

    // Pre-create 4 Decorative Dungeon Prop Materials from dungeon_decor_props.jpg
    // 0: Brazier, 1: Bookshelf, 2: Skull Altar, 3: Hanging Banner
    // Inset UVs slightly inside each cell so neighboring cells can never bleed across boundaries
    this.decorMaterials = [0, 1, 2, 3].map((frameIdx) => {
      const baseTex = this.spriteTextures.decor || this.spriteTextures.props;
      const tex = baseTex.clone();
      tex.needsUpdate = true;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.repeat.set(0.96 / 4, 0.96);
      tex.offset.set((frameIdx + 0.02) / 4, 0.02);
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
    this.animatedMeshes = [];
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

  /**
   * Returns true if (x, z) lies inside at least one walkable base floor or staircase heightZone.
   * Prevents the player or enemies from ever stepping into the void outside the castle.
   */
  isWithinStageBounds(x, z, inset = 0.0) {
    for (let i = 0; i < this.heightZones.length; i++) {
      const hz = this.heightZones[i];
      if (hz.isJumpPlatform) continue;
      if (
        x >= hz.xMin + inset &&
        x <= hz.xMax - inset &&
        z >= hz.zMin + inset &&
        z <= hz.zMax - inset
      ) {
        return true;
      }
    }
    return false;
  }

  getFloorHeight(x, z, currentFeetY = 999) {
    let bestH = -999;
    let fallbackBaseH = -999;

    for (let i = 0; i < this.heightZones.length; i++) {
      const hz = this.heightZones[i];
      if (x >= hz.xMin && x <= hz.xMax && z >= hz.zMin && z <= hz.zMax) {
        if (hz.type === 'flat') {
          if (hz.isJumpPlatform) {
            if (currentFeetY >= hz.y - 0.42 && hz.y > bestH) {
              bestH = hz.y;
            }
          } else {
            if (currentFeetY >= hz.y - 0.42 && hz.y > bestH) {
              bestH = hz.y;
            }
            if (fallbackBaseH === -999 || hz.y < fallbackBaseH) {
              fallbackBaseH = hz.y;
            }
          }
        } else if (hz.type === 'rampZ') {
          const t = THREE.MathUtils.clamp((z - hz.zStart) / (hz.zEnd - hz.zStart), 0, 1);
          const y = THREE.MathUtils.lerp(hz.yStart, hz.yEnd, t);
          if (currentFeetY >= y - 1.35 && y > bestH) {
            bestH = y;
          }
          if (fallbackBaseH === -999 || y < fallbackBaseH) {
            fallbackBaseH = y;
          }
        } else if (hz.type === 'rampX') {
          const t = THREE.MathUtils.clamp((x - hz.xStart) / (hz.xEnd - hz.xStart), 0, 1);
          const y = THREE.MathUtils.lerp(hz.yStart, hz.yEnd, t);
          if (currentFeetY >= y - 1.35 && y > bestH) {
            bestH = y;
          }
          if (fallbackBaseH === -999 || y < fallbackBaseH) {
            fallbackBaseH = y;
          }
        }
      }
    }

    if (bestH > -900) return bestH;
    return fallbackBaseH > -900 ? fallbackBaseH : 0;
  }

  // --- HELPER BUILDERS ---

  createWall(
    x,
    yBottom,
    z,
    width,
    depth,
    height = 6.5,
    isCollider = true,
    extraTopCollider = 12.0,
    matOverride = null,
    extraBottomCollider = 4.0
  ) {
    const geo = this.createTiledBoxGeometry(width, height, depth, 3.4);
    const mesh = new THREE.Mesh(geo, matOverride || this.activeWallMat);
    mesh.position.set(x, yBottom + height / 2, z);

    if (isCollider) {
      mesh.geometry.computeBoundingBox();
      mesh.boundingBox = new THREE.Box3().setFromObject(mesh);
      // Extend collider downward into foundation (unless overhead lintel) and upward so player can never jump/dash over perimeter walls
      mesh.boundingBox.min.y -= extraBottomCollider;
      mesh.boundingBox.max.y += extraTopCollider;
      this.walls.push(mesh);
    }

    this.stageGroup.add(mesh);
    return mesh;
  }

  /**
   * Builds a solid perimeter parapet wall topped with 3D crenellated castle battlements (merlons)
   */
  createCrenellatedWall(x, yBottom, z, width, depth, wallH = 3.8, merlonH = 0.85) {
    const baseWall = this.createWall(x, yBottom - 2.0, z, width, depth, wallH + 2.0, true, 14.0);

    // Coping stone ledge along the top of the wall
    const copingGeo = this.createTiledBoxGeometry(width + 0.16, 0.22, depth + 0.16, 3.0);
    const copingMesh = new THREE.Mesh(copingGeo, this.pillarMaterial || this.activeWallMat);
    copingMesh.position.set(x, yBottom + wallH + 0.08, z);
    this.stageGroup.add(copingMesh);

    // Add merlons along whichever axis is longer
    if (width >= depth * 1.5 && width >= 3.0) {
      const count = Math.max(2, Math.floor(width / 2.4));
      const step = width / count;
      const mW = Math.min(1.25, step * 0.56);
      for (let i = 0; i < count; i++) {
        const mx = x - width / 2 + (i + 0.5) * step;
        const mGeo = this.createTiledBoxGeometry(mW, merlonH, depth + 0.08, 2.8);
        const mMesh = new THREE.Mesh(mGeo, this.activeWallMat);
        mMesh.position.set(mx, yBottom + wallH + 0.18 + merlonH / 2, z);
        this.stageGroup.add(mMesh);
      }
    } else if (depth > width * 1.5 && depth >= 3.0) {
      const count = Math.max(2, Math.floor(depth / 2.4));
      const step = depth / count;
      const mD = Math.min(1.25, step * 0.56);
      for (let i = 0; i < count; i++) {
        const mz = z - depth / 2 + (i + 0.5) * step;
        const mGeo = this.createTiledBoxGeometry(width + 0.08, merlonH, mD, 2.8);
        const mMesh = new THREE.Mesh(mGeo, this.activeWallMat);
        mMesh.position.set(x, yBottom + wallH + 0.18 + merlonH / 2, mz);
        this.stageGroup.add(mMesh);
      }
    }

    return baseWall;
  }

  createInvisibleColliderBox(x, yBottom, z, width, height, depth) {
    const collider = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth));
    collider.position.set(x, yBottom + height / 2, z);
    collider.updateMatrixWorld(true);
    collider.geometry.computeBoundingBox();
    collider.boundingBox = new THREE.Box3().setFromObject(collider);
    this.walls.push(collider);
    return collider;
  }

  createPlatformBlock(x, yTop, z, width, depth, thickness = 2.0, addSideCollider = false) {
    const geo = this.createTiledBoxGeometry(width, thickness, depth, 3.2);
    const mesh = new THREE.Mesh(geo, this.getPlatformMaterials());
    mesh.position.set(x, yTop - thickness / 2, z);
    this.stageGroup.add(mesh);

    if (addSideCollider && thickness > 0.35) {
      // Solid under-ledge collider up to yTop - 0.14 so players at lower elevations cannot walk through interior raised platform sides
      this.createInvisibleColliderBox(x, yTop - thickness, z, width, Math.max(0.2, thickness - 0.14), depth);
    }

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
    const geo = this.createTiledBoxGeometry(width, thickness, depth, 3.0);
    const mesh = new THREE.Mesh(geo, this.getPlatformMaterials());
    mesh.position.set(x, yTop - thickness / 2, z);
    this.stageGroup.add(mesh);

    // 4 non-overlapping outer perimeter trim strips placed below yTop so there is zero Z-fighting on the top surface
    const trimMat = new THREE.MeshBasicMaterial({ color: trimColor });
    const trimH = 0.10;
    const trimT = 0.06;
    const trimY = yTop - 0.12;

    const trimN = new THREE.Mesh(new THREE.BoxGeometry(width + trimT * 2, trimH, trimT), trimMat);
    trimN.position.set(x, trimY, z - depth / 2 - trimT / 2);
    const trimS = new THREE.Mesh(new THREE.BoxGeometry(width + trimT * 2, trimH, trimT), trimMat);
    trimS.position.set(x, trimY, z + depth / 2 + trimT / 2);
    const trimW = new THREE.Mesh(new THREE.BoxGeometry(trimT, trimH, depth), trimMat);
    trimW.position.set(x - width / 2 - trimT / 2, trimY, z);
    const trimE = new THREE.Mesh(new THREE.BoxGeometry(trimT, trimH, depth), trimMat);
    trimE.position.set(x + width / 2 + trimT / 2, trimY, z);
    this.stageGroup.add(trimN, trimS, trimW, trimE);

    const pillarH = Math.max(0.5, yTop + 3.0);
    const rTop = Math.min(width, depth) * 0.22;
    const rBot = Math.min(width, depth) * 0.32;
    const pillarGeo = this.createTiledCylinderGeometry(rTop, rBot, pillarH, 10, 3.0);
    const pillarMesh = new THREE.Mesh(pillarGeo, this.activeWallMat);
    pillarMesh.position.set(x, yTop - thickness - pillarH / 2, z);
    this.stageGroup.add(pillarMesh);

    // Solid side-wall collider for the platform slab (up to yTop - 0.14) and support pillar underneath
    this.createInvisibleColliderBox(x, yTop - thickness, z, width, Math.max(0.2, thickness - 0.14), depth);
    this.createInvisibleColliderBox(x, yTop - thickness - pillarH, z, rBot * 1.65, pillarH, rBot * 1.65);

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
    const baseMesh = new THREE.Mesh(baseGeo, this.darkIronMat);
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
      radius: 1.28,
      cooldown: 0
    });
  }

  createHazardBasin(x, ySurface, z, width, depth, type = 'lava') {
    const colors = {
      lava: 0xff3800,
      acid: 0x18dd48,
      frost: 0x0099ff,
      void: 0x4b1299
    };
    const col = colors[type] || 0xff3800;

    // Solid dark sub-basin floor below the liquid surface
    const subGeo = this.createTiledBoxGeometry(width, 1.2, depth, 3.4);
    const subMesh = new THREE.Mesh(subGeo, this.activeWallMat);
    subMesh.position.set(x, ySurface - 0.65, z);
    this.stageGroup.add(subMesh);

    const geo = new THREE.PlaneGeometry(width, depth);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.86,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
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

  createStaircaseZ(x, zStart, zEnd, yStart, yEnd, width = 4.6, stepCount = 12, addBalustrades = false, balustradeH = 3.8) {
    const zMin = Math.min(zStart, zEnd);
    const zMax = Math.max(zStart, zEnd);
    const len = zMax - zMin;
    const isFlatBridge = Math.abs(yEnd - yStart) < 0.05;
    const actualSteps = isFlatBridge ? 1 : stepCount;
    const stepDepth = len / actualSteps;

    for (let i = 0; i < actualSteps; i++) {
      const t = (i + 0.5) / actualSteps;
      const stepY = isFlatBridge ? yStart - 0.01 : THREE.MathUtils.lerp(yStart, yEnd, t);
      const stepZ = THREE.MathUtils.lerp(zStart, zEnd, t);
      const h = Math.max(1.2, stepY + 2.5);
      const geo = this.createTiledBoxGeometry(width, h, stepDepth, 3.0);
      const mesh = new THREE.Mesh(geo, this.getPlatformMaterials());
      mesh.position.set(x, stepY - h / 2, stepZ);
      this.stageGroup.add(mesh);

      if (addBalustrades && (isFlatBridge || i % 3 === 1)) {
        const postH = balustradeH + 0.55;
        [-width / 2 - 0.42, width / 2 + 0.42].forEach((bx) => {
          const postMesh = new THREE.Mesh(
            this.createTiledBoxGeometry(0.95, postH, 0.95, 2.8),
            this.pillarMaterial || this.activeWallMat
          );
          postMesh.position.set(x + bx, stepY + postH / 2 - 0.2, stepZ);
          this.stageGroup.add(postMesh);
        });
      }
    }

    if (addBalustrades) {
      const yLow = Math.min(yStart, yEnd);
      const yHigh = Math.max(yStart, yEnd);
      const wallH = (yHigh - yLow) + balustradeH + 2.5;
      const zMid = (zStart + zEnd) / 2;
      this.createWall(x - width / 2 - 0.42, yLow - 2.5, zMid, 0.84, len + 0.4, wallH, true, 14.0);
      this.createWall(x + width / 2 + 0.42, yLow - 2.5, zMid, 0.84, len + 0.4, wallH, true, 14.0);
    }

    this.heightZones.push({
      type: 'rampZ',
      xMin: x - width / 2 - 0.35,
      xMax: x + width / 2 + 0.35,
      zMin: zMin - 0.45,
      zMax: zMax + 0.45,
      zStart,
      zEnd,
      yStart,
      yEnd
    });
  }

  createStaircaseX(z, xStart, xEnd, yStart, yEnd, depth = 4.6, stepCount = 10, addBalustrades = false, balustradeH = 3.8) {
    const xMin = Math.min(xStart, xEnd);
    const xMax = Math.max(xStart, xEnd);
    const len = xMax - xMin;
    const isFlatBridge = Math.abs(yEnd - yStart) < 0.05;
    const actualSteps = isFlatBridge ? 1 : stepCount;
    const stepWidth = len / actualSteps;

    for (let i = 0; i < actualSteps; i++) {
      const t = (i + 0.5) / actualSteps;
      const stepY = isFlatBridge ? yStart - 0.01 : THREE.MathUtils.lerp(yStart, yEnd, t);
      const stepX = THREE.MathUtils.lerp(xStart, xEnd, t);
      const h = Math.max(1.2, stepY + 2.5);
      const geo = this.createTiledBoxGeometry(stepWidth, h, depth, 3.0);
      const mesh = new THREE.Mesh(geo, this.getPlatformMaterials());
      mesh.position.set(stepX, stepY - h / 2, z);
      this.stageGroup.add(mesh);

      if (addBalustrades && (isFlatBridge || i % 3 === 1)) {
        const postH = balustradeH + 0.55;
        [-depth / 2 - 0.42, depth / 2 + 0.42].forEach((bz) => {
          const postMesh = new THREE.Mesh(
            this.createTiledBoxGeometry(0.95, postH, 0.95, 2.8),
            this.pillarMaterial || this.activeWallMat
          );
          postMesh.position.set(stepX, stepY + postH / 2 - 0.2, z + bz);
          this.stageGroup.add(postMesh);
        });
      }
    }

    if (addBalustrades) {
      const yLow = Math.min(yStart, yEnd);
      const yHigh = Math.max(yStart, yEnd);
      const wallH = (yHigh - yLow) + balustradeH + 2.5;
      const xMid = (xStart + xEnd) / 2;
      this.createWall(xMid, yLow - 2.5, z - depth / 2 - 0.42, len + 0.4, 0.84, wallH, true, 14.0);
      this.createWall(xMid, yLow - 2.5, z + depth / 2 + 0.42, len + 0.4, 0.84, wallH, true, 14.0);
    }

    this.heightZones.push({
      type: 'rampX',
      xMin: xMin - 0.45,
      xMax: xMax + 0.45,
      zMin: z - depth / 2 - 0.35,
      zMax: z + depth / 2 + 0.35,
      xStart,
      xEnd,
      yStart,
      yEnd
    });
  }

  createColumn(x, yBottom, z, radius = 0.58, height = 6.5) {
    const mat = this.pillarMaterial || this.activeWallMat;
    const baseGeo = this.createTiledBoxGeometry(radius * 2.4, 0.42, radius * 2.4, 2.8);
    const baseMesh = new THREE.Mesh(baseGeo, mat);
    baseMesh.position.set(x, yBottom + 0.21, z);
    this.stageGroup.add(baseMesh);

    const geo = this.createTiledCylinderGeometry(radius, radius * 1.12, height, 12, 3.2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, yBottom + height / 2, z);

    mesh.geometry.computeBoundingBox();
    mesh.boundingBox = new THREE.Box3().setFromObject(mesh);
    mesh.boundingBox.max.y += 6.0;
    this.walls.push(mesh);
    this.stageGroup.add(mesh);

    const capGeo = this.createTiledBoxGeometry(radius * 2.5, 0.45, radius * 2.5, 2.8);
    const capMesh = new THREE.Mesh(capGeo, mat);
    capMesh.position.set(x, yBottom + height - 0.22, z);
    this.stageGroup.add(capMesh);
    return mesh;
  }

  // ============================================================================
  // CUSTOM 3D BIOME ARCHITECTURAL SETPIECES
  // ============================================================================

  /**
   * Stage I Crypt Setpiece: 3D Carved Stone Sarcophagus with Necrotic Rune Strip
   */
  createStoneSarcophagus(x, yBottom, z, rotY = 0, runeColor = 0x00ddff) {
    const group = new THREE.Group();
    group.position.set(x, yBottom, z);
    group.rotation.y = rotY;

    const plinth = new THREE.Mesh(this.createTiledBoxGeometry(1.65, 0.38, 3.1, 2.6), this.activeWallMat);
    plinth.position.set(0, 0.19, 0);
    group.add(plinth);

    const body = new THREE.Mesh(this.createTiledBoxGeometry(1.32, 0.68, 2.7, 2.6), this.activeWallMat);
    body.position.set(0, 0.72, 0);
    group.add(body);

    const lid = new THREE.Mesh(this.createTiledBoxGeometry(1.42, 0.22, 2.82, 2.6), this.pillarMaterial || this.activeWallMat);
    lid.position.set(0, 1.16, 0);
    group.add(lid);

    const runeMat = new THREE.MeshBasicMaterial({ color: runeColor });
    const runeStrip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 2.1), runeMat);
    runeStrip.position.set(0, 1.29, 0);
    group.add(runeStrip);

    const crossBar = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.06, 0.22), runeMat);
    crossBar.position.set(0, 1.29, -0.35);
    group.add(crossBar);

    this.stageGroup.add(group);
    const w = Math.abs(Math.cos(rotY)) > 0.5 ? 1.65 : 3.1;
    const d = Math.abs(Math.cos(rotY)) > 0.5 ? 3.1 : 1.65;
    const yTop = yBottom + 1.28;

    // Side collider stops at yTop - 0.14 so walking into the coffin blocks the player, while jumping lands on top of the lid!
    this.createInvisibleColliderBox(x, yBottom, z, w, 1.14, d);
    this.heightZones.push({
      type: 'flat',
      isJumpPlatform: true,
      xMin: x - w / 2 - 0.18,
      xMax: x + w / 2 + 0.18,
      zMin: z - d / 2 - 0.18,
      zMax: z + d / 2 + 0.18,
      y: yTop
    });
  }

  /**
   * Stage II Molten Forge Setpiece: 3D Obsidian Blast Furnace & Iron Forging Anvil
   */
  createForgeFurnaceAndAnvil(x, yBottom, z, rotY = 0) {
    const group = new THREE.Group();
    group.position.set(x, yBottom, z);
    group.rotation.y = rotY;

    // Stepped Forge Hearth Base
    const hearth = new THREE.Mesh(this.createTiledBoxGeometry(3.2, 0.45, 2.6, 3.0), this.activeWallMat);
    hearth.position.set(0, 0.225, 0);
    group.add(hearth);

    // Tall Obsidian Smelting Chimney
    const chimney = new THREE.Mesh(this.createTiledBoxGeometry(2.4, 3.8, 1.7, 3.0), this.activeWallMat);
    chimney.position.set(0, 2.1, -0.35);
    group.add(chimney);

    // Brass Crown Bands
    const band1 = new THREE.Mesh(new THREE.BoxGeometry(2.56, 0.22, 1.86), this.gildedGoldMat);
    band1.position.set(0, 2.9, -0.35);
    group.add(band1);
    const band2 = new THREE.Mesh(new THREE.BoxGeometry(2.56, 0.22, 1.86), this.gildedGoldMat);
    band2.position.set(0, 3.85, -0.35);
    group.add(band2);

    // Glowing Molten Core Mouth
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xff5500 });
    const coreMouth = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.25, 0.18), coreMat);
    coreMouth.position.set(0, 1.15, 0.48);
    group.add(coreMouth);

    // Molten Slag Trough in front
    const trough = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.85), new THREE.MeshBasicMaterial({ color: 0xff8800 }));
    trough.position.set(0, 0.47, 0.82);
    group.add(trough);

    // 3D Iron Anvil in front of furnace
    const anvilBase = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.45, 0.65), this.darkIronMat);
    anvilBase.position.set(0, 0.68, 1.65);
    group.add(anvilBase);
    const anvilTop = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.34, 0.52), this.darkIronMat);
    anvilTop.position.set(0, 1.05, 1.65);
    group.add(anvilTop);

    this.stageGroup.add(group);
    this.createInvisibleColliderBox(x, yBottom, z, 3.1, 8.5, 3.2);
  }

  /**
   * Stage II Floor Detail: Glowing Molten Lava Canal spanned by Dark Iron Grate Bars
   */
  createLavaChannelWithGrate(x, ySurface, z, width, depth, colorHex = 0xff4400) {
    const lavaGeo = new THREE.PlaneGeometry(width, depth);
    lavaGeo.rotateX(-Math.PI / 2);
    const lavaMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const lavaMesh = new THREE.Mesh(lavaGeo, lavaMat);
    lavaMesh.position.set(x, ySurface + 0.02, z);
    this.stageGroup.add(lavaMesh);

    // Iron curb rims
    const rimL = new THREE.Mesh(new THREE.BoxGeometry(width + 0.2, 0.14, 0.22), this.darkIronMat);
    rimL.position.set(x, ySurface + 0.08, z - depth / 2);
    const rimR = new THREE.Mesh(new THREE.BoxGeometry(width + 0.2, 0.14, 0.22), this.darkIronMat);
    rimR.position.set(x, ySurface + 0.08, z + depth / 2);
    this.stageGroup.add(rimL, rimR);

    // Iron grate crossbars so player walks safely over the glowing lava trench
    const barCount = Math.max(4, Math.floor(width / 0.85));
    for (let i = 0; i <= barCount; i++) {
      const bx = x - width / 2 + (i / barCount) * width;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.10, depth - 0.24), this.darkIronMat);
      bar.position.set(bx, ySurface + 0.07, z);
      this.stageGroup.add(bar);
    }
  }

  /**
   * Stage III Alchemical Sanctum Setpiece: 3D Emerald Glass Containment Vat with Bubbling Core
   */
  createAlchemicalVat(x, yBottom, z, colorHex = 0x22ff88) {
    const group = new THREE.Group();
    group.position.set(x, yBottom, z);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.18, 0.48, 14), this.gildedGoldMat);
    base.position.set(0, 0.24, 0);
    group.add(base);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.05, 0.42, 14), this.gildedGoldMat);
    cap.position.set(0, 3.25, 0);
    group.add(cap);

    const glassMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.58,
      roughness: 0.15,
      metalness: 0.2
    });
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.88, 2.6, 14), glassMat);
    tube.position.set(0, 1.75, 0);
    group.add(tube);

    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), coreMat);
    core.position.set(0, 1.75, 0);
    group.add(core);
    this.animatedMeshes.push({ mesh: core, baseY: 1.75, rotSpeedY: 1.6, rotSpeedX: 0.9, bobAmp: 0.24, seed: Math.random() * 10 });

    // 4 Brass Struts
    for (let i = 0; i < 4; i++) {
      const ang = (i * Math.PI) / 2 + Math.PI / 4;
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.75, 6), this.darkIronMat);
      strut.position.set(Math.cos(ang) * 0.98, 1.75, Math.sin(ang) * 0.98);
      group.add(strut);
    }

    this.stageGroup.add(group);
    this.createInvisibleColliderBox(x, yBottom, z, 2.1, 8.5, 2.1);
  }

  /**
   * Stage III & V Floor Detail: Concentric Glowing Arcane Transmutation Sigil
   */
  createArcaneFloorSigil(x, ySurface, z, radius = 3.6, colorHex = 0x33ff88) {
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    const outerRing = new THREE.Mesh(new THREE.RingGeometry(radius * 0.88, radius, 28), mat);
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.set(x, ySurface + 0.04, z);
    this.stageGroup.add(outerRing);

    const innerRing = new THREE.Mesh(new THREE.RingGeometry(radius * 0.48, radius * 0.56, 24), mat);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.set(x, ySurface + 0.045, z);
    this.stageGroup.add(innerRing);

    // Inscribed Square
    const sqSize = radius * 1.22;
    const sqRing = new THREE.Mesh(new THREE.RingGeometry(sqSize * 0.65, sqSize * 0.72, 4), mat);
    sqRing.rotation.x = -Math.PI / 2;
    sqRing.rotation.z = Math.PI / 4;
    sqRing.position.set(x, ySurface + 0.05, z);
    this.stageGroup.add(sqRing);
  }

  /**
   * Stage IV Glacial Aqueduct Setpiece: 3D Crystalline Ice Spire Cluster
   */
  createIceCrystalCluster(x, yBottom, z, scale = 1.0, colorHex = 0x00eeff) {
    const group = new THREE.Group();
    group.position.set(x, yBottom, z);

    const iceMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: 0x0055aa,
      emissiveIntensity: 0.42,
      roughness: 0.14,
      metalness: 0.35,
      flatShading: true
    });

    const spikes = [
      { dx: 0, dz: 0, r: 0.58, h: 3.2, rx: 0.06, rz: -0.05 },
      { dx: -0.55, dz: 0.35, r: 0.42, h: 2.2, rx: -0.22, rz: 0.28 },
      { dx: 0.58, dz: -0.28, r: 0.44, h: 2.35, rx: 0.24, rz: -0.26 },
      { dx: 0.25, dz: 0.55, r: 0.35, h: 1.75, rx: 0.3, rz: 0.15 }
    ];

    spikes.forEach((s) => {
      const geo = new THREE.ConeGeometry(s.r * scale, s.h * scale, 6);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, iceMat);
      mesh.position.set(s.dx * scale, (s.h * scale) * 0.45, s.dz * scale);
      mesh.rotation.set(s.rx, 0.4, s.rz);
      group.add(mesh);
    });

    this.stageGroup.add(group);
    this.createInvisibleColliderBox(x, yBottom, z, 1.8 * scale, 8.5, 1.8 * scale);
  }

  /**
   * Stage IV Glacial Aqueduct Overhead Archway Span
   */
  createAqueductArch(x, yBottom, z, spanW = 14.0, height = 7.2) {
    const pillarL = new THREE.Mesh(this.createTiledBoxGeometry(1.2, height, 1.2, 3.0), this.activeWallMat);
    pillarL.position.set(x - spanW / 2, yBottom + height / 2, z);
    const pillarR = new THREE.Mesh(this.createTiledBoxGeometry(1.2, height, 1.2, 3.0), this.activeWallMat);
    pillarR.position.set(x + spanW / 2, yBottom + height / 2, z);
    const beam = new THREE.Mesh(this.createTiledBoxGeometry(spanW + 1.6, 0.95, 1.35, 3.0), this.activeWallMat);
    beam.position.set(x, yBottom + height + 0.2, z);
    const trimBeam = new THREE.Mesh(
      new THREE.BoxGeometry(spanW + 1.8, 0.22, 1.45),
      new THREE.MeshBasicMaterial({ color: 0x00eeff })
    );
    trimBeam.position.set(x, yBottom + height - 0.38, z);
    this.stageGroup.add(pillarL, pillarR, beam, trimBeam);

    this.createInvisibleColliderBox(x - spanW / 2, yBottom, z, 1.2, height + 2.0, 1.2);
    this.createInvisibleColliderBox(x + spanW / 2, yBottom, z, 1.2, height + 2.0, 1.2);
  }

  /**
   * Stage III & V Setpiece: Rotating 3D Golden Astral Orrery
   */
  createAstralOrrery(x, yBottom, z, coreColor = 0x00eeff) {
    const ped = new THREE.Mesh(this.createTiledCylinderGeometry(0.65, 0.9, 1.1, 12, 2.8), this.activeWallMat);
    ped.position.set(x, yBottom + 0.55, z);
    this.stageGroup.add(ped);

    const orreryGroup = new THREE.Group();
    orreryGroup.position.set(x, yBottom + 2.85, z);

    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.08, 10, 28), this.gildedGoldMat);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.07, 10, 24), this.gildedGoldMat);
    ring2.rotation.x = Math.PI / 3;
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.42, 0),
      new THREE.MeshBasicMaterial({ color: coreColor })
    );

    orreryGroup.add(ring1, ring2, core);
    this.stageGroup.add(orreryGroup);
    this.animatedMeshes.push({
      mesh: orreryGroup,
      baseY: yBottom + 2.85,
      rotSpeedY: 1.15,
      rotSpeedX: 0.65,
      bobAmp: 0.15,
      seed: Math.random() * 10
    });
    this.createInvisibleColliderBox(x, yBottom, z, 1.6, 8.5, 1.6);
  }

  /**
   * Spawns a 3D architectural / orthographic decorative prop from dungeon_decor_props.jpg:
   * type: 'brazier' (0), 'bookshelf' (1), 'skull_altar' (2), 'banner' (3)
   */
  createDecorProp(type, x, yBottom, z, scale = 1.0, rotY = null) {
    const idxMap = { brazier: 0, bookshelf: 1, skull_altar: 2, banner: 3 };
    const idx = idxMap[type] !== undefined ? idxMap[type] : 0;
    const mat = this.decorMaterials[idx];

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
      const cabinetW = w * 0.57;
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

      const bodyGeo = new THREE.BoxGeometry(cabinetW, h * 0.96, depth);
      const bodyMesh = new THREE.Mesh(bodyGeo, this.woodCabinetMat);
      bodyMesh.position.set(0, (h * 0.96) / 2, 0);
      group.add(bodyMesh);

      const frontGeo = new THREE.PlaneGeometry(w, h);
      const frontMesh = new THREE.Mesh(frontGeo, mat);
      frontMesh.position.set(0, h / 2, depth / 2 + 0.02);
      group.add(frontMesh);

      this.stageGroup.add(group);
      group.updateMatrixWorld(true);

      const collider = new THREE.Mesh(new THREE.BoxGeometry(cabinetW, 8.5, depth + 0.1));
      collider.position.set(x, yBottom + 4.25, z);
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

      const plinthGeo = this.createTiledBoxGeometry(altarW, altarH, altarDepth, 2.6);
      const plinthMesh = new THREE.Mesh(plinthGeo, this.activeWallMat);
      plinthMesh.position.set(0, altarH / 2, 0);
      group.add(plinthMesh);

      const frontMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      frontMesh.position.set(0, h / 2, altarDepth / 2 + 0.02);
      group.add(frontMesh);

      this.stageGroup.add(group);
      group.updateMatrixWorld(true);

      const collider = new THREE.Mesh(new THREE.BoxGeometry(altarW, 8.5, altarDepth));
      collider.position.set(x, yBottom + 4.25, z);
      collider.rotation.y = resolvedRotY;
      collider.updateMatrixWorld(true);
      collider.boundingBox = new THREE.Box3().setFromObject(collider);
      this.walls.push(collider);
      return;
    }

    // Default: 'brazier' (animated 8-frame roaring firepit)
    const w = 1.45 * scale;
    const h = 1.85 * scale;
    const baseGeo = this.createTiledCylinderGeometry(0.52 * scale, 0.65 * scale, 0.16 * scale, 10, 2.6);
    const baseMesh = new THREE.Mesh(baseGeo, this.activeWallMat);
    baseMesh.position.set(x, yBottom + 0.08 * scale, z);
    this.stageGroup.add(baseMesh);

    const brazierFrames = this.brazierAnimMaterials && this.brazierAnimMaterials.length > 0 ? this.brazierAnimMaterials : [mat];
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), brazierFrames[0]);
    mesh.position.set(x, yBottom + 0.10 * scale + h * 0.5, z);
    this.stageGroup.add(mesh);
    this.torchSprites.push({
      mesh,
      frames: brazierFrames,
      fps: 10.5,
      seed: Math.random() * 25
    });
  }

  createTorchSprite(x, y, z) {
    const torchFrames = this.torchAnimMaterials && this.torchAnimMaterials.length > 0 ? this.torchAnimMaterials : [this.sharedTorchMat];
    const spriteMesh = new THREE.Mesh(this.sharedTorchGeo, torchFrames[0]);
    spriteMesh.position.set(x, y, z);
    this.stageGroup.add(spriteMesh);
    this.torchSprites.push({
      mesh: spriteMesh,
      frames: torchFrames,
      fps: 11.5,
      seed: Math.random() * 25
    });
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
    const pillarMat = this.pillarMaterial || this.activeWallMat;
    const pillarGeo = this.createTiledBoxGeometry(0.68, 3.9, 0.68, 2.6);

    const pillarLeft = new THREE.Mesh(pillarGeo, pillarMat);
    pillarLeft.position.set(x - 1.65, yBottom + 1.95, z);
    this.stageGroup.add(pillarLeft);

    const pillarRight = new THREE.Mesh(pillarGeo, pillarMat);
    pillarRight.position.set(x + 1.65, yBottom + 1.95, z);
    this.stageGroup.add(pillarRight);

    // Solid colliders for left and right portal pillars so player cannot walk through them
    this.createInvisibleColliderBox(x - 1.65, yBottom, z, 0.72, 8.5, 0.72);
    this.createInvisibleColliderBox(x + 1.65, yBottom, z, 0.72, 8.5, 0.72);

    const lintel = new THREE.Mesh(this.createTiledBoxGeometry(4.3, 0.75, 0.85, 2.8), pillarMat);
    lintel.position.set(x, yBottom + 3.95, z);
    this.stageGroup.add(lintel);

    const trimCap = new THREE.Mesh(new THREE.BoxGeometry(4.45, 0.16, 0.92), new THREE.MeshBasicMaterial({ color: colorHex }));
    trimCap.position.set(x, yBottom + 4.41, z);
    this.stageGroup.add(trimCap);

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
    signMesh.position.set(x, yBottom + 4.95, z);
    this.stageGroup.add(signMesh);
    this.torchSprites.push({ mesh: signMesh, frames: null });

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
      emissiveIntensity: 0.24,
      roughness: 0.2,
      metalness: 0.32,
      flatShading: true
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, yBottom + 1.25, z);
    mesh.scale.set(0.75, 1.55, 0.75);
    mesh.rotation.y = 0.55;
    this.stageGroup.add(mesh);

    const pedGeo = this.createTiledCylinderGeometry(0.42, 0.55, 0.5, 8, 2.6);
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
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(0.96 / 4, 0.96);
    tex.offset.set((frame + 0.02) / 4, 0.02);

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
    for (let i = 0; i < 280; i++) {
      const sx = (Math.random() - 0.5) * 180;
      const sy = 15 + Math.random() * 68;
      const sz = -85 + (Math.random() - 0.5) * 150;
      starPositions.push(sx, sy, sz);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xe8f2ff, size: 0.42, fog: false });
    const stars = new THREE.Points(starGeo, starMat);
    this.stageGroup.add(stars);
  }

  /**
   * Builds an ornate Gothic stone & glowing biome-trimmed archway framing a doorway
   */
  createDoorwayArchFrame(x, yBottom, z, doorW, doorH, axis = 'Z', trimColor = 0xffaa33) {
    const pillarGeo = this.createTiledBoxGeometry(0.68, doorH + 0.35, 1.05, 2.8);
    const lintelGeo =
      axis === 'Z'
        ? this.createTiledBoxGeometry(doorW + 1.35, 0.72, 1.15, 2.8)
        : this.createTiledBoxGeometry(1.15, 0.72, doorW + 1.35, 2.8);
    const keystoneGeo =
      axis === 'Z'
        ? this.createTiledBoxGeometry(0.95, 1.05, 1.25, 2.6)
        : this.createTiledBoxGeometry(1.25, 1.05, 0.95, 2.6);

    const trimMat = new THREE.MeshStandardMaterial({
      color: trimColor,
      emissive: trimColor,
      emissiveIntensity: 0.38,
      roughness: 0.38,
      metalness: 0.65
    });

    if (axis === 'Z') {
      const leftPillar = new THREE.Mesh(pillarGeo, this.pillarMaterial);
      leftPillar.position.set(x - doorW / 2 - 0.25, yBottom + doorH / 2, z);
      const rightPillar = new THREE.Mesh(pillarGeo, this.pillarMaterial);
      rightPillar.position.set(x + doorW / 2 + 0.25, yBottom + doorH / 2, z);
      const lintel = new THREE.Mesh(lintelGeo, trimMat);
      lintel.position.set(x, yBottom + doorH + 0.18, z);
      const keystone = new THREE.Mesh(keystoneGeo, this.pillarMaterial);
      keystone.position.set(x, yBottom + doorH + 0.25, z);
      this.stageGroup.add(leftPillar, rightPillar, lintel, keystone);
    } else {
      const northPillar = new THREE.Mesh(pillarGeo, this.pillarMaterial);
      northPillar.position.set(x, yBottom + doorH / 2, z - doorW / 2 - 0.25);
      const southPillar = new THREE.Mesh(pillarGeo, this.pillarMaterial);
      southPillar.position.set(x, yBottom + doorH / 2, z + doorW / 2 + 0.25);
      const lintel = new THREE.Mesh(lintelGeo, trimMat);
      lintel.position.set(x, yBottom + doorH + 0.18, z);
      const keystone = new THREE.Mesh(keystoneGeo, this.pillarMaterial);
      keystone.position.set(x, yBottom + doorH + 0.25, z);
      this.stageGroup.add(northPillar, southPillar, lintel, keystone);
    }
  }

  /**
   * Builds the 4 enclosing walls, corner buttresses, vaulted ceiling ribs / battlements,
   * recessed biome wall windows, and watertight doorway cutouts for an individual room node.
   */
  buildRoomShell(node, biome) {
    const { x, y, z, w, d, doors } = node;
    const wallH = biome.openSky ? Math.min(7.8, node.wallH || 7.6) : (node.wallH || 9.6);
    const doorW = 5.8;
    const doorH = 5.4;

    // 1. Ceiling or Open-Sky Crenellated Battlement Coping
    if (!biome.openSky) {
      const ceilGeo = this.createTiledPlaneGeometry(w + 1.2, d + 1.2, 3.6);
      ceilGeo.rotateX(Math.PI / 2);
      const ceilMesh = new THREE.Mesh(ceilGeo, this.ceilMaterial);
      ceilMesh.position.set(x, y + wallH, z);
      this.stageGroup.add(ceilMesh);

      // Vaulted Ceiling Cross-Beams / Ribs so indoor ceilings have rich 3D depth
      const beamX = new THREE.Mesh(this.createTiledBoxGeometry(w - 0.4, 0.55, 0.75, 3.2), this.pillarMaterial);
      beamX.position.set(x, y + wallH - 0.28, z);
      const beamZ = new THREE.Mesh(this.createTiledBoxGeometry(0.75, 0.52, d - 0.4, 3.2), this.pillarMaterial);
      beamZ.position.set(x, y + wallH - 0.27, z);
      const bossHub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.95, 0.85, 0.68, 8),
        new THREE.MeshBasicMaterial({ color: biome.trimColor })
      );
      bossHub.position.set(x, y + wallH - 0.34, z);
      this.stageGroup.add(beamX, beamZ, bossHub);
    }

    // 2. Structural Corner Buttress Pilasters at all 4 room corners
    const cornerOffsets = [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [-w / 2, d / 2],
      [w / 2, d / 2]
    ];
    cornerOffsets.forEach(([cx, cz]) => {
      const pilaster = new THREE.Mesh(this.createTiledBoxGeometry(1.38, wallH + 0.4, 1.38, 3.2), this.pillarMaterial);
      pilaster.position.set(x + cx, y + wallH / 2, z + cz);
      this.stageGroup.add(pilaster);
    });

    // Helper for North/South walls (along X axis)
    const buildZWall = (zWall, hasDoor, isNorth) => {
      if (!hasDoor) {
        if (biome.openSky) {
          this.createCrenellatedWall(x, y, zWall, w + 1.0, 1.0, wallH, 0.9);
        } else {
          this.createWall(x, y - 5.0, zWall, w + 1.0, 1.0, wallH + 5.0, true, 12.0);
        }
        // Add recessed Gothic stained-glass / biome lancet window on closed walls
        if (w >= 18 && node.id !== 'north_sanctum') {
          const winZ = zWall + (isNorth ? 0.56 : -0.56);
          const winFrame = new THREE.Mesh(this.createTiledBoxGeometry(3.4, 4.4, 0.16, 2.8), this.pillarMaterial);
          winFrame.position.set(x, y + wallH * 0.52, winZ);
          const winGlass = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 3.7), this.stainedGlassMaterial);
          winGlass.position.set(x, y + wallH * 0.52, winZ + (isNorth ? 0.1 : -0.1));
          this.stageGroup.add(winFrame, winGlass);
        }
      } else {
        const segW = (w - doorW) / 2;
        if (biome.openSky) {
          this.createCrenellatedWall(x - doorW / 2 - segW / 2 - 0.25, y, zWall, segW + 0.5, 1.0, wallH, 0.9);
          this.createCrenellatedWall(x + doorW / 2 + segW / 2 + 0.25, y, zWall, segW + 0.5, 1.0, wallH, 0.9);
        } else {
          this.createWall(x - doorW / 2 - segW / 2 - 0.25, y - 5.0, zWall, segW + 0.5, 1.0, wallH + 5.0, true, 12.0);
          this.createWall(x + doorW / 2 + segW / 2 + 0.25, y - 5.0, zWall, segW + 0.5, 1.0, wallH + 5.0, true, 12.0);
        }
        // Overhead doorway lintel with extraBottomCollider = 0.0 so the 5.8m x 5.4m doorway opening is 100% clear!
        this.createWall(x, y + doorH, zWall, doorW + 0.4, 1.0, Math.max(1.2, wallH - doorH), true, 12.0, null, 0.0);
        this.createDoorwayArchFrame(x, y, zWall, doorW, doorH, 'Z', biome.trimColor);
      }
    };

    // Helper for West/East walls (along Z axis)
    const buildXWall = (xWall, hasDoor, isWest) => {
      if (!hasDoor) {
        if (biome.openSky) {
          this.createCrenellatedWall(xWall, y, z, 1.0, d + 1.0, wallH, 0.9);
        } else {
          this.createWall(xWall, y - 5.0, z, 1.0, d + 1.0, wallH + 5.0, true, 12.0);
        }
        if (d >= 18) {
          const winX = xWall + (isWest ? 0.56 : -0.56);
          const winFrame = new THREE.Mesh(this.createTiledBoxGeometry(0.16, 4.4, 3.4, 2.8), this.pillarMaterial);
          winFrame.position.set(winX, y + wallH * 0.52, z);
          const winGlass = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 3.7), this.stainedGlassMaterial);
          winGlass.rotation.y = Math.PI / 2;
          winGlass.position.set(winX + (isWest ? 0.1 : -0.1), y + wallH * 0.52, z);
          this.stageGroup.add(winFrame, winGlass);
        }
      } else {
        const segD = (d - doorW) / 2;
        if (biome.openSky) {
          this.createCrenellatedWall(xWall, y, z - doorW / 2 - segD / 2 - 0.25, 1.0, segD + 0.5, wallH, 0.9);
          this.createCrenellatedWall(xWall, y, z + doorW / 2 + segD / 2 + 0.25, 1.0, segD + 0.5, wallH, 0.9);
        } else {
          this.createWall(xWall, y - 5.0, z - doorW / 2 - segD / 2 - 0.25, 1.0, segD + 0.5, wallH + 5.0, true, 12.0);
          this.createWall(xWall, y - 5.0, z + doorW / 2 + segD / 2 + 0.25, 1.0, segD + 0.5, wallH + 5.0, true, 12.0);
        }
        // Overhead doorway lintel with extraBottomCollider = 0.0 so the 5.8m x 5.4m doorway opening is 100% clear!
        this.createWall(xWall, y + doorH, z, 1.0, doorW + 0.4, Math.max(1.2, wallH - doorH), true, 12.0, null, 0.0);
        this.createDoorwayArchFrame(xWall, y, z, doorW, doorH, 'X', biome.trimColor);
      }
    };

    buildZWall(z - d / 2, doors.north, true);
    buildZWall(z + d / 2, doors.south, false);
    buildXWall(x - w / 2, doors.west, true);
    buildXWall(x + w / 2, doors.east, false);
  }

  /**
   * Builds an enclosed 3D stone hallway / staircase with overhead rib-arches connecting two adjacent room doorways
   */
  buildGraphEdgeCorridor(edge, biome) {
    const corrW = 5.8;
    const wallH = biome.openSky ? 5.2 : 8.6;

    if (edge.dir === 'NS') {
      const zMid = (edge.zStart + edge.zEnd) / 2;
      const corrLen = Math.abs(edge.zEnd - edge.zStart);
      const yMin = Math.min(edge.yStart, edge.yEnd);
      const yMax = Math.max(edge.yStart, edge.yEnd);
      const yAvg = (edge.yStart + edge.yEnd) / 2;
      const totalWallH = (yMax - yMin) + wallH + 5.0;

      this.createStaircaseZ(edge.x, edge.zStart, edge.zEnd, edge.yStart, edge.yEnd, corrW, 14);
      if (biome.openSky) {
        this.createCrenellatedWall(edge.x - corrW / 2 - 0.45, yMin, zMid, 0.9, corrLen + 0.5, (yMax - yMin) + 4.2, 0.8);
        this.createCrenellatedWall(edge.x + corrW / 2 + 0.45, yMin, zMid, 0.9, corrLen + 0.5, (yMax - yMin) + 4.2, 0.8);
      } else {
        this.createWall(edge.x - corrW / 2 - 0.45, yMin - 5.0, zMid, 0.9, corrLen + 0.5, totalWallH, true, 12.0);
        this.createWall(edge.x + corrW / 2 + 0.45, yMin - 5.0, zMid, 0.9, corrLen + 0.5, totalWallH, true, 12.0);

        const ceilGeo = this.createTiledPlaneGeometry(corrW + 1.2, corrLen + 0.8, 3.4);
        ceilGeo.rotateX(Math.PI / 2);
        const ceilMesh = new THREE.Mesh(ceilGeo, this.ceilMaterial);
        ceilMesh.position.set(edge.x, yMax + wallH, zMid);
        this.stageGroup.add(ceilMesh);

        // Central corridor stone rib arch
        const rib = new THREE.Mesh(this.createTiledBoxGeometry(corrW + 0.4, 0.55, 0.75, 3.0), this.pillarMaterial);
        rib.position.set(edge.x, yAvg + 5.6, zMid);
        this.stageGroup.add(rib);
      }

      this.createTorchSprite(edge.x - corrW / 2 + 0.28, yAvg + 2.6, zMid);
      this.createTorchSprite(edge.x + corrW / 2 - 0.28, yAvg + 2.6, zMid);
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
      const yMax = Math.max(edge.yStart, edge.yEnd);
      const yAvg = (edge.yStart + edge.yEnd) / 2;
      const totalWallH = (yMax - yMin) + wallH + 5.0;

      this.createStaircaseX(edge.z, edge.xStart, edge.xEnd, edge.yStart, edge.yEnd, corrW, 14);
      if (biome.openSky) {
        this.createCrenellatedWall(xMid, yMin, edge.z - corrW / 2 - 0.45, corrLen + 0.5, 0.9, (yMax - yMin) + 4.2, 0.8);
        this.createCrenellatedWall(xMid, yMin, edge.z + corrW / 2 + 0.45, corrLen + 0.5, 0.9, (yMax - yMin) + 4.2, 0.8);
      } else {
        this.createWall(xMid, yMin - 5.0, edge.z - corrW / 2 - 0.45, corrLen + 0.5, 0.9, totalWallH, true, 12.0);
        this.createWall(xMid, yMin - 5.0, edge.z + corrW / 2 + 0.45, corrLen + 0.5, 0.9, totalWallH, true, 12.0);

        const ceilGeo = this.createTiledPlaneGeometry(corrLen + 0.8, corrW + 1.2, 3.4);
        ceilGeo.rotateX(Math.PI / 2);
        const ceilMesh = new THREE.Mesh(ceilGeo, this.ceilMaterial);
        ceilMesh.position.set(xMid, yMax + wallH, edge.z);
        this.stageGroup.add(ceilMesh);

        const rib = new THREE.Mesh(this.createTiledBoxGeometry(0.75, 0.55, corrW + 0.4, 3.0), this.pillarMaterial);
        rib.position.set(xMid, yAvg + 5.6, edge.z);
        this.stageGroup.add(rib);
      }

      this.createTorchSprite(xMid, yAvg + 2.6, edge.z - corrW / 2 + 0.28);
      this.createTorchSprite(xMid, yAvg + 2.6, edge.z + corrW / 2 - 0.28);
      this.minimapCorridors.push({
        x: Math.min(edge.xStart, edge.xEnd),
        z: edge.z - corrW / 2,
        rw: corrLen,
        rd: corrW
      });
    }
  }

  /**
   * Populates an individual enclosed room node with biome-specific 3D setpieces, props, pillars, crystals & enemies
   */
  populateRoomArchetype(node, biome, enemyList) {
    const { x, y, z, w, d, archetype } = node;
    const fx = w / 20;
    const fz = d / 20;
    const X = (dx) => x + dx * fx;
    const Z = (dz) => z + dz * fz;
    const wallDx = Math.min(w / 2 - 1.8, Math.max(4.8, 5.8 * fx));
    const northWallZ = z - d / 2 + 0.88;
    const northBannerZ = z - d / 2 + 0.62;
    const colH = Math.min(7.5, (node.wallH || 9.0) - 0.6);

    // --- STAGE I: SUNKEN UNDERCROFT ARCHETYPES ---
    if (archetype === 'SUNKEN_OSSUARY_CRYPT') {
      this.createStoneSarcophagus(X(-4.0), y, Z(-1.5), 0, 0x00eeff);
      this.createStoneSarcophagus(X(4.0), y, Z(-1.5), 0, 0x9955ff);
      this.createDecorProp('skull_altar', x, y, Z(-4.2), 1.05);
      this.createDecorProp('brazier', X(-4.2), y, Z(3.6), 0.95);
      this.createDecorProp('brazier', X(4.2), y, Z(3.6), 0.95);
      this.createFacetedCrystal(x, y, Z(2.2), 0x00eeff);
      this.spawnSinglePickup('health', X(-3.2), y, Z(3.8));
      enemyList.push({ type: 'skeleton', x: X(-3.2), y, z: Z(1.8) });
      enemyList.push({ type: 'gargoyle', x: X(3.2), y, z: Z(1.8) });
    } else if (archetype === 'FLOODED_CATACOMB_GALLERY') {
      // Sunken void trenches on North/South flanks of the gallery
      this.createLavaChannelWithGrate(x, y, Z(-3.5), w * 0.55, 2.2, 0x331177);
      this.createLavaChannelWithGrate(x, y, Z(3.5), w * 0.55, 2.2, 0x331177);
      this.createColumn(X(-4.8), y, Z(-2.8), 0.58, colH);
      this.createColumn(X(4.8), y, Z(-2.8), 0.58, colH);
      this.createStoneSarcophagus(x, y, z, Math.PI / 2, 0x00ddff);
      this.createFacetedCrystal(X(-5.2), y, z, 0x00eeff);
      this.spawnSinglePickup('mana', X(5.2), y, z);
      enemyList.push({ type: 'dread_knight', x: X(-3.5), y, z: Z(1.5) });
      enemyList.push({ type: 'skeleton', x: X(3.5), y, z: Z(-1.5) });
    } else if (archetype === 'DARK_GARGOYLE_BELFRY') {
      this.createColumn(X(-4.4), y, Z(-4.0), 0.65, colH);
      this.createColumn(X(4.4), y, Z(-4.0), 0.65, colH);
      this.createColumn(X(-4.4), y, Z(4.0), 0.65, colH);
      this.createColumn(X(4.4), y, Z(4.0), 0.65, colH);
      this.createJumpPlatform(x, y + 1.25, z, 4.4, 4.4, 1.25, biome.trimColor);
      this.createFacetedCrystal(x, y + 1.25, z, 0x8855ff);
      this.createDecorProp('banner', x - wallDx, y, northBannerZ, 1.05, 0);
      this.createDecorProp('banner', x + wallDx, y, northBannerZ, 1.05, 0);
      this.spawnSinglePickup('health', X(4.0), y, z);
      enemyList.push({ type: 'gargoyle', x: X(-3.6), y, z: Z(-2.2) });
      enemyList.push({ type: 'gargoyle', x: X(3.6), y, z: Z(2.2) });
    } else if (archetype === 'FORGOTTEN_RELIQUARY') {
      this.createStoneSarcophagus(x, y, Z(-2.8), Math.PI / 2, 0x00ffcc);
      this.createFacetedCrystal(X(-3.8), y, Z(2.2), 0x00eeff);
      this.createFacetedCrystal(X(3.8), y, Z(2.2), 0xffaa22);
      this.createDecorProp('bookshelf', x - wallDx, y, northWallZ, 1.0, 0);
      this.spawnSinglePickup('mana', x, y, Z(3.5));
      enemyList.push({ type: 'skeleton', x: X(-3.0), y, z: z });
      enemyList.push({ type: 'dread_knight', x: X(3.0), y, z: z });
    }

    // --- STAGE II: THE MOLTEN FORGE ARCHETYPES ---
    else if (archetype === 'SMELTING_FURNACE_HALL') {
      this.createForgeFurnaceAndAnvil(x, y, Z(-3.5), 0);
      this.createLavaChannelWithGrate(x, y, Z(2.6), w * 0.58, 2.4, 0xff4400);
      this.createDecorProp('brazier', X(-5.0), y, Z(-2.5), 1.05);
      this.createDecorProp('brazier', X(5.0), y, Z(-2.5), 1.05);
      this.createFacetedCrystal(X(-4.8), y, Z(3.5), 0xff6600);
      this.spawnSinglePickup('health', X(4.8), y, Z(3.5));
      enemyList.push({ type: 'fire_imp', x: X(-3.8), y, z: Z(1.2) });
      enemyList.push({ type: 'dread_knight', x: X(3.8), y, z: Z(1.2) });
    } else if (archetype === 'OBSIDIAN_ANVIL_FOUNDRY') {
      this.createPlatformBlock(x, y + 0.55, z, 6.2, 6.2, 0.55, true);
      this.createForgeFurnaceAndAnvil(x, y + 0.55, Z(-0.8), 0);
      this.createColumn(X(-5.2), y, Z(-4.2), 0.65, colH);
      this.createColumn(X(5.2), y, Z(-4.2), 0.65, colH);
      this.createFacetedCrystal(X(-5.0), y, Z(3.5), 0xffaa00);
      this.createFacetedCrystal(X(5.0), y, Z(3.5), 0xff4400);
      this.spawnSinglePickup('mana', x, y + 0.55, Z(2.0));
      enemyList.push({ type: 'fire_imp', x: X(-4.2), y, z: Z(-2.0) });
      enemyList.push({ type: 'fire_imp', x: X(4.2), y, z: Z(2.0) });
      enemyList.push({ type: 'gargoyle', x: x, y, z: Z(4.2) });
    } else if (archetype === 'MAGMA_CONDUIT_CHAMBER') {
      this.createLavaChannelWithGrate(X(-3.8), y, z, 5.2, 2.6, 0xff3300);
      this.createLavaChannelWithGrate(X(3.8), y, z, 5.2, 2.6, 0xff3300);
      this.createDecorProp('brazier', x, y, Z(-3.5), 1.1);
      this.createDecorProp('banner', x - wallDx, y, northBannerZ, 1.0, 0);
      this.createDecorProp('banner', x + wallDx, y, northBannerZ, 1.0, 0);
      this.createFacetedCrystal(x, y, Z(3.2), 0xff7700);
      this.spawnSinglePickup('health', x, y, z);
      enemyList.push({ type: 'fire_imp', x: X(-4.0), y, z: Z(-2.8) });
      enemyList.push({ type: 'dread_knight', x: X(4.0), y, z: Z(2.8) });
    } else if (archetype === 'PYROCLAST_CRUCIBLE') {
      this.createLavaChannelWithGrate(x, y, z, 5.8, 3.2, 0xff5500);
      this.createDecorProp('brazier', X(-4.2), y, Z(-3.2), 1.0);
      this.createDecorProp('brazier', X(4.2), y, Z(-3.2), 1.0);
      this.createFacetedCrystal(X(-4.0), y, Z(3.0), 0xff8800);
      this.spawnSinglePickup('mana', X(4.0), y, Z(3.0));
      enemyList.push({ type: 'fire_imp', x: X(-3.2), y, z: Z(2.2) });
      enemyList.push({ type: 'skeleton', x: X(3.2), y, z: Z(-2.2) });
    }

    // --- STAGE III: THE ALCHEMICAL SANCTUM ARCHETYPES ---
    else if (archetype === 'TRANSMUTATION_VAT_LAB') {
      this.createArcaneFloorSigil(x, y, z, 3.8, 0x33ff88);
      this.createAlchemicalVat(X(-4.4), y, Z(-2.6), 0x22ff88);
      this.createAlchemicalVat(X(4.4), y, Z(-2.6), 0x00eeff);
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
      this.createFacetedCrystal(X(4.2), y, Z(3.2), 0x33ff88);
      this.spawnSinglePickup('mana', X(-4.2), y, Z(3.2));
      enemyList.push({ type: 'skeleton', x: X(-3.4), y, z: Z(1.8) });
      enemyList.push({ type: 'frost_wraith', x: X(3.4), y, z: Z(1.8) });
    } else if (archetype === 'GRAND_ARCANE_ARCHIVE') {
      this.createDecorProp('bookshelf', x - wallDx, y, northWallZ, 1.05, 0);
      this.createDecorProp('bookshelf', x + wallDx, y, northWallZ, 1.05, 0);
      this.createAlchemicalVat(X(-5.2), y, z, 0x00ffcc);
      this.createAlchemicalVat(X(5.2), y, z, 0x33ff88);
      this.createArcaneFloorSigil(x, y, z, 3.4, 0xffd744);
      this.createFacetedCrystal(x, y, Z(-2.6), 0x00eeff);
      this.spawnSinglePickup('mana', x, y, Z(3.6));
      enemyList.push({ type: 'skeleton', x: X(-3.8), y, z: Z(-1.8) });
      enemyList.push({ type: 'skeleton', x: X(3.8), y, z: Z(1.8) });
    } else if (archetype === 'ASTROLABE_OBSERVATORY') {
      this.createArcaneFloorSigil(x, y, z, 4.4, 0xffd744);
      this.createAstralOrrery(x, y, z, 0x33ff88);
      this.createColumn(X(-5.0), y, Z(-4.2), 0.6, colH);
      this.createColumn(X(5.0), y, Z(-4.2), 0.6, colH);
      this.createFacetedCrystal(X(-4.6), y, Z(3.4), 0x33ff88);
      this.createFacetedCrystal(X(4.6), y, Z(3.4), 0x00eeff);
      this.spawnSinglePickup('health', X(3.5), y, Z(-3.2));
      enemyList.push({ type: 'dread_knight', x: X(-3.6), y, z: Z(2.2) });
      enemyList.push({ type: 'frost_wraith', x: X(3.6), y, z: Z(-2.2) });
    } else if (archetype === 'VENOM_DISTILLERY') {
      this.createLavaChannelWithGrate(x, y, Z(-3.0), w * 0.52, 2.4, 0x18dd48);
      this.createLavaChannelWithGrate(x, y, Z(3.0), w * 0.52, 2.4, 0x18dd48);
      this.createAlchemicalVat(x, y, z, 0x33ff66);
      this.createFacetedCrystal(X(-3.8), y, z, 0x33ff88);
      this.spawnSinglePickup('health', X(3.8), y, z);
      enemyList.push({ type: 'frost_wraith', x: X(-3.0), y, z: Z(2.5) });
      enemyList.push({ type: 'gargoyle', x: X(3.0), y, z: Z(-2.5) });
    }

    // --- STAGE IV: THE GLACIAL AQUEDUCT ARCHETYPES ---
    else if (archetype === 'FROZEN_AQUEDUCT_SPAN') {
      this.createAqueductArch(x, y, Z(-3.5), w - 2.4, 7.2);
      this.createAqueductArch(x, y, Z(3.5), w - 2.4, 7.2);
      this.createIceCrystalCluster(X(-4.4), y, z, 1.05, 0x00eeff);
      this.createIceCrystalCluster(X(4.4), y, z, 1.05, 0x66ccff);
      this.createFacetedCrystal(x, y, z, 0x00eeff);
      this.spawnSinglePickup('mana', x, y, Z(4.2));
      enemyList.push({ type: 'frost_wraith', x: X(-3.2), y, z: Z(-2.2) });
      enemyList.push({ type: 'dread_knight', x: X(3.2), y, z: Z(2.2) });
    } else if (archetype === 'GLACIAL_SPIKE_CAVERN') {
      this.createIceCrystalCluster(X(-4.8), y, Z(-3.6), 1.2, 0x00eeff);
      this.createIceCrystalCluster(X(4.8), y, Z(-3.6), 1.15, 0x44ccff);
      this.createIceCrystalCluster(X(-4.5), y, Z(3.6), 1.0, 0x66eeff);
      this.createArcaneFloorSigil(x, y, z, 3.6, 0x00eeff);
      this.createFacetedCrystal(x, y, Z(-1.8), 0x00ffff);
      this.spawnSinglePickup('health', X(4.2), y, Z(3.2));
      enemyList.push({ type: 'frost_wraith', x: X(-3.4), y, z: Z(1.2) });
      enemyList.push({ type: 'frost_wraith', x: X(3.4), y, z: Z(-1.2) });
    } else if (archetype === 'CRYOFROST_MONOLITH_SHRINE') {
      this.createPlatformBlock(x, y + 0.6, z, 5.6, 5.6, 0.6, true);
      this.createAstralOrrery(x, y + 0.6, z, 0x00eeff);
      this.createIceCrystalCluster(X(-4.6), y, Z(-3.2), 1.0, 0x00eeff);
      this.createIceCrystalCluster(X(4.6), y, Z(-3.2), 1.0, 0x00eeff);
      this.spawnSinglePickup('mana', X(-3.8), y, Z(3.4));
      this.spawnSinglePickup('health', X(3.8), y, Z(3.4));
      enemyList.push({ type: 'dread_knight', x: x, y, z: Z(3.6) });
      enemyList.push({ type: 'skeleton', x: X(-3.8), y, z: Z(-2.0) });
    } else if (archetype === 'AURORA_MIRROR_GALLERY') {
      this.createArcaneFloorSigil(X(-4.0), y, z, 2.8, 0x00eeff);
      this.createArcaneFloorSigil(X(4.0), y, z, 2.8, 0x88aaff);
      this.createColumn(X(-5.2), y, Z(-3.2), 0.6, colH);
      this.createColumn(X(5.2), y, Z(-3.2), 0.6, colH);
      this.createFacetedCrystal(X(-4.0), y, z, 0x00eeff);
      this.createFacetedCrystal(X(4.0), y, z, 0xaa66ff);
      this.spawnSinglePickup('mana', x, y, Z(3.2));
      enemyList.push({ type: 'frost_wraith', x: X(-3.5), y, z: Z(2.0) });
      enemyList.push({ type: 'fire_imp', x: X(3.5), y, z: Z(-2.0) });
    }

    // --- CLASSIC SHARED ARCHETYPES ---
    else if (archetype === 'ARCANE_LIBRARY') {
      this.createDecorProp('bookshelf', x - wallDx, y, northWallZ, 1.0, 0);
      this.createDecorProp('bookshelf', x + wallDx, y, northWallZ, 1.0, 0);
      this.createDecorProp('brazier', x, y, Z(2.5), 0.95);
      this.createFacetedCrystal(x, y, Z(-2.0), biome.trimColor);
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

    // Larger rooms get corner columns and extra garrison
    const area = w * d;
    if (area >= 420) {
      const cx = w / 2 - 2.8;
      const cz = d / 2 - 2.8;
      this.createColumn(x - cx, y, z - cz, 0.6, colH);
      this.createColumn(x + cx, y, z - cz, 0.6, colH);
      this.createColumn(x - cx, y, z + cz, 0.6, colH);
      this.createColumn(x + cx, y, z + cz, 0.6, colH);
      enemyList.push({ type: biome.enemyPool[2] || biome.enemyPool[0], x: x - cx * 0.55, y, z: z + cz * 0.45 });
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
    this.ceilMaterial = this.ceilMaterials[biome.ceilTheme] || this.ceilMaterials.stone;
    this.pillarMaterial = this.wallMaterials[biome.pillarTheme] || this.activeWallMat;

    this.scene.background = new THREE.Color(biome.fogColor);
    this.scene.fog = new THREE.FogExp2(biome.fogColor, biome.fogDensity);

    const ambient = new THREE.AmbientLight(biome.ambientColor, 1.38);
    this.stageGroup.add(ambient);
    const hemi = new THREE.HemisphereLight(biome.hemiSky, biome.hemiGround, 1.05);
    this.stageGroup.add(hemi);
    const dirLight = new THREE.DirectionalLight(biome.dirColor, 2.15);
    dirLight.position.set(16, 30, 22);
    this.stageGroup.add(dirLight);

    if (biome.openSky) {
      this.addMoonAndStars();
    }

    const enemies = [];
    this.graphEdges = edges;

    // 1. Build Individual Enclosed Room Shells, Floors & Biome Contents for All Graph Nodes
    nodes.forEach((node) => {
      this.buildRoomShell(node, biome);
      this.createRoomLight(node.x, node.y + 5.6, node.z, node.lightColor, 5.4, 28);

      if (node.archetype === 'CHASM_PLATFORMING_HUB') {
        // Sunken Elemental Hazard Basin inside this enclosed Chasm Room
        const basinY = node.y - 2.2;
        this.createHazardBasin(node.x, basinY, node.z, node.w - 0.6, node.d - 0.6, biome.hazardType);
        // Central + Corner Jump Pads in the basin so the player can always recover effortlessly
        this.createJumpPad(node.x, basinY, node.z, 13.5, biome.trimColor);
        this.createJumpPad(node.x - node.w * 0.28, basinY, node.z + node.d * 0.25, 13.2, biome.trimColor);
        this.createJumpPad(node.x + node.w * 0.28, basinY, node.z - node.d * 0.25, 13.2, biome.trimColor);

        const sx = node.w / 20;
        const sz = node.d / 20;
        const PX = (dx) => node.x + dx * sx;
        const PZ = (dz) => node.z + dz * sz;

        // Solid stone doorway landing balconies: sunken-chasm colliders are inset away from the doorway wall
        // and stop 0.6m below node.y so doorway/hallway thresholds are 100% clear while the -2.2m basin is blocked
        if (node.doors.south) {
          this.createPlatformBlock(node.x, node.y, node.z + node.d / 2 - 3.0, 7.4, 6.0, 3.2, false);
          this.createInvisibleColliderBox(node.x, node.y - 3.2, node.z + node.d / 2 - 3.4, 7.2, 2.6, 4.8);
          this.createJumpPad(node.x - 2.4, node.y, node.z + node.d / 2 - 3.0, 11.8, biome.trimColor);
        }
        if (node.doors.north) {
          this.createPlatformBlock(node.x, node.y, node.z - node.d / 2 + 3.0, 7.4, 6.0, 3.2, false);
          this.createInvisibleColliderBox(node.x, node.y - 3.2, node.z - node.d / 2 + 3.4, 7.2, 2.6, 4.8);
        }
        if (node.doors.west) {
          this.createPlatformBlock(node.x - node.w / 2 + 3.0, node.y, node.z, 6.0, 7.4, 3.2, false);
          this.createInvisibleColliderBox(node.x - node.w / 2 + 3.4, node.y - 3.2, node.z, 4.8, 2.6, 7.2);
        }
        if (node.doors.east) {
          this.createPlatformBlock(node.x + node.w / 2 - 3.0, node.y, node.z, 6.0, 7.4, 3.2, false);
          this.createInvisibleColliderBox(node.x + node.w / 2 - 3.4, node.y - 3.2, node.z, 4.8, 2.6, 7.2);
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
        this.createPlatformBlock(node.x, node.y, node.z, node.w, node.d, Math.max(4.0, Math.abs(node.y) + 4.0));
      }

      // Populate Room Contents according to Archetype
      if (node.id === 'entry_hall') {
        this.createColumn(node.x - 5.8, node.y, node.z - 3.5, 0.65, 8.5);
        this.createColumn(node.x + 5.8, node.y, node.z - 3.5, 0.65, 8.5);
        this.createArcaneFloorSigil(node.x, node.y, node.z + 1.5, 3.2, biome.trimColor);
        this.createDecorProp('brazier', node.x - 4.0, node.y, node.z - 4.2, 1.0);
        this.createDecorProp('brazier', node.x + 4.0, node.y, node.z - 4.2, 1.0);
        this.createDecorProp('banner', node.x - 6.2, node.y, node.z - node.d / 2 + 0.62, 1.0, 0);
        this.createDecorProp('banner', node.x + 6.2, node.y, node.z - node.d / 2 + 0.62, 1.0, 0);
        this.createFacetedCrystal(node.x - 6.0, node.y, node.z + 2.0, biome.trimColor);
        this.createFacetedCrystal(node.x + 6.0, node.y, node.z + 2.0, 0x00eeff);
        this.spawnSinglePickup('health', node.x - 6.8, node.y, node.z + 5.8);
        this.spawnSinglePickup('mana', node.x + 6.8, node.y, node.z + 5.8);
        enemies.push({ type: biome.enemyPool[0], x: node.x - 4.2, y: node.y, z: node.z - 2.0 });
        enemies.push({ type: biome.enemyPool[1], x: node.x + 4.2, y: node.y, z: node.z - 2.0 });
      } else if (node.id === 'north_sanctum') {
        this.createColumn(node.x - 6.5, node.y, node.z - 2.0, 0.68, 9.5);
        this.createColumn(node.x + 6.5, node.y, node.z - 2.0, 0.68, 9.5);
        this.createArcaneFloorSigil(node.x, node.y, node.z + 2.0, 3.8, 0xffd744);
        this.createDecorProp('skull_altar', node.x - 6.0, node.y, node.z - 4.5, 1.0);
        this.createDecorProp('bookshelf', node.x + 6.2, node.y, node.z - node.d / 2 + 0.88, 1.0, 0);
        if (stageId === 'stage1') {
          this.createStoneSarcophagus(node.x + 6.0, node.y, node.z + 4.2, 0, 0x00eeff);
        } else if (stageId === 'stage2') {
          this.createForgeFurnaceAndAnvil(node.x + 6.5, node.y, node.z + 4.0, -Math.PI / 2);
        } else if (stageId === 'stage3') {
          this.createAlchemicalVat(node.x - 6.5, node.y, node.z + 4.2, 0x22ff88);
          this.createAlchemicalVat(node.x + 6.5, node.y, node.z + 4.2, 0x00eeff);
        } else if (stageId === 'stage4') {
          this.createIceCrystalCluster(node.x - 6.8, node.y, node.z + 4.2, 1.15, 0x00eeff);
          this.createIceCrystalCluster(node.x + 6.8, node.y, node.z + 4.2, 1.15, 0x00eeff);
        }
        // Stage Elder Grimoire on glowing golden altar pedestal!
        this.spawnSinglePickup('grimoire', node.x, node.y, node.z + 2.0);
        this.createStagePortal(
          node.x,
          node.y,
          node.z - 7.2,
          biome.portalTarget,
          biome.portalTitle,
          biome.portalSubtitle,
          biome.portalColor
        );
        enemies.push({ type: 'dread_knight', x: node.x - 4.0, y: node.y, z: node.z - 1.5 });
        enemies.push({ type: 'dread_knight', x: node.x + 4.0, y: node.y, z: node.z - 1.5 });
        enemies.push({ type: biome.enemyPool[0], x: node.x, y: node.y, z: node.z + 4.8 });
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
  // SCENE 0: OVERWORLD HUB — "THE CASTLE ASCENT"
  // Features 6 Fully Walled Terraces + 4 Branching Biome Side Paths & Loop Shortcuts
  // ============================================================================
  buildOverworldAscent() {
    this.activeWallMat = this.wallMaterials.stone;
    this.activeFloorMat = this.floorMaterials.stone;
    this.ceilMaterial = this.ceilMaterials.stone;
    this.pillarMaterial = this.wallMaterials.stone;

    this.scene.background = new THREE.Color(0x080c18);
    this.scene.fog = new THREE.FogExp2(0x080c18, 0.010);

    const ambient = new THREE.AmbientLight(0x485c8c, 1.38);
    this.stageGroup.add(ambient);
    const hemi = new THREE.HemisphereLight(0x99bbff, 0x2a2432, 1.18);
    this.stageGroup.add(hemi);
    const dirLight = new THREE.DirectionalLight(0xddeeff, 2.25);
    dirLight.position.set(22, 46, 30);
    this.stageGroup.add(dirLight);

    this.addMoonAndStars();

    // Helper to build a North/South terrace parapet wall with a central staircase opening (width 7.0)
    const buildTerraceZParapet = (y, zWall, totalW = 24, openW = 7.0, wallH = 3.8) => {
      const segW = (totalW - openW) / 2;
      this.createCrenellatedWall(-openW / 2 - segW / 2 - 0.2, y, zWall, segW + 0.4, 1.0, wallH, 0.85);
      this.createCrenellatedWall(openW / 2 + segW / 2 + 0.2, y, zWall, segW + 0.4, 1.0, wallH, 0.85);
    };

    // Helper to build an East/West terrace wall with a central side-path gateway (depth 5.2)
    const buildTerraceXGatewayWall = (xWall, y, zCenter, totalD = 10, openD = 5.2, wallH = 4.2, trimCol = 0x00eeff) => {
      const segD = (totalD - openD) / 2;
      this.createCrenellatedWall(xWall, y, zCenter - openD / 2 - segD / 2 - 0.2, 1.0, segD + 0.4, wallH, 0.85);
      this.createCrenellatedWall(xWall, y, zCenter + openD / 2 + segD / 2 + 0.2, 1.0, segD + 0.4, wallH, 0.85);
      this.createDoorwayArchFrame(xWall, y, zCenter, openD, 4.8, 'X', trimCol);
    };

    // --- 1. MAIN CENTRAL SPINE TERRACES & WALLED STAIRCASES ---
    // Terrace 0 (Gatehouse Bailey, y = 0.0, z = 14..28, x = -11..11)
    this.createPlatformBlock(0, 0.0, 21, 22, 14, 5.0);
    this.createCrenellatedWall(0, 0.0, 28, 23, 1.0, 4.8, 0.95);
    this.createCrenellatedWall(-11, 0.0, 21, 1.0, 14.5, 4.2, 0.85);
    this.createCrenellatedWall(11, 0.0, 21, 1.0, 14.5, 4.2, 0.85);
    buildTerraceZParapet(0.0, 14, 22, 7.0, 3.8);

    // Staircase 0 -> 1 (z = 14..6, y = 0.0..4.0, w = 7.0) with solid stepped balustrades
    this.createStaircaseZ(0, 14, 6, 0.0, 4.0, 7.0, 14, true, 3.8);

    // Terrace 1 (Stage I Undercroft Courtyard, y = 4.0, z = -4..6, x = -12..12)
    this.createPlatformBlock(0, 4.0, 1, 24, 10, 8.0);
    buildTerraceZParapet(4.0, 6, 24, 7.0, 3.8);
    buildTerraceZParapet(4.0, -4, 24, 7.0, 3.8);
    this.createCrenellatedWall(12, 4.0, 1, 1.0, 10.6, 4.2, 0.85);
    // West wall has gateway to Side Path 1 (Sunken Watchtower)
    buildTerraceXGatewayWall(-12, 4.0, 1, 10, 5.2, 4.2, 0x44aaff);

    // Staircase 1 -> 2 (z = -4..-12, y = 4.0..8.5, w = 7.0)
    this.createStaircaseZ(0, -4, -12, 4.0, 8.5, 7.0, 14, true, 3.8);

    // Terrace 2 (Stage II Molten Forge Ramparts, y = 8.5, z = -22..-12, x = -12..12)
    this.createPlatformBlock(0, 8.5, -17, 24, 10, 12.0);
    buildTerraceZParapet(8.5, -12, 24, 7.0, 3.8);
    buildTerraceZParapet(8.5, -22, 24, 7.0, 3.8);
    // West wall has gateway receiving loop shortcut from West Watchtower!
    buildTerraceXGatewayWall(-12, 8.5, -17, 10, 5.2, 4.2, 0x44aaff);
    // East wall has gateway to Side Path 2 (Smelter's Crucible Overlook)
    buildTerraceXGatewayWall(12, 8.5, -17, 10, 5.2, 4.2, 0xff6622);

    // Staircase 2 -> 3 (z = -22..-30, y = 8.5..13.0, w = 7.0)
    this.createStaircaseZ(0, -22, -30, 8.5, 13.0, 7.0, 14, true, 3.8);

    // Terrace 3 (Stage III Alchemical Sanctum Terrace, y = 13.0, z = -40..-30, x = -12..12)
    this.createPlatformBlock(0, 13.0, -35, 24, 10, 16.0);
    buildTerraceZParapet(13.0, -30, 24, 7.0, 3.8);
    // West wall has gateway to Side Path 3 (Moonlit Apothecary Cloister)
    buildTerraceXGatewayWall(-12, 13.0, -35, 10, 5.2, 4.2, 0x33ff88);
    // East wall has gateway receiving loop shortcut from East Smelter's Overlook!
    buildTerraceXGatewayWall(12, 13.0, -35, 10, 5.2, 4.2, 0xff6622);

    // Enclosed Sky-Stone Courtyard between Terrace 3 (z = -40) and Terrace 4 (z = -50)
    // Sunken Astral Courtyard Floor at y = 12.2 so falling off sky-stones lands safely inside the walled courtyard!
    this.createPlatformBlock(0, 12.2, -45, 24, 11, 14.0);
    this.createCrenellatedWall(-12, 12.2, -45, 1.0, 11.0, 6.2, 0.9);
    this.createCrenellatedWall(12, 12.2, -45, 1.0, 11.0, 6.2, 0.9);
    this.createCrenellatedWall(-9.8, 13.0, -40, 4.8, 1.0, 4.0, 0.85);
    this.createCrenellatedWall(9.8, 13.0, -40, 4.8, 1.0, 4.0, 0.85);
    this.createCrenellatedWall(-9.8, 17.5, -50, 4.8, 1.0, 4.0, 0.85);
    this.createCrenellatedWall(9.8, 17.5, -50, 4.8, 1.0, 4.0, 0.85);
    // Solid retaining wall under Terrace 4 south edge (z = -50) so courtyard is cleanly walled
    this.createWall(2.5, 12.2, -50.1, 14.0, 0.9, 5.25, true, 0);

    // Left Staircase 3 -> 4 (x = -5.2, z = -40..-50, y = 13.0..17.5)
    this.createStaircaseZ(-5.2, -40, -50, 13.0, 17.5, 4.2, 14, true, 3.6);
    // Right Sky-Stone Jump Course + Courtyard Recovery Jump Pad
    this.createJumpPad(4.5, 13.0, -38.2, 12.6, 0x00ffcc);
    this.createJumpPad(1.5, 12.2, -45.0, 14.2, 0x00ffcc);
    this.createJumpPlatform(4.5, 14.5, -42.5, 3.5, 3.5, 0.75, 0x00eeff);
    this.createJumpPlatform(4.5, 16.0, -46.5, 3.5, 3.5, 0.75, 0x44ff88);
    this.createJumpPlatform(4.5, 17.5, -50.2, 3.8, 3.5, 0.75, 0xffaa00);

    // Terrace 4 (Stage IV Glacial Aqueduct Bastion, y = 17.5, z = -60..-50, x = -12..12)
    this.createPlatformBlock(0, 17.5, -55, 24, 10, 20.0);
    buildTerraceZParapet(17.5, -60, 24, 7.0, 3.8);
    this.createCrenellatedWall(-12, 17.5, -55, 1.0, 10.6, 4.2, 0.85);
    // East wall has gateway to Side Path 4 (Frostwind Campanile)
    buildTerraceXGatewayWall(12, 17.5, -55, 10, 5.2, 4.2, 0x00eeff);

    // Staircase 4 -> 5 (z = -60..-68, y = 17.5..22.0, w = 7.0)
    this.createStaircaseZ(0, -60, -68, 17.5, 22.0, 7.0, 14, true, 3.8);

    // Terrace 5 (Stage V High Spire Summit, y = 22.0, z = -80..-68, x = -12..12)
    this.createPlatformBlock(0, 22.0, -74, 24, 12, 24.0);
    buildTerraceZParapet(22.0, -68, 24, 7.0, 4.0);
    this.createCrenellatedWall(-12, 22.0, -74, 1.0, 12.6, 5.0, 0.95);
    // East wall of Terrace 5 has gateway receiving loop shortcut from Frostwind Campanile!
    buildTerraceXGatewayWall(12, 22.0, -74, 12, 5.2, 5.0, 0xaa55ff);
    this.createWall(0, 18.0, -80, 25, 1.2, 22.0, true, 14.0);

    // --- 2. FOUR DIVERSE OVERWORLD SIDE PATHS & FLANKING LOOP SHORTCUTS ---

    // [SIDE PATH 1 — WEST OF TERRACE 1]: "THE SUNKEN WATCHTOWER & CATACOMB GARDEN"
    // Bridge West from x = -12 to -18 at z = 1 (y: 4.0 -> 2.5)
    this.createStaircaseX(1, -12, -18, 4.0, 2.5, 5.2, 10, true, 3.8);
    // Courtyard at x = -32..-18 (center -25, w = 14), z = -7..9 (center 1, d = 16), y = 2.5
    this.createPlatformBlock(-25, 2.5, 1, 14, 16, 8.0);
    this.createCrenellatedWall(-25, 2.5, 9, 14.8, 1.0, 4.2, 0.85);
    this.createCrenellatedWall(-32, 2.5, 1, 1.0, 16.8, 4.2, 0.85);
    // East wall of courtyard (x = -18) flanking the bridge
    this.createCrenellatedWall(-18, 2.5, 6.3, 1.0, 5.4, 4.2, 0.85);
    this.createCrenellatedWall(-18, 2.5, -4.3, 1.0, 5.4, 4.2, 0.85);
    // North wall of courtyard (z = -7) has central opening (x = -25, w = 5.2) for North Shortcut Staircase!
    this.createCrenellatedWall(-29.8, 2.5, -7, 4.6, 1.0, 4.2, 0.85);
    this.createCrenellatedWall(-20.2, 2.5, -7, 4.6, 1.0, 4.2, 0.85);
    // North Shortcut Staircase from z = -7 to -14 at x = -25 (y: 2.5 -> 8.5)
    this.createStaircaseZ(-25, -7, -14, 2.5, 8.5, 5.2, 14, true, 3.8);
    // Upper West Landing at x = -28..-18 (center -23, w = 10), z = -20..-14 (center -17, d = 6), y = 8.5
    this.createPlatformBlock(-23, 8.5, -17, 10, 6, 10.0);
    this.createCrenellatedWall(-23, 8.5, -20, 10.6, 1.0, 4.0, 0.85);
    this.createCrenellatedWall(-28, 8.5, -17, 1.0, 6.6, 4.0, 0.85);
    this.createCrenellatedWall(-20.2, 8.5, -14, 4.6, 1.0, 4.0, 0.85);
    // Bridge East from x = -18 to -12 at z = -17 (y = 8.5) into Terrace 2!
    this.createStaircaseX(-17, -18, -12, 8.5, 8.5, 5.2, 6, true, 3.8);

    // Populate Side Path 1 (Crypt Sarcophagus Shrine, Crystals, Pickups, Room Light)
    this.createStoneSarcophagus(-25, 2.5, 1.5, 0, 0x00eeff);
    this.createColumn(-29, 2.5, 5.5, 0.6, 6.5);
    this.createColumn(-29, 2.5, -3.5, 0.6, 6.5);
    this.createDecorProp('brazier', -21.5, 2.5, 5.2, 1.0);
    this.createFacetedCrystal(-28.5, 2.5, 1.5, 0x00eeff);
    this.spawnSinglePickup('health', -25, 2.5, 6.2);
    this.spawnSinglePickup('mana', -23, 8.5, -17);
    this.createRoomLight(-25, 7.5, 1, 0x44aaff, 4.8, 26);

    // [SIDE PATH 2 — EAST OF TERRACE 2]: "THE SMELTER'S CRUCIBLE OVERLOOK"
    // Bridge East from x = 12 to 18 at z = -17 (y: 8.5 -> 10.0)
    this.createStaircaseX(-17, 12, 18, 8.5, 10.0, 5.2, 10, true, 3.8);
    // Crucible Overlook at x = 18..32 (center 25, w = 14), z = -25..-9 (center -17, d = 16), y = 10.0
    this.createPlatformBlock(25, 10.0, -17, 14, 16, 12.0);
    this.createCrenellatedWall(25, 10.0, -9, 14.8, 1.0, 4.2, 0.85);
    this.createCrenellatedWall(32, 10.0, -17, 1.0, 16.8, 4.2, 0.85);
    this.createCrenellatedWall(18, 10.0, -11.7, 1.0, 5.4, 4.2, 0.85);
    this.createCrenellatedWall(18, 10.0, -22.3, 1.0, 5.4, 4.2, 0.85);
    // North wall of Crucible (z = -25) has opening at x = 25 (w = 5.2) for North Shortcut Staircase to Terrace 3!
    this.createCrenellatedWall(20.2, 10.0, -25, 4.6, 1.0, 4.2, 0.85);
    this.createCrenellatedWall(29.8, 10.0, -25, 4.6, 1.0, 4.2, 0.85);
    this.createStaircaseZ(25, -25, -32, 10.0, 13.0, 5.2, 12, true, 3.8);
    // Upper East Landing at x = 18..28 (center 23, w = 10), z = -38..-32 (center -35, d = 6), y = 13.0
    this.createPlatformBlock(23, 13.0, -35, 10, 6, 14.0);
    this.createCrenellatedWall(23, 13.0, -38, 10.6, 1.0, 4.0, 0.85);
    this.createCrenellatedWall(28, 13.0, -35, 1.0, 6.6, 4.0, 0.85);
    this.createCrenellatedWall(20.2, 13.0, -32, 4.6, 1.0, 4.0, 0.85);
    this.createStaircaseX(-35, 18, 12, 13.0, 13.0, 5.2, 6, true, 3.8);

    // Populate Side Path 2 (Forge Furnace & Anvil, Lava Grate Canal, Fire Crystals)
    this.createForgeFurnaceAndAnvil(28.5, 10.0, -17, -Math.PI / 2);
    this.createLavaChannelWithGrate(23.5, 10.0, -17, 4.8, 2.4, 0xff4400);
    this.createDecorProp('brazier', 21.5, 10.0, -12.0, 1.05);
    this.createFacetedCrystal(25, 10.0, -11.5, 0xff6600);
    this.spawnSinglePickup('health', 23, 13.0, -35);
    this.spawnSinglePickup('mana', 21.5, 10.0, -21.5);
    this.createRoomLight(25, 15.0, -17, 0xff6622, 5.0, 26);

    // [SIDE PATH 3 — WEST OF TERRACE 3]: "THE MOONLIT APOTHECARY CLOISTER"
    // Bridge West from x = -12 to -18 at z = -35 (y: 13.0 -> 14.5)
    this.createStaircaseX(-35, -12, -18, 13.0, 14.5, 5.2, 10, true, 3.8);
    // Cloister Hall at x = -32..-18 (center -25, w = 14), z = -43..-27 (center -35, d = 16), y = 14.5
    this.createPlatformBlock(-25, 14.5, -35, 14, 16, 16.0);
    this.createCrenellatedWall(-25, 14.5, -27, 14.8, 1.0, 4.5, 0.85);
    this.createCrenellatedWall(-25, 14.5, -43, 14.8, 1.0, 4.5, 0.85);
    this.createCrenellatedWall(-32, 14.5, -35, 1.0, 16.8, 4.5, 0.85);
    this.createCrenellatedWall(-18, 14.5, -29.7, 1.0, 5.4, 4.5, 0.85);
    this.createCrenellatedWall(-18, 14.5, -40.3, 1.0, 5.4, 4.5, 0.85);

    // Populate Side Path 3 (Alchemical Vats, Arcane Floor Sigil, Bookshelves, Crystals)
    this.createArcaneFloorSigil(-25, 14.5, -35, 3.5, 0x33ff88);
    this.createAlchemicalVat(-28.5, 14.5, -31.0, 0x22ff88);
    this.createAlchemicalVat(-28.5, 14.5, -39.0, 0x00eeff);
    this.createDecorProp('bookshelf', -25, 14.5, -42.1, 1.05, 0);
    this.createFacetedCrystal(-25, 14.5, -35, 0x33ff88);
    this.spawnSinglePickup('health', -21.5, 14.5, -31.0);
    this.spawnSinglePickup('mana', -21.5, 14.5, -39.0);
    this.createRoomLight(-25, 19.5, -35, 0x33ff88, 5.0, 26);

    // [SIDE PATH 4 — EAST OF TERRACE 4]: "THE FROSTWIND CAMPANILE & ICE SHRINE"
    // Bridge East from x = 12 to 18 at z = -55 (y: 17.5 -> 19.0)
    this.createStaircaseX(-55, 12, 18, 17.5, 19.0, 5.2, 10, true, 3.8);
    // Frostwind Bastion at x = 18..32 (center 25, w = 14), z = -63..-47 (center -55, d = 16), y = 19.0
    this.createPlatformBlock(25, 19.0, -55, 14, 16, 20.0);
    this.createCrenellatedWall(25, 19.0, -47, 14.8, 1.0, 4.2, 0.85);
    this.createCrenellatedWall(32, 19.0, -55, 1.0, 16.8, 4.2, 0.85);
    this.createCrenellatedWall(18, 19.0, -49.7, 1.0, 5.4, 4.2, 0.85);
    this.createCrenellatedWall(18, 19.0, -60.3, 1.0, 5.4, 4.2, 0.85);
    // North wall (z = -63) has opening at x = 25 (w = 5.2) for Ascendant Bridge to Terrace 5 Summit!
    this.createCrenellatedWall(20.2, 19.0, -63, 4.6, 1.0, 4.2, 0.85);
    this.createCrenellatedWall(29.8, 19.0, -63, 4.6, 1.0, 4.2, 0.85);
    this.createStaircaseZ(25, -63, -71, 19.0, 22.0, 5.2, 12, true, 3.8);
    // Upper Summit East Landing at x = 18..28 (center 23, w = 10), z = -77..-71 (center -74, d = 6), y = 22.0
    this.createPlatformBlock(23, 22.0, -74, 10, 6, 22.0);
    this.createCrenellatedWall(23, 22.0, -77, 10.6, 1.0, 4.5, 0.85);
    this.createCrenellatedWall(28, 22.0, -74, 1.0, 6.6, 4.5, 0.85);
    this.createCrenellatedWall(20.2, 22.0, -71, 4.6, 1.0, 4.5, 0.85);
    this.createStaircaseX(-74, 18, 12, 22.0, 22.0, 5.2, 6, true, 4.0);

    // Populate Side Path 4 (Ice Spire Clusters, Aqueduct Arch, Astral Orrery, Crystals)
    this.createAqueductArch(25, 19.0, -55, 11.5, 6.8);
    this.createIceCrystalCluster(28.5, 19.0, -51.0, 1.15, 0x00eeff);
    this.createIceCrystalCluster(28.5, 19.0, -59.0, 1.15, 0x66ccff);
    this.createFacetedCrystal(25, 19.0, -55, 0x00eeff);
    this.spawnSinglePickup('health', 23, 22.0, -74);
    this.spawnSinglePickup('mana', 21.5, 19.0, -51.0);
    this.createRoomLight(25, 24.0, -55, 0x00eeff, 5.0, 26);

    // --- 3. MAIN SPINE PROPS, PORTALS, ARCHES & LIGHTS ---
    this.createJumpPlatform(-7.5, 5.4, 2.5, 3.2, 3.2, 0.7, 0x00eeff);
    this.createJumpPlatform(7.5, 9.9, -15.5, 3.2, 3.2, 0.7, 0xff8800);

    this.createDecorProp('brazier', -4.5, 0.0, 16.5, 1.0);
    this.createDecorProp('brazier', 4.5, 0.0, 16.5, 1.0);
    this.createDecorProp('banner', -6.5, 0.0, 27.3, 1.05, Math.PI);
    this.createDecorProp('banner', 6.5, 0.0, 27.3, 1.05, Math.PI);
    this.createAstralOrrery(-7.2, 22.0, -73.5, 0x00eeff);

    this.createColumn(-13, 0, 4, 2.6, 26);
    this.createColumn(13, 0, 4, 2.6, 26);
    this.createColumn(-13, 6, -17, 2.8, 30);
    this.createColumn(13, 6, -17, 2.8, 30);
    this.createColumn(-13, 12, -45, 3.0, 34);
    this.createColumn(13, 12, -45, 3.0, 34);
    this.createColumn(-12, 18, -76, 3.4, 38);
    this.createColumn(12, 18, -76, 3.4, 38);

    const glass1 = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 7.5), this.stainedGlassMaterial);
    glass1.position.set(0, 31.0, -79.2);
    this.stageGroup.add(glass1);

    [
      { y: 7.5, z: 10 },
      { y: 12.2, z: -8 },
      { y: 16.8, z: -26 },
      { y: 25.5, z: -64 }
    ].forEach((a) => {
      const arch = new THREE.Mesh(this.createTiledBoxGeometry(8.8, 1.4, 1.4, 3.0), this.activeWallMat);
      arch.position.set(0, a.y, a.z);
      this.stageGroup.add(arch);
    });

    this.createStagePortal(6.8, 4.0, 1.0, 'stage1', 'STAGE I: SUNKEN UNDERCROFT', 'Lower Keep (100m) [Walk In or Press E]', 0x44aaff);
    this.createStagePortal(-6.8, 8.5, -17.0, 'stage2', 'STAGE II: THE MOLTEN FORGE', 'Deep Foundry (250m) [Walk In or Press E]', 0xff5522);
    this.createStagePortal(6.8, 13.0, -35.0, 'stage3', 'STAGE III: ALCHEMICAL SANCTUM', 'Mid-Tower (450m) [Walk In or Press E]', 0x33ff88);
    this.createStagePortal(-6.8, 17.5, -55.0, 'stage4', 'STAGE IV: GLACIAL AQUEDUCT', 'Upper Keep (700m) [Walk In or Press E]', 0x00ddff);
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

    this.spawnSinglePickup('health', -7.5, 5.4, 2.5);
    this.spawnSinglePickup('mana', 7.5, 9.9, -15.5);
    this.spawnSinglePickup('health', 4.5, 16.0, -46.5);
    this.spawnSinglePickup('mana', 5.5, 17.5, -55.0);

    // Register all Main Terraces + 4 Side Courtyards & Connecting Bridges on Automap
    this.minimapRooms = [
      { x: -11, z: 14, rw: 22, rd: 14 },
      { x: -12, z: -4, rw: 24, rd: 10 },
      { x: -12, z: -22, rw: 24, rd: 10 },
      { x: -12, z: -40, rw: 24, rd: 10 },
      { x: -12, z: -50, rw: 24, rd: 10 },
      { x: -12, z: -60, rw: 24, rd: 10 },
      { x: -12, z: -80, rw: 24, rd: 12 },
      // 4 Branching Side Paths
      { x: -32, z: -7, rw: 14, rd: 16 },
      { x: -28, z: -20, rw: 10, rd: 6 },
      { x: 18, z: -25, rw: 14, rd: 16 },
      { x: 18, z: -38, rw: 10, rd: 6 },
      { x: -32, z: -43, rw: 14, rd: 16 },
      { x: 18, z: -63, rw: 14, rd: 16 },
      { x: 18, z: -77, rw: 10, rd: 6 }
    ];

    this.minimapCorridors = [
      { x: -3.5, z: 6, rw: 7, rd: 8 },
      { x: -3.5, z: -12, rw: 7, rd: 8 },
      { x: -3.5, z: -30, rw: 7, rd: 8 },
      { x: -3.5, z: -68, rw: 7, rd: 8 },
      // Side path bridges
      { x: -18, z: -1.6, rw: 6, rd: 5.2 },
      { x: -27.6, z: -14, rw: 5.2, rd: 7 },
      { x: -18, z: -19.6, rw: 6, rd: 5.2 },
      { x: 12, z: -19.6, rw: 6, rd: 5.2 },
      { x: 22.4, z: -32, rw: 5.2, rd: 7 },
      { x: 12, z: -37.6, rw: 6, rd: 5.2 },
      { x: -18, z: -37.6, rw: 6, rd: 5.2 },
      { x: 12, z: -57.6, rw: 6, rd: 5.2 },
      { x: 22.4, z: -71, rw: 5.2, rd: 8 },
      { x: 12, z: -76.6, rw: 6, rd: 5.2 }
    ];

    return {
      name: 'OVERWORLD: THE CASTLE ASCENT',
      elevation: 'Exterior Ramparts & Side Courtyards (0m to 1000m)',
      spawn: { x: 0, y: 0.0, z: 21.5, yaw: 0, pitch: 0.12 },
      enemies: [
        { type: 'gargoyle', x: -3.5, y: 4.0, z: 1.5 },
        { type: 'skeleton', x: -25.0, y: 2.5, z: -2.0 },
        { type: 'fire_imp', x: 3.5, y: 8.5, z: -17.0 },
        { type: 'fire_imp', x: 25.0, y: 10.0, z: -14.0 },
        { type: 'skeleton', x: -4.0, y: 13.0, z: -35.0 },
        { type: 'frost_wraith', x: -25.0, y: 14.5, z: -35.0 },
        { type: 'frost_wraith', x: 4.0, y: 17.5, z: -55.0 },
        { type: 'gargoyle', x: 25.0, y: 19.0, z: -55.0 },
        { type: 'dread_knight', x: 0.0, y: 22.0, z: -71.0 }
      ]
    };
  }

  // ============================================================================
  // STAGE 5: ASTRAL SPIRE SANCTUM (1000m — Pinnacle Boss Citadel + Side Reliquary Wings)
  // ============================================================================
  buildStage5HighSpire(seed = 100) {
    this.activeWallMat = this.wallMaterials.astral;
    this.activeFloorMat = this.floorMaterials.astral;
    this.ceilMaterial = this.ceilMaterials.sanctum;
    this.pillarMaterial = this.wallMaterials.astral;

    this.scene.background = new THREE.Color(0x0c0618);
    this.scene.fog = new THREE.FogExp2(0x0c0618, 0.013);

    const ambient = new THREE.AmbientLight(0x4a3672, 1.38);
    this.stageGroup.add(ambient);
    const hemi = new THREE.HemisphereLight(0xbb88ff, 0x221433, 1.08);
    this.stageGroup.add(hemi);
    const dirLight = new THREE.DirectionalLight(0xeedbff, 2.25);
    dirLight.position.set(16, 36, 22);
    this.stageGroup.add(dirLight);

    this.addMoonAndStars();

    // Central Citadel Nave (36x46) + Elevated North Boss Dais (20x18)
    this.createPlatformBlock(0, 0.0, -5, 36, 46, 5.0);
    this.createStaircaseZ(0, -4, -10, 0.0, 2.0, 8.0, 10);
    this.createPlatformBlock(0, 2.0, -19, 20, 18, 5.0, false);
    // Flank ledge colliders on West & East sides of the North Dais (leaving the central 8m staircase completely open)
    this.createInvisibleColliderBox(-7.1, 0.0, -19, 5.8, 1.85, 18.0);
    this.createInvisibleColliderBox(7.1, 0.0, -19, 5.8, 1.85, 18.0);

    // West & East Astral Reliquary Side Galleries (x = -30..-18 and x = 18..30, z = -12..4)
    this.createPlatformBlock(-24, 0.0, -4, 12, 16, 5.0);
    this.createPlatformBlock(24, 0.0, -4, 12, 16, 5.0);

    // Enclosing Crenellated Citadel Walls (with Side Wing Gateways at x = ±18, z = -4)
    this.createCrenellatedWall(0, 0.0, 18, 37, 1.0, 7.5, 1.0);
    this.createCrenellatedWall(0, 0.0, -28, 37, 1.2, 11.5, 1.0);

    // West Nave Wall split around Reliquary Gateway (z = -4, doorW = 6.0)
    this.createCrenellatedWall(-18, 0.0, 8.5, 1.0, 19.0, 7.5, 1.0);
    this.createCrenellatedWall(-18, 0.0, -17.5, 1.0, 21.0, 7.5, 1.0);
    this.createDoorwayArchFrame(-18, 0.0, -4.0, 6.0, 5.6, 'X', 0xbb55ff);
    // West Reliquary Wing Perimeter Walls
    this.createCrenellatedWall(-24, 0.0, 4.0, 12.8, 1.0, 7.2, 0.9);
    this.createCrenellatedWall(-24, 0.0, -12.0, 12.8, 1.0, 7.2, 0.9);
    this.createCrenellatedWall(-30, 0.0, -4.0, 1.0, 16.8, 7.2, 0.9);

    // East Nave Wall split around Reliquary Gateway (z = -4, doorW = 6.0)
    this.createCrenellatedWall(18, 0.0, 8.5, 1.0, 19.0, 7.5, 1.0);
    this.createCrenellatedWall(18, 0.0, -17.5, 1.0, 21.0, 7.5, 1.0);
    this.createDoorwayArchFrame(18, 0.0, -4.0, 6.0, 5.6, 'X', 0xbb55ff);
    // East Reliquary Wing Perimeter Walls
    this.createCrenellatedWall(24, 0.0, 4.0, 12.8, 1.0, 7.2, 0.9);
    this.createCrenellatedWall(24, 0.0, -12.0, 12.8, 1.0, 7.2, 0.9);
    this.createCrenellatedWall(30, 0.0, -4.0, 1.0, 16.8, 7.2, 0.9);

    // Populate West & East Reliquary Wings with Astral Orreries, Vats & Crystals
    this.createAstralOrrery(-24, 0.0, -4.0, 0x00eeff);
    this.createAstralOrrery(24, 0.0, -4.0, 0xdd44ff);
    this.createArcaneFloorSigil(-24, 0.0, -4.0, 3.6, 0x00eeff);
    this.createArcaneFloorSigil(24, 0.0, -4.0, 3.6, 0xdd44ff);
    this.createFacetedCrystal(-27, 0.0, 1.0, 0x00eeff);
    this.createFacetedCrystal(27, 0.0, 1.0, 0xaa55ff);
    this.spawnSinglePickup('health', -27, 0.0, -9.0);
    this.spawnSinglePickup('mana', 27, 0.0, -9.0);

    // Central Boss Arena Sigil & Jump Pads
    this.createArcaneFloorSigil(0, 0.0, 3.0, 5.2, 0xbb55ff);
    this.createArcaneFloorSigil(0, 2.0, -19.0, 4.8, 0xffd744);

    this.createJumpPad(-12.5, 0.0, 6.0, 13.0, 0x00ffcc);
    this.createJumpPad(12.5, 0.0, 6.0, 13.0, 0x00ffcc);

    this.createJumpPlatform(-12.5, 1.4, 1.0, 3.8, 3.8, 0.7, 0x00eeff);
    this.createJumpPlatform(-12.5, 2.8, -5.0, 3.8, 3.8, 0.7, 0xaa55ff);
    this.createJumpPlatform(-12.5, 4.0, -11.5, 4.2, 4.2, 0.7, 0xffdd44);

    this.createJumpPlatform(12.5, 1.4, 1.0, 3.8, 3.8, 0.7, 0x00eeff);
    this.createJumpPlatform(12.5, 2.8, -5.0, 3.8, 3.8, 0.7, 0xaa55ff);
    this.createJumpPlatform(12.5, 4.0, -11.5, 4.2, 4.2, 0.7, 0xffdd44);

    this.createDecorProp('brazier', -6.5, 0.0, 6.5, 1.1);
    this.createDecorProp('brazier', 6.5, 0.0, 6.5, 1.1);
    this.createDecorProp('skull_altar', -7.5, 2.0, -16.0, 1.1);
    this.createDecorProp('skull_altar', 7.5, 2.0, -16.0, 1.1);
    this.createDecorProp('bookshelf', -24.0, 0.0, -11.1, 1.0, 0);
    this.createDecorProp('bookshelf', 24.0, 0.0, -11.1, 1.0, 0);

    [-9.5, 9.5].forEach((x) => {
      [8, 0, -8, -18].forEach((z) => this.createColumn(x, 0, z, 0.7, 9.5));
    });

    const glassNorth = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 7.0), this.stainedGlassMaterial);
    glassNorth.position.set(0, 6.2, -27.2);
    this.stageGroup.add(glassNorth);

    this.createStagePortal(-13.5, 0.0, 14.5, 'overworld_4', 'RETURN TO SPIRE SUMMIT', 'Castle Exterior (1000m) [Walk In or Press E]', 0x8844ff);

    this.createRoomLight(0, 6.0, 6, 0x9944ff, 5.0, 30);
    this.createRoomLight(-18, 6.0, -4, 0x00eeff, 4.8, 28);
    this.createRoomLight(18, 6.0, -4, 0xff66ff, 4.8, 28);
    this.createRoomLight(0, 7.5, -20, 0x44eeff, 6.0, 32);

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
      { x: -10, z: -28, rw: 20, rd: 18 },
      { x: -30, z: -12, rw: 12, rd: 16 },
      { x: 18, z: -12, rw: 12, rd: 16 }
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
      const ts = this.torchSprites[i];
      const mesh = ts.mesh || ts;
      mesh.lookAt(player.camera.position.x, mesh.position.y, player.camera.position.z);
      if (ts.frames && ts.frames.length > 1) {
        const frameIdx = Math.floor(time * (ts.fps || 10) + (ts.seed || 0)) % ts.frames.length;
        if (mesh.material !== ts.frames[frameIdx]) {
          mesh.material = ts.frames[frameIdx];
        }
      }
    }

    for (let i = 0; i < this.animatedSprites.length; i++) {
      this.animatedSprites[i].update(delta, player.camera);
    }

    for (let i = 0; i < this.animatedMeshes.length; i++) {
      const am = this.animatedMeshes[i];
      if (am.rotSpeedY) am.mesh.rotation.y += delta * am.rotSpeedY;
      if (am.rotSpeedX) am.mesh.rotation.x += delta * am.rotSpeedX;
      if (am.bobAmp) am.mesh.position.y = am.baseY + Math.sin(time * 2.4 + am.seed) * am.bobAmp;
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
