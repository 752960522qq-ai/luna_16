/* API-only Worker. No browser game or downloadable game assets are published. */
import{readFileSync,writeFileSync,mkdirSync,rmSync,cpSync}from'node:fs';
import{gzipSync}from'node:zlib';
const relay=readFileSync('worker/rooms.mjs','utf8').replace('export async function rooms','async function rooms');
const fetcher=`\nexport default {async fetch(request,env){const url=new URL(request.url);if(url.pathname.startsWith('/api/rooms/'))return rooms(request,env);return new Response(request.method==='HEAD'?null:'网页版已关闭。请使用最新版 APK。',{status:410,headers:{'Content-Type':'text/plain;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}};\n`;
const output=relay+fetcher;
rmSync('dist',{recursive:true,force:true});mkdirSync('dist/server',{recursive:true});mkdirSync('dist/.openai',{recursive:true});writeFileSync('dist/server/index.js',output);cpSync('.openai/hosting.json','dist/.openai/hosting.json');cpSync('drizzle','dist/drizzle',{recursive:true});
console.log(JSON.stringify({browserGame:false,workerBytes:Buffer.byteLength(output),compressedBytes:gzipSync(output).length}));
