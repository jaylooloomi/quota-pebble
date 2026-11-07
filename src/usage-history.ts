import {appendFileSync,openSync,closeSync,readSync,existsSync,mkdirSync,readdirSync,readFileSync,renameSync,statSync,unlinkSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {Reading} from './model';

export interface UsageSample {version:1;profile:string;generation:string;source:string;window:string;label:string;time:number;used:number;reset:number|null;segment:string;reason:string;}
const DAY=86400000;
const validProfile=(id:unknown):id is string=>typeof id==='string'&&/^(claude|codex|gemini|claude-account-[0-9a-f-]{36})$/.test(id);
function validSample(x:any):x is UsageSample{return x?.version===1&&validProfile(x.profile)&&['generation','source','window','label','segment','reason'].every(k=>typeof x[k]==='string'&&x[k].length<=240)&&Number.isFinite(x.time)&&Number.isFinite(x.used)&&x.used>=0&&x.used<=100&&(x.reset===null||Number.isFinite(x.reset));}
export class UsageHistory {
  private samples:UsageSample[]=[];
  private generations:Record<string,string>={};
  private identities:Record<string,string>={};
  private last=new Map<string,UsageSample>();
  private seen=new Map<string,string>();
  private breaks=new Map<string,string>();
  private maintained=0;
  error=false;
  constructor(private directory:string,private now=Date.now,private maxBytes=50*1024*1024){
    try{
      mkdirSync(directory,{recursive:true,mode:0o700});
      try{const m=JSON.parse(readFileSync(path.join(directory,'identities.json'),'utf8'));this.identities=m.identities??{};for(const [id,g] of Object.entries(m.generations??m))if(validProfile(id)&&typeof g==='string'&&g.length<80)this.generations[id]=g;}catch{}
      this.prune();
      for(const f of this.files())for(const line of readFileSync(path.join(directory,f),'utf8').split('\n')){if(!line.trim())continue;try{const s=JSON.parse(line);if(validSample(s)&&s.time>=this.now()-90*DAY&&s.time<=this.now()+60000)this.samples.push(s);else this.error=true;}catch{this.error=true;}}
      this.samples.sort((a,b)=>a.time-b.time);
      for(const s of this.samples){const key=this.key(s.profile,s.source,s.window);if(s.generation===this.generations[s.profile])this.last.set(key,s);}
      // A new process cannot claim to have monitored the time it was closed.
      for(const id of Object.keys(this.generations))this.breaks.set(id,'restart');
    }catch{this.error=true;}
  }
  private files(){return readdirSync(this.directory).filter(f=>/^\d{4}-\d\d-\d\d\.jsonl$/.test(f)).sort();}
  private key(id:string,source:string,window:string){return JSON.stringify([id,source,window]);}
  private saveIdentities(){const f=path.join(this.directory,'identities.json');writeFileSync(f+'.tmp',JSON.stringify({generations:this.generations,identities:this.identities}),{mode:0o600});renameSync(f+'.tmp',f);}
  boundary(id:string,reason='identity'){if(!validProfile(id))return;try{this.generations[id]=randomUUID();this.seen.delete(id);this.breaks.set(id,reason);this.saveIdentities();}catch{this.error=true;}}
  gap(id:string,reason='gap'){if(validProfile(id))this.breaks.set(id,reason);}
  record(id:string,reading:Reading,observedAt:string,interval:number){
    if(!validProfile(id))return;
    const time=Date.parse(observedAt);if(!Number.isFinite(time)||time>this.now()+60000||time<this.now()-90*DAY)return;
    const signature=JSON.stringify([observedAt,reading.source,reading.identityKey,reading.windows]);if(this.seen.get(id)===signature)return;
    try{
      if(reading.identityKey&&this.identities[id]&&this.identities[id]!==reading.identityKey)this.boundary(id);
      if(reading.identityKey)this.identities[id]=reading.identityKey;
      if(!this.generations[id]){this.generations[id]=randomUUID();}this.saveIdentities();
      const rows:UsageSample[]=[];
      for(const w of reading.windows){
        if(typeof w.id!=='string'||w.id.length>240||!Number.isFinite(w.usedPercent)||w.usedPercent<0||w.usedPercent>100)continue;
        const key=this.key(id,reading.source,w.id),prev=this.last.get(key),raw=w.resetsAt?Date.parse(w.resetsAt):NaN,reset=Number.isFinite(raw)?raw:null;
        let reason=this.breaks.get(id)??'';
        if(!prev||prev.generation!==this.generations[id])reason=reason||'start';
        else if(time<=prev.time)continue;
        else if(time-prev.time>Math.max(interval,120000)*3)reason=reason||'gap';
        else if(prev.reset!==null&&time>=prev.reset&&(reset===null||reset>prev.reset+60000))reason='reset';
        else if(w.usedPercent<prev.used-0.01||prev.reset!==null&&reset!==null&&Math.abs(reset-prev.reset)>300000)reason='change';
        const row:UsageSample={version:1,profile:id,generation:this.generations[id]!,source:reading.source.slice(0,240),window:w.id,label:w.label.slice(0,240),time,used:w.usedPercent,reset,segment:reason?randomUUID():prev!.segment,reason};
        rows.push(row);
      }
      if(!rows.length)return;
      // An interrupted append can damage only the final line; the reader skips it.
      const f=path.join(this.directory,new Date(time).toISOString().slice(0,10)+'.jsonl');
      if(existsSync(f)&&statSync(f).size){const fd=openSync(f,'r');try{const tail=Buffer.alloc(1);readSync(fd,tail,0,1,statSync(f).size-1);if(tail[0]!==10)appendFileSync(f,'\n');}finally{closeSync(fd);}}
      appendFileSync(f,rows.map(s=>JSON.stringify(s)).join('\n')+'\n',{mode:0o600});
      this.samples.push(...rows);for(const s of rows)this.last.set(this.key(id,s.source,s.window),s);
      this.seen.set(id,signature);this.breaks.delete(id);this.error=false;this.prune();
    }catch{this.error=true;}
  }
  private prune(){
    const cutoff=this.now()-90*DAY;let files=this.files();
    for(const f of files)if(Date.parse(f.slice(0,10))+DAY<=cutoff)unlinkSync(path.join(this.directory,f));
    files=this.files();let total=files.reduce((n,f)=>n+statSync(path.join(this.directory,f)).size,0);
    while(total>this.maxBytes&&files.length){const f=files.shift()!;total-=statSync(path.join(this.directory,f)).size;unlinkSync(path.join(this.directory,f));}
    const retained=new Set(files.map(f=>f.slice(0,10)));
    this.samples=this.samples.filter(s=>s.time>=cutoff&&retained.has(new Date(s.time).toISOString().slice(0,10)));
  }
  query(id:unknown,window:unknown,days:unknown){
    if(!validProfile(id)||typeof window!=='string'||window.length>240||![1/3,1,7,30].includes(days as number))throw new Error('Invalid history query');
    if(this.now()-this.maintained>=DAY){try{this.prune();this.maintained=this.now();}catch{this.error=true;}}
    const now=this.now(),all=this.samples.filter(s=>s.profile===id&&s.generation===this.generations[id]&&s.time>=now-90*DAY);
    const map=new Map<string,{id:string;label:string;source:string}>();for(const s of all)map.set(JSON.stringify([s.source,s.window]),{id:JSON.stringify([s.source,s.window]),label:s.label,source:s.source});
    const windows=[...map.values()],selected=windows.find(w=>w.id===window)??windows[0];
    const points=selected?all.filter(s=>JSON.stringify([s.source,s.window])===selected.id&&s.time>=now-(days as number)*DAY&&s.time<=now):[];
    const last=points.at(-1);let increase=0,pairs=0;
    // Count only the latest continuous segment, never infer usage through gaps.
    for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!;if(b.segment===last?.segment&&a.segment===b.segment){increase+=Math.max(0,b.used-a.used);pairs++;}}
    const result:UsageSample[]=[];
    // Bucket extrema and segment boundaries survive downsampling.
    for(let i=0;i<points.length;){let end=i+1;while(end<points.length&&points[end]!.segment===points[i]!.segment)end++;
      const group=points.slice(i,end),bucket=Math.max(1,Math.ceil(points.length/800));
      for(let j=0;j<group.length;j+=bucket){const slice=group.slice(j,j+bucket),ordered=[slice[0]!,slice.reduce((a,b)=>a.used<b.used?a:b),slice.reduce((a,b)=>a.used>b.used?a:b),slice.at(-1)!];result.push(...[...new Set(ordered)].sort((a,b)=>a.time-b.time));}i=end;}
    return {windows,selected:selected?.id??'',points:result.slice(-4000),from:now-(days as number)*DAY,to:now,increase:pairs?Math.round(increase*100)/100:null,partial:points.some(p=>!!p.reason&&p.reason!=='start'),lastSync:last?.time??null,oldest:all[0]?.time??null,error:this.error};
  }
  clear(id?:string){
    try{
      if(id&&!validProfile(id))throw new Error('Invalid profile');
      if(id){this.samples=this.samples.filter(s=>s.profile!==id);delete this.generations[id];delete this.identities[id];}else{this.samples=[];this.generations={};this.identities={};}
      for(const f of this.files()){const rows=this.samples.filter(s=>new Date(s.time).toISOString().slice(0,10)===f.slice(0,10));if(rows.length){const file=path.join(this.directory,f);writeFileSync(file+'.tmp',rows.map(s=>JSON.stringify(s)).join('\n')+'\n',{mode:0o600});renameSync(file+'.tmp',file);}else unlinkSync(path.join(this.directory,f));}
      this.last.clear();this.seen.clear();this.breaks.clear();this.saveIdentities();this.error=false;return true;
    }catch{this.error=true;return false;}
  }
}
