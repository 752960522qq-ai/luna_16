import { Renderer } from './render.js';
import { GameAudio } from './audio.js';
import { RemoteLink } from './online.js';
import { REMOTE_ENABLED,EDITION } from './net-config.js';
const $=id=>document.getElementById(id),{Engine,C,ballistic,clamp,terrain}=window.Blindfire;
const renderer=new Renderer($('world'),$('mini'));
const native=window.Native||null,isTest=new URLSearchParams(location.search).has('test');
const difficultyNames={easy:'新兵',standard:'标准',hard:'困难'};
let engine=null,view=null,screen='menu',selected='missile',paused=false,difficulty='standard',netRole=null,connected=false,transport=null,remote=null;
let lastFrame=performance.now(),lastSend=0,lastHud=0,lastInput=0,lastPeerAt=0,lastLog=0,oldHp=100,toastUntil=0,modalKind=null,seq=0,remoteSeq=0,commandCount=0,commandWindow=0;
let joystickPointer=null,aimPointer=null,firePointer=null,drag=null,aimTarget=null,damageUntil=0;
const stick={x:0,y:0},keys=new Set();
const names={uav:'无人机',missile:'巡航导弹',artillery:'火炮',sam:'防空导弹',mg:'高射机枪'};
const {VEHICLES,WEAPONS,DEFAULT_VEHICLE,vehicleSpec}=window.Blindfire;
let profileStorage=null;try{profileStorage=localStorage;}catch(_){}
const profile=new window.BlindfireProgress.Progress(profileStorage,{infiniteCoins:new URLSearchParams(location.search).get('infiniteCoins')==='1'});
let roundKey=null,roundReward=null,mapAim=false,battleMap='hills',tutorial=null,tutorialRendered=-1;
function beginRewardRound(){roundKey=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;roundReward=null;}
function walletUI(){$('coinBalance').textContent=profile.coins.toLocaleString('zh-CN');}
function shop(){walletUI();const v=VEHICLES.longnose_artillery,owned=profile.owned.includes(v.id);showModal('shop',`<span class="eyebrow">SHOP</span><h3>商城</h3><div class="balance-line">战币余额 <b>${profile.coins}</b></div><h4>${v.name}</h4><canvas id="vehiclePreview" class="vehicle-preview" aria-label="车辆3D展示，拖动旋转"></canvas><p>152mm火炮 · 无人机 · 高射机枪<br>速度27m/s · 侦察250m · 血量100</p><button id="buyLongnose" class="btn" ${owned||profile.coins<v.price?'disabled':''}>${owned?'已拥有':'购买 · 500战币'}</button><button id="shopClose" class="btn secondary">返回主菜单</button>`,{buyLongnose:()=>{if(profile.purchase(v.id)){toast('长鼻熊已加入仓库');shop();}},shopClose:closeModal});renderer.showPreview($('vehiclePreview'),v.id);}
function warehouse(){showModal('warehouse',`<span class="eyebrow">GARAGE</span><h3>仓库</h3>${profile.owned.map(id=>`<button id="vehicle-${id}" class="vehicle-card"><svg><use href="#i-truck"/></svg><span><b>${escape(VEHICLES[id].name)}</b><small>${profile.selected===id?'当前出战':'已拥有'} · 查看车辆与武器数值</small></span><span>›</span></button>`).join('')}<button id="warehouseClose" class="btn secondary">返回主菜单</button>`,{warehouseClose:closeModal,...Object.fromEntries(profile.owned.map(id=>[`vehicle-${id}`,()=>vehicleDetails(id)]))});}
function statRows(rows){return `<dl class="spec-list">${rows.map(([label,value])=>`<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>`;}
function weaponRows(id){const w=WEAPONS[id],rows=[['装填 / 冷却',w.cooldown?`${w.cooldown} 秒`:'无冷却'],['飞行速度',`${w.speed.toFixed(0)} m/s`]];
 if(w.directDamage)rows.push(['直接命中伤害',`${w.directDamage} HP`]);
 if(w.nearDamage)rows.push(['近炸伤害',`${w.nearDamage[0]}–${w.nearDamage[1]} HP`]);
 if(w.blastRadius)rows.push(['爆炸范围',`${w.blastRadius} m`]);
 if(w.range)rows.push(['最大射程',`${w.range} m`],['爆炸方式','落地爆炸']);
 if(w.hp)rows.push(['空中耐久',`${w.hp} HP`]);
 if(w.recon)rows.push(['侦察距离',`${w.recon} m`]);
 if(w.life!==null)rows.push([id==='uav'?'能量续航':'飞行时限',`${w.life} 秒`]);
 if(w.lockRange)rows.push(['自动锁定范围',`${w.lockRange} m`]);
 if(w.airDamage)rows.push(['空中目标伤害',`${w.airDamage} HP / 发`]);
 if(w.groundDamage)rows.push(['车辆伤害',`${w.groundDamage} HP / 发`]);
 if(w.fireInterval)rows.push(['射速',`${Math.round(60/w.fireInterval)} 发 / 分钟`],['理论弹道距离',`${Math.round(w.speed*w.life)} m`]);
 if(id==='uav')rows.push(['盘旋半径','50 m'],['操控方式','手动飞行 / 自动盘旋']);
 if(id==='missile')rows.push(['操控方式','手动飞行']);
 if(id==='sam')rows.push(['操控方式','发射后自动追踪']);
 if(id==='mg')rows.push(['操控方式','手动瞄准，按住开火']);return rows;}
function vehicleDetails(id){const v=VEHICLES[id];if(!v||!profile.owned.includes(id))return;
 showModal('vehicle',`<span class="eyebrow">VEHICLE / OWNED</span><div class="vehicle-detail-header"><h3>${escape(v.name)}</h3><button id="vehicleBackTop" class="detail-back">返回仓库</button></div><canvas id="vehiclePreview" class="vehicle-preview" aria-label="车辆3D展示，拖动旋转"></canvas><p>${escape(v.description)}</p>${statRows([['尺寸',`${v.dimensions.length} × ${v.dimensions.width} × ${v.dimensions.height} m`],['情报留存',`${v.intelLife} 秒`],['血量',`${v.hp} HP`],['最高速度',`${v.speed} m/s · ${(v.speed*3.6).toFixed(1)} km/h`],['倒车速度',`${v.reverseSpeed} m/s`],['侦察距离',`${v.recon} m`],['携带武器',v.weapons.map(k=>WEAPONS[k].name).join('、')]])}<h4>武器数值</h4>${v.weapons.map(k=>`<section class="weapon-spec" data-spec="${k}"><h4>${escape(WEAPONS[k].name)}</h4>${statRows(weaponRows(k))}</section>`).join('')}<button id="equipVehicle" class="btn" ${profile.selected===id?'disabled':''}>${profile.selected===id?'已设为出战车辆':'设为出战车辆'}</button><button id="vehicleBack" class="btn secondary">返回仓库</button>`,{equipVehicle:()=>{profile.equip(id);vehicleDetails(id);},vehicleBack:warehouse,vehicleBackTop:warehouse});renderer.showPreview($('vehiclePreview'),id);}
try{difficulty=localStorage.getItem('bf-difficulty')||'standard';if(!difficultyNames[difficulty])difficulty='standard';}catch(_){}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const audio=new GameAudio();
try{audio.enabled=localStorage.getItem('bf-sound')!=='off';}catch(_){}
function soundUI(){document.querySelectorAll('.sound-button').forEach(b=>{b.classList.toggle('muted',!audio.enabled);b.setAttribute('aria-label',audio.enabled?'关闭声音':'开启声音');});}
function vibrate(ms){try{if(native&&native.vibrate)native.vibrate(ms);else if(navigator.vibrate)navigator.vibrate(ms);}catch(_){} }
function toast(message){$('toast').textContent=message;$('toast').classList.remove('hidden');toastUntil=performance.now()+2300;}
function showModal(kind,html,handlers={}){renderer.hidePreview();modalKind=kind;$('modalCard').innerHTML=html;$('modal').classList.remove('hidden');for(const[id,fn]of Object.entries(handlers)){const el=$(id);if(el)el.addEventListener('click',fn);}}
function closeModal(){renderer.hidePreview();$('modal').classList.add('hidden');$('modalCard').innerHTML='';modalKind=null;}
function setScreen(next){screen=next;$('menu').classList.toggle('hidden',next!=='menu');$('battle').classList.toggle('hidden',next!=='battle');renderer.resize();}
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
function select(k){if(!Object.prototype.hasOwnProperty.call(C,k)||!view?.own.weapons.includes(k))return;stopFire();aimTarget=null;dispatch({type:'vehicle'},true);const r=dispatch({type:'select',weapon:k},true);if(!r.ok)return;selected=k;document.querySelectorAll('[data-weapon]').forEach(b=>b.classList.toggle('selected',b.dataset.weapon===k));updateHUD();}
function startAI(seed){document.querySelectorAll('.tutorial-highlight').forEach(el=>el.classList.remove('tutorial-highlight'));tutorial=null;$('tutorialPanel').classList.add('hidden');disconnect(false);audio.init();audio.reset();closeModal();engine=new Engine({mode:'ai',mapId:battleMap,difficulty,seed,vehicles:[profile.selected]});renderer.setMap(engine.mapId);beginRewardRound();view=engine.snapshot(0);mapAim=false;paused=false;lastLog=0;oldHp=view.own.maxHp;selected=view.own.selected;resetInput();renderer.cameraKey=null;lastFrame=performance.now();toastUntil=0;$('toast').classList.add('hidden');$('modeLabel').textContent=`单人训练 / ${difficultyNames[difficulty]}`;setScreen('battle');select(selected);updateHUD();}
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
function returnMenu(){document.querySelectorAll('.tutorial-highlight').forEach(el=>el.classList.remove('tutorial-highlight'));tutorial=null;$('tutorialPanel').classList.add('hidden');mapAim=false;disconnect(false);engine=null;view=null;paused=false;resetInput();audio.reset();closeModal();setScreen('menu');walletUI();}
function resetInput(){const captures=[['joystick',joystickPointer],['world',aimPointer],['fireButton',firePointer]];stick.x=stick.y=0;keys.clear();joystickPointer=aimPointer=firePointer=null;drag=aimTarget=null;$('stickKnob').style.transform='';for(const[id,pointer]of captures){if(pointer!==null)try{if($(id).hasPointerCapture(pointer))$(id).releasePointerCapture(pointer);}catch(_){}}}
function currentPilot(){return view&&view.shots.find(s=>s.mine&&s.id===view.own.pilot);}
function control(silent=true){if(!view||modalKind||paused&&!netRole||view.over)return;const throttle=clamp(-stick.y+(keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0),-1,1),steer=clamp(stick.x+(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),-1,1);const a={type:'control',throttle,steer};if(aimTarget){a.yaw=aimTarget.yaw;a.pitch=aimTarget.pitch;aimTarget=null;}dispatch(a,silent);}
function fire(){if(!view||modalKind||view.over)return;audio.init();control();const pilot=currentPilot();if(pilot){dispatch({type:'detonate'});}else if(selected==='mg'){dispatch({type:'mg',active:true},true);}else dispatch({type:'fire'});updateHUD();}
function stopFire(e){if(e&&e.pointerId!==undefined&&e.pointerId!==firePointer)return;firePointer=null;if(view&&(view.own.mg||selected==='mg'))dispatch({type:'mg',active:false},true);$('fireButton').classList.remove('firing');}
function result(){if(modalKind==='result'||!view)return;const outcome=view.outcome,title={win:'交火胜利',loss:'发射车损失',draw:'本局平局'}[outcome],s=view.own.stats,time=Math.round(Math.min(180,Math.max(0,view.t-3)));
 if(roundReward===null)roundReward=tutorial?(tutorial.done?profile.completeTutorial():0):profile.reward(roundKey,outcome);walletUI();
 showModal('result',`<span class="eyebrow">AFTER ACTION / ${netRole?'DUEL':'SOLO'}</span><h3 class="result-heading ${outcome}">${title}</h3><p>${escape(view.reason)}</p><div class="balance-line" id="roundCoins">战币 +${roundReward} <b>余额 ${profile.coins}</b></div>${profile.saved?'':'<p>本机存储不可用，战币暂存至关闭游戏。</p>'}<div class="result-grid"><div><small>造成伤害</small><b>${s.damage}<span>HP</span></b></div><div><small>剩余耐久</small><b>${view.own.hp}<span>HP</span></b></div><div><small>确认热源</small><b>${s.detections}<span>次</span></b></div><div><small>成功拦截</small><b>${s.intercepted}<span>次</span></b></div><div><small>装备发射</small><b>${s.launches}<span>次</span></b></div><div><small>交火时间</small><b>${time}<span>秒</span></b></div></div>${netRole?'':'<button id="again" class="btn">再次出战</button>'}<button id="backMenu" class="btn secondary">返回主菜单</button>`,{again:()=>tutorial?startTutorial():startAI(),backMenu:returnMenu});audio.play(outcome==='win'?'lock':'warning');resetInput();
}
function updateHUD(){
 if(!view)return;const p=view.own,pilot=currentPilot(),m=Math.floor(view.remaining/60),s=Math.floor(view.remaining%60);$('timer').textContent=tutorial?'引导':`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
 $('hpBar').style.width=p.hp/p.maxHp*100+'%';$('hpBar').style.background=p.hp<p.maxHp*.35?'#ffac89':'#c5edc5';$('hpNumber').textContent=p.hp;$('vehicleName').textContent=vehicleSpec(p.vehicleId).name;
 const badge=$('intelBadge');badge.className='intel-badge';if(view.enemy&&view.enemy.precise){badge.textContent=view.enemy.retained?`情报保留 ${view.enemy.left.toFixed(1)}s`:'目标位置确认';badge.classList.add('lock');}else if(view.enemy){badge.textContent='旧位置 · 可能已移动';badge.classList.add('suspect');}else if(view.clues.length){badge.textContent='发现方向线索';badge.classList.add('suspect');}else badge.textContent='敌情未知';
 $('threatAlert').classList.toggle('hidden',!view.threats);$('threatAlert').textContent=`空中威胁 × ${view.threats}`;
 const uav=view.shots.find(s=>s.mine&&s.kind==='uav');$('takeUAV').classList.toggle('hidden',!uav||!!pilot||!!uav.orbit);$('returnVehicle').classList.toggle('hidden',!pilot);$('uavOrbit').classList.toggle('hidden',!uav||!!pilot&&pilot.kind!=='uav');$('uavOrbitLabel').textContent=uav&&uav.orbit?'手动飞行':'50m盘旋';$('uavOrbit').classList.toggle('active',!!uav&&!!uav.orbit);
 $('artilleryMode').textContent=p.artilleryMode==='direct'?'改为曲射':'改为平射';$('artilleryMode').setAttribute('aria-label',p.artilleryMode==='direct'?'切换为曲射模式':'切换为平射模式');
 $('cameraBadge').querySelector('span').textContent=pilot?`${names[pilot.kind]} / 手动追尾`:'发射车 / 第三人称';$('stickLabel').textContent=pilot?'左右转向 / 上下俯仰':'驾驶 / 转向';
 $('flightMode').textContent=pilot?`${names[pilot.kind]} · ${pilot.remaining.toFixed(0)}s 续航`:selected==='artillery'?`火炮 / ${p.artilleryMode==='direct'?'平射':'曲射'}`:uav&&uav.orbit?`无人机盘旋 · ${uav.remaining.toFixed(0)}s 能量`:'地面机动 / LAUNCHER';$('altitude').textContent=pilot?`离地 ${Math.max(0,pilot.y-terrain(pilot.x,pilot.z)).toFixed(0)} m · ${pilot.speed} m/s`:`速度 ${Math.abs(p.speed).toFixed(0)} m/s`;
 $('mapAimToggle').classList.toggle('hidden',!!pilot||selected!=='artillery'||p.artilleryMode!=='curve');if(pilot||selected!=='artillery'||p.artilleryMode!=='curve')mapAim=false;renderer.mapAim=mapAim;$('mapCameraControls').classList.toggle('hidden',!mapAim);$('mapAimToggle').textContent=mapAim?'返回车尾视角':'地图瞄准';
 const a=pilot||p.aim[selected];let aimText=`仰角 ${(a.pitch*180/Math.PI).toFixed(0)}°`;
 if(!pilot&&selected==='artillery'){const arc=ballistic(p);aimText+=arc.range===null?' · 落点在战区外':` · 距离 ${arc.range.toFixed(0)} m`;}else aimText+=` · 航向 ${((a.yaw*180/Math.PI+360)%360).toFixed(0)}°`;$('aimInfo').textContent=aimText;
 document.querySelector('.weapon-row').style.setProperty('--weapon-count',p.weapons.length);
 for(const b of document.querySelectorAll('.weapon')){const k=b.dataset.weapon,cd=p.cd[k],available=p.weapons.includes(k);b.classList.toggle('hidden',!available);b.disabled=!available;b.style.order=p.weapons.indexOf(k);b.classList.toggle('selected',k===selected);b.classList.toggle('cooling',cd>0);b.querySelector('.cooldown').style.width=C[k]&&cd>0?cd/C[k]*100+'%':'0%';b.querySelector('small').textContent=cd>0?`${cd.toFixed(1)}s`:k==='mg'?'按住开火':k==='uav'&&uav?(uav.orbit?'盘旋中':'飞行中'):'就绪';}
 const cd=p.cd[selected],fb=$('fireButton');fb.classList.toggle('cooling',!pilot&&cd>0);fb.classList.toggle('firing',p.mg);fb.disabled=false;
 $('fireLabel').textContent=pilot?(pilot.kind==='sam'?'飞行中':'引爆'):selected==='mg'?'开火':cd>0?`${cd.toFixed(1)}s`:'发射';$('fireSub').textContent=pilot?(pilot.kind==='uav'?'贴近后自爆':'手动引爆'):selected==='sam'?'自动锁定':selected==='mg'?'按住持续射击':Math.abs(p.speed)>2?'停车后发射':'手动控制';
 $('dragHint').textContent=pilot?'拖动调整航向':selected==='sam'?'发射后自动追踪':'右侧拖动瞄准';
 const hints={uav:'手动侦察 · 可切换50m盘旋',missile:'手动飞行 · 命中80伤害',artillery:`${p.artilleryMode==='direct'?'平射':'曲射'}模式 · 拖动瞄准 / 点击切换`,sam:'自动锁定空中目标 · 装填25秒',mg:'手动瞄准空中目标 · 按住开火'};
 $('actionHint').textContent=pilot?'左摇杆控制飞行 · 可随时返回车辆':hints[selected];
 const count=$('countdown');count.classList.toggle('hidden',view.started);if(!view.started)count.innerHTML=`${Math.ceil(view.countdown)}<small>正在进入未知空域</small>`;
 if(view.log.length&&view.log[0].id!==lastLog){const log=view.log[0];lastLog=log.id;$('eventLine').querySelector('span').textContent=log.text;$('eventLine').className='event-line '+(['hit','danger'].includes(log.kind)?'danger':log.kind==='warning'?'warning':'');if(log.kind==='lock'){audio.play('lock');vibrate(25);}}
 if(p.hp<oldHp){damageUntil=performance.now()+450;vibrate(65);}oldHp=p.hp;if(view.over)result();
}
function guide(backToPause=false){showModal('guide',`
 <span class="eyebrow">FIELD MANUAL / 2km × 2km</span><h3>悍驴出战，盘旋侦察。</h3>
 <ol class="guide-list">
 <li><b>2km × 2km 的3D战场。</b>左摇杆驾驶，拖动画面瞄准。默认是车辆第三人称追尾视角。车体两侧小蓝块标记我方，小红块标记敌方。停车后才能发射。</li>
 <li><b>巡航导弹与无人机手动飞行。</b>发射后切换追尾视角，摇杆上下调整俯仰、左右转向，也可拖动调整航向。可随时返回车辆，再次接管无人机。</li>
 <li><b>悍驴导弹车。</b>血量100，最高速度33m/s，车辆侦察300m。携带巡航导弹、无人机、防空导弹和高射机枪，不携带火炮。在仓库可查看车辆和武器的完整数值。</li>
 <li><b>无人机可以50米盘旋待机。</b>点击“50m盘旋”切回车辆，无人机自动绕半径50米的圆飞行并继续侦察。点击“手动飞行”即可重新接管。40秒总续航持续消耗，切换模式不会重置能量。</li>
 <li><b>侦察范围各不相同。</b>车辆300m、无人机400m、巡航导弹200m，按距离发现敌方，不需要朝向或手动锁定。目标脱离全部我方侦察范围后，3D画面和小地图保留最后位置5秒，然后同时消失。</li>
 <li><b>防空导弹自动锁定。</b>发射即自动追踪300米内的空中目标，优先巡航导弹，保持车辆视角。装填25秒，无目标时不消耗装填。炮弹不可拦截。</li>
 <li><b>机枪需要手动瞄准。</b>按住开火连续射击，无冷却。无人机耐久27、巡航导弹耐久18，每发机枪空中伤害9。白色尾迹每段保留8秒。</li>
 <li><b>训练新增困难 AI。</b>更快判断弹道线索、分区侦察、预测已发现目标的移动，开火后转移，并用自动防空导弹和手动机枪保护车辆。困难 AI 的血量、伤害、装填、各单位侦察范围与5秒情报规则与玩家相同。</li>
 <li><b>车辆和武器具有独立音效。</b>引擎随车速变化，发射、机枪开火、命中、爆炸和无人机旋翼各有声音。可在作战菜单开关声音。</li>
 <li><b>100 HP，限时3分钟。</b>导弹直击80、近炸45–60；无人机贴近自爆30。没有诱饵。绿色圆圈是侦察范围，蓝色虚线小圆是无人机盘旋范围。</li>
 </ol><div class="hint-box">装填：无人机10秒 · 导弹22秒 · 防空弹25秒<br>${EDITION==='h5'?'H5版本提供单人训练，支持新兵、标准、困难三种难度。':'远程联机暂时关闭。同网模式使用6位码，双方请使用v0.9。'}<br>键盘：WASD 驾驶 / 飞行 · 1–4 切换携带装备 · 空格开火 · F 返回车辆</div>
 <button id="guideClose" class="btn">准备行动</button>`,{guideClose:()=>{if(backToPause)showPause();else closeModal();}});}
