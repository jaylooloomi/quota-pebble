import {spawn} from 'node:child_process';
import path from 'node:path';

// One-time transfer between Pebble's validation and packaged executables.
// Windows Chromium safeStorage is app-bound, so use current-user DPAPI for this
// explicitly requested migration. Secret bytes travel only through anonymous pipes.
export function sessionTransfer(mode:'protect'|'unprotect',input:Buffer):Promise<Buffer>{
  if(process.platform!=='win32')return Promise.reject(new Error('Windows session transfer only'));
  const operation=mode==='protect'?'Protect':'Unprotect';
  const command=`Add-Type -AssemblyName System.Security; $inputBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $result=[Security.Cryptography.ProtectedData]::${operation}($inputBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
  return new Promise((resolve,reject)=>{
    const child=spawn(path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let done=false,size=0;const chunks:Buffer[]=[];
    const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);if(error){child.kill();reject(error);}else try{resolve(Buffer.from(Buffer.concat(chunks).toString('ascii'),'base64'));}catch{reject(new Error('Session transfer failed'));}};
    const timer=setTimeout(()=>finish(new Error('Session transfer timed out')),15000);
    child.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>512*1024)finish(new Error('Session transfer exceeds size limit'));else chunks.push(chunk);});
    child.stderr.resume();child.on('error',()=>finish(new Error('Session transfer unavailable')));child.on('close',code=>finish(code?new Error('Session transfer failed'):undefined));child.stdin.on('error',()=>finish(new Error('Session transfer unavailable')));child.stdin.end(input.toString('base64'));
  });
}
