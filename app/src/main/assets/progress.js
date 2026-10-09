/* Local garage and earned battle currency. No online account or payment service. */
(function(root){
 'use strict';
 const B=typeof module!=='undefined'&&module.exports?require('./engine.js'):root.Blindfire;
 const KEY='bf-profile-v1',REWARDS=Object.freeze({win:100,draw:50,loss:25});
 class Progress{
  constructor(storage){
   this.storage=storage;this.saved=true;this.coins=0;this.owned=[B.DEFAULT_VEHICLE];this.selected=B.DEFAULT_VEHICLE;this.claimed=[];this.tutorialDone=false;
   try{const data=JSON.parse(storage?.getItem(KEY)||'null');if(data?.version===1){
    this.tutorialDone=data.tutorialDone===true;
    this.coins=Number.isSafeInteger(data.coins)&&data.coins>=0?data.coins:0;
    this.owned=[...new Set([B.DEFAULT_VEHICLE,...(Array.isArray(data.owned)?data.owned.filter(id=>Object.hasOwn(B.VEHICLES,id)):[])])];
    this.selected=this.owned.includes(data.selected)?data.selected:B.DEFAULT_VEHICLE;
    this.claimed=Array.isArray(data.claimed)?data.claimed.filter(id=>typeof id==='string'&&id.length<=128).slice(-100):[];
   }}catch(_){this.saved=false;}
  }
  save(){try{if(!this.storage)throw Error('Storage unavailable');this.storage.setItem(KEY,JSON.stringify({version:1,coins:this.coins,owned:this.owned,selected:this.selected,claimed:this.claimed,tutorialDone:this.tutorialDone}));this.saved=true;}catch(_){this.saved=false;}return this.saved;}
  purchase(id){const v=B.VEHICLES[id];if(!v||!v.price||this.owned.includes(id)||this.coins<v.price)return false;this.coins-=v.price;this.owned.push(id);this.save();return true;}
  completeTutorial(){if(this.tutorialDone)return 0;this.tutorialDone=true;const amount=this.reward('tutorial-first-completion','win');this.save();return amount;}
  equip(id){if(!this.owned.includes(id)||!Object.hasOwn(B.VEHICLES,id))return false;this.selected=id;this.save();return true;}
  reward(round,outcome){
   if(typeof round!=='string'||!round||round.length>128||!Object.hasOwn(REWARDS,outcome)||this.claimed.includes(round))return 0;
   const amount=Math.min(REWARDS[outcome],Number.MAX_SAFE_INTEGER-this.coins);
   this.coins+=amount;this.claimed.push(round);this.claimed=this.claimed.slice(-100);this.save();return amount;
  }
 }
 const api={Progress,REWARDS,KEY};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.BlindfireProgress=api;
})(typeof window!=='undefined'?window:globalThis);
