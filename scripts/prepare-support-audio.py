#!/usr/bin/env python3
"""Rebuild bounded airplane/release/support clips from verified CC0 previews and existing cannon audio."""
from pathlib import Path
import urllib.request,subprocess,json,hashlib
root=Path(__file__).resolve().parents[1];out=root/'app/src/main/assets/audio';src=root.parent/'audio-sources';src.mkdir(exist_ok=True)
manifest=json.loads((out/'SOURCES.json').read_text())
def record(name,input,start,duration,filters,title,author,url,loop):
 target=out/(name+'.ogg');subprocess.run(['ffmpeg','-loglevel','error','-y','-ss',str(start),'-i',str(input),'-t',str(duration),'-af',filters,'-ac','1','-ar','44100','-c:a','libvorbis','-q:a','4',str(target)],check=True)
 item={'file':target.name,'source':title,'author':author,'url':url,'license':'CC0-1.0','start_seconds':start,'slice_seconds':duration,'loop':loop,'modifications':filters,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
 manifest['clips'][:]=[r for r in manifest['clips']if r['file']!=target.name];manifest['clips'].append(item)
for name,preview,start,duration,title,author,url,loop in [
 ('bomber-engine','https://cdn.freesound.org/previews/515/515293_9159316-hq.mp3',9,4,'Propeller plane','Breviceps','https://freesound.org/people/Breviceps/sounds/515293/',True),
 ('bomb-release','https://cdn.freesound.org/previews/383/383807_7146007-hq.mp3',.02,.6,'Metal Latch Latching Metallic','deleted_user_7146007','https://freesound.org/people/deleted_user_7146007/sounds/383807/',False)]:
 raw=src/(name+'.mp3');urllib.request.urlretrieve(preview,raw);record(name,raw,start,duration,'highpass=f=55,lowpass=f=8500,loudnorm=I=-23:TP=-3:LRA=8,afade=t=in:d=0.02,afade=t=out:st='+str(duration-.03)+':d=0.03',title,author,url,loop)
for name,parent,duration,filters in [('bomber','bomber-engine',.85,'afade=t=out:st=0.7:d=0.15'),('spade','bomb-release',.9,'asetrate=33075,aresample=44100,apad,afade=t=out:st=0.8:d=0.1'),('artillery-heavy','artillery',2,'asetrate=33075,aresample=44100,bass=g=7:f=100,apad,alimiter=limit=0.9:level=false,afade=t=out:st=1.6:d=0.4')]:
 r=next(r for r in manifest['clips']if r['file']==parent+'.ogg');record(name,out/(parent+'.ogg'),0,duration,filters,r['source'],r['author'],r['url'],False)
(out/'SOURCES.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
