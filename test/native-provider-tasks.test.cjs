const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {claudeRegistryRow,readClaudeRegistry,antigravityTaskRows,AntigravityTaskReader,NativeProviderTaskMonitor}=require('../dist/native-provider-tasks');
const now=Date.now(),v={pid:42,sessionId:'session-1',procStart:'123456789012345678',cwd:'D:/project',name:'Work',status:'busy',statusUpdatedAt:now-86400000,updatedAt:now-1000},identity={pid:42,procStart:v.procStart,claude:true};
test('Claude registry validates process identity/generation; old transition time is not a dead heartbeat',()=>{
  for(const [native,mapped] of [['busy','running'],['waiting','waiting'],['idle','idle'],['shell','idle'],['other','unknown']])assert.equal(claudeRegistryRow({...v,status:native},identity,now).status,mapped);
  for(const id of [undefined,{...identity,claude:false},{...identity,procStart:'reused'},{...identity,pid:43}])assert.equal(claudeRegistryRow(v,id,now).status,'unknown');
  assert.equal(claudeRegistryRow(v,identity,now).confirmedAt,v.statusUpdatedAt);assert.equal(claudeRegistryRow(v,identity,now).source,'claude-registry');
  assert.notEqual(claudeRegistryRow(v,identity).id,claudeRegistryRow({...v,pid:43},{...identity,pid:43}).id,'two processes on the same session keep separate state');
  assert.notEqual(claudeRegistryRow(v,identity).id,claudeRegistryRow({...v,sessionId:'new'},identity).id,'session selection rebinds');
  assert.equal(claudeRegistryRow({...v,sessionId:'../bad'},identity),null);
  const row=claudeRegistryRow({...v,messagingSocketPath:'SECRET',peerToken:'SECRET',waitingFor:'SECRET',prompt:'SECRET'},identity);assert.ok(!JSON.stringify(row).includes('SECRET'));
});
test('bounded registry reads skip keys, malformed, oversized and mismatched PID files',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pebble-native-registry-'));try{
    await fs.writeFile(path.join(dir,'42.json'),JSON.stringify(v));await fs.writeFile(path.join(dir,'42.key'),'SECRET');await fs.writeFile(path.join(dir,'43.json'),'{bad');await fs.writeFile(path.join(dir,'44.json'),'x'.repeat(9000));await fs.writeFile(path.join(dir,'45.json'),JSON.stringify(v));
    const r=await readClaudeRegistry(dir,async ids=>{assert.ok(!ids.includes(45));return[identity];},now);assert.equal(r.rows.length,1);assert.equal(r.rows[0].status,'running');assert.equal(r.partial,true);
    const failed=await readClaudeRegistry(dir,async()=>{throw Error('probe denied');},now);assert.equal(failed.rows[0].status,'unknown');
    assert.equal((await readClaudeRegistry(path.join(dir,'missing'))).available,false);
  }finally{assert.ok(dir.startsWith(path.join(os.tmpdir(),'pebble-native-registry-')));await fs.rm(dir,{recursive:true,force:true});}
});

test('combined monitor includes native providers in counts, sorts active first and marks truncated coverage',()=>{
  const {CombinedTaskMonitor}=require('../dist/combined-task-monitor');const m=new CombinedTaskMonitor('unused',()=>{},false);
  m.local={snapshot:()=>({rows:Array.from({length:100},(_,i)=>({id:'c'+i,status:'idle',confirmedAt:now})),liveCoverage:true,partial:false,connection:'local'}),close(){}};
  m.native={snapshot:()=>({rows:[claudeRegistryRow(v,identity,now),...antigravityTaskRows({trajectorySummaries:[{trajectoryId:'a',status:'CASCADE_RUN_STATUS_RUNNING'}]},now)],claude:{available:true,count:1},antigravity:{available:true,count:1},partial:false}),close(){}};
  try{const s=m.snapshot();assert.equal(s.rows.length,100);assert.equal(s.counts.running,2);assert.equal(s.rows[0].provider,'claude');assert.equal(s.rows[1].provider,'antigravity');assert.equal(s.partial,true);assert.equal(s.native.claude.count,1);assert.equal(s.liveCoverage,true);}finally{m.close();}
});
test('Antigravity maps only known enum meanings, preserves metadata, and never interprets empty as global no-tasks',()=>{
  const task={trajectoryId:'t',summary:'Title',workspaces:[{workspaceFolderAbsoluteUri:'file:///D:/project'}],lastModifiedTime:new Date(now).toISOString(),steps:'SECRET',trajectoryMetadata:{prompt:'SECRET'}};
  for(const [status,mapped] of [['CASCADE_RUN_STATUS_RUNNING','running'],['CASCADE_RUN_STATUS_IDLE','idle'],['CASCADE_RUN_STATUS_CANCELING','unknown'],['CASCADE_RUN_STATUS_BUSY','unknown'],['NEW_ENUM','unknown']]){const row=antigravityTaskRows({trajectorySummaries:{a:{...task,status}}},now)[0];assert.equal(row.status,mapped);assert.equal(row.project,'file:///D:/project');assert.ok(!JSON.stringify(row).includes('SECRET'));}
  assert.deepEqual(antigravityTaskRows({trajectorySummaries:{}}),[]);assert.deepEqual(antigravityTaskRows({}),[]);assert.throws(()=>antigravityTaskRows({unexpected:true}),/SCHEMA/);assert.deepEqual(antigravityTaskRows({trajectorySummaries:[{trajectoryId:'../bad'}]}),[]);
});

