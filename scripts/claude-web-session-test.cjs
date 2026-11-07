const {app,BrowserWindow,dialog,safeStorage}=require('electron');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises'),os=require('node:os');
const {ClaudeWebSession,allowedClaudeLoginUrl}=require('../dist/claude-web-session');
const org='12345678-1234-1234-1234-123456789abc';
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'pebble-web-session-'));let one,two;
 const load=BrowserWindow.prototype.loadURL,show=dialog.showMessageBox;BrowserWindow.prototype.loadURL=function(){this.hide();return load.call(this,'about:blank');};dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});
 const fixture=async(client,account,used)=>{await client.prepare();const context=client.pending;await context.session.cookies.set({url:'https://claude.ai',name:'sessionKey',value:account,secure:true});await context.session.cookies.set({url:'https://claude.ai',name:'lastActiveOrg',value:org,secure:true});context.session.fetch=async url=>new Response(JSON.stringify(new URL(url).pathname==='/api/account'?{uuid:account}:new URL(url).pathname==='/api/organizations'?[{uuid:org,name:'Fixture organization'}]:{five_hour:{utilization:used}}),{headers:{'content-type':'application/json'}});context.source=new (require('../dist/claude-web-quota').ClaudeWebQuota)(context.session.fetch.bind(context.session));await client.login();return context;};
 try{
  one=new ClaudeWebSession(path.join(root,'one'),undefined,false);two=new ClaudeWebSession(path.join(root,'two'),undefined,false);
  const first=await fixture(one,'fixture-account-one',20),second=await fixture(two,'fixture-account-two',60);
  assert.notEqual(first.partition,second.partition);assert.equal((await one.read()).windows[0].usedPercent,20);assert.equal((await two.read()).windows[0].usedPercent,60);assert.notEqual((await one.read()).identityKey,(await two.read()).identityKey);
  const restarted=new ClaudeWebSession(path.join(root,'one'),undefined,false);assert.equal((await restarted.read()).windows[0].usedPercent,20,'binding survives restart using the same owned partition');restarted.close();
  await one.logout();await assert.rejects(one.read(),e=>e.code==='auth');assert.equal((await first.session.cookies.get({name:'sessionKey'})).length,0);assert.equal((await second.session.cookies.get({name:'sessionKey'})).length,1,'logging out one account must preserve another');
  await two.prepare();const pending=two.pending;const closed=new Promise(resolve=>pending.window.once('closed',resolve));two.cancel();await closed;assert.ok(pending.window.isDestroyed());assert.equal((await two.read()).windows[0].usedPercent,60,'cancel keeps the previously connected account');
  assert.equal(allowedClaudeLoginUrl('https://accounts.google.com/o/oauth2/auth'),true);for(const url of ['http://claude.ai','https://claude.ai.evil.test','file:///C:/Windows','https://user:pass@claude.ai'])assert.equal(allowedClaudeLoginUrl(url),false);
  const transferFile=path.join(root,'transfer.bin'),imported=new ClaudeWebSession(path.join(root,'imported'),undefined,false);
  await fs.writeFile(transferFile,safeStorage.encryptString(JSON.stringify({org,cookies:[{name:'sessionKey',value:'fixture-transfer',domain:'.claude.ai',path:'/',secure:true,httpOnly:true},{name:'unsafe',value:'fixture',domain:'.evil.test'}]})));
  await imported.importValidation(transferFile);assert.equal(imported.binding.org,org,'verified organization transfers even when lastActiveOrg cookie is absent');assert.equal((await imported.active.session.cookies.get({name:'sessionKey'})).length,1);assert.equal((await imported.active.session.cookies.get({name:'unsafe'})).length,0);await imported.logout();
  console.log('PASS web session: account isolation, verified organization, restart, logout isolation, cancellation and login URL restrictions; fixture only');
 }finally{one?.close();two?.close();for(const window of BrowserWindow.getAllWindows())window.destroy();BrowserWindow.prototype.loadURL=load;dialog.showMessageBox=show;await fs.rm(root,{recursive:true,force:true}).catch(()=>{});app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});
