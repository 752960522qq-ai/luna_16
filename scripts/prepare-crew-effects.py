"""Adapt the supplied voice, Flame03 and Explosion02 archives for offline playback."""
from pathlib import Path
import zipfile,sys,json,hashlib,io
from PIL import Image
root=Path(__file__).resolve().parents[1]/'app/src/main/assets';source=Path(sys.argv[1])
archives=sorted(source.glob('Battle_Voice*.zip'))
if len(archives)!=1:raise ValueError('Supply exactly one current radio voice archive')
for old in (root/'audio/crew').glob('*.mp3'):old.unlink()
with zipfile.ZipFile(archives[0]) as z:
 clips=[]
 for name in z.namelist():
  if name.endswith('Voice_Clip_Index.csv'):(root/'audio/crew/Voice_Clip_Index.csv').write_bytes(b''.join(line for line in z.read(name).splitlines(keepends=True) if b'Rapid_Fire_Urgent' not in line and b'Reload_Now_Urgent' not in line))
 for name in z.namelist():
  if not name.endswith('.mp3') or Path(name).stem in ['Rapid_Fire_Urgent','Reload_Now_Urgent']:continue
  out=root/'audio/crew'/Path(name).name;out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(z.read(name));clips.append(out.stem)
(root/'audio/crew-bank.js').write_text('export const CREW_CLIPS = '+json.dumps(clips)+';\n')
# The large effect retains its battlefield size/lifetime, replacing only its artwork.
for key,prefix in [('large','Explosion02'),('missile-flame','Flame03')]:
 archive=next(source.glob(prefix+'*.zip'))
 with zipfile.ZipFile(archive) as z:
  names=sorted(n for n in z.namelist() if n.endswith('.tga'));indices=[round(i*(len(names)-1)/47) for i in range(48)]
  atlas=Image.new('RGBA',(1568,1176));additive=Image.open(io.BytesIO(z.read(names[0]))).mode=='RGB'
  for i,k in enumerate(indices):
   im=Image.open(io.BytesIO(z.read(names[k]))).convert('RGBA').resize((192,192),Image.Resampling.LANCZOS);x=i%8*196+2;y=i//8*196+2;atlas.paste(im,(x,y))
   atlas.paste(im.crop((0,0,1,192)).resize((2,192)),(x-2,y));atlas.paste(im.crop((191,0,192,192)).resize((2,192)),(x+192,y));atlas.paste(im.crop((0,0,192,1)).resize((192,2)),(x,y-2));atlas.paste(im.crop((0,191,192,192)).resize((192,2)),(x,y+192))
  out=root/'effects'/f'{key}.webp';atlas.save(out,'WEBP',quality=85,method=6,exact=True)
 spec=dict(path=f'effects/{key}.webp',frames=48,columns=8,rows=6,tile=196,padding=2,content=192,additive=additive,sourceArchive=archive.name,sourceFrames=len(names),sourceIndices=indices,sourceSha256=hashlib.sha256(archive.read_bytes()).hexdigest(),sha256=hashlib.sha256(out.read_bytes()).hexdigest())
 if key=='large':
  path=root/'effects/sequences.js';text=path.read_text();data=json.loads(text[text.index('{'):text.rindex('}')+1]);spec.update(duration=data[key]['duration'],diameter=data[key]['diameter']);data[key]=spec;path.write_text('export const EXPLOSION_SEQUENCES = '+json.dumps(data,indent=2)+';\n')
 else:(root/'effects/flame-sequence.js').write_text('export const FLAME_SEQUENCE = '+json.dumps(spec)+';\n')
 print(key,out.stat().st_size,'bytes',additive)
