/* One-hop radio exchange. Read every source before writing any recipient. */
(function(root){
 'use strict';
 const distance2=(a,b)=>(a.x-b.x)**2+(a.z-b.z)**2;
 const radioRange=(B,p)=>B.vehicleSpec(p.vehicleId).communicationRange;
 function share(B,players){
  const sources=players.filter(p=>p.hp>0).map(p=>({p,contacts:[...p.intel.contacts].filter(([,c])=>c.visible&&!c.shared),air:[...p.intel.air].filter(([,c])=>c.visible&&!c.shared)}));
  for(const receiver of players){if(receiver.hp<=0)continue;
   for(const source of sources){const sender=source.p;if(sender===receiver||sender.team!==receiver.team)continue;const range=Math.min(radioRange(B,sender),radioRange(B,receiver));if(distance2(sender,receiver)>range*range)continue;
    for(const kind of ['contacts','air'])for(const [id,c]of source[kind]){const own=receiver.intel[kind].get(id);if(own?.visible&&!own.shared)continue;if(own&&own.t>c.t)continue;receiver.intel[kind].set(id,{...c,thermal:false,shared:true,sourceId:sender.id});}
   }
  }
 }
 const api={share,radioRange,distance2};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.BlindfireTeamRecon=api;
})(typeof window!=='undefined'?window:globalThis);
