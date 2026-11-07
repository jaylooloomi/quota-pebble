import {readdir,lstat,open,readFile,readlink} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {hostname} from 'node:os';
import path from 'node:path';
import {discoverAntigravity,localAntigravityStatus} from './antigravity';
import type {TaskRow,TaskStatus} from './task-monitor';
import {claudeEndTurn,NativeCompletionTracker} from './native-task-completion';
import type {TaskCompletion} from './task-completion';
const exec=promisify(execFile),clean=(v:unknown,n=160)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,n):'';
const validId=(v:unknown):v is string=>typeof v==='string'&&/^[\w-]{1,128}$/.test(v);
type Identity={pid:number;procStart:string;claude:boolean};
type Result={rows:TaskRow[];available:boolean;partial:boolean;checkedAt:number;error?:string};
const timestamp=(v:unknown,now:number)=>{const t=typeof v==='number'?v:typeof v==='string'?Date.parse(v):NaN;return Number.isFinite(t)&&t>0&&t<=now+1000?t:null;};
export function claudeRegistryRow(v:any,identity:Identity|undefined,now=Date.now()):TaskRow|null {
  if(!validId(v?.sessionId)||!Number.isInteger(v.pid)||v.pid<1||typeof v.procStart!=='string'||v.procStart.length>100||!clean(v.cwd,512))return null;
  // Registry timestamps are state transitions, not heartbeats. A long-running
  // unchanged status is valid only while the same OS process generation lives.
  const verified=identity?.claude&&identity.pid===v.pid&&identity.procStart===v.procStart&&(!v.pidDomain||typeof v.pidDomain==='string'&&v.pidDomain.split(':')[0]===process.platform);
  const status:TaskStatus=!verified?'unknown':v.status==='busy'?'running':v.status==='waiting'?'waiting':['idle','shell'].includes(v.status)?'idle':'unknown';
  return{provider:'claude',id:'claude:'+v.sessionId+':'+v.pid,title:clean(v.name)||'Claude Code · '+v.sessionId.slice(0,8),project:clean(v.cwd,512),status,source:'claude-registry',remoteSessionId:typeof v.bridgeSessionId==='string'&&/^(cse_|session_)[\w-]{1,128}$/.test(v.bridgeSessionId)?v.bridgeSessionId:undefined,host:hostname(),confirmedAt:timestamp(v.statusUpdatedAt,now)??timestamp(v.updatedAt,now),observedAt:now,activityKey:v.procStart,event:'registry-'+(verified?clean(v.status,32):'identity-unverified')};
}
export async function claudeProcessIdentities(pids:number[]):Promise<Identity[]> {
  const ids=[...new Set(pids)].filter(n=>Number.isInteger(n)&&n>0&&n<=2147483647).slice(0,100);if(!ids.length)return[];
  if(process.platform==='win32'){
    // Numeric allowlisted PID values only; no registry-supplied commands/paths.
    const script=`$ErrorActionPreference='Stop';$rows=@();foreach($id in @(${ids.join(',')})){try{$p=Get-Process -Id $id -ErrorAction Stop;$ok=$p.ProcessName -eq 'claude';if($p.ProcessName -eq 'node'){$c=Get-CimInstance Win32_Process -Filter "ProcessId=$id";$ok=$c.CommandLine -match '@anthropic[\\/]claude-code[\\/].*cli\\.js'};$rows+=@{pid=$id;procStart=$p.StartTime.ToFileTimeUtc().ToString();claude=[bool]$ok}}catch{}};ConvertTo-Json -InputObject @($rows) -Compress`;
    const out=await exec(path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:8000,maxBuffer:65536});
    const data=JSON.parse(out.stdout.replace(/^\uFEFF/,''));return(Array.isArray(data)?data:[]).filter(v=>ids.includes(v.pid)&&typeof v.procStart==='string'&&typeof v.claude==='boolean');
  }
  const rows:Identity[]=[];
  for(const pid of ids)try{
    if(process.platform==='linux'){
      const stat=await readFile(`/proc/${pid}/stat`,'utf8'),start=stat.slice(stat.lastIndexOf(')')+2).split(/\s+/)[19],exe=path.basename(await readlink(`/proc/${pid}/exe`));
      rows.push({pid,procStart:start||'',claude:exe==='claude'});
    }else if(process.platform==='darwin'){
      const out=await exec('/bin/ps',['-p',String(pid),'-o','lstart=','-o','comm='],{env:{...process.env,TZ:'UTC',LC_ALL:'C'},timeout:2000,maxBuffer:4096}),m=/^\s*(.{24})\s+(.+?)\s*$/.exec(out.stdout);
      if(m)rows.push({pid,procStart:m[1]!.trim(),claude:path.basename(m[2]!)==='claude'});
    }
  }catch{/* Missing/unsupported process identity never proves a task is active. */}
  return rows;
}
export async function readClaudeRegistry(root:string,probe=claudeProcessIdentities,now=Date.now()):Promise<Result>{
  const records:any[]=[];let partial=false;
  try{
    const dir=await lstat(root);if(!dir.isDirectory()||dir.isSymbolicLink())throw Error('INVALID_REGISTRY');
    const entries=await readdir(root,{withFileTypes:true}),files=entries.filter(e=>e.isFile()&&!e.isSymbolicLink()&&/^\d+\.json$/.test(e.name));partial=files.length>100;
    for(const entry of files.slice(0,100)){let h;try{const file=path.join(root,entry.name),s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>8192){partial=true;continue;}h=await open(file,'r');const b=Buffer.alloc(8193),r=await h.read(b,0,b.length,0);if(r.bytesRead>8192){partial=true;continue;}const v=JSON.parse(b.subarray(0,r.bytesRead).toString());if(String(v.pid)+'.json'!==entry.name){partial=true;continue;}records.push(v);}catch{partial=true;}finally{await h?.close();}}
    let identities:Identity[]=[];try{identities=await probe(records.map(r=>r.pid));}catch{partial=true;}
    const rows=records.map(v=>claudeRegistryRow(v,identities.find(p=>p.pid===v.pid),now)).filter((v):v is TaskRow=>!!v);const verified=rows.some(r=>r.event!=='registry-identity-unverified');
    return{rows,available:verified,partial:partial||rows.some(r=>r.status==='unknown'),checkedAt:now,error:verified?undefined:'NO_VERIFIED_PROCESS'};
  }catch{return{rows:[],available:false,partial:false,checkedAt:now,error:'REGISTRY_UNAVAILABLE'};}
}
export function antigravityTaskRows(data:any,now=Date.now()):TaskRow[]{
  // Protobuf JSON omits an empty map. A successful {} response is a reachable
  // service with no loaded summaries, not a disconnected source.
  if(data&&typeof data==='object'&&!Array.isArray(data)&&Object.keys(data).length===0)return[];
  const value=data?.trajectorySummaries;if(!value||typeof value!=='object')throw Error('UNSUPPORTED_TASK_SCHEMA');
  const entries=Array.isArray(value)?value:Object.values(value),rows:TaskRow[]=[];
  for(const v of entries.slice(0,100) as any[]){if(!validId(v?.trajectoryId))continue;
    // BUSY and CANCELING exist in the native enum but are not equivalent to a
    // verified running/waiting state. Keep unsupported meanings unknown.
    const status:TaskStatus=v.status==='CASCADE_RUN_STATUS_RUNNING'?'running':v.status==='CASCADE_RUN_STATUS_IDLE'?'idle':'unknown';
    const workspace=Array.isArray(v.workspaces)?v.workspaces[0]:undefined;
    const project=typeof workspace==='string'?workspace:workspace?.workspaceFolderAbsoluteUri??workspace?.workspacePath??workspace?.uri??workspace?.path;
    const input=timestamp(v.lastUserInputTime,now),end=timestamp(v.lastModifiedTime,now),steps=Number(v.stepCount),index=Number(v.lastUserInputStepIndex);
    const activityKey=input!==null&&Number.isInteger(index)&&index>=0?input+':'+index:undefined;
    const completionEvidence=status==='idle'&&v.latestExecutorTerminationReason==='EXECUTOR_TERMINATION_REASON_NO_TOOL_CALL'&&activityKey&&end!==null&&end>=input!&&Number.isInteger(steps)&&steps>index?{id:'ag-'+activityKey+'-'+steps+'-'+end,time:end}:undefined;
    rows.push({provider:'antigravity',id:'antigravity:'+v.trajectoryId,title:clean(v.summary)||'Antigravity · '+v.trajectoryId.slice(0,8),project:clean(project,512),status,source:'antigravity-rpc',host:hostname(),confirmedAt:input??end,observedAt:now,event:clean(v.status,64),activityKey,completionEvidence});
  }return rows;
}
export class AntigravityTaskReader{
  private cache:{candidate:Awaited<ReturnType<typeof discoverAntigravity>>[number];port:number;protocol:'https'|'http'}[]=[];
  constructor(private discover=discoverAntigravity,private query=localAntigravityStatus,private now=Date.now){}
  async read():Promise<Result>{
    const now=this.now(),rows:TaskRow[]=[];let succeeded=0,partial=false;
    try{
      const candidates=await this.discover();this.cache=candidates.slice(0,4).map(candidate=>{const prior=this.cache.find(s=>s.candidate.pid===candidate.pid&&s.candidate.token===candidate.token&&candidate.ports.includes(s.port));return{candidate,port:prior?.port??0,protocol:prior?.protocol??'https'};});
      const deadline=Date.now()+12000;
      for(const server of this.cache){let success=false;
        const ports=server.port?[server.port]:server.candidate.ports.slice(0,8);
        for(const port of ports){if(Date.now()>deadline)break;for(const protocol of server.port?[server.protocol]:['https','http'] as const)try{
          const data=await this.query(server.candidate,port,'GetAllCascadeTrajectories',protocol);rows.push(...antigravityTaskRows(data,now));server.port=port;server.protocol=protocol;success=true;succeeded++;break;
        }catch{/* An unsupported listener is not task evidence. */}if(success)break;}
        if(!success){partial=true;server.port=0;}
      }
      const unique=new Map<string,TaskRow>();for(const r of rows){const previous=unique.get(r.id);if(previous&&previous.status!==r.status)unique.set(r.id,{...r,status:'unknown',event:'conflicting-native-status'});else unique.set(r.id,r);}
      return{rows:[...unique.values()].slice(0,100),available:succeeded>0,partial:partial||rows.length>=100,checkedAt:now,error:succeeded?undefined:'LOCAL_SERVICE_UNAVAILABLE'};
    }catch{return{rows:[],available:false,partial:true,checkedAt:now,error:'LOCAL_SERVICE_UNAVAILABLE'};}
  }
}
export class NativeProviderTaskMonitor {
  private completionTracker:NativeCompletionTracker;private proofCursor=0;
  private rows:TaskRow[]=[];private closed=false;private claudeBusy=false;private agBusy=false;private timer?:NodeJS.Timeout;private lastAg=0;
  private claude:Result={rows:[],available:false,partial:false,checkedAt:0};private ag:Result={rows:[],available:false,partial:false,checkedAt:0};
  constructor(private root:string,private changed:()=>void,private readClaude=readClaudeRegistry,private reader=new AntigravityTaskReader(),private now=Date.now,private completed?:(value:TaskCompletion)=>void){this.completionTracker=new NativeCompletionTracker(now);}
  snapshot(){const now=this.now();return{rows:this.rows.map(r=>!r.observedAt||now-r.observedAt>25000?{...r,status:'unknown' as const}:r),claude:{available:this.claude.available&&now-this.claude.checkedAt<=25000,count:this.claude.rows.length},antigravity:{available:this.ag.available&&now-this.ag.checkedAt<=25000,count:this.ag.rows.length},partial:this.claude.partial||this.ag.partial};}
  async start(){if(this.closed)return;if(!this.timer){this.timer=setInterval(()=>void this.tick(),5000);this.timer.unref();}await this.tick();}
  private rebuild(){
    if(this.closed)return;const previous=this.rows;this.rows=[...this.claude.rows,...this.ag.rows];
    const keys=new Set(this.rows.map(r=>r.id));for(const r of previous)if(!keys.has(r.id))this.rows.push({...r,status:'unknown'});this.rows=this.rows.slice(0,200);if(this.completed)for(const item of this.completionTracker.observe(this.snapshot().rows))this.completed(item);this.changed();
  }
  private failed():Result{return{rows:[],available:false,partial:true,checkedAt:this.now()};}
  private async tickClaude(){if(this.closed||this.claudeBusy)return;this.claudeBusy=true;
    try{const value=await this.readClaude(this.root);if(this.completed){const candidates=value.rows.filter(r=>r.status==='idle'&&this.completionTracker.isTracking(r.id));const selected=Array.from({length:Math.min(8,candidates.length)},(_,i)=>candidates[(this.proofCursor+i)%candidates.length]!);this.proofCursor+=selected.length;await Promise.all(selected.map(async r=>{r.completionEvidence=await claudeEndTurn(path.dirname(this.root),r);}));}if(!this.closed)this.claude=value;}catch{if(!this.closed)this.claude=this.failed();}
    finally{this.claudeBusy=false;this.rebuild();}
  }
  private async tickAg(){if(this.closed||this.agBusy||this.lastAg&&this.now()-this.lastAg<10000)return;this.agBusy=true;this.lastAg=this.now();
    try{const value=await this.reader.read();if(!this.closed)this.ag=value;}catch{if(!this.closed)this.ag=this.failed();}
    finally{this.agBusy=false;this.rebuild();}
  }
  async tick(){if(this.closed)return;await Promise.all([this.tickClaude(),this.tickAg()]);}
  close(){this.closed=true;clearInterval(this.timer);}
}
