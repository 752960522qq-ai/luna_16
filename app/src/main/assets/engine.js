/* Blindfire 0.7 — deterministic, host-authoritative 3D simulation. */
(function (root) {
  'use strict';
  const Crew=typeof module!=='undefined'&&module.exports?require('./crew.js'):root.BlindfireCrew,Motion=typeof module!=='undefined'&&module.exports?require('./vehicle-motion.js'):root.BlindfireMotion,Recon=typeof module!=='undefined'&&module.exports?require('./reconnaissance.js'):root.BlindfireRecon;
  const vehicleDefinition=spec=>Object.freeze({...spec,...Motion.CONFIG[spec.id],crewRoles:Object.freeze([...Crew.CONFIG[spec.id]])});
  const W = 2000, H = 2000, RECON_RANGE = 300, INTEL_LIFE = 5, TAU = Math.PI * 2, GRAVITY = 34, ARTILLERY_RANGE = 1200, SHELL_SPEED = Math.sqrt(GRAVITY * ARTILLERY_RANGE), TRAIL_LIFE = 8, ORBIT_RADIUS = 50;
  const RECON_RANGES = Object.freeze({vehicle:300,uav:400,missile:200,reconPlane:500,bomber:250});
  const reconRange = kind => RECON_RANGES[kind] || RECON_RANGES.vehicle;
  const ARTILLERY = {
    curve: { speed: SHELL_SPEED, minPitch: Math.PI/4, maxPitch: 68*Math.PI/180, defaultPitch: 1.05 },
    direct: { speed: SHELL_SPEED, minPitch: -3*Math.PI/180, maxPitch: Math.PI/4, defaultPitch: .08 }
  };
  const flatRange=(v,pitch,spec,gravity=GRAVITY)=>{const l=spec.muzzleLength||6.2,h=(spec.muzzleHeight||2.7)+l*Math.sin(pitch),vy=v*Math.sin(pitch),t=(vy+Math.sqrt(vy*vy+2*gravity*h))/gravity;return l*Math.cos(pitch)+v*Math.cos(pitch)*t;};
  const artilleryParams = p => {const spec=vehicleSpec(p.vehicleId),range=weaponSpec(p,'artillery').range,l=spec.muzzleLength||6.2,h=(spec.muzzleHeight||2.7)+l*Math.SQRT1_2,r=range-l*Math.SQRT1_2,speed=spec.artillery?.speed??Math.sqrt(GRAVITY*r*r/(h+r));return {speed,gravity:spec.artillery?.gravity??GRAVITY,minPitch:spec.minPitch??-3*Math.PI/180,maxPitch:spec.maxPitch??68*Math.PI/180,defaultPitch:.6};};
  const artilleryRanges=p=>{const q=artilleryParams(p),v=vehicleSpec(p.vehicleId);return {min:Math.ceil(flatRange(q.speed,q.minPitch,v,q.gravity)),minCurve:Math.ceil(flatRange(q.speed,q.maxPitch,v,q.gravity)),max:weaponSpec(p,'artillery').range,minDirect:Math.ceil(flatRange(q.speed,q.minPitch,v,q.gravity))};};
  // Try the high arc first, then the low arc, using the actual muzzle position.
  function solveArtillery(p,target){const q=artilleryParams(p),spec=vehicleSpec(p.vehicleId),range=dist(p,target),l=spec.muzzleLength||6.2,h=spec.muzzleHeight||2.7;
    if(range<1||range>weaponSpec(p,'artillery').range+.01)return null;
    for(const sign of [1,-1]){let pitch=sign===1?1.05:.08,valid=true;
      for(let i=0;i<20;i++){const r=Math.max(.01,range-l*Math.cos(pitch)),height=terrain(target.x,target.z)-(p.y+h+l*Math.sin(pitch)),v2=q.speed*q.speed,disc=v2*v2-q.gravity*(q.gravity*r*r+2*height*v2);if(disc<0){valid=false;break;}pitch=Math.atan((v2+sign*Math.sqrt(disc))/(q.gravity*r));}
      if(valid&&pitch>=q.minPitch&&pitch<=q.maxPitch)return {yaw:Math.atan2(target.x-p.x,p.z-target.z),pitch};
    }return null;
  }
  const WEAPONS = Object.freeze(Object.fromEntries(Object.entries({
    uav: { name:'无人机', cooldown:10, speed:58, hp:27, life:40, recon:400, directDamage:30, blastRadius:15 },
    missile: { name:'巡航导弹', cooldown:22, speed:155, hp:18, life:14, recon:200, directDamage:80, directRadius:10, nearDamage:[45,60], blastRadius:34 },
    artillery: { name:'152mm火炮', cooldown:5, speed:SHELL_SPEED, directSpeed:310, range:ARTILLERY_RANGE, directDamage:95, directRadius:0, nearDamage:[0,95], blastRadius:20, life:null },
    reconPlane:{name:'空中侦查',cooldown:30,speed:100,hp:35,life:30,recon:500},
    bomber:{name:'空中支援',cooldown:60,speed:78,hp:45,life:30,recon:250},
    bomb:{name:'航空炸弹',cooldown:0,speed:0,hp:1,life:40,directDamage:90,directRadius:0,nearDamage:[0,90],blastRadius:30},
    autocannon:{name:'20mm机炮',cooldown:.4,speed:720,hp:1,life:1,range:500,directDamage:17,airDamage:17,magazine:10,reload:5,fireInterval:.4},
    tankCannon:{name:'122mm火炮',cooldown:10,speed:720,hp:1,life:3,range:1500,directDamage:90,blastRadius:5},
    highExplosive:{name:'高爆弹',cooldown:30,speed:0,blastRadius:15,directDamage:95,life:null},
    spade:{name:'液压驻锄',cooldown:0,speed:0,life:null},
    repair:{name:'紧急维修',cooldown:0,speed:0,duration:15,life:null},
    observation:{name:'车长观察',cooldown:15,speed:0,recon:500,duration:8,sector:90,life:null},
    sam: { name:'防空导弹', cooldown:25, speed:225, hp:1, life:8, lockRange:300, airDamage:100 },
    mg: { name:'高射机枪', cooldown:0, speed:720, life:.55, fireInterval:.09, airDamage:9, groundDamage:1 }
  }).map(([id,spec])=>[id,Object.freeze({...spec,...(spec.nearDamage?{nearDamage:Object.freeze(spec.nearDamage)}:{})})])));
  const DEFAULT_VEHICLE = 'handlv_missile';
  function copyAim(aim){const result={};for(const key of Object.keys(aim))result[key]={yaw:aim[key].yaw,pitch:aim[key].pitch};return result;}
  const VEHICLES = Object.freeze({
    handlv_missile:vehicleDefinition({id:DEFAULT_VEHICLE,tier:1,branch:'missile',researchCost:0,name:'悍驴导弹车',hp:100,speed:113/3.6,reverseSpeed:10/3.6,recon:300,intelLife:5,dimensions:Object.freeze({length:4.84,width:2.557,height:2.48}),muzzleHeight:1.65,muzzleLength:1.8,
      weapons:Object.freeze(['uav','missile','sam','mg']),price:0,model:'m1097',description:'初始导弹车，兼顾空中侦察、精确打击与近程防空。'}),
    longnose_artillery:vehicleDefinition({id:'longnose_artillery',tier:4,branch:'artillery',researchCost:2500,minPitch:-3*Math.PI/180,maxPitch:68*Math.PI/180,name:'长鼻熊自行火炮',hp:300,speed:60/3.6,reverseSpeed:4/3.6,recon:250,intelLife:8,dimensions:Object.freeze({length:11.91,width:3.716,height:3.343}),muzzleHeight:2.7,muzzleLength:6.2,price:5000,artillery:Object.freeze({range:1300,directDamage:260,nearDamage:[0,260]}),weaponOverrides:Object.freeze({uav:{hp:60,directDamage:80},mg:{airDamage:18,groundDamage:12}}),weapons:Object.freeze(['artillery','uav','mg']),model:'2s19',description:'152mm火炮搭配地图落点瞄准、无人机侦察与近程机枪防御。'}),
    kfz_artillery:vehicleDefinition({id:'kfz_artillery',tier:1,branch:'artillery',researchCost:0,minPitch:-3*Math.PI/180,maxPitch:72*Math.PI/180,name:'跳虫KFZ自行火炮',hp:100,speed:42/3.6,reverseSpeed:10/3.6,recon:230,intelLife:8,dimensions:Object.freeze({length:4.84,width:2.16,height:2.40}),muzzleHeight:1.85,muzzleLength:2.3,price:300,weapons:Object.freeze(['artillery','reconPlane','bomber']),model:'kfz_grille',hullAim:true,artillery:Object.freeze({name:'跳虫火炮',cooldown:6.5,range:900,directDamage:80,nearDamage:[0,80],blastRadius:17}),description:'固定火炮通过车体转向瞄准；可呼叫直线飞越侦察机或接管俯冲轰炸机投弹。'}),
    b_tank:vehicleDefinition({id:'b_tank',tier:1,branch:'tank',researchCost:0,name:'B号坦克',hp:150,speed:44/3.6,reverseSpeed:9/3.6,recon:200,intelLife:5,immunity:10,minPitch:-9*Math.PI/180,maxPitch:20*Math.PI/180,dimensions:Object.freeze({length:4.81,width:2.28,height:2.02}),muzzleHeight:1.65,muzzleLength:2.1,price:200,weapons:Object.freeze(['autocannon','repair','observation']),model:'panzer_ii',description:'20mm机炮配合车长扇形侦察；免疫低于10点伤害，每局可停车维修一次。'}),
    hero_tank:vehicleDefinition({id:'hero_tank',tier:2,branch:'tank',researchCost:1000,name:'战斗英雄号',hp:230,speed:40/3.6,reverseSpeed:15/3.6,recon:220,intelLife:5,immunity:15,minPitch:-3*Math.PI/180,maxPitch:20*Math.PI/180,dimensions:Object.freeze({length:9.9,width:3.32,height:2.93}),muzzleHeight:2.05,muzzleLength:5,price:1000,weapons:Object.freeze(['tankCannon','observation','highExplosive']),model:'is2',description:'122mm火炮伤害90、爆炸半径5米、装填10秒；免疫低于15点伤害，可观察前方扇区或装填下一发高爆弹。'}),
    cougar_artillery:vehicleDefinition({id:'cougar_artillery',tier:2,branch:'artillery',researchCost:1000,name:'美洲狮自行榴弹炮',hp:135,speed:48/3.6,reverseSpeed:10/3.6,recon:280,intelLife:8,mass:44,minPitch:-5*Math.PI/180,maxPitch:65*Math.PI/180,turretYaw:30*Math.PI/180,dimensions:Object.freeze({length:9.75,width:3.58,height:3.55}),muzzleHeight:2.2,muzzleLength:5.1,price:1000,weapons:Object.freeze(['artillery','uav','spade','mg']),artillery:Object.freeze({name:'M47 203.2mm榴弹炮',caliber:203.2,cooldown:30,speed:711,range:1000,directDamage:140,nearDamage:[0,140],blastRadius:20,gravity:711*711*(1000+2.2)/(1000-5.1*Math.SQRT1_2)**2}),weaponOverrides:Object.freeze({uav:{recon:420},mg:{fireInterval:.09/1.1}}),model:'m53m55',preferredDistance:850,description:'可发射常规高爆弹，远距离曲射威力极强，适合远程火力压制。'}),
    black_turtle:vehicleDefinition({id:'black_turtle',tier:2,branch:'missile',researchCost:1000,name:'黑甲鱼',hp:130,speed:62/3.6,reverseSpeed:10/3.6,recon:280,intelLife:5,launcherMinPitch:-5*Math.PI/180,launcherMaxPitch:15*Math.PI/180,launcherYaw:85*Math.PI/180,dimensions:Object.freeze({length:6.61,width:3.10,height:2.49}),muzzleHeight:2.3,muzzleLength:1.8,price:1000,weapons:Object.freeze(['uav','missile','sam','mg']),weaponOverrides:Object.freeze({uav:{recon:420},missile:{directDamage:95,speed:155*1.05,recon:200},mg:{fireInterval:.09/1.1}}),model:'shturm',description:'二级履带导弹车，发射架水平旋转±85°，携带无人机、巡航导弹、防空弹和高射机枪。'})
  });
  const vehicleSpec = id => VEHICLES[id] || VEHICLES[DEFAULT_VEHICLE];
  const weaponSpec=(p,kind)=>{const spec={...WEAPONS[kind],...(kind==='artillery'?vehicleSpec(p.vehicleId).artillery:{}),...(vehicleSpec(p.vehicleId).weaponOverrides?.[kind]||{})};if(kind==='artillery'){spec.speed=vehicleSpec(p.vehicleId).artillery?.speed??Math.sqrt(GRAVITY*spec.range);if(p.spadeDeployed)spec.cooldown*=.8;}spec.cooldown*=Crew.cooldown(p.crew,kind);if(spec.reload)spec.reload*=Crew.cooldown(p.crew,kind);return spec;};
  const BRANCHES=Object.freeze({missile:'导弹车',artillery:'自行火炮',tank:'坦克'});
  const matchCandidates=id=>Object.values(VEHICLES).filter(v=>Math.abs(v.tier-vehicleSpec(id).tier)<=1).map(v=>v.id);
  const C = Object.freeze(Object.fromEntries(Object.entries(WEAPONS).map(([id,spec])=>[id,spec.cooldown])));
  const PITCH = {tankCannon:[-3*Math.PI/180,20*Math.PI/180],highExplosive:[0,0],autocannon:[-9*Math.PI/180,20*Math.PI/180],spade:[0,0],repair:[0,0],observation:[0,0], reconPlane:[0,0],bomber:[-.5,.5],bomb:[0,0],uav: [.06, 1.25], missile: [-1.25, 1.25], artillery: [ARTILLERY.curve.minPitch, ARTILLERY.curve.maxPitch], sam: [-1.25, 1.4], mg: [-.18, 1.4] };
  const DEFAULT_PITCH = {tankCannon:0,highExplosive:0,autocannon:0,spade:0,repair:0,observation:0, reconPlane:0,bomber:0,bomb:0,uav: .25, missile: .24, artillery: ARTILLERY.curve.defaultPitch, sam: .65, mg: .38 };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrap = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const direction = (yaw, pitch) => ({ x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) });
  let mapId='hills';
  const MAPS=Object.freeze({hills:{name:'丘陵交火'},city:{name:'沙砾城墟'}});
  const LAKE={x:1530,z:1480,rx:260,rz:190};
  const inLake=(x,z)=>mapId==='city'&&((x-LAKE.x)/LAKE.rx)**2+((z-LAKE.z)/LAKE.rz)**2<1;
  const intelLife=p=>(vehicleSpec(p.vehicleId).intelLife||INTEL_LIFE)*Crew.modifiers(p.crew).intel;
  const terrain = (worldX, worldZ) => { if(mapId==='city')return inLake(worldX,worldZ)?-2:2; const x=worldX*800/W,z=worldZ*1200/H;return 7 + 4 * Math.sin(x * .009) * Math.cos(z * .008) + 3 * Math.sin(z * .013 + x * .006)
    + 26 * Math.exp(-((x - 685) ** 2 / 23000 + (z - 330) ** 2 / 37000))
    + 21 * Math.exp(-((x - 105) ** 2 / 18000 + (z - 815) ** 2 / 28000)); };
  // Shared physical village layout: renderer and collision rules use this data.
  const BUILDINGS = [];
  for (const [cx, cz] of [[620, 510], [1440, 1450], [1390, 690], [530, 1360]]) {
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
      BUILDINGS.push({ x: cx + (col - 1.5) * 32, z: cz + (row - 1) * 39, w: 17 + col % 2 * 4, d: 20, h: 9 + (row + col) % 3 * 4 });
    }
  }
  const TREES=[];let treeSeed=7919;
  const treeRandom=()=>{treeSeed=(treeSeed*1664525+1013904223)>>>0;return treeSeed/4294967296;};
  for(let i=0;i<800;i++){let x,z;do{x=-150+treeRandom()*(W+300);z=-150+treeRandom()*(H+300);}while(BUILDINGS.some(b=>Math.hypot(b.x-x,b.z-z)<35));const scale=.55+treeRandom()*.7,yaw=treeRandom()*6;TREES.push(Object.freeze({x,z,y:terrain(x,z),scale,yaw,radius:.65*scale,height:16*scale}));}
  const BUSHES=[];
  const TREE_CELLS=new Map(),hillBuildings=BUILDINGS.slice(),hillTrees=TREES.slice();
  function configureMap(id='hills'){
    mapId=Object.hasOwn(MAPS,id)?id:'hills';BUILDINGS.length=0;TREES.length=0;TREE_CELLS.clear();
    if(mapId==='city'){
      for(let row=0;row<10;row++)for(let col=0;col<10;col++){
        const x=100+col*200,z=100+row*200;if((col>=1&&col<=3&&row>=1&&row<=3)||(col>=6&&col<=8&&row>=1&&row<=3))continue;if(((x-LAKE.x)/(LAKE.rx+85))**2+((z-LAKE.z)/(LAKE.rz+85))**2<1)continue;
        for(const dx of[-43,43])for(const dz of[-43,43])BUILDINGS.push({x:x+dx,z:z+dz,w:48,d:48,h:18+((row*7+col*13+(dx>0?3:0)+(dz>0?5:0))%8)*9});
      }
      for(const [cx,cz,kind]of [[500,500,'factory'],[1500,500,'commercial']]){
        for(const dx of [-160,0,160])for(const dz of [-160,0,160])BUILDINGS.push({x:cx+dx,z:cz+dz,w:kind==='factory'?105:96,d:kind==='factory'?88:96,h:kind==='factory'?22:42+((dx+dz)/160+2)*8,district:kind});
        if(kind==='factory')for(const x of [cx-110,cx+110])BUILDINGS.push({x,z:cz+105,w:12,d:12,h:64,district:'chimney'});
      }
      for(let i=0;i<200;i++){const x=30+(i%20)*100,z=25+Math.floor(i/20)*200;if(inLake(x,z)||BUILDINGS.some(b=>Math.abs(x-b.x)<b.w/2+6&&Math.abs(z-b.z)<b.d/2+6))continue;TREES.push({x,z,y:terrain(x,z),scale:.65,yaw:i,radius:.65*.65,height:16*.65});}
    }else {BUILDINGS.push(...hillBuildings);TREES.push(...hillTrees);}
    for(const t of TREES){const key=Math.floor(t.x/50)+','+Math.floor(t.z/50);if(!TREE_CELLS.has(key))TREE_CELLS.set(key,[]);TREE_CELLS.get(key).push(t);}
    BUSHES.length=0;BUSHES.push(...Recon.bushes(mapId,BUILDINGS));
    return mapId;
  }
  configureMap();
  function treeHit(a,b){
    let best=null;const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
    for(let ix=Math.floor((Math.min(a.x,b.x)-6)/50);ix<=Math.floor((Math.max(a.x,b.x)+6)/50);ix++)for(let iz=Math.floor((Math.min(a.z,b.z)-6)/50);iz<=Math.floor((Math.max(a.z,b.z)+6)/50);iz++){
      for(const t of TREE_CELLS.get(ix+','+iz)||[]){
        if(t.x<Math.min(a.x,b.x)-6||t.x>Math.max(a.x,b.x)+6||t.z<Math.min(a.z,b.z)-6||t.z>Math.max(a.z,b.z)+6)continue;
        const ox=a.x-t.x,oz=a.z-t.z,oy=a.y-t.y;
        // Swept analytic trunk cylinder and canopy cone; exact even for fast missiles.
        for(const [bottom,top,r,k]of [[0,5*t.scale,t.radius,0],[2*t.scale,16*t.scale,4.6*t.scale,4.6/14]]){
          let lo=0,hi=best?best.f:1;
          if(Math.abs(dy)<1e-9){if(oy<bottom||oy>top)continue;}else{const f0=(bottom-oy)/dy,f1=(top-oy)/dy;lo=Math.max(lo,Math.min(f0,f1));hi=Math.min(hi,Math.max(f0,f1));}
          if(lo>hi)continue;const rr=r-k*(oy-bottom),A=dx*dx+dz*dz-k*k*dy*dy,bb=2*(ox*dx+oz*dz+rr*k*dy),cc=ox*ox+oz*oz-rr*rr,points=[lo,hi];
          if(Math.abs(A)<1e-9){if(Math.abs(bb)>1e-9){const f=-cc/bb;if(f>lo&&f<hi)points.push(f);}}
          else{const disc=bb*bb-4*A*cc;if(disc>=0)for(const f of[(-bb-Math.sqrt(disc))/(2*A),(-bb+Math.sqrt(disc))/(2*A)])if(f>lo&&f<hi)points.push(f);}
          points.sort((x,y)=>x-y);const inside=f=>A*f*f+bb*f+cc<=1e-7;
          for(let i=0;i<points.length;i++)if(inside(points[i])||i+1<points.length&&inside((points[i]+points[i+1])/2)){const f=points[i];if(!best||f<best.f)best={x:a.x+dx*f,y:a.y+dy*f,z:a.z+dz*f,f};break;}
        }
      }
    }
    return best;
  }
  function surface(x, z) {
    let y = terrain(x, z);
    for (const b of BUILDINGS) if (Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2) y = Math.max(y, terrain(b.x, b.z) + b.h);
    return y;
  }
  function clearGround(x, z, radius = 5) {
    return !inLake(x,z) && x >= 18 && x <= W - 18 && z >= 18 && z <= H - 18 && !BUILDINGS.some(b => Math.abs(x - b.x) < b.w / 2 + radius && Math.abs(z - b.z) < b.d / 2 + radius) && !TREES.some(t=>Math.hypot(t.x-x,t.z-z)<t.radius+radius);
  }
  function vehicleClear(x,z,p){
    const d=vehicleSpec(p.vehicleId).dimensions,hw=d.width/2,hl=d.length/2,c=Math.cos(p.yaw),s=Math.sin(p.yaw);
    const ex=Math.abs(c)*hw+Math.abs(s)*hl,ez=Math.abs(s)*hw+Math.abs(c)*hl;
    if(x-ex<18||x+ex>W-18||z-ez<18||z+ez>H-18)return false;
    for(const b of BUILDINGS){
      const dx=b.x-x,dz=b.z-z;
      if(Math.abs(dx)<ex+b.w/2&&Math.abs(dz)<ez+b.d/2&&
        Math.abs(c*dx+s*dz)<hw+Math.abs(c)*b.w/2+Math.abs(s)*b.d/2&&
        Math.abs(s*dx-c*dz)<hl+Math.abs(s)*b.w/2+Math.abs(c)*b.d/2)return false;
    }
    for(const t of TREES){const dx=t.x-x,dz=t.z-z,lx=c*dx+s*dz,lz=s*dx-c*dz;
      if(Math.hypot(Math.max(0,Math.abs(lx)-hw),Math.max(0,Math.abs(lz)-hl))<t.radius)return false;
    }
    for(const sx of[-1,0,1])for(const sz of[-1,0,1])if(inLake(x+c*hw*sx+s*hl*sz,z+s*hw*sx-c*hl*sz))return false;
    return true;
  }

  function vehicleHit(a,b,p,impact=false){
    const d=vehicleSpec(p.vehicleId).dimensions,c=Math.cos(p.yaw),s=Math.sin(p.yaw);
    const local=q=>[c*(q.x-p.x)+s*(q.z-p.z),q.y-p.y,s*(q.x-p.x)-c*(q.z-p.z)];
    const start=local(a),end=local(b),lo=[-d.width/2,0,-d.length/2],hi=[d.width/2,d.height,d.length/2];
    let enter=0,exit=1;
    for(let i=0;i<3;i++){
      const delta=end[i]-start[i];
      if(Math.abs(delta)<1e-9){if(start[i]<lo[i]||start[i]>hi[i])return false;continue;}
      const t1=(lo[i]-start[i])/delta,t2=(hi[i]-start[i])/delta;
      enter=Math.max(enter,Math.min(t1,t2));exit=Math.min(exit,Math.max(t1,t2));if(enter>exit)return false;
    }
    return impact?{x:a.x+(b.x-a.x)*enter,y:a.y+(b.y-a.y)*enter,z:a.z+(b.z-a.z)*enter}:true;
  }
  function buildingBlocks(a,b,box){const start=[a.x,a.y,a.z],end=[b.x,b.y,b.z],y=terrain(box.x,box.z),lo=[box.x-box.w/2,y,box.z-box.d/2],hi=[box.x+box.w/2,y+box.h,box.z+box.d/2];let enter=0,exit=1;for(let i=0;i<3;i++){const delta=end[i]-start[i];if(Math.abs(delta)<1e-9){if(start[i]<lo[i]||start[i]>hi[i])return false;}else{const f=(lo[i]-start[i])/delta,g=(hi[i]-start[i])/delta;enter=Math.max(enter,Math.min(f,g));exit=Math.min(exit,Math.max(f,g));if(enter>exit)return false;}}return exit>1e-5&&enter<.99999;}
  function lineOfSight(a, b) {
    if(BUILDINGS.some(box=>buildingBlocks(a,b,box)))return false;
    if(treeHit(a,b))return false;
    const steps = Math.ceil(dist3(a, b) / 12);
    for (let i = 1; i < steps; i++) {
      const f = i / steps, x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
      if (a.y + (b.y - a.y) * f < surface(x, z) + .6) return false;
    }
    return true;
  }
  function segmentDistance(a, b, p) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const f = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / (dx * dx + dy * dy + dz * dz || 1), 0, 1);
    return Math.hypot(a.x + dx * f - p.x, a.y + dy * f - p.y, a.z + dz * f - p.z);
  }
  function muzzle(p, kind) {
    const a = p.aim[kind], d = direction(a.yaw, a.pitch),spec=vehicleSpec(p.vehicleId),length=['artillery','autocannon','tankCannon'].includes(kind)?(spec.muzzleLength||6.2):1.8,height=['artillery','autocannon','tankCannon'].includes(kind)?(spec.muzzleHeight||2.7):(spec.launcherYaw!==undefined?spec.muzzleHeight:1.65);
    return { x: p.x + d.x * length, y: terrain(p.x, p.z) + height + d.y * length, z: p.z + d.z * length };
  }
  function ballistic(p, maxPoints = 220) {
    const a = p.aim.artillery, start = muzzle(p, 'artillery'), d = direction(a.yaw, a.pitch), params=artilleryParams(p),speed=params.speed,gravity=params.gravity;
    const points = [{ ...start }]; let hit = null, time = 0;
    for (let i = 1; i <= maxPoints; i++) {
      time = i * .09;
      const q = { x: start.x + d.x * speed * time, y: start.y + d.y * speed * time - .5 * gravity * time * time, z: start.z + d.z * speed * time };
      if (q.x < 0 || q.x > W || q.z < 0 || q.z > H) { points.push(q); break; }
      const obstacle=treeHit(points[points.length-1],q);if(obstacle){q.x=obstacle.x;q.y=obstacle.y;q.z=obstacle.z;points.push(q);hit=q;time=(i-1+obstacle.f)*.09;break;}
      if (q.y <= surface(q.x, q.z)) {
        let lo=time-.09,hi=time;
        for(let j=0;j<12;j++){const mid=(lo+hi)/2,x=start.x+d.x*speed*mid,z=start.z+d.z*speed*mid,y=start.y+d.y*speed*mid-.5*gravity*mid*mid;if(y>surface(x,z))lo=mid;else hi=mid;}
        time=hi;q.x=start.x+d.x*speed*time;q.z=start.z+d.z*speed*time;q.y=surface(q.x,q.z);points.push(q);hit=q;break;
      }
      points.push(q);
    }
    return { points, hit, range: hit ? dist(start, hit) : null, time, speed, mode: p.artilleryMode || 'curve' };
  }
  class Engine {
    constructor(opts = {}) {
      this.mapId=configureMap(opts.mapId);
      this.seed = opts.seed || (Date.now() >>> 0); this.rng = this.seed;this.crewRng=this.seed^0x6a09e667; this.mode = opts.mode || 'ai'; this.difficulty = opts.difficulty || 'standard';
      this.battleMode=opts.battleMode==='dark_forest'?'dark_forest':'duel';this.t = 0; this.limit = this.battleMode==='dark_forest'?300:180; this.countdown = opts.countdown === undefined ? 3 : opts.countdown;
      this.over = false; this.winner = null; this.reason = ''; this.id = 0;
      this.shots = []; this.trails = []; this.effects = []; this.sounds = []; this.players = [this.player(0,opts.vehicles?.[0]), this.player(1,opts.vehicles?.[1]||(this.mode==='ai'?matchCandidates(opts.vehicles?.[0])[Math.floor(this.random()*matchCandidates(opts.vehicles?.[0]).length)]:DEFAULT_VEHICLE))];
      if(this.battleMode==='dark_forest'){const ids=matchCandidates(opts.vehicles?.[0]);for(let i=2;i<8;i++)this.players.push(this.player(i,opts.vehicles?.[i]||ids[Math.floor(this.random()*ids.length)]));}
      this.roomTier=Math.max(...this.players.map(p=>vehicleSpec(p.vehicleId).tier));
      for (let i = 0; i < 80; i++) {
        const a = this.players[0], b = this.players[1];
        a.x = 150 + this.random() * (W-300); a.z = 150 + this.random() * (H-300);
        b.x = 150 + this.random() * (W-300); b.z = 150 + this.random() * (H-300);
        if (dist(a, b) > 950 && clearGround(a.x, a.z) && clearGround(b.x, b.z)) break;
        if (i === 79) { a.x = 250; a.z = 1750; b.x = 1750; b.z = 250; }
      }
      if(this.battleMode==='dark_forest')for(const p of this.players){let found=false;for(let i=0;i<1200;i++){const x=80+this.random()*(W-160),z=80+this.random()*(H-160);if(clearGround(x,z,8)&&this.players.slice(0,p.id).every(q=>dist(q,{x,z})>240)){p.x=x;p.z=z;found=true;break;}}if(!found)throw Error('No safe random spawn');}
      this.zone={x:W/2,z:H/2,radius:Math.hypot(W,H)/2+1,stage:0,next:60};this.botStates=new Map();this.eliminations=[];
      for (const p of this.players) {
        p.y = terrain(p.x, p.z); p.yaw = Math.atan2(W / 2 - p.x, p.z - H / 2);
        for (const a of Object.values(p.aim)) a.yaw = p.yaw;
        this.note(p.id, '敌方位置未知 · 侦察或观察空中尾迹', 'info');
      }
      this.aiClock = 0; this.aiScan = { x: W/2, z: H/2 }; this.aiMoveUntil = 0; this.aiAttackAt = 0;
      this.hardAI = { sample:null, velocity:{x:0,z:0}, clue:0, guess:null, resume:null, scan:0, move:null, moveUntil:0, thinkAt:0, mgTrack:null };
    }
    player(id,vehicleId) {
      const spec=vehicleSpec(vehicleId);
      return { id, crew:Crew.create(spec.id),revealedUntil:0,vehicleId:spec.id, weapons:[...spec.weapons], maxHp:spec.hp, wheelTravel:0,trackTravel:{left:0,right:0}, x: 400, y: 7, z: 1000, hp: spec.hp, yaw: 0, speed: 0, selected: spec.weapons.includes('missile')?'missile':spec.weapons[0], pilot: null, artilleryMode: 'unified',
        drive: { throttle: 0, steer: 0 }, aim: Object.fromEntries(Object.keys(C).map(k => [k, { yaw: 0, pitch: spec.launcherYaw!==undefined&&['uav','missile','sam'].includes(k)?clamp(DEFAULT_PITCH[k],spec.launcherMinPitch,spec.launcherMaxPitch):DEFAULT_PITCH[k] }])),
        spadeDeployed:false,heArmed:false,ammo:10,reloadUntil:0,repairUsed:false,repairUntil:0,observationUntil:0,
        cd: Object.fromEntries(Object.keys(C).map(k => [k, 0])), mg: false, mgClock: 0, controlAt: 0,
        intel: { lock: null, contacts:new Map(), air: new Map(), clues: [] }, log: [], stats: { damage: 0, launches: 0, intercepted: 0, detections: 0, moves: 0,kills:0 }, lastLock: -10 };
    }
    random() { let z = this.rng += 0x6D2B79F5; z = Math.imul(z ^ z >>> 15, z | 1); z ^= z + Math.imul(z ^ z >>> 7, z | 61); return ((z ^ z >>> 14) >>> 0) / 4294967296; }
    randomCrew(){let z=this.crewRng+=0x6D2B79F5;z=Math.imul(z^z>>>15,z|1);z^=z+Math.imul(z^z>>>7,z|61);return((z^z>>>14)>>>0)/4294967296;}
    note(id, text, kind = 'info') { const p = this.players[id]; p.log.unshift({ text, kind, t: this.t, id: ++this.id }); p.log.length = Math.min(5, p.log.length); }
    sound(kind, p, owner) { this.sounds.push({ id: ++this.id, kind, x: p.x, y: p.y, z: p.z, owner, t: this.t }); if(this.sounds.length>64)this.sounds.shift(); }
    effect(p, kind, owner, radius = 24, visualSize = radius<18?'small':'medium') {
      const life=kind==='crater'?12:kind==='explosion'?({small:1.4,medium:1.9,large:2.6}[visualSize]||1.9):1.15;
      this.effects.push({id:++this.id,x:p.x,y:p.y,z:p.z,kind,owner,radius,visualSize,
        visualScale:visualSize==='small'&&radius<=5?.35:1,
        grounded:kind==='explosion'&&p.y-terrain(p.x,p.z)<3,born:this.t,life});
      if(this.effects.length>40)this.effects.shift();if(kind==='explosion'&&radius>5)this.sound('explosion',p,owner);
    }
    command(id, action) {
      const p = this.players[id];
      if (!p || !action || typeof action !== 'object' || this.over || p.hp<=0) return { ok: false, reason: '本局已结束' };
      const k = action.type;
      if(p.repairUntil>this.t&&!['select','vehicle'].includes(k))return {ok:false,reason:'维修期间不可移动或攻击'};
      if (k === 'select') {
        if(!this.hasWeapon(p,action.weapon))return {ok:false,reason:'当前车辆未携带此武器'};
        const previous={...(this.shots.find(s=>s.id===p.pilot&&s.owner===id)||p.aim[p.selected])};p.selected = action.weapon;this.setAim(p,previous);if(['observation','highExplosive','repair','spade'].includes(p.selected))p.aim[p.selected]={...p.aim[this.hasWeapon(p,'artillery')?'artillery':this.hasWeapon(p,'tankCannon')?'tankCannon':'autocannon']}; p.mg = false; return { ok: true };
      }
      if (k === 'vehicle') { const flight=this.shots.find(s=>s.id===p.pilot&&s.owner===id);p.pilot = null;if(flight)this.setAim(p,flight); p.drive = { throttle: 0, steer: 0 }; p.mg = false; return { ok: true }; }
      if (k === 'pilot') {
        const s = this.shots.find(s => s.owner === id && s.id === action.id && ['uav','missile','bomber'].includes(s.kind) && s.hp > 0);
        if (!s) return { ok: false, reason: '飞行器已失去连接' };
        s.orbit = null; p.pilot = s.id; p.mg = false; p.drive = { throttle: 0, steer: 0 }; return { ok: true };
      }
      if(k==='artillery-mode')return {ok:false,reason:'火炮已采用连续俯仰瞄准'};
      if(k==='uav-orbit') {
        const s=this.shots.find(s=>s.owner===id&&s.kind==='uav'&&s.hp>0&&(action.id===undefined||s.id===action.id));
        if(!s||typeof action.active!=='boolean')return {ok:false,reason:'当前没有可控制的无人机'};
        if(this.t<this.countdown)return {ok:false,reason:'正在进入战场'};
        if(action.active){this.startOrbit(s);if(p.pilot===s.id){p.pilot=null;p.drive={throttle:0,steer:0};}this.note(id,'无人机自动盘旋 · 半径50米 / 持续侦察','scout');}
        else {s.orbit=null;p.pilot=s.id;p.drive={throttle:0,steer:0};p.mg=false;this.note(id,'无人机已切回手动飞行','scout');}
        return {ok:true};
      }
      if (k === 'control') {
        if (!Number.isFinite(action.throttle) || !Number.isFinite(action.steer)) return { ok: false, reason: '无效操作' };
        p.drive = { throttle: clamp(action.throttle, -1, 1), steer: clamp(action.steer, -1, 1) }; p.controlAt = this.t;
        if (action.yaw !== undefined || action.pitch !== undefined) return this.setAim(p, action);
        return { ok: true };
      }
      if(k==='map-aim'){
        if(!this.hasWeapon(p,'artillery')||p.pilot||p.selected!=='artillery'||!Number.isFinite(action.x)||!Number.isFinite(action.z))return {ok:false,reason:'请先选择火炮地图瞄准'};
        const target={x:clamp(action.x,0,W),z:clamp(action.z,0,H)},aim=solveArtillery(p,target);
        if(!aim)return {ok:false,reason:`落点超出有效俯仰或射程（最大${weaponSpec(p,'artillery').range}m）`};
        p.aim.artillery={...aim,yaw:vehicleSpec(p.vehicleId).hullAim?p.yaw:aim.yaw};if(vehicleSpec(p.vehicleId).hullAim)p.hullAimYaw=aim.yaw;return {ok:true};
      }
      if (k === 'aim') return this.setAim(p, action);
      if (this.t < this.countdown) return { ok: false, reason: '正在进入战场' };
      if (k === 'mg') {
        if (!this.hasWeapon(p,'mg') || p.pilot || p.selected !== 'mg') return { ok: false, reason: '先选择高射机枪' };
        p.mg = action.active === true; return { ok: true };
      }
      if(k==='bomb'){
        const plane=this.shots.find(q=>q.id===p.pilot&&q.owner===id&&q.kind==='bomber'&&q.hp>0);
        if(!plane||!plane.bombs)return {ok:false,reason:'轰炸机没有可投放炸弹'};
        plane.bombs--;const start={x:plane.x+1.4*Math.sin(plane.pitch)*Math.sin(plane.yaw),y:plane.y-1.4*Math.cos(plane.pitch),z:plane.z-1.4*Math.sin(plane.pitch)*Math.cos(plane.yaw)};
        const bomb={id:++this.id,owner:id,kind:'bomb',...start,yaw:plane.yaw,pitch:plane.pitch,vx:plane.vx,vy:plane.vy,vz:plane.vz,speed:plane.speed,hp:1,born:this.t,ttl:40,distance:0,sampleAt:this.t,noticed:0};
        this.shots.push(bomb);this.trails.push({id:bomb.id,owner:id,kind:'bomb',points:[{...start,t:this.t,d:0}]});this.sound('bomb-release',start,id);this.note(id,'炸弹已分离','attack');return {ok:true,id:bomb.id};
      }
      if (k === 'detonate') {
        const s = this.shots.find(s => s.id === p.pilot && s.owner === id && ['missile','uav'].includes(s.kind));
        if (!s) return { ok: false, reason: '当前飞行器不可引爆' };
        this.explode(s); this.removeDead(); return { ok: true };
      }
      if (k !== 'fire') return { ok: false, reason: '未知指令' };
      if (p.pilot) return { ok: false, reason: '返回发射车后使用装备' };
      const weapon = p.selected;
      if(Crew.MAIN.has(weapon)&&!Crew.modifiers(p.crew).main)return {ok:false,reason:'炮长岗位无人，主武器无法操作'};
      if(!this.hasWeapon(p,weapon))return {ok:false,reason:'当前车辆未携带此武器'};
      if(weapon==='spade'){if(Math.abs(p.speed)>.25)return {ok:false,reason:'停车后才能展开驻锄'};p.spadeDeployed=!p.spadeDeployed;p.cd.artillery*=p.spadeDeployed?.8:1.25;p.speed=0;p.drive={throttle:0,steer:0};this.sound('spade',p,id);this.note(id,p.spadeDeployed?'驻锄展开 · 火炮装填缩短20%':'驻锄收起 · 恢复机动','info');return {ok:true};}
      if(weapon==='repair'){if(p.repairUsed)return {ok:false,reason:'本局维修已使用'};if(p.hp>=p.maxHp)return {ok:false,reason:'生命值已满'};p.repairUsed=true;p.repairUntil=this.t+15;p.speed=0;p.drive={throttle:0,steer:0};p.mg=false;this.note(id,'紧急维修开始 · 原地15秒','info');return {ok:true};}
      if(weapon==='observation'){if(p.cd.observation>0)return {ok:false,reason:'观察冷却中'};p.observationYaw=p.aim[this.hasWeapon(p,'artillery')?'artillery':this.hasWeapon(p,'tankCannon')?'tankCannon':'autocannon'].yaw;p.observationUntil=this.t+8;p.cd.observation=weaponSpec(p,'observation').cooldown;this.updateIntel();return {ok:true};}
      if(weapon==='highExplosive'){if(p.heArmed)return {ok:false,reason:'下一发已经装填高爆弹'};if(p.cd.highExplosive>0)return {ok:false,reason:'高爆弹冷却中'};p.heArmed=true;p.cd.highExplosive=weaponSpec(p,'highExplosive').cooldown;this.note(id,'下一发122mm炮弹已装填高爆弹','attack');return {ok:true};}
      if(weapon==='autocannon'){if(p.reloadUntil>this.t)return {ok:false,reason:'机炮换弹中'};if(p.cd.autocannon>0)return {ok:false,reason:'机炮射击间隔'};const shot=this.launch(p,weapon);p.ammo--;p.cd.autocannon=weaponSpec(p,'autocannon').cooldown;p.stats.launches++;if(!p.ammo){p.reloadUntil=this.t+weaponSpec(p,'autocannon').reload;this.sound('reload',p,id);}return {ok:true,id:shot.id};}
      if (weapon === 'mg') return { ok: false, reason: '按住开火持续射击' };
      if (weapon!=='tankCannon'&&(Math.abs(p.speed) > 2 || Math.abs(p.drive.throttle) > .1)) return { ok: false, reason: '停车后才能发射' };
      if (p.cd[weapon] > 0) return { ok: false, reason: '装备冷却中' };
      if (weapon === 'uav' && this.shots.some(s => s.kind === 'uav' && s.owner === id && s.hp > 0)) return { ok: false, reason: '点击接管无人机，继续操纵现有飞机' };
      let airTarget=null;
      if (weapon==='sam') {
        airTarget=this.samTarget(id,{x:p.x,y:p.y+1.65,z:p.z});
        if(!airTarget)return {ok:false,reason:'300m 内没有可锁定的空中目标'};
        p.aim.sam={yaw:Math.atan2(airTarget.x-p.x,p.z-airTarget.z),pitch:clamp(Math.atan2(airTarget.y-p.y-1.65,dist(p,airTarget)),-1.25,1.4)};
      }
      if(weapon==='artillery'&&vehicleSpec(p.vehicleId).hullAim){const desired=p.hullAimYaw??p.aim.artillery.yaw;if(Math.abs(wrap(desired-p.yaw))>.04){p.hullAimYaw=desired;return {ok:false,reason:'车体正在转向，请对准目标后开火'};}p.aim.artillery.yaw=p.yaw;}
      // Apply physical launch limits even for automatic SAM and AI-generated aims.
      this.setAim(p,p.aim[weapon]);
      const s = this.launch(p, weapon); p.cd[weapon] = weaponSpec(p,weapon).cooldown; p.stats.launches++;
      if(airTarget)s.targetId=airTarget.id;
      if (['uav','missile','bomber'].includes(weapon)) { p.pilot = s.id; p.drive = { throttle: 0, steer: 0 }; }
      this.note(id, { reconPlane:'侦察机已呼叫 · 高空直线飞越',bomber:'轰炸机已呼叫 · 手动飞行，按开火投弹',uav:`无人机起飞 · ${weaponSpec(p,'uav').recon}m 共享侦察`, missile:'导弹出筒 · 手动飞行 / 200m 侦察', tankCannon:'122mm炮弹出膛',artillery:'炮弹出膛 · 白色尾迹持续8秒', sam:'防空导弹自动锁定 · 25秒装填' }[weapon], weapon === 'uav' ? 'scout' : 'attack');
      return { ok: true, id: s.id };
    }
    hasWeapon(p,kind) { return Object.prototype.hasOwnProperty.call(WEAPONS,kind)&&p.weapons.includes(kind); }
    setAim(p, a) {
      if (!Number.isFinite(a.yaw) || !Number.isFinite(a.pitch)) return { ok: false, reason: '无效瞄准' };
      const s = this.shots.find(s => s.id === p.pilot && s.owner === p.id && s.hp > 0);
      if (s) { s.yaw = wrap(a.yaw); s.pitch = clamp(a.pitch, -1.3, 1.4); }
      else {
        if(!this.hasWeapon(p,p.selected))return {ok:false,reason:'当前车辆未携带此武器'};
        const v=vehicleSpec(p.vehicleId),q=artilleryParams(p),kind=['observation','highExplosive','repair','spade'].includes(p.selected)?(this.hasWeapon(p,'artillery')?'artillery':this.hasWeapon(p,'tankCannon')?'tankCannon':'autocannon'):p.selected,
          launcher=v.launcherYaw!==undefined&&['uav','missile','sam'].includes(kind),lim=kind==='artillery'?[q.minPitch,q.maxPitch]:launcher?[v.launcherMinPitch,v.launcherMaxPitch]:PITCH[kind],
          aim={yaw:v.hullAim&&kind==='artillery'?p.yaw:v.turretYaw!==undefined&&kind==='artillery'?wrap(p.yaw+clamp(wrap(a.yaw-p.yaw),-v.turretYaw,v.turretYaw)):launcher?wrap(p.yaw+clamp(wrap(a.yaw-p.yaw),-v.launcherYaw,v.launcherYaw)):wrap(a.yaw),pitch:clamp(a.pitch,lim[0],lim[1])};
        p.aim[kind]=aim;if(kind!==p.selected)p.aim[p.selected]={...aim};if(v.hullAim&&kind==='artillery')p.hullAimYaw=wrap(a.yaw);
      }
      return { ok: true };
    }
    launch(p, kind) {
      p.revealedUntil=this.t+10;
      const spec=weaponSpec(p,kind==='bullet'?'mg':kind),start = muzzle(p, kind), a = p.aim[kind], speed = kind==='artillery'?artilleryParams(p).speed:spec.speed;
      const d = direction(a.yaw, a.pitch);
      const s = { id: ++this.id, owner: p.id, kind, ...start, yaw: a.yaw, pitch: a.pitch, vx: d.x * speed, vy: d.y * speed, vz: d.z * speed,
        speed, hp: spec.hp || 1, born: this.t, ttl: spec.life,
        distance: 0, sampleAt: this.t, noticed: 0 };
      if(['reconPlane','bomber'].includes(kind)){const back=kind==='reconPlane'?600:250;s.x=p.x-d.x*back;s.z=p.z-d.z*back;s.y=Math.max(180,surface(p.x,p.z)+160);s.pitch=0;s.vx=Math.sin(a.yaw)*speed;s.vy=0;s.vz=-Math.cos(a.yaw)*speed;s.bombs=kind==='bomber'?1:0;}
      this.shots.push(s);
      s.blastSpec=kind==='tankCannon'&&p.heArmed?{...spec,directDamage:95,blastRadius:15,nearDamage:[0,95],directRadius:0}:spec;
      if(kind==='tankCannon')p.heArmed=false;
      if(kind==='artillery'&&p.vehicleId==='cougar_artillery')s.heavyArtillery=true;
      if(kind==='artillery'){s.artilleryMode=p.artilleryMode;s.blastSpec=spec;}
      this.sound(s.heavyArtillery?'artillery-heavy':kind==='autocannon'?'autocannon':kind==='tankCannon'?'tankCannon':kind,start,p.id);
      if (!['bullet','autocannon'].includes(kind)) this.trails.push({ id: s.id, owner: p.id, kind, points: [{ ...start, t: this.t, d: 0 }] });
      return s;
    }
    shootMG(p) {
      p.revealedUntil=this.t+10;
      const a = p.aim.mg, spread=this.mode==='ai'&&this.difficulty==='hard'&&p.id===1?.025:0,
        yaw=a.yaw+(spread?(this.random()-.5)*2*spread:0),pitch=a.pitch+(spread?(this.random()-.5)*2*spread:0),
        d = direction(yaw,pitch), m = muzzle(p, 'mg'),spec=weaponSpec(p,'mg');
      this.shots.push({ id: ++this.id, owner: p.id, kind: 'bullet', ...m, yaw, pitch, vx: d.x * spec.speed, vy: d.y * spec.speed, vz: d.z * spec.speed,
        speed: spec.speed, blastSpec:spec, hp: 1, born: this.t, ttl: spec.life, distance: 0, noticed: 0 });
      this.sound('mg',m,p.id);
    }
    startOrbit(s) {
      const radius=ORBIT_RADIUS,x=clamp(s.x+Math.cos(s.yaw)*radius,radius,W-radius),z=clamp(s.z+Math.sin(s.yaw)*radius,radius,H-radius);
      let altitude=s.y;for(let i=0;i<32;i++){const a=i/32*TAU;altitude=Math.max(altitude,surface(x+Math.cos(a)*radius,z+Math.sin(a)*radius)+20);}
      s.orbit={x,z,radius,altitude,angle:Math.atan2(s.z-z,s.x-x),joining:Math.abs(Math.hypot(s.x-x,s.z-z)-radius)>1};
    }
    stepOrbit(s,dt) {
      const o=s.orbit,dx=s.x-o.x,dz=s.z-o.z,d=Math.hypot(dx,dz);
      if(o.joining&&Math.abs(d-o.radius)<=1){o.joining=false;o.angle=Math.atan2(dz,dx);}
      if(o.joining){
        const a=Math.atan2(dz,dx),x=o.x+Math.cos(a)*o.radius,z=o.z+Math.sin(a)*o.radius;
        const yaw=Math.atan2(x-s.x,s.z-z),pitch=clamp(Math.atan2(o.altitude-s.y,Math.max(25,dist(s,{x,z}))),-.35,.45);
        s.yaw=wrap(s.yaw+clamp(wrap(yaw-s.yaw),-2.4*dt,2.4*dt));s.pitch+=clamp(pitch-s.pitch,-dt,dt);return false;
      }
      const old={x:s.x,y:s.y,z:s.z};o.angle+=s.speed/o.radius*dt;
      s.x=o.x+Math.cos(o.angle)*o.radius;s.z=o.z+Math.sin(o.angle)*o.radius;s.y+=clamp(o.altitude-s.y,-20*dt,20*dt);
      s.vx=(s.x-old.x)/dt;s.vy=(s.y-old.y)/dt;s.vz=(s.z-old.z)/dt;s.yaw=Math.atan2(s.vx,-s.vz);s.pitch=Math.atan2(s.vy,Math.hypot(s.vx,s.vz));return true;
    }
    samTarget(id,from) {
      return this.shots.filter(q=>q.hp>0&&q.owner!==id&&['uav','missile','sam','reconPlane','bomber'].includes(q.kind)&&dist3(from,q)<=WEAPONS.sam.lockRange)
        .sort((a,b)=>(a.kind==='missile'?-1000:0)+dist3(from,a)-((b.kind==='missile'?-1000:0)+dist3(from,b)))[0]||null;
    }
    guideSAM(s,dt) {
      let q=this.shots.find(q=>q.id===s.targetId&&q.owner!==s.owner&&q.hp>0);
      if(!q){q=this.samTarget(s.owner,s);s.targetId=q?q.id:null;}
      if(!q)return;
      const lead=Math.min(1.1,dist3(s,q)/s.speed),x=q.x+q.vx*lead,y=q.y+q.vy*lead,z=q.z+q.vz*lead;
      const yaw=Math.atan2(x-s.x,s.z-z),pitch=Math.atan2(y-s.y,Math.hypot(x-s.x,z-s.z));
      s.yaw=wrap(s.yaw+clamp(wrap(yaw-s.yaw),-3.4*dt,3.4*dt));s.pitch+=clamp(pitch-s.pitch,-3.4*dt,3.4*dt);
    }
    inReconRange(id,target){
      const p=this.players[id];if(!p||p.hp<=0)return false;
      const mods=Crew.modifiers(p.crew),hidden=Recon.hidden(target,BUSHES,this.t),cap=hidden?50:Infinity;
      const visible=(sensor,range,flat=false)=>((flat?dist(sensor,target):dist3(sensor,target))<=Math.min(range,cap))&&lineOfSight(sensor,target);
      const eye={x:p.x,y:p.y+4,z:p.z};
      if(p.observationUntil>this.t&&Math.abs(wrap(Math.atan2(target.x-p.x,p.z-target.z)-p.observationYaw))<=Math.PI/4&&visible(eye,500*mods.recon))return true;
      if(visible(eye,vehicleSpec(p.vehicleId).recon*mods.recon))return true;
      for(const shot of this.shots){if(shot.owner!==id||shot.hp<=0||!['uav','missile','reconPlane','bomber'].includes(shot.kind))continue;if(visible(shot,(weaponSpec(p,shot.kind).recon||reconRange(shot.kind))*mods.recon,shot.kind==='reconPlane'))return true;}
      return false;
    }

    update(dt) {
      if (this.over || !Number.isFinite(dt) || dt <= 0) return; dt = Math.min(.05, dt); this.t += dt;
      this.effects = this.effects.filter(e => this.t - e.born < e.life);
      this.sounds=this.sounds.filter(e=>this.t-e.t<1.2);
      for (const tr of this.trails) tr.points = tr.points.filter(p => this.t - p.t < TRAIL_LIFE);
      this.trails = this.trails.filter(tr => tr.points.length);
      if (this.t < this.countdown) return;
      if(this.mode==='ai')this.runBots(dt);
      for (const p of this.players) {
        if(p.hp<=0){p.speed=0;p.mg=false;p.drive={throttle:0,steer:0};continue;}
        const startX=p.x,startZ=p.z,startYaw=p.yaw,spec=vehicleSpec(p.vehicleId),mods=Crew.modifiers(p.crew);
        for (const k of Object.keys(C)) p.cd[k] = Math.max(0, p.cd[k] - dt);
        if(p.reloadUntil&&this.t>=p.reloadUntil){p.ammo=10;p.reloadUntil=0;}
        if(p.repairUntil){p.speed=0;p.drive={throttle:0,steer:0};p.mg=false;if(this.t>=p.repairUntil){p.hp=p.maxHp;p.repairUntil=0;this.note(p.id,'维修完成 · 耐久已恢复','info');}}
        p.intel.clues = p.intel.clues.filter(c => c.until > this.t);
        // Stale touch input cannot leave a disconnected or backgrounded vehicle driving.
        if (this.t - p.controlAt > .7) p.drive = { throttle: 0, steer: 0 };
        const piloted = this.shots.find(s => s.id === p.pilot && s.hp > 0);
        if (piloted) {
          const rate = piloted.kind === 'uav' ? 1.1 : 1.35;
          piloted.yaw = wrap(piloted.yaw + p.drive.steer * rate * dt);
          piloted.pitch = clamp(piloted.pitch + p.drive.throttle * .85 * dt, -1.3, 1.4);
          p.speed *= Math.max(0, 1 - 8 * dt);
        } else {
          p.pilot = null;
          const target = (mods.drive&&!p.spadeDeployed?p.drive.throttle:0) * (p.drive.throttle < 0 ? spec.reverseSpeed : spec.speed)*mods.speed;if(!mods.drive||p.spadeDeployed)p.speed=0;
          p.speed += (target - p.speed) * (1-Math.exp(-dt*Motion.ACCEL[spec.accelerationRating]));p.speed=clamp(p.speed,-spec.reverseSpeed*mods.speed,spec.speed*mods.speed);
          const turn = (p.repairUntil||p.spadeDeployed||!mods.drive?0:p.drive.steer) * dt * Motion.TURN[spec.turnRating] * (Math.abs(p.speed) > .5 ? Math.sign(p.speed) : .5);
          if(mods.drive&&spec.hullAim&&p.hullAimYaw!==undefined&&Math.abs(p.drive.steer)<.05){const next=wrap(p.yaw+clamp(wrap(p.hullAimYaw-p.yaw),-Motion.TURN[spec.turnRating]*dt,Motion.TURN[spec.turnRating]*dt));if(vehicleClear(p.x,p.z,{...p,yaw:next}))p.yaw=next;}else if(Math.abs(p.drive.steer)>.05)p.hullAimYaw=undefined;
          p.yaw = wrap(p.yaw + turn); for (const a of Object.values(p.aim)) a.yaw = wrap(a.yaw + turn);
          const nx = p.x + Math.sin(p.yaw) * p.speed * dt, nz = p.z - Math.cos(p.yaw) * p.speed * dt;
          if (vehicleClear(nx, nz,p)) { p.x = nx; p.z = nz; } else if (vehicleClear(nx, p.z,p)) p.x = nx; else if (vehicleClear(p.x, nz,p)) p.z = nz; else p.speed = 0;
          p.y = terrain(p.x, p.z);if(spec.hullAim)p.aim.artillery.yaw=p.yaw;
        }
        p.wheelTravel+=(p.x-startX)*Math.sin(p.yaw)-(p.z-startZ)*Math.cos(p.yaw);
        const advance=(p.x-startX)*Math.sin(p.yaw)-(p.z-startZ)*Math.cos(p.yaw),turnTravel=wrap(p.yaw-startYaw)*spec.dimensions.width/2;p.trackTravel.left+=advance+turnTravel;p.trackTravel.right+=advance-turnTravel;
        if (p.mg && this.hasWeapon(p,'mg') && !p.pilot && p.selected === 'mg') { p.mgClock -= dt; if (p.mgClock <= 0) { this.shootMG(p); p.mgClock = weaponSpec(p,'mg').fireInterval; } } else p.mgClock = 0;
      }
      for(const q of this.shots)q.previous={x:q.x,y:q.y,z:q.z};
      for (const s of [...this.shots]) {
        if (s.hp <= 0) continue;
        const prev = { x: s.x, y: s.y, z: s.z };
        if(s.kind==='sam')this.guideSAM(s,dt);
        const orbitStep=s.kind==='uav'&&s.orbit&&this.stepOrbit(s,dt);
        if (!orbitStep&&['uav','missile','sam','reconPlane','bomber'].includes(s.kind)) {
          const d = direction(s.yaw, s.pitch); s.vx = d.x * s.speed; s.vy = d.y * s.speed; s.vz = d.z * s.speed;
        }
        const gravity = s.kind === 'artillery' ? (s.blastSpec?.gravity??GRAVITY) : s.kind==='bomb'?9.81:s.kind === 'bullet' ? 4 : 0;
        if(!orbitStep){s.x += s.vx * dt; s.y += s.vy * dt - .5 * gravity * dt * dt; s.z += s.vz * dt; s.vy -= gravity * dt;}const stepDistance=dist3(prev,s);if(['autocannon','tankCannon'].includes(s.kind)&&s.distance+stepDistance>s.blastSpec.range){const f=Math.max(0,s.blastSpec.range-s.distance)/stepDistance;s.x=prev.x+(s.x-prev.x)*f;s.y=prev.y+(s.y-prev.y)*f;s.z=prev.z+(s.z-prev.z)*f;}s.distance+=dist3(prev,s);
        if (s.kind === 'artillery') { s.yaw = Math.atan2(s.vx, -s.vz); s.pitch = Math.atan2(s.vy, Math.hypot(s.vx, s.vz)); }
        const obstacle=treeHit(prev,s);
        if(obstacle){Object.assign(s,{x:obstacle.x,y:obstacle.y,z:obstacle.z});if(['bullet','sam','autocannon'].includes(s.kind)){s.hp=0;this.effect(s,s.kind==='autocannon'?'explosion':'spark',s.owner,4,'small');}else this.explode(s);continue;}
        this.intercept(s, prev);
        if (s.hp <= 0) continue;
        if (s.kind !== 'bullet' && this.t - s.sampleAt >= .15) {
          const tr = this.trails.find(tr => tr.id === s.id);
          if (tr) tr.points.push({ x: s.x, y: s.y, z: s.z, t: this.t, d: s.distance }); s.sampleAt = this.t;
        }
        this.observeShot(s);
        const hit=this.players.filter(p=>p.id!==s.owner&&p.hp>0).map(p=>({p,hit:vehicleHit(prev,s,p,true)})).filter(q=>q.hit).sort((a,b)=>dist3(prev,a.hit)-dist3(prev,b.hit))[0];
        if(hit&&['missile','uav','artillery','bomb','tankCannon'].includes(s.kind)){Object.assign(s,hit.hit);this.explode(s,hit.p.id);continue;}
        if(hit&&['bullet','autocannon'].includes(s.kind)){this.damage(hit.p,s.owner,s.kind==='bullet'?s.blastSpec.groundDamage:s.blastSpec.directDamage);s.hp=0;if(s.kind==='autocannon')this.effect(s,'explosion',s.owner,4,'small');continue;}
        if(['autocannon','tankCannon'].includes(s.kind)&&s.distance>=s.blastSpec.range){s.hp=0;continue;}
        if (s.y <= surface(s.x, s.z)) {
          // Find a swept terrain/building impact so fast rounds do not tunnel.
          let lo = 0, hi = 1; for (let j = 0; j < 8; j++) { const f = (lo + hi) / 2, x = prev.x + (s.x - prev.x) * f, y = prev.y + (s.y - prev.y) * f, z = prev.z + (s.z - prev.z) * f; if (y > surface(x, z)) lo = f; else hi = f; }
          s.x = prev.x + (s.x - prev.x) * hi; s.z = prev.z + (s.z - prev.z) * hi; s.y = surface(s.x, s.z);
          if (['bullet','sam','autocannon'].includes(s.kind)) { s.hp = 0; this.effect(s,s.kind==='autocannon'?'explosion':'spark',s.owner,5,'small'); } else this.explode(s);
          continue;
        }
        if (s.x < (['reconPlane','bomber'].includes(s.kind)?-800:-35) || s.x > W + (['reconPlane','bomber'].includes(s.kind)?800:35) || s.z < (['reconPlane','bomber'].includes(s.kind)?-800:-35) || s.z > H + (['reconPlane','bomber'].includes(s.kind)?800:35) || s.kind!=='artillery' && (s.y > 420 || this.t - s.born > s.ttl)) {
          s.hp = 0; if (!['bullet','artillery'].includes(s.kind)) { this.effect(s, 'spark', s.owner, 8); this.note(s.owner, '飞行器已离场或耗尽续航', 'info'); }
        }
      }
      if(this.battleMode==='dark_forest')this.updateZone(dt);
      this.removeDead(); this.updateIntel();
      if (this.battleMode==='duel' && !this.over && this.t - this.countdown >= this.limit) {
        const [a, b] = this.players; this.finish(a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1, '交火时间结束');
      }
    }
    intercept(s, prev) {
      if (!['bullet','sam','autocannon','missile','uav','artillery','bomb','tankCannon'].includes(s.kind)) return;
      for (const q of this.shots) {
        if (q.hp <= 0 || q.owner === s.owner || !['uav','missile','sam','reconPlane','bomber'].includes(q.kind)) continue;
        const radius = s.kind === 'sam' ? 12 : q.kind === 'uav' ? 5 : 3;
        const old=q.previous||q,a={x:prev.x-old.x,y:prev.y-old.y,z:prev.z-old.z},b={x:s.x-q.x,y:s.y-q.y,z:s.z-q.z};if(segmentDistance(a,b,{x:0,y:0,z:0})>radius)continue;
        const spec=s.blastSpec||WEAPONS[s.kind==='bullet'?'mg':s.kind];const damage=s.kind==='sam'?WEAPONS.sam.airDamage:(spec.airDamage||spec.directDamage);q.hp -= damage;if(['missile','uav','artillery','bomb','tankCannon'].includes(s.kind))this.explode(s,false,q.id);else s.hp=0; this.effect(q, 'spark', s.owner, s.kind === 'sam' ? 18 : 3);
        if (q.hp <= 0) {
          this.players[s.owner].stats.intercepted++; this.note(s.owner, s.kind==='sam'?'空中目标击落 · 自动拦截成功':'空中目标击落 · 弹射物命中', 'defense');
          this.note(q.owner, q.kind === 'uav' ? '无人机被击落 · 该区域存在防空火力' : '导弹被敌方拦截', 'danger');
          if (q.kind === 'uav') this.players[q.owner].intel.clues.push({ id: ++this.id, kind: 'probe', x: q.x, z: q.z, radius: 140, until: this.t + 14 });
          this.effect(q, 'explosion', q.owner, 17);
        }
        break;
      }
    }
    explode(s, direct = false, excludeAir=null) {
      if (s.hp <= 0) return; s.hp = 0;
      const spec=s.blastSpec||weaponSpec(this.players[s.owner],s.kind);let any=false;
      const directId=direct===true?this.players.find(p=>p.id!==s.owner&&p.hp>0)?.id:Number.isInteger(direct)&&direct!==false?direct:null;
      this.resolvingBlast=true;
      for(const target of this.players){if(target.id===s.owner||target.hp<=0)continue;
        const d=dist3(s,{x:target.x,y:clamp(s.y,target.y,target.y+vehicleSpec(target.vehicleId).dimensions.height),z:target.z});let amount=0,hit=target.id===directId;
        if(['missile','artillery','bomb'].includes(s.kind))amount=hit||d<=spec.directRadius?spec.directDamage:d<=spec.blastRadius?Math.round(spec.nearDamage[1]-(d-spec.directRadius)/(spec.blastRadius-spec.directRadius)*(spec.nearDamage[1]-spec.nearDamage[0])):0;
        if(s.kind==='tankCannon')amount=hit?spec.directDamage:spec.blastRadius>0&&d<=spec.blastRadius?Math.round(spec.directDamage*(1-d/spec.blastRadius)):0;
        if(s.kind==='uav')amount=hit||d<spec.blastRadius?spec.directDamage:0;
        if(amount){any=true;this.damage(target,s.owner,amount);}
      }
      this.resolvingBlast=false;if(this.battleMode==='dark_forest')this.checkSurvivor();
      const visualSize=s.kind==='bomb'||s.kind==='artillery'&&spec.directDamage>=140?'large':s.kind==='missile'||s.kind==='artillery'||s.kind==='tankCannon'&&spec.blastRadius>=15?'medium':'small';
      this.effect(s,'explosion',s.owner,s.kind==='missile'?34:s.kind==='artillery'?28:16,visualSize);
      if (s.y - terrain(s.x, s.z) < 20) this.effect({ ...s, y: terrain(s.x, s.z) + .25 }, 'crater', s.owner, s.kind === 'missile' ? 14 : 8);
      for(const q of this.shots){if(q.id===excludeAir||q.hp<=0||q.owner===s.owner||!['uav','missile','sam','reconPlane','bomber'].includes(q.kind))continue;const r=dist3(s,q);if(!(spec.blastRadius>0)||r>spec.blastRadius)continue;const hit=Math.round(spec.directDamage*(1-r/spec.blastRadius));q.hp-=hit;if(q.hp<=0){this.players[s.owner].stats.intercepted++;this.effect(q,'explosion',s.owner,12);}}
      if (!any) this.note(s.owner, s.kind === 'uav' ? '无人机坠毁 · 未命中热源' : '爆炸未命中敌方发射车', 'info');
    }
    damage(target, owner, amount) {
      if(target.hp<=0||!Number.isFinite(amount)||amount<=0)return;
      if(owner!==null&&amount<(vehicleSpec(target.vehicleId).immunity||0))return;
      const dealt = Math.min(target.hp, amount); target.hp -= dealt; if(owner!==null)this.players[owner].stats.damage += dealt;
      const oldCrew=Crew.modifiers(target.crew),injury=Crew.wound(target.crew,dealt/target.maxHp,()=>this.randomCrew());if(injury){const current=Crew.modifiers(target.crew);for(const kind of Object.keys(C)){const before=oldCrew.cooldown*(Crew.MAIN.has(kind)?oldCrew.mainCooldown:1),after=current.cooldown*(Crew.MAIN.has(kind)?current.mainCooldown:1);target.cd[kind]*=after/before;}if(target.reloadUntil>this.t)target.reloadUntil=this.t+(target.reloadUntil-this.t)*current.cooldown*current.mainCooldown/(oldCrew.cooldown*oldCrew.mainCooldown);this.note(target.id,Crew.ROLES[injury.member.role]+'阵亡'+(injury.moves.length?' · 已优先补位炮长/驾驶员':''),'crew');if(injury.destroyed)target.hp=0;}
      this.note(target.id, `发射车受损 −${dealt} HP · 注意尾迹来源`, 'hit'); if(owner!==null)this.note(owner, `命中敌方 −${dealt} HP`, 'hit-enemy');
      this.sound('impact',{...target,y:target.y+3},target.id);if(owner!==null)this.sound('confirm',target,owner);
      if(target.hp<=0){if(owner!==null&&owner!==target.id){this.players[owner].stats.kills++;this.note(owner,'击毁 '+vehicleSpec(target.vehicleId).name,'kill');this.sound('confirm',target,owner);}target.eliminatedAt=this.t;target.pilot=null;target.repairUntil=0;target.mg=false;this.eliminations.push(target.id);if(this.battleMode==='duel')this.finish(owner,'摧毁敌方发射车');else if(!this.resolvingBlast)this.checkSurvivor();}
    }
    removeDead() {
      for(const s of this.shots)if(s.hp<=0)for(const p of this.players)if(this.inReconRange(p.id,s))p.intel.air.delete(s.id);
      for (const p of this.players) if (p.pilot && !this.shots.some(s => s.id === p.pilot && s.hp > 0)) { p.pilot = null; p.drive = { throttle: 0, steer: 0 }; }
      this.shots = this.shots.filter(s => s.hp > 0);
    }
    observable(id, q) {
      const p = this.players[id], eye = { x: p.x, y: p.y + 9, z: p.z };
      if (dist(eye, q) < 640 && lineOfSight(eye, q)) return true;
      const s = this.shots.find(s => s.id === p.pilot && s.owner === id);
      return !!s && dist3(s, q) < 550 && lineOfSight(s, q);
    }
    observeShot(s) {
      for(const p of this.players){const id=p.id;if(id===s.owner||p.hp<=0||s.kind==='bullet'||s.distance<65||s.noticed&1<<id||!this.observable(id,s))continue;
        s.noticed|=1<<id;p.intel.clues.push({id:++this.id,kind:'direction',x:s.x,z:s.z,yaw:wrap(s.yaw+Math.PI),radius:500,spread:.32,until:this.t+15});if(p.intel.clues.length>5)p.intel.clues.shift();this.note(id,'发现白色尾迹 · 反向观察发射方向','warning');}
    }
    updateIntel(){for(const p of this.players){
      for(const c of p.intel.contacts.values())c.visible=false;
      for(const foe of this.players){if(foe.id===p.id||foe.hp<=0){p.intel.contacts.delete(foe.id);continue;}const visible=this.inReconRange(p.id,{...foe,y:foe.y+4});
        if(visible){if(!p.intel.contacts.has(foe.id))p.stats.detections++;p.intel.contacts.set(foe.id,{id:foe.id,x:foe.x,y:foe.y,z:foe.z,yaw:foe.yaw,vehicleId:foe.vehicleId,wheelTravel:foe.wheelTravel,trackTravel:{...foe.trackTravel},spadeDeployed:foe.spadeDeployed,selected:foe.selected,aim:copyAim(foe.aim),t:this.t,visible:true});}}
      for(const [id,c]of p.intel.contacts)if(this.t-c.t>=intelLife(p))p.intel.contacts.delete(id);
      p.intel.lock=[...p.intel.contacts.values()].sort((a,b)=>Number(b.visible)-Number(a.visible)||dist(p,a)-dist(p,b))[0]||null;
      for(const c of p.intel.air.values())c.visible=false;
      for(const s of this.shots)if(s.owner!==p.id&&s.kind!=='bullet'&&this.inReconRange(p.id,s))p.intel.air.set(s.id,{id:s.id,kind:s.kind,model:s.kind==='missile'?'tow':null,x:s.x,y:s.y,z:s.z,yaw:s.yaw,pitch:s.pitch,speed:s.speed,bombs:s.bombs,t:this.t,visible:true});
      for(const [id,c]of p.intel.air)if(this.t-c.t>=intelLife(p))p.intel.air.delete(id);
    }}
    checkSurvivor(){const alive=this.players.filter(p=>p.hp>0);if(alive.length===1)this.finish(alive[0].id,'黑暗森林 · 最后一辆载具存活');else if(!alive.length)this.finish(null,'所有载具被摧毁');}
    updateZone(dt){const elapsed=this.t-this.countdown,stage=Math.min(5,Math.floor((elapsed+1e-7)/60)),radii=[Math.hypot(W,H)/2+1,1000,750,500,250,0];this.zone={x:W/2,z:H/2,radius:radii[stage],stage,next:Math.min(300,(stage+1)*60),damage:stage===5?30:8};
      // Resolve simultaneous gas casualties as a batch. At full coverage, durability decides survival.
      const victims=this.players.filter(p=>p.hp>0&&(stage===5||dist(p,this.zone)>this.zone.radius));
      const final=stage===5&&victims.length>0&&victims.every(p=>p.hp<=this.zone.damage*dt+1e-8)?victims.reduce((a,b)=>b.hp>a.hp?b:a):null;
      for(const p of victims){if(p===final){p.hp=Math.max(.001,p.hp);continue;}const dealt=Math.min(p.hp,this.zone.damage*dt);p.hp=Math.max(0,p.hp-dealt);if(p.hp<=1e-8){p.hp=0;p.eliminatedAt=this.t;p.pilot=null;p.repairUntil=0;p.mg=false;this.eliminations.push(p.id);}}
      this.checkSurvivor();
    }
    runBots(dt){for(const p of this.players){if(p.id===0||p.hp<=0)continue;this.aiId=p.id;
      let state=this.botStates.get(p.id);if(!state){state={aiClock:0,aiScan:{x:W/2,z:H/2},aiMoveUntil:0,aiAttackAt:0,hardAI:{sample:null,velocity:{x:0,z:0},clue:0,guess:null,resume:null,scan:0,move:null,moveUntil:0,thinkAt:0,mgTrack:null}};this.botStates.set(p.id,state);}Object.assign(this,state);
      if(this.battleMode==='dark_forest'&&this.zone.radius>0&&dist(p,this.zone)>this.zone.radius-45){p.pilot=null;p.controlAt=this.t;this.driveToward(p,this.zone);}
      else if(this.evadeUAV(dt)){if(p.spadeDeployed){p.spadeDeployed=false;p.cd.artillery*=1.25;this.sound('spade',p,p.id);}}else if(this.hasWeapon(p,'autocannon')||this.hasWeapon(p,'tankCannon'))this.tankAI(dt);else if(p.vehicleId==='cougar_artillery')this.cougarAI(dt);else if(vehicleSpec(p.vehicleId).hullAim)this.kfzAI(dt);else this.updateAI(dt);
      for(const key of Object.keys(state))state[key]=this[key];
    }this.aiId=1;}
    driveToward(p,goal){if(p.spadeDeployed){p.spadeDeployed=false;p.cd.artillery*=1.25;this.sound('spade',p,p.id);}let desired=Math.atan2(goal.x-p.x,p.z-goal.z),yaw=desired,best=-Infinity;
      for(const offset of [0,.45,-.45,.9,-.9,1.5,-1.5,Math.PI]){const a=desired+offset,q={x:p.x+Math.sin(a)*14,z:p.z-Math.cos(a)*14};if(!vehicleClear(q.x,q.z,{...p,yaw:a}))continue;const score=-dist(q,goal)-Math.abs(wrap(a-p.yaw))*2;if(score>best){best=score;yaw=a;}}
      const error=wrap(yaw-p.yaw);p.drive={throttle:Math.abs(error)>1.5?.35:1,steer:clamp(error*1.8,-1,1)};
    }
    finish(winner, reason) { if (this.over) return; this.over = true; this.winner = winner; this.reason = reason; for (const p of this.players) { p.mg = false; p.drive = { throttle: 0, steer: 0 }; } }
    cougarAI(dt){const p=this.players[this.aiId||1],known=p.intel.lock&&this.t-p.intel.lock.t<intelLife(p)?p.intel.lock:null;p.controlAt=this.t;
      if(!known){if(p.spadeDeployed){p.spadeDeployed=false;p.cd.artillery*=1.25;this.sound('spade',p,p.id);}this.updateAI(dt);return;}p.pilot=null;p.mg=false;const range=dist(p,known),yaw=Math.atan2(known.x-p.x,p.z-known.z),error=wrap(yaw-p.yaw);
      if(range>950||range<450){const d=range||1,goal={x:clamp(known.x+(p.x-known.x)/d*850,30,W-30),z:clamp(known.z+(p.z-known.z)/d*850,30,H-30)};this.driveToward(p,goal);return;}
      p.drive={throttle:0,steer:0};if(Math.abs(error)>.48){if(p.spadeDeployed){p.selected='spade';this.command(p.id,{type:'fire'});}p.drive.steer=clamp(error*2,-1,1);return;}
      if(Math.abs(p.speed)>.25)return;if(!p.spadeDeployed){p.selected='spade';this.command(p.id,{type:'fire'});}p.selected='artillery';if(!p.cd.artillery)this.hardArtillery(known);
    }
    kfzAI(dt){
      const p=this.players[this.aiId||1];if(this.over||this.t<this.countdown||p.hp<=0)return;p.controlAt=this.t;p.drive={throttle:0,steer:0};
      const plane=this.shots.find(q=>q.id===p.pilot&&q.kind==='bomber'),known=p.intel.lock&&this.t-p.intel.lock.t<intelLife(p)?p.intel.lock:null;
      if(plane){if(known){plane.yaw=Math.atan2(known.x-plane.x,plane.z-known.z);plane.pitch=0;const fall=Math.sqrt(Math.max(0,plane.y-terrain(known.x,known.z))*2/9.81),impact={x:plane.x+Math.sin(plane.yaw)*plane.speed*fall,z:plane.z-Math.cos(plane.yaw)*plane.speed*fall};if(plane.bombs&&dist(impact,known)<28)this.command(this.aiId||1,{type:'bomb'});}if(!plane.bombs)this.command(this.aiId||1,{type:'vehicle'});return;}
      this.aiClock-=dt;if(this.aiClock>0)return;this.aiClock=.6;
      if(!known){if(!p.cd.reconPlane){p.selected='reconPlane';p.aim.reconPlane={yaw:this.random()*TAU,pitch:0};this.command(this.aiId||1,{type:'fire'});}return;}
      if(dist(p,known)<=weaponSpec(p,'artillery').range&&!p.cd.artillery)this.hardArtillery(known);
      else if(!p.cd.bomber){p.selected='bomber';p.aim.bomber={yaw:Math.atan2(known.x-p.x,p.z-known.z),pitch:0};this.command(this.aiId||1,{type:'fire'});}
    }
    hardTarget(lead=0) {
      const p=this.players[this.aiId||1],lock=p.intel.lock,h=this.hardAI;
      if(!lock||this.t-lock.t>=intelLife(p))return null;
      const age=this.t-lock.t,time=Math.min(5,age+lead);
      const x=clamp(lock.x+h.velocity.x*time,20,W-20),z=clamp(lock.z+h.velocity.z*time,20,H-20);
      return {x,z,y:terrain(x,z)+3,age,visible:lock.visible};
    }
    hardRelocate(awayYaw) {
      const p=this.players[this.aiId||1],h=this.hardAI;
      for(let i=0;i<12;i++){
        const yaw=awayYaw===undefined?p.yaw+(this.random()>.5?1:-1)*(.5+this.random()):awayYaw+(i%2?-.8:.8);
        const x=clamp(p.x+Math.sin(yaw)*(100+i*3),25,W-25),z=clamp(p.z-Math.cos(yaw)*(100+i*3),25,H-25);
        if(clearGround(x,z,10)){h.move={x,z};h.moveUntil=this.t+5;return;}
      }
    }
    hardDrive() {
      const p=this.players[this.aiId||1],h=this.hardAI;
      if(!h.move||this.t>=h.moveUntil||dist(p,h.move)<15){h.move=null;return false;}
      const yaw=Math.atan2(h.move.x-p.x,p.z-h.move.z),error=wrap(yaw-p.yaw);
      p.drive={throttle:Math.abs(error)>1.5?.35:.95,steer:clamp(error/.6,-1,1)};return true;
    }
    hardScanPoint() {
      const route=[[250,250],[1750,250],[1750,625],[250,625],[250,1000],[1750,1000],[1750,1375],[250,1375],[250,1750],[1750,1750]],q=route[this.hardAI.scan%route.length];
      return {x:q[0],z:q[1]};
    }
    hardArtillery(target){const p=this.players[this.aiId||1],aim=solveArtillery(p,target);if(!aim)return false;p.selected='artillery';this.setAim(p,aim);return this.command(p.id,{type:'fire'}).ok;}
    updateHardAI(dt) {
      const p=this.players[this.aiId||1],h=this.hardAI;p.controlAt=this.t;
      // Velocity and search hints come exclusively from the same expiring intel as the player.
      const lock=p.intel.lock;
      if(lock&&lock.visible&&(!h.sample||lock.t>h.sample.t)){
        if(h.sample&&lock.t-h.sample.t<.5){const dt=lock.t-h.sample.t;if(dt>0)h.velocity={x:clamp((lock.x-h.sample.x)/dt,-33,33),z:clamp((lock.z-h.sample.z)/dt,-33,33)};}
        else h.velocity={x:0,z:0};h.sample={x:lock.x,z:lock.z,t:lock.t};
      }
      const clue=p.intel.clues.at(-1);
      if(clue&&clue.id!==h.clue){h.clue=clue.id;h.guess={x:clamp(clue.x+(clue.kind==='direction'?Math.sin(clue.yaw)*600:0),70,W-70),z:clamp(clue.z-(clue.kind==='direction'?Math.cos(clue.yaw)*600:0),70,H-70),until:clue.until};}
      const known=this.hardTarget(),threat=this.samTarget(this.aiId||1,{...p,y:p.y+1.65});let pilot=this.shots.find(s=>s.id===p.pilot&&s.hp>0);
      if(pilot&&pilot.kind==='uav'&&threat){this.startOrbit(pilot);p.pilot=null;pilot=null;}
      const aimFlight=target=>{const yaw=Math.atan2(target.x-pilot.x,pilot.z-target.z),pitch=clamp(Math.atan2(target.y-pilot.y,Math.max(1,dist(pilot,target))),-1.25,1.4);pilot.yaw=wrap(pilot.yaw+clamp(wrap(yaw-pilot.yaw),-1.35*dt,1.35*dt));pilot.pitch+=clamp(pitch-pilot.pitch,-dt,dt);p.drive={throttle:0,steer:0};return Math.abs(wrap(yaw-pilot.yaw))<.04&&Math.abs(pitch-pilot.pitch)<.04;};
      if(pilot){
        if(pilot.kind==='uav'){
          if(!known&&this.t-pilot.born>39.6)h.resume={x:pilot.x,z:pilot.z,owner:pilot.id};
          if(known&&dist3(pilot,known)<180){this.startOrbit(pilot);p.pilot=null;this.aiAttackAt=this.t+.35;}
          else if(known){aimFlight({...known,y:terrain(known.x,known.z)+65});return;}
          else {
            const guessed=h.guess&&h.guess.until>this.t,resuming=!guessed&&h.resume&&h.resume.owner!==pilot.id;
            let goal=guessed?h.guess:resuming?h.resume:this.hardScanPoint();
            if(dist(pilot,goal)<85){if(resuming)h.resume=null;else{h.guess=null;h.scan++;}goal=this.hardScanPoint();}
            aimFlight({...goal,y:terrain(goal.x,goal.z)+65});return;
          }
        }else if(pilot.kind==='missile'){
          if(known)pilot.aiGoal=this.hardTarget(dist(pilot,known)/pilot.speed);
          const goal=pilot.aiGoal;
          if(goal){
            const distance=dist(pilot,goal);let waypoint=goal;
            if(distance>190){const f=Math.min(1,200/distance),x=pilot.x+(goal.x-pilot.x)*f,z=pilot.z+(goal.z-pilot.z)*f;let height=surface(pilot.x,pilot.z);for(let i=1;i<=6;i++)height=Math.max(height,surface(pilot.x+(x-pilot.x)*i/6,pilot.z+(z-pilot.z)*i/6));waypoint={x,z,y:height+55};}
            const aligned=aimFlight(waypoint);if(distance<=190&&aligned){p.pilot=null;this.hardRelocate();}else return;
          }
          else if(!threat)return;
          else p.pilot=null;
        }
      }
      p.mg=false;
      if(threat){
        if(this.hasWeapon(p,'sam')&&!p.cd.sam){p.drive={throttle:0,steer:0};p.selected='sam';if(Math.abs(p.speed)<=2)this.command(this.aiId||1,{type:'fire'});return;}
        if(!this.hasWeapon(p,'mg'))return;
        let track=h.mgTrack;
        if(!track||track.id!==threat.id)track=h.mgTrack={id:threat.id,readyAt:this.t+.35,aimAt:0,yaw:0,pitch:0};
        // A gunner reacts, periodically estimates lead, and fires real dispersed rounds.
        if(this.t>=track.aimAt){
          track.aimAt=this.t+.22;track.lead=.94+this.random()*.06;
          track.yawBias=(this.random()-.5)*.09;track.pitchBias=(this.random()-.5)*.09;
          track.sample={x:threat.x,y:threat.y,z:threat.z,vx:threat.vx,vy:threat.vy,vz:threat.vz,t:this.t};
        }
        const sample=track.sample,age=this.t-sample.t,lead=dist3({...p,y:p.y+1.65},sample)/WEAPONS.mg.speed*track.lead+age,
          goal={x:sample.x+sample.vx*lead,y:sample.y+sample.vy*lead,z:sample.z+sample.vz*lead};
        track.yaw=Math.atan2(goal.x-p.x,p.z-goal.z)+track.yawBias;
        track.pitch=clamp(Math.atan2(goal.y-p.y-1.65,Math.max(1,dist(p,goal)))+track.pitchBias,PITCH.mg[0],PITCH.mg[1]);
        p.selected='mg';p.aim.mg.yaw=wrap(p.aim.mg.yaw+clamp(wrap(track.yaw-p.aim.mg.yaw),-1.7*dt,1.7*dt));
        p.aim.mg.pitch+=clamp(track.pitch-p.aim.mg.pitch,-1.5*dt,1.5*dt);
        p.mg=this.t>=track.readyAt&&Math.abs(wrap(track.yaw-p.aim.mg.yaw))<.18;
        if(!h.move&&threat.kind==='missile')this.hardRelocate(threat.yaw+Math.PI/2);if(!this.hardDrive())p.drive={throttle:0,steer:0};return;
      }
      h.mgTrack=null;
      if(this.hardDrive())return;
      p.drive={throttle:0,steer:0};if(this.t<h.thinkAt)return;h.thinkAt=this.t+.15;
      if(known&&this.t>=this.aiAttackAt){
        if(Math.abs(p.speed)>2)return;
        if(this.hasWeapon(p,'artillery')&&!p.cd.artillery&&this.hardArtillery(known)){this.aiAttackAt=this.t+.7;this.hardRelocate();return;}
        if(this.hasWeapon(p,'missile')&&!p.cd.missile){const goal=this.hardTarget(dist(p,known)/155)||known;p.selected='missile';p.aim.missile={yaw:Math.atan2(goal.x-p.x,p.z-goal.z),pitch:dist(p,goal)>190?.3:clamp(Math.atan2(goal.y-p.y-1.65,Math.max(1,dist(p,goal))),PITCH.missile[0],PITCH.missile[1])};const r=this.command(this.aiId||1,{type:'fire'});if(r.ok){this.shots.find(s=>s.id===r.id).aiGoal={...goal};this.aiAttackAt=this.t+.7;return;}}
      }
      const scout=this.shots.find(s=>s.owner===p.id&&s.kind==='uav'&&s.hp>0);
      if(!known&&scout){if(scout.orbit)this.command(this.aiId||1,{type:'pilot',id:scout.id});return;}
      if(!known&&!scout&&!p.cd.uav&&Math.abs(p.speed)<=2){const goal=h.guess&&h.guess.until>this.t?h.guess:h.resume||this.hardScanPoint();p.selected='uav';p.aim.uav={yaw:Math.atan2(goal.x-p.x,p.z-goal.z),pitch:.32};this.command(this.aiId||1,{type:'fire'});}
    }
    defendWhileEvading(dt,threat){
      const p=this.players[this.aiId||1],h=this.hardAI;
      if(this.hasWeapon(p,'sam')&&!p.cd.sam&&Math.abs(p.speed)<=2){const drive=p.drive;p.drive={throttle:0,steer:0};p.selected='sam';this.command(this.aiId||1,{type:'fire'});p.drive=drive;return;}
      if(!this.hasWeapon(p,'mg'))return;
      if(this.difficulty==='hard'){
        let track=h.mgTrack;
        if(!track||track.id!==threat.id)track=h.mgTrack={id:threat.id,readyAt:this.t+.35,aimAt:0,yaw:0,pitch:0};
        // A gunner reacts, periodically estimates lead, and fires real dispersed rounds.
        if(this.t>=track.aimAt){
          track.aimAt=this.t+.22;track.lead=.94+this.random()*.06;
          track.yawBias=(this.random()-.5)*.09;track.pitchBias=(this.random()-.5)*.09;
          track.sample={x:threat.x,y:threat.y,z:threat.z,vx:threat.vx,vy:threat.vy,vz:threat.vz,t:this.t};
        }
        const sample=track.sample,age=this.t-sample.t,lead=dist3({...p,y:p.y+1.65},sample)/WEAPONS.mg.speed*track.lead+age,
          goal={x:sample.x+sample.vx*lead,y:sample.y+sample.vy*lead,z:sample.z+sample.vz*lead};
        track.yaw=Math.atan2(goal.x-p.x,p.z-goal.z)+track.yawBias;
        track.pitch=clamp(Math.atan2(goal.y-p.y-1.65,Math.max(1,dist(p,goal)))+track.pitchBias,PITCH.mg[0],PITCH.mg[1]);
        p.selected='mg';p.aim.mg.yaw=wrap(p.aim.mg.yaw+clamp(wrap(track.yaw-p.aim.mg.yaw),-1.7*dt,1.7*dt));
        p.aim.mg.pitch+=clamp(track.pitch-p.aim.mg.pitch,-1.5*dt,1.5*dt);
        p.mg=this.t>=track.readyAt&&Math.abs(wrap(track.yaw-p.aim.mg.yaw))<.18;
      }else{
        if(p.gunner?.id!==threat.id)p.gunner={id:threat.id,ready:this.t+.8};
        const lead=dist3({...p,y:p.y+1.65},threat)/WEAPONS.mg.speed,goal={x:threat.x+threat.vx*lead,y:threat.y+threat.vy*lead,z:threat.z+threat.vz*lead},yaw=Math.atan2(goal.x-p.x,p.z-goal.z),pitch=Math.atan2(goal.y-p.y-1.65,Math.max(1,dist(p,goal)));
        p.selected='mg';p.aim.mg.yaw=wrap(p.aim.mg.yaw+clamp(wrap(yaw-p.aim.mg.yaw),-1.1*dt,1.1*dt));p.aim.mg.pitch+=clamp(pitch-p.aim.mg.pitch,-dt,dt);p.mg=this.t>=p.gunner.ready&&Math.abs(wrap(yaw-p.aim.mg.yaw))<.1;
      }
    }
    evadeUAV(dt){
      if(!['standard','hard'].includes(this.difficulty))return false;
      const p=this.players[this.aiId||1],eye={x:p.x,y:p.y+4,z:p.z};
      // Only react to currently detected contacts. Retained or hidden aircraft cannot steer AI.
      const threats=this.shots.filter(q=>q.owner!==p.id&&q.kind==='uav'&&q.hp>0&&(this.inReconRange(p.id,q)||this.observable(p.id,q))&&dist3(q,eye)<=weaponSpec(this.players[q.owner],'uav').recon);
      if(!threats.length)return false;
      let dx=0,dz=0;for(const q of threats){const d=Math.max(1,dist(p,q));dx+=(p.x-q.x)/d;dz+=(p.z-q.z)/d;}
      const desired=Math.hypot(dx,dz)>.001?Math.atan2(dx,-dz):p.yaw;
      // Choose a clear route that maximizes separation, including map edges and city obstacles.
      let yaw=desired,best=-Infinity;
      for(const offset of [0,.4,-.4,.8,-.8,1.6,-1.6,Math.PI]){const angle=desired+offset,q={x:p.x+Math.sin(angle)*12,z:p.z-Math.cos(angle)*12};if(!vehicleClear(q.x,q.z,{...p,yaw:angle}))continue;const score=Math.min(...threats.map(t=>dist(q,t)))-Math.abs(wrap(angle-desired))*2;if(score>best){best=score;yaw=angle;}}
      if(p.pilot){const scout=this.shots.find(q=>q.id===p.pilot&&q.kind==='uav');if(scout&&!scout.orbit)this.startOrbit(scout);p.pilot=null;}
      const error=wrap(yaw-p.yaw),reverse=Math.abs(error)>Math.PI/2;
      p.controlAt=this.t;p.mg=false;const air=threats.filter(q=>dist3({...p,y:p.y+1.65},q)<=300).sort((a,b)=>dist3(p,a)-dist3(p,b))[0];if(air)this.defendWhileEvading(dt,air);p.drive={throttle:reverse?-1:1,steer:clamp(wrap(error+(reverse?Math.PI:0))*(reverse?-1:1),-1,1)};return true;
    }
    tankAI(dt){const p=this.players[this.aiId||1],gun=this.hasWeapon(p,'tankCannon')?'tankCannon':'autocannon';p.controlAt=this.t;if(p.repairUntil)return;
      if(this.hasWeapon(p,'repair')&&p.hp<60&&!p.repairUsed){p.selected='repair';this.command(p.id,{type:'fire'});return;}
      const known=p.intel.lock&&this.t-p.intel.lock.t<intelLife(p)?p.intel.lock:null;
      p.selected=gun;
      if(known){const yaw=Math.atan2(known.x-p.x,p.z-known.z),pitch=Math.atan2(known.y+1-p.y-vehicleSpec(p.vehicleId).muzzleHeight,Math.max(1,dist(p,known)));this.setAim(p,{yaw,pitch});
        if(!p.cd.observation){p.selected='observation';this.command(p.id,{type:'fire'});}
        if(this.hasWeapon(p,'highExplosive')&&!p.cd.highExplosive&&!p.heArmed){p.selected='highExplosive';this.command(p.id,{type:'fire'});}
        p.selected=gun;if(dist(p,known)> (p.vehicleId==='b_tank'?65:180))this.driveToward(p,known);else p.drive={throttle:0,steer:0};
        if(dist(p,known)<=weaponSpec(p,gun).range&&lineOfSight(muzzle(p,gun),{...known,y:known.y+1}))this.command(p.id,{type:'fire'});
      }else {const clue=p.intel.clues.at(-1);if(!p.searchGoal||dist(p,p.searchGoal)<35||this.t>p.searchUntil){p.searchGoal=clue?{x:clamp(clue.x+Math.sin(clue.yaw||0)*200,50,W-50),z:clamp(clue.z-Math.cos(clue.yaw||0)*200,50,H-50)}:{x:100+this.random()*(W-200),z:100+this.random()*(H-200)};p.searchUntil=this.t+12;}this.driveToward(p,p.searchGoal);p.aim[gun].yaw=p.yaw;
        if(!p.cd.observation){p.selected='observation';this.command(p.id,{type:'fire'});p.selected=gun;}}
    }
    updateAI(dt) {
      if(this.difficulty==='hard'){this.updateHardAI(dt);return;}
      const p = this.players[this.aiId||1]; p.controlAt = this.t; this.aiClock -= dt;
      const known = p.intel.lock && this.t - p.intel.lock.t < intelLife(p) ? p.intel.lock : null;
      const piloted = this.shots.find(s => s.id === p.pilot && s.hp > 0);
      const turnToward = (s, target, maxPitch = 1.1) => {
        const yaw = Math.atan2(target.x - s.x, s.z - target.z), pitch = clamp(Math.atan2(target.y - s.y, dist(s, target)), -1.2, maxPitch);
        s.yaw = wrap(s.yaw + clamp(wrap(yaw - s.yaw), -dt * 1.25, dt * 1.25)); s.pitch += clamp(pitch - s.pitch, -dt, dt); p.drive = { throttle: 0, steer: 0 };
      };
      if (piloted) {
        if (piloted.kind === 'uav') {
          if (known) { p.pilot = null; this.aiAttackAt = this.t + 1.1; }
          else {
            if (dist(piloted, this.aiScan) < 60 || piloted.x < 55 || piloted.x > W - 55 || piloted.z < 55 || piloted.z > H - 55) this.aiScan = { x: 90 + this.random() * (W-180), z: 90 + this.random() * (H-180) };
            turnToward(piloted, { ...this.aiScan, y: terrain(this.aiScan.x, this.aiScan.z) + 82 });
          }
        } else if (known) {
          const err = this.difficulty === 'easy' ? 15 : 5;
          turnToward(piloted, { x: known.x + Math.sin(piloted.id) * err, y: terrain(known.x, known.z) + 3, z: known.z + Math.cos(piloted.id) * err });
        }
        return;
      }
      const airThreat=this.shots.filter(s=>s.owner!==p.id&&s.hp>0&&['uav','missile','sam','reconPlane','bomber'].includes(s.kind)&&dist3({...p,y:p.y+1.65},s)<230&&this.inReconRange(this.aiId||1,s)).sort((a,b)=>(a.kind==='missile'?-1:0)-(b.kind==='missile'?-1:0))[0];
      if(airThreat&&this.hasWeapon(p,'mg')&&(!this.hasWeapon(p,'sam')||p.cd.sam>0||this.difficulty==='easy')){
        if(p.gunner?.id!==airThreat.id)p.gunner={id:airThreat.id,ready:this.t+(this.difficulty==='easy'?1.2:.8)};
        const lead=dist3({...p,y:p.y+1.65},airThreat)/WEAPONS.mg.speed,target={x:airThreat.x+airThreat.vx*lead,y:airThreat.y+airThreat.vy*lead,z:airThreat.z+airThreat.vz*lead};
        const yaw=Math.atan2(target.x-p.x,p.z-target.z),pitch=Math.atan2(target.y-p.y-1.65,Math.max(1,dist(p,target)));
        p.selected='mg';p.drive={throttle:0,steer:0};p.aim.mg.yaw=wrap(p.aim.mg.yaw+clamp(wrap(yaw-p.aim.mg.yaw),-1.1*dt,1.1*dt));p.aim.mg.pitch+=clamp(pitch-p.aim.mg.pitch,-dt,dt);
        p.mg=this.t>=p.gunner.ready&&Math.abs(wrap(yaw-p.aim.mg.yaw))<.1;return;
      }
      p.gunner=null;
      if (this.t < this.aiMoveUntil) { p.drive = { throttle: .72, steer: Math.sin(this.t) * .45 }; return; }
      p.drive = { throttle: 0, steer: 0 }; p.mg = false;
      if (this.aiClock > 0) return; this.aiClock = .4;
      if (this.samTarget(this.aiId||1,{...p,y:p.y+1.65}) && !p.cd.sam && this.difficulty !== 'easy' && this.hasWeapon(p,'sam')) {
        p.selected = 'sam'; this.command(this.aiId||1, { type:'fire' }); return;
      }
      if (known && this.t >= this.aiAttackAt) {
        const k = this.hasWeapon(p,'missile')&&!p.cd.missile ? 'missile' : this.hasWeapon(p,'artillery')&&!p.cd.artillery&&dist(p,known)<weaponSpec(p,'artillery').range ? 'artillery' : null;
        if (k) {
          const d = dist(p, known), yaw = Math.atan2(known.x - p.x, p.z - known.z);p.artilleryMode='unified';
          const q=artilleryParams(p),arg=clamp(GRAVITY*d/(q.speed*q.speed),0,1),pitch=p.artilleryMode==='curve'?(Math.PI-Math.asin(arg))*.5:Math.asin(arg)*.5;
          if(k==='artillery'){if(this.hardArtillery(known))this.aiAttackAt=this.t+5.7;return;}
          p.selected = k; p.aim[k] = { yaw: yaw + (this.random()-.5) * (this.difficulty === 'easy' ? .1 : .025), pitch: k === 'artillery' ? clamp(pitch,q.minPitch,q.maxPitch) : .15 };
          if (this.command(this.aiId||1,{type:'fire'}).ok) { this.aiAttackAt = this.t + (this.difficulty === 'easy' ? 8 : 5.7); if (k === 'artillery') this.aiMoveUntil = this.t + 1.8; } return;
        }
      }
      if (!known && !p.cd.uav && !this.shots.some(s => s.owner === p.id && s.kind === 'uav')) {
        p.selected = 'uav'; p.aim.uav = { yaw: Math.atan2(this.aiScan.x-p.x,p.z-this.aiScan.z), pitch: .38 }; this.command(this.aiId||1,{type:'fire'}); return;
      }
      if (!known && p.intel.clues.length && this.hasWeapon(p,'artillery')&&!p.cd.artillery) {
        const c = p.intel.clues[p.intel.clues.length-1], yaw = c.kind === 'direction' ? c.yaw : Math.atan2(c.x-p.x,p.z-c.z);
        p.selected = 'artillery';p.artilleryMode='unified'; p.aim.artillery = { yaw, pitch: .65 + this.random() * .35 }; this.command(this.aiId||1,{type:'fire'}); this.aiMoveUntil = this.t + 1.5;
      }
    }
    snapshot(id) {
      const p = this.players[id], lock = p.intel.lock, age = lock ? this.t - lock.t : Infinity;
      const shots = this.shots.filter(s => s.owner === id).map(s => ({
        id: s.id, kind: s.kind, model:s.kind==='missile'&&['handlv_missile','black_turtle'].includes(p.vehicleId)?'tow':null,mine: true, x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: s.pitch, speed: s.speed,
        bombs:s.bombs,hp:s.hp,remaining:s.ttl===null?null:Math.max(0,s.ttl-(this.t-s.born)),...(s.kind==='sam'?{locked:!!this.shots.find(q=>q.id===s.targetId&&q.hp>0)}:{}),...(s.kind==='uav'?{orbit:s.orbit?{x:s.orbit.x,z:s.orbit.z,radius:s.orbit.radius,altitude:s.orbit.altitude,joining:s.orbit.joining}:null}:{}),...(s.kind==='artillery'?{artilleryMode:s.artilleryMode}:{})
      }));
      for(const c of p.intel.air.values())if(this.t-c.t<intelLife(p))shots.push({id:c.id,kind:c.kind,model:c.model,mine:false,bombs:c.bombs,x:c.x,y:c.y,z:c.z,yaw:c.yaw,pitch:c.pitch,speed:c.speed,retained:!c.visible,left:Math.max(0,intelLife(p)-(this.t-c.t))});
      for(const s of this.shots)if(s.owner!==id&&s.kind!=='bullet'&&!p.intel.air.has(s.id)&&this.observable(id,s))shots.push({id:s.id,kind:s.kind,model:s.kind==='missile'?'tow':null,mine:false,visualOnly:true,bombs:s.bombs,x:s.x,y:s.y,z:s.z,yaw:s.yaw,pitch:s.pitch,speed:s.speed});
      const r=v=>Math.round(v*100)/100;
      const trails = this.trails.map(tr => ({ id: tr.id, kind: tr.kind, mine: tr.owner === id, points: tr.points.filter(q => tr.owner === id || q.d > 45 && this.observable(id, q)).map(q => ({ x:r(q.x),y:r(q.y),z:r(q.z),age:r(this.t-q.t) })) })).filter(tr => tr.points.length > 1);
      const listener=this.shots.find(s=>s.owner===id&&s.id===p.pilot)||{x:p.x,y:p.y+5,z:p.z,yaw:p.yaw};
      const sounds=this.sounds.flatMap(e=>{if(e.kind==='confirm')return e.owner===id?[{id:e.id,kind:e.kind,gain:.65,pan:0}]:[];const distance=dist3(listener,e),range=e.kind==='explosion'?650:380;if(distance>range)return [];return [{id:e.id,kind:e.kind,gain:Math.max(.03,(1-distance/range)**2),pan:clamp(Math.sin(Math.atan2(e.x-listener.x,listener.z-e.z)-listener.yaw),-1,1)}];});
      const enemies=[...p.intel.contacts.values()].map(c=>({...c,precise:true,retained:!c.visible,left:Math.max(0,intelLife(p)-(this.t-c.t))}));
      return { battleMode:this.battleMode,enemies,alive:this.players.filter(q=>q.hp>0).length,zone:this.battleMode==='dark_forest'?{...this.zone,left:Math.max(0,this.zone.next-(this.t-this.countdown))}:null,placement:p.hp>0?1:this.players.length-this.eliminations.indexOf(p.id),version: 9, roomTier:this.roomTier, field:{width:W,height:H,recon:RECON_RANGE,reconRanges:{...RECON_RANGES},intelLife:intelLife(p),mapId:this.mapId}, seed: this.seed, t: this.t, started: this.t >= this.countdown, countdown: Math.max(0,this.countdown-this.t), remaining: Math.max(0,this.limit-Math.max(0,this.t-this.countdown)),
        settled:this.over||p.hp<=0,over: this.over, outcome: (this.over||p.hp<=0) ? !this.over?'loss':this.winner === null ? 'draw' : this.winner === id ? 'win' : 'loss' : null, reason: p.hp<=0&&!this.over?'载具已被摧毁':this.reason,
        own: {spadeDeployed:p.spadeDeployed,crew:p.crew.map(m=>({...m})),crewModifiers:Crew.modifiers(p.crew),concealed:Recon.hidden(p,BUSHES,this.t),revealLeft:Math.max(0,p.revealedUntil-this.t),eliminatedAt:p.eliminatedAt,observationYaw:p.observationYaw,heArmed:p.heArmed,ammo:p.ammo,reloadLeft:Math.max(0,p.reloadUntil-this.t),repairUsed:p.repairUsed,repairLeft:Math.max(0,p.repairUntil-this.t),observationLeft:Math.max(0,p.observationUntil-this.t),vehicleId:p.vehicleId,weapons:[...p.weapons],maxHp:p.maxHp,trackTravel:{...p.trackTravel},wheelTravel:p.wheelTravel,x:p.x,y:p.y,z:p.z,yaw:p.yaw,hp:p.hp,speed:p.speed,selected:p.selected,pilot:p.pilot,artilleryMode:p.artilleryMode,aim:copyAim(p.aim),cd:{...p.cd},mg:p.mg,stats:{...p.stats} },
        enemy: age < intelLife(p) ? { vehicleId:lock.vehicleId,wheelTravel:lock.wheelTravel,trackTravel:lock.trackTravel,spadeDeployed:lock.spadeDeployed,selected:lock.selected,aim:lock.aim,x:lock.x,y:lock.y,z:lock.z,yaw:lock.yaw,precise:true,retained:!lock.visible,left:Math.max(0,intelLife(p)-age),age } : null,
        clues:p.intel.clues.map(c=>({...c,left:c.until-this.t})), shots, trails, sounds,
        effects:this.effects.filter(e=>e.owner===id || this.observable(id,e)).map(e=>({...e,age:this.t-e.born})), log:p.log.map(e=>({...e})),
        threats:shots.filter(s=>!s.mine&&!s.retained&&['missile','uav','sam','reconPlane','bomber'].includes(s.kind)&&dist3(s,{...p,y:p.y+1.65})<=RECON_RANGE).length };
    }
  }
  const api = { Engine,solveArtillery,BRANCHES,matchCandidates,artilleryRanges,MAPS,LAKE,inLake,configureMap,intelLife,WEAPONS,VEHICLES,DEFAULT_VEHICLE,vehicleSpec,weaponSpec,W,H,RECON_RANGE,RECON_RANGES,reconRange,INTEL_LIFE,C,PITCH,DEFAULT_PITCH,GRAVITY,ARTILLERY_RANGE,SHELL_SPEED,TRAIL_LIFE,ORBIT_RADIUS,ARTILLERY,artilleryParams,BUILDINGS,TREES,TREE_CELLS,BUSHES,Crew,Motion,Recon,buildingBlocks,treeHit,clearGround,vehicleClear,vehicleHit,clamp,wrap,dist,dist3,direction,terrain,surface,muzzle,ballistic,lineOfSight,segmentDistance };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; root.Blindfire = api;
})(typeof window !== 'undefined' ? window : globalThis);
