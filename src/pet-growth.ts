import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import type {Reading} from './model';
type Role='claude'|'codex'|'gemini';
type Sample={time:number;used:number;high:number;reset:number;key:string};
type Progress={xp:number;day:string;earned:number};
const roles:Role[]=['claude','codex','gemini'];
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const valid=(n:unknown,max=1e7):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=max;
export class PetGrowth{
  private samples:Record<string,Sample>={};private progress:Record<Role,Progress>={claude:{xp:0,day:'',earned:0},codex:{xp:0,day:'',earned:0},gemini:{xp:0,day:'',earned:0}};error=false;
  constructor(private file:string,private now=Date.now){try{const raw=readFileSync(file);if(raw.length>128*1024)throw Error();const v=JSON.parse(raw.toString());if(v.version!==1)throw Error();for(const r of roles){const p=v.progress?.[r];if(p&&valid(p.xp)&&valid(p.earned,20)&&typeof p.day==='string'&&p.day.length<=10)this.progress[r]={xp:p.xp,day:p.day,earned:p.earned};}
    for(const [id,s] of Object.entries(v.samples??{}).slice(0,100) as [string,any][]){if(/^[a-f0-9]{64}$/.test(id)&&s&&valid(s.time,9e15)&&valid(s.used,100)&&valid(s.high,100)&&valid(s.reset,9e15)&&typeof s.key==='string'&&/^[a-f0-9]{64}$/.test(s.key))this.samples[id]={time:s.time,used:s.used,high:s.high,reset:s.reset,key:s.key};}
  }catch(e:any){if(e?.code!=='ENOENT')this.error=true;}}
  boundary(profile:string){delete this.samples[digest(profile)];this.save();}
  record(profile:string,reading:Reading,at:string){
    const time=Date.parse(at),now=this.now(),role=reading.provider;if(!roles.includes(role)||!Number.isFinite(time)||time>now+1000||time<now-15*60000)return;
    // Exactly one stable weekly window per profile. Never add session/model limits together.
    const weekly=reading.windows.filter(w=>/weekly|seven_day|每週|每周|7\s*天/i.test(w.id+' '+w.label)&&valid(w.usedPercent,100)&&w.resetsAt&&Date.parse(w.resetsAt)>time);
    const selected=weekly.find(w=>w.id==='seven_day')??weekly.sort((a,b)=>a.id.localeCompare(b.id))[0];if(!selected)return;
    const id=digest(profile),reset=Date.parse(selected.resetsAt!),key=digest([reading.identityKey??profile,reading.source,selected.id].join('\0')),previous=this.samples[id];if(previous&&time<=previous.time)return;
    const same=previous&&previous.key===key&&time<previous.reset&&Math.abs(reset-previous.reset)<=300000;
    const delta=same?Math.max(0,selected.usedPercent-previous.high):0;
    this.samples[id]={time,used:selected.usedPercent,high:same?Math.max(previous.high,selected.usedPercent):selected.usedPercent,reset,key};
    if(Object.keys(this.samples).length>100){const oldest=Object.keys(this.samples).sort((a,b)=>this.samples[a]!.time-this.samples[b]!.time)[0]!;delete this.samples[oldest];}
    const date=new Date(now),day=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-'),p=this.progress[role];if(p.day!==day){p.day=day;p.earned=0;}
    const earned=Math.min(delta,Math.max(0,20-p.earned));p.xp=Math.min(1e7,p.xp+earned);p.earned+=earned;this.save();
  }
  snapshot(){const result:any={error:this.error};for(const role of [...roles,'octopus'] as const){const xp=role==='octopus'?roles.reduce((sum,r)=>sum+this.progress[r].xp,0)/3:this.progress[role].xp;const levels=[0,20,60,150],level=levels.filter(n=>xp>=n).length,base=levels[level-1]!,next=levels[level]??null;result[role]={xp:Math.round(xp*10)/10,level,progress:next===null?100:Math.floor((xp-base)/(next-base)*100),next};}return result;}
  private save(){try{mkdirSync(path.dirname(this.file),{recursive:true});writeFileSync(this.file+'.tmp',JSON.stringify({version:1,samples:this.samples,progress:this.progress}),{mode:0o600});renameSync(this.file+'.tmp',this.file);this.error=false;}catch{this.error=true;}}
}
