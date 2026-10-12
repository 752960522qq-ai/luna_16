const assert=require('node:assert/strict'),fs=require('node:fs'),{open}=require('./browser-helpers.cjs');
(async()=>{const{browser,server,url}=await open(),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/WebGL|shader|texture/i.test(m.text()))errors.push(m.text());});
try{
 await page.goto(url);await page.waitForFunction(()=>window.GameDebug?.renderer.modelsReady,null,{timeout:60000});
 const report=await page.evaluate(async()=>{
  const T=await import('./three.module.js'),{EXPLOSION_SEQUENCES:specs}=await import('./effects/sequences.js'),r=GameDebug.renderer,B=Blindfire;
  await r.explosionsPromise;if(r.explosionError)throw Error(r.explosionError);
  const canvas=document.createElement('canvas'),gl=new T.WebGLRenderer({canvas,antialias:false,preserveDrawingBuffer:true});gl.setSize(384,384);gl.outputColorSpace=T.SRGBColorSpace;
  const scene=new T.Scene();scene.background=new T.Color('#70937e');const camera=new T.PerspectiveCamera(45,1,.1,1000);camera.position.set(0,0,60);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const images=[],results=[];for(const[size,spec]of Object.entries(specs)){
   const e={x:0,y:0,z:0,kind:'explosion',visualSize:size,grounded:false,age:0,life:spec.duration},a=r.explosions.create(e),b=r.explosions.create(e);scene.add(a);
   const image=a.material.map.image;if(image.width!==1568||image.height!==1176)throw Error('Atlas dimensions invalid');
   const frames=[];for(const progress of [.15,.45,.85]){
    r.explosions.update(a,{...e,age:spec.duration*progress});a.quaternion.copy(camera.quaternion);gl.render(scene,camera);
    const copy=document.createElement('canvas');copy.width=copy.height=384;const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);
    // Large fireball black corners must contribute no darkening. Alpha sprites
    // likewise leave the transparent corners as the scene background.
    const center=Array.from(ctx.getImageData(192,192,1,1).data),corner=Array.from(ctx.getImageData(8,8,1,1).data);
    if(corner.slice(0,3).some((v,i)=>Math.abs(v-[112,147,126][i])>2))throw Error('Opaque/background rectangle: '+size);
    if(center.slice(0,3).every((v,i)=>Math.abs(v-corner[i])<2)&&progress<.5)throw Error('Explosion invisible: '+size);
    frames.push(a.userData.explosion.frame);images.push({name:size+'-'+progress+'.png',image:copy.toDataURL()});
   }
   if(b.userData.explosion.frame!==0||a.material.map!==b.material.map)throw Error('Shared atlas instances interfered');
   results.push({size,frames,blend:spec.additive?'additive':'alpha',texture:[image.width,image.height]});scene.remove(a);a.geometry.dispose();a.material.dispose();b.geometry.dispose();b.material.dispose();
  }
  gl.dispose();
  // Exercise the actual gameplay renderer, including camera-facing planes and cleanup.
  const engine=new B.Engine({mode:'lan',mapId:'city',countdown:0,vehicles:['cougar_artillery']});const p=engine.players[0];
  Object.assign(p,{x:1000,z:1500,y:B.terrain(1000,1500),yaw:0});for(const a of Object.values(p.aim)){a.yaw=0;a.pitch=0;}
  for(const[size,i]of Object.keys(specs).map((s,i)=>[s,i]))engine.effect({x:p.x+(i-1)*12,y:p.y,z:p.z-28},'explosion',0,24,size);
  engine.t=.4;r.draw(engine.snapshot(0),engine.t);
  for(const e of engine.effects){const node=r.effectMeshes.get(e.id);if(!node?.userData.explosion||Math.abs(node.quaternion.dot(r.camera.quaternion))<.9999)throw Error('Gameplay billboard missing/oriented incorrectly');}
  engine.effects=[];r.draw(engine.snapshot(0),.5);if([...r.effectMeshes.values()].some(g=>g.userData.explosion))throw Error('Expired blast not removed');
  return{results,images,textures:r.explosions.textures.size};
 });
 assert.deepEqual(errors,[]);assert.equal(report.textures,3);fs.mkdirSync('test-output/explosions',{recursive:true});for(const x of report.images)fs.writeFileSync('test-output/explosions/'+x.name,Buffer.from(x.image.split(',')[1],'base64'));fs.writeFileSync('test-output/explosions/report.json',JSON.stringify(report.results,null,2));
 console.log('PASS actual WebGL small/medium/large frames, no black rectangles, independent instances, shared textures, gameplay camera billboards and expired-effect disposal',JSON.stringify(report.results));
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
