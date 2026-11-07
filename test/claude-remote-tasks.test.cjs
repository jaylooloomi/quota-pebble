const test=require('node:test'),assert=require('node:assert/strict');const {claudeRemoteRow,ClaudeRemoteTaskMonitor,mergeClaudeTasks}=require('../dist/claude-remote-tasks');
const profile={directory:'fixture',config:'fixture-config',label:'Claude Work'},auth=async()=>({token:'secret-token',org:'secret-org',scope:'scope'}),base={id:'cse_test',title:'Work',status:'active',environment_kind:'bridge',worker_status:'running',connection_status:'connected',last_event_at:new Date().toISOString()};
test('remote Claude state requires connected active bridge and never uses status_bucket',()=>{
 for(const [worker,status] of [['running','running'],['requires_action','waiting'],['idle','idle'],['future','unknown']])assert.equal(claudeRemoteRow({...base,worker_status:worker,status_bucket:'working'},'a','Profile').status,status);
 assert.equal(claudeRemoteRow({...base,connection_status:'disconnected'},'a','P').status,'unknown');assert.equal(claudeRemoteRow({...base,status:'archived'},'a','P'),null);assert.equal(claudeRemoteRow({...base,environment_kind:'cloud'},'a','P'),null);
 const row=claudeRemoteRow({...base,prompt:'PRIVATE',external_metadata:{secret:'PRIVATE'}},'a','P');assert.ok(!JSON.stringify(row).includes('PRIVATE'));assert.equal(row.remoteSessionId,base.id);assert.notEqual(row.id,claudeRemoteRow(base,'other','P').id);
});
test('remote Claude is GET only, follows bounded pagination and suppresses cached rechecks',async()=>{
 let now=Date.now(),calls=[];const fetcher=async(url,opt)=>{calls.push({url,opt});return new Response(JSON.stringify(calls.length===1?{data:[base],next_cursor:'next'}:{data:[{...base,id:'cse_next',worker_status:'idle'}],next_cursor:null}));};const m=new ClaudeRemoteTaskMonitor(()=>[profile],()=>{},fetcher,auth,()=>now);
 try{await m.tick();assert.equal(m.snapshot().rows.length,2);assert.equal(m.snapshot().rows[0].status,'running');assert.equal(calls.length,2);assert.ok(calls.every(c=>c.opt.method==='GET'&&!c.opt.body&&c.url.startsWith('https://api.anthropic.com/v1/code/sessions?')));assert.equal(calls[1].url.endsWith('&cursor=next'),true);await m.tick(true);assert.equal(calls.length,2);now+=160000;assert.equal(m.snapshot().rows[0].status,'unknown');assert.equal(m.snapshot().available,false);}finally{m.close();}
});
test('429 cooldown survives manual recheck; failure invalidates prior running',async()=>{
 let now=Date.now(),calls=0,fail=false;const m=new ClaudeRemoteTaskMonitor(()=>[profile],()=>{},async()=>{calls++;return fail?new Response('',{status:429,headers:{'retry-after':'300'}}):new Response(JSON.stringify({data:[base]}));},auth,()=>now);
 try{await m.tick();fail=true;now+=60001;await m.tick();assert.equal(m.snapshot().rows[0].status,'unknown');assert.equal(m.snapshot().profiles[0].error,'HTTP_429');assert.ok(m.snapshot().profiles[0].nextPollAt>=now+300000);await m.tick(true);assert.equal(calls,2);}finally{m.close();}
});
test('disabled profiles lose cached task metadata; malformed responses never imply zero running',async()=>{
 let profiles=[profile],now=Date.now(),fail=false;const m=new ClaudeRemoteTaskMonitor(()=>profiles,()=>{},async()=>new Response(JSON.stringify(fail?{unexpected:[]}:{data:[base]})),auth,()=>now);
 try{await m.tick();fail=true;now+=60001;await m.tick();assert.equal(m.snapshot().available,false);assert.equal(m.snapshot().rows[0].status,'unknown');assert.equal(m.snapshot().profiles[0].error,'UNSUPPORTED_SCHEMA');profiles=[];await m.tick();assert.equal(m.snapshot().rows.length,0);}finally{m.close();}
});
test('local bridge IDs deduplicate both known and unknown remote copies without title guesses',()=>{
 const remote=claudeRemoteRow(base,'a','P'),local={...remote,id:'claude:local',source:'claude-registry'};assert.equal(mergeClaudeTasks([local],[remote]).length,1);assert.equal(mergeClaudeTasks([{...local,status:'unknown'}],[remote])[0].id,remote.id);assert.equal(mergeClaudeTasks([{...local,status:'unknown'}],[{...remote,status:'unknown'}]).length,1);assert.equal(mergeClaudeTasks([{...local,remoteSessionId:undefined}],[remote]).length,2);
});

test('combined task counts include authorized Claude remote states and deduplicate local bridge records',()=>{
 const {CombinedTaskMonitor}=require('../dist/combined-task-monitor'),m=new CombinedTaskMonitor('fixture-sessions',()=>{},false),remote=claudeRemoteRow(base,'a','P'),local={...remote,id:'claude:local',source:'claude-registry',status:'idle'};
 m.local={snapshot:()=>({rows:[],counts:{},liveCoverage:false,connection:'unconnected',partial:false}),close(){}};
 m.native={snapshot:()=>({rows:[local],claude:{available:true,count:1},antigravity:{available:false,count:0}}),close(){}};
 m.claudeRemote={snapshot:()=>({rows:[remote,{...remote,id:'claude-remote:scope:cse_other',remoteSessionId:'cse_other'}],available:true,profiles:[],partial:false}),close(){}};
 const s=m.snapshot();assert.equal(s.counts.running,1);assert.equal(s.counts.idle,1);assert.equal(s.claudeRemote.count,1);assert.equal(s.rows.length,2);m.close();
});
