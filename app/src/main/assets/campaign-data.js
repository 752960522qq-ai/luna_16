(function(root){'use strict';
const MODES=Object.freeze([
 {id:'duel',name:'第一滴血',size:1,label:'1v1',engine:'duel'},
 {id:'breakthrough',name:'突破无人区',size:5,label:'5v5',engine:'breakthrough'},
 {id:'survival',name:'黑暗森林（8人大逃杀）',size:1,total:8,freeForAll:true,label:'8人',engine:'dark_forest'}
]);
const banned=['傻b','nmsl','cnm','操逼','操你','草你','傻逼','煞笔','沙比','傻比','妈的','你妈','他妈','尼玛','你爹','狗日','婊子','妓女','鸡巴','阴茎','阴道','色情','性交','强奸','卖淫','约炮','招嫖','六合彩','代充','代练','刷单','加微信','加qq','习近平','fuck','shit','bitch','nigger','admin','管理员','官方客服'];
function validateName(input){if(typeof input!=='string')return{ok:false,error:'请输入昵称'};const name=input.normalize('NFKC').trim();if(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/u.test(name))return{ok:false,error:'昵称包含不可见字符'};if(!/^[\p{Script=Han}a-zA-Z0-9_·]{2,12}$/u.test(name))return{ok:false,error:'昵称需2—12个中文、字母、数字或下划线'};const normalized=name.toLowerCase().replace(/[_·0-9]/g,'');if(banned.some(w=>normalized.includes(w)))return{ok:false,error:'昵称包含不适宜内容，请更换'};return{ok:true,name};}
const mode=id=>MODES.find(x=>x.id===id)||MODES[1];
const kdi=s=>((Number(s?.kills)||0)/Math.max(1,Number(s?.deaths)||0)).toFixed(2);
const playerCount=m=>typeof m==='string'?playerCount(mode(m)):m.total||m.size*2;
const api={MODES,mode,playerCount,validateName,kdi};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.BlindfireCampaign=api;
})(typeof window!=='undefined'?window:globalThis);
