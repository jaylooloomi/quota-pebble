const test=require('node:test'),assert=require('node:assert/strict');const {AntigravityRemoteTaskMonitor,antigravityRemoteRow,mergeAntigravityTasks}=require('../dist/antigravity-remote-tasks');
const host={id:'host-1',name:'Work PC',online:true,state:'ready',error:'',rows:[{id:'task-1',title:'跨工具Agent調用',status:'running',project:'D:/project'}]},result=()=>({accountKey:'account-hash',hosts:[structuredClone(host)],partial:false,error:''});
test('Antigravity remote rows retain metadata only, namespace account/host and reject unsupported waiting',()=>{
 const r=antigravityRemoteRow({...host.rows[0],token:'SECRET',messages:['SECRET']},host,'a');assert.equal(r.status,'running');assert.equal(r.title,'跨工具Agent調用');assert.ok(!JSON.stringify(r).includes('SECRET'));assert.notEqual(r.id,antigravityRemoteRow(host.rows[0],host,'b').id);assert.equal(antigravityRemoteRow({...host.rows[0],status:'waiting'},host,'a').status,'unknown');assert.equal(antigravityRemoteRow({...host.rows[0],id:'../escape'},host,'a'),null);
});
test('monitor accepts official metadata, limits healthy rechecks and expires observations',async()=>{
 let now=Date.now(),calls=0;const m=new AntigravityRemoteTaskMonitor(()=>{},async()=>{calls++;return result();},()=>now);try{await m.tick();assert.equal(m.snapshot().available,true);assert.equal(m.snapshot().rows[0].status,'running');await m.tick(true);assert.equal(calls,1);now+=150001;assert.equal(m.snapshot().rows[0].status,'unknown');assert.equal(m.snapshot().available,false);}finally{m.close();}
});
test('offline hosts and failed authorization invalidate earlier running states',async()=>{
 let now=Date.now(),mode='ok';const m=new AntigravityRemoteTaskMonitor(()=>{},async()=>{if(mode==='auth')return{error:'AUTH_EXPIRED'};const d=result();if(mode==='offline'){d.hosts[0].online=false;d.hosts[0].state='offline';d.hosts[0].error='HOST_OFFLINE';d.hosts[0].rows=[];}return d;},()=>now);
 try{await m.tick();mode='offline';now+=60001;await m.tick();assert.equal(m.snapshot().rows[0].status,'unknown');assert.equal(m.snapshot().available,false);mode='auth';now+=60001;await m.tick();assert.equal(m.snapshot().error,'AUTH_EXPIRED');assert.equal(m.snapshot().available,false);assert.equal(m.snapshot().rows[0].status,'unknown');}finally{m.close();}
});
test('global and partial-host 429 cooldown cannot be bypassed by manual retry',async()=>{
 for(const partial of [false,true]){let now=Date.now(),calls=0;const m=new AntigravityRemoteTaskMonitor(()=>{},async()=>{calls++;return partial?{...result(),retryAfterMs:300000}:{error:'REMOTE_HTTP_429',retryAfterMs:300000};},()=>now);try{await m.tick();assert.equal(m.snapshot().nextPollAt,now+300000);await m.tick(true);assert.equal(calls,1);}finally{m.close();}}
});
test('account changes discard old rows and malformed schema never becomes an empty healthy source',async()=>{
 let now=Date.now(),mode='ok';const m=new AntigravityRemoteTaskMonitor(()=>{},async()=>{const d=result();if(mode==='new'){d.accountKey='new-account';d.hosts[0].rows=[];}if(mode==='bad')d.hosts[0].rows='invalid';return d;},()=>now);try{await m.tick();mode='new';now+=60001;await m.tick();assert.equal(m.snapshot().rows.length,0);mode='bad';now+=60001;await m.tick();assert.equal(m.snapshot().available,false);assert.equal(m.snapshot().error,'UNSUPPORTED_SCHEMA');}finally{m.close();}
});
test('local Antigravity copies deduplicate by native ID, never by title',()=>{
 const r=antigravityRemoteRow(host.rows[0],host,'a'),local={...r,id:'antigravity:task-1',source:'antigravity-rpc',nativeTaskId:undefined};assert.equal(mergeAntigravityTasks([local],[r]).length,1);assert.equal(mergeAntigravityTasks([{...local,status:'unknown'}],[r])[0].source,'antigravity-remote');assert.equal(mergeAntigravityTasks([{...local,id:'antigravity:other'}],[r]).length,2);
});
test('combined monitor includes remote Antigravity in task counters and source health',()=>{
 const {CombinedTaskMonitor}=require('../dist/combined-task-monitor'),m=new CombinedTaskMonitor('fixture',()=>{},false);m.local={snapshot:()=>({rows:[],counts:{},liveCoverage:false}),close(){}};m.native={snapshot:()=>({rows:[],claude:{available:false},antigravity:{available:false}}),close(){}};m.agRemote={snapshot:()=>({rows:[antigravityRemoteRow(host.rows[0],host,'a')],available:true,hosts:[],partial:false}),close(){}};const s=m.snapshot();assert.equal(s.counts.running,1);assert.equal(s.antigravityRemote.count,1);assert.equal(s.liveCoverage,true);m.close();
});
