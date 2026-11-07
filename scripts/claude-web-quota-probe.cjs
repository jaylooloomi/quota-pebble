// Explicit, interactive quota-only experiment. Does not alter production providers.
const {app,BrowserWindow,Menu,dialog,safeStorage}=require('electron');
const path=require('node:path'),fs=require('node:fs/promises');
const {ClaudeWebQuota}=require('../dist/claude-web-quota');
app.setName('Quota Pebble Web Quota Validation');
app.setPath('userData',path.join(app.getPath('appData'),'quota-pebble-web-validation'));
let win,busy=false;
app.whenReady().then(async()=>{
  win=new BrowserWindow({width:1000,height:760,title:'Quota Pebble · Claude 網頁配額驗證',webPreferences:{partition:'persist:claude-web-validation',sandbox:true,nodeIntegration:false,contextIsolation:true}});
  const loginHosts=new Set(['claude.ai','accounts.google.com','appleid.apple.com','auth.anthropic.com','platform.claude.com']);
  const allowLogin=url=>{try{const parsed=new URL(url);return parsed.protocol==='https:'&&loginHosts.has(parsed.hostname);}catch{return false;}};
  const protect=contents=>{
    contents.setWindowOpenHandler(({url})=>allowLogin(url)?{action:'allow',overrideBrowserWindowOptions:{webPreferences:{partition:'persist:claude-web-validation',sandbox:true,nodeIntegration:false,contextIsolation:true}}}:{action:'deny'});
    contents.on('will-navigate',(event,url)=>{if(!allowLogin(url))event.preventDefault();});
    contents.on('did-create-window',child=>protect(child.webContents));
  };
  protect(win.webContents);
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  const source=new ClaudeWebQuota(win.webContents.session.fetch.bind(win.webContents.session));
  const verify=async()=>{
    if(busy)return;busy=true;
    try{
      const orgs=await source.organizations();if(!orgs.length)throw Error('尚未取得組織，請先完成登入。');
      const choices=orgs.slice(0,8);
      const active=await win.webContents.session.cookies.get({url:'https://claude.ai',name:'lastActiveOrg'});
      let index=choices.findIndex(org=>org.id===active[0]?.value);
      if(index<0&&choices.length===1)index=0;
      if(index<0){const selected=await dialog.showMessageBox(win,{type:'question',message:'選擇這次要驗證的 Claude 組織',detail:'只查詢配額，不發送聊天，不修改授權。',buttons:[...choices.map(o=>o.name),'取消'],cancelId:choices.length,noLink:true});index=selected.response;}
      if(index>=choices.length)return;
      const reading=await source.read(choices[index].id);
      const report={checkedAt:new Date().toISOString(),source:reading.source,windows:reading.windows};
      await fs.mkdir(path.join(__dirname,'../test-results'),{recursive:true});
      await fs.writeFile(path.join(__dirname,'../test-results/claude-web-quota-live.json'),JSON.stringify(report,null,2));
      console.log(JSON.stringify(report));
      await dialog.showMessageBox(win,{type:'info',message:'已取得真實網頁配額',detail:reading.windows.map(w=>`${w.label}：已用 ${w.usedPercent}%；重置 ${w.resetsAt??'未提供'}`).join('\n')});
    }catch(error){console.log(JSON.stringify({passed:false,code:error.code??'validation',message:error.code?error.message:'登入或組織驗證尚未完成'}));await dialog.showMessageBox(win,{type:'warning',message:'尚未取得配額',detail:error.code?error.message:'請先完成網頁登入，再按選單「驗證配額」。'});}
    finally{busy=false;}
  };
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'配額驗證',submenu:[{label:'驗證配額',click:()=>void verify()},{label:'前往官方配額頁',click:()=>void win.loadURL('https://claude.ai/settings/usage')},{role:'quit'}]}]));
  if(process.argv.includes('--export-session-only')){
    if(!safeStorage.isEncryptionAvailable())throw Error('Encrypted session transfer unavailable');
    const cookies=(await win.webContents.session.cookies.get({})).filter(c=>['claude.ai','.claude.ai'].includes(c.domain));
    const orgs=await source.organizations();
    const selected=cookies.find(c=>c.name==='lastActiveOrg')?.value;
    const org=orgs.find(o=>o.id===selected)?.id??(orgs.length===1?orgs[0].id:null);
    if(!org)throw Error('Choose an organization in the validation window before transfer');
    const plain=JSON.stringify({cookies,org});
    const encrypted=process.platform==='win32'?Buffer.concat([Buffer.from('DPAPI1'),await require('../dist/web-session-transfer').sessionTransfer('protect',Buffer.from(plain))]):safeStorage.encryptString(plain);
    await fs.writeFile(path.join(app.getPath('userData'),'verified-session.bin'),encrypted,{mode:0o600});
    console.log(JSON.stringify({encryptedTransfer:true,cookieCount:cookies.length}));app.quit();return;
  }
  await win.loadURL('https://claude.ai/new');
  if(process.argv.includes('--verify-existing'))await verify();
});
app.on('window-all-closed',()=>app.quit());
