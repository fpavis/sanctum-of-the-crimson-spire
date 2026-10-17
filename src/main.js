import * as THREE from 'three';
import { ChromaKeyProcessor } from './engine/ChromaKeyProcessor.js';
import { audioSynth } from './engine/AudioSynthesizer.js';
import { ArgonPostProcessor } from './engine/ArgonPostProcessor.js';
import { CombatTelemetry } from './engine/CombatTelemetry.js';
import { SpellSystem } from './entities/SpellSystem.js';
import { Player } from './entities/Player.js';
import { CastleLevel } from './world/CastleLevel.js';
import { EnemyManager } from './entities/EnemyManager.js';
import { HUD } from './ui/HUD.js';

// Base path differs on GitHub Pages (project subpath) vs. local dev
const BASE_URL = import.meta.env.BASE_URL;

class GameApp {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.loadingScreen = document.getElementById('loading-screen');
    this.loadingBar = document.getElementById('loading-bar');
    this.loadingText = document.getElementById('loading-text');
    this.btnStart = document.getElementById('btn-start');
    this.startGuide = document.getElementById('start-guide');

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.postProcessor = null;
    this.telemetry = null;
    this.lastTime = performance.now();

    this.textures = {};
    this.pbrTextures = {};
    this.spellIconsDataUrl = '';

    this.player = null;
    this.spellSystem = null;
    this.level = null;
    this.enemyManager = null;
    this.hud = null;
    this.transitionCooldown = 0;

