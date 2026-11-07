import {BrowserWindow,dialog,session,safeStorage,Session} from 'electron';
import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {ClaudeWebQuota} from './claude-web-quota';
import {ProviderError,Reading} from './model';
import {sessionTransfer} from './web-session-transfer';
import {ClaudeChromeLogin} from './claude-chrome-login';

type Binding={version:1;partition:string;org:string;userAgent?:string;chromeDirectory?:string};
const uuid=/^[a-f0-9-]{36}$/;
const loginHosts=new Set(['claude.ai','accounts.google.com','appleid.apple.com','auth.anthropic.com','platform.claude.com']);
export const allowedClaudeLoginUrl=(url:string)=>{try{const u=new URL(url);return u.protocol==='https:'&&loginHosts.has(u.hostname)&&!u.username&&!u.password;}catch{return false;}};
export class ClaudeWebSession {
  private binding?:Binding;
  private active?:{partition:string;session:Session;source:ClaudeWebQuota;chrome?:ClaudeChromeLogin};
  private pending?:{partition:string;session:Session;source:ClaudeWebQuota;window?:BrowserWindow;chrome?:ClaudeChromeLogin;userAgent?:string;chromeDirectory?:string};
  private file:string;
  constructor(private root:string,private text:(value:string)=>string=value=>value,private useChrome=true){
    mkdirSync(root,{recursive:true,mode:0o700});this.file=path.join(root,'web-quota.json');
    try{const b=JSON.parse(readFileSync(this.file,'utf8'));if(b.version===1&&/^persist:pebble-claude-web-[a-f0-9-]{36}$/.test(b.partition)&&uuid.test(b.org)&&(!b.chromeDirectory||uuid.test(b.chromeDirectory)))this.binding=b;}catch{}
  }
  private context(partition:string){
    const sess=session.fromPartition(partition,{cache:false});
    sess.setPermissionRequestHandler((_web,_permission,callback)=>callback(false));
    const source=new ClaudeWebQuota(sess.fetch.bind(sess) as typeof fetch);
    sess.cookies.on('changed',(_event,cookie)=>{if(['sessionKey','lastActiveOrg'].includes(cookie.name))source.invalidate();});
    return{partition,session:sess,source};
  }
  private save(binding:Binding){writeFileSync(this.file+'.tmp',JSON.stringify(binding),{mode:0o600});renameSync(this.file+'.tmp',this.file);this.binding=binding;}
  // Imports only an encrypted transfer from Pebble's own explicit validation window.
  // It never reads another application's cookie database.
  async importValidation(file:string){
    if(this.binding)return 'already-bound';if(!existsSync(file))return 'missing-transfer';
    const bytes=readFileSync(file);if(bytes.length>256*1024)return 'invalid-transfer';
    let transfer:any;try{transfer=JSON.parse(bytes.subarray(0,6).toString()==='DPAPI1'?(await sessionTransfer('unprotect',bytes.subarray(6))).toString('utf8'):safeStorage.decryptString(bytes));}catch{return 'decrypt-failed';}
    const cookies=Array.isArray(transfer)?transfer:transfer?.cookies;
    if(!Array.isArray(cookies)||cookies.length>100)return 'invalid-transfer';
    const org=typeof transfer?.org==='string'?transfer.org:cookies.find(c=>c.name==='lastActiveOrg')?.value;
    if(typeof org!=='string'||!uuid.test(org)||!cookies.some(c=>c.name==='sessionKey'&&typeof c.value==='string'&&c.value))return 'invalid-transfer';
    const context=this.context('persist:pebble-claude-web-'+randomUUID());
    for(const c of cookies){if(typeof c.name!=='string'||typeof c.value!=='string'||!['claude.ai','.claude.ai'].includes(c.domain))continue;
      await context.session.cookies.set({url:'https://claude.ai',name:c.name,value:c.value,domain:c.domain,path:typeof c.path==='string'?c.path:'/',secure:true,httpOnly:!!c.httpOnly,...(typeof c.expirationDate==='number'?{expirationDate:c.expirationDate}:{}),...(typeof c.sameSite==='string'?{sameSite:c.sameSite}:{})});
    }
    await context.session.cookies.flushStore();
    this.active=context;this.save({version:1,partition:context.partition,org});return 'imported';
  }
  async read():Promise<Reading>{
    if(!this.binding)throw new ProviderError('auth','請在獨立的 Claude 登入視窗登入');
    if(!this.active){const context=this.context(this.binding.partition);if(this.binding.chromeDirectory){const chrome=new ClaudeChromeLogin(path.join(this.root,this.binding.chromeDirectory,'chrome-login'),true);try{await chrome.start();}catch(error){await chrome.close(false);throw error;}this.active={...context,chrome,source:new ClaudeWebQuota(chrome.fetch.bind(chrome) as typeof fetch)};}else this.active=context;}
    if(this.binding.userAgent)this.active.session.setUserAgent(this.binding.userAgent);
    return this.active.source.read(this.binding.org);
  }
  async prepare(){
    if(this.pending){this.reopen();return;}
    const context=this.context('persist:pebble-claude-web-'+randomUUID());
    if(this.useChrome){
      const chromeDirectory=randomUUID(),chrome=new ClaudeChromeLogin(path.join(this.root,chromeDirectory,'chrome-login'));this.pending={...context,chrome,chromeDirectory};
      try{await chrome.start();}catch(error){this.pending=undefined;await chrome.close();throw error;}return;
    }
    const win=new BrowserWindow({width:1000,height:760,title:this.text('Claude 網頁登入'),autoHideMenuBar:true,webPreferences:{partition:context.partition,sandbox:true,nodeIntegration:false,contextIsolation:true}});
    const protect=(window:BrowserWindow)=>{
      window.webContents.setWindowOpenHandler(({url})=>allowedClaudeLoginUrl(url)?{action:'allow',overrideBrowserWindowOptions:{webPreferences:{partition:context.partition,sandbox:true,nodeIntegration:false,contextIsolation:true}}}:{action:'deny'});
      window.webContents.on('will-navigate',(event,url)=>{if(!allowedClaudeLoginUrl(url))event.preventDefault();});
      window.webContents.on('will-attach-webview',event=>event.preventDefault());
      window.webContents.on('did-create-window',child=>protect(child));
    };protect(win);this.pending={...context,window:win};
    await win.loadURL('https://claude.ai/new');
  }
  waitForChromeLogin(){return this.pending?.chrome?.waitForLogin();}
  async login(){
    const pending=this.pending;
    if(!pending)throw new ProviderError('auth','請先開啟 Claude 網頁登入視窗');
    let chromeOrg:string|undefined;
    if(pending.chrome){const captured=await pending.chrome.capture();
      if(!captured.cookies.some((c:any)=>c.name==='sessionKey'))throw new ProviderError('auth','請先在 Chrome 完成 Claude 登入');
      chromeOrg=captured.cookies.find((c:any)=>c.name==='lastActiveOrg')?.value;
      pending.source=new ClaudeWebQuota(pending.chrome.fetch.bind(pending.chrome) as typeof fetch);
    }
    const orgs=await pending.source.organizations();if(!orgs.length)throw new ProviderError('auth','此 Claude 帳號未提供可用組織');
    const choices=orgs.slice(0,20);
    const active=chromeOrg??(await pending.session.cookies.get({url:'https://claude.ai',name:'lastActiveOrg'}))[0]?.value;
    let index=choices.findIndex(org=>org.id===active);if(choices.length===1)index=0;
    // Honor the organization selected in Chrome; ask only when it is ambiguous.
    const options={type:'question' as const,message:this.text('選擇要監控的 Claude 組織'),buttons:[...choices.map(o=>o.name),this.text('取消')],defaultId:index>=0?index:0,cancelId:choices.length,noLink:true};
    const selected=choices.length===1||index>=0?{response:index>=0?index:0}:await (!pending.window||pending.window.isDestroyed()?dialog.showMessageBox(options):dialog.showMessageBox(pending.window,options));
    if(selected.response>=choices.length)throw new ProviderError('auth','已取消組織選擇');
    const org=choices[selected.response]!.id;
    await pending.source.read(org);await pending.session.cookies.flushStore();
    const previous=this.active;this.active=pending;this.save({version:1,partition:pending.partition,org,...(pending.chromeDirectory?{chromeDirectory:pending.chromeDirectory}:{})});this.pending=undefined;
    if(pending.window&&!pending.window.isDestroyed())pending.window.close();await previous?.chrome?.close(false);
  }
  reopen(){if(this.pending?.chrome)void this.pending.chrome.focus();if(this.pending?.window&&!this.pending.window.isDestroyed()){this.pending.window.show();this.pending.window.focus();}}
  cancel(){if(this.pending?.window&&!this.pending.window.isDestroyed())this.pending.window.close();void this.pending?.chrome?.close();this.pending=undefined;}
  async logout(){
    this.cancel();const binding=this.binding,active=this.active;this.binding=undefined;this.active=undefined;
    writeFileSync(this.file+'.tmp','null',{mode:0o600});renameSync(this.file+'.tmp',this.file);
    if(active?.chrome)await active.chrome.close(true);else if(binding?.chromeDirectory){const chrome=new ClaudeChromeLogin(path.join(this.root,binding.chromeDirectory,'chrome-login'),true);await chrome.start();await chrome.close(true);}
    if(binding)await session.fromPartition(binding.partition).clearStorageData();
  }
  close(){this.cancel();void this.active?.chrome?.close(false);}
}
