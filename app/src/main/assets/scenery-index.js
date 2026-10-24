/* Static scenery broad phase. Exact collision/visibility tests remain in engine.js. */
(function(root){
 'use strict';
 const EMPTY=Object.freeze([]);
 class SceneryGrid{
  constructor(source,extent,cellSize=100){this.source=source;this.extent=extent;this.cellSize=cellSize;this.cells=new Map();this.length=-1;this.epoch=0;}
  invalidate(){this.length=-1;}
  rebuild(){
   this.cells.clear();const size=this.cellSize;
   for(const item of this.source){const b=this.extent(item),entry={item,stamp:0};
    for(let ix=Math.floor(b[0]/size);ix<=Math.floor(b[2]/size);ix++)for(let iz=Math.floor(b[1]/size);iz<=Math.floor(b[3]/size);iz++){
     const key=ix+','+iz;let bucket=this.cells.get(key);if(!bucket)this.cells.set(key,bucket=[]);bucket.push(entry);
    }
   }
   for(const bucket of this.cells.values())bucket.items=bucket.map(e=>e.item);
   this.length=this.source.length;this.epoch=0;
  }
  bounds(minX,minZ,maxX,maxZ){
   if(this.length!==this.source.length)this.rebuild();
   const size=this.cellSize,x0=Math.floor(minX/size),x1=Math.floor(maxX/size),z0=Math.floor(minZ/size),z1=Math.floor(maxZ/size);
   if(x0===x1&&z0===z1)return this.cells.get(x0+','+z0)?.items||EMPTY;
   const result=[],stamp=++this.epoch;
   for(let ix=Math.floor(minX/size);ix<=Math.floor(maxX/size);ix++)for(let iz=Math.floor(minZ/size);iz<=Math.floor(maxZ/size);iz++)for(const e of this.cells.get(ix+','+iz)||EMPTY){
    if(e.stamp!==stamp){e.stamp=stamp;result.push(e.item);}
   }
   return result;
  }
 }
 const api={SceneryGrid};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.BlindfireScenery=api;
})(globalThis);
