import * as THREE from 'three';

/**
 * ChromaKeyProcessor V2:
 * 1. Multi-pass HSL + Green-Differential Chroma Keyer & Edge De-spiller
 *    - Eliminates 100% of bright pink/magenta (#FF00FF) backgrounds AND removes
 *      purple JPEG compression halos around dark pixel-art outlines.
 * 2. Smart Sprite Atlas Normalizer & Auto-Centerer
 *    - Removes baked-in black grid lines and "FRAME X" text artifacts.
 *    - Extracts each animation frame's true pixel bounding box and centers it into
 *      uniform square 1:1 cells so 3D billboard planes never stretch or squash.
 * 3. Fast 512x512 Sobel Normal & Roughness PBR Map Generator.
 */
export class ChromaKeyProcessor {
  /**
   * Remove magenta (#FF00FF) background and de-spill purple JPEG fringes in-place on ImageData
   */
  static applyCleanChromaKey(imgData, stripFrameLabels = false, cols = 4, rows = 1, stripBorderLines = false) {
    const data = imgData.data;
    const width = imgData.width;
    const height = imgData.height;
    const isTransparent = new Uint8Array(width * height);

    const cellW = width / cols;
    const cellH = height / rows;

    // Pass 1: Detect magenta pixels and optional "FRAME X" label boxes / black grid dividers
    for (let y = 0; y < height; y++) {
      const localY = y % cellH;
      for (let x = 0; x < width; x++) {
        const localX = x % cellW;
        const idx = y * width + x;
        const i = idx * 4;

        // Strip "FRAME 1..16" label box in top-left of each cell if enabled (for magic_portal_vortex)
        if (stripFrameLabels && localX < cellW * 0.43 && localY < cellH * 0.13) {
          data[i + 3] = 0;
          isTransparent[idx] = 1;
          continue;
        }

        // Strip 5px border around cell edges ONLY when stripBorderLines is enabled (e.g. wizard_staff_cast, portal)
        if (stripBorderLines && (localX < 5 || localX > cellW - 6 || localY < 5 || localY > cellH - 6)) {
          const rEdge = data[i];
          const gEdge = data[i + 1];
          const bEdge = data[i + 2];
          if ((rEdge < 55 && gEdge < 55 && bEdge < 55) || (rEdge > 110 && bEdge > 110 && gEdge < 95)) {
            data[i + 3] = 0;
            isTransparent[idx] = 1;
            continue;
          }
        }

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Magenta dominance metric: high Red & Blue, low Green
        const rbMin = Math.min(r, b);
        const rbAvg = (r + b) * 0.5;
        const magentaExcess = rbAvg - g;
        const rbBalance = Math.abs(r - b);

        // Euclidean distance to pure #FF00FF
        const dr = r - 255;
        const dg = g;
        const db = b - 255;
        const distToPink = Math.sqrt(dr * dr + dg * dg + db * db);

        // Strong magenta background or JPEG-compressed magenta gradient
        if (
          distToPink < 135 ||
          (rbMin > 115 && g < 95 && magentaExcess > 65 && rbBalance < 75) ||
          (r > 165 && b > 155 && g < 115 && magentaExcess > 80)
        ) {
          data[i + 3] = 0;
          isTransparent[idx] = 1;
        }
      }
    }

    // Pass 2: Morphological cleanup — remove isolated 1px noise islands
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (!isTransparent[idx]) {
          const tCount =
            isTransparent[idx - 1] +
            isTransparent[idx + 1] +
            isTransparent[idx - width] +
            isTransparent[idx + width];
          if (tCount >= 3) {
            isTransparent[idx] = 1;
            data[idx * 4 + 3] = 0;
          }
        }
      }
    }

    // Pass 3: Wide 3-pixel radius Magenta De-spill on remaining opaque/edge pixels
    // Replaces any purple/magenta halo on dark outlines with natural dark charcoal/neutral tones
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        const idx = y * width + x;
        if (isTransparent[idx]) continue;

        // Check if within 2 pixels of a transparent pixel
        let nearEdge = false;
        for (let dy = -2; dy <= 2 && !nearEdge; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (isTransparent[(y + dy) * width + (x + dx)]) {
              nearEdge = true;
              break;
            }
          }
        }

        if (nearEdge) {
          const i = idx * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          // If edge pixel has magenta cast (R and B both significantly exceed G)
          if (r > g + 18 && b > g + 18) {
            const rbDiff = Math.abs(r - b);
            if (rbDiff < 65) {
              // Neutralize purple fringe to match green/luminance channel (dark outline)
              const neutral = Math.max(12, Math.floor(g * 0.9));
              data[i] = neutral;
              data[i + 1] = neutral;
              data[i + 2] = neutral;
              // Slightly feather outermost 1px fringe if it was heavily magenta
              if (r > 110 && b > 110 && g < 60) {
                data[i + 3] = 0;
              }
            }
          }
        }
      }
    }
  }

  /**
   * Load, chroma-key, de-spill, and normalize a spritesheet into uniform square cells
   * so sprites never stretch, bleed across frames, or show divider lines.
   */
  static async loadChromaKeyTexture(url, options = {}) {
    const {
      cols = 4,
      rows = 1,
      cellSize = 256,
      alignBottom = false,
      stripFrameLabels = false,
      stripBorderLines = false,
      contourStaffSleeve = false,
      orientDeathFrameHorizontal = false,
      customRegions = null, // Optional array of {x0, y0, x1, y1} in normalized 0..1 coords
      padding = 0.08
    } = options;

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = img.width;
        srcCanvas.height = img.height;
        const srcCtx = srcCanvas.getContext('2d');
        srcCtx.drawImage(img, 0, 0);

        const imgData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
        this.applyCleanChromaKey(imgData, stripFrameLabels, cols, rows, stripBorderLines);

        // If contourStaffSleeve is enabled, round off the flat vertical panel-cut on the lower-right sleeve
        // and add a dark pixel-art outline so the wizard's arm looks like a complete self-contained sprite!
        if (contourStaffSleeve) {
          const w = srcCanvas.width;
          const h = srcCanvas.height;
          const d = imgData.data;
          const cellW = w / cols;
          for (let c = 0; c < cols; c++) {
            const cellRight = Math.floor((c + 1) * cellW);
            for (let y = Math.floor(h * 0.72); y < h; y++) {
              // Progressively curve the sleeve inward toward the bottom so it forms a natural rounded cuff
              const t = (y - h * 0.72) / (h * 0.28); // 0 at top of cuff, 1 at bottom
              const curveCut = Math.floor(Math.pow(t, 1.4) * (cellW * 0.26)) + 6;
              const cutX = cellRight - curveCut;
              for (let x = cutX - 3; x < cellRight; x++) {
                const idx = (y * w + x) * 4;
                if (x >= cutX) {
                  d[idx + 3] = 0; // Transparent outside curved cuff
                } else if (d[idx + 3] > 0) {
                  // Crisp dark charcoal pixel-art border along the curved cuff edge
                  d[idx] = 22;
                  d[idx + 1] = 18;
                  d[idx + 2] = 16;
                }
              }
            }
            // Also add a clean dark pixel-art bottom cuff border along y = h - 8..h - 5
            for (let y = h - 8; y < h; y++) {
              for (let x = Math.floor(c * cellW); x < cellRight; x++) {
                const idx = (y * w + x) * 4;
                if (y >= h - 5) {
                  d[idx + 3] = 0;
                } else if (d[idx + 3] > 0) {
                  d[idx] = 22;
                  d[idx + 1] = 18;
                  d[idx + 2] = 16;
                }
              }
            }
          }
        }

        srcCtx.putImageData(imgData, 0, 0);

        // Create normalized output atlas with square (cellSize x cellSize) cells
        const outCanvas = document.createElement('canvas');
        outCanvas.width = cols * cellSize;
        outCanvas.height = rows * cellSize;
        const outCtx = outCanvas.getContext('2d');
        outCtx.imageSmoothingEnabled = false;

        const srcW = srcCanvas.width;
        const srcH = srcCanvas.height;
        const data = imgData.data;

        const totalFrames = cols * rows;
        for (let f = 0; f < totalFrames; f++) {
          const col = f % cols;
          const row = Math.floor(f / cols);

          let rx0, ry0, rx1, ry1;
          if (customRegions && customRegions[f]) {
            rx0 = Math.floor(customRegions[f].x0 * srcW);
            ry0 = Math.floor(customRegions[f].y0 * srcH);
            rx1 = Math.floor(customRegions[f].x1 * srcW);
            ry1 = Math.floor(customRegions[f].y1 * srcH);
          } else {
            rx0 = Math.floor((col / cols) * srcW) + 2;
            ry0 = Math.floor((row / rows) * srcH) + 2;
            rx1 = Math.floor(((col + 1) / cols) * srcW) - 2;
            ry1 = Math.floor(((row + 1) / rows) * srcH) - 2;
          }

          // Find tight bounding box of non-transparent pixels inside [rx0..rx1, ry0..ry1]
          let minX = rx1, minY = ry1, maxX = rx0, maxY = ry0;
          let foundPixels = false;

          for (let y = ry0; y < ry1; y++) {
            for (let x = rx0; x < rx1; x++) {
              const a = data[(y * srcW + x) * 4 + 3];
              if (a > 25) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                foundPixels = true;
              }
            }
          }

          if (!foundPixels) continue;

          const bw = Math.max(1, maxX - minX + 1);
          const bh = Math.max(1, maxY - minY + 1);

          const usableSize = cellSize * (1.0 - padding * 2);
          const destCellX = col * cellSize;
          const destCellY = row * cellSize;

          // Special Lying-Down Corpse Transformation for Frame 3 (die state) of enemies
          if (orientDeathFrameHorizontal && f === totalFrames - 1) {
            const groundY = destCellY + cellSize - Math.round(cellSize * 0.05);

            // 1. Draw dark crimson/ash pool on the ground beneath the fallen corpse
            outCtx.save();
            outCtx.fillStyle = 'rgba(32, 8, 12, 0.85)';
            outCtx.beginPath();
            outCtx.ellipse(destCellX + cellSize * 0.5, groundY - 6, cellSize * 0.42, 12, 0, 0, Math.PI * 2);
            outCtx.fill();
            outCtx.fillStyle = 'rgba(110, 14, 18, 0.82)';
            outCtx.beginPath();
            outCtx.ellipse(destCellX + cellSize * 0.5, groundY - 6, cellSize * 0.30, 7, 0, 0, Math.PI * 2);
            outCtx.fill();
            outCtx.restore();

            if (bh > bw * 0.82) {
              // Upright hurt frame -> rotate 90 degrees clockwise so enemy lies flat on its back/side!
              const corpseW = Math.round(usableSize * 0.94);
              const corpseH = Math.min(Math.round(cellSize * 0.42), Math.round(corpseW * (bw / bh) * 0.72));
              const cx = destCellX + cellSize * 0.5;
              const cy = groundY - corpseH * 0.48;

              outCtx.save();
              outCtx.translate(cx, cy);
              outCtx.rotate(Math.PI / 2);
              // In rotated space (+90 deg): local X is vertical (down), local Y is horizontal (left)
              outCtx.drawImage(
                srcCanvas,
                minX, minY, bw, bh,
                -corpseH * 0.5, -corpseW * 0.5, corpseH, corpseW
              );
              outCtx.restore();
            } else {
              // Already wider than tall (e.g. skeleton bone pile) -> flatten & rest along bottom ground line
              const corpseW = Math.round(usableSize * 0.92);
              const corpseH = Math.min(Math.round(cellSize * 0.36), Math.round(corpseW * (bh / bw) * 0.78));
              const offsetX = destCellX + Math.round((cellSize - corpseW) * 0.5);
              const offsetY = groundY - corpseH;
              outCtx.drawImage(
                srcCanvas,
                minX, minY, bw, bh,
                offsetX, offsetY, corpseW, corpseH
              );
            }
          } else {
            // Standard upright frame normalization
            const scale = Math.min(usableSize / bw, usableSize / bh);
            const drawW = Math.round(bw * scale);
            const drawH = Math.round(bh * scale);

            const offsetX = destCellX + Math.round((cellSize - drawW) * 0.5);
            const offsetY = alignBottom
              ? destCellY + cellSize - drawH - Math.round(cellSize * padding * 0.5)
              : destCellY + Math.round((cellSize - drawH) * 0.5);

            outCtx.drawImage(
              srcCanvas,
              minX, minY, bw, bh,
              offsetX, offsetY, drawW, drawH
            );
          }
        }

        const texture = new THREE.CanvasTexture(outCanvas);
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;

        resolve(texture);
      };
      img.onerror = (err) => reject(new Error(`Failed to load texture at ${url}: ${err}`));
      img.src = url;
    });
  }

  /**
   * Generates PBR map set (Albedo, Normal, Roughness) downsampled to 512x512 for high FPS
   */
  static async loadPBRTextureSet(url, pbrParams = {}) {
    const { normalStrength = 2.2, roughnessBase = 0.72, roughnessVar = 0.25, repeatX = 1, repeatY = 1 } = pbrParams;

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const width = Math.min(512, img.width);
        const height = Math.min(512, img.height);

        const albedoCanvas = document.createElement('canvas');
        albedoCanvas.width = width;
        albedoCanvas.height = height;
        const albedoCtx = albedoCanvas.getContext('2d');
        albedoCtx.drawImage(img, 0, 0, width, height);
        const albedoImgData = albedoCtx.getImageData(0, 0, width, height);
        const srcData = albedoImgData.data;

        const heightMap = new Float32Array(width * height);
        for (let i = 0; i < srcData.length; i += 4) {
          heightMap[i / 4] = (srcData[i] * 0.299 + srcData[i + 1] * 0.587 + srcData[i + 2] * 0.114) / 255.0;
        }

        const normalCanvas = document.createElement('canvas');
        normalCanvas.width = width;
        normalCanvas.height = height;
        const normalCtx = normalCanvas.getContext('2d');
        const normalImgData = normalCtx.createImageData(width, height);
        const normalData = normalImgData.data;

        const roughCanvas = document.createElement('canvas');
        roughCanvas.width = width;
        roughCanvas.height = height;
        const roughCtx = roughCanvas.getContext('2d');
        const roughImgData = roughCtx.createImageData(width, height);
        const roughData = roughImgData.data;

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const dataIdx = idx * 4;

            const x0 = (x - 1 + width) % width;
            const x1 = (x + 1) % width;
            const y0 = (y - 1 + height) % height;
            const y1 = (y + 1) % height;

            const tl = heightMap[y0 * width + x0];
            const t  = heightMap[y0 * width + x];
            const tr = heightMap[y0 * width + x1];
            const l  = heightMap[y * width + x0];
            const r  = heightMap[y * width + x1];
            const bl = heightMap[y1 * width + x0];
            const b  = heightMap[y1 * width + x];
            const br = heightMap[y1 * width + x1];

            const dx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
            const dy = (bl + 2.0 * b + br) - (tl + 2.0 * t + tr);

            let nx = -dx * normalStrength;
            let ny = -dy * normalStrength;
            let nz = 1.0;

            const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
            nx /= len;
            ny /= len;
            nz /= len;

            normalData[dataIdx]     = Math.floor((nx * 0.5 + 0.5) * 255);
            normalData[dataIdx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
            normalData[dataIdx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
            normalData[dataIdx + 3] = 255;

            const curH = heightMap[idx];
            const roughVal = Math.min(255, Math.max(0, Math.floor((roughnessBase + (1.0 - curH) * roughnessVar) * 255)));
            roughData[dataIdx]     = roughVal;
            roughData[dataIdx + 1] = roughVal;
            roughData[dataIdx + 2] = roughVal;
            roughData[dataIdx + 3] = 255;
          }
        }

        normalCtx.putImageData(normalImgData, 0, 0);
        roughCtx.putImageData(roughImgData, 0, 0);

        const setupTexture = (cv, isColor = false) => {
          const tex = new THREE.CanvasTexture(cv);
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          tex.repeat.set(repeatX, repeatY);
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.generateMipmaps = true;
          if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
          tex.needsUpdate = true;
          return tex;
        };

        resolve({
          albedo: setupTexture(albedoCanvas, true),
          normal: setupTexture(normalCanvas, false),
          roughness: setupTexture(roughCanvas, false)
        });
      };
      img.onerror = (err) => reject(new Error(`Failed to load PBR texture at ${url}: ${err}`));
      img.src = url;
    });
  }
}
