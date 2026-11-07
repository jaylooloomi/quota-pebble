import {open,readdir,lstat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import type {TaskCompletion} from './task-completion';
import type {TaskRow,TaskStatus} from './task-monitor';

// Independent metadata-only implementation, informed by Ocelin's bounded
// reader / event reducer. No transcript bodies or tool arguments are retained.
const CHUNK=256*1024,HEAD=64*1024,MAX_FILES=200,MAX_CANDIDATES=5000;
export const SESSION_FRESH_MS=5*60_000;
const validId=(s:unknown):s is string=>typeof s==='string'&&/^[\w-]{1,128}$/.test(s);
const text=(s:unknown,n=512)=>typeof s==='string'?s.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,n):'';
type State={id:string;project:string;parent:boolean;turn:string;retired:Set<string>;terminal:boolean;status:TaskStatus;time:number;reason:string;waitingCall?:string};
type Cursor={state:State;offset:number;size:number;mtime:number;identity:string;prefix:string;prefixLength:number;skip:boolean};
// A continued rollout can append a segment UUID after the thread UUID.
const ROLLOUT_NAME=/^rollout-.*-([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})(?:_[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})?\.jsonl$/i;
export class CodexSessionReader{
  private files=new Map<string,Cursor>();private busy=false;private discovery=0;private candidates:string[]=[];private names=new Map<string,string>();
  private completedKeys=new Set<string>();private completions:TaskCompletion[]=[];private readingBaseline=true;
  drainCompletions(){return this.completions.splice(0);}
  available=false;partial=false;bytesRead=0;private readFailures=0;
  constructor(private root:string,private now=Date.now){}
  diagnostics(){
    const cursors=[...this.files.values()],normalized=(v:string)=>path.resolve(v).replace(/\\/g,'/').replace(/^\/+\?\/+/,'').replace(/\/+/g,'/').replace(/\/$/,'').toLowerCase(),fingerprint=(v:string)=>createHash('sha256').update(v).digest('hex').slice(0,16);
    return{rootKind:normalized(this.root)===normalized(path.join(homedir(),'.codex','sessions'))?'default':'custom',rootFingerprint:fingerprint(normalized(this.root)),indexedFiles:cursors.length,candidateFiles:this.candidates.length,excludedSubagents:cursors.filter(c=>c.state.parent).length,missingMetadata:cursors.filter(c=>!c.state.project).length,readFailures:this.readFailures,bytesRead:this.bytesRead,backlogBytes:cursors.reduce((n,c)=>n+Math.max(0,c.size-c.offset),0),recent:cursors.sort((a,b)=>b.mtime-a.mtime||b.state.time-a.state.time).slice(0,10).map(c=>({sessionFingerprint:fingerprint(c.state.id),kind:!c.state.project?'metadata-missing':c.state.parent?'subagent':'main',status:c.state.status,event:c.state.reason,lastEventAt:c.state.time,fileModifiedAt:c.mtime,terminal:c.state.terminal,backlogBytes:Math.max(0,c.size-c.offset)}))};
  }
  private empty(id:string):State{return{id,project:'',parent:false,turn:'',retired:new Set(),terminal:false,status:'unknown',time:0,reason:'no-events'};}
  private consume(s:State,r:any){
    if(r?.type==='session_meta'){
      const p=r.payload;if(!validId(p?.id)||p.id!==s.id)return;
      s.project=text(p.cwd);s.parent=!!(p.parent_thread_id||p.source?.subagent);return;
    }
    const time=Date.parse(r?.timestamp);if(!Number.isFinite(time)||time>this.now()+1000||time<s.time)return;
    const p=r.payload;if(!p||typeof p!=='object')return;
    let status:TaskStatus|undefined,reason='',turn=validId(p.turn_id)?p.turn_id:'';
    if(r.type==='event_msg'){
      if(['task_started','turn_started'].includes(p.type)){status='running';reason='turn-start';}
      else if(['task_complete','task_completed','turn_complete','turn_completed','turn_aborted'].includes(p.type)){status='idle';reason=p.type==='turn_aborted'?'interrupted':'turn-complete';}
      else if(p.type==='request_user_input'||p.type==='exec_approval_request'||p.type==='apply_patch_approval_request'){status='waiting';reason='recorded-wait';}
      else if(p.type==='item_completed'){status='running';reason='item-activity';}
      // token_count alone cannot establish that a turn is running.
    }else if(r.type==='token_usage_record'&&turn){status='running';reason='turn-activity';}
    else if(r.type==='response_item'){
      if(['function_call','custom_tool_call'].includes(p.type)){status=/request_user_input$/.test(p.name||'')?'waiting':'running';reason=status==='waiting'?'recorded-wait':'tool-activity';}
      else if(['function_call_output','custom_tool_call_output'].includes(p.type)){status='running';reason='tool-result';}
      // A final message can precede a Stop-hook continuation. Wait for the
      // explicit terminal event instead of permanently ending the turn here.
      else if(p.type==='message'&&p.role==='assistant'&&['final','final_answer'].includes(p.phase)){status='unknown';reason='final-answer';}
    }
    if(!status)return;
    if(s.status==='waiting'&&status==='running'&&reason!=='turn-start'){
      if(reason!=='tool-result'||s.waitingCall&&p.call_id!==s.waitingCall)return;
    }
    if(turn&&s.turn&&turn!==s.turn){
      if(s.retired.has(turn)||reason!=='turn-start'&&status!=='running')return;
      s.retired.add(s.turn);if(s.retired.size>100)s.retired.delete(s.retired.values().next().value!);
      s.turn=turn;s.terminal=false;
    }else if(turn&&!s.turn)s.turn=turn;
    // Sparse trailing output must not reopen an already finished turn.
    if(s.terminal&&reason!=='turn-start')return;
    if(reason==='turn-start'){s.terminal=false;if(turn)s.turn=turn;}
    if(status==='waiting')s.waitingCall=typeof p.call_id==='string'?p.call_id:undefined;
    else if(reason==='tool-result'||status==='idle'||reason==='turn-start')s.waitingCall=undefined;
    if(status==='idle'){
      if(!this.readingBaseline&&!s.parent&&!!s.project&&reason==='turn-complete'&&turn&&turn===s.turn&&(p.status===undefined||p.status==='completed'||p.status?.type==='completed')&&!p.error&&!p.aborted&&!p.cancelled&&this.now()-time<120000&&!this.completedKeys.has(s.id+':'+turn)){
        this.completedKeys.add(s.id+':'+turn);if(this.completedKeys.size>1000)this.completedKeys.delete(this.completedKeys.values().next().value!);
        this.completions.push({id:s.id,turnId:turn,title:this.names.get(s.id)||'Codex session',host:'',provider:'codex',time});if(this.completions.length>100)this.completions.shift();
      }s.terminal=true;
    }
    s.status=status;s.time=time;s.reason=reason;
  }
  private lines(c:Cursor,b:Buffer,start:number){
    let position=0;
    for(;;){const end=b.indexOf(10,position);if(end<0)break;
      if(c.skip)c.skip=false;
      else if(end-position<=CHUNK){try{this.consume(c.state,JSON.parse(b.subarray(position,end).toString('utf8')));}catch{/* Partial or unsupported records are not evidence. */}}
      position=end+1;
    }
    if(position===0&&b.length===CHUNK){c.skip=true;return start+b.length;}
    return start+position;
  }
  private async read(file:string){
    const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Not a regular file');
    const handle=await open(file,'r');
    try{
      let c=this.files.get(file);this.readingBaseline=!c;const identity=`${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
      if(c&&c.size===stat.size&&c.mtime===stat.mtimeMs&&c.offset===stat.size)return;
      const prefix=Buffer.alloc(Math.min(c?.prefixLength??1024,stat.size));await handle.read(prefix,0,prefix.length,0);this.bytesRead+=prefix.length;
      const digest=createHash('sha256').update(prefix).digest('hex');
      if(!c||c.identity!==identity||stat.size<c.offset||c.prefix!==digest||stat.size===c.size&&stat.mtimeMs!==c.mtime){
        const id=ROLLOUT_NAME.exec(path.basename(file))?.[1];if(!id)return;
        this.readingBaseline=true;c={state:this.empty(id),offset:0,size:0,mtime:0,identity,prefix:digest,prefixLength:prefix.length,skip:false};this.files.set(file,c);
        if(stat.size>HEAD+CHUNK){
          const head=Buffer.alloc(HEAD);await handle.read(head,0,head.length,0);this.bytesRead+=head.length;
          for(const line of head.toString('utf8').split('\n')){try{const r=JSON.parse(line);if(r.type==='session_meta')this.consume(c.state,r);}catch{}}
          c.offset=stat.size-CHUNK;c.skip=true;
        }
      }
      // A large append (images, compaction or tool output) must not leave the
      // monitor minutes behind the live turn. Drop unobserved history and
      // bootstrap a bounded latest tail; never emit completion from the gap.
      if(stat.size-c.offset>CHUNK*2){
        const previous=c.state;c.state=this.empty(previous.id);
        c.state.project=previous.project;c.state.parent=previous.parent;
        c.state.reason='backlog-skipped';c.offset=stat.size-CHUNK;c.skip=true;
        this.readingBaseline=true;this.partial=true;
      }
      for(let i=0;i<2&&c.offset<stat.size;i++){
        const b=Buffer.alloc(Math.min(CHUNK,stat.size-c.offset)),{bytesRead}=await handle.read(b,0,b.length,c.offset);this.bytesRead+=bytesRead;
        const next=this.lines(c,b.subarray(0,bytesRead),c.offset);if(next===c.offset)break;c.offset=next;
      }
      c.size=stat.size;c.mtime=stat.mtimeMs;
    }finally{await handle.close();}
  }
  private async discover(){
    const paths:string[]=[];const walk=async(dir:string,depth:number)=>{
      if(depth>3||paths.length>=MAX_CANDIDATES)return;
      const entries=await readdir(dir,{withFileTypes:true});entries.sort((a,b)=>b.name.localeCompare(a.name));
      for(const e of entries){if(paths.length>=MAX_CANDIDATES)break;if(e.isSymbolicLink())continue;const f=path.join(dir,e.name);
        if(e.isDirectory()&&/^\d{2,4}$/.test(e.name))await walk(f,depth+1).catch(()=>{});
        else if(e.isFile()&&/^rollout-.*\.jsonl$/.test(e.name))paths.push(f);
      }
    };
    await walk(this.root,0);const ranked: {file:string;time:number}[]=[];
    for(let i=0;i<paths.length;i+=32)await Promise.all(paths.slice(i,i+32).map(async file=>{try{ranked.push({file,time:(await lstat(file)).mtimeMs});}catch{}}));
    ranked.sort((a,b)=>b.time-a.time);this.candidates=ranked.slice(0,MAX_FILES).map(r=>r.file);this.partial=paths.length>=MAX_CANDIDATES||ranked.length>MAX_FILES;
    const kept=new Set(this.candidates);for(const file of this.files.keys())if(!kept.has(file))this.files.delete(file);
    // Index contains names only; read a bounded tail and never derive liveness from it.
    this.names.clear();let h;try{h=await open(path.join(this.root,'..','session_index.jsonl'),'r');const s=await h.stat(),start=Math.max(0,s.size-1024*1024),b=Buffer.alloc(Math.min(s.size,1024*1024));await h.read(b,0,b.length,start);for(const line of b.toString('utf8').split('\n').slice(start?1:0)){try{const r=JSON.parse(line);if(validId(r.id))this.names.set(r.id,text(r.thread_name,160));}catch{}}}catch{}finally{await h?.close();}
  }
  async scan(){if(this.busy)return;this.busy=true;this.bytesRead=0;this.readFailures=0;
    try{const s=await lstat(this.root);if(!s.isDirectory()||s.isSymbolicLink())throw Error('Missing session root');
      if(!this.discovery||this.now()-this.discovery>=10000){await this.discover();this.discovery=this.now();}
      for(const file of this.candidates){if(this.bytesRead>=16*1024*1024){this.partial=true;break;}try{await this.read(file);}catch{this.readFailures++;this.files.delete(file);}}
      this.available=true;
    }catch{this.available=false;this.files.clear();this.candidates=[];this.discovery=0;}finally{this.busy=false;}
  }
  rows():TaskRow[]{
    const now=this.now(),latest=new Map<string,Cursor>();
    for(const cursor of this.files.values()){
      const state=cursor.state;
      if(state.parent||!state.project)continue;
      const previous=latest.get(state.id);
      // File modification time can lag the events recorded by Codex.
      if(!previous||state.time>previous.state.time||state.time===previous.state.time&&state.terminal&&!previous.state.terminal){
        latest.set(state.id,cursor);
      }
    }
    return [...latest.values()].map(c=>{
      const s=c.state,fresh=now-s.time<=SESSION_FRESH_MS;
      return{provider:'codex',id:s.id,title:this.names.get(s.id)||'Codex session',project:s.project,status:c.size-c.offset>CHUNK?'unknown':s.status==='idle'?'idle':fresh?s.status:'unknown',source:'rollout',confirmedAt:s.time||null,event:s.reason,evidence:'inferred'};
    });
  }
}
