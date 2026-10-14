/* Oriented ground collision: broad-phase rejection before exact footprint tests. */
(function(root){
 'use strict';
 function create({vehicleSpec,BUILDINGS,TREES,ROCKS=[],bounds,inLake,lakeOverlap}){
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
    for(const t of TREES){const dx=(t.collisionX??t.x)-x,dz=(t.collisionZ??t.z)-z;if(Math.abs(dx)>ex+t.radius||Math.abs(dz)>ez+t.radius)continue;const lx=c*dx+s*dz,lz=s*dx-c*dz;
      if(Math.hypot(Math.max(0,Math.abs(lx)-hw),Math.max(0,Math.abs(lz)-hl))<t.radius)return false;
    }
    for(const r of ROCKS)if(overlaps({...p,x:x-s*offset,z:z+c*offset},{x:r.x,z:r.z,yaw:r.yaw,vehicleId:r},vehicleSpec,d=>d))return false;
    if(lakeOverlap(x,z,ex,ez))for(const sx of[-1,0,1])for(const sz of[-1,0,1])if(inLake(x+c*hw*sx+s*hl*sz,z+s*hw*sx-c*hl*sz))return false;
    return true;
  }
;
 }
 function overlaps(a,b,spec,otherSpec=spec){
  const da=spec(a.vehicleId).dimensions,db=otherSpec(b.vehicleId).dimensions||b.vehicleId;
  const ca=Math.cos(a.yaw),sa=Math.sin(a.yaw),cb=Math.cos(b.yaw),sb=Math.sin(b.yaw),oa=spec(a.vehicleId).collisionOffset||0,ob=otherSpec(b.vehicleId).collisionOffset||0;
  const dx=b.x+sb*ob-a.x-sa*oa,dz=b.z-cb*ob-a.z+ca*oa;
  for(const [x,z]of [[ca,sa],[sa,-ca],[cb,sb],[sb,-cb]]){const ra=Math.abs(x*ca+z*sa)*da.width/2+Math.abs(x*sa-z*ca)*da.length/2,rb=Math.abs(x*cb+z*sb)*db.width/2+Math.abs(x*sb-z*cb)*db.length/2;if(Math.abs(dx*x+dz*z)>=ra+rb-1e-6)return false;}return true;
 }
 function segmentBox(a,b,box){
  const c=Math.cos(box.yaw||0),s=Math.sin(box.yaw||0),local=q=>[c*(q.x-box.x)+s*(q.z-box.z),q.y-box.y,s*(q.x-box.x)-c*(q.z-box.z)],p=local(a),q=local(b),lo=[-box.width/2,0,-box.length/2],hi=[box.width/2,box.height,box.length/2];let enter=0,exit=1;
  for(let i=0;i<3;i++){const d=q[i]-p[i];if(Math.abs(d)<1e-9){if(p[i]<lo[i]||p[i]>hi[i])return null;}else{const t=(lo[i]-p[i])/d,u=(hi[i]-p[i])/d;enter=Math.max(enter,Math.min(t,u));exit=Math.min(exit,Math.max(t,u));if(enter>exit)return null;}}
  return {x:a.x+(b.x-a.x)*enter,y:a.y+(b.y-a.y)*enter,z:a.z+(b.z-a.z)*enter,f:enter};
 }
 const api={create,overlaps,segmentBox};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.BlindfireCollision=api;
})(typeof window!=='undefined'?window:globalThis);
