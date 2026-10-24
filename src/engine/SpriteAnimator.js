import * as THREE from 'three';

/**
 * AnimatedBillboardSprite V2.6:
 * - High-performance 3D billboard sprite with multi-frame animation & state machine
 * - Pure White Hit-Flash Shader + Crisp White Impact Frame when enemy is hit
 * - Dedicated Lying-Down Dead Corpse state (`setDeadCorpse`)
 */
export class AnimatedBillboardSprite {
  constructor(baseTexture, config = {}) {
    this.config = {
      cols: 4,
      rows: 1,
      width: 2.0,
      height: 2.0,
      fps: 6,
      cylindrical: true,
      animations: {
        idle: [0],
        walk: [0, 1],
        attack: [2],
        hurt: [1],
        die: [3]
      },
      defaultAnim: 'idle',
      ...config
    };

    // Clone texture wrapper (shares underlying GPU image buffer without re-uploading!)
    this.texture = baseTexture.clone();
    this.texture.needsUpdate = true;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.cellInset = 0.015;
    this.texture.repeat.set(
      (1 - this.cellInset * 2) / this.config.cols,
      (1 - this.cellInset * 2) / this.config.rows
    );

    this.uniforms = {
      uHitFlash: { value: 0.0 }
    };

    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      alphaTest: 0.08,
      side: THREE.DoubleSide,
      depthWrite: true,
      color: 0xffffff
    });

    // Inject GPU White Hit-Flash so every opaque pixel of the enemy sprite turns pure #FFFFFF white when hit
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uHitFlash = this.uniforms.uHitFlash;
      shader.fragmentShader = `uniform float uHitFlash;\n` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphatest_fragment>',
        `#include <alphatest_fragment>
        if (uHitFlash > 0.01) {
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(10.0, 10.0, 10.0), uHitFlash);
        }`
      );
    };

    this.geometry = new THREE.PlaneGeometry(this.config.width, this.config.height);
    this.geometry.translate(0, this.config.height / 2, 0);

    this.mesh = new THREE.Mesh(this.geometry, this.material);

    this.currentAnim = this.config.defaultAnim;
    this.currentFrameIdx = 0;
    this.frameTimer = 0;
    this.isPlayingOneShot = false;
    this.oneShotCallback = null;
    this.isDead = false;

    this.flashTimer = 0;
    this.statusTint = 'none';

    this.setFrame(0);
  }

  setFrame(frameNumber) {
    const cols = this.config.cols;
    const rows = this.config.rows;
    const inset = this.cellInset || 0.015;

    const col = frameNumber % cols;
    const row = Math.floor(frameNumber / cols);

    const u = (col + inset) / cols;
    const v = (rows - 1 - row + inset) / rows;

    this.texture.offset.set(u, v);
  }

  triggerHitFlash(colorHex = 0xffffff, duration = 0.18) {
    if (this.isDead) return;
    this.flashTimer = duration;
    this.flashColor = colorHex;
    this.uniforms.uHitFlash.value = 0.96;
  }

  setStatusTint(status = 'none') {
    this.statusTint = status;
  }

  /**
   * Permanently transitions the enemy sprite into its lying-down dead corpse frame (Frame 3)
   */
  setDeadCorpse() {
    this.isDead = true;
    this.isPlayingOneShot = false;
    this.oneShotCallback = null;
    this.flashTimer = 0;
    this.uniforms.uHitFlash.value = 0.0;
    this.statusTint = 'dead';
    this.currentAnim = 'die';
    const dieFrames = this.config.animations.die || [3];
    this.setFrame(dieFrames[dieFrames.length - 1]);
    this.material.color.setHex(0x887777);
  }

  setAnimation(animName) {
    if (this.isPlayingOneShot || this.isDead) return;
    if (this.currentAnim === animName) return;
    if (!this.config.animations[animName]) return;

    this.currentAnim = animName;
    this.currentFrameIdx = 0;
    this.frameTimer = 0;
    const frames = this.config.animations[this.currentAnim];
    this.setFrame(frames[this.currentFrameIdx]);
  }

  playOneShot(animName, onComplete) {
    if (this.isDead) return;
    if (!this.config.animations[animName]) return;

    this.currentAnim = animName;
    this.currentFrameIdx = 0;
    this.frameTimer = 0;
    this.isPlayingOneShot = true;
    this.oneShotCallback = onComplete;

    const frames = this.config.animations[this.currentAnim];
    this.setFrame(frames[this.currentFrameIdx]);
  }

  update(delta, camera) {
    // 1. Billboard orientation
    if (camera) {
      if (this.config.cylindrical) {
        const eyePos = camera.position;
        const myPos = this.mesh.position;
        this.mesh.rotation.y = Math.atan2(eyePos.x - myPos.x, eyePos.z - myPos.z);
      } else {
        this.mesh.quaternion.copy(camera.quaternion);
      }
    }

    // 2. If dead corpse, keep locked on lying-down Frame 3
    if (this.isDead) {
      this.uniforms.uHitFlash.value = 0.0;
      this.material.color.setHex(0x887777);
      return;
    }

    // 3. White Hit Flash & Elemental Status Tinting
    if (this.flashTimer > 0) {
      this.flashTimer -= delta;
      this.uniforms.uHitFlash.value = 0.96;
      this.material.color.setRGB(8, 8, 8);
    } else {
      this.uniforms.uHitFlash.value = 0.0;
      if (this.statusTint === 'frozen') {
        this.material.color.setHex(0x44eeff);
      } else if (this.statusTint === 'burning') {
        this.material.color.setHex(0xff9944);
      } else if (this.statusTint === 'enraged') {
        this.material.color.setHex(0xff55ff);
      } else {
        this.material.color.setHex(0xffffff);
      }
    }

    // 4. Animation frame stepping
    const frames = this.config.animations[this.currentAnim];
    if (!frames || frames.length <= 1) return;

    this.frameTimer += delta;
    const frameInterval = 1 / this.config.fps;

    if (this.frameTimer >= frameInterval) {
      this.frameTimer -= frameInterval;
      this.currentFrameIdx++;

      if (this.currentFrameIdx >= frames.length) {
        if (this.isPlayingOneShot) {
          this.isPlayingOneShot = false;
          this.currentFrameIdx = frames.length - 1;
          if (this.oneShotCallback) {
            const cb = this.oneShotCallback;
            this.oneShotCallback = null;
            cb();
          }
        } else {
          this.currentFrameIdx = 0;
        }
      }

      this.setFrame(frames[this.currentFrameIdx]);
    }
  }

  setPosition(x, y, z) {
    this.mesh.position.set(x, y, z);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
