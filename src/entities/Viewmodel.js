import * as THREE from 'three';

/**
 * Viewmodel V2: Renders the first-person animated wizard hands and magical staff
 * using 1:1 normalized square sprite cells so pixel art proportions are 100% authentic.
 * Features slower, deliberate breathing sway, walk bobbing, and spellcast recoil.
 */
export class Viewmodel {
  constructor(camera, handsTexture, staffTexture) {
    this.camera = camera;
    this.handsTexture = handsTexture.clone();
    this.handsTexture.needsUpdate = true;
    this.handsTexture.repeat.set(1 / 4, 1);

    this.staffTexture = staffTexture.clone();
    this.staffTexture.needsUpdate = true;
    this.staffTexture.repeat.set(1 / 4, 1);

    this.currentMode = 'hands';
    this.currentFrame = 0;
    this.isCasting = false;
    this.castTimer = 0;
    this.castDuration = 0.58; // Slower, deliberate spellcast cadence
    this.bobTimer = 0;

    this.container = new THREE.Group();
    this.camera.add(this.container);

    // 1. Hands Sprite Plane (100% unclipped above the spell bar)
    this.handsMaterial = new THREE.MeshBasicMaterial({
      map: this.handsTexture,
      transparent: true,
      alphaTest: 0.08,
      depthTest: false,
      depthWrite: false
    });
    this.handsGeometry = new THREE.PlaneGeometry(0.62, 0.62);
    this.handsMesh = new THREE.Mesh(this.handsGeometry, this.handsMaterial);
    this.handsMesh.position.set(0, -0.17, -0.85);
    this.handsMesh.renderOrder = 999;
    this.container.add(this.handsMesh);

    // 2. Staff Sprite Plane (100% unclipped with contoured sleeve cuff)
    this.staffMaterial = new THREE.MeshBasicMaterial({
      map: this.staffTexture,
      transparent: true,
      alphaTest: 0.08,
      depthTest: false,
      depthWrite: false
    });
    this.staffGeometry = new THREE.PlaneGeometry(0.74, 0.74);
    this.staffMesh = new THREE.Mesh(this.staffGeometry, this.staffMaterial);
    this.staffMesh.position.set(0.28, -0.14, -0.82);
    this.staffMesh.renderOrder = 999;
    this.staffMesh.visible = false;
    this.container.add(this.staffMesh);

    this.setHandsFrame(0);
    this.setStaffFrame(0);
  }

  setMode(mode = 'hands') {
    this.currentMode = mode;
    if (mode === 'hands') {
      this.handsMesh.visible = true;
      this.staffMesh.visible = false;
    } else {
      this.handsMesh.visible = false;
      this.staffMesh.visible = true;
    }
  }

  setHandsFrame(frame) {
    this.handsTexture.offset.set(frame / 4, 0);
  }

  setStaffFrame(frame) {
    this.staffTexture.offset.set(frame / 4, 0);
  }

  triggerCast(spellType = 'fireball') {
    this.isCasting = true;
    this.castTimer = 0;

    if (spellType === 'fireball' || spellType === 'aegis') {
      this.setMode('hands');
    } else {
      this.setMode('staff');
    }
  }

  update(delta, isMoving = false, speed = 1.0) {
    // Slower, weightier retro dungeon-crawler head/hand bob
    if (isMoving) {
      this.bobTimer += delta * 5.2 * speed;
    } else {
      this.bobTimer += delta * 1.4;
    }

    const bobX = Math.sin(this.bobTimer * 0.5) * (isMoving ? 0.018 : 0.004);
    const bobY = Math.abs(Math.sin(this.bobTimer)) * (isMoving ? 0.022 : 0.004);

    let recoilZ = 0;
    let recoilY = 0;

    if (this.isCasting) {
      this.castTimer += delta;
      const progress = this.castTimer / this.castDuration;

      if (progress < 0.25) {
        this.currentFrame = 1;
        recoilY = 0.015;
      } else if (progress < 0.65) {
        this.currentFrame = 2;
        recoilZ = 0.06;
        recoilY = 0.035;
      } else if (progress < 0.92) {
        this.currentFrame = 3;
        recoilZ = 0.03;
      } else {
        this.isCasting = false;
        this.currentFrame = 0;
      }
    } else {
      this.currentFrame = 0;
    }

    if (this.currentMode === 'hands') {
      this.setHandsFrame(this.currentFrame);
      this.handsMesh.position.set(bobX, -0.17 + bobY + recoilY, -0.85 + recoilZ);
    } else {
      this.setStaffFrame(this.currentFrame);
      this.staffMesh.position.set(0.28 + bobX, -0.14 + bobY + recoilY, -0.82 + recoilZ);
    }
  }
}
