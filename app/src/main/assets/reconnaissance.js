(function(root){'use strict';
 function bushes(map,buildings){if(map==='city')return[];let seed=94217;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},patches=[];for(let i=0;i<180;i++){const x=35+random()*1930,z=35+random()*1930,radius=9+random()*12;if(buildings.some(b=>Math.abs(x-b.x)<b.w/2+radius&&Math.abs(z-b.z)<b.d/2+radius))continue;patches.push({x,z,radius});}return patches;}
 function hidden(target,patches,time){return !!target.vehicleId&&target.hp>0&&(target.revealedUntil||0)<=time&&patches.some(b=>Math.hypot(target.x-b.x,target.z-b.z)<=b.radius);}
 const api={bushes,hidden};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.BlindfireRecon=api;
})(typeof window!=='undefined'?window:globalThis);
