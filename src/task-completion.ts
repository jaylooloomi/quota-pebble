import type {TaskRow} from './task-monitor';
export type TaskCompletion={kind?:'completed';id:string;turnId:string;title:string;host:string;provider:'codex'|'claude'|'antigravity';time:number};
// Explicit successful terminal evidence only. A baseline, idle, disconnect or
// assistant final message is never sufficient to announce completion.
export class CompletionTracker {
  private seen=new Map<string,{proof:string;time:number}>();private emitted=new Set<string>();
  reset(){this.seen.clear();}
  observe(row:TaskRow,turnId:string,status:string,time:number):TaskCompletion|undefined {
    if(!turnId||turnId.length>128||!Number.isFinite(time))return;
    const previous=this.seen.get(row.id);this.seen.set(row.id,{proof:turnId+':'+status,time:Date.now()});
    if(this.seen.size>300)this.seen.delete(this.seen.keys().next().value!);
    const key=row.id+':'+turnId;
    if(!previous||status!=='completed'||previous.proof===turnId+':completed'||this.emitted.has(key))return;
    // Require the same observed active turn. A different turn or a failure
    // must not turn a later idle observation into successful completion.
    if(previous.proof!==turnId+':inProgress'||Date.now()-previous.time>65000)return;
    if(Date.now()-time>120000||time>Date.now()+1000)return;
    this.emitted.add(key);if(this.emitted.size>512)this.emitted.delete(this.emitted.values().next().value!);
    return{id:row.id,turnId,title:row.title.slice(0,160),host:(row.host||'').slice(0,80),provider:'codex',time};
  }
}
export function bubbleBounds(parent:{x:number;y:number;width:number;height:number},area:{x:number;y:number;width:number;height:number},anchor:number,height=142,preferredWidth=300){
  const width=Math.min(preferredWidth,area.width),tip=Math.max(parent.x,Math.min(parent.x+parent.width,parent.x+anchor)),header=Math.min(60,parent.height);
  height=Math.min(height,area.height);
  const clampX=(x:number)=>Math.round(Math.max(area.x,Math.min(area.x+area.width-width,x))),clampY=(y:number)=>Math.round(Math.max(area.y,Math.min(area.y+area.height-height,y)));
  let x=clampX(tip-width/2),y:number,placement:'above'|'below'|'left'|'right';
  if(parent.y-height-4>=area.y){placement='above';y=clampY(parent.y-height-4);}
  // Keep fallback notices near the header, never below the entire expanded
  // panel. Prefer an exterior side so quota rows and controls stay accessible.
  else if(parent.x+parent.width+8+width<=area.x+area.width){placement='right';x=clampX(parent.x+parent.width+8);y=clampY(parent.y+header/2-height/2);}
  else if(parent.x-8-width>=area.x){placement='left';x=clampX(parent.x-8-width);y=clampY(parent.y+header/2-height/2);}
  else{placement='below';y=clampY(parent.y+header+4);}
  return{x,y,width,height,placement,above:placement==='above',tip:Math.max(24,Math.min(width-24,tip-x)),sideTip:Math.max(24,Math.min(height-24,parent.y+header/2-y))};
}
