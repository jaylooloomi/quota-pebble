import {readdirSync,readFileSync,lstatSync} from 'node:fs';
import path from 'node:path';
import {CodexSessionReader} from './codex-session-reader';
export type TaskStatus='running'|'waiting'|'idle'|'unknown';
export type TaskRow={provider?:'codex'|'claude'|'antigravity'|'gemini';id:string;title:string;project:string;status:TaskStatus;source:'runtime'|'hook'|'history'|'rollout'|'remote'|'claude-registry'|'antigravity-rpc'|'claude-remote'|'antigravity-remote';nativeTaskId?:string;remoteSessionId?:string;confirmedAt:number|null;event?:string;evidence?:'inferred';host?:string;observedAt?:number;activityKey?:string;completionEvidence?:{id:string;time:number}};
export const TASK_FRESH_MS=45_000;
const events=new Set(['SessionStart','UserPromptSubmit','PreToolUse','PostToolUse','PermissionRequest','Stop','Interrupt','SessionEnd']);
const clean=(v:unknown,n:number)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,n):'';
export function readTaskEvents(directory:string,now=Date.now()):any[]{
  const result:any[]=[];
  try{for(const name of readdirSync(directory).filter(n=>/^[0-9a-f-]{36}\.json$/.test(n)).sort().slice(-4000)){
    try{const file=path.join(directory,name),s=lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>4096)continue;
      const e=JSON.parse(readFileSync(file,'utf8'));if(e.version!==1||!events.has(e.event)||!/^[-\w]{1,128}$/.test(e.id)||!Number.isFinite(e.time)||e.time>now+1000||e.time<now-86400000)continue;
      result.push({id:e.id,turn:clean(e.turn,128),event:e.event,time:e.time,project:clean(e.project,512)});
    }catch{/* One incomplete event must not hide other sessions. */}
  }}catch{/* A bridge that has never run has no events. */}return result.sort((a,b)=>a.time-b.time||a.event.localeCompare(b.event));
}
export function taskRows(threads:any[],loaded:Set<string>,runtime:boolean,eventsList:any[],now=Date.now()):TaskRow[]{
  const rows=new Map<string,TaskRow>();
  for(const t of threads.slice(0,100)){
    if(typeof t?.id!=='string'||!/^[-\w]{1,128}$/.test(t.id)||t.parentThreadId)continue;
    const status=t.status?.type;let value:TaskStatus='unknown';
    if(runtime&&loaded.has(t.id))value=status==='active'?(t.status.activeFlags?.length?'waiting':'running'):status==='idle'?'idle':'unknown';
    rows.set(t.id,{id:t.id,title:clean(t.name,160)||'Codex session',project:clean(t.cwd,512),status:value,source:value==='unknown'?'history':'runtime',confirmedAt:value==='unknown'?null:now});
  }
  const latest=new Map<string,any>();const terminal=new Set<string>(),retired=new Set<string>();const currentTurns=new Map<string,string>();
  for(const e of eventsList){
    const key=e.id+':'+e.turn;
    if(e.turn){const current=currentTurns.get(e.id);if(current&&current!==e.turn){
      if(e.event!=='UserPromptSubmit'||retired.has(key))continue;
      retired.add(e.id+':'+current);
    }currentTurns.set(e.id,e.turn);}
    if(terminal.has(key)&&!['Interrupt','SessionEnd'].includes(e.event))continue;
    if(['Interrupt','SessionEnd'].includes(e.event))terminal.add(key);
    latest.set(e.id,e);
  }
  for(const e of latest.values()){
    const previous=rows.get(e.id);if(previous?.source==='runtime')continue;
    let status:TaskStatus='unknown';
    if(now-e.time<=TASK_FRESH_MS){
      if(['UserPromptSubmit','PreToolUse','PostToolUse'].includes(e.event))status='running';
      if(e.event==='PermissionRequest')status='waiting';
      if(['SessionStart','Interrupt','SessionEnd'].includes(e.event))status='idle';
      // Stop hooks can ask Codex to continue. They are NOT proof of an idle turn.
    }
    rows.set(e.id,{id:e.id,title:previous?.title||'Codex session',project:previous?.project||e.project,status,source:'hook',confirmedAt:e.time,event:e.event});
  }
  const rank={waiting:0,running:1,idle:2,unknown:3};
  return [...rows.values()].sort((a,b)=>rank[a.status]-rank[b.status]||(b.confirmedAt??0)-(a.confirmedAt??0)).slice(0,100);
}
export class TaskMonitor{
  private threads:any[]=[];private loaded=new Set<string>();private runtime=false;private confirmed=0;private lastAttempt=0;private busy=false;private closed=false;
  private eventCache:any[]=[];private eventReadAt=-Infinity;
  private enabled=false;private timer:NodeJS.Timeout|undefined;private connection:'idle'|'checking'|'history'|'runtime'|'local'|'unavailable'='idle';
  private local?:CodexSessionReader;
  constructor(private directory:string,private rpc:{call(method:string,params?:any):Promise<any>;close():void},private proxy:{call(method:string,params?:any):Promise<any>;close():void},private changed:()=>void,private now=Date.now,sessionsRoot?:string){if(sessionsRoot)this.local=new CodexSessionReader(sessionsRoot,now);}
  snapshot(){const now=this.now();if(this.enabled&&now-this.eventReadAt>=1000){this.eventCache=readTaskEvents(this.directory,now);this.eventReadAt=now;}
    let rows=this.enabled?taskRows(this.threads,this.loaded,this.runtime&&now-this.confirmed<=TASK_FRESH_MS,this.eventCache,now):[];
    if(this.enabled&&this.local){if(this.local.available)rows=rows.filter(r=>r.source!=='hook'||r.status!=='unknown');const merged=new Map(rows.map(r=>[r.id,r]));for(const r of this.local.rows()){
      const previous=merged.get(r.id);if(previous?.source==='runtime')continue;
      if(previous?.source==='hook'&&previous.confirmedAt!==null&&r.confirmedAt!==null&&previous.confirmedAt>r.confirmedAt&&previous.status!=='unknown')continue;
      merged.set(r.id,r);
    }const rank={waiting:0,running:1,idle:2,unknown:3};rows=[...merged.values()].sort((a,b)=>rank[a.status]-rank[b.status]||(b.confirmedAt??0)-(a.confirmedAt??0)).slice(0,100);}
    const liveCoverage=this.enabled&&(!!this.local?.available||this.runtime&&this.loaded.size>0&&now-this.confirmed<=TASK_FRESH_MS||rows.some(r=>r.source==='hook'&&r.confirmedAt!==null&&now-r.confirmedAt<=TASK_FRESH_MS&&r.event!=='Stop'&&r.event!=='SessionEnd'));
    return {enabled:this.enabled,connection:this.connection,liveCoverage,partial:this.local?.partial??false,inferred:!!this.local?.available,checkedAt:this.confirmed||null,rows:this.enabled?rows:[],counts:Object.fromEntries(['running','waiting','idle','unknown'].map(k=>[k,rows.filter(r=>r.status===k).length])),scope:'local',limit:100};}
  async start(){if(this.closed)return;const first=!this.enabled;if(first){this.enabled=true;this.timer=setInterval(()=>{void this.tick();this.changed();},2000);this.timer.unref();}await this.tick(first);}
  async tick(force=false){const now=this.now();if(this.closed||!this.enabled||this.busy||!force&&now-this.lastAttempt<(this.local?1500:30000))return;this.busy=true;this.lastAttempt=now;if(!this.local||!this.confirmed){this.connection='checking';this.changed();}
    try{
      if(this.local){await this.local.scan();if(this.closed)return;this.confirmed=this.now();this.connection=this.local.available?'local':'unavailable';return;}
      let client=this.rpc;this.runtime=false;
      try{await this.proxy.call('thread/loaded/list',{});client=this.proxy;this.runtime=true;}catch{this.proxy.close();}
      if(this.closed)return;
      const result=await client.call('thread/list',{limit:100,sortKey:'updated_at',sortDirection:'desc',useStateDbOnly:true,sourceKinds:['cli','vscode','appServer','exec']});
      const loaded=await client.call('thread/loaded/list',{});if(this.closed)return;
      this.threads=Array.isArray(result.data)?result.data.map((t:any)=>({id:t.id,name:t.name,cwd:t.cwd,status:t.status,parentThreadId:t.parentThreadId})):[];this.loaded=new Set(Array.isArray(loaded.data)?loaded.data:[]);this.confirmed=this.now();this.connection=this.runtime?'runtime':'history';
    }catch{this.runtime=false;this.loaded.clear();this.connection='unavailable';}
    finally{this.busy=false;if(!this.closed)this.changed();}
  }
  close(){this.closed=true;clearInterval(this.timer);this.rpc.close();this.proxy.close();}
}
