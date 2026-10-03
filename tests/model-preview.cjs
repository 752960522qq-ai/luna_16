const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const{open}=require('./browser-helpers.cjs');
(async()=>{
 const{browser,server,url}=await open(),page=await browser.newPage({viewport:{width:1100,height:650}});
 try{
  await page.goto(url);await page.waitForFunction(()=>window.GameDebug&&GameDebug.renderer.modelsReady);
  const data=await page.evaluate(async()=>{
   const T=await import('./three.module.js'),r=GameDebug.renderer,scene=new T.Scene();scene.background=new T.Color('#c4cdc8');
   scene.add(new T.HemisphereLight('#e5f1ff','#655c42',2.1));const sun=new T.DirectionalLight('#fff0d2',2.3);sun.position.set(-12,30,18);scene.add(sun);
   const sizes=[];for(const[g,x]of[[r.ownTruck,-10],[r.enemyTruck,10]]){const clone=g.children[0].clone(true);clone.position.set(x,0,0);clone.rotation.y+=.3;scene.add(clone);const size=new T.Box3().setFromObject(clone).getSize(new T.Vector3());sizes.push({x:size.x,y:size.y,z:size.z,patches:g.userData.patches});}
   const ground=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshLambertMaterial({color:'#9d9b84'}));ground.rotation.x=-Math.PI/2;ground.position.y=-.02;scene.add(ground);
   const camera=new T.PerspectiveCamera(40,1100/600,.1,250);camera.position.set(24,13,-35);camera.lookAt(0,3,0);
   const canvas=document.createElement('canvas'),gl=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});gl.setSize(1100,600);gl.outputColorSpace=T.SRGBColorSpace;gl.render(scene,camera);
   return{sizes,image:canvas.toDataURL('image/png')};
  });
  for(const s of data.sizes){assert.equal(s.patches,2);assert.ok(s.y>0&&s.y<15);assert.ok(s.z>12&&s.z<18);}
  const output=process.env.TEST_OUTPUT||'test-output';fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'blindfire-v0.4-vehicles.png'),Buffer.from(data.image.split(',')[1],'base64'));
  console.log('PASS both GLB models loaded, grounded and scaled; preview saved',JSON.stringify(data.sizes));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
