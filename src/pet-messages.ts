import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import https from 'node:https';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import type {RssTitleTranslator} from './rss-translation';
export type PetMessage={id:string;title:string;source:string;time:number;sourceId?:string};
type Source={id:string;url:string;enabled:boolean;seeded:boolean;seen:string[];checkedAt:number;error:boolean};
const GITHUB_BLOG_FEED='https://github.blog/feed/';
const createSource=(url:string):Source=>({id:randomUUID(),url,enabled:true,seeded:false,seen:[],checkedAt:0,error:false});
const clean=(v:unknown,n=160)=>typeof v==='string'?v.replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n):'';
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
export function feedUrl(value:unknown):URL{if(typeof value!=='string'||value.length>2048)throw Error('INVALID_FEED_URL');const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||u.hash||u.hostname==='localhost'||u.hostname.endsWith('.localhost'))throw Error('INVALID_FEED_URL');return u;}
export function publicAddress(ip:string){if(isIP(ip)===4){const [a=0,b=0,c=0]=ip.split('.').map(Number);return a>0&&a<224&&![10,127].includes(a)&&!(a===100&&b>=64&&b<=127)&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&(b===168||b===0&&(c===0||c===2)||b===88&&c===99))&&!(a===198&&(b===18||b===19||b===51&&c===100))&&!(a===203&&b===0&&c===113);}return isIP(ip)===6&&/^[23][0-9a-f]{3}:/i.test(ip)&&!ip.toLowerCase().startsWith('2001:db8:');}
async function resolvePublic(host:string){let timer:NodeJS.Timeout|undefined;try{return await Promise.race([lookup(host,{all:true}),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('FEED_DNS_TIMEOUT')),5000);})]);}finally{clearTimeout(timer);}}
export async function fetchFeed(value:string,redirects=0):Promise<string>{
  const u=feedUrl(value),host=u.hostname.replace(/^\[|\]$/g,''),addresses=isIP(host)?[{address:host,family:isIP(host)}]:await resolvePublic(host);if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('PRIVATE_FEED_ADDRESS');const selected=addresses.find(a=>a.family===4)??addresses[0]!;
  return new Promise((resolve,reject)=>{const request=https.get(u,{headers:{Accept:'application/rss+xml, application/atom+xml, application/xml, text/xml','Accept-Encoding':'identity','User-Agent':'Quota-Pebble-Feed/1'},family:selected.family,lookup:(_host,_options,cb:any)=>cb(null,selected.address,selected.family)},response=>{
    if([301,302,303,307,308].includes(response.statusCode??0)){response.resume();if(redirects>=3||!response.headers.location){reject(Error('FEED_REDIRECT'));return;}try{resolve(fetchFeed(feedUrl(new URL(response.headers.location,u).href).href,redirects+1));}catch{reject(Error('FEED_REDIRECT'));}return;}
    if(response.statusCode!==200||response.headers['content-encoding']&&response.headers['content-encoding']!=='identity'){response.resume();reject(Error('FEED_HTTP'));return;}let size=0;const chunks:Buffer[]=[];response.on('data',(b:Buffer)=>{size+=b.length;if(size>512*1024){request.destroy(Error('FEED_TOO_LARGE'));return;}chunks.push(b);});response.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));response.on('error',reject);
  });request.setTimeout(8000,()=>request.destroy(Error('FEED_TIMEOUT')));const timer=setTimeout(()=>request.destroy(Error('FEED_TIMEOUT')),10000);request.on('close',()=>clearTimeout(timer));request.on('error',reject);});
}
export function parseFeed(xml:string):{key:string;title:string;time:number|null}[]{
  const markup=xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g,'').replace(/<!--[\s\S]*?-->/g,'');let depth=0,tags=0;for(const match of markup.matchAll(/<(\/?)[A-Za-z_][^>]*>/g)){if(++tags>10000)throw Error('INVALID_FEED');if(match[1])depth--;else if(!/\/\s*>$/.test(match[0]))depth++;if(depth>64)throw Error('INVALID_FEED');}
  if(Buffer.byteLength(xml)>512*1024||/<!DOCTYPE|<!ENTITY/i.test(xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g,'').replace(/<!--[\s\S]*?-->/g,''))||XMLValidator.validate(xml)!==true)throw Error('INVALID_FEED');
  const data=new XMLParser({ignoreAttributes:false,parseTagValue:false,processEntities:true,removeNSPrefix:true}).parse(xml),items=data.rss?.channel?data.rss.channel.item??[]:data.feed?data.feed.entry??[]:data.RDF?data.RDF.item??[]:undefined;if(items===undefined)throw Error('UNSUPPORTED_FEED');
  return(Array.isArray(items)?items:[items]).slice(0,100).flatMap((item:any)=>{const title=clean(typeof item.title==='object'?item.title['#text']:item.title);if(!title)return[];const id=item.guid?.['#text']??item.guid??item.id??item.link?.['@_href']??item.link??title,key=hash(typeof id==='string'?id:title),raw=item.pubDate??item.updated??item.published,time=typeof raw==='string'?Date.parse(raw):NaN;return[{key,title,time:Number.isFinite(time)?time:null}];});
}
export class PetMessages{
  private sources:Source[]=[];private queue:PetMessage[]=[];private busy=false;private timer?:NodeJS.Timeout;private muted=false;private closed=false;private overflow=0;
  private muteGeneration = 0;
  constructor(private file:string,private changed:()=>void,private fetcher=fetchFeed,private now=Date.now,private network=true,private translator?:Pick<RssTitleTranslator,'translate'>){
    let data:any;
    try{
      const raw=readFileSync(file);
      if(raw.length>256*1024)return;
      data=JSON.parse(raw.toString());
    }catch(error){
      if((error as NodeJS.ErrnoException).code!=='ENOENT')return;
      data={version:1,sources:[]};
    }
    if(!data||!Array.isArray(data.sources))return;
    this.muted=data.muted===true;
    for(const s of data.sources.slice(0,8)){
      try{
        this.sources.push({...createSource(feedUrl(s.url).href),enabled:s.enabled===true,seeded:s.seeded===true,
          seen:(Array.isArray(s.seen)?s.seen:[]).filter((x:unknown)=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)).slice(-200)});
      }catch{}
    }
    // Mark the default as offered even if the list is full or the feed already exists.
    if(data.version===1){
      if(this.sources.length<8&&!this.sources.some(s=>s.url===GITHUB_BLOG_FEED)){
        this.sources.push(createSource(GITHUB_BLOG_FEED));
      }
      this.save();
    }
  }
  snapshot(){return{muted:this.muted,overflow:this.overflow,sources:this.sources.map(s=>({id:s.id,url:s.url,label:s.url===GITHUB_BLOG_FEED?'GitHub Blog':new URL(s.url).hostname,enabled:s.enabled,checkedAt:s.checkedAt,error:s.error})),items:[...this.queue]};}
  start(){if(!this.network||this.closed||this.timer)return;this.timer=setInterval(()=>void this.tick(),60000);this.timer.unref();void this.tick();}
  configure(action:unknown,value:unknown){if(action==='add'){if(this.sources.length>=8)throw Error('FEED_LIMIT');const url=feedUrl(value).href;if(this.sources.some(s=>s.url===url))return;this.sources.push(createSource(url));}
    else if(action==='mute'){if(typeof value!=='boolean')throw Error('INVALID_FEED_ACTION');this.muted=value;if(value){this.muteGeneration++;this.queue=[];this.overflow=0;}}
    else if(action==='remove'||action==='toggle'){const source=this.sources.find(s=>s.id===value);if(!source)throw Error('UNKNOWN_FEED');if(action==='remove'){this.sources=this.sources.filter(s=>s!==source);this.queue=this.queue.filter(m=>m.sourceId!==source.id);}else{source.enabled=!source.enabled;if(!source.enabled)this.queue=this.queue.filter(m=>m.sourceId!==source.id);}}
    else throw Error('INVALID_FEED_ACTION');this.save();this.changed();if(action==='add')void this.tick();}
  acknowledge(id:unknown){this.queue=this.queue.filter(m=>m.id!==id);this.changed();}
  preview(){this.enqueue({id:randomUUID(),title:'Hello 👋',source:'Quota Pebble',time:this.now()});this.changed();}
  private enqueue(item:PetMessage){if(this.muted)return;if(this.queue.length>=50){this.queue.shift();this.overflow++;}this.queue.push(item);}
  async tick(){
    if(this.busy||this.closed||!this.network||this.muted)return;
    this.busy=true;
    const generation=this.muteGeneration;
    const pending:{source:Source;message:PetMessage}[]=[];
    const canDeliver=()=>!this.closed&&!this.muted&&generation===this.muteGeneration;
    const sourceActive=(source:Source)=>source.enabled&&this.sources.includes(source);
    try{
      const due=this.sources.filter(s=>s.enabled&&(!s.checkedAt||this.now()-s.checkedAt>=15*60000));
      for(const source of due){
        if(!canDeliver())break;
        if(!sourceActive(source))continue;
        source.checkedAt=this.now();
        try{
          const rows=parseFeed(await this.fetcher(source.url));
          if(!canDeliver()||!sourceActive(source))continue;
          const previous=new Set(source.seen);
          if(source.seeded){
            const hostname=new URL(source.url).hostname;
            const now=this.now();
            for(const row of [...rows].reverse()){
              if(previous.has(row.key)||(row.time!==null&&(row.time<now-86400000||row.time>now+60000)))continue;
              pending.push({source,message:{id:hash(source.id+row.key),title:row.title,source:hostname,sourceId:source.id,time:row.time??now}});
              previous.add(row.key);
            }
          }
          source.seen=[...new Set([...source.seen,...rows.map(r=>r.key)])].slice(-200);
          source.seeded=true;
          source.error=false;
        }catch{source.error=true;}
      }
      if(!canDeliver())return;
      const active=pending.filter(({source})=>sourceActive(source));
      const recent=active.slice(-50);
      if(this.translator&&recent.length){
        try{
          const translated=await this.translator.translate(recent.map(({message})=>message.title));
          recent.forEach(({message},i)=>{message.title=clean(translated[i])||message.title;});
        }catch{/* Translation failure does not prevent RSS delivery. */}
      }
      if(canDeliver()){
        for(const {source,message} of active)if(sourceActive(source))this.enqueue(message);
      }
    }finally{
      this.busy=false;
      if(!this.closed){this.save();this.changed();}
    }
  }
  close(){this.closed=true;clearInterval(this.timer);this.queue=[];}
  private save(){try{mkdirSync(path.dirname(this.file),{recursive:true});writeFileSync(this.file+'.tmp',JSON.stringify({version:2,muted:this.muted,sources:this.sources.map(({url,enabled,seen,seeded})=>({url,enabled,seen,seeded}))}),{mode:0o600});renameSync(this.file+'.tmp',this.file);}catch{/* Feed storage does not stop quota monitoring. */}}
}
