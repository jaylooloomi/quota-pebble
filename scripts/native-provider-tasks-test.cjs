// Read only naturally existing registrations/local services. No CLI or hooks.
const {_electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{
  if(!process.argv.includes('--live'))throw Error('Explicit --live required');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pebble-native-live-')),out='test-results/native-provider-tasks';await fs.mkdir(out,{recursive:true});let app;
  try{const env={...process.env,QUOTA_TEST_DATA:dir};delete env.ELECTRON_RUN_AS_NODE;app=await _electron.launch({...(process.env.QUOTA_PACKAGED_EXE?{executablePath:process.env.QUOTA_PACKAGED_EXE}:{}),args:[...(process.env.QUOTA_PACKAGED_EXE?[]:['.']),'--demo','--test-mode'],env});const page=await app.firstWindow();await page.waitForFunction(()=>window.quota&&document.querySelector('#mini-codex').textContent.includes('%'));const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const proof=await app.evaluate(async({app})=>{
      const require=process.mainModule.require.bind(process.mainModule),path=require('node:path'),os=require('node:os'),{NativeProviderTaskMonitor}=require(path.join(app.getAppPath(),'dist/native-provider-tasks'));
      const m=new NativeProviderTaskMonitor(path.join(process.env.CLAUDE_CONFIG_DIR||path.join(os.homedir(),'.claude'),'sessions'),()=>{});global.nativeLiveMonitor=m;await m.tick();const snap=m.snapshot();global.nativeLiveSnapshot=snap;
      return{version:app.getVersion(),claude:snap.claude,antigravity:snap.antigravity,counts:Object.fromEntries(['claude','antigravity'].map(p=>[p,Object.fromEntries(['running','waiting','idle','unknown'].map(s=>[s,snap.rows.filter(r=>r.provider===p&&r.status===s).length]))])),cliStarted:false,hooksUsed:false,conversationRead:false,keysRead:false,mode:'existing live metadata'};
    });
    await page.locator('#toggle').click();await page.locator('#tab-tasks').click();
    await app.evaluate(async({BrowserWindow})=>{const web=BrowserWindow.getAllWindows()[0].webContents,state=await web.executeJavaScript('quota.getState()'),s=global.nativeLiveSnapshot;state.tasks={...state.tasks,rows:s.rows,counts:Object.fromEntries(['running','waiting','idle','unknown'].map(k=>[k,s.rows.filter(r=>r.status===k).length])),liveCoverage:s.claude.available||s.antigravity.available,native:{claude:s.claude,antigravity:s.antigravity},__nativeLive:true};global.nativeLiveUI=state;const send=web.send.bind(web);web.send=(channel,...args)=>{if(channel==='state'&&!args[0]?.tasks?.__nativeLive)return;return send(channel,...args);};web.send('state',state);});
    await page.locator('[data-task-filter=all]').click();assert.equal(await page.locator('.task-native-sources').isVisible(),true);
    for(const locale of ['zh-TW','en','ja','ko']){
      await app.evaluate(({BrowserWindow},locale)=>{global.nativeLiveUI.settings.locale=locale;BrowserWindow.getAllWindows()[0].webContents.send('state',global.nativeLiveUI);},locale);await page.waitForTimeout(100);
      assert.equal(await page.locator('#task-panel').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,locale+' layout fits');assert.equal(await page.locator('.task-list').evaluate(e=>e.clientHeight<=309),true,'three row scroll limit');
      if(proof.claude.count)assert.ok(await page.locator('.task-provider-icon[alt="Claude"]').count()>0);
      if(proof.antigravity.count)assert.ok(await page.locator('.task-provider-icon[alt="Antigravity"]').count()>0);
      assert.equal(await page.locator('.task-host-badge').count(),proof.claude.count+proof.antigravity.count);
      await page.screenshot({path:out+'/'+locale+'.png'});
    }
    for(const [local,remote] of [[true,false],[false,true],[false,false],[true,true]]){
      await app.evaluate(({BrowserWindow},values)=>{const s=global.nativeLiveUI;s.tasks.localSource={available:values[0]};s.tasks.remote={connected:values[1]};BrowserWindow.getAllWindows()[0].webContents.send('state',s);},[local,remote]);
      assert.equal(await page.locator('.task-source-health[data-provider="codex"]').getAttribute('data-connected'),String(local),'Codex local badge must not hide remote failures');
      assert.ok((await page.locator('.task-source-health[data-provider="codex"]').getAttribute('title')).length>0,'local/remote tooltip exists');
    }
    // Separate deterministic UI regression, never reported as live task activity.
    await app.evaluate(({app,BrowserWindow})=>{
      const require=process.mainModule.require.bind(process.mainModule),path=require('node:path'),{claudeRegistryRow,antigravityTaskRows}=require(path.join(app.getAppPath(),'dist/native-provider-tasks')),now=Date.now();
      const v={pid:42,sessionId:'fixture-session',procStart:'fixture-generation',cwd:'D:/fixture',status:'busy',statusUpdatedAt:now},identity={pid:42,procStart:v.procStart,claude:true};
      const rows=[claudeRegistryRow(v,identity,now),claudeRegistryRow({...v,pid:43,status:'waiting'},{...identity,pid:43},now),...antigravityTaskRows({trajectorySummaries:[{trajectoryId:'fixture-ag',summary:'Fixture Antigravity task',status:'CASCADE_RUN_STATUS_RUNNING'}]},now)];
      global.nativeFixtureUI={...global.nativeLiveUI,tasks:{...global.nativeLiveUI.tasks,rows,counts:{running:2,waiting:1,idle:0,unknown:0},__nativeLive:true}};BrowserWindow.getAllWindows()[0].webContents.send('state',global.nativeFixtureUI);
    });
    await page.locator('[data-task-filter=running]').click();assert.equal(await page.locator('.task-row').count(),2);assert.equal(await page.locator('.task-provider-icon[alt="Claude"]').count(),1);assert.equal(await page.locator('.task-provider-icon[alt="Antigravity"]').count(),1);
    await page.locator('[data-task-filter=waiting]').click();assert.equal(await page.locator('.task-row').count(),1);assert.equal(await page.locator('.task-provider-icon[alt="Claude"]').count(),1);
    await app.evaluate(({BrowserWindow})=>{const s=global.nativeFixtureUI;s.tasks.rows=s.tasks.rows.map(r=>({...r,status:'unknown'}));s.tasks.counts={running:0,waiting:0,idle:0,unknown:3};s.tasks.native={claude:{available:false,count:2},antigravity:{available:false,count:1}};BrowserWindow.getAllWindows()[0].webContents.send('state',s);});
    await page.locator('[data-task-filter=unknown]').click();assert.equal(await page.locator('.task-row').count(),3);assert.equal(await page.locator('.task-source-health[data-connected="false"]:not([data-provider="codex"])').count(),2);
    assert.deepEqual(errors,[]);proof.uiFixtureChecks=['running across providers','Claude waiting','source disconnect becomes unknown'];await fs.writeFile(out+'/proof.json',JSON.stringify(proof,null,2));console.log(proof);
  }finally{await app?.evaluate(()=>global.nativeLiveMonitor?.close()).catch(()=>{});await app?.close();assert.ok(dir.startsWith(path.join(os.tmpdir(),'pebble-native-live-')));await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
})().catch(e=>{console.error(e);process.exitCode=1;});
