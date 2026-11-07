// Explicit opt-in, read-only verification. No CLI, Hooks or credential writes.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{
 if(!process.argv.includes('--live'))throw Error('Explicit --live required');
 let app,monitor;
 try{
  let snapshot;
  if(process.env.QUOTA_PACKAGED_EXE){
   const {_electron}=require('playwright'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'pebble-ag-packaged-proof-')),env={...process.env,QUOTA_TEST_DATA:dir};delete env.ELECTRON_RUN_AS_NODE;
   app=await _electron.launch({executablePath:process.env.QUOTA_PACKAGED_EXE,args:['--demo','--test-mode'],env});
   snapshot=await app.evaluate(async({app})=>{const require=process.mainModule.require.bind(process.mainModule),path=require('node:path'),{AntigravityRemoteTaskMonitor}=require(path.join(app.getAppPath(),'dist/antigravity-remote-tasks.js')),m=new AntigravityRemoteTaskMonitor(()=>{});try{await m.tick();return m.snapshot();}finally{m.close();}});
  }else{const {AntigravityRemoteTaskMonitor}=require('../dist/antigravity-remote-tasks');monitor=new AntigravityRemoteTaskMonitor(()=>{});await monitor.tick();snapshot=monitor.snapshot();}
  const s=snapshot,target=s.rows.find(r=>r.title==='跨工具Agent調用');
  const report={time:new Date().toISOString(),packaged:!!process.env.QUOTA_PACKAGED_EXE,available:s.available,error:s.error,hosts:s.hosts.map(h=>({name:h.name,state:h.state,error:h.error,count:h.count})),counts:Object.fromEntries(['running','waiting','idle','unknown'].map(k=>[k,s.rows.filter(r=>r.status===k).length])),target:target?{status:target.status,host:target.host}:null,cliStarted:false,hooksUsed:false,credentialsModified:false};
  await fs.mkdir('test-results/antigravity-remote-tasks',{recursive:true});await fs.writeFile('test-results/antigravity-remote-tasks/live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  if(!s.available)throw Error(s.error||'Remote source unavailable');
 }finally{monitor?.close();await app?.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
