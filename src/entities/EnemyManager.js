import * as THREE from 'three';
import { Enemy } from './Enemy.js';

export class EnemyManager {
  constructor(scene, enemyTextures, spellSystem, telemetry) {
    this.scene = scene;
    this.enemyTextures = enemyTextures;
    this.spellSystem = spellSystem;
    this.telemetry = telemetry;
    this.enemies = [];
    this.aliveCount = 0;
    this.bossDefeated = false;
  }

  clearEnemies() {
    for (let i = 0; i < this.enemies.length; i++) {
      this.enemies[i].dispose();
    }
    this.enemies = [];
    this.aliveCount = 0;
  }

  spawnStageEnemies(enemySpawns = []) {
    this.clearEnemies();

    const texMap = {
      gargoyle: this.enemyTextures.gargoyle,
      skeleton: this.enemyTextures.skeleton,
      fire_imp: this.enemyTextures.fireImp,
      frost_wraith: this.enemyTextures.frostWraith,
      dread_knight: this.enemyTextures.dreadKnight,
      arcane_eye: this.enemyTextures.arcaneEye
    };

    enemySpawns.forEach((spawn) => {
      const tex = texMap[spawn.type] || this.enemyTextures.gargoyle;

      const enemy = new Enemy(
        this.scene,
        spawn.type,
        new THREE.Vector3(spawn.x, spawn.y || 0, spawn.z),
        tex,
        this.spellSystem,
        this.telemetry
      );

      this.enemies.push(enemy);
    });

    this.aliveCount = this.enemies.length;
  }

  update(delta, player, walls, level) {
    let aliveCount = 0;

    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      enemy.update(delta, player, walls, level);

      if (!enemy.isDead) {
        aliveCount++;
      } else if (enemy.type === 'arcane_eye' && !this.bossDefeated) {
        this.bossDefeated = true;
        player.score += 2500;
      }
    }

    this.aliveCount = aliveCount;
  }

  getAliveEnemies() {
    return this.enemies.filter(e => !e.isDead);
  }
}
