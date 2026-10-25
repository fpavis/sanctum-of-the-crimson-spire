import * as THREE from 'three';

/**
 * CombatTelemetry: Zero-GPU-overhead DOM-projected 3D floating combat text,
 * elemental synergy banners, and spell combo multiplier tracking.
 * Projects 3D world coordinates to 2D screen CSS transforms at 120+ FPS.
 */
export class CombatTelemetry {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.popups = [];

    this.comboCount = 0;
    this.comboTimer = 0;
    this.maxComboTime = 4.5;
    this.lastSynergyText = '';
    this.synergyTimer = 0;

    // Create lightweight DOM overlay layer for floating text
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:15;overflow:hidden;';
    document.body.appendChild(this.overlay);

    this._projVec = new THREE.Vector3();
  }

  registerHit(isSynergy = false, synergyName = '') {
    this.comboCount++;
    this.comboTimer = this.maxComboTime;
    if (isSynergy && synergyName) {
      this.lastSynergyText = synergyName;
      this.synergyTimer = 2.2;
    }
  }

  /**
   * Displays a status/notice banner without incrementing the combat spell combo counter
   */
  showNotice(noticeText = '', duration = 2.0) {
    if (!noticeText) return;
    this.lastSynergyText = noticeText;
    this.synergyTimer = duration;
  }

  getComboMultiplier() {
    if (this.comboCount < 2) return 1.0;
    return Math.min(2.5, 1.0 + (this.comboCount - 1) * 0.15);
  }

  clearAll() {
    while (this.popups.length > 0) {
      const p = this.popups.pop();
      p.el.remove();
    }
  }

  spawnFloatingText(worldPos, text, color = '#ffcc33', scale = 1.0) {
    // Limit active popups to prevent DOM clutter
    if (this.popups.length > 18) {
      const oldest = this.popups.shift();
      oldest.el.remove();
    }

    const el = document.createElement('div');
    el.innerText = text;
    el.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      font-family: 'Cinzel', serif;
      font-weight: 900;
      font-size: ${Math.round(20 * scale)}px;
      color: ${color};
      text-shadow: 0 2px 4px #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
      white-space: nowrap;
      will-change: transform, opacity;
      pointer-events: none;
    `;
    this.overlay.appendChild(el);

    const pos = worldPos.clone();
    pos.x += (Math.random() - 0.5) * 0.5;
    pos.y += 0.3;

    this.popups.push({
      el,
      pos,
      velY: 1.6 + Math.random() * 0.5,
      life: 0.85,
      maxLife: 0.85
    });
  }

  update(delta) {
    if (this.comboTimer > 0) {
      this.comboTimer -= delta;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
      }
    }

    if (this.synergyTimer > 0) {
      this.synergyTimer -= delta;
    }

    const halfW = window.innerWidth * 0.5;
    const halfH = window.innerHeight * 0.5;

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= delta;
      if (p.life <= 0) {
        p.el.remove();
        this.popups.splice(i, 1);
        continue;
      }

      p.pos.y += p.velY * delta;
      p.velY *= 0.95;

      this._projVec.copy(p.pos).project(this.camera);

      // Hide if behind camera
      if (this._projVec.z > 1.0) {
        p.el.style.opacity = '0';
        continue;
      }

      const sx = (this._projVec.x * halfW) + halfW;
      const sy = -(this._projVec.y * halfH) + halfH;
      const alpha = Math.max(0, p.life / p.maxLife);

      p.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
      p.el.style.opacity = alpha.toFixed(2);
    }
  }
}
