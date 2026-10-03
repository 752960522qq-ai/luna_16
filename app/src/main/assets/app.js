import { Renderer } from './render.js';
const $=id=>document.getElementById(id),{Engine,C,ballistic,clamp,terrain}=window.Blindfire;
const renderer=new Renderer($('world'),$('mini'));
const native=window.Native||null,isTest=new URLSearchParams(location.search).has('test');
let engine=null,view=null,screen='menu',selected='missile',paused=false,difficulty='standard',netRole=null,connected=false;
let lastFrame=performance.now(),lastSend=0,lastHud=0,lastInput=0,lastPeerAt=0,lastLog=0,oldHp=100,toastUntil=0,modalKind=null,seq=0,remoteSeq=0,commandCount=0,commandWindow=0;
let joystickPointer=null,aimPointer=null,firePointer=null,drag=null,aimTarget=null,lastMGSound=0,damageUntil=0;
const stick={x:0,y:0},keys=new Set();
const names={uav:'无人机',missile:'巡航导弹',artillery:'曲射火炮',sam:'防空导弹',mg:'高射机枪'};
try{difficulty=localStorage.getItem('bf-difficulty')||'standard';}catch(_){}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const audio={enabled:true,ctx:null,
 init(){if(!this.enabled)return;try{if(!this.ctx)this.ctx=new(window.AudioContext||window.webkitAudioContext)();if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});}catch(_){}},
 play(kind){if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;const ctx=this.ctx,now=ctx.currentTime,s={click:[660,400,.045,.055],scout:[900,1600,.15,.05],lock:[700,1300,.22,.09],attack:[160,45,.32,.13],defense:[1200,300,.17,.07],hit:[90,25,.38,.18],warning:[400,250,.12,.055],mg:[240,70,.035,.03]}[kind]||[550,400,.05,.035];const o=ctx.createOscillator(),g=ctx.createGain();o.type=['attack','hit','mg'].includes(kind)?'triangle':'sine';o.frequency.setValueAtTime(s[0],now);o.frequency.exponentialRampToValueAtTime(s[1],now+s[2]);g.gain.setValueAtTime(s[3],now);g.gain.exponentialRampToValueAtTime(.001,now+s[2]);o.connect(g);g.connect(ctx.destination);o.start(now);o.stop(now+s[2]+.01);}
};
try{audio.enabled=localStorage.getItem('bf-sound')!=='off';}catch(_){}
function soundUI(){document.querySelectorAll('.sound-button').forEach(b=>{b.classList.toggle('muted',!audio.enabled);b.setAttribute('aria-label',audio.enabled?'关闭声音':'开启声音');});}
function vibrate(ms){try{if(native&&native.vibrate)native.vibrate(ms);else if(navigator.vibrate)navigator.vibrate(ms);}catch(_){} }
function toast(message){$('toast').textContent=message;$('toast').classList.remove('hidden');toastUntil=performance.now()+2300;}
function showModal(kind,html,handlers={}){modalKind=kind;$('modalCard').innerHTML=html;$('modal').classList.remove('hidden');for(const[id,fn]of Object.entries(handlers)){const el=$(id);if(el)el.addEventListener('click',fn);}}
function closeModal(){$('modal').classList.add('hidden');$('modalCard').innerHTML='';modalKind=null;}
function setScreen(next){screen=next;$('menu').classList.toggle('hidden',next!=='menu');$('battle').classList.toggle('hidden',next!=='battle');renderer.resize();}
function sendNet(data){if(native&&connected){try{native.send(JSON.stringify(data));}catch(_){}}}
function dispatch(action,silent=false){
 if(!view||view.over||paused&&!netRole)return {ok:false};
 if(netRole==='guest'){sendNet({type:'command',seq:++seq,action});return {ok:true};}
 if(!engine)return {ok:false};const r=engine.command(0,action);view=engine.snapshot(0);
 if(!r.ok&&!silent){toast(r.reason);audio.play('warning');}
 else if(r.ok&&!silent){audio.init();audio.play(action.type==='fire'?(selected==='uav'?'scout':selected==='sam'?'defense':'attack'):action.type==='detonate'?'attack':'click');if(action.type==='fire'||action.type==='detonate')vibrate(15);}
 return r;
}
function select(k){if(!Object.prototype.hasOwnProperty.call(C,k))return;stopFire();aimTarget=null;selected=k;dispatch({type:'vehicle'},true);dispatch({type:'select',weapon:k},true);document.querySelectorAll('[data-weapon]').forEach(b=>b.classList.toggle('selected',b.dataset.weapon===k));updateHUD();}
function startAI(seed){disconnect(false);audio.init();closeModal();engine=new Engine({mode:'ai',difficulty,seed});view=engine.snapshot(0);paused=false;lastLog=0;oldHp=100;selected='missile';resetInput();renderer.cameraKey=null;lastFrame=performance.now();toastUntil=0;$('toast').classList.add('hidden');$('modeLabel').textContent=`单人训练 / ${difficulty==='easy'?'新兵':'标准'}`;setScreen('battle');select('missile');updateHUD();}
function returnMenu(){disconnect(false);engine=null;view=null;paused=false;resetInput();closeModal();setScreen('menu');}
function resetInput(){const captures=[['joystick',joystickPointer],['world',aimPointer],['fireButton',firePointer]];stick.x=stick.y=0;keys.clear();joystickPointer=aimPointer=firePointer=null;drag=aimTarget=null;$('stickKnob').style.transform='';for(const[id,pointer]of captures){if(pointer!==null)try{if($(id).hasPointerCapture(pointer))$(id).releasePointerCapture(pointer);}catch(_){}}}
function currentPilot(){return view&&view.shots.find(s=>s.mine&&s.id===view.own.pilot);}
function control(silent=true){if(!view||modalKind||paused&&!netRole||view.over)return;const throttle=clamp(-stick.y+(keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0),-1,1),steer=clamp(stick.x+(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),-1,1);const a={type:'control',throttle,steer};if(aimTarget){a.yaw=aimTarget.yaw;a.pitch=aimTarget.pitch;aimTarget=null;}dispatch(a,silent);}
function fire(){if(!view||modalKind||view.over)return;audio.init();control();const pilot=currentPilot();if(pilot){dispatch({type:'detonate'});}else if(selected==='mg'){dispatch({type:'mg',active:true},true);audio.play('mg');}else dispatch({type:'fire'});updateHUD();}
function stopFire(e){if(e&&e.pointerId!==undefined&&e.pointerId!==firePointer)return;firePointer=null;if(view&&(view.own.mg||selected==='mg'))dispatch({type:'mg',active:false},true);$('fireButton').classList.remove('firing');}
function result(){if(modalKind==='result'||!view)return;const outcome=view.outcome,title={win:'交火胜利',loss:'发射车损失',draw:'本局平局'}[outcome],s=view.own.stats,time=Math.round(Math.min(180,Math.max(0,view.t-3)));
 showModal('result',`<span class="eyebrow">AFTER ACTION / ${netRole?'DUEL':'SOLO'}</span><h3 class="result-heading ${outcome}">${title}</h3><p>${escape(view.reason)}</p><div class="result-grid"><div><small>造成伤害</small><b>${s.damage}<span>HP</span></b></div><div><small>剩余耐久</small><b>${view.own.hp}<span>HP</span></b></div><div><small>确认热源</small><b>${s.detections}<span>次</span></b></div><div><small>成功拦截</small><b>${s.intercepted}<span>次</span></b></div><div><small>装备发射</small><b>${s.launches}<span>次</span></b></div><div><small>交火时间</small><b>${time}<span>秒</span></b></div></div>${netRole?'':'<button id="again" class="btn">再次出战</button>'}<button id="backMenu" class="btn secondary">返回主菜单</button>`,{again:()=>startAI(),backMenu:returnMenu});audio.play(outcome==='win'?'lock':'hit');resetInput();
}
function updateHUD(){
 if(!view)return;const p=view.own,pilot=currentPilot(),m=Math.floor(view.remaining/60),s=Math.floor(view.remaining%60);$('timer').textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
 $('hpBar').style.width=p.hp+'%';$('hpBar').style.background=p.hp<35?'#ffac89':'#c5edc5';$('hpNumber').textContent=p.hp;
 const badge=$('intelBadge');badge.className='intel-badge';if(view.enemy&&view.enemy.precise){badge.textContent=view.enemy.retained?`情报保留 ${view.enemy.left.toFixed(1)}s`:'目标确认 · 300m';badge.classList.add('lock');}else if(view.enemy){badge.textContent='旧位置 · 可能已移动';badge.classList.add('suspect');}else if(view.clues.length){badge.textContent='发现方向线索';badge.classList.add('suspect');}else badge.textContent='敌情未知';
 $('threatAlert').classList.toggle('hidden',!view.threats);$('threatAlert').textContent=`空中威胁 × ${view.threats}`;
 const uav=view.shots.find(s=>s.mine&&s.kind==='uav');$('takeUAV').classList.toggle('hidden',!uav||!!pilot);$('returnVehicle').classList.toggle('hidden',!pilot);
 $('cameraBadge').querySelector('span').textContent=pilot?`${names[pilot.kind]} / 手动追尾`:'发射车 / 第三人称';$('stickLabel').textContent=pilot?'左右转向 / 上下俯仰':'驾驶 / 转向';
 $('flightMode').textContent=pilot?`${names[pilot.kind]} · ${pilot.remaining.toFixed(0)}s 续航`:'地面机动 / LAUNCHER';$('altitude').textContent=pilot?`离地 ${Math.max(0,pilot.y-terrain(pilot.x,pilot.z)).toFixed(0)} m · ${pilot.speed} m/s`:`速度 ${Math.abs(p.speed).toFixed(0)} m/s`;
 const a=pilot||p.aim[selected];let aimText=`仰角 ${(a.pitch*180/Math.PI).toFixed(0)}°`;
 if(!pilot&&selected==='artillery'){const arc=ballistic(p);aimText+=arc.range===null?' · 落点在战区外':` · 距离 ${arc.range.toFixed(0)} m`;}else aimText+=` · 航向 ${((a.yaw*180/Math.PI+360)%360).toFixed(0)}°`;$('aimInfo').textContent=aimText;
 for(const b of document.querySelectorAll('.weapon')){const k=b.dataset.weapon,cd=p.cd[k];b.classList.toggle('selected',k===selected);b.classList.toggle('cooling',cd>0);b.querySelector('.cooldown').style.width=C[k]&&cd>0?cd/C[k]*100+'%':'0%';b.querySelector('small').textContent=cd>0?`${cd.toFixed(1)}s`:k==='mg'?'按住开火':k==='uav'&&uav?'飞行中':'就绪';}
 const cd=p.cd[selected],fb=$('fireButton');fb.classList.toggle('cooling',!pilot&&cd>0);fb.classList.toggle('firing',p.mg);fb.disabled=false;
 $('fireLabel').textContent=pilot?(pilot.kind==='sam'?'飞行中':'引爆'):selected==='mg'?'开火':cd>0?`${cd.toFixed(1)}s`:'发射';$('fireSub').textContent=pilot?(pilot.kind==='uav'?'贴近后自爆':'手动引爆'):selected==='sam'?'自动锁定':selected==='mg'?'按住持续射击':Math.abs(p.speed)>2?'停车后发射':'手动控制';
 $('dragHint').textContent=pilot?'拖动调整航向':selected==='sam'?'发射后自动追踪':'右侧拖动瞄准';
 const hints={uav:'手动侦察 · 接近热源确认位置',missile:'手动飞行 · 命中80伤害',artillery:'拖动调整炮口 · 绿色抛物线预览',sam:'自动锁定空中目标 · 装填25秒',mg:'手动瞄准空中目标 · 按住开火'};
 $('actionHint').textContent=pilot?'左摇杆控制飞行 · 可随时返回车辆':hints[selected];
 const count=$('countdown');count.classList.toggle('hidden',view.started);if(!view.started)count.innerHTML=`${Math.ceil(view.countdown)}<small>正在进入未知空域</small>`;
 if(view.log.length&&view.log[0].id!==lastLog){const log=view.log[0];lastLog=log.id;$('eventLine').querySelector('span').textContent=log.text;$('eventLine').className='event-line '+(['hit','danger'].includes(log.kind)?'danger':log.kind==='warning'?'warning':'');if(log.kind==='lock'){audio.play('lock');vibrate(25);}else if(log.kind==='defense')audio.play('defense');else if(log.kind==='hit-enemy')audio.play('hit');}
 if(p.hp<oldHp){damageUntil=performance.now()+450;audio.play('hit');vibrate(65);}oldHp=p.hp;if(view.over)result();
}
function guide(backToPause=false){showModal('guide',`<span class="eyebrow">FIELD MANUAL / 2km × 2km</span><h3>共享侦察，自动防空。</h3><ol class="guide-list"><li><b>2km × 2km 的3D战场。</b>左摇杆驾驶，拖动画面瞄准。平时是发射车第三人称追尾视角。停车后才能发射。</li><li><b>巡航导弹与无人机手动飞行。</b>发射后切换追尾视角，摇杆上推抬头、下推俯冲、左右转向，也可拖动调整航向。可随时返回车辆，再次接管无人机。</li><li><b>火炮显示真实抛物线。</b>手动调整方位与仰角，绿色线和落点预览实际弹道。炮弹不可转向或拦截；白色尾迹每段保留8秒。</li><li><b>三种单位统一300m侦察。</b>导弹车、巡航导弹和无人机进入敌人300米内即共享敌情。侦察按距离触发，不需要朝向或手动锁定。脱离所有我方侦察范围后，3D画面和全图小地图保留最后发现的位置5秒，然后同时消失。再次进入范围会刷新情报。</li><li><b>防空导弹自动锁定。</b>选择防空弹并发射，即自动锁定300米内的空中目标并追踪，优先巡航导弹；无需瞄准或操纵，也不会切换追尾视角。装填25秒。没有目标时不会消耗弹药，炮弹不能被拦截。</li><li><b>机枪仍需手动操作。</b>拖动瞄准空中目标，按住开火连续射击，无冷却。无人机耐久27、巡航导弹耐久18，每发机枪空中伤害9。</li><li><b>100 HP，限时3分钟。</b>导弹直击80、近炸45–60；火炮直击40、范围10–20；无人机贴近自爆30。没有诱饵。小地图覆盖全战场，绿色圆圈是共享侦察范围，橙色是已发现敌方。</li></ol><div class="hint-box">装填：无人机10秒 · 导弹22秒 · 火炮5秒 · 防空弹25秒<br>无人机续航40秒。双人模式须使用相同版本。<br>键盘：WASD 驾驶 / 飞行 · 1–5 切换装备 · 空格开火 · F 返回车辆</div><button id="guideClose" class="btn">准备行动</button>`,{guideClose:()=>{if(backToPause)showPause();else closeModal();}});}
function showPause(){if(screen!=='battle'||!view||view.over)return;stopFire();dispatch({type:'control',throttle:0,steer:0},true);resetInput();if(!netRole)paused=true;
 showModal('pause',`<span class="eyebrow">TACTICAL PAUSE</span><h3>作战菜单</h3><p>${netRole?'双人对局仍在继续，尽快返回战场。':'训练已暂停。'}</p><button id="resume" class="btn">继续交火</button><button id="pauseGuide" class="btn secondary">作战指南</button><button id="toggleSound" class="btn secondary">声音：${audio.enabled?'开启':'关闭'}</button><button id="quitRound" class="btn danger">${netRole?'离开双人对局':'结束训练'}</button>`,{resume:()=>{paused=false;audio.init();closeModal();lastFrame=performance.now();},pauseGuide:()=>guide(true),toggleSound:()=>{audio.enabled=!audio.enabled;try{localStorage.setItem('bf-sound',audio.enabled?'on':'off');}catch(_){}soundUI();showPause();},quitRound:returnMenu});
}
  function disconnect(notify) {
    const wasConnected = connected; connected = false; netRole = null; seq = 0; remoteSeq = 0;
    if (native) { try { native.leave(); } catch (_) {} }
    if (notify && wasConnected) interrupted('对方已断开连接，本局结束。');
  }
  function interrupted(message) {
    disconnect(false); engine = null; paused = false; resetInput();
    showModal('interrupted', `<span class="eyebrow">LINK LOST</span><h3>交火中断</h3><p>${escape(message)}</p><p>请重新创建或加入房间。</p><button id="interruptedBack" class="btn">返回主菜单</button>`, { interruptedBack:returnMenu });
  }
  function lanMenu() {
    showModal('lan', `<span class="eyebrow">LOCAL DUEL / A × B</span><h3>双人交火</h3><p>两台手机连接同一 Wi-Fi，或让其中一台开启热点，另一台连接。</p><button id="hostRoom" class="btn">创建房间 · 玩家 A</button><button id="joinRoom" class="btn secondary">加入房间 · 玩家 B</button><div class="hint-box">无需账号。创建房间后，把显示的地址与6位房间码告诉另一位玩家。</div><button id="lanBack" class="btn secondary">返回</button>`, { hostRoom:hostRoom, joinRoom:joinRoom, lanBack:closeModal });
  }
  function needNative() {
    if (native || isTest && window.Native) return true;
    showModal('native', '<span class="eyebrow">ANDROID EDITION</span><h3>安装 APK 后双人对战</h3><p>网页版可进行单人训练。双人房间由 Android 版在同一网络内建立。</p><button id="nativeBack" class="btn">返回</button>', { nativeBack:lanMenu }); return false;
  }
  function hostRoom() {
    if (!needNative()) return; disconnect(false); netRole = 'host';
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
        disconnect(false); netRole = 'guest'; $('hostIP').blur(); $('hostCode').blur();
        showModal('waiting', '<span class="eyebrow">CONNECTING / B</span><h3>正在连接房间</h3><p>请保持两台手机在同一网络。</p><button id="cancelJoin" class="btn secondary">取消</button>', {cancelJoin:()=>{ disconnect(false); joinRoom(); }});
        try { native.join(ip, code); } catch (_) { interrupted('连接失败，请核对地址与房间码。'); }
      }, joinBack:lanMenu
    });
  }
