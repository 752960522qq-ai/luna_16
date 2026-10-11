// H5 keeps the original storage origin and adapts to browser chrome changes.
export function setupH5Viewport(onResize,onLandscape){
 document.body.classList.add('h5-portrait');
 const hint=document.createElement('div');hint.id='portraitHint';hint.setAttribute('role','status');hint.innerHTML='<b>请竖屏游玩</b><span>将设备转回竖屏即可继续</span>';document.body.append(hint);
 let landscape=false;
 const update=()=>{const v=window.visualViewport,w=v?.width||innerWidth,h=v?.height||innerHeight;document.documentElement.style.setProperty('--h5-height',`${Math.round(h)}px`);const next=w>h;document.body.classList.toggle('h5-landscape',next);if(next!==landscape){landscape=next;onLandscape(next);}onResize();};
 window.addEventListener('resize',update);window.visualViewport?.addEventListener('resize',update);screen.orientation?.addEventListener('change',update);
 document.addEventListener('pointerup',()=>{try{screen.orientation?.lock?.('portrait').catch(()=>{});}catch(_){}},{passive:true});
 update();
}
