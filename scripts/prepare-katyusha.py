import json,struct,copy,io,math,itertools
from pathlib import Path
import numpy as np
from PIL import Image
from glb_utils import load,mats
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'app/src/main/assets/models'
def bounds(d,b,n,m):
 pts=[]
 for p in d['meshes'][n['mesh']]['primitives']:
  a=d['accessors'][p['attributes']['POSITION']];v=d['bufferViews'][a['bufferView']];pos=np.ndarray((a['count'],3),dtype='<f4',buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',12),4));pts.extend((np.c_[pos,np.ones(len(pos))]@m.T)[:,:3])
 return np.min(pts,0),np.max(pts,0)
def write(d,b,dest):
 chunks=bytearray();images={x['bufferView']:i for i,x in enumerate(d.get('images',[]))if 'bufferView'in x}
 for i,v in enumerate(d['bufferViews']):
  c=b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
  if i in images:
   im=Image.open(io.BytesIO(c));im.thumbnail((1024,1024));o=io.BytesIO();im.save(o,format='WEBP',quality=90);c=o.getvalue();d['images'][images[i]]['mimeType']='image/webp'
  chunks.extend(b'\0'*(-len(chunks)%4));v['byteOffset']=len(chunks);v['byteLength']=len(c);chunks.extend(c)
 for t in d.get('textures',[]):
  if 'source'in t:t.setdefault('extensions',{})['EXT_texture_webp']={'source':t.pop('source')}
 for k in ['extensionsUsed','extensionsRequired']:d[k]=list(set(d.get(k,[])+['EXT_texture_webp']))
 d['buffers'][0]['byteLength']=len(chunks);j=json.dumps(d,separators=(',',':')).encode();j+=b' '*(-len(j)%4);chunks.extend(b'\0'*(-len(chunks)%4));body=struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(chunks),0x004e4942)+chunks;dest.write_bytes(struct.pack('<III',0x46546c67,2,12+len(body))+body)
def prepare(src,name,dim,air=False):
 d,b=load(src);ms=mats(d);es=[(n,ms[i])for i,n in enumerate(d['nodes'])if 'mesh'in n];rot=np.eye(4)
 if air:
  bs=[bounds(d,b,n,m)for n,m in es];c=(np.min([q[0]for q in bs],0)+np.max([q[1]for q in bs],0))/2;n,m=next(e for e in es if e[0]['name']=='Circle10-FACES');lo,hi=bounds(d,b,n,m);p=(lo+hi)/2-c;y=math.atan2(p[0],-p[2]);rot[:3,:3]=[[math.cos(y),0,math.sin(y)],[0,1,0],[-math.sin(y),0,math.cos(y)]]
 bs=[bounds(d,b,n,rot@m)for n,m in es];lo=np.min([q[0]for q in bs],0);hi=np.max([q[1]for q in bs],0);c=(lo+hi)/2
 if not air:c[1]=lo[1]
 N=np.eye(4);N[:3,:3]=np.diag(np.array(dim)/(hi-lo));N[:3,3]=-N[:3,:3]@c
 d['nodes']=[{'name':n['name'],'mesh':n['mesh'],'matrix':(N@rot@m).flatten(order='F').tolist()}for n,m in es];d['scenes']=[{'nodes':list(range(len(es)))}];d['scene']=0;write(copy.deepcopy(d),b,OUT/(name+'.glb'));return d,b
if __name__=='__main__':
 import argparse
 a=argparse.ArgumentParser();a.add_argument('source',type=Path);src=a.parse_args().source
 d,b=prepare(src/'bm13_katyusha_16_rockets_v2(1).glb','katyusha',[2.3,2.8,6.7]);ns=d['nodes'];M=lambda n:np.array(n['matrix']).reshape(4,4,order='F');rocket=next(n for n in ns if n['name']=='M13_rail_1_lower');rm=M(rocket);rest=math.atan2(-rm[1,2],rm[2,2]);rack=next(n for n in ns if n['name']=='gun_0_gun_0_0');lo,hi=bounds(d,b,rack,M(rack));pivot=((lo+hi)/2).tolist();slots=[]
 for n in ns:
  if n['name'].startswith('M13_rail_'):
   ac=d['accessors'][d['meshes'][n['mesh']]['primitives'][0]['attributes']['POSITION']];v=np.array([(ac['min'][0]+ac['max'][0])/2,(ac['min'][1]+ac['max'][1])/2,ac['min'][2],1]);slots.append((M(n)@v)[:3].tolist())
 rd=copy.deepcopy(d);mesh=rd['meshes'][rocket['mesh']];aids=sorted({i for pr in mesh['primitives']for i in [*pr['attributes'].values(),pr['indices']]});am={v:i for i,v in enumerate(aids)}
 for pr in mesh['primitives']:pr['attributes']={k:am[v]for k,v in pr['attributes'].items()};pr['indices']=am[pr['indices']];pr['material']=0
 rd['accessors']=[rd['accessors'][i]for i in aids];vids=sorted({a['bufferView']for a in rd['accessors']});vm={v:i for i,v in enumerate(vids)}
 for a in rd['accessors']:a['bufferView']=vm[a['bufferView']]
 rd['bufferViews']=[rd['bufferViews'][i]for i in vids];rd['meshes']=[mesh];rd['materials']=[{'name':'MilitaryGreenRocket','pbrMetallicRoughness':{'baseColorFactor':[.24,.3,.18,1],'roughnessFactor':.7,'metallicFactor':.15}}];rd['images']=[];rd['textures']=[];rd['samplers']=[];ac=d['accessors'][d['meshes'][rocket['mesh']]['primitives'][0]['attributes']['POSITION']];center=(np.array(ac['min'])+np.array(ac['max']))/2;rm[:3,3]=-rm[:3,:3]@center;R=np.eye(4);R[:3,:3]=[[1,0,0],[0,math.cos(-rest),-math.sin(-rest)],[0,math.sin(-rest),math.cos(-rest)]];rd['nodes']=[{'name':'M13FlyingRocket','mesh':0,'matrix':(R@rm).flatten(order='F').tolist()}];rd['scenes']=[{'nodes':[0]}];write(rd,b,OUT/'m13_rocket.glb')
 ch=next(n for n in ns if n['name']=='chassis_1_chassis_1_0');lo,hi=bounds(d,b,ch,M(ch));contact=[float(lo[1]),float(max(abs(lo[0]),abs(hi[0]))),float(lo[2]),float(hi[2])];pd,pb=prepare(src/'po2.glb','po2',[11.4,2.9,8.1],True);p=next(n for n in pd['nodes']if n['name']=='Circle10-FACES');lo,hi=bounds(pd,pb,p,M(p));data={'pivot':pivot,'restPitch':rest,'slots':slots,'contact':contact,'propeller':((lo+hi)/2).tolist()};(OUT.parent/'katyusha-model-data.js').write_text('(function(r){const d='+json.dumps(data,separators=(',',':'))+';r.BlindfireKatyushaModel=d;if(typeof module!=="undefined"&&module.exports)module.exports=d;})(globalThis);');print('Models prepared')
