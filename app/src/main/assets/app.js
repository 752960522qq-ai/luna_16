import {techTreeMarkup} from './tech-tree.js';
import {setupH5Viewport} from './h5-viewport.js';
import {canUseGunSight,GUN_SIGHT_ZOOM} from './gun-sight.js';
import { Renderer } from './render.js';
import { GameAudio } from './audio.js';
import { RemoteLink } from './online.js';
import { REMOTE_ENABLED,EDITION } from './net-config.js';
const elementCache=new Map();const $=id=>{if(!elementCache.has(id))elementCache.set(id,document.getElementById(id));return elementCache.get(id);},{Engine,C,clamp,terrain}=window.Blindfire;
const weaponButtons=[...document.querySelectorAll('[data-weapon]')],weaponRow=document.querySelector('.weapon-row');
const weaponParts=new Map(weaponButtons.map(b=>[b,{cooldown:b.querySelector('.cooldown'),label:b.querySelector('small')}]));
const renderer=new Renderer($('world'),$('mini'));
const native=window.Native||null,isTest=new URLSearchParams(location.search).has('test');
const difficultyNames={easy:'新兵',standard:'标准',hard:'困难'};
let battleMode='duel';
let engine=null,view=null,screen='menu',selected='missile',paused=false,difficulty='standard',netRole=null,connected=false,transport=null,remote=null;
let lastFrame=performance.now(),lastSend=0,lastHud=0,lastInput=0,lastPeerAt=0,lastLog=0,oldHp=100,toastUntil=0,modalKind=null,seq=0,remoteSeq=0,commandCount=0,commandWindow=0;
let joystickPointer=null,aimPointer=null,firePointer=null,drag=null,aimTarget=null,damageUntil=0;
const stick={x:0,y:0},keys=new Set(),mapPointers=new Map();let mapGesture=null;
const names={uav:'无人机',missile:'巡航导弹',artillery:'火炮',sam:'防空导弹',mg:'高射机枪',reconPlane:'空中侦查',bomber:'空中支援'};
const {VEHICLES,WEAPONS,DEFAULT_VEHICLE,vehicleSpec,weaponSpec}=window.Blindfire;
let profileStorage=null;try{profileStorage=localStorage;}catch(_){}
const profile=new window.BlindfireProgress.Progress(profileStorage,{infiniteCoins:new URLSearchParams(location.search).get('infiniteCoins')==='1',fullUnlockTest:new URLSearchParams(location.search).get('fullUnlockTest')==='1'});
let lastKill=0;let roundKey=null,roundReward=null,mapAim=false,battleMap='hills',tutorial=null,tutorialRendered=-1;
function beginRewardRound(){lastKill=0;roundKey=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;roundReward=null;}
function walletUI(){$('coinBalance').textContent=profile.coins.toLocaleString('zh-CN');}
function warehouse(){showModal('warehouse',`<span class="eyebrow">GARAGE</span><h3>仓库</h3><button id="openTechTree" class="btn secondary">等级与科技树</button>${profile.owned.map(id=>`<button id="vehicle-${id}" class="vehicle-card"><svg><use href="#i-truck"/></svg><span><b>${escape(VEHICLES[id].name)}</b><small>${profile.selected===id?'当前出战':'已拥有'} · 查看车辆与武器数值</small></span><span>›</span></button>`).join('')}<button id="warehouseClose" class="btn secondary">返回主菜单</button>`,{openTechTree:techTree,warehouseClose:closeModal,...Object.fromEntries(profile.owned.map(id=>[`vehicle-${id}`,()=>vehicleDetails(id)]))});}
function techTree(){showModal('techTree',techTreeMarkup(profile),{techBack:warehouse,...Object.fromEntries(Object.values(VEHICLES).flatMap(v=>[[`research-${v.id}`,()=>{if(profile.researchVehicle(v.id))techTree();}],[`tech-info-${v.id}`,()=>vehicleDetails(v.id)],[`tech-buy-${v.id}`,()=>{if(profile.purchase(v.id)){walletUI();toast(v.name+'已加入仓库');techTree();}}]]))});$('modalCard').classList.add('tech-modal');}

