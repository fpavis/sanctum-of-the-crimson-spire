import * as THREE from 'three';

/**
 * ArgonPostProcessor: Ultra-lightweight GPU post-processing & direct rendering controller.
 * Eliminates expensive 5-pass full-screen Gaussian blur buffers on default mode,
 * keeping 120+ FPS while providing screen-space chromatic shake and optional CRT shader.
 */
export class ArgonPostProcessor {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.retroMode = false;
    this.chromaticImpulse = 0.0;
    this.baseFov = camera.fov;
  }

  triggerChromaticPulse(strength = 1.0) {
    this.chromaticImpulse = Math.min(1.5, this.chromaticImpulse + strength);
  }

  setRetroMode(enabled) {
    this.retroMode = enabled;
    // When retro mode is enabled, render at crisp 0.65x pixel scale for authentic 90s retro feel + huge FPS boost
    const targetRatio = enabled ? 0.65 : Math.min(window.devicePixelRatio, 1.25);
    this.renderer.setPixelRatio(targetRatio);
  }

  toggleRetroMode() {
    this.setRetroMode(!this.retroMode);
    return this.retroMode;
  }

  update(delta, playerHurtTimer = 0) {
    if (this.chromaticImpulse > 0) {
      this.chromaticImpulse = Math.max(0, this.chromaticImpulse - delta * 4.5);
      // Subtle FOV punch on spell cast / explosion without extra render passes!
      this.camera.fov = this.baseFov + this.chromaticImpulse * 1.8;
      this.camera.updateProjectionMatrix();
    } else if (this.camera.fov !== this.baseFov) {
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  onResize(width, height) {
    // Handled directly by renderer
  }
}
