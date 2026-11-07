import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import type {TaskRow,TaskStatus} from './task-monitor';
const exec=promisify(execFile),safe=(v:unknown,n=160)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,n):'';
const valid=(v:unknown):v is string=>typeof v==='string'&&/^[\w-]{1,160}$/.test(v),errorCode=(v:unknown)=>typeof v==='string'&&/^[A-Z_0-9]{1,80}$/.test(v)?v:'REMOTE_QUERY_FAILED';
export async function queryAntigravityRemote(){
 if(process.platform!=='win32')throw Error('PLATFORM_UNSUPPORTED');
 try{const {stdout}=await exec(path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-File',path.join(__dirname,'native','antigravity-remote.ps1').replace('app.asar'+path.sep,'app.asar.unpacked'+path.sep)],{windowsHide:true,timeout:60000,maxBuffer:1048576});return JSON.parse(stdout.replace(/^\uFEFF/,''));}catch{throw Error('HELPER_FAILED');}
}
export function antigravityRemoteRow(v:any,host:{id:string;name:string},account:string,now=Date.now()):TaskRow|null{
 if(!valid(v?.id)||!valid(host.id)||!valid(account))return null;
 const status:TaskStatus=['running','idle'].includes(v.status)?v.status:'unknown';
 const time=typeof v.lastEvent==='string'?Date.parse(v.lastEvent):NaN;
 return{provider:'antigravity',id:'antigravity-remote:'+account+':'+host.id+':'+v.id,nativeTaskId:v.id,title:safe(v.title)||'Antigravity · '+v.id.slice(0,8),project:safe(v.project,512),status,source:'antigravity-remote',host:safe(host.name,100),confirmedAt:Number.isFinite(time)&&time>0&&time<=now+1000?time:null,observedAt:now,event:'official-remote-'+status};
}
type Health={id:string;name:string;online:boolean;state:'ready'|'offline'|'error';error:string;checkedAt:number;count:number};
export class AntigravityRemoteTaskMonitor{
 private rows:TaskRow[]=[];private hosts:Health[]=[];private checking=false;private closed=false;private timer?:NodeJS.Timeout;private checkedAt=0;private nextPollAt=0;private error='';private partial=false;private account='';
 constructor(private changed:()=>void,private query=queryAntigravityRemote,private now=Date.now){}
 snapshot(){const now=this.now(),fresh=this.checkedAt>0&&now-this.checkedAt<=150000;return{rows:this.rows.map(r=>!fresh?{...r,status:'unknown' as const}:r),available:fresh&&this.hosts.some(h=>h.state==='ready'),checking:this.checking,error:this.error,checkedAt:this.checkedAt,nextPollAt:this.nextPollAt,partial:this.partial,hosts:this.hosts.map(h=>({...h,state:!fresh?'error':h.state,error:!fresh?'STALE':h.error}))};}
 start(force=false){if(this.closed)return Promise.resolve();if(!this.timer){this.timer=setInterval(()=>void this.tick(),60000);this.timer.unref();}return this.tick(force);}
 async tick(force=false){if(this.closed||this.checking||this.now()<this.nextPollAt&&(!force||!this.error||this.error==='REMOTE_HTTP_429'||this.error==='RATE_LIMIT_COOLDOWN'))return;this.checking=true;try{
  const data=await this.query();if(this.closed)return;const now=this.now();
  if(data?.error)throw Object.assign(Error(errorCode(data.error)),{retryAfterMs:data.retryAfterMs});
  if(!valid(data?.accountKey)||!Array.isArray(data.hosts))throw Error('UNSUPPORTED_SCHEMA');
  const previous=this.account===data.accountKey?this.rows:[];this.account=data.accountKey;const rows:TaskRow[]=[],hosts:Health[]=[];
  for(const h of data.hosts.slice(0,5)){
   if(!valid(h?.id)||typeof h.name!=='string'||!['ready','offline','error'].includes(h.state)||!Array.isArray(h.rows))throw Error('UNSUPPORTED_SCHEMA');
   const health:Health={id:h.id,name:safe(h.name,100),online:h.online===true,state:h.state,error:h.error?errorCode(h.error):'',checkedAt:now,count:0};
   if(health.state==='ready'&&!health.online){health.state='error';health.error='INVALID_HOST_STATE';}
   const result=health.state==='ready'?h.rows.slice(0,100).map((v:any)=>antigravityRemoteRow(v,h,this.account,now)).filter((v:TaskRow|null):v is TaskRow=>!!v):previous.filter(r=>r.id.startsWith('antigravity-remote:'+this.account+':'+h.id+':')).map(r=>({...r,status:'unknown' as const}));
   health.count=result.length;hosts.push(health);rows.push(...result);
  }
  this.hosts=hosts;this.rows=[...new Map(rows.map(r=>[r.id,r])).values()].sort((a,b)=>Number(b.status==='running')-Number(a.status==='running')).slice(0,100);this.checkedAt=now;this.partial=!!data.partial||data.hosts.length>5||rows.length>100||hosts.some(h=>h.state!=='ready');
  const delay=typeof data.retryAfterMs==='number'&&Number.isFinite(data.retryAfterMs)&&data.retryAfterMs>0?data.retryAfterMs:0;
  this.error=delay?'RATE_LIMIT_COOLDOWN':hosts.length?hosts.every(h=>h.state==='ready')?'':hosts.some(h=>h.state==='ready')?'PARTIAL_HOSTS':hosts[0]!.error:'NO_REMOTE_HOSTS';this.nextPollAt=now+Math.max(60000,delay);
 }catch(e){if(!this.closed){this.error=errorCode((e as Error)?.message);this.rows=this.rows.map(r=>({...r,status:'unknown'}));this.hosts=this.hosts.map(h=>({...h,state:'error',error:this.error}));this.partial=true;this.checkedAt=this.now();const delay=Number((e as any)?.retryAfterMs);this.nextPollAt=this.now()+Math.max(Number.isFinite(delay)?delay:0,/AUTH_/.test(this.error)?600000:120000);}}finally{this.checking=false;if(!this.closed)this.changed();}}
 close(){this.closed=true;clearInterval(this.timer);this.rows=[];this.hosts=[];}
}
export function mergeAntigravityTasks(local:TaskRow[],remote:TaskRow[]){
 const id=(r:TaskRow)=>r.nativeTaskId||(r.source==='antigravity-rpc'?r.id.slice('antigravity:'.length):undefined),localKnown=new Set(local.filter(r=>r.provider==='antigravity'&&r.status!=='unknown').map(id)),remoteKnown=new Set(remote.filter(r=>r.status!=='unknown').map(id)),localAll=new Set(local.filter(r=>r.provider==='antigravity').map(id));
 return [...local.filter(r=>r.provider!=='antigravity'||r.status!=='unknown'||!remoteKnown.has(id(r))),...remote.filter(r=>!localKnown.has(id(r))&&(!localAll.has(id(r))||r.status!=='unknown'))];
}