function statRows(rows){return `<dl class="spec-list">${rows.map(([label,value])=>`<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>`;}
function weaponRows(id,vehicleId){const w=weaponSpec({vehicleId},id),rows=[['装填 / 冷却',w.cooldown?`${w.cooldown} 秒`:'无冷却'],['飞行速度',`${w.speed.toFixed(0)} m/s`]];
 if(w.directDamage)rows.push(['直接命中伤害',`${w.directDamage} HP`]);
 if(w.nearDamage)rows.push(['近炸伤害',`${w.nearDamage[0]}–${w.nearDamage[1]} HP`]);
 if(w.blastRadius)rows.push(['爆炸范围',`${w.blastRadius} m`]);
 if(w.range)rows.push(['最大射程',`${w.range} m`]);
 if(id==='artillery'){const r=window.Blindfire.artilleryRanges({vehicleId});rows.push(['最小射程（平地约）',`${r.min} m`],['瞄准方式','连续俯仰；地图选点自动求解可达弹道']);}
 if(id==='autocannon')rows.push(['弹匣','10发'],['射击间隔','0.4秒'],['换弹','5秒']);
 if(id==='spade')rows.push(['展开效果','固定车体，火炮冷却缩短20%'],['收起效果','恢复机动'],['使用次数','不限次数，无冷却']);
 if(id==='repair')rows.push(['使用次数','每局一次'],['维修时间','15秒，禁止移动和攻击'],['维修效果','恢复全部生命值']);
 if(id==='highExplosive')rows.push(['作用','下一发122mm炮弹变为高爆弹'],['爆炸中心伤害',w.directDamage+' HP'],['伤害衰减','随距离线性降低']);
 if(id==='tankCannon')rows.push(['作用','普通弹伤害'+w.directDamage+'、爆炸半径'+w.blastRadius+'米，装填'+w.cooldown+'秒；高爆弹中心伤害'+weaponSpec({vehicleId},'highExplosive').directDamage]);
 if(id==='observation')rows.push(['扇形范围','前方90° / 500m'],['持续时间','8秒']);
 if(w.hp)rows.push(['空中耐久',`${w.hp} HP`]);
 if(w.recon)rows.push(['侦察距离',`${w.recon} m`]);
 if(w.life!=null)rows.push([id==='uav'?'能量续航':'飞行时限',`${w.life} 秒`]);
 if(w.lockRange)rows.push(['自动锁定范围',`${w.lockRange} m`]);
 if(w.airDamage)rows.push(['空中目标伤害',`${w.airDamage} HP / 发`]);
 if(w.groundDamage)rows.push(['车辆伤害',`${w.groundDamage} HP / 发`]);
 if(w.fireInterval)rows.push(['射速',`${Math.round(60/w.fireInterval)} 发 / 分钟`],['理论弹道距离',`${Math.round(w.speed*w.life)} m`]);
 if(id==='reconPlane')rows.push(['操控方式','指定航向后高空直线飞越，不可驾驶'],['地面侦察半径','500 m']);
 if(id==='bomber')rows.push(['操控方式','手动驾驶 / 机腹投弹'],['携带炸弹','1 枚'],['投弹中心伤害','90 HP'],['炸弹爆炸范围','30 m']);
 if(id==='uav')rows.push(['盘旋半径','50 m'],['操控方式','手动飞行 / 自动盘旋']);
 if(id==='missile')rows.push(['操控方式','手动飞行']);
 if(id==='sam')rows.push(['操控方式','发射后自动追踪']);
 if(id==='mg')rows.push(['操控方式','手动瞄准，按住开火']);return rows;}
function vehicleDetails(id){const v=VEHICLES[id];if(!v)return;
 showModal('vehicle',`<span class="eyebrow">VEHICLE / OWNED</span><div class="vehicle-detail-header"><h3>${escape(v.name)}</h3><button id="vehicleBackTop" class="detail-back">返回仓库</button></div><canvas id="vehiclePreview" class="vehicle-preview" aria-label="车辆3D展示，拖动旋转"></canvas><p>${escape(v.description)}</p>${statRows([['乘员',v.crewRoles.map(role=>window.Blindfire.Crew.ROLES[role]).join('、')],['转向 / 加速',`${window.Blindfire.Motion.LABELS[v.turnRating]} / ${window.Blindfire.Motion.LABELS[v.accelerationRating]}`],...(v.mass?[['战斗全重',`${v.mass} t`]]:[]),...(v.turretYaw!==undefined?[['炮塔水平转角',`±${Math.round(v.turretYaw*180/Math.PI)}°`]]:[]),['等级 / 类型',`${v.tier}级 · ${window.Blindfire.BRANCHES[v.branch]}`],...(v.minPitch!==undefined?[['火炮俯仰',`${Math.round(v.minPitch*180/Math.PI)}° 至 +${Math.round(v.maxPitch*180/Math.PI)}°`]]:[]),...(v.launcherYaw!==undefined?[['发射架俯仰','−5° 至 +15°'],['发射架水平旋转','±85°']]:[]),...(v.immunity?[['伤害免疫',`低于${v.immunity} HP的单次伤害`]]:[]),['尺寸',`${v.dimensions.length} × ${v.dimensions.width} × ${v.dimensions.height} m`],['情报留存',`${v.intelLife} 秒`],['血量',`${v.hp} HP`],['最高速度',`${(v.speed*3.6).toFixed(1)} km/h`],['倒车速度',`${(v.reverseSpeed*3.6).toFixed(1)} km/h`],['侦察距离',`${v.recon} m`],['携带武器',v.weapons.map(k=>WEAPONS[k].name).join('、')]])}<h4>武器数值</h4>${v.weapons.map(k=>`<section class="weapon-spec" data-spec="${k}"><h4>${escape(weaponSpec({vehicleId:id},k).name)}</h4>${statRows(weaponRows(k,id))}</section>`).join('')}<button id="equipVehicle" class="btn" ${!profile.owned.includes(id)||profile.selected===id?'disabled':''}>${!profile.owned.includes(id)?'尚未拥有':profile.selected===id?'已设为出战车辆':'设为出战车辆'}</button><button id="vehicleBack" class="btn secondary">返回仓库</button>`,{equipVehicle:()=>{profile.equip(id);vehicleDetails(id);},vehicleBack:warehouse,vehicleBackTop:warehouse});renderer.showPreview($('vehiclePreview'),id);}
try{difficulty=localStorage.getItem('bf-difficulty')||'standard';if(!difficultyNames[difficulty])difficulty='standard';}catch(_){}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const audio=new GameAudio();
try{audio.enabled=localStorage.getItem('bf-sound')!=='off';}catch(_){}
function soundUI(){document.querySelectorAll('.sound-button').forEach(b=>{b.classList.toggle('muted',!audio.enabled);b.setAttribute('aria-label',audio.enabled?'关闭声音':'开启声音');});}
function vibrate(ms){try{if(native&&native.vibrate)native.vibrate(ms);else if(navigator.vibrate)navigator.vibrate(ms);}catch(_){} }
function toast(message){$('toast').textContent=message;$('toast').classList.remove('hidden');toastUntil=performance.now()+2300;}
function showModal(kind,html,handlers={}){elementCache.clear();renderer.hidePreview();modalKind=kind;$('modalCard').classList.toggle('tech-modal',kind==='techTree');$('modalCard').innerHTML=html;$('modal').classList.remove('hidden');for(const[id,fn]of Object.entries(handlers)){const el=$(id);if(el)el.addEventListener('click',fn);}}
function closeModal(){elementCache.clear();renderer.hidePreview();$('modal').classList.add('hidden');$('modalCard').innerHTML='';$('modalCard').classList.remove('tech-modal');modalKind=null;}
function setScreen(next){if(next!=='battle')renderer.gunSight=false;screen=next;$('menu').classList.toggle('hidden',next!=='menu');$('battle').classList.toggle('hidden',next!=='battle');renderer.resize();}
function sendNet(data){if(!connected)return;try{if(transport==='online'&&remote)remote.send(JSON.stringify(data));else if(native)native.send(JSON.stringify(data));}catch(_){}}
function dispatch(action,silent=false){
 if(!view||view.over||paused&&!netRole)return {ok:false};
 if(tutorial&&!tutorial.allow(action))return {ok:false,reason:'请先完成当前教学步骤'};
 if(netRole==='guest'){sendNet({type:'command',seq:++seq,action});return {ok:true};}
 if(!engine)return {ok:false};const r=engine.command(0,action);view=engine.snapshot(0);
 if(!r.ok&&!silent){toast(r.reason);audio.play('warning');}
 else if(r.ok&&!silent){audio.init();if(!['fire','detonate'].includes(action.type))audio.play('click');if(action.type==='fire'||action.type==='detonate')vibrate(15);}
 return r;
}
function select(k){if(!Object.prototype.hasOwnProperty.call(C,k)||!view?.own.weapons.includes(k))return;stopFire();aimTarget=null;dispatch({type:'vehicle'},true);const r=dispatch({type:'select',weapon:k},true);if(!r.ok)return;selected=k;if(!canUseGunSight(view.own))renderer.gunSight=false;weaponButtons.forEach(b=>b.classList.toggle('selected',b.dataset.weapon===k));updateHUD();}
function startAI(seed){document.querySelectorAll('.tutorial-highlight').forEach(el=>el.classList.remove('tutorial-highlight'));tutorial=null;$('tutorialPanel').classList.add('hidden');disconnect(false);audio.init();audio.reset();closeModal();engine=new Engine({mode:'ai',battleMode,mapId:battleMap,difficulty,seed,vehicles:[profile.selected]});renderer.setMap(engine.mapId);beginRewardRound();view=engine.snapshot(0);mapAim=false;paused=false;lastLog=0;oldHp=view.own.maxHp;selected=view.own.selected;resetInput();renderer.cameraKey=null;lastFrame=performance.now();toastUntil=0;$('toast').classList.add('hidden');$('modeLabel').textContent=`${battleMode==='dark_forest'?'黑暗森林':'1v1 对决'} / ${view.roomTier}级房 / ${difficultyNames[difficulty]}`;setScreen('battle');select(selected);updateHUD();}
function startTutorial(){
 disconnect(false);audio.init();audio.reset();closeModal();engine=new Engine({mode:'tutorial',seed:731,vehicles:[DEFAULT_VEHICLE,DEFAULT_VEHICLE],countdown:0});renderer.setMap('hills');tutorial=new window.BlindfireTutorial.Tutorial(engine);tutorialRendered=-1;beginRewardRound();view=engine.snapshot(0);selected=view.own.selected;paused=false;mapAim=false;resetInput();renderer.cameraKey=null;setScreen('battle');$('modeLabel').textContent='新手实战引导';showTutorialStep();updateHUD();
}
function showTutorialStep(){
 if(!tutorial||tutorialRendered===tutorial.step)return;tutorialRendered=tutorial.step;view=engine.snapshot(0);selected=view.own.selected;const [title,text,next]=tutorial.instruction;
 $('tutorialPanel').classList.remove('hidden');$('tutorialTitle').textContent=title;$('tutorialText').textContent=text;$('tutorialNext').classList.toggle('hidden',!next);
 document.querySelectorAll('.tutorial-highlight').forEach(el=>el.classList.remove('tutorial-highlight'));
 const target={2:'joystick',3:'world',4:'mini',6:'uavOrbit',7:'returnVehicle',9:'fireButton',10:'fireButton'}[tutorial.step];if(target&&$(target))$(target).classList.add('tutorial-highlight');
 // Intro cards wait for the player; action steps use the real simulation.
 paused=!!next;resetInput();if(engine)engine.players[0].drive={throttle:0,steer:0};
}
function tickTutorial(){tutorial.tick();view=engine.snapshot(0);if(tutorial.done){$('tutorialPanel').classList.add('hidden');return;}showTutorialStep();}
$('openTutorial').addEventListener('click',startTutorial);
$('tutorialNext').addEventListener('click',()=>{if(tutorial?.instruction[2]){tutorial.advance();showTutorialStep();lastFrame=performance.now();}});
function returnMenu(){if(view&&!tutorial&&view.started&&roundReward===null)settleRound(view.outcome||'loss');document.querySelectorAll('.tutorial-highlight').forEach(el=>el.classList.remove('tutorial-highlight'));tutorial=null;$('tutorialPanel').classList.add('hidden');mapAim=false;disconnect(false);engine=null;view=null;paused=false;resetInput();audio.reset();closeModal();setScreen('menu');walletUI();}
function resetInput(){const captures=[['joystick',joystickPointer],['world',aimPointer],['fireButton',firePointer],...[...mapPointers.keys()].map(id=>['world',id])];mapPointers.clear();mapGesture=null;stick.x=stick.y=0;keys.clear();joystickPointer=aimPointer=firePointer=null;drag=aimTarget=null;$('stickKnob').style.transform='';for(const[id,pointer]of captures){if(pointer!==null)try{if($(id).hasPointerCapture(pointer))$(id).releasePointerCapture(pointer);}catch(_){}}}
function currentPilot(){return view&&view.shots.find(s=>s.mine&&s.id===view.own.pilot);}
function control(silent=true){if(!view||modalKind||paused&&!netRole||view.over)return;const throttle=clamp(-stick.y+(keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0),-1,1),steer=clamp(stick.x+(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),-1,1);const a={type:'control',throttle,steer};if(aimTarget){a.yaw=aimTarget.yaw;a.pitch=aimTarget.pitch;aimTarget=null;}dispatch(a,silent);}
function fire(){if(!view||modalKind||view.over)return;audio.init();control();const pilot=currentPilot();if(pilot){dispatch({type:pilot.kind==='bomber'?'bomb':'detonate'});}else if(selected==='mg'){dispatch({type:'mg',active:true},true);}else dispatch({type:'fire'});updateHUD();}
function stopFire(e){if(e&&e.pointerId!==undefined&&e.pointerId!==firePointer)return;firePointer=null;if(view&&(view.own.mg||selected==='mg'))dispatch({type:'mg',active:false},true);$('fireButton').classList.remove('firing');}
function settleRound(outcome){if(engine&&netRole!=='guest')view=engine.snapshot(0);if(roundReward===null)roundReward=tutorial?(tutorial.done?profile.completeTutorial():0):profile.reward(roundKey,outcome||'loss',{vehicleId:view.own.vehicleId,roomTier:view.roomTier,stats:view.own.stats});walletUI();return roundReward;}
function result(){if(modalKind==='result'||!view)return;if(!netRole)paused=true;const outcome=view.outcome,title={win:'交火胜利',loss:'发射车损失',draw:'本局平局'}[outcome],s=view.own.stats,time=Math.round(Math.max(0,(view.own.eliminatedAt||view.t)-3));
 settleRound(outcome);
 showModal('result',`<span class="eyebrow">AFTER ACTION / ${netRole?'DUEL':'SOLO'}</span><h3 class="result-heading ${outcome}">${title}</h3><p>${escape(view.reason)}</p>${view.battleMode==='dark_forest'?`<p>排名：第 ${view.placement} 名 / 8</p>`:''}<div class="balance-line" id="roundCoins">战币 +${roundReward} <b>余额 ${profile.coins}</b></div><p>${vehicleSpec(view.own.vehicleId).tier}级载具 · ${view.roomTier||1}级房 · ${window.Blindfire.BRANCHES[vehicleSpec(view.own.vehicleId).branch]}研发点 +${profile.lastResearch}</p>${profile.saved?'':'<p>本机存储不可用，战币暂存至关闭游戏。</p>'}<div class="result-grid"><div><small>击毁载具</small><b>${s.kills||0}<span>辆</span></b></div><div><small>造成伤害</small><b>${s.damage}<span>HP</span></b></div><div><small>剩余耐久</small><b>${view.own.hp}<span>HP</span></b></div><div><small>确认热源</small><b>${s.detections}<span>次</span></b></div><div><small>成功拦截</small><b>${s.intercepted}<span>次</span></b></div><div><small>装备发射</small><b>${s.launches}<span>次</span></b></div><div><small>交火时间</small><b>${time}<span>秒</span></b></div></div>${netRole?'':'<button id="again" class="btn">再次出战</button>'}<button id="backMenu" class="btn secondary">返回主菜单</button>`,{again:()=>tutorial?startTutorial():startAI(),backMenu:returnMenu});audio.play(outcome==='win'?'lock':'warning');resetInput();
}
function updateHUD(){
 if(!view)return;const p=view.own,pilot=currentPilot(),m=Math.floor(view.remaining/60),s=Math.floor(view.remaining%60);$('timer').textContent=tutorial?'引导':`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
 const zone=view.zone;if(!zone)$('battle').classList.remove('in-gas');$('zoneStatus').classList.toggle('hidden',!zone);if(zone){const outside=zone.radius===0||Math.hypot(p.x-zone.x,p.z-zone.z)>zone.radius;$('zoneStatus').classList.toggle('danger',outside);$('battle').classList.toggle('in-gas',outside);$('zoneStatus').textContent=`存活 ${view.alive}/8 · ${zone.stage===5?'全图毒气':`第${zone.stage}圈 / ${Math.ceil(zone.left)}s后缩圈`}${outside?' · 毒气伤害':''}`;}
 $('hpBar').style.width=p.hp/p.maxHp*100+'%';$('hpBar').style.background=p.hp<p.maxHp*.35?'#ffac89':'#c5edc5';$('hpNumber').textContent=Math.ceil(p.hp);$('vehicleName').textContent=vehicleSpec(p.vehicleId).name;
 const badge=$('intelBadge');badge.className='intel-badge';if(view.enemy&&view.enemy.precise){badge.textContent=view.enemy.retained?`情报保留 ${view.enemy.left.toFixed(1)}s`:'目标位置确认';badge.classList.add('lock');}else if(view.enemy){badge.textContent='旧位置 · 可能已移动';badge.classList.add('suspect');}else if(view.clues.length){badge.textContent='发现方向线索';badge.classList.add('suspect');}else badge.textContent='敌情未知';
 $('threatAlert').classList.toggle('hidden',!view.threats);$('threatAlert').textContent=`空中威胁 × ${view.threats}`;
 const bomber=view.shots.find(s=>s.mine&&s.kind==='bomber');$('takeBomber').classList.toggle('hidden',!bomber||!!pilot);const uav=view.shots.find(s=>s.mine&&s.kind==='uav');$('takeUAV').classList.toggle('hidden',!uav||!!pilot||!!uav.orbit);$('returnVehicle').classList.toggle('hidden',!pilot);$('uavOrbit').classList.toggle('hidden',!uav||!!pilot&&pilot.kind!=='uav');$('uavOrbitLabel').textContent=uav&&uav.orbit?'手动飞行':'50m盘旋';$('uavOrbit').classList.toggle('active',!!uav&&!!uav.orbit);
 $('cameraBadge').querySelector('span').textContent=pilot?`${names[pilot.kind]} / 手动追尾`:'发射车 / 第三人称';$('stickLabel').textContent=pilot?'左右转向 / 上下俯仰':'驾驶 / 转向';
 $('flightMode').textContent=pilot?`${names[pilot.kind]} · ${pilot.remaining.toFixed(0)}s 续航`:selected==='artillery'?`火炮 / 连续瞄准`:uav&&uav.orbit?`无人机盘旋 · ${uav.remaining.toFixed(0)}s 能量`:'地面机动 / LAUNCHER';$('altitude').textContent=pilot?`离地 ${Math.max(0,pilot.y-terrain(pilot.x,pilot.z)).toFixed(0)} m · ${pilot.speed} m/s`:`速度 ${(Math.abs(p.speed)*3.6).toFixed(0)} km/h`;
 const canScope=canUseGunSight(p);if(!canScope)renderer.gunSight=false;$('gunSightToggle').classList.toggle('hidden',!canScope);$('gunSightToggle').setAttribute('aria-label',renderer.gunSight?'关闭炮镜':'打开2.5×炮镜');$('gunSightToggle').classList.toggle('active',!!renderer.gunSight);$('gunSightToggle').setAttribute('aria-pressed',String(!!renderer.gunSight));$('gunSightOverlay').classList.toggle('hidden',!renderer.gunSight);$('battle').classList.toggle('gun-sight-active',!!renderer.gunSight);
 $('mapAimToggle').classList.toggle('hidden',!!pilot||selected!=='artillery');if(pilot||selected!=='artillery')mapAim=false;renderer.mapAim=mapAim;$('mapCameraControls').classList.toggle('hidden',!mapAim);$('mapAimToggle').setAttribute('aria-label',mapAim?'返回车尾视角':'地图瞄准');$('mapAimToggle').classList.toggle('active',mapAim);
 const a=pilot||p.aim[selected];let aimText=`仰角 ${(a.pitch*180/Math.PI).toFixed(0)}°`;
 if(!pilot&&selected==='artillery'){const arc=renderer.artilleryPreview(p);aimText+=arc.range===null?' · 落点在战区外':` · 距离 ${arc.range.toFixed(0)} m`;}else aimText+=` · 航向 ${((a.yaw*180/Math.PI+360)%360).toFixed(0)}°`;$('aimInfo').textContent=aimText;
 weaponRow.style.setProperty('--weapon-count',p.weapons.length);
 for(const b of weaponButtons){const k=b.dataset.weapon,cd=p.cd[k],available=p.weapons.includes(k);b.classList.toggle('hidden',!available);b.disabled=!available;b.style.order=p.weapons.indexOf(k);b.classList.toggle('selected',k===selected);b.classList.toggle('cooling',cd>0);weaponParts.get(b).cooldown.style.width=C[k]&&cd>0?cd/weaponSpec(p,k).cooldown*100+'%':'0%';weaponParts.get(b).label.textContent=k==='highExplosive'&&p.heArmed?'已装填':k==='tankCannon'&&p.heArmed?'高爆弹就绪':k==='autocannon'?(p.reloadLeft>0?`换弹 ${p.reloadLeft.toFixed(1)}s`:`${p.ammo}/10`):k==='spade'?(p.spadeDeployed?'已展开':'已收起'):k==='repair'?(p.repairLeft>0?`维修 ${p.repairLeft.toFixed(1)}s`:p.repairUsed?'已使用':'一次 / 局'):k==='observation'&&p.observationLeft>0?`观察 ${p.observationLeft.toFixed(1)}s`:cd>0?`${cd.toFixed(1)}s`:k==='mg'?'按住开火':k==='uav'&&uav?(uav.orbit?'盘旋中':'飞行中'):'就绪';}
 const crewSignature=(p.crew||[]).map(m=>m.id+':'+m.role+':'+m.alive).join('|');if($('crewStatus').dataset.signature!==crewSignature){$('crewStatus').dataset.signature=crewSignature;$('crewStatus').innerHTML=(p.crew||[]).map(member=>`<span class="crew-member ${member.alive?'':'lost'}" title="${window.Blindfire.Crew.ROLES[member.role]}${member.alive?'':'阵亡'}">${window.Blindfire.Crew.ROLES[member.role]}</span>`).join('');}$('concealStatus').textContent=p.concealed?'草丛隐蔽':p.revealLeft>0?`开火暴露 ${Math.ceil(p.revealLeft)}s`:'';
 const cd=p.cd[selected],fb=$('fireButton');fb.classList.toggle('cooling',!pilot&&cd>0);fb.classList.toggle('firing',p.mg);fb.disabled=false;
 $('fireLabel').textContent=selected==='spade'&&!pilot?(p.spadeDeployed?'收起':'展开'):p.repairLeft>0?`维修 ${p.repairLeft.toFixed(1)}s`:selected==='autocannon'&&p.reloadLeft>0?`换弹 ${p.reloadLeft.toFixed(1)}s`:selected==='highExplosive'?(p.heArmed?'已装填':'装填高爆'):selected==='repair'?'维修':selected==='observation'?'观察':pilot?(pilot.kind==='bomber'?(pilot.bombs?'投弹':'已投弹'):pilot.kind==='sam'?'飞行中':'引爆'):selected==='mg'?'开火':cd>0?`${cd.toFixed(1)}s`:'发射';$('fireSub').textContent=selected==='spade'&&!pilot?(p.spadeDeployed?'恢复机动':'固定车体 / 缩短装填'):p.repairLeft>0?'原地维修中':selected==='autocannon'?`${p.ammo}/10 · 20mm机炮`:selected==='highExplosive'?'下一发 · 半径15m / 中心95伤害':selected==='tankCannon'?(p.heArmed?'高爆弹 · 中心95伤害':'122mm · 90伤害 / 半径5米'):selected==='repair'?(p.repairUsed?'本局已使用':'停车维修15秒'):selected==='observation'?'前方90° / 500m':pilot?(pilot.kind==='bomber'?'机腹炸弹分离':pilot.kind==='uav'?'贴近后自爆':'手动引爆'):selected==='reconPlane'?'指定航向后召唤':selected==='bomber'?'召唤并驾驶':selected==='sam'?'自动锁定':selected==='mg'?'按住持续射击':Math.abs(p.speed)>2?'停车后发射':'手动控制';
 $('dragHint').textContent=pilot?'拖动调整航向':selected==='artillery'&&vehicleSpec(p.vehicleId).hullAim?'拖动俯仰 / 车体转向瞄准':selected==='sam'?'发射后自动追踪':'右侧拖动瞄准';
 const hints={spade:'停车展开 · 装填缩短20% · 收起恢复机动',tankCannon:'122mm火炮 · 装填10秒 · 爆炸半径5米 · 可移动开火',highExplosive:'下一发炮弹变为高爆弹 · 冷却30秒',autocannon:'20mm机炮 · 按住连续射击 · 可移动开火',repair:'每局一次 · 原地维修15秒',observation:'前方90°扇形侦察 · 持续8秒',reconPlane:'指定航向 · 高空直线侦察',bomber:'驾驶轰炸机 · 按发射投弹',uav:'手动侦察 · 可切换50m盘旋',missile:`手动飞行 · 命中${weaponSpec(p,'missile').directDamage}伤害`,artillery:`连续瞄准 · 拖动瞄准 / 地图选点`,sam:'自动锁定空中目标 · 装填25秒',mg:'手动瞄准空中目标 · 按住开火'};
 $('actionHint').textContent=pilot?'左摇杆控制飞行 · 可随时返回车辆':hints[selected];
 const count=$('countdown');count.classList.toggle('hidden',view.started);if(!view.started)count.innerHTML=`${Math.ceil(view.countdown)}<small>正在进入未知空域</small>`;
 const kill=view.log.find(log=>log.kind==='kill'&&log.id>lastKill);if(kill){lastKill=kill.id;toast(kill.text);}
 if(view.log.length&&view.log[0].id!==lastLog){const log=view.log[0];lastLog=log.id;$('eventLine').querySelector('span').textContent=log.text;$('eventLine').className='event-line '+(['hit','danger'].includes(log.kind)?'danger':log.kind==='warning'?'warning':'');if(log.kind==='lock'){audio.play('lock');vibrate(25);}}
 if(p.hp<oldHp){damageUntil=performance.now()+450;vibrate(65);}oldHp=p.hp;if(view.settled||view.over)result();
}
function guide(backToPause=false){showModal('guide',`<h3>作战指南</h3><p>摇杆驾驶，拖动画面瞄准，按住开火进行机炮或机枪连射。炮镜按钮切换 2.5× 视角，地图按钮开启火炮选点瞄准。</p><p>丘陵草丛将被侦查距离限制为 50m，开火后暴露 10 秒。建筑物和树木阻挡侦查视线；离开侦查范围后保留最后情报，乘员损失会缩短留存时间。</p><p>乘员优先补位炮长和驾驶员，存活少于两人时载具损失。原本未配置的岗位不会产生额外惩罚。</p><details><summary>音效来源</summary><p>qubodup《Tank Engine Loop》（Freesound，CC BY 4.0）；Lucas Del Piero / Nayckron《Engine-loop heavy vehicle/tank》（OpenGameArt，CC BY 3.0）。其余素材：qubodup、Sadiquecat、pgi、Thimras、pauliuw、starninjas、Spring Spring、theminesareshakin（CC0）。音效已切片、均衡与循环处理。</p><a href="audio/SOURCES.json" target="_blank">素材与授权清单</a></details><button id="guideClose" class="btn">返回</button>`,{guideClose:()=>{if(backToPause)showPause();else closeModal();}});}

