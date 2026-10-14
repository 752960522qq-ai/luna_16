"""Extract reusable vegetation and three independent rocks; retain UVs/materials."""
import copy,json,struct,sys,io
from PIL import Image
from pathlib import Path
import numpy as np
from glb_utils import load,mats
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'app/src/main/assets/models/hills';OUT.mkdir(parents=True,exist_ok=True)
def extract(src,root,name,height=None):
 d,b=load(src);world=mats(d);ids=[]
 def walk(i):
  if 'mesh'in d['nodes'][i]:ids.append(i)
  for c in d['nodes'][i].get('children',[]):walk(c)
 walk(root);meshes=copy.deepcopy([d['meshes'][d['nodes'][i]['mesh']] for i in ids]);mids=sorted({p['material']for m in meshes for p in m['primitives']});materials=copy.deepcopy([d['materials'][i]for i in mids]);mm={m:i for i,m in enumerate(mids)}
 for mesh in meshes:
  for p in mesh['primitives']:p['material']=mm[p['material']]
 tids=set()
 def texrefs(v,remap=None):
  if isinstance(v,dict):
   for k,x in v.items():
    if 'texture'in k.lower()and isinstance(x,dict)and 'index'in x:
     if remap is None:tids.add(x['index'])
     else:x['index']=remap[x['index']]
    else:texrefs(x,remap)
  elif isinstance(v,list):
   for x in v:texrefs(x,remap)
 texrefs(materials);tids=sorted(tids);tm={t:i for i,t in enumerate(tids)};texrefs(materials,tm);textures=copy.deepcopy([d['textures'][i]for i in tids]);imgs=sorted({t['source']for t in textures});im={a:i for i,a in enumerate(imgs)}
 for t in textures:t['source']=im[t['source']]
 aids=sorted({a for m in meshes for p in m['primitives'] for a in [*p['attributes'].values(),*([p['indices']]if'indices'in p else[])]});am={a:i for i,a in enumerate(aids)};acc=copy.deepcopy([d['accessors'][a]for a in aids]);vds=sorted({a['bufferView']for a in acc});images=copy.deepcopy([d['images'][i]for i in imgs]);vds=sorted(set(vds+[i['bufferView']for i in images]));vm={v:i for i,v in enumerate(vds)};views=copy.deepcopy([d['bufferViews'][v]for v in vds]);blob=bytearray()
 image_views={i['bufferView']:i for i in images}
 for old,v in zip(vds,views):
  c=b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
  if old in image_views:
   image=Image.open(io.BytesIO(c));image.thumbnail((1024,1024));o=io.BytesIO();image.save(o,format='WEBP',quality=88);c=o.getvalue();image_views[old]['mimeType']='image/webp';v['byteLength']=len(c)
  blob.extend(b'\0'*(-len(blob)%4));v['byteOffset']=len(blob);v['buffer']=0;blob.extend(c)
 for a in acc:a['bufferView']=vm[a['bufferView']]
 for i in images:i['bufferView']=vm[i['bufferView']]
 # Original files share large bufferViews across the entire scene: keep each accessor's bytes only.
 compact=bytearray();newviews=[]
 for a in acc:
  v=views[a['bufferView']];components={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];size={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}[a['componentType']]*components;stride=v.get('byteStride',size);offset=v['byteOffset']+a.get('byteOffset',0)
  raw=b''.join(blob[offset+i*stride:offset+i*stride+size]for i in range(a['count']));compact.extend(b'\0'*(-len(compact)%4));a['bufferView']=len(newviews);a.pop('byteOffset',None);newviews.append({'buffer':0,'byteOffset':len(compact),'byteLength':len(raw)});compact.extend(raw)
 for image in images:
  v=views[image['bufferView']];raw=blob[v['byteOffset']:v['byteOffset']+v['byteLength']];compact.extend(b'\0'*(-len(compact)%4));image['bufferView']=len(newviews);newviews.append({'buffer':0,'byteOffset':len(compact),'byteLength':len(raw)});compact.extend(raw)
 views=newviews;blob=compact
 pts=[];bark=[]
 for i,m in zip(ids,meshes):
  for p in m['primitives']:
   for k,a in p['attributes'].items():p['attributes'][k]=am[a]
   if 'indices'in p:p['indices']=am[p['indices']]
   a=acc[p['attributes']['POSITION']];v=views[a['bufferView']];pos=np.ndarray((a['count'],3),'<f4',blob,offset=v['byteOffset']+a.get('byteOffset',0),strides=(v.get('byteStride',12),4));positions=(np.c_[pos,np.ones(len(pos))]@world[i].T)[:,:3];pts.extend(positions)
   if materials[p['material']].get('name')=='Bark':bark.extend(positions)
 lo=np.min(pts,0);hi=np.max(pts,0);center=(lo+hi)/2;center[1]=lo[1];scale=height/(hi[1]-lo[1])if height else 1;N=np.eye(4);N[:3,:3]*=scale;N[:3,3]=-center*scale
 nodes=[{'name':name+str(k),'mesh':k,'matrix':(N@world[i]).flatten(order='F').tolist()}for k,i in enumerate(ids)];res={k:copy.deepcopy(d[k])for k in ['asset','materials','textures','samplers','extensionsUsed','extensionsRequired']if k in d}
 for t in textures:t['extensions']={'EXT_texture_webp':{'source':t.pop('source')}}
 res['extensionsUsed']=list(set(res.get('extensionsUsed',[])+['EXT_texture_webp']));res['extensionsRequired']=list(set(res.get('extensionsRequired',[])+['EXT_texture_webp']))
 res.update(materials=materials,textures=textures,nodes=nodes,meshes=meshes,accessors=acc,bufferViews=views,images=images,buffers=[{'byteLength':len(blob)}],scenes=[{'nodes':list(range(len(nodes)))}],scene=0);j=json.dumps(res,separators=(',',':')).encode();j+=b' '*(-len(j)%4);blob.extend(b'\0'*(-len(blob)%4));body=struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(blob),0x004e4942)+blob;(OUT/(name+'.glb')).write_bytes(struct.pack('<III',0x46546c67,2,len(body)+12)+body)
 normalized=(np.array(bark or pts)-center)*scale; low=normalized[normalized[:,1]<1.5]; base=(low.min(0)+low.max(0))/2 if len(low) else np.zeros(3);radius=float(np.max(np.linalg.norm((low-base)[:,[0,2]],axis=1))) if len(low) else .65
 return {'trunkRadius':radius,'trunkOffset':[float(base[0]),float(base[2])],'width':float((hi[0]-lo[0])*scale),'height':float((hi[1]-lo[1])*scale),'length':float((hi[2]-lo[2])*scale)}
if __name__=='__main__':
 src=Path(sys.argv[1]);data={'tree':extract(src/'low_poly_tree_scene_free.glb',5339,'tree',16),'grass':extract(src/'low_poly_tree_scene_free.glb',7,'grass',1.5),'rocks':[extract(src/'river_rock.glb',i,'rock-'+str(k))for k,i in enumerate([3,5,7])]};(OUT.parent.parent/'hills-model-data.js').write_text('(function(r){const d='+json.dumps(data,separators=(',',':'))+';r.BlindfireHillsModel=d;if(typeof module!=="undefined"&&module.exports)module.exports=d;})(globalThis);');print(data)
