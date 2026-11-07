// Codex command hook. Deliberately emits no stdout and never reads transcripts.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const allowed=new Set(['SessionStart','UserPromptSubmit','PreToolUse','PostToolUse','PermissionRequest','Stop','Interrupt','SessionEnd']);
function record(input,root=path.join(os.homedir(),'.quota-pebble','task-events'),now=Date.now()){
  if(!input||input.agent_id||!allowed.has(input.hook_event_name)||!/^[-\w]{1,128}$/.test(input.session_id))return false;
  const text=(s,n)=>typeof s==='string'?s.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,n):'';
  const data={version:1,id:input.session_id,turn:text(input.turn_id,128),event:input.hook_event_name,time:now,project:text(input.cwd,512)};
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  const target=path.join(root,crypto.randomUUID()+'.json');fs.writeFileSync(target+'.tmp',JSON.stringify(data),{mode:0o600,flag:'wx'});fs.renameSync(target+'.tmp',target);
  // Bounded metadata retention; no prompt, arguments, output or credentials are saved.
  const files=fs.readdirSync(root).filter(n=>/^[0-9a-f-]{36}\.json$/.test(n));
  if(files.length>1000)for(const name of files){try{const file=path.join(root,name);if(fs.lstatSync(file).mtimeMs<now-86400000)fs.unlinkSync(file);}catch{}}
  if(files.length>4000){const old=files.map(n=>({n,t:fs.lstatSync(path.join(root,n)).mtimeMs})).sort((a,b)=>a.t-b.t);for(const f of old.slice(0,files.length-4000))fs.unlinkSync(path.join(root,f.n));}
  return true;
}
module.exports={record};
if(require.main===module){let size=0,chunks=[];process.stdin.on('data',b=>{size+=b.length;if(size<=2*1024*1024)chunks.push(b);});process.stdin.on('end',()=>{try{if(size<=2*1024*1024)record(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{} });}