test('reachable Antigravity empty protobuf response stays connected; malformed response does not',async()=>{
 let data={};const reader=new AntigravityTaskReader(async()=>[{pid:42,token:'fixture',ports:[1]}],async()=>data);
 const empty=await reader.read();assert.equal(empty.available,true);assert.equal(empty.partial,false);assert.deepEqual(empty.rows,[]);
 data={unexpected:true};const invalid=await reader.read();assert.equal(invalid.available,false);assert.equal(invalid.error,'LOCAL_SERVICE_UNAVAILABLE');
});
test('Antigravity source only calls readonly method, caches valid listener and rediscovers after failure',async()=>{
  let fail=false,discover=0;const calls=[];let time=now;
  const r=new AntigravityTaskReader(async()=>{discover++;return[{pid:42,token:'SECRET',ports:[1,2]}];},async(c,p,method,protocol)=>{calls.push({p,method,protocol});assert.equal(method,'GetAllCascadeTrajectories');if(p!==2||fail)throw Error('offline');return{trajectorySummaries:{a:{trajectoryId:'a',status:'CASCADE_RUN_STATUS_RUNNING'}}};},()=>time);
  let s=await r.read();assert.equal(s.rows[0].status,'running');assert.equal(s.available,true);calls.length=0;s=await r.read();assert.equal(calls.length,1);assert.equal(calls[0].p,2);assert.ok(!JSON.stringify(s).includes('SECRET'));
  fail=true;time+=10000;s=await r.read();assert.equal(s.available,false);assert.deepEqual(s.rows,[]);
});
test('native monitor preserves missing sessions as unknown, handles source independence, expiry and close',async()=>{
  let time=now,claudeStatus='busy',agStatus='CASCADE_RUN_STATUS_RUNNING',missing=false,agOffline=false;
  const monitor=new NativeProviderTaskMonitor('unused',()=>{},async()=>({rows:missing?[]:[claudeRegistryRow({...v,status:claudeStatus},identity,time)],available:!missing,partial:false,checkedAt:time}),{read:async()=>{if(agOffline)throw Error('offline');return{rows:antigravityTaskRows({trajectorySummaries:[{trajectoryId:'t',status:agStatus}]},time),available:true,partial:false,checkedAt:time};}},()=>time);
  try{await monitor.tick();assert.equal(monitor.snapshot().rows.filter(r=>r.status==='running').length,2);
    claudeStatus='waiting';time+=10000;agStatus='CASCADE_RUN_STATUS_IDLE';await monitor.tick();assert.deepEqual(monitor.snapshot().rows.map(r=>r.status),['waiting','idle']);
    missing=true;agOffline=true;time+=10000;await monitor.tick();assert.ok(monitor.snapshot().rows.every(r=>r.status==='unknown'));assert.equal(monitor.snapshot().claude.available,false);
    missing=false;claudeStatus='busy';agOffline=false;time+=10000;await monitor.tick();assert.equal(monitor.snapshot().rows[0].status,'running');
    time+=26000;assert.ok(monitor.snapshot().rows.every(r=>r.status==='unknown'));assert.equal(monitor.snapshot().antigravity.available,false);
  }finally{monitor.close();}
});

test('a slow Antigravity listener does not block subsequent Claude state updates',async()=>{
  let time=now,status='busy',release;
  const pending=new Promise(resolve=>release=resolve),m=new NativeProviderTaskMonitor('unused',()=>{},async()=>({rows:[claudeRegistryRow({...v,status},identity,time)],available:true,partial:false,checkedAt:time}),{read:()=>pending},()=>time);
  const first=m.tick();await new Promise(r=>setImmediate(r));
  try{assert.equal(m.snapshot().rows[0].status,'running');time+=5000;status='waiting';await m.tick();assert.equal(m.snapshot().rows[0].status,'waiting');}
  finally{release({rows:[],available:true,partial:false,checkedAt:time});await first;m.close();}
});
