"""Slice acquired library sounds into normalized mono event clips and seamless loops."""
from pathlib import Path
import subprocess,json,hashlib
src=Path(__file__).resolve().parents[2]/'audio-sources';out=Path(__file__).resolve().parents[1]/'app/src/main/assets/audio';out.mkdir(exist_ok=True)
clips={
'engine-humvee':('humvee.mp3',32,4,True), 'engine-light':('light.mp3',3,3,True),'engine-heavy':('tankreal.mp3',.15,4,True),'engine-ww2':('tank.wav',0,3.8,True),
'drone-loop':('drone.mp3',0,6,True),'missile':('rocket.wav',.3,1.1,False),'sam':('rocket.wav',.3,.65,False),'artillery':('cannon.ogg',0,1.7,False),'tankCannon':('cannon.ogg',0,1.4,False),'autocannon':('mg.mp3',.04,.25,False),'mg':('mg.mp3',.04,.18,False),'reload':('reload/gun_reload.1.ogg',0,.85,False),'impact':('reload/gun_reload.2.ogg',0,.22,False),'explosion':('explosion.wav',0,1.36,False),'uav':('drone.mp3',0,.75,False)}
sources={
'humvee.mp3':('Humvee - Truck Driving Inside Convoy Assault Ops','qubodup','https://freesound.org/people/qubodup/sounds/160357/','CC0-1.0'),
'light.mp3':('Engine sounds(2)','pauliuw','https://opengameart.org/content/engine-sounds2','CC0-1.0'),
'tankreal.mp3':('Tank Engine Loop.flac','qubodup','https://freesound.org/people/qubodup/sounds/200303/','CC-BY-4.0'),
'tank.wav':('Engine-loop heavy vehicle/tank','Lucas Del Piero (Nayckron)','https://opengameart.org/content/engine-loop-heavy-vehicletank','CC-BY-3.0'),
'drone.mp3':('Big Slow Heavy Drone Hovering Idle Loop','qubodup; original recording Sadiquecat','https://freesound.org/people/qubodup/sounds/854382/','CC0-1.0'),
'explosion.wav':('Mechanical Explosion','Spring Spring','https://opengameart.org/content/mechanical-explosion','CC0-1.0'),
'rocket.wav':('Rocket Engine','theminesareshakin','https://opengameart.org/content/rocket-engine','CC0-1.0'),
'cannon.ogg':('Cannon fire','Thimras','https://opengameart.org/content/cannon-fire','CC0-1.0'),
'mg.mp3':('Machine Gun 001 - single shot','pgi','https://freesound.org/people/pgi/sounds/212601/','CC0-1.0'),
'reload/gun_reload.1.ogg':('2 Gun Reloads','starninjas','https://opengameart.org/content/2-gun-reloads','CC0-1.0'),
'reload/gun_reload.2.ogg':('2 Gun Reloads','starninjas','https://opengameart.org/content/2-gun-reloads','CC0-1.0')}
records=[]
for name,(file,start,duration,loop) in clips.items():
 filters='highpass=f=35,lowpass=f=11000,alimiter=limit=0.9:level=false,loudnorm=I=-22:TP=-2:LRA=8'
 if loop:filters+=',areverse,afade=t=in:d=0.015,areverse,afade=t=in:d=0.015'
 else:filters+=f',afade=t=in:d=0.003,afade=t=out:st={max(0,duration-.045)}:d=0.045'
 target=out/(name+'.ogg');temporary=out/(name+'.partial.ogg');subprocess.run(['ffmpeg','-loglevel','error','-y','-ss',str(start),'-i',str(src/file),'-t',str(duration),'-af',filters,'-ac','1','-ar','44100','-c:a','libvorbis','-q:a','4',str(temporary)],check=True)
 assert temporary.stat().st_size>1000
 temporary.replace(target)
 title,author,url,license=sources[file];records.append({'file':target.name,'source':title,'author':author,'url':url,'license':license,'start_seconds':start,'slice_seconds':duration,'loop':loop,'modifications':'trim, mono, EQ, loudness normalization, 15 ms loop-boundary fade / event envelope','sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
(out/'SOURCES.json').write_text(json.dumps({'note':'Humvee recording is vehicle-specific; other engine/gun recordings are category matches with per-vehicle pitch/gain profiles, not claimed as recordings of each exact prototype. Freesound files use the public HQ previews.','clips':records},ensure_ascii=False,indent=2)+'\n')
(out/'LICENSES.txt').write_text('CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/\nCC BY 3.0: https://creativecommons.org/licenses/by/3.0/\nCC BY 4.0: https://creativecommons.org/licenses/by/4.0/\n\nqubodup Tank Engine Loop.flac (CC BY 4.0) and Lucas Del Piero Engine-loop heavy vehicle/tank (CC BY 3.0) edited as specified in SOURCES.json. Other authors and source URLs are listed for each clip.\n')
print('Prepared',len(records),'bounded event/loop clips',sum(p.stat().st_size for p in out.glob('*.ogg')),'bytes')
