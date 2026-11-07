const {test}=require('node:test'),assert=require('node:assert/strict');
const {Providers}=require('../dist/providers');
const {Connections}=require('../dist/connections'),{Poller}=require('../dist/poller');
test('web provider reads and signs in without OAuth credentials or CLI calls',async()=>{
 const calls=[],reading={provider:'claude',plan:'team',source:'web',windows:[{id:'seven_day',label:'weekly',usedPercent:20,resetsAt:null}]};
 const web={read:async()=>{calls.push('read');return reading;},prepare:async()=>calls.push('prepare'),login:async()=>calls.push('login'),logout:async()=>calls.push('logout'),cancel:()=>calls.push('cancel'),reopen:()=>calls.push('reopen'),close:()=>calls.push('close')};
 const service=new Providers({close(){}},()=> 'code_assist',undefined,web),poller=new Poller(id=>service.read(id),()=>{}),connections=new Connections(service,poller,async()=>{throw Error('External browser or CLI flow must not be used')},()=>{},()=>{});
 await connections.prepareClaude();assert.equal(connections.states.claude.phase,'web_login');assert.deepEqual(calls,['prepare']);await connections.reopen('claude');await connections.continueClaude();assert.equal(connections.states.claude.phase,'ready');assert.deepEqual(poller.states.claude.reading,reading);assert.deepEqual(calls,['prepare','reopen','login','read']);await service.logout('claude');service.close();assert.ok(calls.includes('logout'));
});
test('cancelling web preparation closes the owned sign-in window',async()=>{let cancelled=0;const service={usesClaudeWeb:true,prepareClaudeWeb:async()=>true,cancelLogin:()=>cancelled++,login:async()=>{},submitCode(){}};const connections=new Connections(service,new Poller(async()=>{},()=>{}),async()=>{throw Error('Must not open external browser')},()=>{},()=>{});await connections.prepareClaude();assert.equal(connections.cancelPreparation(),true);assert.equal(cancelled,1);assert.equal(connections.states.claude,undefined);});
test('Chrome login completion automatically syncs once, while cancellation prevents a late sync',async()=>{
 for(const cancel of [false,true]){let finish,logins=0;const wait=new Promise(resolve=>finish=resolve),service={usesClaudeWeb:true,prepareClaudeWeb:async()=>true,waitClaudeWeb:()=>wait,cancelLogin(){},login:async()=>{logins++;},submitCode(){}};
 const poller=new Poller(async()=>({provider:'claude',plan:null,source:'fixture',windows:[]}),()=>{}),connections=new Connections(service,poller,async()=>{},()=>{},()=>{});
 await connections.prepareClaude();if(cancel)connections.cancelPreparation();finish();for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(logins,cancel?0:1);if(!cancel)assert.equal(connections.states.claude.phase,'ready');
 }
});
