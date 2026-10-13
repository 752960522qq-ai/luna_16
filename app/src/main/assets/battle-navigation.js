/* Reusable coarse ground routes; avoids stopping behind city blocks to fire at a bunker. */
(function(root){
 class BattleNavigation{
  constructor(B){this.B=B;this.cell=40;this.width=Math.ceil(B.W/this.cell);this.height=Math.ceil(B.H/this.cell);this.refresh();}
  point(id){return{x:(id%this.width+.5)*this.cell,z:(Math.floor(id/this.width)+.5)*this.cell};}
  refresh(){this.free=new Uint8Array(this.width*this.height);for(let id=0;id<this.free.length;id++){const p=this.point(id);this.free[id]=this.B.clearGround(p.x,p.z,8)?1:0;}this.version=(this.version||0)+1;}
  closest(p){let best=-1,distance=Infinity;for(let id=0;id<this.free.length;id++)if(this.free[id]){const q=this.point(id),d=(p.x-q.x)**2+(p.z-q.z)**2;if(d<distance){distance=d;best=id;}}return best;}
  route(start,end){const a=this.closest(start),b=this.closest(end);if(a<0||b<0)return[];const parent=new Int32Array(this.free.length).fill(-2),queue=new Int32Array(this.free.length);let read=0,write=1;queue[0]=a;parent[a]=-1;while(read<write&&parent[b]===-2){const id=queue[read++],x=id%this.width,z=Math.floor(id/this.width);for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,nz=z+dz;if(nx<0||nx>=this.width||nz<0||nz>=this.height)continue;const next=nz*this.width+nx;if(!this.free[next]||parent[next]!==-2)continue;parent[next]=id;queue[write++]=next;}}if(parent[b]===-2)return[];const path=[];for(let id=b;id!==-1;id=parent[id])path.push(this.point(id));return path.reverse();}
 }
 if(typeof module!=='undefined'&&module.exports)module.exports=BattleNavigation;root.BlindfireNavigation=BattleNavigation;
})(typeof window!=='undefined'?window:globalThis);
