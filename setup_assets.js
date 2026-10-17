import fs from 'fs';
import path from 'path';

const assetsDir = path.resolve('public/assets');
const files = fs.readdirSync(assetsDir);

const mapping = {
  'wizard_hands_cast': 'wizard_hands_cast.jpg',
  'wizard_staff_cast': 'wizard_staff_cast.jpg',
  'gargoyle_enemy': 'gargoyle_enemy.jpg',
  'skeleton_sorcerer': 'skeleton_sorcerer.jpg',
  'arcane_eye_enemy': 'arcane_eye_enemy.jpg',
  'pickups_and_props': 'pickups_and_props.jpg',
  'spell_projectiles': 'spell_projectiles.jpg',
  'castle_stone_wall': 'castle_stone_wall.jpg',
  'castle_floor_tiles': 'castle_floor_tiles.jpg',
  'castle_door_pbr': 'castle_door_pbr.jpg',
  'magic_portal_vortex': 'magic_portal_vortex.jpg',
  'castle_stained_glass': 'castle_stained_glass.jpg',
  'alchemy_cauldron': 'alchemy_cauldron.jpg'
};

for (const file of files) {
  for (const [key, target] of Object.entries(mapping)) {
    if (file.startsWith(key) && file.endsWith('.jpg') && file !== target) {
      fs.copyFileSync(path.join(assetsDir, file), path.join(assetsDir, target));
      console.log(`Copied ${file} -> ${target}`);
    }
  }
}

console.log('Assets processed successfully!');
