"""Normalize supplied models into meters, -Z forward; replace JU87 tail paint."""
import json,struct,io,itertools
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
def prepare(src,dst,length,width=None,height=None,air=False,red=False):
 raw=src.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);binary=raw[28+n:]
 if air:doc['nodes'][0]['matrix']=[1,0,0,0,0,0,-1,0,0,1,0,0,0,0,0,1]
 boxes=[]
 def walk(i,m):
  node=doc['nodes'][i];m=m@np.array(node.get('matrix',np.eye(4).flatten(order='F'))).reshape(4,4,order='F')
  if 'mesh'in node:
   for pr in doc['meshes'][node['mesh']]['primitives']:
    a=doc['accessors'][pr['attributes']['POSITION']];q=np.array([list(v)+[1]for v in itertools.product(*zip(a['min'],a['max']))])@m.T;boxes.append(q[:,:3])
  for k in node.get('children',[]):walk(k,m)
 for i in doc['scenes'][0]['nodes']:walk(i,np.eye(4))
 lo=np.min(np.vstack(boxes),0);hi=np.max(np.vstack(boxes),0);size=hi-lo;scale=np.array([width/size[0] if width else length/size[2],height/size[1] if height else length/size[2],length/size[2]])
 rotation=np.diag([1,1,1])if air else np.diag([-1,1,-1]);center=(lo+hi)/2;center[1]=lo[1]if not air else center[1]
 matrix=np.eye(4);matrix[:3,:3]=np.diag(scale)@rotation;matrix[:3,3]=-matrix[:3,:3]@center
 index=len(doc['nodes']);doc['nodes'].append({'name':'MeterScaleForwardMinusZ','matrix':matrix.flatten(order='F').tolist(),'children':doc['scenes'][0]['nodes']});doc['scenes'][0]['nodes']=[index]
 for material in doc.get('materials',[]):
  legacy=material.get('extensions',{}).pop('KHR_materials_pbrSpecularGlossiness',None)
  if legacy:
   material['pbrMetallicRoughness']={'baseColorFactor':legacy.get('diffuseFactor',[1,1,1,1]),'metallicFactor':0,'roughnessFactor':1-legacy.get('glossinessFactor',0)}
   if 'diffuseTexture'in legacy:material['pbrMetallicRoughness']['baseColorTexture']=legacy['diffuseTexture']
 for key in ['extensionsUsed','extensionsRequired']:
  if key in doc:doc[key]=[e for e in doc[key]if e!='KHR_materials_pbrSpecularGlossiness']
 if red:
  texture_ids={i for i,t in enumerate(doc.get('textures',[]))if t.get('source')in[3,4]};painted=[]
  for i,m in enumerate(doc['materials']):
   if m.get('pbrMetallicRoughness',{}).get('baseColorTexture',{}).get('index')in texture_ids:
    m.clear();m.update({'name':'SolidRedTailPaint','doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[1,0,0,1],'metallicFactor':.15,'roughnessFactor':.8}});painted.append(i)
  image_views={doc['images'][i]['bufferView']for i in[3,4]};out=io.BytesIO();Image.new('RGB',(32,32),(255,0,0)).save(out,format='PNG');redbytes=out.getvalue();chunks=bytearray()
  for i,v in enumerate(doc['bufferViews']):
   a=v.get('byteOffset',0);chunk=redbytes if i in image_views else binary[a:a+v['byteLength']];chunks.extend(b'\0'*((-len(chunks))%4));v['byteOffset']=len(chunks);v['byteLength']=len(chunk);chunks.extend(chunk)
  binary=bytes(chunks);doc['extras']={'tailPaint':'Opaque solid red tail materials; original marked texture bytes removed','paintedMaterialIds':painted};assert painted
 doc['buffers'][0]['byteLength']=len(binary);j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4);binary+=b'\0'*((-len(binary))%4);body=struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary
 dst.write_bytes(struct.pack('<III',0x46546c67,2,12+len(body))+body);print(dst.name,'meter dimensions',size*scale,'red tail',red)
if __name__=='__main__':
 import argparse
 a=argparse.ArgumentParser();a.add_argument('source_dir',type=Path);a.add_argument('--gltf-transform',type=Path);args=a.parse_args();out=ROOT/'app/src/main/assets/models'
 prepare(args.source_dir/'s.i.g_331_sdkfz_1381_ausf.h_grille.glb',out/'kfz_grille.glb',4.84,2.16,2.40)
 prepare(args.source_dir/'fi156.glb',out/'fi156.glb',9,air=True)
 prepare(args.source_dir/'ju87.glb',out/'ju87_redtail.glb',11,air=True,red=True)

 if args.gltf_transform:
  import subprocess
  raw=out/'kfz_grille.glb';compressed=out/'kfz_grille.compressed.glb'
  subprocess.run([str(args.gltf_transform),'optimize',str(raw),str(compressed),'--compress','meshopt','--flatten','false','--join','false','--instance','false','--palette','false','--simplify','false','--texture-compress','false','--resample','false'],check=True)
  assert compressed.stat().st_size<5000000,'KFZ model must stay below 5 MB'
  compressed.replace(raw)
