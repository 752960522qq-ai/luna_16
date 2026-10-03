#!/usr/bin/env python3
"""Standalone APK build without Gradle; supply standard SDK/JDK or ECJ/R8 paths."""
import argparse, os, shutil, subprocess, zipfile
from pathlib import Path

ap=argparse.ArgumentParser()
ap.add_argument('--android-jar',required=True)
ap.add_argument('--aapt2',required=True)
ap.add_argument('--zipalign',required=True)
ap.add_argument('--apksigner-jar',required=True)
ap.add_argument('--r8-jar',required=True)
ap.add_argument('--ecj-jar')
ap.add_argument('--keystore',required=True)
ap.add_argument('--password-file',required=True)
ap.add_argument('--output',required=True)
args=ap.parse_args()
root=Path(__file__).resolve().parents[1]; build=root/'build'/'standalone';src=root/'app'/'src'/'main'
if build.exists():shutil.rmtree(build)
(build/'classes').mkdir(parents=True);(build/'dex').mkdir()
def run(cmd):
    result=subprocess.run([str(c) for c in cmd],capture_output=True,text=True)
    if result.returncode:
        print((result.stdout+result.stderr)[-8000:]);raise SystemExit(result.returncode)
    if result.stdout:print(result.stdout[-8000:])
sources=sorted((src/'java').rglob('*.java'))
if args.ecj_jar:
    run(['java','-jar',args.ecj_jar,'-source','1.8','-target','1.8','-nowarn','-encoding','UTF-8','-cp',args.android_jar,'-d',build/'classes',*sources])
else:run(['javac','-source','8','-target','8','-encoding','UTF-8','-cp',args.android_jar,'-d',build/'classes',*sources])
with zipfile.ZipFile(build/'classes.jar','w') as z:
    for p in sorted((build/'classes').rglob('*.class')):z.write(p,p.relative_to(build/'classes'))
run(['java','-cp',args.r8_jar,'com.android.tools.r8.D8','--lib',args.android_jar,'--min-api','23','--output',build/'dex',build/'classes.jar'])
run([args.aapt2,'compile','--dir',src/'res','-o',build/'res.zip'])
run([args.aapt2,'link','--manifest',src/'AndroidManifest.xml','-I',args.android_jar,'-A',src/'assets','--min-sdk-version','23','--target-sdk-version','35','-o',build/'resources.apk',build/'res.zip'])
with zipfile.ZipFile(build/'resources.apk') as source,zipfile.ZipFile(build/'unsigned.apk','w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as target:
    for info in source.infolist():target.writestr(info,source.read(info.filename))
    target.write(build/'dex'/'classes.dex','classes.dex')
run([args.zipalign,'-f','4',build/'unsigned.apk',build/'aligned.apk'])
output=Path(args.output);output.parent.mkdir(parents=True,exist_ok=True)
run(['java','-jar',args.apksigner_jar,'sign','--ks',args.keystore,'--ks-pass','file:'+args.password_file,'--min-sdk-version','23','--v1-signing-enabled','true','--v2-signing-enabled','true','--v3-signing-enabled','true','--out',output,build/'aligned.apk'])
run(['java','-jar',args.apksigner_jar,'verify','--verbose',output])
run([args.aapt2,'dump','badging',output])
print('APK built:',output,'bytes:',output.stat().st_size)
