import {existsSync,readFileSync,writeFileSync,mkdirSync,copyFileSync,renameSync} from 'node:fs';
import path from 'node:path';
import {cliEnvironment} from './cli';
import {spawnSync} from 'node:child_process';
export function installTaskBridge(home:string,script:string,nodePath?:string,codexHome=path.join(home,'.codex')){
  const node=nodePath??(cliEnvironment().PATH||'').split(path.delimiter).map(p=>path.join(p,process.platform==='win32'?'node.exe':'node')).find(p=>existsSync(p));
  if(!node||!path.isAbsolute(node)||!existsSync(node))throw new Error('Node.js 22+ required');
  const version=spawnSync(node,['--version'],{windowsHide:true,encoding:'utf8',timeout:3000});
  if(version.status!==0||Number(/^v(\d+)/.exec(version.stdout.trim())?.[1]??0)<22)throw new Error('Node.js 22+ required');
  if(!path.isAbsolute(codexHome))throw new Error('Invalid Codex home');
  const root=path.join(home,'.quota-pebble'),configDir=codexHome,config=path.join(configDir,'hooks.json'),target=path.join(root,'task-hook.cjs');
  // Both paths originate in the main process, never renderer input. Quote for Codex's shell.
  const quote=(s:string)=>'"'+s.replace(/\\/g,'/').replace(/["$`]/g,c=>'\\'+c)+'"';
  const command=(process.platform==='win32'?'cmd.exe /d /c call ':'')+quote(node)+' '+quote(target);
  let data:any={};if(existsSync(config)){data=JSON.parse(readFileSync(config,'utf8'));if(!data||typeof data!=='object'||Array.isArray(data)||data.hooks&&typeof data.hooks!=='object')throw new Error('Invalid hooks config');}
  data.hooks??={};
  for(const event of ['SessionStart','UserPromptSubmit','PreToolUse','PostToolUse','PermissionRequest','Stop','Interrupt','SessionEnd']){
    if(data.hooks[event]!==undefined&&!Array.isArray(data.hooks[event]))throw new Error('Invalid hooks config');
    const groups=data.hooks[event]??=[];
    for(const group of groups)for(const handler of group.hooks??[])if(handler.statusMessage==='Quota Pebble: local task status'&&handler.command?.includes(quote(target)))handler.command=command;
    if(!groups.some((g:any)=>g.hooks?.some((h:any)=>h.command===command)))groups.push({hooks:[{type:'command',command,timeout:3,statusMessage:'Quota Pebble: local task status'}]});
  }
  mkdirSync(root,{recursive:true,mode:0o700});mkdirSync(configDir,{recursive:true,mode:0o700});
  copyFileSync(script,target);
  if(existsSync(config))copyFileSync(config,config+'.quota-pebble-backup-'+Date.now());
  writeFileSync(config+'.quota-pebble-tmp',JSON.stringify(data,null,2)+'\n',{mode:0o600});renameSync(config+'.quota-pebble-tmp',config);
  return {ok:true,needsTrust:true};
}
