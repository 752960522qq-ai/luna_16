/* Build a standalone Worker: static game bytes and room relay, no runtime dependencies. */
import{readFileSync,writeFileSync,readdirSync,mkdirSync,rmSync,cpSync}from'node:fs';
import{join,relative}from'node:path';
import{createHash}from'node:crypto';
import{gzipSync}from'node:zlib';
function files(root){return readdirSync(root,{withFileTypes:true}).flatMap(p=>p.isDirectory()?files(join(root,p.name)):[join(root,p.name)]);}
const types={html:'text/html;charset=utf-8',js:'application/javascript;charset=utf-8',css:'text/css;charset=utf-8',woff:'font/woff',glb:'model/gltf-binary',txt:'text/plain;charset=utf-8'};
const assets={};for(const path of files('public')){const bytes=readFileSync(path),name='/'+relative('public',path);assets[name]={body:bytes.toString('base64'),type:types[name.split('.').at(-1)]||'application/octet-stream',etag:'"'+createHash('sha256').update(bytes).digest('hex')+'"'};}
const relay=readFileSync('worker/rooms.mjs','utf8').replace('export async function rooms','async function rooms');
const fetcher=`\nexport default {async fetch(request,env){const url=new URL(request.url);if(url.pathname.startsWith('/api/rooms/'))return rooms(request,env);if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405});const asset=ASSETS[url.pathname==='/'?'/index.html':url.pathname];if(!asset)return new Response('Not found',{status:404});const headers={'Content-Type':asset.type,'Cache-Control':'no-cache','ETag':asset.etag,'X-Content-Type-Options':'nosniff'};if(request.headers.get('If-None-Match')===asset.etag)return new Response(null,{status:304,headers});let body=null;if(request.method!=='HEAD'){const raw=atob(asset.body);body=Uint8Array.from(raw,c=>c.charCodeAt(0));}return new Response(body,{headers});}};\n`;
const output=relay+'\nconst ASSETS='+JSON.stringify(assets)+';\n'+fetcher;
rmSync('dist',{recursive:true,force:true});mkdirSync('dist/server',{recursive:true});mkdirSync('dist/.openai',{recursive:true});writeFileSync('dist/server/index.js',output);cpSync('.openai/hosting.json','dist/.openai/hosting.json');cpSync('drizzle','dist/drizzle',{recursive:true});
console.log(JSON.stringify({assets:Object.keys(assets).length,workerBytes:Buffer.byteLength(output),compressedBytes:gzipSync(output).length}));
