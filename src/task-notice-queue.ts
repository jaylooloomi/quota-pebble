import type {TaskCompletion} from './task-completion';
import type {TaskIdle} from './task-idle';
export type TaskNotice=TaskCompletion|TaskIdle;
type Entry={item:TaskNotice;received:number};
export class TaskNoticeQueue {
  active:TaskNotice[]=[];activeOverflow=0;private pending:Entry[]=[];private overflow=0;private seen=new Set<string>();
  constructor(private now=Date.now,private limit=200){}
  get hasActive(){return this.active.length>0||this.activeOverflow>0;}
  get waiting(){return this.pending.length+this.overflow;}
  enqueue(item:TaskNotice):'duplicate'|'updated'|'queued'|'overflow'{
    const key=item.id+':'+item.turnId;if(this.seen.has(key))return'duplicate';
    const old=this.active.find(v=>v.id===item.id)??this.pending.find(v=>v.item.id===item.id)?.item;
    if(old&&item.kind==='idle'&&old.kind!=='idle')return'duplicate';
    this.seen.add(key);if(this.seen.size>1024)this.seen.delete(this.seen.values().next().value!);
    const active=this.active.findIndex(v=>v.id===item.id);
    if(active>=0){this.active[active]=item;this.pending=this.pending.filter(v=>v.item.id!==item.id);return'updated';}
    const pending=this.pending.findIndex(v=>v.item.id===item.id);
    if(pending>=0){this.pending[pending]!.item=item;return'queued';}
    if(this.pending.length>=this.limit){this.overflow++;return'overflow';}
    this.pending.push({item,received:this.now()});return'queued';
  }
  delay(){return this.hasActive?null:this.pending.length?Math.max(0,this.pending[0]!.received+2000-this.now()):this.overflow?0:null;}
  start(){if(this.hasActive||this.delay()!==0)return false;
    if(!this.pending.length){this.activeOverflow=this.overflow;this.overflow=0;return this.activeOverflow>0;}
    const cutoff=this.pending[0]!.received+2000;while(this.active.length<3&&this.pending[0]&&this.pending[0].received<=cutoff)this.active.push(this.pending.shift()!.item);
    return true;
  }
  take(id:string){const i=this.active.findIndex(v=>v.id===id);if(i<0)return;return this.active.splice(i,1)[0];}
  dismiss(){const items=this.active;this.active=[];this.activeOverflow=0;return items;}
  clear(){this.active=[];this.pending=[];this.overflow=0;this.activeOverflow=0;}
}
