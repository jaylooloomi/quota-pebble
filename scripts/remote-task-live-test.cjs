// Explicit live opt-in: authorized remote metadata only; no inference or task mutation.
const {_electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{
  if(!process.argv.includes('--live'))throw Error('Pass --live to query already authorized remote hosts');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pebble-remote-live-'));let app;
  try{
    const env={...process.env,QUOTA_TEST_DATA:dir};delete env.ELECTRON_RUN_AS_NODE;
    app=await _electron.launch({...(process.env.QUOTA_PACKAGED_EXE?{executablePath:process.env.QUOTA_PACKAGED_EXE}:{}),args:[...(process.env.QUOTA_PACKAGED_EXE?[]:['.']),'--demo','--test-mode'],env});
    const page=await app.firstWindow();await page.waitForFunction(()=>window.quota&&document.querySelector('#mini-codex').textContent.includes('%'));
    const proof=await app.evaluate(async({app})=>{
      const require=process.mainModule.require.bind(process.mainModule);const path=require('node:path'),os=require('node:os');const {RemoteTaskMonitor}=require(path.join(app.getAppPath(),'dist/remote-task-monitor.js'));
      const m=new RemoteTaskMonitor(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),()=>{});global.pebbleRemoteTest=m;
      await m.tick();const first=m.snapshot();if(!first.available)throw Error('Remote verification failed: '+first.error);
      m.controller.fail();const disconnected=m.snapshot();if(disconnected.available||disconnected.rows.some(r=>r.status!=='unknown'))throw Error('Disconnect retained live status');
      await m.tick();const reconnected=m.snapshot();if(!reconnected.available)throw Error('Reconnect failed: '+reconnected.error);
      const counts=Object.fromEntries(['running','waiting','idle','unknown'].map(k=>[k,reconnected.rows.filter(r=>r.status===k).length]));
      global.pebbleRemoteRows=reconnected.rows;
      return {version:app.getVersion(),count:reconnected.rows.length,counts,partial:reconnected.partial,disconnectInvalidated:true,reconnected:true,cliStarted:false,hooksUsed:false,privateKeysExported:false,pairingChanged:false,quotaData:'demo',taskData:'live authorized remote metadata'};
    });
    assert.ok(proof.count>0);
    await page.locator('#toggle').click();await page.locator('#tab-tasks').click();
    await app.evaluate(async({BrowserWindow})=>{
      const web=BrowserWindow.getAllWindows()[0].webContents;
      const state=await web.executeJavaScript('quota.getState()');state.settings.locale='zh-TW';state.tasks={...state.tasks,rows:global.pebbleRemoteRows,counts:Object.fromEntries(['running','waiting','idle','unknown'].map(k=>[k,global.pebbleRemoteRows.filter(r=>r.status===k).length])),connection:'remote',liveCoverage:true,inferred:false,partial:true,remote:{connected:true},__liveRemote:true};
      const send=web.send.bind(web);web.send=(channel,...args)=>{if(channel==='state'&&!args[0]?.tasks?.__liveRemote)return;return send(channel,...args);};web.send('state',state);
    });
    await page.locator('[data-task-filter=all]').click();await page.waitForTimeout(200);
    assert.equal(await page.locator('.task-host-badge').first().getAttribute('title').then(s=>s.includes('遠端')),true);
    await fs.mkdir('test-results/remote-task-live',{recursive:true});await page.screenshot({path:'test-results/remote-task-live/remote-tasks.png'});
    await fs.writeFile('test-results/remote-task-live/proof.json',JSON.stringify(proof,null,2));console.log(proof);
  }finally{if(app){await app.evaluate(()=>global.pebbleRemoteTest?.close()).catch(()=>{});await app.close();}await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
