// Use the production shader in WebGL2 transform feedback, then render textured models.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {open}=require('./browser-helpers.cjs');
(async()=>{
 const {browser,server,url}=await open(),page=await browser.newPage({viewport:{width:1100,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|shader|GL_INVALID/.test(m.text()))errors.push(m.text());});
 try{
  await page.goto(url);await page.waitForFunction(()=>window.GameDebug?.renderer.modelsReady,null,{timeout:60000});
  const result=await page.evaluate(async()=>{
   const T=await import('./three.module.js'),r=GameDebug.renderer,B=window.Blindfire,canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2'),reports=[],images=[];
   if(!gl)throw Error('WebGL2 unavailable');
   function compile(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
   for(const id of ['kfz_artillery','b_tank','cougar_artillery']){
    const asset=r.vehicleModels[0][id];
    for(const belt of asset.tracks.belts){
     if(belt.uvSlope){const p=belt.mesh.geometry.attributes.position,version=p.version;for(let step=-24;step<=24;step++){const travel=step*.4;r.updateTruck({position:new T.Vector3(),rotation:new T.Euler(),userData:{...asset,vehicleId:id}},{...new B.Engine({mode:'lan',vehicles:[id]}).players[0],trackTravel:{left:travel,right:travel}},'autocannon',0);if(belt.uniform.value!==(id==='cougar_artillery'?travel:-travel)||p.version!==version)throw Error('Continuous grey track travel or silhouette changed');}reports.push({id,side:belt.side,vertices:p.count,phases:49,maxEnvelopeEscape:0,animation:'shader UV travel; authored geometry fixed'});continue;}
     const shader={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader};belt.mesh.material.onBeforeCompile(shader);
     const prefix=shader.vertexShader.slice(0,shader.vertexShader.indexOf('#define STANDARD')).replace('attribute vec4 treadPhase','in vec4 treadPhase');
     const normals=shader.vertexShader.split('#include <beginnormal_vertex>')[1].split('#include')[0],positions=shader.vertexShader.split('#include <begin_vertex>')[1].split('#include')[0];
     const vertex='#version 300 es\nprecision highp float;\n'+prefix+'\nin vec3 position;out vec3 measured;void main(){vec3 objectNormal=vec3(0.);'+normals+'vec3 transformed=position;'+positions+'measured=transformed;gl_Position=vec4(0.);}';
     const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;out vec4 color;void main(){color=vec4(1.);}'));gl.transformFeedbackVaryings(program,['measured'],gl.INTERLEAVED_ATTRIBS);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
     const vao=gl.createVertexArray();gl.bindVertexArray(vao);const geo=belt.mesh.geometry,p=geo.attributes.position;
     for(const name of ['position','treadPhase']){const a=geo.attributes[name],buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,a.array,gl.STATIC_DRAW);const location=gl.getAttribLocation(program,name);if(location>=0){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,a.itemSize,gl.FLOAT,false,0,0);}}
     const output=gl.createBuffer(),data=new Float32Array(p.count*3);gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER,output);gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER,data.byteLength,gl.STREAM_READ);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,output);
     const vals=prefix.match(/float L=([^,]+),r=([^,]+),cy=([^,]+),z0=([^,]+),z1=([^;]+);/).slice(1).map(Number),per=2*vals[0]+2*Math.PI*vals[1],bounds=belt.contactBounds;let worst=0;
     for(let step=-24;step<=24;step++){
      const travel=step*per/24;gl.uniform1f(gl.getUniformLocation(program,'treadTravel'),travel);gl.enable(gl.RASTERIZER_DISCARD);gl.beginTransformFeedback(gl.POINTS);gl.drawArrays(gl.POINTS,0,p.count);gl.endTransformFeedback();gl.disable(gl.RASTERIZER_DISCARD);gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER,0,data);
      let low=Infinity;for(let i=0;i<p.count;i++){const x=data[i*3],y=data[i*3+1],z=data[i*3+2];if(!Number.isFinite(x+y+z)||Math.abs(x-p.getX(i))>1e-5)throw Error(id+': invalid tread vertex');low=Math.min(low,y);const escape=Math.max(bounds.min.y-y,y-bounds.max.y,bounds.min.z-z,z-bounds.max.z);worst=Math.max(worst,escape);if(escape>.065)throw Error(id+': tread escapes wheel envelope by '+escape+'m');if(step===0&&Math.hypot(x-p.getX(i),y-p.getY(i),z-p.getZ(i))>1e-5)throw Error(id+': changed original rest geometry');}
      if(belt.supportAt(travel)>low+2e-5)throw Error(id+': support plane misses animated tread vertices');if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL transform feedback failed');
     }
     reports.push({id,side:belt.side,vertices:p.count,phases:49,maxEnvelopeEscape:worst});gl.deleteProgram(program);gl.deleteVertexArray(vao);gl.deleteBuffer(output);
    }
    const copy=r.cloneVehicle(asset),group=new T.Group();group.add(copy.node);group.userData={...copy,vehicleId:id};const scene=new T.Scene();scene.background=new T.Color('#c4cdc8');scene.add(group,new T.HemisphereLight('#e5f1ff','#655c42',2.1));const sun=new T.DirectionalLight('#fff0d2',2.3);sun.position.set(-12,30,18);scene.add(sun);
    const ground=new T.Mesh(new T.PlaneGeometry(100,100),new T.MeshLambertMaterial({color:'#9d9b84'}));ground.rotation.x=-Math.PI/2;scene.add(ground);
    const renderCanvas=document.createElement('canvas'),renderer=new T.WebGLRenderer({canvas:renderCanvas,antialias:true,preserveDrawingBuffer:true});renderer.setSize(1100,720);renderer.outputColorSpace=T.SRGBColorSpace;const camera=new T.PerspectiveCamera(38,1100/720,.1,250);
    const engine=new B.Engine({mode:'lan',mapId:'city',countdown:0,vehicles:[id]}),p=engine.players[0];Object.assign(p,{x:1000,z:1500,y:B.terrain(1000,1500),yaw:0});for(const a of Object.values(p.aim)){a.yaw=0;a.pitch=0;}r.landscapeMap='city';ground.position.set(p.x,p.y,p.z);
    for(const [pose,left,right] of [['rest',0,0],['forward',1.7,1.7],['reverse',-2.6,-2.6],['turn_left',-1.3,1.3],['turn_right',2.8,-2.8]]){p.trackTravel={left,right};p.wheelTravel=(left+right)/2;r.updateTruck(group,p,p.selected,0);camera.position.set(p.x+7.7,p.y+3.1,p.z+5.2);camera.lookAt(p.x,p.y+1.0,p.z);renderer.render(scene,camera);images.push({name:id+'_'+pose+'.png',image:renderCanvas.toDataURL('image/png')});}
    if(id==='b_tank'){for(const [pose,yaw,pitch]of [['turret_up',.75,B.VEHICLES[id].maxPitch],['turret_down',-.75,B.VEHICLES[id].minPitch]]){p.aim.autocannon={yaw,pitch};p.trackTravel={left:0,right:0};r.updateTruck(group,p,'autocannon',0);renderer.render(scene,camera);images.push({name:id+'_'+pose+'.png',image:renderCanvas.toDataURL('image/png')});}}
    if(id==='cougar_artillery'){
     for(const [pose,yaw,pitch,deployed]of [['turret_up',Math.PI/6,B.VEHICLES[id].maxPitch,true],['turret_down',-Math.PI/6,B.VEHICLES[id].minPitch,false]]){
      p.aim.artillery={yaw,pitch};p.spadeDeployed=deployed;p.trackTravel={left:0,right:0};for(let step=1;step<=30;step++)r.updateTruck(group,p,'artillery',(deployed?0:3)+step*.05);
      if(Math.abs(group.userData.spade.rotation.x-(deployed?group.userData.spadeAngle:0))>.002)throw Error('M53 spade animation failed to settle');
      renderer.render(scene,camera);images.push({name:id+'_'+pose+'.png',image:renderCanvas.toDataURL('image/png')});
     }
    }
    renderer.dispose();
   }
   return {reports,images};
  });
  assert.deepEqual(errors,[]);const output=process.env.TEST_OUTPUT||'test-output/treads';fs.mkdirSync(output,{recursive:true});for(const x of result.images)fs.writeFileSync(path.join(output,x.name),Buffer.from(x.image.split(',')[1],'base64'));fs.writeFileSync(path.join(output,'gpu-report.json'),JSON.stringify(result.reports,null,2));console.log('PASS actual GPU vertices: original rest pose, 49 forward/reverse phases, bounded tread envelope and contact support',JSON.stringify(result.reports));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
