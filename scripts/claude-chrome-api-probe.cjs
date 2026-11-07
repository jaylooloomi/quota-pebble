const {app,session,dialog}=require('electron'),path=require('node:path'),fs=require('node:fs/promises');
const {ClaudeChromeLogin}=require('../dist/claude-chrome-login'),{ClaudeWebQuota}=require('../dist/claude-web-quota');
app.setPath('userData',path.join(app.getPath('appData'),'quota-pebble-chrome-validation'));app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{let chrome;try{
 const partitions=await fs.readdir(path.join(app.getPath('userData'),'Partitions'),{withFileTypes:true});let cookies=[];
 for(const dir of partitions.filter(d=>d.isDirectory()&&/^pebble-claude-web-[a-f0-9-]{36}$/.test(d.name)).reverse()){const rows=await session.fromPartition('persist:'+dir.name).cookies.get({url:'https://claude.ai'});if(rows.some(c=>c.name==='sessionKey')){cookies=rows;break;}}
 if(!cookies.length)throw Error('No previously authorized test session is available');
 chrome=new ClaudeChromeLogin(path.join(app.getPath('userData'),'api-probe','chrome-login'),true);await chrome.start();await chrome.restore(cookies);
 const source=new ClaudeWebQuota(chrome.fetch.bind(chrome)),orgs=await source.organizations();if(!orgs.length)throw Error('No organization available');let index=orgs.findIndex(org=>org.id===cookies.find(c=>c.name==='lastActiveOrg')?.value);if(index<0&&orgs.length===1)index=0;if(index<0){const answer=await dialog.showMessageBox({message:'選擇要監控的 Claude 組織',buttons:[...orgs.map(org=>org.name),'取消'],cancelId:orgs.length,noLink:true});index=answer.response;}if(index>=orgs.length)throw Error('Cancelled');const reading=await source.read(orgs[index].id);
 const report={passed:true,source:'Chrome authenticated quota request',windows:reading.windows};await fs.writeFile('test-results/claude-chrome-api-live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(error){console.log(JSON.stringify({passed:false,code:error.code??'validation',message:error.code?error.message:'Previously authorized session was not usable'}));}finally{await chrome?.close(false);app.quit();}});
