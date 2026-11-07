const {_electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'quota-task-ui-')),output='test-results/task-monitor';await fs.mkdir(output,{recursive:true});
  const root=path.join(dir,'codex-sessions/2026/11/03');await fs.mkdir(root,{recursive:true});const time=new Date().toISOString();
  for(const [id,waiting] of [['01a188f8-5146-7ed1-bf76-242e9b60a849',false],['01a1986b-ebee-7a00-88eb-558b3ea244cc',true]]){const rows=[{type:'session_meta',payload:{id,cwd:'D:/projects/Task'}},{type:'event_msg',timestamp:time,payload:{type:'task_started',turn_id:'t'}}];if(waiting)rows.push({type:'response_item',timestamp:time,payload:{type:'function_call',name:'request_user_input',call_id:'ask'}});await fs.writeFile(path.join(root,'rollout-2026-11-03T01-00-00-'+id+'.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');}
  const env={...process.env,QUOTA_TEST_DATA:dir};delete env.ELECTRON_RUN_AS_NODE;let app;
  try{
    app=await _electron.launch({...(process.env.QUOTA_PACKAGED_EXE?{executablePath:process.env.QUOTA_PACKAGED_EXE}:{}),args:[...(process.env.QUOTA_PACKAGED_EXE?[]:['.']),'--demo','--test-mode'],env});
    const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>window.quota&&document.querySelector('#mini-codex').textContent.includes('%'));
    await page.locator('#toggle').click();await page.waitForTimeout(150);
    const rect=()=>page.locator('.panel-header').boundingBox(),before=await rect();const quotaPosition=await page.locator('.card[data-provider="claude"]').boundingBox();
    const quotaTime=(await page.evaluate(()=>quota.getState())).providers.codex.updatedAt;
    await page.locator('#tab-tasks').click();await page.waitForFunction(()=>document.querySelectorAll('.task-row').length===1);assert.equal(await page.locator('[data-task-filter=running]').getAttribute('aria-pressed'),'true','defaults to running');await page.locator('[data-task-filter=all]').click();await page.waitForFunction(()=>document.querySelectorAll('.task-row').length===2);assert.equal(await page.locator('.task-row[data-status="running"]').count(),1);assert.equal(await page.locator('.task-row[data-status="waiting"]').count(),1);assert.equal(await page.locator('#cards').isVisible(),false);
    await page.screenshot({path:output+'/overview.png'});
    await app.evaluate(({BrowserWindow})=>{const web=BrowserWindow.getAllWindows()[0].webContents;global.taskFixtureSend=web.send.bind(web);web.send=(channel,...args)=>{if(channel==='state'&&!args[0]?.__taskFixture)return;return global.taskFixtureSend(channel,...args);};});
    const data=await page.evaluate(()=>quota.getState());assert.equal(data.tasks.peak.count,1,'real local scan updates persisted running peak');data.__taskFixture=true;data.tasks.rows.push({id:'unsafe',title:'<img src=x onerror="window.HACKED=1">',project:'D:/'+('long project ').repeat(35),status:'unknown',source:'remote',host:'<img src=x onerror=alert(1)> Very long remote host '.repeat(15),confirmedAt:null});
    await app.evaluate(({BrowserWindow},data)=>BrowserWindow.getAllWindows()[0].webContents.send('state',data),data);
    assert.equal(await page.locator('#task-panel img:not(.task-provider-icon)').count(),0);assert.equal(await page.evaluate(()=>window.HACKED),undefined);
    for(const locale of ['zh-TW','en','ja','ko']){
      data.settings.locale=locale;await app.evaluate(({BrowserWindow},data)=>BrowserWindow.getAllWindows()[0].webContents.send('state',data),data);await page.waitForTimeout(100);
      assert.equal(await page.locator('#tab-tasks svg use').getAttribute('href'),'#i-tasks',locale+' task icon survives translation');
      assert.equal(await page.locator('#task-panel').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,locale+' panel fits');
      assert.equal(await page.locator('.task-controls,.task-summary-setting').count(),0,locale+' task controls removed');
      assert.equal(await page.locator('.task-host-badge').count(),3);assert.equal(await page.locator('.task-host-badge').last().getAttribute('title').then(t=>t.includes('Very long remote host')),true);
      assert.equal(await page.locator('.task-meta').evaluateAll(ns=>ns.every(n=>n.scrollWidth<=n.clientWidth+1)),true,locale+' host badges and timestamps fit');
      assert.equal(await page.locator('.task-counts>div').count(),3);assert.equal(await page.locator('.task-counts>div').last().locator('.task-stat-label').textContent(),({'zh-TW':'閒置',en:'Idle',ja:'待機中',ko:'대기 중'})[locale],'third counter is idle');
      const header=await rect();assert.ok(Math.abs(header.width-before.width)<1);assert.ok(Math.abs(header.height-before.height)<1);await page.screenshot({path:output+'/'+locale+'.png'});
    }
    data.tasks.counts={running:1,waiting:1,idle:3,unknown:99};
    data.tasks.rows=Array.from({length:7},(_,i)=>({provider:['codex','claude','antigravity'][i%3],id:'scroll-'+i,title:'Task '+(i+1)+' '+('long title '.repeat(8)),project:'D:/projects/demo',status:i===0?'running':i===1?'waiting':'unknown',source:'history',confirmedAt:null}));
    await app.evaluate(({BrowserWindow},data)=>BrowserWindow.getAllWindows()[0].webContents.send('state',data),data);
    assert.equal(await page.locator('.task-counts strong').last().textContent(),'3','idle counter does not use unknown count');
    assert.deepEqual(await page.locator('.task-provider-icon').evaluateAll(nodes=>nodes.slice(0,3).map(n=>n.alt)),['Codex','Claude','Antigravity']);
    assert.ok(await page.locator('.task-provider-icon').evaluateAll(nodes=>nodes.every(n=>n.complete&&n.naturalWidth>0)));
    await page.screenshot({path:output+'/provider-icons.png'});
    const dateTimes=Array.from({length:6},(_,i)=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-i);return i===0?Date.now():d.getTime();});
    data.tasks.rows.forEach((r,i)=>r.confirmedAt=dateTimes[i]??null);
    await app.evaluate(({BrowserWindow},data)=>BrowserWindow.getAllWindows()[0].webContents.send('state',data),data);
    assert.deepEqual(await page.locator('.task-filters button').evaluateAll(ns=>ns.map(n=>n.dataset.taskFilter)),['running','today','threeDays','fiveDays','week','idle','waiting','unknown','all']);
    for(const [f,n] of [['today',1],['threeDays',3],['fiveDays',5],['week',6],['idle',0],['waiting',1],['unknown',5],['all',7]]){await page.locator('[data-task-filter='+f+']').click();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await page.locator('.task-row').count(),n,'date/status filter '+f);}
    const scrolling=await page.locator('.task-list').evaluate(e=>{const r=e.getBoundingClientRect(),rows=[...e.querySelectorAll('.task-row')].map(n=>n.getBoundingClientRect());return{height:r.height,overflows:e.scrollHeight>e.clientHeight,thirdBottom:rows[2].bottom,bottom:r.bottom,fourthTop:rows[3].top,overflowY:getComputedStyle(e).overflowY};});
    assert.ok(Math.abs(scrolling.height-308)<1);assert.ok(scrolling.overflows);assert.ok(scrolling.thirdBottom<=scrolling.bottom+1);assert.ok(scrolling.fourthTop>=scrolling.bottom);assert.equal(scrolling.overflowY,'auto');
    await page.locator('.task-list').evaluate(e=>e.scrollTop=e.scrollHeight);assert.ok(await page.locator('.task-list').evaluate(e=>e.lastElementChild.getBoundingClientRect().bottom<=e.getBoundingClientRect().bottom+1));
    const savedScroll=await page.locator('.task-list').evaluate(e=>e.scrollTop);data.tasks.checkedAt=Date.now();await app.evaluate(({BrowserWindow},data)=>BrowserWindow.getAllWindows()[0].webContents.send('state',data),data);assert.equal(await page.locator('.task-list').evaluate(e=>e.scrollTop),savedScroll,'updates preserve list scroll');
    await page.screenshot({path:output+'/three-row-scroll.png'});
    const nativeHeight=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds().height);
    await page.waitForTimeout(100);const allHeight=await nativeHeight();const filterStarted=Date.now();
    await page.locator('[data-task-filter=running]').click();assert.equal(await page.locator('.task-row').count(),1);
    await page.waitForTimeout(150);const runningHeight=await nativeHeight();assert.equal(runningHeight,allHeight,'filter keeps native height stable');
    await page.locator('[data-task-filter=all]').click();await page.waitForTimeout(150);assert.equal(await nativeHeight(),allHeight,'all filter expands immediately');
    console.log('PASS immediate filter sizing; running height '+runningHeight+', all height '+allHeight+', round trip '+(Date.now()-filterStarted)+'ms');
    await page.locator('[data-task-filter=running]').click();
    await page.locator('#tab-tasks').focus();await page.keyboard.press('Home');await page.waitForTimeout(150);assert.equal(await page.locator('#tab-quota').getAttribute('aria-selected'),'true');
    const after=await page.locator('.card[data-provider="claude"]').boundingBox();for(const key of ['x','y','width','height'])assert.ok(Math.abs(after[key]-quotaPosition[key])<=1,'quota geometry '+key);
    assert.equal((await page.evaluate(()=>quota.getState())).providers.codex.updatedAt,quotaTime,'task monitor never refreshes quota');
    data.settings.locale='zh-TW';data.tasks.liveCoverage=false;data.tasks.connection='unavailable';data.tasks.rows=data.tasks.rows.map(r=>({...r,status:'unknown'}));data.tasks.counts={running:0,waiting:0,idle:0,unknown:data.tasks.rows.length};
    await app.evaluate(({BrowserWindow},data)=>BrowserWindow.getAllWindows()[0].webContents.send('state',data),data);await page.locator('#tab-tasks').click();assert.equal(await page.locator('.task-counts strong').first().innerText(),'—');assert.equal(await page.locator('.task-footnote').count(),0);assert.match(await page.locator('.task-empty').innerText(),/本機.*記錄/);
    await page.screenshot({path:output+'/source-unconnected.png'});
    await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].webContents.send=global.taskFixtureSend;});
    assert.equal((await page.evaluate(()=>quota.getState())).settings.compactTaskSummary,true);
    await page.evaluate(()=>quota.settings({petRoam:true,petPlacement:'stage'}));
    const compactGeometry=()=>page.locator('.compact-provider').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}}));
    await page.locator('#collapse').click();await page.waitForTimeout(100);await page.locator('#roam-pet').waitFor({state:'visible',timeout:20000});assert.equal((await page.evaluate(()=>quota.getState())).settings.petRoam,true,'stage companion preference preserved');const compact=await compactGeometry();assert.equal(await page.locator('.compact-task-summary').isVisible(),true);
    for(const locale of ['zh-TW','en','ja','ko']){await page.evaluate(locale=>quota.settings({locale}),locale);
    await page.evaluate(async()=>{const s=await quota.getState(),now=Date.now(),yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);yesterday.setHours(0,0,0,0);TaskPanel.update({...s,tasks:{...s.tasks,liveCoverage:true,inferred:true,counts:{running:100,waiting:1,unknown:2},rows:Array.from({length:100},(_,i)=>({status:'running',confirmedAt:i<98?now:i===98?yesterday.getTime():null}))}},false);});
    assert.equal(await page.locator('.summary-running').innerText(),'100*','running count leads');assert.match(await page.locator('.summary-recent').innerText(),/98\*$/,'today count');assert.match(await page.locator('.summary-history').innerText(),/99\*$/,'three-day count');assert.doesNotMatch(await page.locator('.compact-task-summary').textContent(),/8h/,'8h removed');assert.doesNotMatch(await page.locator('.compact-task-summary').getAttribute('aria-label'),/8h/,'accessible summary matches visible metrics');
    const clipped=await page.locator('.compact-task-summary').evaluate(e=>{const r=e.getBoundingClientRect();return [...e.querySelectorAll('.summary-running,.summary-running-label,.summary-recent,.summary-history')].some(n=>{const b=n.getBoundingClientRect();return n.scrollWidth>n.clientWidth+1||b.top<r.top-1||b.bottom>r.bottom+1||b.left<r.left-1||b.right>r.right+1;});});if(clipped)console.log(await page.locator('.compact-task-summary').evaluate(e=>({box:e.getBoundingClientRect().toJSON(),nodes:[...e.children].map(n=>({text:n.textContent,box:n.getBoundingClientRect().toJSON(),scroll:n.scrollWidth,client:n.clientWidth,font:getComputedStyle(n).font}))})));assert.equal(clipped,false,'summary text fully visible '+locale);}
    await page.evaluate(async()=>TaskPanel.update(await quota.getState(),false));
    await page.screenshot({path:output+'/compact-summary.png'});
    await page.evaluate(async()=>{await quota.settings({locale:'zh-TW'});const s=await quota.getState(),now=Date.now();TaskPanel.update({...s,tasks:{...s.tasks,liveCoverage:true,inferred:true,counts:{running:3},rows:Array.from({length:9},(_,i)=>({status:i<3?'running':'idle',confirmedAt:now-(i<4?0:86400000)}))}},false);});await page.screenshot({path:output+'/running-first-03.png'});
    await page.evaluate(()=>quota.settings({petPlacement:'title',petCharacter:'claude'}));
    await page.locator('.compact-brand.pet-idle .brand-pet').waitFor({state:'visible',timeout:20000});
    assert.equal(await page.locator('.compact-task-summary').isVisible(),false,'title pet hides task text');
    assert.equal(await page.locator('.compact-name').isVisible(),false,'title pet hides name');
    const withPet=await compactGeometry();for(let i=0;i<compact.length;i++)for(const k of ['x','y','w','h'])assert.ok(Math.abs(compact[i][k]-withPet[i][k])<1,'title pet fixed '+k);
    await page.screenshot({path:output+'/compact-title-pet.png'});
    await page.evaluate(()=>quota.settings({petPlacement:'stage'}));
    await page.locator('.compact-task-summary').waitFor({state:'visible'});
    await page.locator('#toggle').click();await page.evaluate(()=>quota.settings({compactTaskSummary:false}));assert.equal((await page.evaluate(()=>quota.getState())).settings.compactTaskSummary,true,'summary cannot be disabled');await page.locator('#collapse').click();await page.waitForTimeout(100);const original=await compactGeometry();for(let i=0;i<compact.length;i++)for(const k of ['x','y','w','h'])assert.ok(Math.abs(compact[i][k]-original[i][k])<1,'compact summary fixed '+k);
    assert.deepEqual(errors,[]);console.log('PASS task UI: real Electron, local event fixtures, four locales, XSS, keyboard, fixed geometry and no quota calls');
  }finally{if(app)await app.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
})().catch(e=>{console.error(e);process.exitCode=1;});
