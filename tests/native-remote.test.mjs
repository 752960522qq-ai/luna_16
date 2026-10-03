import assert from'node:assert/strict';
import{spawn}from'node:child_process';
import{openRelay}from'./room-server.mjs';
const api=await openRelay(),requests=[];
api.server.on('request',req=>requests.push({method:req.method,type:req.headers['content-type'],ua:req.headers['user-agent']}));
try{
 const child=spawn('java',['-cp',process.env.JAVA_TEST_CLASSES||'/tmp/blindfire-tests','RemoteHttpTest',api.url],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);const code=await new Promise(r=>child.on('close',r));
 assert.equal(code,0,stderr);assert.ok(requests.length>=9);assert.ok(requests.every(r=>r.method==='POST'));assert.ok(requests.every(r=>r.type.startsWith('text/plain')));assert.ok(requests.every(r=>r.ua.includes('Android')));console.log(stdout.trim());console.log('PASS native requests require no CORS preflight and send the Android User-Agent');
}finally{await new Promise(r=>api.server.close(r));api.raw.close();}
