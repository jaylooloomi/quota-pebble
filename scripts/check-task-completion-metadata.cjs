// Explicit read-only verification of existing authorized remote metadata.
const {_electron}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
  if(!process.argv.includes('--live'))throw Error('Explicit --live required');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pebble-completion-live-'));let app;
  try{const env={...process.env,QUOTA_TEST_DATA:dir};delete env.ELECTRON_RUN_AS_NODE;app=await _electron.launch({args:['.','--demo','--test-mode'],env});await app.firstWindow();
    const proof=await app.evaluate(async({app})=>{
      const require=process.mainModule.require.bind(process.mainModule),path=require('node:path'),os=require('node:os');
      const {RemoteTaskMonitor}=require(path.join(app.getAppPath(),'dist/remote-task-monitor'));const m=new RemoteTaskMonitor(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),()=>{});
      try{await m.tick();const s=m.snapshot();if(!s.available||!s.rows.length)throw Error(s.error||'NO_REMOTE_METADATA');const row=s.rows[0],at=row.id.indexOf(':');
        const r=await m.controller.rpc(row.id.slice(0,at),'thread/turns/list',{threadId:row.id.slice(at+1),limit:1,sortDirection:'desc',itemsView:'notLoaded'});
        const turn=r.data?.[0];return{remoteRows:s.rows.length,turnQuerySucceeded:true,turnCount:r.data?.length||0,status:turn?.status,hasTurnId:typeof turn?.id==='string',itemCount:turn?.items?.length||0,metadataKeys:turn?Object.keys(turn).filter(k=>!['items','error'].includes(k)):[],cliStarted:false,hooksUsed:false,taskResumed:false};
      }finally{m.close();}
    });await fs.mkdir('test-results/task-bubble',{recursive:true});await fs.writeFile('test-results/task-bubble/live-metadata.json',JSON.stringify(proof,null,2));console.log(proof);
  }finally{await app?.close();assert.ok(dir.startsWith(path.join(os.tmpdir(),'pebble-completion-live-')));await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
