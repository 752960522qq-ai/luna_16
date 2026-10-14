from pathlib import Path
import urllib.request,subprocess,tempfile,json,hashlib
import numpy as np
OUT=Path(__file__).resolve().parents[1]/'app/src/main/assets/audio'
S=[('engine-katyusha','craigsmith',487151,2524442,1.1,3.8,True),('po2-engine','Breviceps',515293,9159316,9,4.4,True),('rocket-launch','qubodup',162380,71257,.76,.56,False)]
with tempfile.TemporaryDirectory()as td:
 t=Path(td);records=[]
 for name,author,id,uid,start,duration,loop in S:
  url=f'https://cdn.freesound.org/previews/{id//1000}/{id}_{uid}-hq.mp3';r=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'});(t/'source.mp3').write_bytes(urllib.request.urlopen(r,timeout=40).read());subprocess.run(['ffmpeg','-v','error','-y','-ss',str(start),'-i',str(t/'source.mp3'),'-t',str(duration),'-ac','1','-ar','44100','-af','highpass=f=45,lowpass=f=9000','-f','f32le',str(t/'slice.raw')],check=True);x=np.fromfile(t/'slice.raw',dtype='<f4');x-=x.mean();x*=(.14 if loop else .2)/max(.001,np.sqrt(np.mean(x*x)));x*=min(1,.88/max(.001,np.max(abs(x))))
  if loop:
   n=int(.12*44100);a=np.linspace(0,np.pi/2,n);x[:n]=x[-n:]*np.cos(a)+x[:n]*np.sin(a);x=x[:-n]
  else:
   n=int(.004*44100);x[:n]*=np.linspace(0,1,n);n=int(.045*44100);x[-n:]*=np.linspace(1,0,n)
  x.astype('<f4').tofile(t/'ready.raw');dest=OUT/(name+'.ogg');subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar','44100','-ac','1','-i',str(t/'ready.raw'),'-c:a','libvorbis','-q:a','3',str(dest)],check=True);records.append({'file':dest.name,'source':f'https://freesound.org/people/{author}/sounds/{id}/','license':'CC0-1.0','start':start,'duration':len(x)/44100,'loop':loop,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()})
 (OUT/'KATYUSHA-SOURCES.json').write_text(json.dumps(records,indent=2));print('Three recorded audio clips prepared')