    this.initThree();
    this.loadAllAssets();
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070a14);
    this.scene.fog = new THREE.FogExp2(0x070a14, 0.015);

    this.camera = new THREE.PerspectiveCamera(
      72,
      window.innerWidth / window.innerHeight,
      0.1,
      120
    );
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = false;
    this.container.appendChild(this.renderer.domElement);

    this.postProcessor = new ArgonPostProcessor(this.renderer, this.scene, this.camera);

    window.addEventListener('resize', () => this.onWindowResize());
  }

  async loadAllAssets() {
    const assetQueue = [
      // Chroma-keyed & 1:1 Square Normalized Spritesheets (Unclipped Weapon & Enemy Regions)
      {
        id: 'hands',
        type: 'chroma',
        url: BASE_URL + 'assets/wizard_hands_cast.jpg',
        options: {
          cols: 4,
          rows: 1,
          alignBottom: true,
          padding: 0.05,
          customRegions: [
            { x0: 0.025, y0: 0.22, x1: 0.258, y1: 0.715 },
            { x0: 0.268, y0: 0.22, x1: 0.495, y1: 0.715 },
            { x0: 0.502, y0: 0.22, x1: 0.735, y1: 0.715 },
            { x0: 0.740, y0: 0.22, x1: 0.975, y1: 0.715 }
          ]
        }
      },
      {
        id: 'staff',
        type: 'chroma',
        url: BASE_URL + 'assets/wizard_staff_cast.jpg',
        options: {
          cols: 4,
          rows: 1,
          alignBottom: true,
          stripBorderLines: true,
          contourStaffSleeve: true,
          padding: 0.04,
          customRegions: [
            { x0: 0.008, y0: 0.01, x1: 0.246, y1: 0.992 },
            { x0: 0.256, y0: 0.01, x1: 0.495, y1: 0.992 },
            { x0: 0.505, y0: 0.01, x1: 0.745, y1: 0.992 },
            { x0: 0.755, y0: 0.01, x1: 0.995, y1: 0.992 }
          ]
        }
      },
      {
        id: 'gargoyle',
        type: 'chroma',
        url: BASE_URL + 'assets/gargoyle_enemy.jpg',
        options: {
          cols: 4,
          rows: 1,
          alignBottom: true,
          orientDeathFrameHorizontal: true,
          padding: 0.04,
          customRegions: [
            { x0: 0.01, y0: 0.15, x1: 0.24, y1: 0.85 },
            { x0: 0.245, y0: 0.15, x1: 0.50, y1: 0.85 },
            { x0: 0.505, y0: 0.15, x1: 0.735, y1: 0.85 },
            { x0: 0.74, y0: 0.30, x1: 0.99, y1: 0.85 }
          ]
        }
      },
      {
        id: 'skeleton',
        type: 'chroma',
        url: BASE_URL + 'assets/skeleton_sorcerer.jpg',
        options: {
          cols: 4,
          rows: 1,
          alignBottom: true,
          orientDeathFrameHorizontal: true,
          padding: 0.04,
          customRegions: [
            { x0: 0.01, y0: 0.05, x1: 0.25, y1: 0.95 },
            { x0: 0.26, y0: 0.05, x1: 0.48, y1: 0.95 },
            { x0: 0.48, y0: 0.18, x1: 0.77, y1: 0.88 },
            { x0: 0.70, y0: 0.54, x1: 0.99, y1: 0.92 }
          ]
        }
      },
      {
        id: 'fireImp',
        type: 'chroma',
        url: BASE_URL + 'assets/fire_imp_enemy.jpg',
        options: {
          cols: 4,
          rows: 1,
          alignBottom: true,
          orientDeathFrameHorizontal: true,
          padding: 0.04,
          customRegions: [
            { x0: 0.02, y0: 0.24, x1: 0.22, y1: 0.72 },
            { x0: 0.24, y0: 0.24, x1: 0.44, y1: 0.72 },
            { x0: 0.47, y0: 0.24, x1: 0.76, y1: 0.72 },
            { x0: 0.76, y0: 0.24, x1: 0.98, y1: 0.72 }
          ]
        }
      },
      {
        id: 'frostWraith',
        type: 'chroma',
        url: BASE_URL + 'assets/frost_wraith_enemy.jpg',
        options: {
          cols: 4,
          rows: 1,
          alignBottom: true,
          orientDeathFrameHorizontal: true,
          padding: 0.04,
          customRegions: [
            { x0: 0.04, y0: 0.24, x1: 0.22, y1: 0.74 },
            { x0: 0.25, y0: 0.24, x1: 0.498, y1: 0.74 },
            { x0: 0.51, y0: 0.24, x1: 0.768, y1: 0.74 },
            { x0: 0.775, y0: 0.24, x1: 0.98, y1: 0.74 }
          ]
        }
      },
      {
        id: 'dreadKnight',
        type: 'chroma',
        url: BASE_URL + 'assets/dread_knight_enemy.jpg',
        options: {
          cols: 4,
          rows: 1,
          alignBottom: true,
          orientDeathFrameHorizontal: true,
          padding: 0.04,
          customRegions: [
            { x0: 0.03, y0: 0.16, x1: 0.245, y1: 0.74 },
            { x0: 0.25, y0: 0.22, x1: 0.525, y1: 0.74 },
            { x0: 0.53, y0: 0.22, x1: 0.798, y1: 0.74 },
            { x0: 0.805, y0: 0.22, x1: 0.985, y1: 0.74 }
          ]
        }
      },
      {
        id: 'arcaneEye',
        type: 'chroma',
        url: BASE_URL + 'assets/arcane_eye_enemy.jpg',
        options: {
          cols: 4,
          rows: 1,
          alignBottom: true,
          orientDeathFrameHorizontal: true,
          padding: 0.05,
          customRegions: [
            { x0: 0.01, y0: 0.15, x1: 0.25, y1: 0.82 },
            { x0: 0.255, y0: 0.15, x1: 0.485, y1: 0.82 },
            { x0: 0.485, y0: 0.15, x1: 0.745, y1: 0.82 },
            { x0: 0.735, y0: 0.15, x1: 0.99, y1: 0.82 }
          ]
        }
      },
      {
        id: 'props',
        type: 'chroma',
        url: BASE_URL + 'assets/pickups_and_props.jpg',
        options: { cols: 4, rows: 1, alignBottom: false, padding: 0.08 }
      },
      {
        id: 'decor',
        type: 'chroma',
        url: BASE_URL + 'assets/dungeon_decor_props.jpg',
        options: {
          cols: 4,
          rows: 1,
          alignBottom: true,
          padding: 0.02,
          customRegions: [
            { x0: 0.02, y0: 0.35, x1: 0.21, y1: 0.88 },
            { x0: 0.22, y0: 0.10, x1: 0.485, y1: 0.88 },
            { x0: 0.495, y0: 0.36, x1: 0.768, y1: 0.88 },
            { x0: 0.745, y0: 0.10, x1: 0.99, y1: 0.82 }
          ]
        }
      },
      {
        id: 'spellIcons',
        type: 'chroma',
        url: BASE_URL + 'assets/spell_icons_sheet.jpg',
        options: { cols: 4, rows: 1, alignBottom: false, padding: 0.04 }
      },
      {
        id: 'projectiles',
        type: 'chroma',
        url: BASE_URL + 'assets/spell_projectiles.jpg',
        options: { cols: 4, rows: 1, alignBottom: false, padding: 0.06 }
      },
      {
        id: 'cauldron',
        type: 'chroma',
        url: BASE_URL + 'assets/alchemy_cauldron.jpg',
        options: { cols: 2, rows: 2, alignBottom: true, padding: 0.04 }
      },
      {
        id: 'portal',
        type: 'chroma',
        url: BASE_URL + 'assets/magic_portal_vortex.jpg',
        options: { cols: 4, rows: 4, alignBottom: false, stripFrameLabels: true, stripBorderLines: true, padding: 0.05 }
      },

      // PBR Texture Sets (Including Diverse Biome Walls & Floors)
      { id: 'wall', type: 'pbr', url: BASE_URL + 'assets/castle_stone_wall.jpg', params: { normalStrength: 2.2, repeatX: 4, repeatY: 2 } },
      { id: 'lavaWall', type: 'pbr', url: BASE_URL + 'assets/biome_lava_wall.jpg', params: { normalStrength: 2.5, repeatX: 4, repeatY: 2 } },
      { id: 'iceWall', type: 'pbr', url: BASE_URL + 'assets/biome_ice_wall.jpg', params: { normalStrength: 2.2, repeatX: 4, repeatY: 2 } },
      { id: 'sanctumWall', type: 'pbr', url: BASE_URL + 'assets/biome_sanctum_wall.jpg', params: { normalStrength: 2.2, repeatX: 4, repeatY: 2 } },
      { id: 'floor', type: 'pbr', url: BASE_URL + 'assets/castle_floor_tiles.jpg', params: { normalStrength: 2.5, repeatX: 6, repeatY: 6 } },
      { id: 'door', type: 'pbr', url: BASE_URL + 'assets/castle_door_pbr.jpg', params: { normalStrength: 2.0, repeatX: 1, repeatY: 1 } },
      { id: 'stainedGlass', type: 'pbr', url: BASE_URL + 'assets/castle_stained_glass.jpg', params: { normalStrength: 1.0, repeatX: 1, repeatY: 1 } }
    ];

    let loadedCount = 0;
    const totalCount = assetQueue.length;

    for (const item of assetQueue) {
      try {
        if (item.type === 'chroma') {
          const tex = await ChromaKeyProcessor.loadChromaKeyTexture(item.url, item.options);
          this.textures[item.id] = tex;
        } else {
          const pbrSet = await ChromaKeyProcessor.loadPBRTextureSet(item.url, item.params);
          this.pbrTextures[item.id] = pbrSet;
        }
      } catch (e) {
        console.error(`Error loading asset ${item.id}:`, e);
      }

      loadedCount++;
      const pct = Math.floor((loadedCount / totalCount) * 100);
      this.loadingBar.style.width = `${pct}%`;
      this.loadingText.innerText = `Loading Sanctum Assets: ${pct}%`;
    }

    if (this.textures.spellIcons && this.textures.spellIcons.image) {
      this.spellIconsDataUrl = this.textures.spellIcons.image.toDataURL('image/png');
    }

    const barWrap = document.getElementById('loading-bar-wrap');
    if (barWrap) barWrap.classList.add('hidden');
    if (this.loadingText) this.loadingText.classList.add('hidden');
    this.btnStart.classList.remove('hidden');
    this.btnStart.addEventListener('click', () => this.startGame());
  }

  startGame() {
    audioSynth.init();
    this.loadingScreen.classList.add('hidden');
    this.startGuide.classList.remove('hidden');

    setTimeout(() => {
      this.startGuide.classList.add('hidden');
    }, 7500);

    this.telemetry = new CombatTelemetry(this.scene, this.camera);

    this.spellSystem = new SpellSystem(
      this.scene,
      this.camera,
      this.textures.projectiles,
      this.telemetry,
      this.postProcessor
    );

    this.player = new Player(
      this.camera,
      this.scene,
      this.renderer.domElement,
      { hands: this.textures.hands, staff: this.textures.staff },
      this.spellSystem
    );

    this.level = new CastleLevel(
      this.scene,
      this.pbrTextures,
      {
        props: this.textures.props,
        decor: this.textures.decor,
        cauldron: this.textures.cauldron,
        portal: this.textures.portal
      },
      this.telemetry
    );

    this.enemyManager = new EnemyManager(
      this.scene,
      {
        gargoyle: this.textures.gargoyle,
        skeleton: this.textures.skeleton,
        fireImp: this.textures.fireImp,
        frostWraith: this.textures.frostWraith,
        dreadKnight: this.textures.dreadKnight,
        arcaneEye: this.textures.arcaneEye
      },
      this.spellSystem,
      this.telemetry
    );

    this.player.setCombatReferences(this.enemyManager, this.level);

    // Handle portal walk-in and [E] key interaction
    this.level.onPortalEnter = (targetStageId) => this.switchStage(targetStageId);
    this.player.onInteractCallback = () => {
      if (this.level.nearestPortal) {
        this.switchStage(this.level.nearestPortal.targetStageId);
        return true;
      }
      return false;
    };

    this.hud = new HUD(
      this.player,
      this.enemyManager,
      this.level,
      this.telemetry,
      this.postProcessor,
      (stageId) => this.switchStage(stageId),
      this.spellIconsDataUrl,
      () => this.rerollCurrentStage()
    );

    // Start in the 3D Overworld Castle Ascent
    this.switchStage('overworld');

    this.renderer.domElement.requestPointerLock();
    this.lastTime = performance.now();
    this.animate();
  }

  rerollCurrentStage() {
    if (!this.level) return;
    this.level.proceduralSeed += 1;
    const current = this.level.currentStageId === 'overworld' ? 'stage1' : this.level.currentStageId;
    this.transitionCooldown = 0;
    this.switchStage(current);
  }

  switchStage(targetStageId) {
    if (this.transitionCooldown > 0) return;
    this.transitionCooldown = 0.65;

    audioSynth.playAegisCast();
    if (this.postProcessor) this.postProcessor.triggerChromaticPulse(1.0);
    if (this.spellSystem) this.spellSystem.clearAll();
    if (this.telemetry) this.telemetry.clearAll();

    let actualStageId = targetStageId;
    let customSpawn = null;

    if (targetStageId === 'overworld_1') {
      actualStageId = 'overworld';
      customSpawn = { x: 0, y: 4.0, z: 0.5, yaw: 0, pitch: 0.12 };
    } else if (targetStageId === 'overworld_2') {
      actualStageId = 'overworld';
      customSpawn = { x: 0, y: 8.5, z: -17.5, yaw: 0, pitch: 0.12 };
    } else if (targetStageId === 'overworld_3') {
      actualStageId = 'overworld';
      customSpawn = { x: 0, y: 13.0, z: -35.5, yaw: 0, pitch: 0.12 };
    } else if (targetStageId === 'overworld_4') {
      actualStageId = 'overworld';
      customSpawn = { x: 0, y: 17.5, z: -55.5, yaw: 0, pitch: 0.10 };
    }

    const stageData = this.level.loadStage(actualStageId);
    const sp = customSpawn || stageData.spawn;

    this.player.setSpawn(sp.x, sp.y, sp.z, sp.yaw || 0, sp.pitch || 0);
    this.enemyManager.spawnStageEnemies(stageData.enemies);

    if (this.hud) {
      this.hud.setStageInfo(actualStageId, stageData.name);
    }

    if (this.telemetry) {
      const forward = new THREE.Vector3(0, 0, -3.5).applyQuaternion(this.camera.quaternion);
      this.telemetry.spawnFloatingText(
        this.player.position.clone().add(forward),
        stageData.name,
        '#ffd766',
        1.25
      );
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const now = performance.now();
    const delta = Math.min((now - this.lastTime) * 0.001, 0.1);
    this.lastTime = now;

    if (this.transitionCooldown > 0) {
      this.transitionCooldown = Math.max(0, this.transitionCooldown - delta);
    }

    if (this.player) {
      this.player.update(delta, this.level.walls, this.level.doors);
      this.enemyManager.update(delta, this.player, this.level.walls, this.level);
      this.spellSystem.update(
        delta,
        this.player,
        this.enemyManager.getAliveEnemies(),
        this.level.walls,
        this.level.destructibles
      );
      this.level.update(delta, this.player);
      this.telemetry.update(delta);
      this.postProcessor.update(delta, this.player.hurtTimer);
      this.hud.update();
    }

    this.postProcessor.render();
  }

  onWindowResize() {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.postProcessor) {
      this.postProcessor.onResize(window.innerWidth, window.innerHeight);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.gameApp = new GameApp();
});
