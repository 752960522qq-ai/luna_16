// Fixed wear floats; paint stays legible until the final >95% wear interval.
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function wearVisual(percent){const w=Math.max(0,Math.min(99.99,Number(percent)||0))/100,late=smooth(.95,.9999,w);return{w,late,fade:1-.16*w-.3*late,saturation:1-.35*w-.4*late,roughness:.38+.61*Math.sqrt(w),dent:.003*w+.22*w*w,crackOpacity:Math.pow(w,.8)*.98,minorScale:Math.max(.08,1-w*.92),majorScale:Math.max(.42,1-w*.58),paintThreshold:1-w*.55-late*.4,paintHoleStrength:.58+late*.40};}
export function paintWearAlpha(field,percent){const v=wearVisual(percent),erosion=smooth(v.paintThreshold-.03,v.paintThreshold+.03,field)*smooth(0,.02,v.w);return(1-erosion*v.paintHoleStrength)*v.fade;}
export function applyPaintWear(material,percent,seed=17){const v=wearVisual(percent);material.userData.wearPct=percent;material.onBeforeCompile=shader=>{shader.uniforms.cosmeticWear={value:v.w};shader.uniforms.cosmeticSeed={value:(seed>>>0)%8191};shader.fragmentShader='uniform float cosmeticWear;\nuniform float cosmeticSeed;\nfloat cosmeticHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+cosmeticSeed)*43758.5453);}\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
#ifdef USE_MAP
 vec2 cUV=vMapUv;
 float grain=cosmeticHash(floor(cUV*220.0));
 float scrape=cosmeticHash(vec2(floor(cUV.x*60.0),floor(cUV.y*900.0)));
 float rim=max(abs(cUV.x-.5),abs(cUV.y-.5))*2.0;
 float damageField=grain*.55+scrape*.25+rim*.2;
 float late=smoothstep(.95,.9999,cosmeticWear);
 float threshold=1.0-cosmeticWear*.55-late*.4;
 float erosion=smoothstep(threshold-.03,threshold+.03,damageField)*smoothstep(0.0,.02,cosmeticWear);
 diffuseColor.a*=(1.0-erosion*(.58+late*.4))*(1.0-cosmeticWear*.16-late*.3);
 float gray=dot(diffuseColor.rgb,vec3(.299,.587,.114));
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(gray),cosmeticWear*.35+late*.4);
#endif`);};material.customProgramCacheKey=()=> 'cosmetic-readable-wear-v2';}
function charmSurfaceWear(material,w,seed){material.onBeforeCompile=shader=>{shader.uniforms.charmWear={value:w};shader.uniforms.charmSeed={value:(seed>>>0)%8191};shader.fragmentShader='uniform float charmWear;\nuniform float charmSeed;\nfloat charmHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+charmSeed)*43758.5453);}\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
#ifdef USE_MAP
 float grain=charmHash(floor(vMapUv*85.0));
 float chips=smoothstep(1.0-charmWear*.8,1.04-charmWear*.8,grain)*smoothstep(0.0,.08,charmWear);
 float line=abs(fract((vMapUv.x+vMapUv.y*.35)*22.0+charmSeed*.013)-.5);
 float scratch=(1.0-smoothstep(.008,.025+charmWear*.045,line))*charmWear;
 vec3 exposed=mix(vec3(.12,.085,.055),vec3(.62,.57,.44),step(.7,grain));
 diffuseColor.rgb=mix(diffuseColor.rgb,exposed,chips*.85);
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.09,.07,.055),scratch*.8);
#endif`);};material.customProgramCacheKey=()=> 'charm-visible-wear-v2';}
export function applyCharmWear(node,percent,seed=17){const v=wearVisual(percent);node.userData.wearPct=percent;node.traverse(o=>{if(!o.isMesh)return;o.geometry=o.geometry.clone();o.material=o.material.clone();const m=o.material;
 if(o.name.startsWith('damage-')){o.visible=v.w>0;m.transparent=true;m.opacity=v.crackOpacity;m.depthWrite=false;}
 else{m.color.lerp({r:.24,g:.19,b:.13},v.w*.7);m.roughness=v.roughness;if(typeof m.metalness==='number')m.metalness*=1-v.w*.7;charmSurfaceWear(m,v.w,seed);if(o.name.startsWith('minor-'))o.scale.multiplyScalar(v.minorScale);else if(o.name.startsWith('major-'))o.scale.multiplyScalar(v.majorScale);
  const g=o.geometry,p=g.attributes.position;g.computeBoundingBox();const box=g.boundingBox,axis=[.8,.4,.6],dot=(x,y,z)=>x*axis[0]+y*axis[1]+z*axis[2],low=dot(box.min.x,box.min.y,box.min.z),high=dot(box.max.x,box.max.y,box.max.z),part=o.name.startsWith('minor-')?.65:o.name.startsWith('major-')?.25:.08,cut=high-(high-low)*Math.max(0,(v.w-.25)/.75)*part;
  if(v.w>.25){const index=g.index,kept=[];for(let j=0;j<(index?index.count:p.count);j+=3){const ids=[0,1,2].map(k=>index?index.getX(j+k):j+k),centroid=ids.reduce((sum,i)=>sum+dot(p.getX(i),p.getY(i),p.getZ(i)),0)/3;if(centroid<=cut)kept.push(...ids);}g.setIndex(kept);}
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),noise=Math.sin(x*73.3+y*39.7+z*113.1+(seed%8191))*.5+.5,d=1-v.dent*noise;p.setXYZ(i,x*d,y*(1-v.dent*.45*noise),z*d);}p.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();}
 });}
