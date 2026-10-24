import {TAP_CONFIG} from './tap-config.js';
const {CATALOG}=globalThis.BlindfireHonors;
export function bindHonors(profile){
 const open=document.createElement('button');open.id='openHonors';open.innerHTML='<svg aria-hidden="true"><use href="#i-honor"/></svg><span>成就</span>';document.getElementById('openActivities').after(open);
 const panel=document.createElement('div');panel.className='honors-modal hidden';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','战场荣誉');panel.setAttribute('aria-modal','true');
 panel.innerHTML='<section class="honors-card"><header><h2>战场荣誉 <small id="honorCount"></small></h2><button id="closeHonors" class="btn">返回</button></header><p>全部成就同时累计进度，可在同一场对局达成多项。仅计入有操作的前台正式对局，暂停、观战、菜单及连续30秒无操作不计时。</p><p id="honorStatus" aria-live="polite"></p><div class="honor-tools"><button id="syncHonors" class="btn secondary">同步Tap成就</button><button id="showTapHonors" class="btn secondary">打开Tap成就</button></div><div id="honorList"></div></section>';
 document.body.append(panel);const $=id=>panel.querySelector('#'+id);let message='',manager=null,pending=null,timer=null;
 const render=()=>{
  const s=profile.honors;$('honorCount').textContent=s.unlocked.length+'/'+CATALOG.length;$('honorStatus').textContent=message||(!TAP_CONFIG.achievementsPublished?'Tap成就配置中，本机进度正常保留。':s.queue.length?'待同步TapTap '+s.queue.filter(id=>TAP_CONFIG.achievementIds.includes(id)).length+' 项；新增待配置 '+s.queue.filter(id=>!TAP_CONFIG.achievementIds.includes(id)).length+' 项。':'进度已保存在本机；新增10项成就等待平台配置。');
  const list=$('honorList');list.replaceChildren();
  CATALOG.forEach((a,i)=>{const done=s.unlocked.includes(a.id),active=!done&&a.metric!=='honors',row=document.createElement('article');row.className='honor-row'+(done?' done':'')+(active?' current':'');
   const icon=document.createElement('img');icon.src=a.icon;icon.alt='';icon.loading='lazy';const body=document.createElement('div'),title=document.createElement('b'),desc=document.createElement('p'),progress=document.createElement('small');title.textContent=a.name+' · '+(a.metric==='honors'?'白金／噩梦':a.tier);desc.textContent=a.description;
   progress.textContent=done?'已达成':a.metric==='honors'?'完成其余27项成就':active?`累计：${Math.floor(s.seconds/60)} / ${a.minutes}分钟；${a.goal}：${Math.min(a.target,Math.floor(s.counters[a.metric]))} / ${a.target}`:'累计完成条件即可解锁';
   body.append(title,desc,progress);row.append(icon,body);list.append(row);
  });
 };
 function ensureManager(){if(manager)return manager;if(!globalThis.tap?.createAchievementManager)throw Error('请在TapTap客户端内同步成就');manager=globalThis.tap.createAchievementManager({toastEnable:true});manager.registerListener({
  onAchievementSuccess:(code,a)=>{if(!pending||a?.achievementId!==pending)return;clearTimeout(timer);const id=pending;pending=null;const before=profile.honors.queue;profile.honors.queue=before.filter(x=>x!==id);if(!profile.save()){profile.honors.queue=before;message='同步记录保存失败，请重试';}else{message='';sync();}if(!panel.classList.contains('hidden'))render();},
  onAchievementFailure:(id,code,msg)=>{if(id&&pending&&id!==pending)return;clearTimeout(timer);pending=null;message='Tap同步失败，进度已保留，可稍后重试';if(!panel.classList.contains('hidden'))render();}
 });return manager;}
 function sync(){if(pending||!profile.honors.queue.length||!TAP_CONFIG.achievementsPublished)return;const syncId=profile.honors.queue.find(id=>TAP_CONFIG.achievementIds.includes(id));if(!syncId)return;try{const m=ensureManager();pending=syncId;timer=setTimeout(()=>{pending=null;message='同步超时，请稍后重试';if(!panel.classList.contains('hidden'))render();},15000);m.unlockAchievement({achievementId:pending});}catch(e){clearTimeout(timer);pending=null;message=e.message;}}
 const refresh=()=>{sync();if(!panel.classList.contains('hidden'))render();};
 open.onclick=()=>{panel.classList.remove('hidden');refresh();$('closeHonors').focus();};$('closeHonors').onclick=()=>{panel.classList.add('hidden');open.focus();};$('syncHonors').onclick=()=>{message='';sync();render();};$('showTapHonors').onclick=()=>{try{if(!TAP_CONFIG.achievementsPublished)throw Error('Tap成就配置中');ensureManager().showAchievements();}catch(e){message=e.message;render();}};
 window.addEventListener('focus',refresh);return {refresh};
}
