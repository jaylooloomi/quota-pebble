const fs = require('node:fs');
fs.rmSync('dist/ui', {recursive:true, force:true});
fs.cpSync('src/ui', 'dist/ui', { recursive: true });
fs.rmSync('dist/gemini-worker.mjs', { force: true });

fs.rmSync('dist/native', {recursive:true, force:true});
fs.cpSync('src/native', 'dist/native', { recursive: true });
if(process.platform==='win32'){
  const path=require('node:path'),{execFileSync}=require('node:child_process');
  const compiler=path.join(process.env.SystemRoot||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  execFileSync(compiler,['/nologo','/target:exe','/optimize+','/reference:System.Web.Extensions.dll','/out:'+path.resolve('dist/native/enrolled-device-key.exe'),path.resolve('src/native/enrolled-device-key.cs')],{stdio:'inherit',windowsHide:true});
}
