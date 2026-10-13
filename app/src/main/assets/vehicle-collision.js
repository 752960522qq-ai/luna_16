/* Oriented ground collision: broad-phase rejection before exact footprint tests. */
(function(root){
 'use strict';
 function create({vehicleSpec,BUILDINGS,TREES,bounds,inLake,lakeOverlap}){
  return function vehicleClear(x,z,p){
    const {W,H}=bounds(),spec=vehicleSpec(p.vehicleId),d=spec.dimensions,hw=d.width/2,hl=d.length/2,c=Math.cos(p.yaw),s=Math.sin(p.yaw),offset=spec.collisionOffset||0;x+=s*offset;z-=c*offset;
    const ex=Math.abs(c)*hw+Math.abs(s)*hl,ez=Math.abs(s)*hw+Math.abs(c)*hl;
    if(x-ex<18||x+ex>W-18||z-ez<18||z+ez>H-18)return false;
    for(const b of BUILDINGS){
      const dx=b.x-x,dz=b.z-z;
      if(Math.abs(dx)<ex+b.w/2&&Math.abs(dz)<ez+b.d/2&&
        Math.abs(c*dx+s*dz)<hw+Math.abs(c)*b.w/2+Math.abs(s)*b.d/2&&
        Math.abs(s*dx-c*dz)<hl+Math.abs(s)*b.w/2+Math.abs(c)*b.d/2)return false;
    }
    for(const t of TREES){const dx=t.x-x,dz=t.z-z;if(Math.abs(dx)>ex+t.radius||Math.abs(dz)>ez+t.radius)continue;const lx=c*dx+s*dz,lz=s*dx-c*dz;
      if(Math.hypot(Math.max(0,Math.abs(lx)-hw),Math.max(0,Math.abs(lz)-hl))<t.radius)return false;
    }
    if(lakeOverlap(x,z,ex,ez))for(const sx of[-1,0,1])for(const sz of[-1,0,1])if(inLake(x+c*hw*sx+s*hl*sz,z+s*hw*sx-c*hl*sz))return false;
    return true;
  }
;
 }
 const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.BlindfireCollision=api;
})(typeof window!=='undefined'?window:globalThis);
