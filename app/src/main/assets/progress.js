/* Local garage and earned battle currency. No online account or payment service. */
(function(root){
 'use strict';
 const B=typeof module!=='undefined'&&module.exports?require('./engine.js'):root.Blindfire;
 const KEY='bf-profile-v1',REWARDS=Object.freeze({win:100,draw:50,loss:25}),INFINITE_COINS=Number.MAX_SAFE_INTEGER;
 class Progress{
  constructor(storage,options={}){
   this.storage=storage;this.infiniteCoins=options.infiniteCoins===true;this.saved=true;this.coins=0;this.owned=[B.DEFAULT_VEHICLE];this.selected=B.DEFAULT_VEHICLE;this.claimed=[];this.tutorialDone=false;this.research={missile:0,artillery:0,tank:0};this.researched=Object.values(B.VEHICLES).filter(v=>!v.researchCost).map(v=>v.id);this.lastResearch=0;
   try{const data=JSON.parse(storage?.getItem(KEY)||'null');if(data?.version===1||data?.version===2){
    this.tutorialDone=data.tutorialDone===true;
    for(const branch of Object.keys(this.research))this.research[branch]=Number.isSafeInteger(data.research?.[branch])&&data.research[branch]>=0?data.research[branch]:0;
    this.researched=[...new Set([...this.researched,...(Array.isArray(data.researched)?data.researched.filter(id=>Object.hasOwn(B.VEHICLES,id)):[])])];
    this.coins=Number.isSafeInteger(data.coins)&&data.coins>=0?data.coins:0;
    this.owned=[...new Set([B.DEFAULT_VEHICLE,...(Array.isArray(data.owned)?data.owned.filter(id=>Object.hasOwn(B.VEHICLES,id)):[])])];
    this.researched=[...new Set([...this.researched,...this.owned])];
    this.selected=this.owned.includes(data.selected)?data.selected:B.DEFAULT_VEHICLE;
    this.claimed=Array.isArray(data.claimed)?data.claimed.filter(id=>typeof id==='string'&&id.length<=128).slice(-100):[];
   }}catch(_){this.saved=false;}
   if(this.infiniteCoins){this.coins=INFINITE_COINS;this.save();}
  }
  save(){try{if(!this.storage)throw Error('Storage unavailable');this.storage.setItem(KEY,JSON.stringify({version:2,research:this.research,researched:this.researched,coins:this.coins,owned:this.owned,selected:this.selected,claimed:this.claimed,tutorialDone:this.tutorialDone}));this.saved=true;}catch(_){this.saved=false;}return this.saved;}
  researchVehicle(id){const v=B.VEHICLES[id];if(!v||this.researched.includes(id)||this.research[v.branch]<v.researchCost)return false;this.research[v.branch]-=v.researchCost;this.researched.push(id);this.save();return true;}
  purchase(id){const v=B.VEHICLES[id];if(!v||!this.researched.includes(id)||!v.price||this.owned.includes(id)||this.coins<v.price)return false;this.coins-=v.price;this.owned.push(id);if(this.infiniteCoins)this.coins=INFINITE_COINS;this.save();return true;}
  completeTutorial(){if(this.tutorialDone)return 0;this.tutorialDone=true;const amount=this.reward('tutorial-first-completion','win');this.save();return amount;}
  equip(id){if(!this.owned.includes(id)||!Object.hasOwn(B.VEHICLES,id))return false;this.selected=id;this.save();return true;}
  reward(round,outcome,battle={}){
   this.lastResearch=0;
   if(typeof round!=='string'||!round||round.length>128||!Object.hasOwn(REWARDS,outcome)||this.claimed.includes(round))return 0;
   const v=B.vehicleSpec(battle.vehicleId),tier=B.clamp(Math.floor(battle.roomTier||v.tier),1,4),stats=battle.stats||{},safe=n=>Number.isFinite(n)?B.clamp(n,0,100000):0;
   const performance=Math.floor(safe(stats.damage)*.2+safe(stats.detections)*3+safe(stats.intercepted)*12);
   const gross=Math.round((REWARDS[outcome]+performance)*(1+(tier-1)*.5));
   const amount=this.infiniteCoins?gross:Math.min(gross,Number.MAX_SAFE_INTEGER-this.coins);
   if(battle.vehicleId&&Object.hasOwn(B.VEHICLES,battle.vehicleId)){const rp=Math.round(((outcome==='win'?40:outcome==='draw'?25:15)+performance*.5)*(1+(tier-1)*.5));this.lastResearch=Math.min(rp,Number.MAX_SAFE_INTEGER-this.research[v.branch]);this.research[v.branch]+=this.lastResearch;}
   this.coins=this.infiniteCoins?INFINITE_COINS:this.coins+amount;this.claimed.push(round);this.claimed=this.claimed.slice(-100);this.save();return amount;
  }
 }
 const api={Progress,REWARDS,KEY};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.BlindfireProgress=api;
})(typeof window!=='undefined'?window:globalThis);
