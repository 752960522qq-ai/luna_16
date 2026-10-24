/* Local garage and earned battle currency. No online account or payment service. */
(function(root){
 'use strict';
 const B=typeof module!=='undefined'&&module.exports?require('./engine.js'):root.Blindfire;
 const Honors=typeof module!=='undefined'&&module.exports?require('./honors.js'):root.BlindfireHonors;
 const Video=typeof module!=='undefined'&&module.exports?require('./video-event.js'):root.BlindfireVideoEvent;
 const CheckIn=typeof module!=='undefined'&&module.exports?require('./check-in.js'):root.BlindfireCheckIn;
 const Cosmetics=typeof module!=='undefined'&&module.exports?require('./cosmetics.js'):root.BlindfireCosmetics;
 const KEY='bf-profile-v1',REWARDS=Object.freeze({win:100,draw:50,loss:25}),INFINITE_COINS=Number.MAX_SAFE_INTEGER;
 const purchaseCost=v=>({currency:v.currency==='gold'?'gold':'coins',amount:v.price||0});
 const rewardMultiplier=v=>v.rewardMultiplier===1.2?1.2:1;
 class Progress{
  constructor(storage,options={}){
   this.storage=storage;this.infiniteCoins=options.infiniteCoins===true||options.fullUnlockTest===true;this.fullUnlockTest=options.fullUnlockTest===true;this.saved=true;this.renameCards=0;this.pendingRename=null;this.coins=0;this.gold=0;this.owned=[B.DEFAULT_VEHICLE];this.selected=B.DEFAULT_VEHICLE;this.claimed=[];this.tutorialDone=false;this.research={missile:0,artillery:0,tank:0};this.researched=Object.values(B.VEHICLES).filter(v=>!v.researchCost).map(v=>v.id);this.lastResearch=0;this.checkIn=CheckIn.normalize(null);this.videoEvent=Video.normalize(null);this.honors=Honors.normalize(null);
   try{const data=JSON.parse(storage?.getItem(KEY)||'null');if(data?.version===1||data?.version===2){
    this.checkIn=CheckIn.normalize(data.checkIn);this.videoEvent=Video.normalize(data.videoEvent);this.honors=Honors.normalize(data.honors);
    this.renameCards=Number.isSafeInteger(data.renameCards)&&data.renameCards>=0?data.renameCards:0;this.pendingRename=data.pendingRename&&typeof data.pendingRename.name==='string'?data.pendingRename:null;
    this.tutorialDone=data.tutorialDone===true;
    for(const branch of Object.keys(this.research))this.research[branch]=Number.isSafeInteger(data.research?.[branch])&&data.research[branch]>=0?data.research[branch]:0;
    this.researched=[...new Set([...this.researched,...(Array.isArray(data.researched)?data.researched.filter(id=>Object.hasOwn(B.VEHICLES,id)):[])])];
    this.gold=Number.isSafeInteger(data.gold)&&data.gold>=0?data.gold:0;
    this.coins=Number.isSafeInteger(data.coins)&&data.coins>=0?data.coins:0;
    this.owned=[...new Set([B.DEFAULT_VEHICLE,...(Array.isArray(data.owned)?data.owned.filter(id=>Object.hasOwn(B.VEHICLES,id)):[])])];
    this.researched=[...new Set([...this.researched,...this.owned])];
    this.selected=this.owned.includes(data.selected)?data.selected:B.DEFAULT_VEHICLE;
    this.claimed=Array.isArray(data.claimed)?data.claimed.filter(id=>typeof id==='string'&&id.length<=128).slice(-100):[];
   }}catch(_){this.saved=false;}
   try{this.custom=Cosmetics.normalize(JSON.parse(storage?.getItem(KEY)||'null')?.custom,this.owned);}catch(_){this.custom=Cosmetics.normalize(null,this.owned);}
   if(this.fullUnlockTest){this.unlockAllForTesting();}else if(this.infiniteCoins){this.coins=INFINITE_COINS;this.save();}
  }
  unlockAllForTesting(){this.researched=Object.keys(B.VEHICLES);this.owned=Object.keys(B.VEHICLES);for(const branch of Object.keys(this.research))this.research[branch]=INFINITE_COINS;this.coins=INFINITE_COINS;this.gold=INFINITE_COINS;this.tutorialDone=true;this.save();}
  save(){try{if(!this.storage)throw Error('Storage unavailable');this.storage.setItem(KEY,JSON.stringify({version:2,custom:this.custom,renameCards:this.renameCards,pendingRename:this.pendingRename,videoEvent:this.videoEvent,honors:this.honors,checkIn:this.checkIn,research:this.research,researched:this.researched,coins:this.coins,gold:this.gold,owned:this.owned,selected:this.selected,claimed:this.claimed,tutorialDone:this.tutorialDone}));this.saved=true;}catch(_){this.saved=false;}return this.saved;}
  claimCheckIn(now=Date.now()){
   const fresh=new Progress(this.storage),result=CheckIn.claim(fresh.checkIn,now);if(!result.ok)return result;
   const keys=['coins','gold','owned','researched','research','claimed','tutorialDone','selected','checkIn'],before={};for(const k of keys)before[k]=this[k];
   for(const k of ['research','claimed','tutorialDone'])this[k]=fresh[k];this.coins=this.infiniteCoins?INFINITE_COINS:Math.min(INFINITE_COINS,fresh.coins+result.coins);this.gold=this.fullUnlockTest?INFINITE_COINS:Math.min(INFINITE_COINS,fresh.gold+result.gold);this.owned=[...new Set([...fresh.owned,...(result.gift?['grand_judicator']:[])])];this.researched=[...new Set([...fresh.researched,...this.owned])];this.checkIn=result.state;if(!this.save()){Object.assign(this,before);return{ok:false,reason:'保存失败，请重试'};}return result;
  }
  claimVideoReward(watchedDay,now=Date.now()){
   const fresh=new Progress(this.storage),r=Video.claim(fresh.videoEvent,watchedDay,now);if(!r.ok)return r;
   const old={coins:this.coins,gold:this.gold,videoEvent:this.videoEvent};
   this.coins=this.infiniteCoins?INFINITE_COINS:Math.min(INFINITE_COINS,fresh.coins+r.coins);this.gold=this.fullUnlockTest?INFINITE_COINS:Math.min(INFINITE_COINS,fresh.gold+r.gold);this.videoEvent=r.state;
   if(!this.save()){Object.assign(this,old);return {ok:false,reason:'奖励保存失败，请重试保存，无需重复观看'};}return r;
  }
  buyRenameCard(){if(this.coins<9999)return{ok:false,error:'战币不足，需要9999战币'};const old={coins:this.coins,renameCards:this.renameCards};this.coins=this.infiniteCoins?INFINITE_COINS:this.coins-9999;this.renameCards++;if(!this.save()){Object.assign(this,old);return{ok:false,error:'购买保存失败，请重试'};}return{ok:true};}
  researchVehicle(id){const v=B.VEHICLES[id];if(!v||this.researched.includes(id)||this.research[v.branch]<v.researchCost)return false;this.research[v.branch]-=v.researchCost;this.researched.push(id);this.save();return true;}
  purchase(id){
   const v=B.VEHICLES[id];if(!v||!this.researched.includes(id)||this.owned.includes(id))return false;
   const {currency,amount}=purchaseCost(v);if(!Number.isSafeInteger(amount)||amount<=0||this[currency]<amount)return false;
   this[currency]-=amount;this.owned.push(id);
   if(this.infiniteCoins&&currency==='coins'||this.fullUnlockTest&&currency==='gold')this[currency]=INFINITE_COINS;
   this.syncCosmetics();this.save();return true;
  }
  completeTutorial(){if(this.tutorialDone)return 0;this.tutorialDone=true;const amount=this.reward('tutorial-first-completion','win');this.save();return amount;}
  equip(id){if(!this.owned.includes(id)||!Object.hasOwn(B.VEHICLES,id))return false;this.selected=id;this.save();return true;}
  reward(round,outcome,battle={}){
   this.lastResearch=0;
   if(typeof round!=='string'||!round||round.length>128||!Object.hasOwn(REWARDS,outcome)||this.claimed.includes(round))return 0;
   const v=B.vehicleSpec(battle.vehicleId),tier=B.clamp(Math.floor(battle.roomTier||v.tier),1,8),stats=battle.stats||{},safe=n=>Number.isFinite(n)?B.clamp(n,0,100000):0;
   const supplied=Array.isArray(battle.contributions)?battle.contributions.filter(c=>c&&Object.hasOwn(B.VEHICLES,c.vehicleId)).slice(0,4):[];
   const parts=supplied.length?supplied:[{vehicleId:battle.vehicleId,stats}],scale=1+(tier-1)*.5;let coins=0;const research={};
   for(const part of parts){const car=B.vehicleSpec(part.vehicleId),s=part.stats||{},performance=Math.floor(safe(s.damage)*.2+safe(s.detections)*3+safe(s.intercepted)*12),bonus=rewardMultiplier(car);
    coins+=(REWARDS[outcome]/parts.length+performance)*scale*bonus;
    if(Object.hasOwn(B.VEHICLES,part.vehicleId))research[car.branch]=(research[car.branch]||0)+((outcome==='win'?40:outcome==='draw'?25:15)/parts.length+performance*.5)*scale*bonus;
   }
   const gross=Math.round(coins),amount=this.infiniteCoins?gross:Math.min(gross,Number.MAX_SAFE_INTEGER-this.coins);
   for(const [branch,rp]of Object.entries(research)){const earned=Math.min(Math.round(rp),Number.MAX_SAFE_INTEGER-this.research[branch]);this.research[branch]+=earned;this.lastResearch+=earned;}
   this.coins=this.infiniteCoins?INFINITE_COINS:this.coins+amount;this.claimed.push(round);this.claimed=this.claimed.slice(-100);this.save();return amount;
  }
 }
 Cosmetics.install(Progress,B);
 const api={Progress,REWARDS,KEY,purchaseCost,rewardMultiplier};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.BlindfireProgress=api;
})(typeof window!=='undefined'?window:globalThis);
