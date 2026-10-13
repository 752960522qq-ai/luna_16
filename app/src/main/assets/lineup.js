const B=window.Blindfire;
export class Lineup{
 constructor(profile,storage){this.profile=profile;this.storage=storage;let ids=[];try{ids=JSON.parse(storage?.getItem('bf-lineup-v1')||'[]');}catch(_){}this.ids=[...new Set([profile.selected,...(Array.isArray(ids)?ids:[])])].filter(id=>profile.owned.includes(id)).slice(0,4);this.preview=this.ids[0];}
 save(){try{this.storage?.setItem('bf-lineup-v1',JSON.stringify(this.ids));}catch(_){}this.profile.equip(this.ids[0]);}
 set(index,id){if(!this.profile.owned.includes(id)||this.ids.includes(id)&&this.ids[index]!==id)return false;this.ids[index]=id;this.ids=this.ids.filter(Boolean).slice(0,4);this.preview=id;this.save();return true;}
 first(id){if(!this.profile.owned.includes(id))return;this.ids=[id,...this.ids.filter(q=>q!==id)].slice(0,4);this.preview=id;this.save();}
 remove(index){if(this.ids.length<=1)return;this.ids.splice(index,1);this.preview=this.ids[0];this.save();}
 markup(items=this.ids.map(id=>({id,destroyed:false})),selectable=true){return Array.from({length:4},(_,i)=>{const v=items[i],spec=v&&B.VEHICLES[v.id];return `<button class="queue-card ${v?.destroyed?'destroyed':''} ${v?.id===this.preview?'chosen':''}" data-slot="${i}" ${v?.destroyed?'disabled':''}>${spec?`<img src="models/thumbs/${v.id}.webp" alt="${spec.name}"><b>${spec.name}</b><small>${v.destroyed?'已损坏':i===0?'首发 · '+spec.tier+'级':spec.tier+'级'}</small>`:'<b>＋</b><small>添加载具</small>'}</button>`;}).join('');}
}
