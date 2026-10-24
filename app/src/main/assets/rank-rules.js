(function(root){
'use strict';
const names=['列兵','下士','中士','上士','准尉','少尉','中尉','上尉','少校','中校','上校','大校','准将','少将','中将','上将','大将','元帅'];
const RANKS=Object.freeze(names.map((name,i)=>Object.freeze({name,group:i===0?'士兵':i<4?'士官':i<8?'尉官':i<12?'校官':i<17?'将军':'元帅',stars:i<4?1:i<8?2:i<12?3:i<16?4:i===16?5:Infinity,loss:i<4?0:i<8?.5:1})));
const starts=[0];for(let i=0;i<RANKS.length-1;i++)starts.push(starts.at(-1)+RANKS[i].stars*2);
function describe(points=0){points=Number.isSafeInteger(points)&&points>=0?points:0;let index=0;while(index<17&&points>=starts[index+1])index++;const rank=RANKS[index];return{...rank,index,points,starsEarned:(points-starts[index])/2,starsNeeded:rank.stars,display:rank.name+' '+((points-starts[index])/2)+' / '+(rank.stars===Infinity?'∞':rank.stars)+' 星'};}
function apply(points,outcome){const before=describe(points);if(!['win','loss','draw'].includes(outcome))throw Error('无效的排位结果');const after=describe(Math.max(0,before.points+(outcome==='win'?2:outcome==='loss'?-before.loss*2:0)));return{...after,delta:(after.points-before.points)/2,promoted:after.index>before.index,demoted:after.index<before.index};}
function applyPlacement(points,placement){
 if(!Number.isInteger(placement)||placement<1||placement>8)throw Error('大逃杀名次必须为1至8');
 const before=describe(points),i=before.index;
 const changes=i<5?[2,2,2,2,2,2,0,0]:i<8?[2,2,2,2,0,0,-1,-1]:i<13?[2,2,2,0,0,-1,-1,-2]:i<17?[2,2,0,0,-1,-1,-2,-2]:[2,0,0,-1,-1,-2,-2,-2];
 const change=changes[placement-1],after=describe(Math.max(0,before.points+change));
 return {...after,placement,outcome:change>0?'win':change<0?'loss':'draw',delta:(after.points-before.points)/2,promoted:after.index>before.index,demoted:after.index<before.index};
}
const api={RANKS,starts,describe,apply,applyPlacement};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.BlindfireRanks=api;
})(typeof window!=='undefined'?window:globalThis);
