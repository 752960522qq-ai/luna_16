(function(root){
'use strict';
const day=now=>Math.floor((Number(now)+28800000)/86400000);
const COINS=[100,150,200,250,300,350,500],GOLD=[20,30,40,50,60,70,100];
function normalize(s){return {lastDay:Number.isSafeInteger(s?.lastDay)?s.lastDay:null,streak:Number.isSafeInteger(s?.streak)&&s.streak>=0?s.streak:0,total:Number.isSafeInteger(s?.total)&&s.total>=0?s.total:0};}
function status(state,now=Date.now()){
 const s=normalize(state),today=day(now),available=s.lastDay===null||today>s.lastDay;
 const next=s.lastDay===today-1?s.streak+1:1;
 const cycleDay=available?(next-1)%7+1:Math.max(0,s.streak-1)%7+1;
 return {...s,today,available,next,cycleDay,coins:COINS[cycleDay-1],gold:GOLD[cycleDay-1]};
}
function claim(state,watchedDay,now=Date.now()){
 const s=status(state,now);
 if(!s.available)return {ok:false,reason:'今日已领取或设备日期异常'};
 if(watchedDay!==s.today)return {ok:false,reason:'日期已切换，请重新观看今日视频'};
 return {ok:true,coins:s.coins,gold:s.gold,state:{lastDay:s.today,streak:s.next,total:s.total+1}};
}
const api={day,status,claim,normalize,COINS,GOLD};root.BlindfireVideoEvent=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
