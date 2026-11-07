import {lstat,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {retryDelay} from './http';
import type {TaskRow,TaskStatus} from './task-monitor';
export type ClaudeTaskProfile={directory:string;config:string;label:string};
type Auth={token:string;org:string;scope:string};
type Health={label:string;available:boolean;error:string;checkedAt:number;nextPollAt:number;count:number;partial:boolean};
const safe=(v:unknown,n=160)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,n):'';
const id=(v:unknown):v is string=>typeof v==='string'&&/^(cse_|session_)[\w-]{1,128}$/.test(v);
const stamp=(v:unknown)=>{const t=typeof v==='string'?Date.parse(v):NaN;return Number.isFinite(t)&&t>0&&t<=Date.now()+1000?t:null;};
async function json(file:string,cap:number){const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>cap)throw Error('AUTH_UNAVAILABLE');return JSON.parse(await readFile(file,'utf8'));}
export async function claudeTaskAuth(profile:ClaudeTaskProfile):Promise<Auth>{
 const c=await json(path.join(profile.directory,'.credentials.json'),131072),v=await json(profile.config,1048576),o=c.claudeAiOauth;
 if(typeof o?.accessToken!=='string'||!o.accessToken||typeof v.oauthAccount?.organizationUuid!=='string')throw Error('AUTH_UNAVAILABLE');
 if(Array.isArray(o.scopes)&&!o.scopes.includes('user:sessions:claude_code'))throw Error('AUTH_SCOPE_REQUIRED');
 const org=v.oauthAccount.organizationUuid;return{token:o.accessToken,org,scope:createHash('sha256').update(org+'|'+String(v.oauthAccount.accountUuid||profile.directory)).digest('hex').slice(0,20)};
}
export function claudeRemoteRow(v:any,scope:string,label:string,now=Date.now()):TaskRow|null{
 if(!id(v?.id)||v.status!=='active'||v.environment_kind!=='bridge')return null;
 const status:TaskStatus=v.connection_status!=='connected'?'unknown':({running:'running',requires_action:'waiting',idle:'idle'} as Record<string,TaskStatus>)[v.worker_status]||'unknown';
 return{provider:'claude',id:'claude-remote:'+scope+':'+v.id,remoteSessionId:v.id,title:safe(v.title)||'Claude Code',project:'',status,source:'claude-remote',host:'Remote Control · '+safe(label,24),confirmedAt:stamp(v.last_event_at),observedAt:now,event:'remote-'+(status==='unknown'?'unconfirmed':v.worker_status)};
}
export class ClaudeRemoteTaskMonitor{
 private rows:TaskRow[]=[];private profiles:Health[]=[];private busy=false;private closed=false;private timer?:NodeJS.Timeout;private cache=new Map<string,{rows:TaskRow[];health:Health}>();
 constructor(private sources:()=>ClaudeTaskProfile[],private changed:()=>void,private fetcher:typeof fetch=fetch,private auth=claudeTaskAuth,private now=Date.now){}
 snapshot(){const now=this.now();return{rows:this.rows.map(r=>!r.observedAt||now-r.observedAt>150000?{...r,status:'unknown' as const}:r),available:this.profiles.some(h=>h.available&&now-h.checkedAt<=150000),checking:this.busy,profiles:this.profiles.map(h=>({...h,available:h.available&&now-h.checkedAt<=150000})),partial:this.profiles.some(h=>h.partial||!h.available)};}
 start(force=false){if(this.closed)return Promise.resolve();if(!this.timer){this.timer=setInterval(()=>void this.tick(),60000);this.timer.unref();}return this.tick(force);}
 private async request(url:string,auth:Auth){
  if(!/^https:\/\/api\.anthropic\.com\/v1\/code\/sessions\?limit=50(?:&cursor=[^#]*)?$/.test(url))throw Error('METHOD_NOT_ALLOWED');
  const r=await this.fetcher(url,{method:'GET',headers:{Authorization:'Bearer '+auth.token,'anthropic-version':'2023-06-01','x-organization-uuid':auth.org,Accept:'application/json','User-Agent':'Quota-Pebble/readonly-tasks'},redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!r.ok){await r.body?.cancel();throw Object.assign(Error('HTTP_'+r.status),{retryAfterMs:r.status===429?retryDelay(r.headers.get('retry-after'),this.now()):0});}
  if(!r.body)throw Error('UNSUPPORTED_SCHEMA');let size=0;const chunks:Uint8Array[]=[];for await(const b of r.body as any){size+=b.length;if(size>1048576){throw Error('RESPONSE_LIMIT');}chunks.push(b);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }
 async tick(force=false){if(this.closed||this.busy)return;this.busy=true;try{
  const selected=this.sources().slice(0,5),keep=new Set(selected.map(p=>p.directory)),scopes=new Set<string>();for(const k of this.cache.keys())if(!keep.has(k))this.cache.delete(k);
  for(const profile of selected){if(this.closed)return;const previous=this.cache.get(profile.directory),now=this.now();if(previous&&now<previous.health.nextPollAt&&(!force||previous.health.error==='HTTP_429'||!previous.health.error))continue;
   let rows:TaskRow[]=[],partial=false;const health:Health={label:safe(profile.label,24),available:false,error:'',checkedAt:now,nextPollAt:now+60000,count:0,partial:false};
   try{const auth=await this.auth(profile);if(scopes.has(auth.scope)){this.cache.delete(profile.directory);continue;}scopes.add(auth.scope);let cursor='';const seen=new Set<string>();
    for(let page=0;page<3;page++){const result=await this.request('https://api.anthropic.com/v1/code/sessions?limit=50'+(cursor?'&cursor='+encodeURIComponent(cursor):''),auth);if(!Array.isArray(result.data))throw Error('UNSUPPORTED_SCHEMA');
     for(const v of result.data.slice(0,50)){const row=claudeRemoteRow(v,auth.scope,profile.label,this.now());if(row&&!seen.has(row.id)){seen.add(row.id);rows.push(row);}}
     const next=result.next_cursor;if(!next)break;if(typeof next!=='string'||next.length>2048||next===cursor)throw Error('UNSUPPORTED_CURSOR');cursor=next;if(page===2)partial=true;
    }health.available=true;health.partial=partial||rows.length>100;rows=rows.slice(0,100);health.count=rows.length;
   }catch(e){health.error=e instanceof Error&&/^[A-Z_0-9]+$/.test(e.message)?e.message:'REMOTE_UNAVAILABLE';health.nextPollAt=this.now()+Math.max(Number((e as any)?.retryAfterMs)||0,/HTTP_40[13]|AUTH_/.test(health.error)?600000:120000);health.partial=true;rows=(previous?.rows||[]).map(r=>({...r,status:'unknown'}));}
   if(!this.closed)this.cache.set(profile.directory,{rows,health});
  }
  if(!this.closed){this.rows=[...new Map([...this.cache.values()].flatMap(v=>v.rows).map(r=>[r.id,r])).values()].slice(0,100);this.profiles=[...this.cache.values()].map(v=>v.health);}
 }finally{this.busy=false;if(!this.closed)this.changed();}}
 close(){this.closed=true;clearInterval(this.timer);this.rows=[];this.cache.clear();this.profiles=[];}
}

export function mergeClaudeTasks(local:TaskRow[],remote:TaskRow[]){const ids=new Map(local.filter(r=>r.remoteSessionId).map(r=>[r.remoteSessionId,r]));const remoteIds=new Set(remote.filter(r=>r.status!=='unknown').map(r=>r.remoteSessionId));return [...local.filter(r=>!r.remoteSessionId||r.status!=='unknown'||!remoteIds.has(r.remoteSessionId)),...remote.filter(r=>!r.remoteSessionId||!ids.has(r.remoteSessionId)||ids.get(r.remoteSessionId)!.status==='unknown'&&r.status!=='unknown')];}
