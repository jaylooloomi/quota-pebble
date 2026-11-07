import {CodexSessionReader} from './codex-session-reader';
import type {TaskCompletion} from './task-completion';
import type {TaskRow} from './task-monitor';
// Task monitoring is deliberately filesystem-only: no CLI, RPC or Hook source.
export class LocalTaskMonitor{
  private reader:CodexSessionReader;private enabled=false;private busy=false;private closed=false;
  private checkedAt:number|null=null;private timer:NodeJS.Timeout|undefined;private checking=false;
  private rows:TaskRow[]=[];private available=false;private partial=false;
  constructor(sessionsRoot:string,private changed:()=>void,private now=Date.now,private completed?:(value:TaskCompletion)=>void){this.reader=new CodexSessionReader(sessionsRoot,now);}
  snapshot(){const rank={waiting:0,running:1,idle:2,unknown:3};const rows=this.enabled?[...this.rows].sort((a,b)=>rank[a.status]-rank[b.status]||(b.confirmedAt??0)-(a.confirmedAt??0)).slice(0,100):[];
    return{enabled:this.enabled,connection:this.checking&&this.checkedAt===null?'checking':this.available?'local':'unavailable',liveCoverage:this.enabled&&this.available,inferred:this.available,partial:this.partial,checkedAt:this.checkedAt,reader:this.reader.diagnostics(),rows,counts:Object.fromEntries(['running','waiting','idle','unknown'].map(s=>[s,rows.filter(r=>r.status===s).length])),scope:'local-records',limit:100};}
  async start(){if(this.closed)return;if(!this.enabled){this.enabled=true;this.timer=setInterval(()=>void this.tick(),2000);this.timer.unref();}await this.tick();}
  async tick(){if(this.closed||!this.enabled||this.busy)return;this.busy=true;this.checking=true;
    // Publish a complete scan atomically; IPC must never see half-scanned rows.
    try{await this.reader.scan();if(!this.closed){this.rows=this.reader.rows();this.available=this.reader.available;this.partial=this.reader.partial;this.checkedAt=this.now();for(const item of this.reader.drainCompletions())this.completed?.(item);}}
    finally{this.checking=false;this.busy=false;if(!this.closed)this.changed();}
  }
  close(){this.closed=true;clearInterval(this.timer);}
}
