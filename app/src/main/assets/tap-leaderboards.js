import {TAP_CONFIG} from './tap-config.js';

export class TapLeaderboards {
  constructor({host=()=>globalThis.tap,config=TAP_CONFIG,timeout=12000}={}){this.host=host;this.config=config;this.timeout=timeout;}
  available(){return typeof this.host()?.getLeaderboardManager==='function';}
  call(method,data){
    return new Promise((resolve,reject)=>{
      const manager=this.host()?.getLeaderboardManager?.();
      if(!manager?.[method]){reject(Error('请在新版 TapTap 客户端内使用联网排行榜'));return;}
      const timer=setTimeout(()=>reject(Error('排行榜请求超时，请重试')),this.timeout);
      const done=(fn,value)=>{clearTimeout(timer);fn(value);};
      try{manager[method]({...data,callback:{onSuccess:r=>done(resolve,r),onFailure:(code,message)=>done(reject,Error(message||'排行榜服务暂不可用（'+code+'）'))}});}catch(e){done(reject,e);}
    });
  }
  id(mode){const id=this.config.leaderboards?.[mode];if(!id)throw Error('此模式尚未配置排行榜');return id;}
  async current(mode){const r=await this.call('loadCurrentPlayerLeaderboardScore',{leaderboardId:this.id(mode),collection:'public'});return Math.max(0,Math.trunc(Number(r?.currentUserScore?.score)||0));}
  async submit(mode,points){
    if(!Number.isSafeInteger(points)||points<0||points>2000000000)throw Error('无效的排位积分');
    return this.call('submitScores',{scores:[{leaderboardId:this.id(mode),score:points}]});
  }
  async load(mode){
    const r=await this.call('loadLeaderboardScores',{leaderboardId:this.id(mode),maxSize:100,collection:'public'});
    return {local:false,source:'tap',rows:(r?.scores||[]).map(s=>({rank:s.rank,name:s.user?.name||'指挥官',points:s.score||0}))};
  }
}
export const tapLeaderboards=new TapLeaderboards();
