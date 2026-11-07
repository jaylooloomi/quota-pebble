// Bounded renderer fixtures only: no live service calls, inference or task changes.
const {_electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pebble-lazy-audit-'));let app;try{
  const env={...process.env,QUOTA_TEST_DATA:dir};delete env.ELECTRON_RUN_AS_NODE;
  app=await _electron.launch({args:['.','--demo','--test-mode'],env});const page=await app.firstWindow();await page.waitForFunction(()=>window.quota);await page.locator('#toggle').click();await page.locator('#tab-tasks').click();
  await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].webContents.send=()=>{};});
  const result=await page.evaluate(async()=>{
    const s=await quota.getState(),now=Date.now(),frames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))),report=[];
    s.tasks={...s.tasks,liveCoverage:true,rows:Array.from({length:100},(_,i)=>({id:'audit-'+i,provider:['codex','claude','antigravity'][i%3],title:'Audit task '+i,project:'D:/fixture',source:'rollout',status:['running','waiting','idle','unknown'][i%4],confirmedAt:now-Math.floor(i/4)%9*86400000,observedAt:now})),counts:{running:25,waiting:25,idle:25,unknown:25}};
    const check=(ok,message)=>{if(!ok)throw Error(message);};
    for(const locale of ['zh-TW','en','ja','ko']){
      s.settings.locale=locale;TaskPanel.update(s,true);let list=document.querySelector('.task-list');check(list.querySelectorAll('.task-row').length<=3,locale+' initial render not deferred');await frames();
      for(const filter of QuotaTaskFilters.order){
        // Force a real change so every filter exercises first-batch behavior.
        document.querySelector('[data-task-filter='+(filter==='all'?'running':'all')+']').click();await frames();
        const start=performance.now();document.querySelector('[data-task-filter='+filter+']').click();const first=list.querySelectorAll('.task-row').length;check(first<=3,locale+'/'+filter+' first batch');await frames();
        const expected=s.tasks.rows.filter(r=>QuotaTaskFilters.matches(r,filter,now));let maxCards=0;
        for(const position of [0,525,100000]){
          list.scrollTop=position;list.dispatchEvent(new Event('scroll'));await frames();const cards=[...list.querySelectorAll('.task-row')];maxCards=Math.max(maxCards,cards.length);check(cards.length<=8,locale+'/'+filter+' all rows mounted');
          check(Math.abs(list.getBoundingClientRect().height-308)<=1,locale+'/'+filter+' viewport expanded');
          const ids=new Set(cards.map(n=>n.dataset.sessionId));check(ids.size===cards.length,'duplicate rows');check(cards.every(n=>expected.some(r=>r.id===n.dataset.sessionId)),locale+'/'+filter+' wrong rows');
          if(position===100000&&expected.length)check(ids.has(expected[expected.length-1].id),locale+'/'+filter+' tail inaccessible');
          check(cards.every(n=>Number(n.getAttribute('aria-setsize'))===expected.length),locale+'/'+filter+' wrong total');
        }
        report.push({locale,filter,matches:expected.length,firstBatch:first,maxCards,elapsedMs:performance.now()-start});
      }
      document.querySelector('[data-task-filter=all]').click();const hiddenList=list;let mutations=0;const watcher=new MutationObserver(ms=>mutations+=ms.length);watcher.observe(hiddenList,{childList:true,subtree:true});
      TaskPanel.update(s,false);await frames();const before=mutations;for(let i=0;i<5;i++){s.tasks.rows=s.tasks.rows.map(r=>({...r,observedAt:now+i}));TaskPanel.update(s,false);}await frames();check(mutations===before,'hidden task list rebuilt');watcher.disconnect();
    }
    // Real main-tab clicks must not rebuild the off-screen task list.
    render(s);document.querySelector('#tab-tasks').click();await frames();const taskList=document.querySelector('.task-list');let hiddenChanges=0;const observer=new MutationObserver(ms=>hiddenChanges+=ms.length);observer.observe(taskList,{subtree:true,childList:true});
    const mainTabs=[];for(const view of ['quota','accounts','messages']){document.querySelector('#tab-'+view).click();await frames();const baseline=hiddenChanges;s.tasks.rows=s.tasks.rows.map(r=>({...r,observedAt:now+10}));render(s);await frames();check(hiddenChanges===baseline,view+' rebuilt hidden tasks');mainTabs.push(view);}
    observer.disconnect();return{filtersChecked:report.length,rows:100,mainTabs,report};
  });
  assert.equal(result.filtersChecked,36);await fs.mkdir('test-results/task-lazy-audit',{recursive:true});await fs.writeFile('test-results/task-lazy-audit/proof.json',JSON.stringify(result,null,2));console.log('PASS '+JSON.stringify({filters:result.filtersChecked,fixtureRows:100,maxCards:Math.max(...result.report.map(x=>x.maxCards)),maxFirstBatch:Math.max(...result.report.map(x=>x.firstBatch)),hiddenUpdates:'no rebuild'}));
}finally{await app?.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}})().catch(e=>{console.error(e);process.exitCode=1;});
