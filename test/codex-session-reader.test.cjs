const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {CodexSessionReader,SESSION_FRESH_MS}=require('../dist/codex-session-reader');
const {TaskMonitor}=require('../dist/task-monitor');
const {LocalTaskMonitor}=require('../dist/local-task-monitor');
const A='01a188f8-5146-7ed1-bf76-242e9b60a849',B='01a1986b-ebee-7a00-88eb-558b3ea244cc',T=1800000000000;
const record=(type,payload,time=T)=>JSON.stringify({timestamp:new Date(time).toISOString(),type,payload})+'\n';
const meta=(id,extra={})=>record('session_meta',{id,cwd:'D:/project',...extra},T-10000);
const event=(type,turn='turn-1',time=T)=>record('event_msg',{type,turn_id:turn},time);
async function setup(){const home=await fs.mkdtemp(path.join(os.tmpdir(),'pebble-rollout-')),root=path.join(home,'sessions'),day=path.join(root,'2026/11/03');await fs.mkdir(day,{recursive:true});return{home,root,file:id=>path.join(day,'rollout-2026-11-03T01-00-00-'+id+'.jsonl')};}
test('local events independently detect concurrent running/idle sessions, names and freshness',async()=>{
  const d=await setup();let now=T;try{
    await fs.writeFile(d.file(A),meta(A)+event('task_started'));await fs.writeFile(d.file(B),meta(B)+event('task_started')+event('task_complete','turn-1',T+1));
    await fs.writeFile(path.join(d.home,'session_index.jsonl'),JSON.stringify({id:A,thread_name:'Actual title'})+'\n');now++;
    const reader=new CodexSessionReader(d.root,()=>now);await reader.scan();assert.equal(reader.rows().find(r=>r.id===A).status,'running');assert.equal(reader.rows().find(r=>r.id===A).title,'Actual title');assert.equal(reader.rows().find(r=>r.id===B).status,'idle');assert.equal(reader.rows()[0].evidence,'inferred');const diag=reader.diagnostics();assert.equal(diag.indexedFiles,2);assert.equal(diag.missingMetadata,0);assert.match(diag.rootFingerprint,/^[a-f0-9]{16}$/);assert.ok(!JSON.stringify(diag).includes(d.home));assert.ok(!JSON.stringify(diag).includes(A));
    await reader.scan();assert.equal(reader.bytesRead,0,'unchanged complete files not reread');now+=SESSION_FRESH_MS+1;assert.equal(reader.rows().find(r=>r.id===A).status,'unknown');assert.equal(reader.rows().find(r=>r.id===B).status,'idle');
    await fs.appendFile(d.file(A),event('task_complete','turn-1',now));await reader.scan();assert.equal(reader.rows().find(r=>r.id===A).status,'idle');
  }finally{await fs.rm(d.home,{recursive:true,force:true});}
});
test('continued rollouts use the thread ID and show one row with the newest event',async()=>{
  const d=await setup();try{
    const reader=new CodexSessionReader(d.root,()=>T+100);
    const continuation=d.file(`${A}_${B}`);
    await fs.writeFile(continuation,meta(A)+event('task_started','turn-2',T+2));
    await fs.writeFile(d.file(A),meta(A)+event('task_started')+event('task_complete','turn-1',T+1));
    await fs.utimes(d.file(A),new Date(T+5000),new Date(T+5000));
    await reader.scan();
    assert.deepEqual(reader.rows().map(({id,status})=>({id,status})),[{id:A,status:'running'}]);

    await fs.appendFile(continuation,event('task_complete','turn-2',T+3));
    await reader.scan();
    assert.deepEqual(reader.rows().map(({id,status})=>({id,status})),[{id:A,status:'idle'}]);
    assert.equal(reader.drainCompletions().length,1);
  }finally{await fs.rm(d.home,{recursive:true,force:true});}
});
test('waiting survives token activity; matching tool result resolves it; late old turns cannot change new ones',async()=>{
  const d=await setup();try{
    let now=T+100;const reader=new CodexSessionReader(d.root,()=>now);
    await fs.writeFile(d.file(A),meta(A)+event('task_started')+record('response_item',{type:'function_call',name:'request_user_input',call_id:'ask',arguments:'PRIVATE_PAYLOAD'},T+1)+record('token_usage_record',{turn_id:'turn-1'},T+2));
    await reader.scan();assert.equal(reader.rows()[0].status,'waiting');
    await fs.appendFile(d.file(A),record('response_item',{type:'function_call_output',call_id:'other',output:'SECRET_RESULT'},T+3));await reader.scan();assert.equal(reader.rows()[0].status,'waiting');
    await fs.appendFile(d.file(A),record('response_item',{type:'function_call_output',call_id:'ask'},T+4));await reader.scan();assert.equal(reader.rows()[0].status,'running');
    await fs.appendFile(d.file(A),record('response_item',{type:'message',role:'assistant',phase:'final_answer'},T+4));await reader.scan();assert.equal(reader.rows()[0].status,'unknown','final text alone is not terminal proof');
    await fs.appendFile(d.file(A),event('task_complete','turn-1',T+5)+record('token_usage_record',{turn_id:'turn-1'},T+6));await reader.scan();assert.equal(reader.rows()[0].status,'idle','late activity cannot reopen finished turn');
    await fs.appendFile(d.file(A),event('turn_started','turn-2',T+7)+event('turn_complete','turn-1',T+8));await reader.scan();assert.equal(reader.rows()[0].status,'running');
    assert.doesNotMatch(JSON.stringify([...reader.files]),/PRIVATE_PAYLOAD|SECRET_RESULT|arguments|output/,'no bodies retained');
  }finally{await fs.rm(d.home,{recursive:true,force:true});}
});
test('bounded bootstrap skips huge records, handles partial lines, replacement and deletion',async()=>{
  const d=await setup();try{
    const reader=new CodexSessionReader(d.root,()=>T+100);const huge=record('response_item',{type:'message',role:'user',content:'x'.repeat(3*1024*1024)});
    const start=event('task_started');await fs.writeFile(d.file(A),meta(A)+huge+start.slice(0,-1));await reader.scan();assert.equal(reader.rows()[0].status,'unknown');assert.ok(reader.bytesRead<400*1024,'large transcript never fully scanned');
    await fs.appendFile(d.file(A),'\n');await reader.scan();assert.equal(reader.rows()[0].status,'running');
    await fs.writeFile(d.file(A),meta(A)+event('turn_aborted'));await reader.scan();assert.equal(reader.rows()[0].status,'idle');assert.equal(reader.rows()[0].event,'interrupted');
    await fs.unlink(d.file(A));await reader.scan();assert.equal(reader.rows().length,0);
    await fs.rm(d.root,{recursive:true,force:true});await reader.scan();assert.equal(reader.available,false);
  }finally{await fs.rm(d.home,{recursive:true,force:true});}
});

