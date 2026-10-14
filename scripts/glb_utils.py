import json,struct,numpy as np,itertools
from pathlib import Path
def load(path):
 b=Path(path).read_bytes();n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);return d,b[28+n:]
def mats(d):
 out={}
 def walk(i,m):
  n=d['nodes'][i];a=np.array(n.get('matrix',np.eye(4).flatten(order='F'))).reshape(4,4,order='F')
  if 'matrix' not in n:
   x,y,z,w=n.get('rotation',[0,0,0,1]);a[:3,:3]=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])@np.diag(n.get('scale',[1,1,1]));a[:3,3]=n.get('translation',[0,0,0])
  out[i]=m@a
  for k in n.get('children',[]):walk(k,out[i])
 for i in d['scenes'][0]['nodes']:walk(i,np.eye(4))
 return out
def boxes(d):
 m=mats(d);o=[]
 for i,n in enumerate(d['nodes']):
  if 'mesh' not in n:continue
  q=[]
  for p in d['meshes'][n['mesh']]['primitives']:
   a=d['accessors'][p['attributes']['POSITION']];v=np.array([list(v)+[1] for v in itertools.product(*zip(a['min'],a['max']))])@m[i].T;q.extend(v[:,:3])
  q=np.array(q);o.append((i,n['name'],q.min(0),q.max(0)))
 return o