function showPause(){if(screen!=='battle'||!view||view.over)return;stopFire();dispatch({type:'control',throttle:0,steer:0},true);resetInput();if(!netRole)paused=true;
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
function validView(v){return v&&v.version===8&&v.own&&Array.isArray(v.own.weapons)&&v.own.weapons.length>0&&v.own.weapons.length<=5&&v.own.weapons.every(k=>Object.hasOwn(C,k))&&v.own.weapons.includes(v.own.selected)&&Number.isFinite(v.own.wheelTravel)&&Number.isFinite(v.own.maxHp)&&v.own.maxHp>0&&Number.isFinite(v.own.x)&&Number.isFinite(v.own.y)&&Number.isFinite(v.own.z)&&Number.isFinite(v.t)&&v.own.cd&&v.own.aim&&v.own.stats&&['curve','direct'].includes(v.own.artilleryMode)&&['shots','clues','effects','trails','log','sounds'].every(k=>Array.isArray(v[k])&&v[k].length<160);}
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
$('startAI').addEventListener('click',()=>startAI());$('openShop').addEventListener('click',shop);$('openWarehouse').addEventListener('click',warehouse);walletUI();$('openLAN').addEventListener('click',lanMenu);$('openGuide').addEventListener('click',()=>guide());$('pauseButton').addEventListener('click',showPause);
document.querySelectorAll('[data-weapon]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.weapon)));
$('returnVehicle').addEventListener('click',()=>{stopFire();resetInput();dispatch({type:'vehicle'});updateHUD();});
$('takeUAV').addEventListener('click',()=>{const u=view&&view.shots.find(s=>s.mine&&s.kind==='uav');if(u){resetInput();dispatch({type:'pilot',id:u.id});updateHUD();}});
$('uavOrbit').addEventListener('click',()=>{const u=view&&view.shots.find(s=>s.mine&&s.kind==='uav');if(u){resetInput();control();dispatch({type:'uav-orbit',id:u.id,active:!u.orbit});updateHUD();}});
$('battleMap').addEventListener('change',e=>{battleMap=e.target.value;});
$('mapZoomIn').onclick=()=>renderer.zoomMap(.8);$('mapZoomOut').onclick=()=>renderer.zoomMap(1.25);
$('mapAimToggle').addEventListener('click',()=>{mapAim=!mapAim;resetInput();renderer.cameraKey=null;updateHUD();});
$('artilleryMode').addEventListener('click',()=>{stopFire();resetInput();control();dispatch({type:'artillery-mode',mode:view.own.artilleryMode==='direct'?'curve':'direct'});updateHUD();});
$('fireButton').addEventListener('pointerdown',e=>{if(firePointer!==null||modalKind)return;e.preventDefault();firePointer=e.pointerId;try{$('fireButton').setPointerCapture(e.pointerId);}catch(_){}fire();});
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('fireButton').addEventListener(name,stopFire);
function moveStick(e){const r=$('joystick').getBoundingClientRect(),radius=r.width*.34,dx=e.clientX-r.x-r.width/2,dy=e.clientY-r.y-r.height/2,len=Math.hypot(dx,dy),scale=len>radius?radius/len:1;stick.x=dx*scale/radius;stick.y=dy*scale/radius;if(Math.abs(stick.x)<.08)stick.x=0;if(Math.abs(stick.y)<.08)stick.y=0;$('stickKnob').style.transform=`translate(${stick.x*radius}px,${stick.y*radius}px)`;}
$('joystick').addEventListener('pointerdown',e=>{if(modalKind||joystickPointer!==null)return;e.preventDefault();joystickPointer=e.pointerId;$('joystick').setPointerCapture(e.pointerId);moveStick(e);audio.init();});
$('joystick').addEventListener('pointermove',e=>{if(joystickPointer===e.pointerId)moveStick(e);});
function releaseStick(e){if(joystickPointer!==e.pointerId)return;joystickPointer=null;stick.x=stick.y=0;$('stickKnob').style.transform='';control();}
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('joystick').addEventListener(name,releaseStick);
const mapPointers=new Map();let mapGesture=null;
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
 if(aimPointer!==e.pointerId||!drag)return;aimTarget={yaw:drag.yaw+(e.clientX-drag.x)*.006,pitch:drag.pitch-(e.clientY-drag.y)*.0045};
});
function releaseAim(e){if(mapPointers.has(e.pointerId)){if(e.type==='pointerup'&&mapPointers.size===1&&!mapGesture.moved){const q=renderer.mapTarget(e.clientX,e.clientY);if(q)dispatch({type:'map-aim',x:q.x,z:q.z});}mapPointers.delete(e.pointerId);return;}if(aimPointer!==e.pointerId)return;control();aimPointer=null;drag=null;}
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('world').addEventListener(name,releaseAim);
window.addEventListener('keydown',e=>{if(screen!=='battle'||modalKind||!view)return;const k=e.key.toLowerCase();if(['w','s','a','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){e.preventDefault();keys.add(k);}else if(k===' '&&!e.repeat){e.preventDefault();fire();}else if(/^[1-5]$/.test(k))select(view.own.weapons[Number(k)-1]);else if(k==='f'){$('returnVehicle').click();}else if(k==='escape')showPause();});
window.addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());if(e.key===' ')stopFire();});
window.showPause=showPause;
window.onNativeBack=function(){if(modalKind==='interrupted'){returnMenu();return;}if(modalKind==='pause'){paused=false;closeModal();return;}if(screen==='battle'){if(view&&view.over)returnMenu();else showPause();}else if(modalKind){if(['waiting','join','interrupted'].includes(modalKind)){disconnect(false);lanMenu();}else closeModal();}else if(native&&native.finishApp)native.finishApp();};
window.onNativePause=function(){stopFire();dispatch({type:'control',throttle:0,steer:0},true);resetInput();if(netRole){if(view&&view.over)disconnect(false);else interrupted('设备切至后台，双人连接已结束。');}else if(screen==='battle'&&engine&&view&&!view.over)showPause();audio.stopLoops();if(audio.ctx)audio.ctx.suspend().catch(()=>{});};
window.onNativeResume=function(){lastFrame=performance.now();};
window.addEventListener('blur',()=>{stopFire();dispatch({type:'control',throttle:0,steer:0},true);resetInput();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)window.onNativePause();else window.onNativeResume();});
function frame(now){const elapsed=Math.min(.1,(now-lastFrame)/1000);lastFrame=now;
 if(screen==='battle'){
  if(view&&now-lastInput>50){lastInput=now;control();}
  if(engine&&(!paused||netRole)&&!engine.over){let left=elapsed;while(left>0){const dt=Math.min(left,1/60);engine.update(dt);left-=dt;}view=engine.snapshot(0);if(tutorial)tickTutorial();}
  if(netRole==='host'&&connected&&engine&&now-lastSend>66){lastSend=now;sendNet({type:'state',view:engine.snapshot(1)});}
  if(view)renderer.draw(view,now/1000,elapsed);if(now-lastHud>90){lastHud=now;updateHUD();}
 }else renderer.draw(null,now/1000,elapsed);
 audio.sync(screen==='battle'?view:null,!paused&&modalKind!=='interrupted');
 if(toastUntil&&now>toastUntil){$('toast').classList.add('hidden');toastUntil=0;}$('damageFlash').classList.toggle('active',now<damageUntil);
 if(netRole==='guest'&&connected&&now-lastPeerAt>12000){disconnect(false);interrupted('对方长时间未响应，请重新连接。');}
 requestAnimationFrame(frame);
}
soundUI();if(!profile.tutorialDone&&!isTest)startTutorial();requestAnimationFrame(frame);
if(isTest)window.GameDebug={openRemote,onlineJoin,start:startAI,startTutorial,get tutorial(){return tutorial;},get profile(){return profile;},get engine(){return engine;},get view(){return view;},get renderer(){return renderer;},get audio(){return audio;},get selected(){return selected;},get netRole(){return netRole;},get transport(){return transport;},get remote(){return remote;},dispatch,select,fire,stopFire,updateHUD,pause:showPause,returnMenu,control};

// Agent access uses the same visible start/menu actions; battle state is read-only.
const modelContext=document.modelContext;
if(modelContext?.registerTool){const lifecycle=new AbortController();for(const tool of[
{name:'read_battle_status',description:'Read the same friendly status and discovered enemy information shown on screen.',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{},additionalProperties:false},execute:input=>{if(!input||Object.keys(input).length)throw new Error('No parameters expected');return {screen,mode:transport||'solo',status:view?{hp:view.own.hp,remaining:view.remaining,selected:view.own.selected,enemy:view.enemy,over:view.over}:null};}},
{name:'start_training',description:'Start a new offline AI training round from the game menu.',annotations:{readOnlyHint:false},inputSchema:{type:'object',properties:{},additionalProperties:false},execute:input=>{if(!input||Object.keys(input).length||screen!=='menu'||netRole)throw new Error('Return to the main menu before starting training');startAI();return{started:true,mode:'solo'};}}
])try{Promise.resolve(modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch(_){}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}
