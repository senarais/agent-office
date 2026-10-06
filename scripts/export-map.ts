import { writeFileSync } from 'node:fs';
import { WORLD, rooms, walls, furniture, canStand, spawn } from '../packages/shared/src/world';

const width = WORLD.width / 16, height = WORLD.height / 16;
const tilemap = {
  type: 'map', version: '1.10', tiledversion: '1.11.2', orientation: 'orthogonal', renderorder: 'right-down', infinite: false,
  width, height, tilewidth: 16, tileheight: 16, nextlayerid: 5, nextobjectid: rooms.length + furniture.length + walls.length + 2,
  tilesets: [{ firstgid: 1, name: 'office-collision', tilewidth: 16, tileheight: 16, tilecount: 2, columns: 2, image: 'map-tiles.svg', imagewidth: 32, imageheight: 16 }],
  layers: [
    { id: 1, name: 'Walkability', type: 'tilelayer', width, height, visible: true, opacity: .5, x: 0, y: 0, data: Array.from({ length: width * height }, (_, i) => canStand({ x: (i % width) * 16 + 8, y: Math.floor(i / width) * 16 + 8 }) ? 1 : 2) },
    { id: 2, name: 'Rooms', type: 'objectgroup', visible: true, opacity: 1, objects: rooms.map((r, i) => ({ id: i + 1, name: r.name, type: 'room', x: r.x, y: r.y, width: r.w, height: r.h })) },
    { id: 3, name: 'Furniture', type: 'objectgroup', visible: true, opacity: 1, objects: furniture.map((f, i) => ({ id: rooms.length + i + 1, name: f.id, type: f.kind, x: f.x, y: f.y, width: f.w, height: f.h, properties: [{ name: 'interaction', type: 'string', value: f.action || '' }, { name: 'interactionX', type: 'float', value: f.point?.x || 0 }, { name: 'interactionY', type: 'float', value: f.point?.y || 0 }] })) },
    { id: 4, name: 'Spawn', type: 'objectgroup', visible: true, opacity: 1, objects: [{ id: rooms.length + furniture.length + 1, name: 'Director', type: 'spawn', x: spawn.x, y: spawn.y, point: true }] },
  ],
};
writeFileSync('public/office.tmj', JSON.stringify(tilemap));
console.log('Exported public/office.tmj: Tiled-compatible rooms, furniture, spawn and shared walkability grid.');
