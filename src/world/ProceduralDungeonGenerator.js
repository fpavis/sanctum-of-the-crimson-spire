/**
 * ProceduralDungeonGenerator V3.3:
 * Multi-Room Graph-Based Procedural Level Generator with High Room Size & Shape Variance.
 *
 * Places discrete, enclosed architectural rooms on a 2D macro grid (CELL_STRIDE = 38 units)
 * and procedurally grows a connected graph (spanning tree + loop edges) of 8 rooms per stage
 * featuring dramatic variance in room dimensions and ceiling heights:
 *   - Small Compact Shrines & Cells (12x12, 13x11)
 *   - Wide Galleries (24x13) & Deep Cloisters (13x24)
 *   - Medium Entry Halls (18x16)
 *   - Large Great Halls (25x23, 26x24) & Colossal Chasm Arenas (28x26)
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
   * Generates a Multi-Room Connected Graph Specification with varied room sizes for the given stageId.
   */
  generateStageGraph(stageId, customSeed = null) {
    if (customSeed !== null) {
      this.seed = customSeed;
    }

    const biomeConfigs = {
      stage1: {
        id: 'stage1',
        name: 'STAGE I: THE SUNKEN UNDERCROFT',
        elevationLabel: 'Lower Castle Keep (100m)',
        fogColor: 0x070a14,
        fogDensity: 0.013,
        ambientColor: 0x384466,
        hemiSky: 0x6688cc,
        hemiGround: 0x221a14,
        dirColor: 0xffddaa,
        wallTheme: 'stone',
        floorTheme: 'stone',
        hazardType: 'void',
        trimColor: 0x00eeff,
        portalTarget: 'overworld_1',
        portalTitle: 'ASCEND TO MOLTEN FORGE RAMPARTS',
        portalSubtitle: 'Return to Castle Exterior [Walk In or Press E]',
        portalColor: 0x44ddff,
        openSky: false,
        enemyPool: ['gargoyle', 'skeleton', 'fire_imp', 'dread_knight']
      },
      stage2: {
        id: 'stage2',
        name: 'STAGE II: THE MOLTEN FORGE',
        elevationLabel: 'Deep Foundry Keep (250m)',
        fogColor: 0x1a0804,
        fogDensity: 0.013,
        ambientColor: 0x5c3222,
        hemiSky: 0xff8844,
        hemiGround: 0x281008,
        dirColor: 0xffbb77,
        wallTheme: 'lava',
        floorTheme: 'lava',
        hazardType: 'lava',
        trimColor: 0xff8800,
        portalTarget: 'overworld_2',
        portalTitle: 'ASCEND TO ALCHEMICAL SANCTUM',
        portalSubtitle: 'Return to Castle Exterior [Walk In or Press E]',
        portalColor: 0xff6622,
        openSky: false,
        enemyPool: ['fire_imp', 'gargoyle', 'skeleton', 'dread_knight']
      },
      stage3: {
        id: 'stage3',
        name: 'STAGE III: THE ALCHEMICAL SANCTUM',
        elevationLabel: 'Mid-Tower Keep (450m)',
        fogColor: 0x061410,
        fogDensity: 0.013,
        ambientColor: 0x325248,
        hemiSky: 0x55ffcc,
        hemiGround: 0x1e1828,
        dirColor: 0xaaffee,
        wallTheme: 'sanctum',
        floorTheme: 'stone',
        hazardType: 'acid',
        trimColor: 0x33ff88,
        portalTarget: 'overworld_3',
        portalTitle: 'ASCEND TO GLACIAL AQUEDUCT',
        portalSubtitle: 'Return to Castle Exterior [Walk In or Press E]',
        portalColor: 0x33ff88,
        openSky: false,
        enemyPool: ['skeleton', 'frost_wraith', 'gargoyle', 'dread_knight']
      },
      stage4: {
        id: 'stage4',
        name: 'STAGE IV: THE GLACIAL AQUEDUCT',
        elevationLabel: 'Upper Castle Keep (700m)',
        fogColor: 0x061224,
        fogDensity: 0.012,
        ambientColor: 0x3c5882,
        hemiSky: 0x77ddff,
        hemiGround: 0x1a2438,
        dirColor: 0xcceeff,
        wallTheme: 'ice',
        floorTheme: 'ice',
        hazardType: 'frost',
        trimColor: 0x00eeff,
        portalTarget: 'overworld_4',
        portalTitle: 'ASCEND TO HIGH SPIRE SUMMIT',
        portalSubtitle: 'Return to Castle Exterior [Walk In or Press E]',
        portalColor: 0x00eeff,
        openSky: true,
        enemyPool: ['frost_wraith', 'fire_imp', 'skeleton', 'dread_knight']
      },
      stage5: {
        id: 'stage5',
        name: 'STAGE V: ASTRAL SPIRE SANCTUM',
        elevationLabel: 'Castle Pinnacle (1000m)',
        fogColor: 0x0d061a,
        fogDensity: 0.012,
        ambientColor: 0x4a3670,
        hemiSky: 0xaa77ff,
        hemiGround: 0x221433,
        dirColor: 0xeedbff,
        wallTheme: 'sanctum',
        floorTheme: 'ice',
        hazardType: 'void',
        trimColor: 0xaa55ff,
        portalTarget: 'overworld_4',
        portalTitle: 'RETURN TO SPIRE SUMMIT',
        portalSubtitle: 'Castle Exterior (1000m) [Walk In or Press E]',
        portalColor: 0x8844ff,
        openSky: true,
        isBossStage: true,
        enemyPool: ['gargoyle', 'fire_imp', 'frost_wraith', 'skeleton', 'dread_knight']
      }
    };

    const biome = biomeConfigs[stageId] || biomeConfigs.stage1;
    const CELL_STRIDE = 38; // 38 units between grid centers to accommodate small (11m) to colossal (28m) rooms

    const platformPatterns = ['DIAMOND_ASCENT', 'ZIGZAG_GAUNTLET', 'TWIN_SPIRAL_STONES', 'OBELISK_LEAP'];
    const chosenPlatformPattern = this.pick(platformPatterns);

    const allWingCells = [
      { gx: -1, gz: 0 },
      { gx: 1, gz: 0 },
      { gx: -1, gz: -1 },
      { gx: 1, gz: -1 },
      { gx: -1, gz: -2 },
      { gx: 1, gz: -2 },
      { gx: -1, gz: -3 },
      { gx: 1, gz: -3 }
    ];

    const spineCells = [
      { gx: 0, gz: 0 },
      { gx: 0, gz: -1 },
      { gx: 0, gz: -2 },
      { gx: 0, gz: -3 }
    ];

    const selectedWings = this.shuffle(allWingCells).slice(0, 4);
    const activeCells = [...spineCells, ...selectedWings];

    const cellKey = (gx, gz) => `${gx},${gz}`;
    const cellMap = new Map();

    // Distinct Room Size & Archetype Profiles (Small, Compact Alcove, Wide Gallery, Deep Cloister, Large Great Hall)
    const variedRoomProfiles = this.shuffle([
      { archetype: 'ALCHEMICAL_CAULDRON_LAB', sizeClass: 'SMALL', w: 12, d: 12, wallH: 7.4 },
      { archetype: 'CRYSTAL_RELIQUARY', sizeClass: 'SMALL', w: 13, d: 11, wallH: 7.6 },
      { archetype: 'ARCANE_LIBRARY', sizeClass: 'WIDE_GALLERY', w: 24, d: 14, wallH: 9.0 },
      { archetype: 'PILLAR_SANCTUARY', sizeClass: 'DEEP_CLOISTER', w: 14, d: 24, wallH: 9.2 },
      { archetype: 'BRAZIER_ARMORY', sizeClass: 'LARGE', w: 25, d: 23, wallH: 10.6 },
      { archetype: 'RITUAL_SKULL_ALTAR', sizeClass: 'SMALL', w: 13, d: 13, wallH: 7.8 }
    ]);

    const lightPalette = [0xffaa55, 0x00eeff, 0xff7733, 0x44ccff, 0xaa66ff, 0x33ff88];
    let profIdx = 0;

    const chasmRow = this.pick([-1, -2]);

    activeCells.forEach((cell, idx) => {
      const { gx, gz } = cell;
      const id =
        gx === 0 && gz === 0
          ? 'entry_hall'
          : gx === 0 && gz === -3
            ? 'north_sanctum'
            : `room_${gx}_${Math.abs(gz)}`;

      let archetype = 'BRAZIER_ARMORY';
      let sizeClass = 'MEDIUM';
      let w = 18;
      let d = 16;
      let wallH = 9.0;
      let y = Number((Math.abs(gz) * 1.15 + (gx !== 0 ? 0.45 : 0)).toFixed(2));

      if (gx === 0 && gz === 0) {
        archetype = 'ENTRY_HALL';
        sizeClass = 'MEDIUM';
        w = 18;
        d = 16;
        wallH = 9.0;
        y = 0.0;
      } else if (gx === 0 && gz === -3) {
        archetype = 'NORTH_GRIMOIRE_SANCTUM';
        sizeClass = 'LARGE';
        w = 26;
        d = 24;
        wallH = 11.2;
        y = 3.4;
      } else if (gx === 0 && gz === chasmRow) {
        archetype = 'CHASM_PLATFORMING_HUB';
        sizeClass = 'COLOSSAL';
        w = 28;
        d = 26;
        wallH = 11.8;
      } else {
        const prof = variedRoomProfiles[profIdx % variedRoomProfiles.length];
        profIdx++;
        archetype = prof.archetype;
        sizeClass = prof.sizeClass;
        w = prof.w;
        d = prof.d;
        wallH = prof.wallH;
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
        lightColor: lightPalette[idx % lightPalette.length],
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

      if (nodeA.gx === nodeB.gx) {
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
      } else if (nodeA.gz === nodeB.gz) {
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

    // 1. Connect the central spine (0,0) -> (0,-1) -> (0,-2) -> (0,-3)
    for (let gz = 0; gz > -3; gz--) {
      addEdge(cellMap.get(cellKey(0, gz)), cellMap.get(cellKey(0, gz - 1)));
    }

    // 2. Connect every selected wing cell to its spine neighbor (0, gz), AND to adjacent wing cells (gx, gz±1)
    selectedWings.forEach(({ gx, gz }) => {
      const wingNode = cellMap.get(cellKey(gx, gz));
      const spineNeighbor = cellMap.get(cellKey(0, gz));
      addEdge(wingNode, spineNeighbor);

      const northWing = cellMap.get(cellKey(gx, gz - 1));
      if (northWing) {
        addEdge(wingNode, northWing);
      }
      const southWing = cellMap.get(cellKey(gx, gz + 1));
      if (southWing) {
        addEdge(wingNode, southWing);
      }
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
