import { TAP_CONFIG } from './tap-config.js';
export class RewardedVideo {
  constructor(config=TAP_CONFIG,host=()=>globalThis.tap){this.config=config;this.host=host;this.ad=null;this.active=null;}
  init(){
    if(this.ad)return;
    const tap=this.host();
    if(!tap?.createRewardedVideoAd)throw Error('请在TapTap客户端内观看视频');
    if(!this.config.rewardedAdUnitId)throw Error('视频活动暂未开放，请稍后再试');
    this.ad=tap.createRewardedVideoAd({adUnitId:this.config.rewardedAdUnitId});
    this.ad.onClose(res=>this.finish(res?.isEnded===true?null:Error('未完整观看视频，未领取奖励')));
    this.ad.onError(()=>this.finish(Error('广告暂不可用，请稍后再试')));
  }
  finish(error){const active=this.active;if(!active)return;this.active=null;error?active.reject(error):active.resolve(true);}
  async watch(){
    if(this.active)throw Error('视频正在播放，请勿重复点击');
    this.init();
    return new Promise((resolve,reject)=>{
      const ticket={resolve,reject};this.active=ticket;
      Promise.resolve().then(()=>this.ad.show()).catch(()=>{
        if(this.active!==ticket)return;
        return this.ad.load().then(()=>{if(this.active===ticket)return this.ad.show();});
      }).catch(()=>{if(this.active===ticket)this.finish(Error('广告加载失败，请稍后再试'));});
    });
  }
}
export const rewardedVideo=new RewardedVideo();
