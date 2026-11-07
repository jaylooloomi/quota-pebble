const {_electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pebble-local-ui-')),root=path.join(dir,'codex-sessions'),day=path.join(root,'2026/11/03'),out='test-results/local-sessions';await fs.mkdir(day,{recursive:true});await fs.mkdir(out,{recursive:true});
  const ids=Array.from({length:6},(_,i)=>'01a188f8-5146-7ed1-bf76-'+String(i+1).padStart(12,'0')),now=Date.now();
  const line=(type,payload,time=now)=>JSON.stringify({timestamp:new Date(time).toISOString(),type,payload})+'\n';
  const file=id=>path.join(day,'rollout-2026-11-03T01-00-00-'+id+'.jsonl');
  for(let i=0;i<ids.length;i++){let body=line('session_meta',{id:ids[i],cwd:'D:/projects/Task '+i});body+=line('event_msg',{type:'task_started',turn_id:'turn-'+i},i===5?now-3600000:now);if(i===2)body+=line('response_item',{type:'function_call',name:'request_user_input',call_id:'ask'});if(i===3||i===4)body+=line('event_msg',{type:'task_complete',turn_id:'turn-'+i});await fs.writeFile(file(ids[i]),body);}
  await fs.writeFile(path.join(dir,'session_index.jsonl'),ids.map((id,i)=>JSON.stringify({id,thread_name:'Task '+(i+1)})).join('\n')+'\n');
  // Reader normally finds index adjacent to sessions; test root has the same layout.
  let app;const env={...process.env,QUOTA_TEST_DATA:dir};delete env.ELECTRON_RUN_AS_NODE;
  try{
    app=await _electron.launch({...(process.env.QUOTA_PACKAGED_EXE?{executablePath:process.env.QUOTA_PACKAGED_EXE}:{}),args:[...(process.env.QUOTA_PACKAGED_EXE?[]:['.']),'--demo','--test-mode'],env});const p=await app.firstWindow(),errors=[];p.on('pageerror',e=>errors.push(e.message));
    await p.waitForFunction(()=>window.quota&&document.querySelector('#mini-codex').textContent.includes('%'));await p.locator('#toggle').click();await p.locator('#tab-tasks').click();
    await p.waitForFunction(async()=>{const t=(await quota.getState()).tasks;return t.connection==='local'&&t.rows.length===6;});
    const state=await p.evaluate(()=>quota.getState());assert.deepEqual(state.tasks.counts,{running:2,waiting:1,idle:2,unknown:1});assert.ok(state.tasks.rows.every(r=>r.source==='rollout'&&r.evidence==='inferred'));assert.equal(state.tasks.rows.find(r=>r.id===ids[0]).title,'Task 1');
    for(const locale of ['zh-TW','en','ja','ko']){await p.evaluate(locale=>quota.settings({locale}),locale);await p.waitForTimeout(100);assert.equal(await p.locator('#task-panel').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);assert.ok((await p.locator('.task-list').boundingBox()).height<=309);await p.screenshot({path:out+'/'+locale+'.png'});}
    await fs.appendFile(file(ids[0]),line('event_msg',{type:'task_complete',turn_id:'turn-0'},Date.now()));
    await p.waitForFunction(async()=>{const t=(await quota.getState()).tasks;return t.counts.running===1&&t.counts.idle===3;});
    assert.deepEqual(errors,[]);console.log('PASS local sessions: no CLI/hook setup, six independent sessions, running/waiting/idle/stale, completion updates, four locales, three-row scrollbar');
  }finally{if(app)await app.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
})().catch(e=>{console.error(e);process.exitCode=1;});
