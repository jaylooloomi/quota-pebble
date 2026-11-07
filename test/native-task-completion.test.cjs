const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {NativeCompletionTracker,claudeEndTurn}=require('../dist/native-task-completion');
const {antigravityTaskRows,NativeProviderTaskMonitor,claudeRegistryRow}=require('../dist/native-provider-tasks');
const base=Date.now();
function fixture(provider='claude'){let time=base;const t=new NativeCompletionTracker(()=>time),row=(status,extra={})=>({provider,id:provider+':task',title:'Test',host:'PC',status,source:provider==='claude'?'claude-registry':'antigravity-rpc',observedAt:time,activityKey:'cycle',completionEvidence:status==='idle'?{id:'proof',time:base+1000}:undefined,...extra});return{t,row,set:n=>time=base+n};}
test('native success requires observed running, matching activity, fresh terminal evidence and distinct stable idle reads',()=>{
 for(const provider of ['claude','antigravity']){const f=fixture(provider);assert.deepEqual(f.t.observe([f.row('idle')]),[]);f.t.observe([f.row('running')]);f.set(1000);const idle=f.row('idle');assert.deepEqual(f.t.observe([idle]),[]);f.set(6000);assert.deepEqual(f.t.observe([idle]),[]);const n=f.t.observe([f.row('idle')]);assert.equal(n.length,1);assert.equal(n[0].provider,provider);f.set(12000);assert.deepEqual(f.t.observe([f.row('idle')]),[]);}
});
test('missing success proof, old evidence, changed input, failure, stale data and reconnect do not notify',()=>{
 for(const extra of [{completionEvidence:undefined},{completionEvidence:{id:'old',time:base-10000}},{activityKey:'other'},{status:'unknown'},{observedAt:base-30000}]){const f=fixture();f.t.observe([f.row('running')]);f.set(1000);f.t.observe([f.row('idle',extra)]);f.set(10000);assert.deepEqual(f.t.observe([f.row('idle',extra)]),[]);}
 const f=fixture();f.t.observe([f.row('running')]);f.t.reset();f.set(1000);f.t.observe([f.row('idle')]);f.set(10000);assert.deepEqual(f.t.observe([f.row('idle')]),[]);
});
test('missing proof expires after two minutes, and a later running cycle rejects the earlier cycle proof',()=>{
 const f=fixture();f.t.observe([f.row('running')]);
 for(let n=1000;n<=131000;n+=10000){f.set(n);f.t.observe([f.row('idle',{completionEvidence:undefined})]);}
 assert.equal(f.t.isTracking('claude:task'),false);
 f.set(140000);f.t.observe([f.row('running')]);f.set(141000);f.t.observe([f.row('idle')]);f.set(151000);assert.deepEqual(f.t.observe([f.row('idle')]),[]);
});
test('Antigravity accepts only current-input normal termination with valid counts and timestamps',()=>{
 const v={trajectoryId:'a',status:'CASCADE_RUN_STATUS_IDLE',lastUserInputTime:new Date(base).toISOString(),lastModifiedTime:new Date(base+1000).toISOString(),lastUserInputStepIndex:0,stepCount:7,latestExecutorTerminationReason:'EXECUTOR_TERMINATION_REASON_NO_TOOL_CALL'};
 const row=x=>antigravityTaskRows({trajectorySummaries:[{...v,...x}]},base+2000)[0];assert.ok(row({}).completionEvidence);
 for(const x of [{latestExecutorTerminationReason:'EXECUTOR_TERMINATION_REASON_ERROR'},{latestExecutorTerminationReason:'EXECUTOR_TERMINATION_REASON_CANCELED'},{latestExecutorTerminationReason:undefined},{stepCount:0},{lastModifiedTime:'invalid'},{lastUserInputTime:undefined},{status:'CASCADE_RUN_STATUS_RUNNING'}])assert.equal(row(x).completionEvidence,undefined);
 assert.ok(!JSON.stringify(row({prompt:'SECRET',response:'SECRET'})).includes('SECRET'));
});
test('Claude bounded tail reads exact session, rejects later input/tools/errors and never returns message content',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pebble-native-proof-')),dir=path.join(root,'projects','D--project'),file=path.join(dir,'session.jsonl'),row={id:'claude:session:42',project:'D:/project',status:'idle'};
 const line=(type,extra={})=>JSON.stringify({type,sessionId:'session',uuid:'message',timestamp:new Date(base).toISOString(),message:{stop_reason:'end_turn',content:[{text:'SECRET'}]},...extra})+'\n';
 try{await fs.mkdir(dir,{recursive:true});await fs.writeFile(file,line('assistant'));const proof=await claudeEndTurn(root,row);assert.deepEqual(proof,{id:'message',time:base});assert.ok(!JSON.stringify(proof).includes('SECRET'));
 for(const tail of [line('user'),line('assistant',{message:{stop_reason:'tool_use'}}),line('assistant',{isApiErrorMessage:true}),line('assistant',{message:{stop_reason:'refusal'}})]){await fs.writeFile(file,line('assistant')+tail);assert.equal(await claudeEndTurn(root,row),undefined);}
 await fs.writeFile(file,line('assistant',{sessionId:'other'})+line('assistant',{isSidechain:true}));assert.equal(await claudeEndTurn(root,row),undefined);
 await fs.writeFile(file,'x'.repeat(150000)+'\n'+line('assistant'));assert.ok(await claudeEndTurn(root,row));assert.equal(await claudeEndTurn(root,{...row,id:'claude:../bad:42'}),undefined);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('native monitor routes verified Claude and Antigravity completion through callbacks without notifying initial history',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pebble-native-monitor-')),dir=path.join(root,'projects','D--project'),file=path.join(dir,'session.jsonl');await fs.mkdir(dir,{recursive:true});let time=base,status='busy',ag='CASCADE_RUN_STATUS_RUNNING';const output=[];
 const v={pid:42,procStart:'generation',sessionId:'session',cwd:'D:/project'},identity={pid:42,procStart:'generation',claude:true};
 const m=new NativeProviderTaskMonitor(path.join(root,'sessions'),()=>{},async()=>({rows:[claudeRegistryRow({...v,status,statusUpdatedAt:time},identity,time)],available:true,partial:false,checkedAt:time}),{read:async()=>({rows:antigravityTaskRows({trajectorySummaries:[{trajectoryId:'a',status:ag,lastUserInputTime:new Date(base).toISOString(),lastUserInputStepIndex:0,stepCount:7,lastModifiedTime:new Date(base+1000).toISOString(),latestExecutorTerminationReason:'EXECUTOR_TERMINATION_REASON_NO_TOOL_CALL'}]},time),available:true,partial:false,checkedAt:time})},()=>time,item=>output.push(item));
 try{await m.tick();time+=10000;status='idle';ag='CASCADE_RUN_STATUS_IDLE';await fs.writeFile(file,JSON.stringify({type:'assistant',sessionId:'session',uuid:'done',timestamp:new Date(base+1000).toISOString(),message:{stop_reason:'end_turn'}})+'\n');await m.tick();assert.equal(output.length,0);time+=10000;await m.tick();assert.deepEqual(output.map(v=>v.provider).sort(),['antigravity','claude']);time+=10000;await m.tick();assert.equal(output.length,2);}finally{m.close();await fs.rm(root,{recursive:true,force:true});}
});
