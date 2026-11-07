import {AntigravityRemoteTaskMonitor,mergeAntigravityTasks} from './antigravity-remote-tasks';
import {ClaudeRemoteTaskMonitor,ClaudeTaskProfile,mergeClaudeTasks} from './claude-remote-tasks';
import type {TaskCompletion} from './task-completion';
import {NativeProviderTaskMonitor} from './native-provider-tasks';
import {homedir} from 'node:os';
import {LocalTaskMonitor} from './local-task-monitor';
import {RemoteTaskMonitor} from './remote-task-monitor';
import path from 'node:path';
import {hostname} from 'node:os';
export class CombinedTaskMonitor {
  private agRemote?:AntigravityRemoteTaskMonitor;private claudeRemote?:ClaudeRemoteTaskMonitor;private native?:NativeProviderTaskMonitor;private local:LocalTaskMonitor;private remote?:RemoteTaskMonitor;
  constructor(sessionsRoot:string,private changed:()=>void,remoteEnabled:boolean,completed?:(value:TaskCompletion)=>void,claudeProfiles:()=>ClaudeTaskProfile[]=()=>[]){
    if(remoteEnabled)this.native=new NativeProviderTaskMonitor(path.join(process.env.CLAUDE_CONFIG_DIR||path.join(homedir(),'.claude'),'sessions'),changed,undefined,undefined,Date.now,completed);
    if(remoteEnabled)this.claudeRemote=new ClaudeRemoteTaskMonitor(claudeProfiles,changed);
    this.local=new LocalTaskMonitor(sessionsRoot,changed,Date.now,item=>completed?.({...item,host:hostname()}));
    if(remoteEnabled&&process.platform==='win32'){this.remote=new RemoteTaskMonitor(path.dirname(sessionsRoot),changed,completed);this.agRemote=new AntigravityRemoteTaskMonitor(changed);}
  }
  snapshot(){
    const original=this.local.snapshot(),local={...original,rows:original.rows.map(r=>({...r,host:hostname(),observedAt:original.checkedAt??undefined}))},remote=this.remote?.snapshot();
    const native=this.native?.snapshot(),claudeRemote=this.claudeRemote?.snapshot();const mergedClaude=mergeClaudeTasks(native?.rows||[],claudeRemote?.rows||[]),claudeRemoteRows=mergedClaude.filter(r=>r.source==='claude-remote');const localSource={available:original.liveCoverage,checkedAt:original.checkedAt??null,reader:original.reader};if(!remote&&!native)return {...local,localSource};
    const agRemote=this.agRemote?.snapshot(),mergedNative=mergeAntigravityTasks(mergedClaude,agRemote?.rows||[]);const rank={waiting:0,running:1,idle:2,unknown:3};
    const allRows=[...local.rows,...(remote?.rows??[]),...mergedNative].sort((a,b)=>rank[a.status]-rank[b.status]||(b.confirmedAt??0)-(a.confirmedAt??0));const rows=allRows.slice(0,100);
    return {...local,localSource,rows,counts:Object.fromEntries(['running','waiting','idle','unknown'].map(s=>[s,rows.filter(r=>r.status===s).length])),connection:remote?.available?'remote':local.connection,liveCoverage:local.liveCoverage||!!remote?.available||!!native?.claude.available||!!native?.antigravity.available||!!claudeRemote?.available||!!agRemote?.available,partial:allRows.length>100||local.partial||!!remote?.partial||!!native?.partial||!!claudeRemote?.partial||!!agRemote?.partial,antigravityRemote:agRemote?{...agRemote,rows:undefined,count:mergedNative.filter(r=>r.source==='antigravity-remote').length}:undefined,claudeRemote:claudeRemote?{available:claudeRemote.available,checking:claudeRemote.checking,count:claudeRemoteRows.length,profiles:claudeRemote.profiles,partial:claudeRemote.partial}:undefined,remote:{enabled:!!this.remote,connected:!!remote?.available,controllerConnected:!!remote?.controllerConnected,error:remote?.error,count:remote?.rows.length??0,hosts:remote?.hosts??[],checkedAt:remote?.checkedAt??null,retryAt:remote?.retryAt??0,checking:!!remote?.checking},native:native?{claude:native.claude,antigravity:native.antigravity}:undefined,scope:'local-and-authorized-remote',limit:100};
  }
  async start(){void this.agRemote?.start();void this.claudeRemote?.start();this.remote?.start();void this.native?.start();await this.local.start();}
  async refresh(){await Promise.all([this.local.start(),this.remote?.start(true),this.agRemote?.start(true),this.claudeRemote?.start(true),this.native?.start()]);}
  close(){this.agRemote?.close();this.claudeRemote?.close();this.local.close();this.remote?.close();this.native?.close();}
}
