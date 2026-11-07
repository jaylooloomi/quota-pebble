import {spawn,ChildProcess} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {homedir} from 'node:os';
const WebSocket=require('ws');
import {ProviderError} from './model';
import {ownedChromeHasSession,ownedChromeShowsSignedIn,closeOwnedChromeWindow} from './chrome-login-presence';

export function findChrome(){
  const candidates=process.platform==='win32'?[path.join(process.env.PROGRAMFILES||'C:/Program Files','Google/Chrome/Application/chrome.exe'),path.join(process.env['PROGRAMFILES(X86)']||'C:/Program Files (x86)','Google/Chrome/Application/chrome.exe'),path.join(process.env.LOCALAPPDATA||path.join(homedir(),'AppData/Local'),'Google/Chrome/Application/chrome.exe')]:process.platform==='darwin'?['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']:['/usr/bin/google-chrome','/usr/bin/google-chrome-stable'];
  const executable=candidates.find(file=>existsSync(file));if(!executable)throw new ProviderError('auth','找不到 Google Chrome，請先安裝 Chrome');return executable;
}
export function chromeLoginArgs(directory:string,headless=false){
  const resolved=path.resolve(directory);
  if(path.basename(resolved)!=='chrome-login'||resolved===path.resolve(homedir())||resolved.includes('\Google\Chrome\User Data'))throw new Error('Dedicated Chrome login directory required');
  return ['--user-data-dir='+resolved,...(headless?['--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--headless=new']:[]),'--no-first-run','--no-default-browser-check','--new-window',headless?'about:blank':'https://claude.ai/new'];
}
export class ClaudeChromeLogin {
  private child?:ChildProcess;
  private ws:any;
  private target?:string;
  private targetSession?:string;
  private next=0;
  private jobs=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer:NodeJS.Timeout}>();
  private closed=false;
  private ua='';
  private cancelled=false;
  private sameOrigin=false;
  constructor(private directory:string,private headless=false){}
  async start(){
    if(this.cancelled)throw new ProviderError('auth','Chrome 登入視窗已關閉');
    mkdirSync(this.directory,{recursive:true,mode:0o700});const args=chromeLoginArgs(this.directory,this.headless);
    if(this.headless)try{unlinkSync(path.join(this.directory,'DevToolsActivePort'));}catch{}
    this.child=spawn(findChrome(),args,{windowsHide:!!this.headless,stdio:'ignore'});
    this.child.on('error',()=>{this.closed=true;});this.child.on('exit',()=>{this.closed=true;this.ws?.close();});
    if(!this.headless)return;
    let endpoint='';
    for(let n=0;n<100&&!this.closed;n++){
      try{const lines=readFileSync(path.join(this.directory,'DevToolsActivePort'),'utf8').trim().split('\n');if(/^\d+$/.test(lines[0]??'')&&/^\/devtools\/browser\/[a-f0-9-]+$/.test(lines[1]??'')){endpoint=`ws://127.0.0.1:${Number(lines[0])}${lines[1]}`;break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    if(!endpoint)throw new ProviderError('network','無法啟動 Chrome 登入工作階段');
    this.ws=new WebSocket(endpoint,{maxPayload:2*1024*1024});
    await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new ProviderError('network','Chrome 登入連線逾時')),10000);this.ws!.once('open',()=>{clearTimeout(timer);resolve();});this.ws!.once('error',()=>{clearTimeout(timer);reject(new ProviderError('network','Chrome 登入連線失敗'));});});
    this.ws.on('error',()=>{});this.ws.on('close',()=>{for(const job of this.jobs.values()){clearTimeout(job.timer);job.reject(new ProviderError('auth','Chrome 登入視窗已關閉'));}this.jobs.clear();});
    this.ws.on('message',(bytes:Buffer)=>{let value:any;try{value=JSON.parse(bytes.toString());}catch{return;}const job=this.jobs.get(value.id);if(!job)return;this.jobs.delete(value.id);clearTimeout(job.timer);value.error?job.reject(new ProviderError('network','Chrome 登入資料讀取失敗')):job.resolve(value.result);});
    this.ua=(await this.call('Browser.getVersion')).userAgent;
    for(let n=0;n<50;n++){const list=await this.call('Target.getTargets');const target=list.targetInfos.find((t:any)=>t.type==='page'&&(this.headless?t.url==='about:blank':t.url.startsWith('https://claude.ai/')));if(target){this.target=target.targetId;break;}await new Promise(resolve=>setTimeout(resolve,100));}
    if(!this.target)throw new ProviderError('network','Chrome 尚未提供 Claude 登入頁');
    this.targetSession=(await this.call('Target.attachToTarget',{targetId:this.target,flatten:true})).sessionId;
    // Keep the same Chrome product UA as the user's interactive sign-in.
    // Session verification can be tied to this UA; do not copy a HeadlessChrome
    // UA into a separately authorized interactive session.
    this.ua=this.ua.replace('HeadlessChrome/','Chrome/');
    await this.call('Network.setUserAgentOverride',{userAgent:this.ua},true);
  }
  private call(method:string,params:Record<string,unknown>={},page=false):Promise<any>{
    if(this.ws?.readyState!==WebSocket.OPEN)return Promise.reject(new ProviderError('auth','Chrome 登入視窗已關閉'));
    const id=++this.next;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.jobs.delete(id);reject(new ProviderError('network','Chrome 登入資料讀取逾時'));},10000);this.jobs.set(id,{resolve,reject,timer});this.ws!.send(JSON.stringify({id,method,params,...(page?{sessionId:this.targetSession}:{})}),(error?:Error)=>{if(error){clearTimeout(timer);this.jobs.delete(id);reject(new ProviderError('network','Chrome 登入連線失敗'));}});});
  }
  async capture(){
    const result=await this.call('Network.getCookies',{urls:['https://claude.ai/']},true);
    return{userAgent:this.ua,cookies:(Array.isArray(result.cookies)?result.cookies:[]).filter((c:any)=>['claude.ai','.claude.ai'].includes(c.domain)).slice(0,100)};
  }
  async waitForLogin(){
    if(!this.headless){
      let observedAt=0,closeRequested=false;
      for(let n=0;this.child?.exitCode===null&&!this.closed&&!this.cancelled;n++){
        if(n>=300)throw new ProviderError('auth','Chrome 登入逾時，請重試');
        const loginSignal=!closeRequested&&(process.platform==='win32'&&this.child.pid?await ownedChromeShowsSignedIn(this.child.pid,this.directory,findChrome()):ownedChromeHasSession(this.directory));
        if(loginSignal){
          if(!observedAt)observedAt=Date.now();
          if(Date.now()-observedAt>=8000&&this.child.pid){closeRequested=true;await closeOwnedChromeWindow(this.child.pid,this.directory,findChrome());}
        }else if(!closeRequested)observedAt=0;
        await new Promise(resolve=>setTimeout(resolve,2000));
      }
      if(this.cancelled)throw new ProviderError('auth','Chrome 登入視窗已關閉');this.closed=false;this.headless=true;await this.start();
    }
    for(let n=0;n<180&&!this.closed;n++){const {cookies}=await this.capture();if(cookies.some((cookie:any)=>cookie.name==='sessionKey'&&cookie.value))return;await new Promise(resolve=>setTimeout(resolve,2000));}
    throw new ProviderError('auth',this.closed?'Chrome 登入視窗已關閉':'Chrome 登入逾時，請重試');
  }
  async focus(){if(this.target)await this.call('Target.activateTarget',{targetId:this.target}).catch(()=>{});}
  async restore(cookies:any[]){
    const rows=cookies.filter(c=>['claude.ai','.claude.ai'].includes(c.domain)&&typeof c.name==='string'&&typeof c.value==='string').slice(0,100).map(c=>({name:c.name,value:c.value,domain:c.domain,path:c.path||'/',secure:true,httpOnly:!!c.httpOnly,...(typeof c.expirationDate==='number'?{expires:c.expirationDate}:{}),...(c.sameSite==='strict'?{sameSite:'Strict'}:c.sameSite==='lax'?{sameSite:'Lax'}:{sameSite:'None'})}));
    await this.call('Network.setCookies',{cookies:rows},true);
  }
  async fetch(url:string,init?:RequestInit):Promise<Response>{
    const parsed=new URL(url);if(parsed.origin!=='https://claude.ai'||!/^\/api\/(account|organizations(?:\/[a-f0-9-]{36}\/usage)?)$/.test(parsed.pathname)||parsed.search||parsed.hash||parsed.username||parsed.password||init?.method&&init.method!=='GET')throw new ProviderError('schema','Invalid Claude web route');
    if(!this.sameOrigin){await this.call('Page.navigate',{url:'https://claude.ai/robots.txt'},true);for(let n=0;n<40;n++){const frame=await this.call('Page.getFrameTree',{},true);if(frame.frameTree.frame.url.startsWith('https://claude.ai/')){this.sameOrigin=true;break;}await new Promise(resolve=>setTimeout(resolve,100));}}
    for(let n=0;n<40;n++){const origin=await this.call('Runtime.evaluate',{expression:'location.origin',returnByValue:true},true);if(origin.result?.value==='https://claude.ai')break;await new Promise(resolve=>setTimeout(resolve,100));}
    const expression=`(async()=>{const response=await fetch(${JSON.stringify(parsed.pathname)},{credentials:'include',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});const reader=response.body.getReader(),chunks=[];let size=0;for(;;){const row=await reader.read();if(row.done)break;size+=row.value.byteLength;if(size>1048576){await reader.cancel();throw Error('Response too large');}chunks.push(row.value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return{status:response.status,headers:{'content-type':response.headers.get('content-type')||'','retry-after':response.headers.get('retry-after')||''},body:new TextDecoder().decode(bytes)};})()`;
    const result=await this.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},true),response=result.result?.value;
    if(result.exceptionDetails||!response)throw new ProviderError('network','Claude 網頁配額連線失敗');
    return new Response(response.body,{status:response.status,headers:response.headers});
  }
  async close(clearCookies=true){
    this.cancelled=true;
    if(this.closed)return;this.closed=true;
    // Clear only this newly owned profile, never the user's normal Chrome.
    if(clearCookies)await this.call('Storage.clearCookies').catch(()=>{});
    await this.call('Browser.close').catch(()=>{});this.ws?.close();
    if(this.child?.exitCode===null){await new Promise<void>(resolve=>{const timer=setTimeout(resolve,2000);this.child!.once('exit',()=>{clearTimeout(timer);resolve();});});if(this.child.exitCode===null)this.child.kill();}
  }
}
