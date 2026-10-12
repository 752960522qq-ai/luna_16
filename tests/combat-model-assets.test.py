import json,struct
from pathlib import Path
base=Path('app/src/main/assets/models')
def load(name):
 b=(base/name).read_bytes();assert b[:4]==b'glTF';assert struct.unpack_from('<I',b,8)[0]==len(b);n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);assert all('uri' not in x for x in j.get('buffers',[]));assert all('uri' not in x for x in j.get('images',[]));return j
j=load('panzer_ii.glb');assert not any(n.get('mesh') is not None and (n['name'].startswith('Cupula_Cupula') or n['name'].startswith('Support Cupula')) for n in j['nodes'])
for m in j['materials']:
 if m.get('name') in ['Torreta','Turret_Armor']:assert 'baseColorTexture' not in m['pbrMetallicRoughness'];assert m['extras']['repainted']=='neutral-grey-no-emblem'
j=load('tow_missile.glb');assert {n['name']for n in j['nodes']if 'mesh'in n}=={'Object_3','Object_5','Object_8','Object_10','Object_12','Object_13'};assert j['scenes'][0]['extras']['length']==1.17;assert (base/'tow_missile.glb').stat().st_size<100000
j=load('uav.glb');assert any(n.get('name')=='UAV_Propeller' for n in j['nodes']);assert j['scenes'][0]['extras']['span']==2;assert (base/'uav.glb').stat().st_size<1000000
print('PASS grey turret without duplicate cylinders/emblem textures, standalone supplied TOW, compressed supplied UAV/propeller; all assets embedded')
