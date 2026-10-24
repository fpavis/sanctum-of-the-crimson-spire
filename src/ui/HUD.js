import { audioSynth } from '../engine/AudioSynthesizer.js';

/**
 * HUD V3 (Sanctum of the Crimson Spire):
 * Renders the ornate pixel-art gothic stone & gold HUD console,
 * Chroma-keyed generated Spell Icons, Health & Mana Orbs,
 * Arcane Level & Experience Progress Bar (+1% per level automatic boost),
 * Level-Up Popup Banner, Procedural Graph Automap Radar, and Stage Navigator.
 * Zero emojis across all text elements.
 */
export class HUD {
  constructor(player, enemyManager, level, telemetry, postProcessor, onStageSelect, spellIconsDataUrl = '', onRerollStage = null) {
    this.player = player;
    this.enemyManager = enemyManager;
    this.level = level;
    this.telemetry = telemetry;
    this.postProcessor = postProcessor;
    this.onStageSelect = onStageSelect;
    this.spellIconsDataUrl = spellIconsDataUrl;
    this.onRerollStage = onRerollStage;

    this.crtEnabled = false;
    this.stageTitle = 'OVERWORLD: THE CASTLE ASCENT';
    this.createDomElements();
  }

  setStageInfo(stageId, title) {
    this.stageTitle = title;
    if (this.dom && this.dom.stageTitle) {
      this.dom.stageTitle.innerText = title;
    }
    if (this.dom && this.dom.stageBtns) {
      this.dom.stageBtns.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-stage') === stageId);
      });
    }
  }

  createDomElements() {
    this.container = document.createElement('div');
    this.container.id = 'hud-root';
    this.container.className = 'hud-container';
    document.body.appendChild(this.container);

    // Ornate Viewport Corner Arch Frame Overlay
    this.viewportArch = document.createElement('div');
    this.viewportArch.className = 'viewport-gothic-arch';
    this.viewportArch.innerHTML = `
      <div class="arch-corner arch-tl"></div>
      <div class="arch-corner arch-tr"></div>
      <div class="arch-corner arch-bl"></div>
      <div class="arch-corner arch-br"></div>
    `;
    this.container.appendChild(this.viewportArch);

    this.damageOverlay = document.createElement('div');
    this.damageOverlay.className = 'damage-overlay';
    this.container.appendChild(this.damageOverlay);

    this.crtOverlay = document.createElement('div');
    this.crtOverlay.className = 'crt-scanlines hidden';
    this.container.appendChild(this.crtOverlay);

    this.crosshair = document.createElement('div');
    this.crosshair.className = 'hud-crosshair';
    this.crosshair.innerHTML = `
      <div class="crosshair-dot"></div>
      <div class="crosshair-line top"></div>
      <div class="crosshair-line bottom"></div>
      <div class="crosshair-line left"></div>
      <div class="crosshair-line right"></div>
    `;
    this.container.appendChild(this.crosshair);

    // Level-Up Popup Banner (Behind-the-Scenes +1% Stat Boost Notification)
    this.levelUpPopup = document.createElement('div');
    this.levelUpPopup.id = 'levelup-popup';
    this.levelUpPopup.className = 'levelup-popup hidden';
    this.levelUpPopup.innerHTML = `
      <div class="levelup-crest">ASCENSION</div>
      <div class="levelup-title" id="levelup-title">ARCANE LEVEL 2 ATTAINED!</div>
      <div class="levelup-subtitle" id="levelup-subtitle">+1% Spell Damage, Max Health & Max Mana (Total: +1%)</div>
    `;
    this.container.appendChild(this.levelUpPopup);

    // Portal Proximity Prompt Banner
    this.portalPrompt = document.createElement('div');
    this.portalPrompt.className = 'portal-prompt hidden';
    this.container.appendChild(this.portalPrompt);

    // Top Left Objectives, Elevation, Procedural Seed, Combo & Synergy Panel
    this.topPanel = document.createElement('div');
    this.topPanel.className = 'top-panel';
    this.topPanel.innerHTML = `
      <div class="quest-box gothic-plate">
        <div class="plate-rivet tl"></div>
        <div class="plate-rivet tr"></div>
        <div class="plate-rivet bl"></div>
        <div class="plate-rivet br"></div>
        <div class="quest-title">
          <span id="hud-stage-title">OVERWORLD: THE CASTLE ASCENT</span>
          <span class="argon-badge">V3</span>
        </div>
        <div class="quest-item" id="obj-elevation">[ALTITUDE] Castle Elevation: 20m</div>
        <div class="quest-item" id="obj-grimoire">[CODEX] Elder Grimoires: 0 / 4</div>
        <div class="quest-item" id="obj-enemies">[HOSTILES] Stage Enemies: 5 Remaining</div>
        <div class="quest-item" id="obj-graph">[GRAPH] Nodes: 7 Rooms | LOS Raycast Active</div>
      </div>
      <div class="score-box" id="score-display">SCORE: 0</div>
      <div class="combo-box hidden" id="combo-display">2x SPELL COMBO (1.15x DMG)</div>
      <div class="synergy-banner hidden" id="synergy-display">THERMAL SHOCK SHATTER!</div>
    `;
    this.container.appendChild(this.topPanel);

    // Top-Center Stage Travel Bar + Procedural Graph Reroll Button
    this.stageNavBar = document.createElement('div');
    this.stageNavBar.className = 'stage-nav-bar gothic-plate';
    this.stageNavBar.innerHTML = `
      <button class="stage-nav-btn active" data-stage="overworld" title="Castle Exterior Stairway (0m-1000m)">ASCENT</button>
      <button class="stage-nav-btn" data-stage="stage1" title="Stage I: Sunken Undercroft (100m)">I. CRYPT</button>
      <button class="stage-nav-btn" data-stage="stage2" title="Stage II: Molten Forge (250m)">II. FORGE</button>
      <button class="stage-nav-btn" data-stage="stage3" title="Stage III: Alchemical Sanctum (450m)">III. SANCTUM</button>
      <button class="stage-nav-btn" data-stage="stage4" title="Stage IV: Glacial Aqueduct (700m)">IV. GLACIER</button>
      <button class="stage-nav-btn" data-stage="stage5" title="Stage V: Astral Spire Boss (1000m)">V. SPIRE</button>
      <button class="stage-reroll-btn" id="btn-reroll-map" title="Generate a New Procedural Graph Layout for Current Stage">REROLL MAP</button>
    `;
    this.container.appendChild(this.stageNavBar);

    this.stageNavBar.querySelectorAll('.stage-nav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const stg = btn.getAttribute('data-stage');
        if (this.onStageSelect) this.onStageSelect(stg);
      });
    });

    const rerollBtn = this.stageNavBar.querySelector('#btn-reroll-map');
    if (rerollBtn) {
      rerollBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onRerollStage) this.onRerollStage();
      });
    }

    // Tactical Minimap Radar (With Graph Edges & Room Archetypes)
    this.minimapWrap = document.createElement('div');
    this.minimapWrap.className = 'minimap-wrap gothic-plate';
    this.minimapWrap.innerHTML = `
      <div class="minimap-header">ASTRAL GRAPH AUTOMAP</div>
      <canvas id="minimap-canvas" width="168" height="168"></canvas>
    `;
    this.container.appendChild(this.minimapWrap);
    this.minimapCanvas = this.minimapWrap.querySelector('#minimap-canvas');
    this.minimapCtx = this.minimapCanvas.getContext('2d');

    // Boss Health Bar (3-Phase Arch-Beholder Void Eye)
    this.bossBarContainer = document.createElement('div');
    this.bossBarContainer.className = 'boss-bar-container hidden';
    this.bossBarContainer.innerHTML = `
      <div class="boss-title" id="boss-title-text">ARCH-BEHOLDER VOID EYE</div>
      <div class="boss-bar-track">
        <div class="boss-bar-fill" id="boss-bar-fill"></div>
      </div>
    `;
    this.container.appendChild(this.bossBarContainer);

    // Bottom Sprite-Styled Gothic Stone & Gold HUD Console
    this.bottomBar = document.createElement('div');
    this.bottomBar.className = 'bottom-bar gothic-hud-console';
    this.bottomBar.innerHTML = `
      <div class="console-pillar left-pillar"></div>

      <div class="orb-container health-orb-container">
        <div class="orb-glow health-glow"></div>
        <div class="orb health-orb">
          <div class="orb-liquid health-liquid" id="health-liquid"></div>
          <div class="orb-shine"></div>
        </div>
        <div class="orb-text" id="health-text">100</div>
        <div class="orb-label">VITALITY</div>
      </div>

      <div class="console-center-deck">
        <div class="xp-progression-strip">
          <div class="xp-header-row">
            <span class="xp-level-badge" id="hud-level-badge">ARCANE LVL 1</span>
            <span class="xp-stat-bonus" id="hud-stat-bonus">+0% ALL STATS</span>
            <span class="xp-counter-text" id="hud-xp-text">XP: 0 / 100</span>
          </div>
          <div class="xp-bar-track">
            <div class="xp-bar-fill" id="hud-xp-fill"></div>
          </div>
        </div>

        <div class="spell-bar">
          <div class="spell-slot active" id="slot-0" data-idx="0" title="Left-Click (LMB): Cast Pyrobomb">
            <div class="spell-key">LMB</div>
            <div class="spell-icon-gfx icon-pyro" id="icon-gfx-0"></div>
            <div class="spell-name">Pyrobomb</div>
            <div class="spell-cost">15 MP</div>
            <div class="cooldown-overlay" id="cd-0"></div>
          </div>
          <div class="spell-slot locked" id="slot-1" data-idx="1" title="Right-Click (RMB): Cast Frost Lance">
            <div class="spell-key">RMB</div>
            <div class="spell-icon-gfx icon-frost" id="icon-gfx-1"></div>
            <div class="spell-name">Frost Lance</div>
            <div class="spell-cost">12 MP</div>
            <div class="spell-lock-badge">GRIMOIRE I</div>
            <div class="cooldown-overlay" id="cd-1"></div>
          </div>
          <div class="spell-slot mobility-slot locked" id="slot-dash" title="Shift in Air or Double-Press Shift on Ground: Aether Jump Dash (Unlocked in Stage II Grimoire or Cheat 5555)">
            <div class="spell-key">SHIFT</div>
            <div class="spell-icon-dash" id="icon-gfx-dash"></div>
            <div class="spell-name">Jump Dash</div>
            <div class="spell-cost">MOBILITY</div>
            <div class="spell-lock-badge">GRIMOIRE II</div>
            <div class="cooldown-overlay" id="cd-dash"></div>
          </div>
          <div class="spell-slot locked" id="slot-2" data-idx="2" title="Middle-Click (MMB): Cast Arcane Arc">
            <div class="spell-key">MMB</div>
            <div class="spell-icon-gfx icon-arcane" id="icon-gfx-2"></div>
            <div class="spell-name">Arcane Arc</div>
            <div class="spell-cost">22 MP</div>
            <div class="spell-lock-badge">GRIMOIRE III</div>
            <div class="cooldown-overlay" id="cd-2"></div>
          </div>
          <div class="spell-slot locked" id="slot-3" data-idx="3" title="Left + Right Click Together (L+R): Cast Aegis Ward">
            <div class="spell-key">L+R</div>
            <div class="spell-icon-gfx icon-aegis" id="icon-gfx-3"></div>
            <div class="spell-name">Aegis Ward</div>
            <div class="spell-cost">28 MP</div>
            <div class="spell-lock-badge">GRIMOIRE IV</div>
            <div class="cooldown-overlay" id="cd-3"></div>
          </div>
        </div>
      </div>

      <div class="orb-container mana-orb-container">
        <div class="orb-glow mana-glow"></div>
        <div class="orb mana-orb">
          <div class="orb-liquid mana-liquid" id="mana-liquid"></div>
          <div class="orb-shine"></div>
        </div>
        <div class="orb-text" id="mana-text">100</div>
        <div class="orb-label">AETHER</div>
      </div>

      <div class="console-pillar right-pillar"></div>
    `;
    this.container.appendChild(this.bottomBar);

    // Apply generated pixel-art spell icons sheet if loaded
    if (this.spellIconsDataUrl) {
      for (let i = 0; i < 4; i++) {
        const gfxEl = this.bottomBar.querySelector(`#icon-gfx-${i}`);
        if (gfxEl) {
          gfxEl.style.backgroundImage = `url('${this.spellIconsDataUrl}')`;
        }
      }
    }

    this.bottomBar.querySelectorAll('.spell-slot[data-idx]').forEach(slot => {
      slot.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(slot.getAttribute('data-idx'));
        this.player.castSpellByIndex(idx);
      });
    });

    const dashSlot = this.bottomBar.querySelector('#slot-dash');
    if (dashSlot) {
      dashSlot.addEventListener('click', (e) => {
        e.stopPropagation();
        this.player.triggerJumpDash();
      });
    }

    this.controlsBar = document.createElement('div');
    this.controlsBar.className = 'top-controls-bar';
    this.controlsBar.innerHTML = `
      <button class="hud-btn" id="btn-crt" title="Toggle Retro Pixel + CRT Mode">[SHADER: CRISP]</button>
      <button class="hud-btn" id="btn-sound" title="Toggle Audio Mute">[AUDIO: ON]</button>
      <button class="hud-btn" id="btn-help" title="Show Controls & Spell Synergies">[CODEX]</button>
    `;
    this.container.appendChild(this.controlsBar);

    this.debugDashBtn = document.createElement('button');
    this.debugDashBtn.id = 'btn-debug-dash';
    this.debugDashBtn.className = 'hud-btn debug-dash-btn';
    this.debugDashBtn.title = 'Input Cheat Code 5555 or Click to Enable Jump Dash for Testing';
    this.debugDashBtn.innerText = '[DEBUG DASH: 5555]';
    this.container.appendChild(this.debugDashBtn);

    this.helpModal = document.createElement('div');
    this.helpModal.className = 'modal-dialog hidden';
    this.helpModal.innerHTML = `
      <div class="modal-content gothic-plate">
        <h2>SANCTUM OF THE CRIMSON SPIRE — CODEX</h2>
        <div class="controls-grid">
          <div class="control-row"><span>Left / Right / Middle Click:</span> <b>Pyrobomb (LMB) / Frost Lance (RMB) / Arcane Arc (MMB)</b></div>
          <div class="control-row"><span>Left + Right Click Together:</span> <b>Aegis Ward (L+R) / Double Cast: Repulsion Nova</b></div>
          <div class="control-row"><span>Shift (In Air) / 2x Shift (Ground):</span> <b>Aether Jump Dash (Stage II Grimoire / 5555)</b></div>
          <div class="control-row"><span>Walk into Portal / [E]:</span> <b>Enter Stage or Return to Ascent</b></div>
          <div class="control-row"><span>Arcane Experience:</span> <b>+1% Spell DMG, Max HP & Mana per Level</b></div>
          <div class="control-row"><span>RMB (Frost) -> LMB (Pyro):</span> <b>Thermal Shock Shatter (2.2x DMG)</b></div>
          <div class="control-row"><span>RMB (Frost) -> MMB (Arcane):</span> <b>Superconduct Chain Lightning</b></div>
        </div>
        <button class="modal-close-btn" id="btn-close-help">RETURN TO SANCTUM</button>
      </div>
    `;
    this.container.appendChild(this.helpModal);

    this.victoryModal = document.createElement('div');
    this.victoryModal.className = 'modal-dialog victory hidden';
    this.victoryModal.innerHTML = `
      <div class="modal-content gothic-plate">
        <h1 class="victory-title">CRIMSON SPIRE CONQUERED</h1>
        <p>You ascended the Castle of Arcana and banished the Arch-Beholder to the astral void.</p>
        <div class="victory-stats" id="victory-stats"></div>
        <button class="modal-close-btn" onclick="window.location.reload()">ASCEND AGAIN</button>
      </div>
    `;
    this.container.appendChild(this.victoryModal);

    this.gameOverModal = document.createElement('div');
    this.gameOverModal.className = 'modal-dialog game-over hidden';
    this.gameOverModal.innerHTML = `
      <div class="modal-content gothic-plate">
        <h1 class="game-over-title">YOU HAVE FALLEN</h1>
        <p>The darkness of the Crimson Spire consumed your soul...</p>
        <button class="modal-close-btn" onclick="window.location.reload()">RESURRECT</button>
      </div>
    `;
    this.container.appendChild(this.gameOverModal);

    document.getElementById('btn-debug-dash').addEventListener('click', (e) => {
      e.stopPropagation();
      const wasAlreadyUnlocked = this.player.jumpDashUnlocked;
      this.player.enableJumpDashDebug(false);
      if (wasAlreadyUnlocked) {
        this.player.triggerJumpDash();
      }
    });

    document.getElementById('btn-crt').addEventListener('click', (e) => {
      e.stopPropagation();
      this.crtEnabled = this.postProcessor ? this.postProcessor.toggleRetroMode() : !this.crtEnabled;
      this.crtOverlay.classList.toggle('hidden', !this.crtEnabled);
      document.getElementById('btn-crt').innerText = `[SHADER: ${this.crtEnabled ? 'RETRO CRT' : 'CRISP'}]`;
    });

    document.getElementById('btn-sound').addEventListener('click', (e) => {
      e.stopPropagation();
      const isMuted = audioSynth.toggleMute();
      document.getElementById('btn-sound').innerText = isMuted ? '[AUDIO: MUTED]' : '[AUDIO: ON]';
    });

    document.getElementById('btn-help').addEventListener('click', (e) => {
      e.stopPropagation();
      this.helpModal.classList.remove('hidden');
    });

    document.getElementById('btn-close-help').addEventListener('click', (e) => {
      e.stopPropagation();
      this.helpModal.classList.add('hidden');
    });

    this.dom = {
      stageTitle: document.getElementById('hud-stage-title'),
      stageBtns: Array.from(this.stageNavBar.querySelectorAll('.stage-nav-btn')),
      healthLiquid: document.getElementById('health-liquid'),
      healthText: document.getElementById('health-text'),
      manaLiquid: document.getElementById('mana-liquid'),
      manaText: document.getElementById('mana-text'),
      levelBadge: document.getElementById('hud-level-badge'),
      statBonus: document.getElementById('hud-stat-bonus'),
      xpText: document.getElementById('hud-xp-text'),
      xpFill: document.getElementById('hud-xp-fill'),
      levelUpTitle: document.getElementById('levelup-title'),
      levelUpSubtitle: document.getElementById('levelup-subtitle'),
      slots: [0, 1, 2, 3].map(i => document.getElementById(`slot-${i}`)),
      cds: [0, 1, 2, 3].map(i => document.getElementById(`cd-${i}`)),
      slotDash: document.getElementById('slot-dash'),
      cdDash: document.getElementById('cd-dash'),
      btnDebugDash: document.getElementById('btn-debug-dash'),
      objElevation: document.getElementById('obj-elevation'),
      objGrimoire: document.getElementById('obj-grimoire'),
      objEnemies: document.getElementById('obj-enemies'),
      objGraph: document.getElementById('obj-graph'),
      scoreDisplay: document.getElementById('score-display'),
      comboDisplay: document.getElementById('combo-display'),
      synergyDisplay: document.getElementById('synergy-display'),
      bossFill: document.getElementById('boss-bar-fill'),
      bossTitle: document.getElementById('boss-title-text'),
      victoryStats: document.getElementById('victory-stats')
    };
    this.frameCounter = 0;
  }

  renderMinimap() {
    if (!this.minimapCtx) return;
    const ctx = this.minimapCtx;
    const w = 168;
    const h = 168;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(8, 10, 16, 0.90)';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const scale = 0.96;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.player.euler.y);

    const px = this.player.position.x;
    const pz = this.player.position.z;

    // Draw 3D Connecting Corridors between Rooms
    const corridors = this.level.minimapCorridors || [];
    ctx.fillStyle = 'rgba(72, 58, 38, 0.82)';
    ctx.strokeStyle = 'rgba(215, 170, 75, 0.72)';
    ctx.lineWidth = 1.2;
    corridors.forEach(c => {
      const rx = (c.x - px) * scale;
      const rz = (c.z - pz) * scale;
      ctx.fillRect(rx, rz, c.rw * scale, c.rd * scale);
      ctx.strokeRect(rx, rz, c.rw * scale, c.rd * scale);
    });

    // Draw Procedural Dungeon Graph Edges connecting Room Centers
    if (this.level.graphEdges && this.level.graphEdges.length > 0 && this.level.minimapRooms) {
      const nodeMap = {};
      this.level.minimapRooms.forEach(r => {
        if (r.id) nodeMap[r.id] = r;
      });
      ctx.strokeStyle = 'rgba(255, 215, 90, 0.45)';
      ctx.lineWidth = 1.8;
      this.level.graphEdges.forEach(edge => {
        const nA = nodeMap[edge.from];
        const nB = nodeMap[edge.to];
        if (nA && nB) {
          ctx.beginPath();
          ctx.moveTo((nA.cx - px) * scale, (nA.cz - pz) * scale);
          ctx.lineTo((nB.cx - px) * scale, (nB.cz - pz) * scale);
          ctx.stroke();
        }
      });
    }

    const stg = this.level.currentStageId;
    const roomFill = stg === 'stage2'
      ? 'rgba(64, 24, 16, 0.88)'
      : stg === 'stage3'
        ? 'rgba(16, 52, 36, 0.88)'
        : stg === 'stage4'
          ? 'rgba(18, 44, 68, 0.88)'
          : stg === 'stage5'
            ? 'rgba(42, 20, 64, 0.88)'
            : 'rgba(26, 34, 52, 0.88)';
    ctx.strokeStyle = 'rgba(205, 165, 90, 0.90)';
    ctx.fillStyle = roomFill;
    ctx.lineWidth = 1.6;

    const rooms = this.level.minimapRooms || [];
    rooms.forEach(r => {
      const rx = (r.x - px) * scale;
      const rz = (r.z - pz) * scale;
      ctx.fillRect(rx, rz, r.rw * scale, r.rd * scale);
      ctx.strokeRect(rx, rz, r.rw * scale, r.rd * scale);
    });

    // Draw Elemental Hazard Basins on Automap
    if (this.level.hazardZones) {
      this.level.hazardZones.forEach(hz => {
        ctx.fillStyle = hz.type === 'lava'
          ? 'rgba(255, 70, 0, 0.45)'
          : hz.type === 'acid'
            ? 'rgba(30, 220, 80, 0.42)'
            : hz.type === 'frost'
              ? 'rgba(0, 170, 255, 0.42)'
              : 'rgba(110, 30, 200, 0.45)';
        const rx = (hz.xMin - px) * scale;
        const rz = (hz.zMin - pz) * scale;
        const rw = (hz.xMax - hz.xMin) * scale;
        const rd = (hz.zMax - hz.zMin) * scale;
        ctx.fillRect(rx, rz, rw, rd);
      });
    }

    // Draw 3D Jump Platforms on Automap
    if (this.level.heightZones) {
      ctx.strokeStyle = 'rgba(0, 238, 255, 0.78)';
      ctx.fillStyle = 'rgba(0, 180, 220, 0.36)';
      ctx.lineWidth = 1;
      this.level.heightZones.forEach(hz => {
        if (!hz.isJumpPlatform) return;
        const rx = (hz.xMin - px) * scale;
        const rz = (hz.zMin - pz) * scale;
        const rw = (hz.xMax - hz.xMin) * scale;
        const rd = (hz.zMax - hz.zMin) * scale;
        ctx.fillRect(rx, rz, rw, rd);
        ctx.strokeRect(rx, rz, rw, rd);
      });
    }

    // Draw Arcane Jump Pads as Bright Green Launch Rings
    if (this.level.jumpPads) {
      this.level.jumpPads.forEach(pad => {
        const dx = (pad.position.x - px) * scale;
        const dz = (pad.position.z - pz) * scale;
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(dx, dz, 3.0, 0, Math.PI * 2);
        ctx.stroke();
      });
    }

    // Draw Stage Portals as Glowing Cyan Rings
    if (this.level.portals) {
      this.level.portals.forEach(pt => {
        const dx = (pt.position.x - px) * scale;
        const dz = (pt.position.z - pz) * scale;
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(dx, dz, 4.5, 0, Math.PI * 2);
        ctx.stroke();
      });
    }

    // Draw Pickups
    this.level.pickups.forEach(p => {
      if (p.collected) return;
      const dx = (p.x - px) * scale;
      const dz = (p.z - pz) * scale;
      ctx.fillStyle = p.type === 'grimoire' ? '#ffd700' : p.type === 'health' ? '#ff4444' : '#44aaff';
      ctx.beginPath();
      ctx.arc(dx, dz, p.type === 'grimoire' ? 3.5 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw Enemies (Highlighting LOS state)
    this.enemyManager.enemies.forEach(e => {
      if (e.isDead) return;
      const dx = (e.position.x - px) * scale;
      const dz = (e.position.z - pz) * scale;
      ctx.fillStyle = e.type === 'arcane_eye'
        ? '#dd44ff'
        : e.slowTimer > 0
          ? '#00ffff'
          : e.hasLineOfSight
            ? '#ff3322'
            : '#aa5522';
      ctx.beginPath();
      ctx.arc(dx, dz, e.type === 'arcane_eye' ? 4.5 : 2.8, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();

    // Player Arrow
    ctx.fillStyle = '#00ffcc';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 5);
    ctx.lineTo(cx - 4, cy + 4);
    ctx.lineTo(cx + 4, cy + 4);
    ctx.closePath();
    ctx.fill();
  }

  update() {
    this.frameCounter++;
    const d = this.dom;

    const hpPct = Math.max(0, Math.min(1, this.player.health / this.player.maxHealth));
    const mpPct = Math.max(0, Math.min(1, this.player.mana / this.player.maxMana));

    if (d.healthLiquid) d.healthLiquid.style.height = `${Math.floor(hpPct * 100)}%`;
    if (d.healthText) d.healthText.innerText = Math.ceil(this.player.health);
    if (d.manaLiquid) d.manaLiquid.style.height = `${Math.floor(mpPct * 100)}%`;
    if (d.manaText) d.manaText.innerText = Math.ceil(this.player.mana);

    // Update Arcane Level & XP Progress Strip
    const xpPct = Math.max(0, Math.min(1, this.player.xp / this.player.xpToNextLevel));
    const bonusPct = Math.round((this.player.statMultiplier - 1.0) * 100);
    if (d.levelBadge) d.levelBadge.innerText = `ARCANE LVL ${this.player.characterLevel}`;
    if (d.statBonus) d.statBonus.innerText = `+${bonusPct}% ALL STATS`;
    if (d.xpText) d.xpText.innerText = `XP: ${this.player.xp} / ${this.player.xpToNextLevel}`;
    if (d.xpFill) d.xpFill.style.width = `${Math.floor(xpPct * 100)}%`;

    // Show Level-Up Popup Banner when active
    if (this.player.levelUpTimer > 0) {
      this.levelUpPopup.classList.remove('hidden');
      if (d.levelUpTitle) d.levelUpTitle.innerText = this.player.levelUpTitle;
      if (d.levelUpSubtitle) d.levelUpSubtitle.innerText = this.player.levelUpSubtitle;
    } else {
      this.levelUpPopup.classList.add('hidden');
    }

    if (this.player.hurtTimer > 0) {
      this.damageOverlay.style.opacity = Math.min(1.0, this.player.hurtTimer / 0.38);
    } else {
      this.damageOverlay.style.opacity = 0;
    }

    for (let i = 0; i < 4; i++) {
      const isUnlocked = this.player.spells[i].unlocked;
      if (d.slots[i]) {
        d.slots[i].classList.toggle('locked', !isUnlocked);
        d.slots[i].classList.toggle('active', isUnlocked && this.player.activeSpellIndex === i);
      }
      if (d.cds[i]) {
        const cd = this.player.spellCooldowns[i];
        const maxCd = this.player.spells[i].cooldown;
        d.cds[i].style.height = cd > 0 ? `${Math.floor((cd / maxCd) * 100)}%` : '0%';
      }
    }

    // Update Jump Dash Slot (between Ice and Lightning) & Debug Button
    if (d.slotDash) {
      d.slotDash.classList.toggle('locked', !this.player.jumpDashUnlocked);
      d.slotDash.classList.toggle('dash-ready', this.player.jumpDashUnlocked && this.player.jumpDashCooldown <= 0);
      d.slotDash.classList.toggle('active', this.player.dashTimer > 0);
    }
    if (d.cdDash) {
      const dashCd = this.player.jumpDashCooldown;
      const dashMax = this.player.jumpDashMaxCooldown;
      d.cdDash.style.height = dashCd > 0 ? `${Math.floor((dashCd / dashMax) * 100)}%` : '0%';
    }
    if (d.btnDebugDash) {
      d.btnDebugDash.classList.toggle('debug-unlocked', this.player.debugDashUnlocked || this.player.jumpDashUnlocked);
      d.btnDebugDash.innerText = this.player.debugDashUnlocked
        ? '[DEBUG: JUMP DASH ON]'
        : this.player.jumpDashUnlocked
          ? '[DEBUG: DASH READY]'
          : '[DEBUG DASH: 5555]';
    }

    // Show Portal Prompt if near a stage gateway
    if (this.level.nearestPortal) {
      this.portalPrompt.classList.remove('hidden');
      this.portalPrompt.innerText = `PRESS [E] OR WALK INTO PORTAL: ${this.level.nearestPortal.title}`;
    } else {
      this.portalPrompt.classList.add('hidden');
    }

    if (this.frameCounter % 3 === 0) {
      let baseAlt = 20;
      if (this.level.currentStageId === 'stage1') baseAlt = 100;
      else if (this.level.currentStageId === 'stage2') baseAlt = 250;
      else if (this.level.currentStageId === 'stage3') baseAlt = 450;
      else if (this.level.currentStageId === 'stage4') baseAlt = 700;
      else if (this.level.currentStageId === 'stage5') baseAlt = 1000;
      const climbAlt = Math.round(baseAlt + Math.max(0, this.player.currentFloorY) * 35);

      if (d.objElevation) d.objElevation.innerText = `[ALTITUDE] Castle Elevation: ${climbAlt}m`;
      if (d.objGrimoire) d.objGrimoire.innerText = `[CODEX] Elder Grimoires: ${this.player.grimoiresCollected} / 4`;
      if (d.objEnemies) d.objEnemies.innerText = `[HOSTILES] Stage Enemies: ${this.enemyManager.aliveCount} Remaining`;
      if (d.objGraph) {
        if (this.level.graphEdges && this.level.graphEdges.length > 0) {
          d.objGraph.innerText = `[GRAPH SEED #${this.level.currentSeed % 1000}] ${this.level.minimapRooms.length} Nodes | ${this.level.graphEdges.length} Edges`;
        } else if (this.level.currentStageId === 'stage5') {
          d.objGraph.innerText = `[CITADEL SEED #${this.level.currentSeed % 1000}] Boss Sanctum + 2 Reliquary Wings`;
        } else {
          d.objGraph.innerText = `[OVERWORLD] 6 Terraces + 4 Branching Side Courtyards`;
        }
      }
      if (d.scoreDisplay) d.scoreDisplay.innerText = `SCORE: ${this.player.score}`;

      if (this.telemetry && d.comboDisplay) {
        if (this.telemetry.comboCount >= 2) {
          d.comboDisplay.classList.remove('hidden');
          d.comboDisplay.innerText = `${this.telemetry.comboCount}x SPELL COMBO (${this.telemetry.getComboMultiplier().toFixed(2)}x DMG)`;
        } else {
          d.comboDisplay.classList.add('hidden');
        }
      }

      if (this.telemetry && d.synergyDisplay) {
        if (this.telemetry.synergyTimer > 0) {
          d.synergyDisplay.classList.remove('hidden');
          d.synergyDisplay.innerText = this.telemetry.lastSynergyText;
        } else {
          d.synergyDisplay.classList.add('hidden');
        }
      }

      const boss = this.enemyManager.enemies.find(e => e.type === 'arcane_eye');
      if (boss && boss.isAggro && !boss.isDead) {
        this.bossBarContainer.classList.remove('hidden');
        const bossPct = Math.max(0, boss.health / boss.maxHealth);
        if (d.bossFill) d.bossFill.style.width = `${Math.floor(bossPct * 100)}%`;
        if (d.bossTitle) {
          if (boss.phase3) {
            d.bossTitle.innerText = `ARCH-BEHOLDER [PHASE III: ASTRAL SINGULARITY] (${Math.ceil(boss.health)}/${boss.maxHealth} HP)`;
          } else if (boss.enraged) {
            d.bossTitle.innerText = `ARCH-BEHOLDER [PHASE II: VOID OVERDRIVE] (${Math.ceil(boss.health)}/${boss.maxHealth} HP)`;
          } else {
            d.bossTitle.innerText = `ARCH-BEHOLDER VOID EYE [PHASE I] (${Math.ceil(boss.health)}/${boss.maxHealth} HP)`;
          }
        }
      } else {
        this.bossBarContainer.classList.add('hidden');
      }

      this.renderMinimap();
    }

    if (this.player.isDead && this.gameOverModal.classList.contains('hidden')) {
      this.gameOverModal.classList.remove('hidden');
    }

    if (this.enemyManager.bossDefeated && this.victoryModal.classList.contains('hidden')) {
      if (d.victoryStats) {
        const bonusPct = Math.round((this.player.statMultiplier - 1.0) * 100);
        d.victoryStats.innerHTML = `
          <div>Final Score: <b>${this.player.score}</b></div>
          <div>Arcane Level: <b>Level ${this.player.characterLevel} (+${bonusPct}% All Stats)</b></div>
          <div>Grimoires Recovered: <b>${this.player.grimoiresCollected} / 4</b></div>
          <div>Remaining Vitality: <b>${Math.ceil(this.player.health)} / ${this.player.maxHealth} HP</b></div>
        `;
      }
      this.victoryModal.classList.remove('hidden');
    }
  }
}
