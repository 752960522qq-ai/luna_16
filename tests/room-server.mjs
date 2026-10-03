import{DatabaseSync}from'node:sqlite';
import{readFileSync,readdirSync}from'node:fs';
import{createServer}from'node:http';
import{rooms}from'../web/worker/rooms.mjs';
export function database(){
 const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync(new URL('../web/drizzle/',import.meta.url)).filter(p=>p.endsWith('.sql')).sort())raw.exec(readFileSync(new URL('../web/drizzle/'+file,import.meta.url),'utf8'));
 const db={prepare(sql){let args=[];return{bind(...v){args=v;return this;},async run(){const r=raw.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)},results:[]};},async first(){return raw.prepare(sql).get(...args)||null;},async all(){return{results:raw.prepare(sql).all(...args),meta:{}};},async execute(){const p=raw.prepare(sql);if(p.columns().length)return{results:p.all(...args),meta:{}};return{results:[],meta:{changes:Number(p.run(...args).changes)}};}};},async batch(list){raw.exec('BEGIN');try{const out=[];for(const q of list)out.push(await q.execute());raw.exec('COMMIT');return out;}catch(e){raw.exec('ROLLBACK');throw e;}}};
 return{db,raw};
}
export async function openRelay(){
 const{db,raw}=database();const server=createServer(async(req,res)=>{try{let body='';for await(const chunk of req)body+=chunk;const response=await rooms(new Request('https://relay.test'+req.url,{method:req.method,headers:req.headers,...(body?{body}:{})}),{DB:db});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());}catch(e){res.writeHead(500);res.end(JSON.stringify({error:e.message}));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));return{server,raw,url:'http://127.0.0.1:'+server.address().port};
}
