const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {TaskMonitor,taskRows,readTaskEvents}=require('../dist/task-monitor');
const {record}=require('../src/ui/task-hook.cjs');
const {installTaskBridge}=require('../dist/task-bridge-setup');
const now=1800000000000,id='session-1',thread={id,name:'Monitor',cwd:'D:/project',status:{type:'active',activeFlags:[]}};
test('history and unloaded entries never become active; loaded runtime distinguishes waiting',()=>{
  assert.equal(taskRows([thread],new Set([id]),false,[],now)[0].status,'unknown');
  assert.equal(taskRows([thread],new Set(),true,[],now)[0].status,'unknown');
  assert.equal(taskRows([thread],new Set([id]),true,[],now)[0].status,'running');
  assert.equal(taskRows([{...thread,status:{type:'active',activeFlags:['waitingOnApproval']}}],new Set([id]),true,[],now)[0].status,'waiting');
  assert.equal(taskRows([{...thread,status:{type:'idle'}}],new Set([id]),true,[],now)[0].status,'idle');
  assert.equal(taskRows([{...thread,status:{type:'systemError'}}],new Set([id]),true,[],now)[0].status,'unknown');
  assert.equal(taskRows([{...thread,parentThreadId:'parent'}],new Set([id]),true,[],now).length,0);
  assert.equal(taskRows(Array.from({length:500},(_,i)=>({...thread,id:'s-'+i})),new Set(),false,[],now).length,100);
});
test('fresh events, expiry, Stop continuation and terminal late events are conservative',()=>{
  const e=event=>({id,turn:'turn-1',event,time:now-100,project:'P'});
  assert.equal(taskRows([],new Set(),false,[e('PreToolUse')],now)[0].status,'running');
  assert.equal(taskRows([],new Set(),false,[e('PermissionRequest')],now)[0].status,'waiting');
  assert.equal(taskRows([],new Set(),false,[e('Stop')],now)[0].status,'unknown');
  assert.equal(taskRows([],new Set(),false,[e('Stop'),e('PreToolUse')],now)[0].status,'running');
  assert.equal(taskRows([],new Set(),false,[e('UserPromptSubmit'),{...e('UserPromptSubmit'),turn:'turn-2'},e('Stop')],now)[0].status,'running','late old turn cannot clear new turn');
  assert.equal(taskRows([],new Set(),false,[e('Interrupt'),e('PostToolUse')],now)[0].status,'idle');
  assert.equal(taskRows([],new Set(),false,[e('SessionEnd')],now+45001)[0].status,'unknown');
  assert.equal(taskRows([thread],new Set([id]),true,[e('PermissionRequest')],now)[0].source,'runtime');
});
test('hook receiver stores allowlisted metadata only; malformed, subagents and future events rejected',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pebble-hook-'));try{
    const input={session_id:id,turn_id:'t',hook_event_name:'UserPromptSubmit',cwd:'P',prompt:'PRIVATE_PROMPT',tool_input:{password:'SECRET'},transcript_path:'PRIVATE_PATH'};
    assert.equal(record(input,dir,now),true);assert.equal(record({...input,agent_id:'child'},dir,now),false);assert.equal(record({...input,session_id:'../../escape'},dir,now),false);assert.equal(record({...input,hook_event_name:'invalid'},dir,now),false);
    const body=fs.readFileSync(path.join(dir,fs.readdirSync(dir)[0]),'utf8');assert.doesNotMatch(body,/PRIVATE|SECRET|prompt|password|transcript/);
    assert.equal(readTaskEvents(dir,now).length,1);assert.equal(readTaskEvents(dir,now-2000).length,0);assert.equal(readTaskEvents(dir,now+86400001).length,0);
    fs.writeFileSync(path.join(dir,'00000000-0000-0000-0000-000000000001.json'),'bad');fs.writeFileSync(path.join(dir,'00000000-0000-0000-0000-000000000002.json'),'x'.repeat(4097));
    assert.equal(readTaskEvents(dir,now).length,1);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('installer preserves other hooks, backs up and is idempotent without granting trust',()=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'pebble-setup-'));try{
    fs.mkdirSync(path.join(home,'.codex'));const file=path.join(home,'.codex/hooks.json');fs.writeFileSync(file,JSON.stringify({description:'existing',hooks:{Stop:[{hooks:[{type:'command',command:'existing'}]}]}}));
    const run=()=>installTaskBridge(home,path.resolve('src/ui/task-hook.cjs'),process.execPath);assert.equal(run().needsTrust,true);run();
    const data=JSON.parse(fs.readFileSync(file));assert.equal(data.description,'existing');assert.equal(data.hooks.Stop.length,2);assert.equal(data.hooks.SessionStart.length,1);assert.equal(data.hooks.Stop[0].hooks[0].command,'existing');assert.doesNotMatch(JSON.stringify(data),/trust|bypass/);
    assert.ok(fs.readdirSync(path.dirname(file)).some(n=>n.includes('backup')));
    fs.writeFileSync(file,'invalid');assert.throws(run);assert.equal(fs.readFileSync(file,'utf8'),'invalid');
  }finally{fs.rmSync(home,{recursive:true,force:true});}
});
test('monitor reads only documented list methods, deduplicates and drops runtime after disconnection/expiry',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pebble-monitor-'));let time=now,fail=false,closed=0;const calls=[];
  const client={async call(method){calls.push(method);if(fail)throw Error('offline');return method==='thread/list'?{data:[thread]}:{data:[id]};},close(){closed++;}};
  const m=new TaskMonitor(dir,client,client,()=>{},()=>time);try{
    await Promise.all([m.start(),m.start()]);assert.equal(m.snapshot().counts.running,1);assert.equal(m.snapshot().liveCoverage,true);assert.ok(calls.every(c=>['thread/list','thread/loaded/list'].includes(c)));
    time+=46000;assert.equal(m.snapshot().counts.running,0);assert.equal(m.snapshot().liveCoverage,false);fail=true;await m.tick();assert.equal(m.snapshot().rows[0].status,'unknown');assert.equal(m.snapshot().connection,'unavailable');
  }finally{m.close();assert.equal(closed,3);fs.rmSync(dir,{recursive:true,force:true});}
});
