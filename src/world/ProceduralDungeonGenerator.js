/**
 * ProceduralDungeonGenerator V4:
 * Multi-Room Graph-Based Procedural Level Generator with Biome-Specific Topologies,
 * Distinct Architectural Archetypes, and High Room Size & Elevation Variance.
 *
 * Each Biome Stage features a tailored macro-grid graph topology (CELL_STRIDE = 40 units):
 *   - Stage I   (Sunken Undercroft)  : CRYPT_LABYRINTH — Interconnected catacomb loops & sunken ossuary annexes
 *   - Stage II  (Molten Forge)       : FOUNDRY_CRUCIBLE_RING — Industrial magma ring circuit & outer smelting wings
 *   - Stage III (Alchemical Sanctum) : ARCANE_CITADEL_CROSS — Grand symmetrical transept cross & laboratory cloisters
 *   - Stage IV  (Glacial Aqueduct)   : FROZEN_CANYON_VIADUCT — Steeply ascending twin ice viaducts & sky-bridges
 */
export class ProceduralDungeonGenerator {
  constructor(seed = Date.now()) {
    this.seed = seed;
  }

  /**
   * Deterministic mulberry32 PRNG for reproducible or re-rollable procedural layouts
   */
  nextRand() {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  randRange(min, max) {
    return min + this.nextRand() * (max - min);
  }

  randInt(min, max) {
    return Math.floor(this.randRange(min, max + 1));
  }

  pick(arr) {
    return arr[Math.floor(this.nextRand() * arr.length)];
  }

  shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.nextRand() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /**
   * Generates a Multi-Room Connected Graph Specification tailored to the given stageId's biome.
   */
  generateStageGraph(stageId, customSeed = null) {
    if (customSeed !== null) {
      this.seed = customSeed;
    }

    const biomeConfigs = {
      stage1: {
        id: 'stage1',
        name: 'STAGE I: THE SUNKEN UNDERCROFT',
        topologyName: 'CRYPT_LABYRINTH',
        elevationLabel: 'Lower Castle Keep (100m)',
        fogColor: 0x050811,
        fogDensity: 0.0135,
        ambientColor: 0x2e3c5c,
        hemiSky: 0x5577bb,
        hemiGround: 0x18141e,
        dirColor: 0x99bbff,
        wallTheme: 'stone',
        floorTheme: 'stone',
        ceilTheme: 'stone',
        pillarTheme: 'stone',
        hazardType: 'void',
        trimColor: 0x00d8ff,
        secondaryTrim: 0x7755cc,
        portalTarget: 'overworld_1',
        portalTitle: 'ASCEND TO MOLTEN FORGE RAMPARTS',
        portalSubtitle: 'Return to Castle Exterior [Walk In or Press E]',
        portalColor: 0x44ddff,
        openSky: false,
        lightPalette: [0x44aaff, 0x8866ff, 0xffaa55, 0x00eeff, 0x6688ff, 0xaa55ff],
        enemyPool: ['gargoyle', 'skeleton', 'dread_knight', 'fire_imp'],
        archetypePool: [
          { archetype: 'SUNKEN_OSSUARY_CRYPT', sizeClass: 'MEDIUM_CRYPT', w: 18, d: 18, wallH: 8.6, yOffset: -0.8 },
          { archetype: 'FLOODED_CATACOMB_GALLERY', sizeClass: 'WIDE_GALLERY', w: 24, d: 16, wallH: 9.0, yOffset: -0.5 },
          { archetype: 'DARK_GARGOYLE_BELFRY', sizeClass: 'TALL_VAULT', w: 20, d: 20, wallH: 11.4, yOffset: 0.4 },
          { archetype: 'RITUAL_SKULL_ALTAR', sizeClass: 'SHRINE', w: 17, d: 17, wallH: 8.8, yOffset: 0.0 },
          { archetype: 'FORGOTTEN_RELIQUARY', sizeClass: 'CLOISTER', w: 16, d: 22, wallH: 9.2, yOffset: -0.4 },
          { archetype: 'PILLAR_SANCTUARY', sizeClass: 'GREAT_HALL', w: 24, d: 22, wallH: 10.2, yOffset: 0.0 },
          { archetype: 'ARCANE_LIBRARY', sizeClass: 'WIDE_GALLERY', w: 22, d: 16, wallH: 9.0, yOffset: 0.2 }
        ]
      },
      stage2: {
        id: 'stage2',
        name: 'STAGE II: THE MOLTEN FORGE',
        topologyName: 'FOUNDRY_CRUCIBLE_RING',
        elevationLabel: 'Deep Foundry Keep (250m)',
        fogColor: 0x1c0702,
        fogDensity: 0.013,
        ambientColor: 0x682e18,
        hemiSky: 0xff7722,
        hemiGround: 0x2c0d04,
        dirColor: 0xffaa55,
        wallTheme: 'lava',
        floorTheme: 'lava',
        ceilTheme: 'lava',
        pillarTheme: 'lava',
        hazardType: 'lava',
        trimColor: 0xff6600,
        secondaryTrim: 0xffbb22,
        portalTarget: 'overworld_2',
        portalTitle: 'ASCEND TO ALCHEMICAL SANCTUM',
        portalSubtitle: 'Return to Castle Exterior [Walk In or Press E]',
        portalColor: 0xff6622,
        openSky: false,
        lightPalette: [0xff5511, 0xff9922, 0xff3300, 0xffbb44, 0xff6622, 0xffaa33],
        enemyPool: ['fire_imp', 'dread_knight', 'gargoyle', 'skeleton'],
        archetypePool: [
          { archetype: 'SMELTING_FURNACE_HALL', sizeClass: 'LARGE_FOUNDRY', w: 24, d: 20, wallH: 10.8, yOffset: 0.0 },
          { archetype: 'OBSIDIAN_ANVIL_FOUNDRY', sizeClass: 'GREAT_HALL', w: 22, d: 22, wallH: 10.4, yOffset: 0.5 },
          { archetype: 'MAGMA_CONDUIT_CHAMBER', sizeClass: 'WIDE_GALLERY', w: 24, d: 18, wallH: 9.6, yOffset: -0.3 },
          { archetype: 'BRAZIER_ARMORY', sizeClass: 'LARGE', w: 24, d: 22, wallH: 10.6, yOffset: 0.4 },
          { archetype: 'PYROCLAST_CRUCIBLE', sizeClass: 'MEDIUM', w: 18, d: 18, wallH: 9.8, yOffset: 0.0 },
          { archetype: 'CRYSTAL_RELIQUARY', sizeClass: 'SHRINE', w: 17, d: 16, wallH: 8.8, yOffset: 0.6 },
          { archetype: 'RITUAL_SKULL_ALTAR', sizeClass: 'SHRINE', w: 18, d: 16, wallH: 9.0, yOffset: 0.2 }
        ]
      },
      stage3: {
        id: 'stage3',
        name: 'STAGE III: THE ALCHEMICAL SANCTUM',
        topologyName: 'ARCANE_CITADEL_CROSS',
        elevationLabel: 'Mid-Tower Keep (450m)',
        fogColor: 0x04150e,
        fogDensity: 0.0125,
        ambientColor: 0x2e5848,
        hemiSky: 0x44ffaa,
        hemiGround: 0x14221c,
        dirColor: 0x99ffdd,
        wallTheme: 'sanctum',
        floorTheme: 'sanctum',
        ceilTheme: 'sanctum',
        pillarTheme: 'sanctum',
        hazardType: 'acid',
        trimColor: 0x22ff88,
        secondaryTrim: 0xffd744,
        portalTarget: 'overworld_3',
        portalTitle: 'ASCEND TO GLACIAL AQUEDUCT',
        portalSubtitle: 'Return to Castle Exterior [Walk In or Press E]',
        portalColor: 0x33ff88,
        openSky: false,
        lightPalette: [0x22ff88, 0x00eeff, 0xffd744, 0x44ffaa, 0x88ff66, 0x00ffcc],
        enemyPool: ['skeleton', 'frost_wraith', 'dread_knight', 'gargoyle'],
        archetypePool: [
          { archetype: 'TRANSMUTATION_VAT_LAB', sizeClass: 'LARGE_LAB', w: 22, d: 20, wallH: 10.4, yOffset: 0.0 },
          { archetype: 'GRAND_ARCANE_ARCHIVE', sizeClass: 'WIDE_GALLERY', w: 26, d: 18, wallH: 10.2, yOffset: 0.4 },
          { archetype: 'ASTROLABE_OBSERVATORY', sizeClass: 'GREAT_HALL', w: 24, d: 24, wallH: 11.6, yOffset: 0.8 },
          { archetype: 'ALCHEMICAL_CAULDRON_LAB', sizeClass: 'MEDIUM', w: 18, d: 18, wallH: 9.2, yOffset: 0.0 },
          { archetype: 'VENOM_DISTILLERY', sizeClass: 'DEEP_CLOISTER', w: 18, d: 24, wallH: 9.8, yOffset: -0.4 },
          { archetype: 'ARCANE_LIBRARY', sizeClass: 'WIDE_GALLERY', w: 24, d: 16, wallH: 9.6, yOffset: 0.3 },
          { archetype: 'CRYSTAL_RELIQUARY', sizeClass: 'SHRINE', w: 17, d: 17, wallH: 9.0, yOffset: 0.5 }
        ]
      },
      stage4: {
        id: 'stage4',
        name: 'STAGE IV: THE GLACIAL AQUEDUCT',
        topologyName: 'FROZEN_CANYON_VIADUCT',
        elevationLabel: 'Upper Castle Keep (700m)',
        fogColor: 0x051326,
        fogDensity: 0.0105,
        ambientColor: 0x426494,
        hemiSky: 0x88eeff,
        hemiGround: 0x16243a,
        dirColor: 0xd8f4ff,
        wallTheme: 'ice',
        floorTheme: 'ice',
        ceilTheme: 'ice',
        pillarTheme: 'ice',
        hazardType: 'frost',
        trimColor: 0x00eeff,
        secondaryTrim: 0x88aaff,
        portalTarget: 'overworld_4',
        portalTitle: 'ASCEND TO HIGH SPIRE SUMMIT',
        portalSubtitle: 'Return to Castle Exterior [Walk In or Press E]',
        portalColor: 0x00eeff,
        openSky: true,
        lightPalette: [0x00eeff, 0x66ccff, 0x88ffff, 0x5599ff, 0xaaddff, 0x44ddff],
        enemyPool: ['frost_wraith', 'dread_knight', 'skeleton', 'fire_imp'],
        archetypePool: [
          { archetype: 'FROZEN_AQUEDUCT_SPAN', sizeClass: 'DEEP_VIADUCT', w: 18, d: 26, wallH: 7.6, yOffset: 0.4 },
          { archetype: 'GLACIAL_SPIKE_CAVERN', sizeClass: 'LARGE', w: 24, d: 22, wallH: 8.2, yOffset: 0.0 },
          { archetype: 'CRYOFROST_MONOLITH_SHRINE', sizeClass: 'MEDIUM', w: 20, d: 20, wallH: 7.8, yOffset: 0.8 },
          { archetype: 'AURORA_MIRROR_GALLERY', sizeClass: 'WIDE_GALLERY', w: 26, d: 18, wallH: 7.6, yOffset: 0.3 },
          { archetype: 'CRYSTAL_RELIQUARY', sizeClass: 'SHRINE', w: 18, d: 18, wallH: 7.4, yOffset: 0.6 },
          { archetype: 'PILLAR_SANCTUARY', sizeClass: 'GREAT_HALL', w: 24, d: 22, wallH: 8.0, yOffset: 0.2 }
        ]
      }
    };

    const biome = biomeConfigs[stageId] || biomeConfigs.stage1;
    const CELL_STRIDE = 40; // 40m between grid centers for generous corridors and zero room overlap

    const platformPatterns = ['DIAMOND_ASCENT', 'ZIGZAG_GAUNTLET', 'TWIN_SPIRAL_STONES', 'OBELISK_LEAP'];
    const chosenPlatformPattern = this.pick(platformPatterns);

    // Build Biome-Specific Macro-Grid Cell Topology
    const spineCells = [
      { gx: 0, gz: 0 },
      { gx: 0, gz: -1 },
      { gx: 0, gz: -2 },
      { gx: 0, gz: -3 }
    ];

    let wingCells = [];
    if (stageId === 'stage1') {
      // CRYPT_LABYRINTH: Looping catacomb side-corridors + outer sunken ossuary annex
      const primarySide = this.pick([-1, 1]);
      const otherSide = -primarySide;
      const loopStartGz = this.pick([0, -1]);
      wingCells = [
        { gx: primarySide, gz: loopStartGz },
        { gx: primarySide, gz: loopStartGz - 1 },
        { gx: primarySide, gz: loopStartGz - 2 },
        { gx: primarySide * 2, gz: loopStartGz - 1 },
        { gx: otherSide, gz: -1 },
        { gx: otherSide, gz: -2 }
      ];
    } else if (stageId === 'stage2') {
      // FOUNDRY_CRUCIBLE_RING: Symmetrical smelting ring around central magma chasm + outer forge wings
      const outerGz = this.pick([-1, -2]);
      wingCells = [
        { gx: -1, gz: -1 },
        { gx: -1, gz: -2 },
        { gx: 1, gz: -1 },
        { gx: 1, gz: -2 },
        { gx: -2, gz: outerGz },
        { gx: 2, gz: outerGz }
      ];
    } else if (stageId === 'stage3') {
      // ARCANE_CITADEL_CROSS: Grand symmetrical cross-transept spanning gx = -2..2 plus cloister wings
      const crossGz = this.pick([-1, -2]);
      const cloisterGz = crossGz === -1 ? -2 : -1;
      wingCells = [
        { gx: -1, gz: crossGz },
        { gx: -2, gz: crossGz },
        { gx: 1, gz: crossGz },
        { gx: 2, gz: crossGz },
        { gx: -1, gz: cloisterGz },
        { gx: 1, gz: cloisterGz }
      ];
    } else {
      // FROZEN_CANYON_VIADUCT (stage4): Parallel twin-viaduct span + high glacier overlook
      const viaductSide = this.pick([-1, 1]);
      const overlookSide = -viaductSide;
      wingCells = [
        { gx: viaductSide, gz: 0 },
        { gx: viaductSide, gz: -1 },
        { gx: viaductSide, gz: -2 },
        { gx: viaductSide, gz: -3 },
        { gx: overlookSide, gz: -1 },
        { gx: overlookSide, gz: -2 }
      ];
    }

    const activeCells = [...spineCells, ...wingCells];
    const cellKey = (gx, gz) => `${gx},${gz}`;
    const cellMap = new Map();

    const variedRoomProfiles = this.shuffle(biome.archetypePool);
    let profIdx = 0;

    const chasmRow = this.pick([-1, -2]);
    // Elevation climb per row depends on biome (Glacial Aqueduct climbs steeply; Crypt has sunken chambers)
    const rowClimb = stageId === 'stage4' ? 1.85 : stageId === 'stage3' ? 1.35 : stageId === 'stage2' ? 1.25 : 0.95;

    activeCells.forEach((cell, idx) => {
      const { gx, gz } = cell;
      if (cellMap.has(cellKey(gx, gz))) return;

      const id =
        gx === 0 && gz === 0
          ? 'entry_hall'
          : gx === 0 && gz === -3
            ? 'north_sanctum'
            : `room_${gx}_${Math.abs(gz)}`;

      let archetype = 'BRAZIER_ARMORY';
      let sizeClass = 'MEDIUM';
      let w = 20;
      let d = 18;
      let wallH = biome.openSky ? 7.6 : 9.4;
      let y = Number((Math.abs(gz) * rowClimb + Math.abs(gx) * 0.55).toFixed(2));

      if (gx === 0 && gz === 0) {
        archetype = 'ENTRY_HALL';
        sizeClass = 'MEDIUM';
        w = 20;
        d = 18;
        wallH = biome.openSky ? 7.6 : 9.4;
        y = 0.0;
      } else if (gx === 0 && gz === -3) {
        archetype = 'NORTH_GRIMOIRE_SANCTUM';
        sizeClass = 'LARGE';
        w = 26;
        d = 24;
        wallH = biome.openSky ? 8.4 : 11.4;
        y = Number((3 * rowClimb + 0.4).toFixed(2));
      } else if (gx === 0 && gz === chasmRow) {
        archetype = 'CHASM_PLATFORMING_HUB';
        sizeClass = 'COLOSSAL';
        w = 28;
        d = 26;
        wallH = biome.openSky ? 8.6 : 12.0;
      } else {
        const prof = variedRoomProfiles[profIdx % variedRoomProfiles.length];
        profIdx++;
        archetype = prof.archetype;
        sizeClass = prof.sizeClass;
        w = prof.w;
        d = prof.d;
        wallH = prof.wallH;
        y = Number((y + (prof.yOffset || 0)).toFixed(2));
      }

      const node = {
        id,
        gx,
        gz,
        archetype,
        sizeClass,
        x: gx * CELL_STRIDE,
        z: 22 + gz * CELL_STRIDE,
        w,
        d,
        wallH,
        y,
        pattern: chosenPlatformPattern,
        lightColor: biome.lightPalette[idx % biome.lightPalette.length],
        doors: { north: false, south: false, east: false, west: false }
      };

      cellMap.set(cellKey(gx, gz), node);
    });

    const nodes = Array.from(cellMap.values());
    const edges = [];
    const edgeSet = new Set();

    const addEdge = (nodeA, nodeB) => {
      if (!nodeA || !nodeB) return;
      const k1 = `${nodeA.id}->${nodeB.id}`;
      const k2 = `${nodeB.id}->${nodeA.id}`;
      if (edgeSet.has(k1) || edgeSet.has(k2)) return;
      edgeSet.add(k1);

      if (nodeA.gx === nodeB.gx && Math.abs(nodeA.gz - nodeB.gz) === 1) {
        const southNode = nodeA.gz > nodeB.gz ? nodeA : nodeB;
        const northNode = nodeA.gz > nodeB.gz ? nodeB : nodeA;
        southNode.doors.north = true;
        northNode.doors.south = true;

        edges.push({
          from: southNode.id,
          to: northNode.id,
          dir: 'NS',
          x: southNode.x,
          zStart: southNode.z - southNode.d / 2,
          zEnd: northNode.z + northNode.d / 2,
          yStart: southNode.y,
          yEnd: northNode.y
        });
      } else if (nodeA.gz === nodeB.gz && Math.abs(nodeA.gx - nodeB.gx) === 1) {
        const westNode = nodeA.gx < nodeB.gx ? nodeA : nodeB;
        const eastNode = nodeA.gx < nodeB.gx ? nodeB : nodeA;
        westNode.doors.east = true;
        eastNode.doors.west = true;

        edges.push({
          from: westNode.id,
          to: eastNode.id,
          dir: 'EW',
          z: westNode.z,
          xStart: westNode.x + westNode.w / 2,
          xEnd: eastNode.x - eastNode.w / 2,
          yStart: westNode.y,
          yEnd: eastNode.y
        });
      }
    };

    // Connect all orthogonally adjacent active cells to form a rich multi-loop dungeon graph
    nodes.forEach((node) => {
      const northNeighbor = cellMap.get(cellKey(node.gx, node.gz - 1));
      const southNeighbor = cellMap.get(cellKey(node.gx, node.gz + 1));
      const eastNeighbor = cellMap.get(cellKey(node.gx + 1, node.gz));
      const westNeighbor = cellMap.get(cellKey(node.gx - 1, node.gz));

      if (northNeighbor) addEdge(node, northNeighbor);
      if (southNeighbor) addEdge(node, southNeighbor);
      if (eastNeighbor) addEdge(node, eastNeighbor);
      if (westNeighbor) addEdge(node, westNeighbor);
    });

    return {
      seed: this.seed,
      biome,
      nodes,
      edges,
      chosenPlatformPattern
    };
  }
}
