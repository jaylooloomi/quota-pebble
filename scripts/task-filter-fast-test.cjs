// Full renderer interaction: native layout event remains enabled, no live requests.
const {_electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pebble-filter-fast-'));let app;try{
 const env={...process.env,QUOTA_TEST_DATA:dir};delete env.ELECTRON_RUN_AS_NODE;
 app=await _electron.launch({...(process.env.QUOTA_PACKAGED_EXE?{executablePath:process.env.QUOTA_PACKAGED_EXE}:{}),args:[...(process.env.QUOTA_PACKAGED_EXE?[]:['.']),'--demo','--test-mode'],env});
 const page=await app.firstWindow();await page.waitForFunction(()=>window.quota);await page.locator('#toggle').click();await page.locator('#tab-tasks').click();
 if(process.env.QUOTA_TEST_CPU_RATE){const session=await page.context().newCDPSession(page);await session.send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.QUOTA_TEST_CPU_RATE)});}
 await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].webContents.send=()=>{};});
 const result=await page.evaluate(async()=>{
  const s=await quota.getState(),now=Date.now(),samples=[],firstBatch=[];s.tasks={...s.tasks,liveCoverage:true,rows:Array.from({length:100},(_,i)=>({id:'fast-'+i,provider:['codex','claude','antigravity'][i%3],title:'Task '+i,project:'D:/fixture',status:['running','waiting','idle'][i%3],source:'rollout',observedAt:now,confirmedAt:now-(i%6)*86400000})),counts:{running:34,waiting:33,idle:33}};
  let layoutEvents=0;window.addEventListener('task-layout-change',()=>layoutEvents++);
  const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  for(const locale of ['zh-TW','en','ja','ko']){
   s.settings.locale=locale;TaskPanel.update(s,true);await frame();const heading=document.querySelector('.task-heading'),filters=document.querySelector('.task-filters'),list=document.querySelector('.task-list');
   const bounds=list.getBoundingClientRect();
   for(const f of ['all','running','today','threeDays','fiveDays','week','waiting','unknown','idle']){
    const t=performance.now();document.querySelector('[data-task-filter='+f+']').click();const handlerMs=performance.now()-t;firstBatch.push(list.querySelectorAll('.task-row').length);await frame();
    samples.push({locale,filter:f,handlerMs,paintMs:performance.now()-t});
    if(list!==document.querySelector('.task-list')||heading!==document.querySelector('.task-heading')||filters!==document.querySelector('.task-filters'))throw Error('Filter rebuilt the panel');
    if(document.querySelector('[data-task-filter='+f+']').getAttribute('aria-pressed')!=='true')throw Error('Selection lagged');
    if(Math.abs(list.getBoundingClientRect().height-bounds.height)>1)throw Error('Filter changed viewport height');
    if(list.querySelectorAll('.task-row').length>8)throw Error('Unbounded card count');
   }
   for(const f of ['all','running','all','waiting'])document.querySelector('[data-task-filter='+f+']').click();await frame();
   if([...list.querySelectorAll('.task-row')].some(r=>r.dataset.status!=='waiting'))throw Error('Stale batch won rapid clicks');
   list.scrollTop=500;list.dispatchEvent(new Event('scroll'));await frame();const scroll=list.scrollTop;
   for(let i=0;i<20;i++){s.tasks.checkedAt=now+i;s.tasks.localSource={...s.tasks.localSource,reader:{bytesRead:i}};s.tasks.rows=s.tasks.rows.map(r=>({...r,observedAt:now+i}));TaskPanel.update(s,true);}
   if(list!==document.querySelector('.task-list')||list.scrollTop!==scroll)throw Error('Heartbeat rebuilt list or lost scroll');
  }
  const sorted=samples.map(x=>x.handlerMs).sort((a,b)=>a-b),paints=samples.map(x=>x.paintMs).sort((a,b)=>a-b),p95=a=>a[Math.ceil(a.length*.95)-1];return{samples:samples.length,handlerP95Ms:p95(sorted),twoFrameP95Ms:p95(paints),maxFirstBatch:Math.max(...firstBatch),layoutEvents};
 });
 result.cpuRate=Number(process.env.QUOTA_TEST_CPU_RATE||1);
 assert.equal(result.layoutEvents,0);assert.ok(result.maxFirstBatch<=3);assert.ok(result.handlerP95Ms<100,'click handlers must stay responsive');assert.ok(result.twoFrameP95Ms<250,'click-to-frame budget');
 await fs.mkdir('test-results/task-filter-fast',{recursive:true});await fs.writeFile('test-results/task-filter-fast/proof.json',JSON.stringify(result,null,2));console.log('PASS '+JSON.stringify(result));
 }finally{await app?.close();assert.ok(dir.startsWith(path.join(os.tmpdir(),'pebble-filter-fast-')));await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
})().catch(e=>{console.error(e);process.exitCode=1;});
