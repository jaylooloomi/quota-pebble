import {appendFileSync,existsSync,mkdirSync,renameSync,rmSync,statSync} from 'node:fs';
import path from 'node:path';
export class Diagnostics {
  readonly file:string;
  private previous=new Map<string,string>();
  private authSeen=new Set<string>();
  private taskBeat=0;
  constructor(directory:string,private maxBytes=1024*1024){this.file=path.join(directory,'diagnostics.jsonl');}
  private write(event:Record<string,unknown>){
    try{
      mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});
      if(existsSync(this.file)&&statSync(this.file).size>=this.maxBytes){rmSync(this.file+'.1',{force:true});renameSync(this.file,this.file+'.1');}
      appendFileSync(this.file,JSON.stringify({time:new Date().toISOString(),...event})+'\n',{mode:0o600});
    }catch{/* Diagnostics must never interrupt monitoring. */}
  }
  startup(version:string,enabled:Record<string,boolean>){this.write({event:'startup',version:version.replace(/[^0-9.]/g,'').slice(0,24),enabled:{claude:enabled.claude,codex:enabled.codex,gemini:enabled.gemini}});}
  sourceToggle(provider:string,enabled:boolean){if(['claude','codex','gemini'].includes(provider))this.write({event:'source_toggle',origin:'settings',provider,enabled});}
  webMigration(stage:string){if(['already-bound','missing-transfer','invalid-transfer','decrypt-failed','imported','failed'].includes(stage))this.write({event:'claude_web_migration',stage});}
  taskNotice(kind:string,provider:string,stage:string){if(['idle','completed'].includes(kind)&&['codex','claude','antigravity'].includes(provider)&&['eligible','queued','shown','hidden','closed','viewed','expired','cleared'].includes(stage))this.write({event:'task_notice',kind,provider,stage});}
  taskMonitor(tasks:any,tracker:any,flags:{enabled:boolean;paused:boolean;visible:boolean}){
    const counts=Object.fromEntries(['codex','claude','antigravity'].map(provider=>[provider,Object.fromEntries(['running','waiting','idle','unknown'].map(status=>[status,(tasks?.rows??[]).filter((r:any)=>(r.provider??'codex')===provider&&r.status===status).length]))]));
    const decisions:Record<string,number>={};for(const [key,value] of Object.entries(tracker.decisions??{}))if(/^(codex|claude|antigravity):(baseline_running|baseline_nonrunning|observation_lost|running_observed|idle_pending|completed_priority|eligible|task_cooldown|global_cooldown)$/.test(key)&&typeof value==='number'&&Number.isFinite(value))decisions[key]=value;
    const count=(v:unknown)=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=200?v:0;
    const summary={event:'task_monitor',enabled:flags.enabled===true,paused:flags.paused===true,visible:flags.visible===true,liveCoverage:tasks?.liveCoverage===true,counts,tracker:{tracked:count(tracker.tracked),armed:count(tracker.armed),pending:count(tracker.pending),decisions}},serialized=JSON.stringify(summary);
    if(this.previous.get('task-monitor')!==serialized||Date.now()-this.taskBeat>=60000){this.previous.set('task-monitor',serialized);this.taskBeat=Date.now();this.write(summary);}
  }
  observe(snapshot:any){
    for(const id of Object.keys(snapshot.auth??{}))if(/^(claude|codex|gemini|claude-account-[0-9a-f-]{36})$/.test(id))this.authSeen.add(id);
    for(const id of this.authSeen){
      const auth=snapshot.auth?.[id];
      const phase=auth?.phase??'none';
      if(!['none','web_login','authorizing','connecting','code','verifying','syncing','cooldown','waiting','ready','error'].includes(phase))continue;
      // Phase/flags only: never log the authorization URL, code or messages.
      const summary={event:'auth_state',provider:id,phase,pending:auth?.pending===true,codeRequired:auth?.codeRequired===true,canReopen:auth?.canReopen===true},serialized=JSON.stringify(summary);
      if(this.previous.get('auth:'+id)!==serialized){this.previous.set('auth:'+id,serialized);this.write(summary);}
    }
    for(const [id,r] of Object.entries(snapshot.morningHello??{}) as [string,any][]){
      if(!/^(claude|claude-account-[0-9a-f-]{36})$/.test(id)||!['sending','sent','confirmed','active','error','uncertain'].includes(r?.status))continue;
      const summary={event:'morning_hello',provider:id,status:r.status,day:/^\d{4}-\d\d-\d\d$/.test(r.day)?r.day:null,code:['auth','network','schema','rate_limit','missing_cli','storage'].includes(r.code)?r.code:null},serialized=JSON.stringify(summary);
      if(this.previous.get('hello:'+id)!==serialized){this.previous.set('hello:'+id,serialized);this.write(summary);}
    }
    for(const [id,state] of Object.entries(snapshot.providers??{}) as [string,any][]){
      if(!/^(claude|codex|gemini|claude-account-[0-9a-f-]{36})$/.test(id))continue;
      const stamp=(value:unknown)=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT/.test(value)&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
      // Explicit allowlist: never serialize tokens, account labels, emails, URLs,
      // exception text or raw service responses into diagnostic files.
      const summary={event:'provider_state',provider:id,enabled:state.enabled===true,status:['loading','ready','unavailable','stale','signed_out'].includes(state.status)?state.status:'unknown',refreshing:state.refreshing===true,updatedAt:stamp(state.updatedAt),nextPollAt:typeof state.nextPollAt==='number'&&Number.isFinite(state.nextPollAt)?state.nextPollAt:null,hasError:!!state.error,errorCode:['auth','network','schema','missing_cli','rate_limit'].includes(state.errorCode)?state.errorCode:null,windows:(Array.isArray(state.reading?.windows)?state.reading.windows:[]).slice(0,40).map((w:any,index:number)=>({index,kind:/five_hour|session/.test(w.id)?'session':/seven_day|weekly|每週|7\s*天/.test(`${w.id} ${w.label}`)?'weekly':'other',usedPercent:typeof w.usedPercent==='number'&&Number.isFinite(w.usedPercent)&&w.usedPercent>=0&&w.usedPercent<=100?w.usedPercent:null,resetsAt:stamp(w.resetsAt)}))};
      const serialized=JSON.stringify(summary);if(this.previous.get(id)!==serialized){this.previous.set(id,serialized);this.write(summary);}
    }
  }
}
