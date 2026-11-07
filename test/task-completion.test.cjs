const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {CompletionTracker,bubbleBounds}=require('../dist/task-completion');
const {CodexSessionReader}=require('../dist/codex-session-reader');
test('completion proof requires observed matching active turn; failure, baseline, reset and duplicate are silent',()=>{
  const t=new CompletionTracker(),row={id:'env:thread',title:'Task',host:'PC'};const now=Date.now();
  assert.equal(t.observe(row,'old','completed',now),undefined);
  assert.equal(t.observe(row,'a','inProgress',now),undefined);
  assert.equal(t.observe(row,'a','failed',now),undefined);
  assert.equal(t.observe(row,'a','completed',now),undefined);
  t.observe(row,'b','inProgress',now);assert.equal(t.observe(row,'b','completed',now).turnId,'b');assert.equal(t.observe(row,'b','completed',now),undefined);
  t.observe(row,'c','inProgress',now);t.reset();assert.equal(t.observe(row,'c','completed',now),undefined);
  t.observe(row,'d','inProgress',now);assert.equal(t.observe(row,'other','completed',now),undefined);
  t.observe(row,'e','inProgress',now);assert.equal(t.observe(row,'e','completed',now-180000),undefined);
});
test('bubble anchors to provider, follows parent, clamps multiple displays and falls below near top',()=>{
  const a={x:-1920,y:0,width:1920,height:1080},p={x:-1500,y:400,width:464,height:188};
  let b=bubbleBounds(p,a,280);assert.equal(b.y,254);assert.equal(b.x+b.tip,p.x+280);assert.equal(b.above,true);
  b=bubbleBounds({...p,y:12},a,280);assert.equal(b.above,false);assert.equal(b.placement,'right');assert.ok(b.y<80);
  for(const x of [-1920,-470]){b=bubbleBounds({...p,x},a,280);assert.ok(b.x>=a.x&&b.x+b.width<=a.x+a.width);}
});

test('tall panels use header-adjacent placement, both notice heights fit, and fallback never follows panel bottom',()=>{
  const area={x:0,y:40,width:960,height:680};
  for(const height of [142,166])for(const panelHeight of [76,480,1100]){
    const p={x:250,y:50,width:464,height:panelHeight},b=bubbleBounds(p,area,280,height);
    assert.equal(b.placement,'below');assert.equal(b.y,114);assert.ok(b.y+b.height<=720);assert.ok(b.x>=0&&b.x+b.width<=960);
    for(const x of [5,490]){const side=bubbleBounds({...p,x},area,280,height);assert.equal(side.placement,x===5?'right':'left');assert.ok(side.y>=40&&side.y<100);assert.ok(side.y+side.height<=720);assert.ok(side.sideTip>=24&&side.sideTip<=height-24);}
  }
  const b=bubbleBounds({x:-1500,y:-100,width:464,height:1000},{x:-1920,y:-120,width:1920,height:1080},280,166);assert.ok(b.x>=-1920&&b.y>=-120);assert.ok(b.y<0);
});
test('incremental local completion queue excludes historical, aborted, failed and subagent events; handles short appends',async()=>{
  const home=await fs.mkdtemp(path.join(os.tmpdir(),'pebble-completion-'));let now=Date.now();
  const id='01a188f8-5146-7ed1-bf76-242e9b60a849',file=path.join(home,'rollout-2026-11-03-'+id+'.jsonl');
  const line=p=>JSON.stringify({timestamp:new Date(now++).toISOString(),type:'event_msg',payload:p})+'\n';
  try{await fs.writeFile(file,JSON.stringify({type:'session_meta',payload:{id,cwd:'D:/p'}})+'\n'+line({type:'task_started',turn_id:'old'})+line({type:'task_complete',turn_id:'old'}));
    const r=new CodexSessionReader(home,()=>now);await r.scan();assert.deepEqual(r.drainCompletions(),[]);
    await fs.appendFile(file,line({type:'task_started',turn_id:'new'})+line({type:'task_complete',turn_id:'new'}));await r.scan();assert.equal(r.drainCompletions()[0].turnId,'new');await r.scan();assert.deepEqual(r.drainCompletions(),[]);
    for(const [type,status] of [['turn_aborted',undefined],['task_complete','failed'],['task_complete','interrupted']]){const turn='turn-'+now;await fs.appendFile(file,line({type:'task_started',turn_id:turn})+line({type,turn_id:turn,status}));await r.scan();assert.deepEqual(r.drainCompletions(),[]);}
    await fs.writeFile(file,JSON.stringify({type:'session_meta',payload:{id,cwd:'D:/p',parent_thread_id:'parent'}})+'\n'+line({type:'task_started',turn_id:'s'}));await r.scan();await fs.appendFile(file,line({type:'task_complete',turn_id:'s'}));await r.scan();assert.deepEqual(r.drainCompletions(),[]);
  }finally{assert.ok(home.startsWith(path.join(os.tmpdir(),'pebble-completion-')));await fs.rm(home,{recursive:true,force:true});}
});
