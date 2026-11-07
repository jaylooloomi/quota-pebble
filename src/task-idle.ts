import type {TaskRow} from './task-monitor';
export type TaskIdle={kind:'idle';id:string;turnId:string;title:string;host:string;provider:'codex'|'claude'|'antigravity';time:number};
type State={seen:number;status:string;runAt:number;cycle:number;since:number;count:number;sent:boolean};
// Observation timestamps must advance: rendering or repeatedly reading a cached
// snapshot cannot satisfy the second observation or the 30-second stability gate.
export class IdleTracker {
  private states=new Map<string,State>();private cooldown=new Map<string,number>();private completed=new Map<string,number>();private sequence=0;
  private decisions:Record<string,number>={};
  private audit(provider:string,reason:string){const key=provider+':'+reason;this.decisions[key]=(this.decisions[key]??0)+1;}
  diagnostics(){return{tracked:this.states.size,armed:[...this.states.values()].filter(s=>!!s.runAt&&!s.sent).length,pending:[...this.states.values()].filter(s=>!!s.since&&!s.sent).length,decisions:{...this.decisions}};}
  constructor(private now=Date.now){}
  reset(){this.states.clear();}
  completion(id:string){this.completed.set(id,this.now());this.trim(this.completed);}
  private trim(map:Map<string,number>){while(map.size>512)map.delete(map.keys().next().value!);}
  observe(rows:TaskRow[],enabled=true):TaskIdle[]{
    if(!enabled){this.reset();return[];}
    const now=this.now(),today=new Date(now).toDateString(),present=new Set<string>(),result:TaskIdle[]=[];
    for(const row of rows){
      const provider=row.provider==='claude'?'claude':row.provider==='antigravity'||row.provider==='gemini'?'antigravity':'codex';
      const key=JSON.stringify([provider,row.host||'',row.id]);present.add(key);
      const at=row.observedAt,ttl=['claude-remote','antigravity-remote'].includes(row.source)?150000:row.source==='remote'?65000:['claude-registry','antigravity-rpc'].includes(row.source)?25000:10000;
      if(typeof at!=='number'||!Number.isFinite(at)||at>now+1000||now-at>ttl||row.status==='unknown'){if(this.states.has(key))this.audit(provider,'observation_lost');this.states.delete(key);continue;}
      let s=this.states.get(key);if(s&&at<=s.seen)continue;
      if(s&&at-s.seen>ttl){this.states.delete(key);s=undefined;}
      if(!s){s={seen:at,status:row.status,runAt:row.status==='running'?now:0,cycle:++this.sequence,since:0,count:0,sent:false};this.states.set(key,s);this.audit(provider,row.status==='running'?'baseline_running':'baseline_nonrunning');continue;}
      s.seen=at;
      if(row.status==='running'){
        if(s.status!=='running'){s.cycle=++this.sequence;s.sent=false;this.audit(provider,'running_observed');}
        s.runAt=now;s.since=0;s.count=0;
      }else if(row.status==='idle'&&s.runAt&&new Date(s.runAt).toDateString()===today){
        if(s.status!=='idle'){s.since=at;s.count=1;this.audit(provider,'idle_pending');}else s.count++;
        // Successful completion wins even when its evidence arrives before the
        // idle status snapshot. A later running cycle can become eligible again.
        if((this.completed.get(row.id)??-Infinity)>=s.runAt){if(!s.sent)this.audit(provider,'completed_priority');s.sent=true;}
        if(!s.sent&&s.count>=2&&at-s.since>=30000){
          s.sent=true; // Per-task cooldown drops only repeated activity; global bursts are batched by the notice queue.
          if(now-(this.cooldown.get(key)??-Infinity)>=600000){
            this.cooldown.set(key,now);this.trim(this.cooldown);
            this.audit(provider,'eligible');
            result.push({kind:'idle',id:row.id,turnId:'idle-'+s.cycle,title:row.title.slice(0,160),host:(row.host||'').slice(0,80),provider,time:now});
          }else this.audit(provider,'task_cooldown');
        }
      }else{s.runAt=0;s.since=0;s.count=0;}
      s.status=row.status;
    }
    for(const key of this.states.keys())if(!present.has(key))this.states.delete(key);
    return result;
  }
}
