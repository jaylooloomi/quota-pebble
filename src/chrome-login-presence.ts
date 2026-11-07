import path from 'node:path';
import {spawn} from 'node:child_process';

export const signedInChromeTitle=(title:string)=>/^(New (chat|session)|新對話|新聊天|新しいチャット|新規チャット|새 채팅)\s*[-–—]\s*Claude(?:\s*[-–—]\s*Google Chrome)?$/i.test(title.trim());

export function ownedChromeShowsSignedIn(pid:number,directory:string,executable:string):Promise<boolean>{
  if(process.platform!=='win32'||!Number.isInteger(pid)||pid<=0||path.basename(path.resolve(directory))!=='chrome-login')return Promise.resolve(false);
  const quote=(value:string)=>"'"+value.replace(/'/g,"''")+"'";
  const pattern='^(New (chat|session)|新對話|新聊天|新しいチャット|新規チャット|새 채팅)\\s*[-–—]\\s*Claude(?:\\s*[-–—]\\s*Google Chrome)?$';
  const command=`$w=Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if(!$w -or $w.ExecutablePath -ne ${quote(executable)} -or !$w.CommandLine.Contains(${quote('--user-data-dir='+path.resolve(directory))})){exit 1}; $p=[Diagnostics.Process]::GetProcessById(${pid}); [Console]::Out.Write([bool]($p.MainWindowTitle -match ${quote(pattern.replaceAll('\\\\','\\'))}))`;
  return runBooleanCommand(command);
}

// Read one boolean from Pebble's own newly created Chrome profile. Neither the
// cookie value nor its encrypted bytes leave SQLite. Unsupported/locked files
// simply retain the existing manual-close flow.
export function ownedChromeHasSession(directory:string,now=Date.now()):boolean{
  if(path.basename(path.resolve(directory))!=='chrome-login')return false;
  let database:any;
  try{
    const {DatabaseSync}=require('node:sqlite');
    database=new DatabaseSync(path.join(directory,'Default','Network','Cookies'),{readOnly:true,timeout:25,enableLoadExtension:false});
    const chromiumNow=BigInt(Math.trunc(now))*1000n+11644473600000000n;
    return !!database.prepare("SELECT 1 AS present FROM cookies WHERE host_key IN ('claude.ai','.claude.ai') AND name='sessionKey' AND (expires_utc=0 OR expires_utc>?) AND (length(encrypted_value)>0 OR length(value)>0) LIMIT 1").get(chromiumNow);
  }catch{return false;}finally{try{database?.close();}catch{}}
}

export function closeOwnedChromeWindow(pid:number,directory:string,executable:string):Promise<boolean>{
  if(!Number.isInteger(pid)||pid<=0||path.basename(path.resolve(directory))!=='chrome-login')return Promise.resolve(false);
  if(process.platform!=='win32'){try{return Promise.resolve(process.kill(pid,'SIGTERM'));}catch{return Promise.resolve(false);}}
  const quote=(value:string)=>"'"+value.replace(/'/g,"''")+"'";
  const command=`$w=Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if(!$w -or $w.ExecutablePath -ne ${quote(executable)} -or !$w.CommandLine.Contains(${quote('--user-data-dir='+path.resolve(directory))})){exit 1}; $p=[Diagnostics.Process]::GetProcessById(${pid}); [Console]::Out.Write($p.CloseMainWindow())`;
  return runBooleanCommand(command);
}

function runBooleanCommand(command:string):Promise<boolean>{return new Promise(resolve=>{let done=false,output='';const child=spawn(path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,stdio:['ignore','pipe','pipe']});const finish=(result:boolean)=>{if(done)return;done=true;clearTimeout(timer);resolve(result);};const timer=setTimeout(()=>{child.kill();finish(false);},5000);child.stdout.on('data',bytes=>{if(output.length<32)output+=bytes.toString();});child.stderr.resume();child.on('error',()=>finish(false));child.on('close',code=>finish(code===0&&output.trim()==='True'));});}
