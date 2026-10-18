import * as T from './three.module.js';
export function cityMaterials(){
 const result=[];let seed=9017;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(const kind of ['brick','plaster','panel']){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const c=canvas.getContext('2d');c.fillStyle=kind==='brick'?'#9b9890':kind==='plaster'?'#bdbcb4':'#858e90';c.fillRect(0,0,512,512);
  if(kind==='brick')for(let row=0;row<16;row++)for(let col=-1;col<8;col++){const v=104+random()*40;c.fillStyle=`rgb(${v+20},${v+9},${v})`;c.fillRect(col*80+(row%2)*40+2,row*32+2,76,28);}
  else if(kind==='plaster'){for(let i=0;i<5000;i++){const v=155+random()*55;c.fillStyle=`rgba(${v},${v},${v-5},.2)`;c.fillRect(random()*512,random()*512,2+random()*10,1+random()*5);}c.strokeStyle='#999b95';for(let i=0;i<9;i++){c.beginPath();let x=random()*512,y=random()*512;c.moveTo(x,y);for(let k=0;k<6;k++){x+=(random()-.5)*15;y+=5+random()*10;c.lineTo(x,y);}c.stroke();}}
  else{c.strokeStyle='#5d686b';c.lineWidth=4;for(let p=0;p<=512;p+=128){c.beginPath();c.moveTo(p,0);c.lineTo(p,512);c.moveTo(0,p);c.lineTo(512,p);c.stroke();}}
  const map=new T.CanvasTexture(canvas);map.wrapS=map.wrapT=T.RepeatWrapping;map.colorSpace=T.SRGBColorSpace;const m=new T.MeshLambertMaterial({map,color:'#bdbdb8'});m.userData.ownedMap=true;m.name='city-'+kind;result.push(m);
 }
 return result;
}