function showPause(){if(view?.settled)return result();if(screen!=='battle'||!view||view.over)return;stopFire();dispatch({type:'control',throttle:0,steer:0},true);resetInput();if(!netRole)paused=true;
 showModal('pause',`<span class="eyebrow">TACTICAL PAUSE</span><h3>作战菜单</h3><p>${netRole?'双人对局仍在继续，尽快返回战场。':'训练已暂停。'}</p><button id="resume" class="btn">继续交火</button><button id="pauseGuide" class="btn secondary">作战指南</button><button id="toggleSound" class="btn secondary">声音：${audio.enabled?'开启':'关闭'}</button><button id="quitRound" class="btn danger">${netRole?'离开双人对局':'结束训练'}</button>`,{resume:()=>{paused=false;audio.init();closeModal();lastFrame=performance.now();},pauseGuide:()=>guide(true),toggleSound:()=>{audio.enabled=!audio.enabled;try{localStorage.setItem('bf-sound',audio.enabled?'on':'off');}catch(_){}soundUI();showPause();},quitRound:returnMenu});
}
  function disconnect(notify) {
    const wasConnected = connected; connected = false; netRole = null; seq = 0; remoteSeq = 0;
    if(remote){const old=remote;remote=null;old.close();}transport=null;
    if (native) { try { native.leave(); } catch (_) {} }
    if (notify && wasConnected) interrupted('对方已断开连接，本局结束。');
  }
  function interrupted(message) {
    disconnect(false); engine = null; paused = false; resetInput();
    showModal('interrupted', `<span class="eyebrow">LINK LOST</span><h3>交火中断</h3><p>${escape(message)}</p><p>请重新创建或加入房间。</p><button id="interruptedBack" class="btn">返回主菜单</button>`, { interruptedBack:returnMenu });
  }
  function lanMenu() {
    showModal('lan', `<span class="eyebrow">DUEL / LOCAL</span><h3>同网交火</h3><p>两台安卓手机连接同一 Wi-Fi 或热点，使用地址与6位房间码对战。</p><button id="hostRoom" class="btn">同网创建 · 玩家 A</button><button id="joinRoom" class="btn secondary">同网加入 · 玩家 B</button><small class="room-note">远程联机暂时关闭。</small><button id="lanBack" class="btn secondary">返回</button>`, {hostRoom:hostRoom,joinRoom:joinRoom,lanBack:closeModal});
  }
  function openRemote(role){
    if(!REMOTE_ENABLED){toast('远程联机暂时关闭');return null;}
    disconnect(false);transport='online';netRole=role;audio.init();
    showModal('waiting','<span class="eyebrow">CONNECTING</span><h3>正在连接远程房间</h3><p>请保持游戏在前台。</p><button id="cancelRemote" class="btn secondary">取消</button>',{cancelRemote:()=>{disconnect(false);lanMenu();}});
    const link=new RemoteLink(event=>{if(remote===link)window.onNativeNetwork(event);});remote=link;return link;
  }
  function onlineHost(){openRemote('host')?.host();}
  function onlineJoin(){
    if(!REMOTE_ENABLED){toast('远程联机暂时关闭');return;}
    showModal('join',`<span class="eyebrow">REMOTE / PLAYER B</span><h3>加入远程房间</h3><div class="field"><label for="remoteCode">4位数字房间码</label><input id="remoteCode" placeholder="例如 0428" maxlength="4" inputmode="numeric" autocomplete="off" spellcheck="false"></div><p id="remoteError" class="connection-error"></p><button id="connectRemote" class="btn">连接并出战</button><button id="remoteBack" class="btn secondary">返回</button>`,{connectRemote:()=>{const code=$('remoteCode').value.trim().toUpperCase();if(!/^\d{4}$/.test(code)){$('remoteError').textContent='请输入完整的4位数字房间码';return;}$('remoteCode').blur();openRemote('guest').join(code);},remoteBack:lanMenu});
  }
  function needNative() {
    if (native || isTest && window.Native) return true;
    showModal('native', '<span class="eyebrow">ANDROID EDITION</span><h3>安装 APK 后双人对战</h3><p>双人房间需要使用最新版 APK。</p><button id="nativeBack" class="btn">返回</button>', { nativeBack:lanMenu }); return false;
  }
  function hostRoom() {
    if (!needNative()) return; disconnect(false); transport='lan';netRole = 'host';
    showModal('waiting', '<span class="eyebrow">CREATING ROOM</span><h3>正在创建房间</h3><p>正在准备本地连接…</p><button id="cancelHost" class="btn secondary">取消</button>', { cancelHost:() => { disconnect(false); lanMenu(); } });
    try { native.host(); } catch (_) { interrupted('无法创建房间，请检查网络后重试。'); }
  }
  function joinRoom() {
    if (!needNative()) return;
    showModal('join', `<span class="eyebrow">JOIN / PLAYER B</span><h3>加入房间</h3><div class="field"><label for="hostIP">玩家 A 的地址</label><input id="hostIP" inputmode="decimal" placeholder="例如 192.168.1.10" maxlength="15" autocomplete="off"></div><div class="field"><label for="hostCode">6位房间码</label><input id="hostCode" inputmode="numeric" placeholder="000000" maxlength="6" autocomplete="off"></div><p id="joinError" class="connection-error"></p><button id="connectRoom" class="btn">连接并出战</button><button id="joinBack" class="btn secondary">返回</button>`, {
      connectRoom: () => {
        const ip = $('hostIP').value.trim(), code = $('hostCode').value.trim();
        if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || ip.split('.').some(n => Number(n)>255)) { $('joinError').textContent = '请输入玩家 A 显示的 IPv4 地址'; return; }
        if (!/^\d{6}$/.test(code)) { $('joinError').textContent = '请输入6位数字房间码'; return; }
        disconnect(false); transport='lan';netRole = 'guest'; $('hostIP').blur(); $('hostCode').blur();
        showModal('waiting', '<span class="eyebrow">CONNECTING / B</span><h3>正在连接房间</h3><p>请保持两台手机在同一网络。</p><button id="cancelJoin" class="btn secondary">取消</button>', {cancelJoin:()=>{ disconnect(false); joinRoom(); }});
        try { native.join(ip, code); } catch (_) { interrupted('连接失败，请核对地址与房间码。'); }
      }, joinBack:lanMenu
    });
  }
