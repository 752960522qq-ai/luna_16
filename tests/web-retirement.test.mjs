import assert from'node:assert/strict';
import{mkdtempSync,mkdirSync,copyFileSync,cpSync,readFileSync,rmSync}from'node:fs';
import{tmpdir}from'node:os';import{join}from'node:path';import{spawnSync}from'node:child_process';
import{database}from'./room-server.mjs';
const dir=mkdtempSync(join(tmpdir(),'blindfire-api-build-')),root=new URL('../web/',import.meta.url),{db,raw}=database();
try{
 for(const path of['worker','scripts','.openai'])mkdirSync(join(dir,path));
 for(const path of['worker/rooms.mjs','scripts/build.mjs'])copyFileSync(new URL(path,root),join(dir,path));
 copyFileSync(new URL('hosting.json',root),join(dir,'.openai/hosting.json'));cpSync(new URL('drizzle',root),join(dir,'drizzle'),{recursive:true});
 const built=spawnSync(process.execPath,['scripts/build.mjs'],{cwd:dir,encoding:'utf8'});assert.equal(built.status,0,built.stderr);
 const text=readFileSync(join(dir,'dist/server/index.js'),'utf8'),worker=(await import('data:text/javascript;base64,'+Buffer.from(text).toString('base64'))).default;assert.equal(text.includes('const ASSETS='),false);
 for(const path of['/','/index.html','/engine.js','/app.js','/style.css','/ui.woff','/models/m1097_friendly.glb']){const r=await worker.fetch(new Request('https://service.test'+path),{DB:db});assert.equal(r.status,410);assert.ok((await r.text()).includes('网页版已关闭'));}
 const created=await worker.fetch(new Request('https://service.test/api/rooms/create',{method:'POST',body:JSON.stringify({version:7})}),{DB:db});assert.equal(created.status,503);assert.equal((await created.json()).error,'远程联机暂时关闭');assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM rooms').get().n,0);
 const enabled=await worker.fetch(new Request('https://service.test/api/rooms/create',{method:'POST',body:JSON.stringify({version:7})}),{DB:db,ROOMS_ENABLED:'true'});assert.equal(enabled.status,200);assert.match((await enabled.json()).code,/^\d{4}$/);
 console.log('PASS built API-only Worker: all browser game/assets retired with 410; remote play is paused by default without database writes; explicit local test opt-in retains four-digit rooms');
}finally{raw.close();rmSync(dir,{recursive:true,force:true});}
