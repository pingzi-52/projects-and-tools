import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getItemVisual } from '../src/game/systems/itemVisual';

it.each(['silver_crucian','sun_carp'])('uses its own fishing atlas frame for %s',id=>{
  expect(getItemVisual(id,(texture,frame)=>texture==='farm-fish-v1'&&frame===id)).toEqual({texture:'farm-fish-v1',frame:id});
});
describe('original fishing icons',()=>{
  it('keeps bounded square atlas cells on a real RGBA PNG',()=>{
    const base=new URL('../public/farm-assets/original-addons/v9/fish-icons-v1.json',import.meta.url);
    const atlas=JSON.parse(readFileSync(base,'utf8'));
    const png=readFileSync(new URL('../public/farm-assets/original-addons/v9/fish-icons-v1.png',import.meta.url));
    expect(png.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
    const w=png.readUInt32BE(16),h=png.readUInt32BE(20);
    expect(png[25]).toBe(6);expect(w).toBe(h*2);
    expect(atlas.meta.size).toEqual({w,h});
    expect(Object.keys(atlas.frames)).toEqual(['silver_crucian','sun_carp']);
    for(const [i,f] of Object.values(atlas.frames).entries()){
      expect(f.frame).toEqual({x:i*h,y:0,w:h,h});
      expect(f.sourceSize).toEqual({w:h,h});
      expect(f.rotated).toBe(false);
    }
  });
});
