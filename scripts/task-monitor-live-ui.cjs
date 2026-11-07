// Read-only observation of naturally running Desktop sessions; no test inference.
const {_electron}=require('playwright'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  if(!process.argv.includes('--live'))throw Error('Pass --live to observe existing local session metadata. No task will be started.');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pebble-local-live-')),output='test-results/task-monitor-live';await fs.mkdir(output,{recursive:true});let app;
  try{
    const env={...process.env,QUOTA_TEST_DATA:dir,QUOTA_TEST_SESSION_ROOT:path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'sessions')};delete env.ELECTRON_RUN_AS_NODE;
    app=await _electron.launch({...(process.env.QUOTA_PACKAGED_EXE?{executablePath:process.env.QUOTA_PACKAGED_EXE}:{}),args:[...(process.env.QUOTA_PACKAGED_EXE?[]:['.']),'--demo','--test-mode'],env});const page=await app.firstWindow();await page.waitForFunction(()=>window.quota&&document.querySelector('#mini-codex').textContent.includes('%'));await page.locator('#toggle').click();await page.locator('#tab-tasks').click();
    // Poll on the host so every assertion uses the completed IPC snapshot.
    let state;for(let i=0;i<100;i++){state=await page.evaluate(()=>quota.getState());if(state.tasks.connection==='local'&&state.tasks.rows.length>0)break;await page.waitForTimeout(200);}
    const tasks=state.tasks;assert.equal(tasks.connection,'local');assert.ok(tasks.rows.length>0);
    if(process.env.QUOTA_EXPECT_SESSION){const row=tasks.rows.find(r=>r.id===process.env.QUOTA_EXPECT_SESSION);assert.equal(row?.status,'running');assert.equal(row?.source,'rollout');assert.equal(row?.evidence,'inferred');}
    await page.locator('[data-task-filter=running]').click();await page.screenshot({path:output+'/local-running.png'});
    const proof={version:state.version,source:tasks.connection,cliStarted:false,hooksUsed:false,quotaData:'demo',counts:tasks.counts,active:tasks.rows.filter(r=>r.status==='running').map(({id,status,evidence})=>({id,status,evidence}))};await fs.writeFile(output+'/local-proof.json',JSON.stringify(proof,null,2));console.log(proof);
  }finally{if(app)await app.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
