import * as T from './three.module.js';
// One downsample per source texture/resolution, shared by all distant cells.
// Generated only during scene construction; no canvas work during the render loop.
export class FarSceneryMaterials{
 constructor(canvasFactory=()=>document.createElement('canvas')){this.canvasFactory=canvasFactory;this.materials=new WeakMap();this.maps=new WeakMap();this.ownedMaps=new Set();}
 texture(source,maxSide=128){
  if(!source)return null;
  const image=source.image,width=image?.naturalWidth||image?.videoWidth||image?.width,height=image?.naturalHeight||image?.videoHeight||image?.height;
  if(!width||!height||Math.max(width,height)<=maxSide)return source;
  let sizes=this.maps.get(source);if(!sizes)this.maps.set(source,sizes=new Map());if(sizes.has(maxSide))return sizes.get(maxSide);
  const scale=maxSide/Math.max(width,height),canvas=this.canvasFactory();canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d');if(!ctx)return source;ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const map=source.clone();map.source=new T.Source(canvas);map.mipmaps=[];map.generateMipmaps=true;map.minFilter=T.LinearMipmapLinearFilter;map.magFilter=T.LinearFilter;map.anisotropy=1;map.needsUpdate=true;
  this.ownedMaps.add(map);sizes.set(maxSide,map);return map;
 }
 material(source,maxSide=128){
  let sizes=this.materials.get(source);if(!sizes)this.materials.set(source,sizes=new Map());if(sizes.has(maxSide))return sizes.get(maxSide);
  const material=new T.MeshLambertMaterial({color:source.color||0xffffff,map:this.texture(source.map,maxSide),alphaMap:this.texture(source.alphaMap,maxSide),alphaTest:source.alphaTest,transparent:source.transparent,opacity:source.opacity,side:source.side,depthWrite:source.depthWrite,vertexColors:source.vertexColors,fog:source.fog});
  material.name=(source.name||'scenery')+'-far-'+maxSide;material.userData.farScenery=true;sizes.set(maxSide,material);return material;
 }
 dispose(){for(const map of this.ownedMaps)map.dispose();this.ownedMaps.clear();this.maps=new WeakMap();this.materials=new WeakMap();}
}
