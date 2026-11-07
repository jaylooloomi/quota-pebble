import {open,lstat} from 'node:fs/promises';
import path from 'node:path';
import type {TaskRow} from './task-monitor';
import type {TaskCompletion} from './task-completion';
// Fixed-size tail, exact registry session, no Hooks or message content retained.
export async function claudeEndTurn(root:string,row:TaskRow):Promise<TaskRow['completionEvidence']>{
  const match=/^claude:([\w-]{1,128}):\d+$/.exec(row.id);if(!match||row.status!=='idle')return;
  const dir=path.join(root,'projects',row.project.replace(/[^a-zA-Z0-9]/g,'-')),file=path.join(dir,match[1]+'.jsonl');let handle;
  try{
    for(const p of [root,path.join(root,'projects'),dir]){const s=await lstat(p);if(!s.isDirectory()||s.isSymbolicLink())return;}
    const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink())return;
    handle=await open(file,'r');const size=(await handle.stat()).size,start=Math.max(0,size-131072),b=Buffer.alloc(Math.min(size,131072));const read=await handle.read(b,0,b.length,start);let last:any;
    for(const line of b.subarray(0,read.bytesRead).toString('utf8').split('\n').slice(start?1:0)){
      if(!/"type"\s*:\s*"(?:assistant|user)"/.test(line))continue;
      try{const v=JSON.parse(line);if(!['assistant','user'].includes(v.type)||v.sessionId!==match[1]||v.isSidechain)continue;
        const time=Date.parse(v.timestamp);if(!Number.isFinite(time))continue;
        // Only metadata crosses this boundary. Later input/tools/errors replace
        // a prior end_turn candidate; an API error is never normal completion.
        last={id:typeof v.uuid==='string'&&/^[\w-]{1,128}$/.test(v.uuid)?v.uuid:'',time,ok:v.type==='assistant'&&v.message?.stop_reason==='end_turn'&&!v.isApiErrorMessage&&!v.error};
      }catch{/* Incomplete tails are not success evidence. */}
    }
    return last?.ok&&last.id?{id:last.id,time:last.time}:undefined;
  }catch{return;}finally{await handle?.close();}
}
export class NativeCompletionTracker {
  private active=new Map<string,{start:number;seen:number;activity?:string;idleAt:number;idleSince?:number;proof?:string}>();private emitted=new Set<string>();
  constructor(private now=Date.now){}
  isTracking(id:string){return this.active.has(id);}
  reset(){this.active.clear();}
  observe(rows:TaskRow[]):TaskCompletion[]{
    const now=this.now(),present=new Set(rows.map(r=>r.id)),out:TaskCompletion[]=[];
    for(const id of this.active.keys())if(!present.has(id))this.active.delete(id);
    for(const r of rows){const at=r.observedAt,s=this.active.get(r.id);
      if(!['claude','antigravity'].includes(r.provider||'')||!at||at>now+1000||now-at>25000||r.status==='unknown'||s&&at-s.seen>25000){this.active.delete(r.id);continue;}
      if(s&&at<=s.seen)continue;
      if(r.status==='running'){
        if(!s||s.idleSince!==undefined||s.activity!==r.activityKey)this.active.set(r.id,{start:at,seen:at,activity:r.activityKey,idleAt:0});else s.seen=at;
        continue;
      }
      if(!s)continue;s.seen=at;
      if(r.status!=='idle'||s.activity!==r.activityKey){this.active.delete(r.id);continue;}
      s.idleSince??=at;if(at-s.idleSince>120000){this.active.delete(r.id);continue;}
      const proof=r.completionEvidence;
      if(!proof||proof.time<s.start-1000||proof.time>now+1000||now-proof.time>120000){s.idleAt=0;s.proof=undefined;continue;}
      if(!s.idleAt||s.proof!==proof.id){s.idleAt=at;s.proof=proof.id;continue;}
      if(at-s.idleAt<5000)continue;
      const key=r.id+':'+proof.id;this.active.delete(r.id);if(this.emitted.has(key))continue;
      this.emitted.add(key);if(this.emitted.size>512)this.emitted.delete(this.emitted.values().next().value!);
      out.push({id:r.id,turnId:proof.id,title:r.title.slice(0,160),host:(r.host||'').slice(0,80),provider:r.provider as 'claude'|'antigravity',time:proof.time});
    }return out;
  }
}
