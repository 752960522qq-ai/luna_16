(function(root){'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function tuning(rankIndex=0,lossStreak=0,variation=0){const rank=clamp(Number(rankIndex)||0,0,17),loss=clamp(Number(lossStreak)||0,0,10);const relief=Math.min(.22,Math.max(0,loss-1)*.055);const skill=clamp(.22+rank/17*.58-relief+clamp(variation,-.06,.06),.18,.82);return{skill,reaction:.8-skill*.55,aimError:.034-skill*.032,fireDelay:1.3-skill*.9,interceptChance:.18+skill*.48};}
const api={tuning};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.BlindfireBotBalance=api;
})(typeof window!=='undefined'?window:globalThis);
