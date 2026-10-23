import type Phaser from "phaser";
import type { FishingSpot } from "./fishingSpot";
import type { ParsedMap } from "../../data/maps/farm01.types";
import type { Season } from "../../domain/models/types";
import { planPondAccents, type PondAccents } from "./pondComposition";

/** Water-only visual accents; no terrain, collision or stored state. */
export class PondLife {
  private readonly water: Phaser.GameObjects.Graphics;
  private readonly line: Phaser.GameObjects.Graphics;
  private readonly plants: Phaser.GameObjects.Graphics;
  private readonly sign: Phaser.GameObjects.Text;
  private readonly accents: PondAccents;
  private elapsed=0;
  constructor(scene:Phaser.Scene,world:ParsedMap) {
    this.accents=planPondAccents(world);
    this.water=scene.add.graphics().setDepth(1.05);
    this.plants=scene.add.graphics().setDepth(1.35);
    this.line=scene.add.graphics().setDepth(18);
    this.sign=scene.add.text(784,509,"池畔垂钓 · F",{fontFamily:"monospace",fontSize:"10px",color:"#e6d4a9",backgroundColor:"#51412c",padding:{x:4,y:3}}).setOrigin(.5,1).setDepth(19);
    this.update(0);
  }
  update(delta:number,season:Season="spring",minute=720,weather="sunny"):void {
    if(Number.isFinite(delta)) this.elapsed+=Math.max(0,Math.min(100,delta))/1000;
    this.water.clear().fillStyle(0x244e50,.20);
    for(const [index,{x,y}] of this.accents.fish.entries()){
      const xx=Math.round(x+Math.sin(this.elapsed*.6+index*2)*4);
      this.water.fillEllipse(xx,y,11,3).fillTriangle(xx+4,y,xx+8,y-2,xx+8,y+2);
      const ring=8+((this.elapsed+index*2)%4)*3;
      this.water.lineStyle(1,0xc2d8c1,.12).strokeEllipse(x,y-5,ring,Math.round(ring/3));
    }
    this.plants.clear();
    const winter=season==="winter", autumn=season==="autumn";
    const stem=winter?0x9b9f84:autumn?0x8a8244:0x738b48;
    const leaf=winter?0x9ca590:autumn?0xa39555:0x91a561;
    for(const [index,{x,y}] of this.accents.reeds.entries()){
      const sway=Math.round(Math.sin(this.elapsed*.85+index)*1);
      this.plants.fillStyle(0x34554b,.4).fillEllipse(x,y+5,17,5);
      this.plants.lineStyle(2,stem,1);
      for(const dx of [-5,0,5]) this.plants.lineBetween(x+dx,y+5,x+dx+sway,y-5-(dx===0?4:0));
      this.plants.lineStyle(1,leaf,1).lineBetween(x,y+3,x-8+sway,y-3).lineBetween(x+4,y+2,x+9+sway,y-5);
      this.plants.fillStyle(winter?0xd3c8a3:0x8d683e,1).fillRect(x+sway-1,y-11,3,5);
    }
    if(!winter)for(const [index,{x,y}] of this.accents.lilies.entries()){
      this.plants.fillStyle(0x355a45,.4).fillEllipse(x,y+3,13,5);
      this.plants.fillStyle(autumn?0x8f8e4b:0x6d934f,1).fillEllipse(x,y,12,7);
      this.plants.lineStyle(1,leaf,1).lineBetween(x-3,y-1,x+3,y-1);
      this.plants.fillStyle(0x466d65,1).fillTriangle(x,y,x+6,y-4,x+6,y);
      if(index===0) this.plants.fillStyle(0xdcc59b,1).fillRect(x-2,y-4,3,2);
    }
    if(!winter && weather!=="rain" && minute>=420 && minute<1080 && this.accents.fish.length){
      const home=this.accents.fish[0], x=Math.round(home.x+Math.sin(this.elapsed*.7)*7), y=Math.round(home.y-6+Math.cos(this.elapsed*.5)*3);
      this.plants.fillStyle(0xd8d6a7,.7).fillRect(x-4,y-1,3,1).fillRect(x+2,y-1,3,1);
      this.plants.fillStyle(0x626c43,1).fillRect(x,y-2,1,4);
    }
  }
  cast(player:{x:number;y:number},spot:FishingSpot|null,phase:string):void {
    this.line.clear();
    if(!spot || phase==="idle" || phase==="escaped" || phase==="caught")return;
    this.line.lineStyle(2,0x8e693e,1).lineBetween(player.x+7,player.y+5,player.x+22,player.y-19);
    this.line.lineStyle(1,0xe8dbb5,.85).lineBetween(player.x+22,player.y-19,spot.x,spot.y);
    if(phase==="bite") this.line.lineStyle(1,0xe7d59c,.8).strokeEllipse(spot.x,spot.y,17,7);
    this.line.fillStyle(0x51432c,1).fillRect(spot.x-3,spot.y-5,6,9);
    this.line.fillStyle(0xd58854,1).fillRect(spot.x-2,spot.y-4,4,4);
    this.line.fillStyle(0xf0e3b9,1).fillRect(spot.x-2,spot.y,4,3);
  }
  destroy():void {this.water.destroy();this.plants.destroy();this.line.destroy();this.sign.destroy();}
}
