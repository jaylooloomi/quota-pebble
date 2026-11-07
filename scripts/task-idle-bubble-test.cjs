const {_electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pebble-idle-ui-')),out='test-results/task-idle';await fs.mkdir(out,{recursive:true});let app;
 const id='01a188f8-5146-7ed1-bf76-242e9b60a849',root=path.join(dir,'codex-sessions'),file=path.join(root,'rollout-test-'+id+'.jsonl');await fs.mkdir(root);
 const event=(type,turn)=>JSON.stringify({timestamp:new Date().toISOString(),type:'event_msg',payload:{type,turn_id:turn}})+'\n';
 await fs.writeFile(file,JSON.stringify({type:'session_meta',payload:{id,cwd:'D:/demo-project'}})+'\n'+event('task_started','old')+event('turn_aborted','old'));
 await fs.writeFile(path.join(dir,'session_index.jsonl'),JSON.stringify({id,thread_name:'整理專案與測試報告'})+'\n');
 try{
  const env={...process.env,QUOTA_TEST_DATA:dir};delete env.ELECTRON_RUN_AS_NODE;app=await _electron.launch({...(process.env.QUOTA_PACKAGED_EXE?{executablePath:process.env.QUOTA_PACKAGED_EXE}:{}),args:[...(process.env.QUOTA_PACKAGED_EXE?[]:['.']),'--demo','--test-mode'],env});const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>window.quota&&document.querySelector('#mini-codex').textContent.includes('%'));
  await app.evaluate(({BrowserWindow})=>{global.idleMain=BrowserWindow.getAllWindows()[0];global.idleMain.setPosition(500,350);});await page.evaluate(()=>quota.tasksStart());assert.equal(app.windows().length,1,'historical idle is silent');
  await fs.appendFile(file,event('task_started','work'));await page.waitForFunction(async id=>(await quota.getState()).tasks.rows.some(r=>r.id===id&&r.status==='running'),id);await page.waitForTimeout(2200);const geometry=await app.evaluate(()=>global.idleMain.getBounds());
  const wait=app.waitForEvent('window',{timeout:50000}),started=Date.now();await fs.appendFile(file,event('turn_aborted','work')); // idle evidence, never successful completion
  const bubble=await wait;await bubble.waitForSelector('body.idle');assert.ok(Date.now()-started>=30000,'real 30-second gate, no test clock');assert.match(await bubble.locator('#heading').textContent(),/已閒置/);assert.match(await bubble.locator('#status-note').textContent(),/不代表/);const after=await app.evaluate(()=>global.idleMain.getBounds());assert.equal(after.width,geometry.width);assert.equal(after.height,geometry.height);
  const audit=(await fs.readFile(path.join(dir,'demo-logs','diagnostics.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);for(const stage of ['eligible','queued','shown'])assert.ok(audit.some(r=>r.event==='task_notice'&&r.kind==='idle'&&r.provider==='codex'&&r.stage===stage),'audit proves '+stage);assert.ok(audit.some(r=>r.event==='task_monitor'&&r.tracker.pending>0),'audit proves 30s gate is running');const idleColor=await bubble.locator('article').evaluate(e=>getComputedStyle(e).backgroundImage);
  for(const provider of ['codex','claude','antigravity'])for(const locale of ['zh-TW','en','ja','ko']){
   await app.evaluate(({BrowserWindow},{provider,locale,id})=>{BrowserWindow.getAllWindows().find(w=>w!==global.idleMain).webContents.send('task-bubble-state',{kind:'idle',id,turnId:'demo',title:'整理專案與測試報告',host:'工作電腦',provider,locale,above:true,tip:150});},{provider,locale,id});await bubble.waitForTimeout(30);
   for(const selector of ['article','header','#status-note','footer'])assert.equal(await bubble.locator(selector).evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,provider+' '+locale+' '+selector+' fits');
   await bubble.screenshot({path:out+'/'+provider+'-'+locale+'.png'});
  }
  await fs.appendFile(file,event('task_started','success')+event('task_complete','success'));await bubble.waitForFunction(()=>!document.body.classList.contains('idle'));assert.equal(await bubble.locator('#status-note').isVisible(),false);assert.notEqual(await bubble.locator('article').evaluate(e=>getComputedStyle(e).backgroundImage),idleColor,'completion green differs from idle blue');
  await bubble.locator('#view').click();await page.waitForSelector('.task-completed-highlight');assert.equal(await page.locator('#tab-tasks').getAttribute('aria-selected'),'true');assert.deepEqual(errors,[]);
  console.log('PASS real local transition → 30s stable idle → blue bubble; history silent; all provider/locale layouts; fixed geometry; successful completion replaces idle in green; view task');
 }finally{await app?.close();assert.ok(dir.startsWith(path.join(os.tmpdir(),'pebble-idle-ui-')));await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
})().catch(e=>{console.error(e);process.exitCode=1;});
