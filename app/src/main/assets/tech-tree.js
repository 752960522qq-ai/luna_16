const B=window.Blindfire;
export const RESEARCH_PARENTS={silver_valkyrie:'annihilator_fv',kfz_artillery:'gladiator_kfz',warhorse:'b_tank',annihilator_fv:'handlv_missile',black_turtle:'annihilator_fv',hero_tank:'warhorse',cougar_artillery:'kfz_artillery',longnose_artillery:'cougar_artillery'};
function vehicleMarkup(profile,v){
 const owned=profile.owned.includes(v.id),researched=profile.researched.includes(v.id),ready=profile.research[v.branch]>=v.researchCost;
 const currency=v.currency==='gold'?'金条':'战币';
 return `<article class="tech-slot tech-node ${owned?'owned':researched?'researched':'locked'}"><button class="tech-detail" id="tech-info-${v.id}" aria-label="查看${v.name}"><img src="models/thumbs/${v.id}.webp" alt="" width="96" height="48"><b>${v.name}</b><small>${v.tier}级 · ${owned?'已拥有':researched?(v.currency==='gold'?'金条车':'已研发'):v.researchCost+'研发点'}</small></button>${!researched?`<button class="tech-research" id="research-${v.id}" ${ready?'':'disabled'}>研发</button>`:!owned?`<button class="tech-research" id="tech-buy-${v.id}">购买 · ${v.price}${currency}</button>`:''}</article>`;
}
export function techTreeMarkup(profile){
 return `<h3>载具研发</h3><div class="tech-scroll"><div class="tech-tree">${Object.entries(B.BRANCHES).map(([branch,name])=>{
  const vs=Object.values(B.VEHICLES).filter(v=>v.branch===branch).sort((a,b)=>a.tier-b.tier),first=vs[0],last=vs.at(-1);
  return `<section class="tech-branch"><header><b>${name}</b><span>${profile.research[branch]} 研发点</span></header><div class="tech-track" style="--line-start:${(first.tier-1)*124+62}px;--line-length:${(last.tier-first.tier)*124}px">${[1,2,3,4,5,6,7,8].map(tier=>{
   const sameTier=vs.filter(v=>v.tier===tier);
   return sameTier.length?`<div class="tech-tier">${sameTier.map(v=>vehicleMarkup(profile,v)).join('')}</div>`:`<div class="tech-slot tech-empty"><span>${tier}级</span></div>`;
  }).join('')}</div></section>`;
 }).join('')}</div></div><button id="techBack" class="btn secondary">返回仓库</button>`;
}
