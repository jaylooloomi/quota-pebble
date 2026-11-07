// Explicit live handoff/restart check, using only the user's prior Pebble test login.
const {app,session}=require('electron'),path=require('node:path'),fs=require('node:fs/promises'),{randomUUID}=require('node:crypto'),assert=require('node:assert/strict');
const {ClaudeChromeLogin}=require('../dist/claude-chrome-login'),{ClaudeWebQuota}=require('../dist/claude-web-quota'),{ClaudeWebSession}=require('../dist/claude-web-session');
app.setPath('userData',path.join(app.getPath('appData'),'quota-pebble-chrome-validation'));app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{let client,chrome;try{
 const root=path.join(app.getPath('userData'),'handoff-check'),partitions=await fs.readdir(path.join(app.getPath('userData'),'Partitions'),{withFileTypes:true});let cookies=[];
 for(const dir of partitions.filter(d=>d.isDirectory()&&/^pebble-claude-web-[a-f0-9-]{36}$/.test(d.name)).reverse()){const rows=await session.fromPartition('persist:'+dir.name).cookies.get({url:'https://claude.ai'});if(rows.some(c=>c.name==='sessionKey')){cookies=rows;break;}}
 if(!cookies.length)throw Error('No prior authorized session');const id=randomUUID();chrome=new ClaudeChromeLogin(path.join(root,id,'chrome-login'),true);await chrome.start();await chrome.restore(cookies);
 client=new ClaudeWebSession(root);const partition='persist:pebble-claude-web-'+randomUUID(),sess=session.fromPartition(partition);client.pending={partition,session:sess,source:new ClaudeWebQuota(chrome.fetch.bind(chrome)),chrome,chromeDirectory:id};
 await client.login();const first=await client.read();await chrome.close(false);client.active=undefined;
 const restarted=new ClaudeWebSession(root);const second=await restarted.read();assert.deepEqual(second.windows.map(w=>[w.id,w.usedPercent]),first.windows.map(w=>[w.id,w.usedPercent]));assert.equal(second.identityKey,first.identityKey);
 await restarted.active.chrome.close(false);restarted.close();console.log(JSON.stringify({passed:true,checks:['Chrome session persisted','same verified account after restart','no interactive login required on restart'],windows:second.windows}));
 }catch(error){console.log(JSON.stringify({passed:false,code:error.code??'validation',message:error.code?error.message:'Chrome handoff check failed'}));process.exitCode=1;}finally{await chrome?.close(false);client?.close();app.quit();}});