function validView(v){return v&&v.version===9&&v.own&&Array.isArray(v.own.weapons)&&v.own.weapons.length>0&&v.own.weapons.length<=5&&v.own.weapons.every(k=>Object.hasOwn(C,k))&&v.own.weapons.includes(v.own.selected)&&Number.isFinite(v.own.wheelTravel)&&Number.isFinite(v.own.maxHp)&&v.own.maxHp>0&&Number.isFinite(v.own.x)&&Number.isFinite(v.own.y)&&Number.isFinite(v.own.z)&&Number.isFinite(v.t)&&v.own.cd&&v.own.aim&&v.own.stats&&v.own.artilleryMode==='unified'&&['shots','clues','effects','trails','log','sounds'].every(k=>Array.isArray(v[k])&&v[k].length<160);}
window.onNativeNetwork=function(event){
 if(!event||!event.type)return;
 if(event.type==='listening'&&netRole==='host'&&event.remote&&transport==='online'){
  showModal('waiting',`<span class="eyebrow">REMOTE ROOM / PLAYER A</span><h3>等待玩家 B</h3><small class="room-note">4位数字房间码</small><div class="room-code">${escape(event.code)}</div><p>把房间码发给对方，选择“加入远程房间”后即可出战。双方请安装 v0.9 或更高兼容版本。</p><button id="copyRemoteCode" class="btn">复制房间码</button><button id="cancelWaiting" class="btn secondary">取消房间</button>`,{copyRemoteCode:async()=>{try{await navigator.clipboard.writeText(event.code);$('copyRemoteCode').textContent='已复制';}catch(_){$('copyRemoteCode').textContent='房间码：'+event.code;}},cancelWaiting:()=>{disconnect(false);lanMenu();}});
 }else if(event.type==='listening'&&netRole==='host'){
  const ips=(event.ips||[]).filter(a=>/^\d{1,3}(\.\d{1,3}){3}$/.test(a));showModal('waiting',`<span class="eyebrow">ROOM OPEN / PLAYER A</span><h3>等待玩家 B</h3><small class="room-note">房间码</small><div class="room-code">${escape(event.code)}</div><small class="room-note">连接地址（任选可达地址）</small>${ips.map(a=>`<div class="room-address">${escape(a)}</div>`).join('')||'<p class="connection-error">未找到地址，请连接 Wi-Fi 或开启热点后重试。</p>'}<div class="room-status">● 房间已开放</div><p>玩家 B 输入地址和房间码，连接后自动开始。双方须使用同一版本。</p><button id="cancelWaiting" class="btn secondary">取消房间</button>`,{cancelWaiting:()=>{disconnect(false);lanMenu();}});
 }else if(event.type==='connected'&&netRole&&event.role===netRole&&modalKind==='waiting'&&!connected){
  beginRewardRound();connected=true;lastPeerAt=performance.now();seq=remoteSeq=0;oldHp=100;lastLog=0;paused=false;audio.init();audio.reset();resetInput();renderer.cameraKey=null;selected='missile';
  if(netRole==='host'){engine=new Engine({mode:'lan',vehicles:[profile.selected]});view=engine.snapshot(0);$('modeLabel').textContent=(transport==='online'?'远程交火':'双人交火')+' / 玩家 A';closeModal();setScreen('battle');select(view.own.selected);sendNet({type:'state',view:engine.snapshot(1)});}
 }else if(event.type==='heartbeat'&&transport==='online'&&connected){lastPeerAt=performance.now();$('modeLabel').textContent=`远程交火 / 玩家 ${netRole==='host'?'A':'B'} · ${event.rtt}ms`;
 }else if(event.type==='data'&&connected){
  lastPeerAt=performance.now();let packet;try{if(typeof event.data!=='string'||event.data.length>65536)return;packet=JSON.parse(event.data);}catch(_){return;}
  if(netRole==='guest'&&packet.type==='state'&&validView(packet.view)){view=packet.view;if(screen!=='battle'){closeModal();$('modeLabel').textContent=(transport==='online'?'远程交火':'双人交火')+' / 玩家 B';selected=view.own.selected;setScreen('battle');}}
  else if(netRole==='guest'&&packet.type==='feedback')toast(packet.message);
  else if(netRole==='host'&&packet.type==='command'&&engine){const now=performance.now();if(now-commandWindow>1000){commandWindow=now;commandCount=0;}if(!Number.isSafeInteger(packet.seq)||packet.seq<=remoteSeq||++commandCount>40)return;remoteSeq=packet.seq;const r=engine.command(1,packet.action);if(!r.ok)sendNet({type:'feedback',message:r.reason});}
 }else if(event.type==='closed'&&netRole){if(view&&view.over){connected=false;return;}interrupted(event.message||'连接已断开，请检查两台手机的 Wi-Fi。');}
 else if(event.type==='error'&&netRole)interrupted(event.message||'连接失败，请核对地址与房间码。');
};
document.querySelectorAll('.sound-button').forEach(b=>b.addEventListener('click',()=>{audio.enabled=!audio.enabled;try{localStorage.setItem('bf-sound',audio.enabled?'on':'off');}catch(_){}audio.init();soundUI();}));
document.querySelectorAll('[data-difficulty]').forEach(b=>b.addEventListener('click',()=>{difficulty=b.dataset.difficulty;try{localStorage.setItem('bf-difficulty',difficulty);}catch(_){}document.querySelectorAll('[data-difficulty]').forEach(c=>c.classList.toggle('chosen',c.dataset.difficulty===difficulty));audio.init();audio.play('click');}));
document.querySelectorAll('[data-difficulty]').forEach(b=>b.classList.toggle('chosen',b.dataset.difficulty===difficulty));
if(EDITION==='h5')$('openLAN').classList.add('hidden');
$('battleMode').addEventListener('change',()=>{battleMode=$('battleMode').value;});
$('startAI').addEventListener('click',()=>startAI());$('openWarehouse').addEventListener('click',warehouse);$('openResearch').addEventListener('click',techTree);walletUI();$('openLAN').addEventListener('click',lanMenu);$('openGuide').addEventListener('click',()=>guide());$('pauseButton').addEventListener('click',showPause);
weaponButtons.forEach(b=>b.addEventListener('click',()=>select(b.dataset.weapon)));
$('returnVehicle').addEventListener('click',()=>{stopFire();resetInput();dispatch({type:'vehicle'});updateHUD();});
$('takeUAV').addEventListener('click',()=>{const u=view&&view.shots.find(s=>s.mine&&s.kind==='uav');if(u){resetInput();dispatch({type:'pilot',id:u.id});updateHUD();}});
$('uavOrbit').addEventListener('click',()=>{const u=view&&view.shots.find(s=>s.mine&&s.kind==='uav');if(u){resetInput();control();dispatch({type:'uav-orbit',id:u.id,active:!u.orbit});updateHUD();}});
$('battleMap').addEventListener('change',e=>{battleMap=e.target.value;});
$('gunSightToggle').onclick=()=>{if(!view||!canUseGunSight(view.own))return;renderer.gunSight=!renderer.gunSight;resetInput();renderer.cameraKey=null;updateHUD();};
$('mapZoomIn').onclick=()=>renderer.zoomMap(.8);$('mapZoomOut').onclick=()=>renderer.zoomMap(1.25);
$('mapAimToggle').addEventListener('click',()=>{mapAim=!mapAim;resetInput();renderer.cameraKey=null;updateHUD();});
$('fireButton').addEventListener('pointerdown',e=>{if(firePointer!==null||modalKind)return;e.preventDefault();firePointer=e.pointerId;try{$('fireButton').setPointerCapture(e.pointerId);}catch(_){}fire();});
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('fireButton').addEventListener(name,stopFire);
function moveStick(e){const r=$('joystick').getBoundingClientRect(),radius=r.width*.34,dx=e.clientX-r.x-r.width/2,dy=e.clientY-r.y-r.height/2,len=Math.hypot(dx,dy),scale=len>radius?radius/len:1;stick.x=dx*scale/radius;stick.y=dy*scale/radius;if(Math.abs(stick.x)<.08)stick.x=0;if(Math.abs(stick.y)<.08)stick.y=0;$('stickKnob').style.transform=`translate(${stick.x*radius}px,${stick.y*radius}px)`;}
$('joystick').addEventListener('pointerdown',e=>{if(modalKind||joystickPointer!==null)return;e.preventDefault();joystickPointer=e.pointerId;$('joystick').setPointerCapture(e.pointerId);moveStick(e);audio.init();});
$('joystick').addEventListener('pointermove',e=>{if(joystickPointer===e.pointerId)moveStick(e);});
function releaseStick(e){if(joystickPointer!==e.pointerId)return;joystickPointer=null;stick.x=stick.y=0;$('stickKnob').style.transform='';control();}
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('joystick').addEventListener(name,releaseStick);
$('world').addEventListener('wheel',e=>{if(mapAim){e.preventDefault();renderer.zoomMap(Math.exp(e.deltaY*.001));}},{passive:false});
$('world').addEventListener('pointerdown',e=>{
 if(mapAim&&screen==='battle'&&!modalKind){e.preventDefault();$('world').setPointerCapture(e.pointerId);mapPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(mapPointers.size===1)mapGesture={x:e.clientX,y:e.clientY,moved:false};else mapGesture.moved=true;return;}
 if(screen!=='battle'||modalKind||!view||view.over||aimPointer!==null)return;e.preventDefault();aimPointer=e.pointerId;const a=currentPilot()||view.own.aim[selected];drag={x:e.clientX,y:e.clientY,yaw:a.yaw,pitch:a.pitch};$('world').setPointerCapture(e.pointerId);audio.init();
});
$('world').addEventListener('pointermove',e=>{
 if(mapPointers.has(e.pointerId)){const prev=mapPointers.get(e.pointerId),other=[...mapPointers.entries()].find(([id])=>id!==e.pointerId)?.[1];
  if(other){const before=Math.hypot(prev.x-other.x,prev.y-other.y),after=Math.hypot(e.clientX-other.x,e.clientY-other.y);if(after>10)renderer.zoomMap(before/after);}
  else if(mapGesture.moved||Math.hypot(e.clientX-mapGesture.x,e.clientY-mapGesture.y)>8){mapGesture.moved=true;renderer.panMap(e.clientX-prev.x,e.clientY-prev.y);}
  mapPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});return;
 }
 if(aimPointer!==e.pointerId||!drag)return;const sensitivity=renderer.gunSight?1/GUN_SIGHT_ZOOM:1;aimTarget={yaw:drag.yaw+(e.clientX-drag.x)*.006*sensitivity,pitch:drag.pitch-(e.clientY-drag.y)*.0045*sensitivity};
});
function releaseAim(e){if(mapPointers.has(e.pointerId)){if(e.type==='pointerup'&&mapPointers.size===1&&!mapGesture.moved){const q=renderer.mapTarget(e.clientX,e.clientY);if(q)dispatch({type:'map-aim',x:q.x,z:q.z});}mapPointers.delete(e.pointerId);return;}if(aimPointer!==e.pointerId)return;control();aimPointer=null;drag=null;}
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('world').addEventListener(name,releaseAim);
window.addEventListener('keydown',e=>{if(screen!=='battle'||modalKind||!view)return;const k=e.key.toLowerCase();if(['w','s','a','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){e.preventDefault();keys.add(k);}else if(k===' '&&!e.repeat){e.preventDefault();fire();}else if(/^[1-5]$/.test(k))select(view.own.weapons[Number(k)-1]);else if(k==='v'&&!e.repeat){$('gunSightToggle').click();}else if(k==='f'){$('returnVehicle').click();}else if(k==='escape')showPause();});
window.addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());if(e.key===' ')stopFire();});
window.showPause=showPause;
window.onNativeBack=function(){if(modalKind==='interrupted'){returnMenu();return;}if(modalKind==='pause'){paused=false;closeModal();return;}if(screen==='battle'){if(view&&(view.over||view.settled))returnMenu();else showPause();}else if(modalKind){if(['waiting','join','interrupted'].includes(modalKind)){disconnect(false);lanMenu();}else closeModal();}else if(native&&native.finishApp)native.finishApp();};
window.onNativePause=function(){stopFire();dispatch({type:'control',throttle:0,steer:0},true);resetInput();if(netRole){if(view&&view.over)disconnect(false);else interrupted('设备切至后台，双人连接已结束。');}else if(screen==='battle'&&engine&&view&&!view.over)showPause();audio.stopLoops();if(audio.ctx)audio.ctx.suspend().catch(()=>{});};
window.onNativeResume=function(){lastFrame=performance.now();};
window.addEventListener('blur',()=>{stopFire();dispatch({type:'control',throttle:0,steer:0},true);resetInput();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)window.onNativePause();else window.onNativeResume();});
function frame(now){const elapsed=Math.min(.1,(now-lastFrame)/1000);lastFrame=now;
 if(screen==='battle'){
  if(view&&(aimTarget||now-lastInput>50)){lastInput=now;control();}
  if(engine&&(!paused||netRole)&&!engine.over){let left=elapsed;while(left>0){const dt=Math.min(left,1/60);engine.update(dt);left-=dt;}view=engine.snapshot(0);if(tutorial)tickTutorial();}
  if(netRole==='host'&&connected&&engine&&now-lastSend>66){lastSend=now;sendNet({type:'state',view:engine.snapshot(1)});}
  if(view)renderer.draw(view,now/1000,elapsed);if(now-lastHud>90){lastHud=now;updateHUD();}
 }else renderer.draw(null,now/1000,elapsed);
 audio.sync(screen==='battle'?view:null,!paused&&modalKind!=='interrupted');
 if(firePointer!==null&&selected==='autocannon'&&view&&!modalKind&&!paused&&!view.over)dispatch({type:'fire'},true);
 if(toastUntil&&now>toastUntil){$('toast').classList.add('hidden');toastUntil=0;}$('damageFlash').classList.toggle('active',now<damageUntil);
 if(netRole==='guest'&&connected&&now-lastPeerAt>12000){disconnect(false);interrupted('对方长时间未响应，请重新连接。');}
 requestAnimationFrame(frame);
}
if(EDITION==='h5')setupH5Viewport(()=>renderer.resize(),landscape=>{if(landscape){resetInput();stopFire();if(screen==='battle')showPause();}});
soundUI();if(!profile.tutorialDone&&!isTest)startTutorial();requestAnimationFrame(frame);
if(isTest)window.GameDebug={openRemote,onlineJoin,start:startAI,startTutorial,get tutorial(){return tutorial;},get profile(){return profile;},get engine(){return engine;},get view(){return view;},get renderer(){return renderer;},get audio(){return audio;},get selected(){return selected;},get netRole(){return netRole;},get transport(){return transport;},get remote(){return remote;},dispatch,select,fire,stopFire,updateHUD,pause:showPause,returnMenu,control};

// Agent access uses the same visible start/menu actions; battle state is read-only.
const modelContext=document.modelContext;
if(modelContext?.registerTool){const lifecycle=new AbortController();for(const tool of[
{name:'read_battle_status',description:'Read the same friendly status and discovered enemy information shown on screen.',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{},additionalProperties:false},execute:input=>{if(!input||Object.keys(input).length)throw new Error('No parameters expected');return {screen,mode:transport||'solo',status:view?{hp:view.own.hp,remaining:view.remaining,selected:view.own.selected,enemy:view.enemy,over:view.over}:null};}},
{name:'start_training',description:'Start a new offline AI training round from the game menu.',annotations:{readOnlyHint:false},inputSchema:{type:'object',properties:{},additionalProperties:false},execute:input=>{if(!input||Object.keys(input).length||screen!=='menu'||netRole)throw new Error('Return to the main menu before starting training');startAI();return{started:true,mode:'solo'};}}
])try{Promise.resolve(modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch(_){}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}

$('takeBomber').addEventListener('click',()=>{const s=view?.shots.find(s=>s.mine&&s.kind==='bomber');if(s){resetInput();dispatch({type:'pilot',id:s.id});updateHUD();}});
