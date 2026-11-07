import {readFileSync,writeFileSync,renameSync,mkdirSync,statSync} from 'node:fs';
import path from 'node:path';
import type {TaskRow} from './task-monitor';
type Peak={count:number;at:number;startedAt:number};
// Observed concurrency only, not account capacity and not reconstructed history.
export class TaskPeak {
  private value:Peak|null=null;private saved='';private error=false;
  constructor(private file:string,private now=Date.now){
    try{if(statSync(file).size>1024)throw Error('SIZE');const v=JSON.parse(readFileSync(file,'utf8'));if(v.version!==1||!Number.isInteger(v.count)||v.count<0||v.count>100||!Number.isFinite(v.at)||!Number.isFinite(v.startedAt)||v.startedAt<=0||v.at<v.startedAt)throw Error('SCHEMA');this.value={count:v.count,at:v.at,startedAt:v.startedAt};this.saved=JSON.stringify(this.value);}catch{/* Missing or invalid records do not invent a peak. */}
  }
  snapshot(){return{...this.value,count:this.value?.count??null,error:this.error};}
  observe(tasks:{liveCoverage?:boolean;rows:TaskRow[]},enabled=true){
    if(!enabled||!tasks.liveCoverage)return;
    const now=this.now(),seen=new Set<string>();
    for(const r of tasks.rows){const at=r.observedAt,ttl=r.source==='remote'?65000:['claude-registry','antigravity-rpc'].includes(r.source)?25000:10000;
      if(r.status==='running'&&typeof at==='number'&&Number.isFinite(at)&&at<=now+1000&&now-at<=ttl)seen.add(JSON.stringify([r.provider||'codex',r.host||'',r.id]));
    }
    const count=Math.min(100,seen.size);
    if(!this.value||count>this.value.count)this.value={count,at:now,startedAt:this.value?.startedAt??now};
    const serialized=JSON.stringify(this.value);if(serialized===this.saved)return;
    try{mkdirSync(path.dirname(this.file),{recursive:true});writeFileSync(this.file+'.tmp',JSON.stringify({version:1,...this.value}),{mode:0o600});renameSync(this.file+'.tmp',this.file);this.saved=serialized;this.error=false;}catch{this.error=true;}
  }
}