function validView(v){return v&&v.version===3&&v.own&&Number.isFinite(v.own.x)&&Number.isFinite(v.own.y)&&Number.isFinite(v.own.z)&&Number.isFinite(v.t)&&v.own.cd&&v.own.aim&&v.own.stats&&['shots','clues','effects','trails','log'].every(k=>Array.isArray(v[k])&&v[k].length<160);}
window.onNativeNetwork=function(event){
 if(!event||!event.type)return;
 if(event.type==='listening'&&netRole==='host'){
  const ips=(event.ips||[]).filter(a=>/^\d{1,3}(\.\d{1,3}){3}$/.test(a));showModal('waiting',`<span class="eyebrow">ROOM OPEN / PLAYER A</span><h3>等待玩家 B</h3><small class="room-note">房间码</small><div class="room-code">${escape(event.code)}</div><small class="room-note">连接地址（任选可达地址）</small>${ips.map(a=>`<div class="room-address">${escape(a)}</div>`).join('')||'<p class="connection-error">未找到地址，请连接 Wi-Fi 或开启热点后重试。</p>'}<div class="room-status">● 房间已开放</div><p>玩家 B 输入地址和房间码，连接后自动开始。双方须使用同一版本。</p><button id="cancelWaiting" class="btn secondary">取消房间</button>`,{cancelWaiting:()=>{disconnect(false);lanMenu();}});
 }else if(event.type==='connected'&&netRole&&event.role===netRole&&modalKind==='waiting'&&!connected){
  connected=true;lastPeerAt=performance.now();seq=remoteSeq=0;oldHp=100;lastLog=0;paused=false;audio.init();resetInput();renderer.cameraKey=null;selected='missile';
  if(netRole==='host'){engine=new Engine({mode:'lan'});view=engine.snapshot(0);$('modeLabel').textContent='双人交火 / 玩家 A';closeModal();setScreen('battle');select('missile');sendNet({type:'state',view:engine.snapshot(1)});}
 }else if(event.type==='data'&&connected){
  lastPeerAt=performance.now();let packet;try{if(typeof event.data!=='string'||event.data.length>65536)return;packet=JSON.parse(event.data);}catch(_){return;}
  if(netRole==='guest'&&packet.type==='state'&&validView(packet.view)){view=packet.view;if(screen!=='battle'){closeModal();$('modeLabel').textContent='双人交火 / 玩家 B';selected=view.own.selected;setScreen('battle');}}
  else if(netRole==='guest'&&packet.type==='feedback')toast(packet.message);
  else if(netRole==='host'&&packet.type==='command'&&engine){const now=performance.now();if(now-commandWindow>1000){commandWindow=now;commandCount=0;}if(!Number.isSafeInteger(packet.seq)||packet.seq<=remoteSeq||++commandCount>40)return;remoteSeq=packet.seq;const r=engine.command(1,packet.action);if(!r.ok)sendNet({type:'feedback',message:r.reason});}
 }else if(event.type==='closed'&&netRole){if(view&&view.over){connected=false;return;}interrupted(event.message||'连接已断开，请检查两台手机的 Wi-Fi。');}
 else if(event.type==='error'&&netRole)interrupted(event.message||'连接失败，请核对地址与房间码。');
};
document.querySelectorAll('.sound-button').forEach(b=>b.addEventListener('click',()=>{audio.enabled=!audio.enabled;try{localStorage.setItem('bf-sound',audio.enabled?'on':'off');}catch(_){}audio.init();soundUI();}));
document.querySelectorAll('[data-difficulty]').forEach(b=>b.addEventListener('click',()=>{difficulty=b.dataset.difficulty;try{localStorage.setItem('bf-difficulty',difficulty);}catch(_){}document.querySelectorAll('[data-difficulty]').forEach(c=>c.classList.toggle('chosen',c.dataset.difficulty===difficulty));audio.init();audio.play('click');}));
document.querySelectorAll('[data-difficulty]').forEach(b=>b.classList.toggle('chosen',b.dataset.difficulty===difficulty));
$('startAI').addEventListener('click',()=>startAI());$('openLAN').addEventListener('click',lanMenu);$('openGuide').addEventListener('click',()=>guide());$('pauseButton').addEventListener('click',showPause);
document.querySelectorAll('[data-weapon]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.weapon)));
$('returnVehicle').addEventListener('click',()=>{stopFire();resetInput();dispatch({type:'vehicle'});updateHUD();});
$('takeUAV').addEventListener('click',()=>{const u=view&&view.shots.find(s=>s.mine&&s.kind==='uav');if(u){resetInput();dispatch({type:'pilot',id:u.id});updateHUD();}});
$('fireButton').addEventListener('pointerdown',e=>{if(firePointer!==null||modalKind)return;e.preventDefault();firePointer=e.pointerId;try{$('fireButton').setPointerCapture(e.pointerId);}catch(_){}fire();});
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('fireButton').addEventListener(name,stopFire);
function moveStick(e){const r=$('joystick').getBoundingClientRect(),radius=r.width*.34,dx=e.clientX-r.x-r.width/2,dy=e.clientY-r.y-r.height/2,len=Math.hypot(dx,dy),scale=len>radius?radius/len:1;stick.x=dx*scale/radius;stick.y=dy*scale/radius;if(Math.abs(stick.x)<.08)stick.x=0;if(Math.abs(stick.y)<.08)stick.y=0;$('stickKnob').style.transform=`translate(${stick.x*radius}px,${stick.y*radius}px)`;}
$('joystick').addEventListener('pointerdown',e=>{if(modalKind||joystickPointer!==null)return;e.preventDefault();joystickPointer=e.pointerId;$('joystick').setPointerCapture(e.pointerId);moveStick(e);audio.init();});
$('joystick').addEventListener('pointermove',e=>{if(joystickPointer===e.pointerId)moveStick(e);});
function releaseStick(e){if(joystickPointer!==e.pointerId)return;joystickPointer=null;stick.x=stick.y=0;$('stickKnob').style.transform='';control();}
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('joystick').addEventListener(name,releaseStick);
$('world').addEventListener('pointerdown',e=>{if(screen!=='battle'||modalKind||!view||view.over||aimPointer!==null)return;e.preventDefault();aimPointer=e.pointerId;const a=currentPilot()||view.own.aim[selected];drag={x:e.clientX,y:e.clientY,yaw:a.yaw,pitch:a.pitch};$('world').setPointerCapture(e.pointerId);audio.init();});
$('world').addEventListener('pointermove',e=>{if(aimPointer!==e.pointerId||!drag)return;aimTarget={yaw:drag.yaw+(e.clientX-drag.x)*.006,pitch:drag.pitch-(e.clientY-drag.y)*.0045};});
function releaseAim(e){if(aimPointer!==e.pointerId)return;control();aimPointer=null;drag=null;}
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('world').addEventListener(name,releaseAim);
window.addEventListener('keydown',e=>{if(screen!=='battle'||modalKind||!view)return;const k=e.key.toLowerCase();if(['w','s','a','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){e.preventDefault();keys.add(k);}else if(k===' '&&!e.repeat){e.preventDefault();fire();}else if(/^[1-5]$/.test(k))select(['uav','missile','artillery','sam','mg'][Number(k)-1]);else if(k==='f'){$('returnVehicle').click();}else if(k==='escape')showPause();});
window.addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());if(e.key===' ')stopFire();});
window.showPause=showPause;
window.onNativeBack=function(){if(modalKind==='interrupted'){returnMenu();return;}if(modalKind==='pause'){paused=false;closeModal();return;}if(screen==='battle'){if(view&&view.over)returnMenu();else showPause();}else if(modalKind){if(['waiting','join','interrupted'].includes(modalKind)){disconnect(false);lanMenu();}else closeModal();}else if(native&&native.finishApp)native.finishApp();};
window.onNativePause=function(){stopFire();dispatch({type:'control',throttle:0,steer:0},true);resetInput();if(netRole){if(view&&view.over)disconnect(false);else interrupted('设备切至后台，双人连接已结束。');}else if(screen==='battle'&&engine&&view&&!view.over)showPause();if(audio.ctx)audio.ctx.suspend().catch(()=>{});};
window.onNativeResume=function(){lastFrame=performance.now();};
window.addEventListener('blur',()=>{stopFire();dispatch({type:'control',throttle:0,steer:0},true);resetInput();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)window.onNativePause();else window.onNativeResume();});
function frame(now){const elapsed=Math.min(.1,(now-lastFrame)/1000);lastFrame=now;
 if(screen==='battle'){
  if(view&&now-lastInput>50){lastInput=now;control();}
  if(engine&&(!paused||netRole)&&!engine.over){let left=elapsed;while(left>0){const dt=Math.min(left,1/60);engine.update(dt);left-=dt;}view=engine.snapshot(0);}
  if(netRole==='host'&&connected&&engine&&now-lastSend>66){lastSend=now;sendNet({type:'state',view:engine.snapshot(1)});}
  if(view)renderer.draw(view,now/1000,elapsed);if(now-lastHud>90){lastHud=now;updateHUD();}
  if(view&&view.own.mg&&now-lastMGSound>130){lastMGSound=now;audio.play('mg');}
 }else renderer.draw(null,now/1000,elapsed);
 if(toastUntil&&now>toastUntil){$('toast').classList.add('hidden');toastUntil=0;}$('damageFlash').classList.toggle('active',now<damageUntil);
 if(netRole==='guest'&&connected&&now-lastPeerAt>12000){disconnect(false);interrupted('对方长时间未响应，请重新连接。');}
 requestAnimationFrame(frame);
}
soundUI();requestAnimationFrame(frame);
if(isTest)window.GameDebug={start:startAI,get engine(){return engine;},get view(){return view;},get renderer(){return renderer;},get selected(){return selected;},get netRole(){return netRole;},dispatch,select,fire,stopFire,updateHUD,pause:showPause,returnMenu,control};