test('large live appends jump to fresh metadata without replaying completions or retaining payloads',async()=>{
 const d=await setup();let now=T;try{
  const reader=new CodexSessionReader(d.root,()=>now);await fs.writeFile(d.file(A),meta(A)+event('task_started'));await reader.scan();
  const huge=record('response_item',{type:'message',role:'user',content:'x'.repeat(8*1024*1024)},T+1);
  now+=1000;await fs.appendFile(d.file(A),event('task_complete','turn-1',T+1)+huge+event('task_started','turn-2',T+2));await reader.scan();
  assert.equal(reader.rows()[0].status,'running');assert.equal(reader.rows()[0].event,'turn-start');assert.ok(reader.bytesRead<400*1024);assert.deepEqual(reader.drainCompletions(),[]);
  await fs.appendFile(d.file(A),event('task_complete','turn-2',T+3));await reader.scan();assert.equal(reader.rows()[0].status,'idle');assert.equal(reader.drainCompletions().length,1);
  await fs.appendFile(d.file(A),huge);await reader.scan();assert.equal(reader.rows()[0].status,'unknown','skipped evidence cannot preserve an old running or idle state');
 }finally{await fs.rm(d.home,{recursive:true,force:true});}
});
test('unknown schemas, malformed/future records and subagents do not invent running sessions',async()=>{
  const d=await setup();try{
    await fs.writeFile(d.file(A),meta(A)+'broken\n'+event('unknown-event')+event('task_started','turn-1',T+100000));
    await fs.writeFile(d.file(B),meta(B,{source:{subagent:{thread_spawn:{parent_thread_id:A}}}})+event('task_started'));
    const r=new CodexSessionReader(d.root,()=>T);await r.scan();assert.equal(r.rows().length,1);assert.equal(r.rows()[0].status,'unknown');
  }finally{await fs.rm(d.home,{recursive:true,force:true});}
});
test('local monitor needs neither CLI RPC nor hooks, and terminal local events win over older hook evidence',async()=>{
  const d=await setup();let calls=0;const rpc={async call(){calls++;throw Error('CLI not available');},close(){}};
  const monitor=new TaskMonitor(path.join(d.home,'no-hooks'),rpc,rpc,()=>{},()=>T+100,d.root);
  try{
    require('../src/ui/task-hook.cjs').record({session_id:A,turn_id:'turn-1',hook_event_name:'PreToolUse',cwd:'D:/project'},path.join(d.home,'no-hooks'),T-10);
    await fs.writeFile(d.file(A),meta(A)+event('task_started'));await monitor.start();const snap=monitor.snapshot();assert.equal(calls,0);assert.equal(snap.connection,'local');assert.equal(snap.counts.running,1);assert.equal(snap.rows[0].source,'rollout');
    assert.equal(snap.rows.length,1,'hook and local records do not duplicate the same session');
    await fs.appendFile(d.file(A),event('task_complete','turn-1',T+1));await monitor.tick(true);assert.equal(monitor.snapshot().counts.idle,1);
  }finally{monitor.close();await fs.rm(d.home,{recursive:true,force:true});}
});
test('production local monitor ignores hook records, works without CLI and retries a missing root',async()=>{
  const d=await setup(),cp=require('node:child_process'),spawn=cp.spawn;let spawned=0,changes=0;
  const monitor=new LocalTaskMonitor(d.root,()=>changes++,()=>T+100);
  try{
    cp.spawn=()=>{spawned++;throw Error('No process launch permitted');};
    require('../src/ui/task-hook.cjs').record({session_id:B,hook_event_name:'PreToolUse',cwd:'D:/private'},path.join(d.home,'task-events'),T);
    await fs.writeFile(d.file(A),meta(A)+event('task_started'));assert.equal(monitor.snapshot().enabled,false);
    await Promise.all([monitor.start(),monitor.start()]);assert.equal(monitor.snapshot().counts.running,1);assert.equal(monitor.snapshot().rows.length,1);assert.equal(spawned,0);assert.ok(changes>0);
    await fs.rm(d.root,{recursive:true,force:true});await monitor.tick();assert.equal(monitor.snapshot().connection,'unavailable');assert.equal(monitor.snapshot().liveCoverage,false);
    await fs.mkdir(path.dirname(d.file(A)),{recursive:true});await fs.writeFile(d.file(A),meta(A)+event('task_complete'));await monitor.tick();assert.equal(monitor.snapshot().counts.idle,1);
  }finally{cp.spawn=spawn;monitor.close();await monitor.start();await monitor.tick();await fs.rm(d.home,{recursive:true,force:true});}
});
