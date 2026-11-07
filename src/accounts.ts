import {mkdirSync,readFileSync,writeFileSync,renameSync,rmSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Poller} from './poller';
import {Connections} from './connections';
import {Providers} from './providers';
import {ProviderError,Reading} from './model';
type Profile={id:string;label:string;enabled:boolean;visible:boolean;reserve:number;window:string;limits?:unknown};
type Service=Pick<Providers,'read'|'login'|'submitCode'|'cancelLogin'|'logout'|'close'>&Partial<Pick<Providers,'hello'>>;
type Entry={profile:Profile;service:Service;poller:Poller;connections:Connections;removed:boolean};
const validId=(id:unknown):id is string=>typeof id==='string'&&/^claude-account-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
export class Accounts {
  private entries=new Map<string,Entry>();
  private file:string;
  constructor(private root:string,private factory:(directory:string)=>Service,private open:(url:string)=>Promise<void>,private changed:()=>void,private focus:()=>void,private observed?:(id:string,reading:Reading,time:string)=>void){
    mkdirSync(root,{recursive:true,mode:0o700});this.file=path.join(root,'accounts.json');
    let saved:any=[];try{saved=JSON.parse(readFileSync(this.file,'utf8'));}catch{}
    if(Array.isArray(saved))for(const raw of saved.slice(0,20)){
      if(!validId(raw?.id)||typeof raw.label!=='string'||!raw.label.trim()||raw.label.length>24||this.entries.has(raw.id))continue;
      this.attach({id:raw.id,label:raw.label,enabled:raw.enabled!==false,visible:raw.visible!==false,reserve:typeof raw.reserve==='number'&&Number.isFinite(raw.reserve)&&raw.reserve>=0&&raw.reserve<=100?(raw.reserveDefaultsVersion!==3&&raw.reserve===5?10:raw.reserve):10,window:typeof raw.window==='string'?raw.window.slice(0,160):'',limits:raw.limits});
    }
  }
  private directory(id:string){if(!validId(id))throw new ProviderError('auth','帳號不存在');const dir=path.resolve(this.root,id);if(path.dirname(dir)!==path.resolve(this.root))throw new ProviderError('auth','帳號不存在');return dir;}
  private attach(profile:Profile){
    const dir=this.directory(profile.id);mkdirSync(dir,{recursive:true,mode:0o700});
    const service=this.factory(dir);
    const poller=new Poller(id=>service.read(id),()=>{if(this.entries.has(profile.id)){this.save();this.changed();}},Date.now,(_id,reading,time)=>this.observed?.(profile.id,reading,time));
    if(service instanceof Providers)poller.setMinimumInterval('claude',service.usesClaudeWeb?900000:600000);
    poller.states.codex.enabled=false;poller.states.gemini.enabled=false;poller.states.claude.enabled=profile.enabled;
    const limits:any=profile.limits;if(service instanceof Providers&&service.usesClaudeWeb&&limits?.claude?.source!=='claude-web-v1')poller.restoreRateLimits({});else poller.restoreRateLimits(limits);
    const connections=new Connections(service,poller,this.open,()=>{if(this.entries.has(profile.id))this.changed();},this.focus);
    this.entries.set(profile.id,{profile,service,poller,connections,removed:false});
  }
  private save(){
    const profiles=[...this.entries.values()].map(e=>{const limits:any=e.poller.rateLimits();if(limits.claude&&e.service instanceof Providers&&e.service.usesClaudeWeb)limits.claude.source='claude-web-v1';return{...e.profile,reserveDefaultsVersion:3,limits};});
    writeFileSync(this.file+'.tmp',JSON.stringify(profiles),{mode:0o600});renameSync(this.file+'.tmp',this.file);
  }
  has(id:unknown):id is string{return typeof id==='string'&&this.entries.has(id);}
  private entry(id:unknown){if(!this.has(id))throw new ProviderError('auth','帳號不存在');return this.entries.get(id)!;}
  add(raw:unknown){
    if(typeof raw!=='string'||!raw.trim()||raw.trim().length>24||/[\x00-\x1f]/.test(raw))throw new ProviderError('auth','請輸入 1 至 24 字的帳號名稱');
    if([...this.entries.values()].some(e=>e.profile.label===raw.trim()))throw new ProviderError('auth','帳號名稱已使用，請換個名稱');
    if(this.entries.size>=20)throw new ProviderError('auth','最多可新增 20 個獨立帳號');
    const profile:Profile={id:`claude-account-${randomUUID()}`,label:raw.trim(),enabled:true,visible:true,reserve:10,window:''};
    this.attach(profile);this.save();this.changed();return profile.id;
  }
  rename(id:unknown,raw:unknown){
    const e=this.entry(id);
    if(typeof raw!=='string'||!raw.trim()||raw.trim().length>24||/[\x00-\x1f]/.test(raw))throw new ProviderError('auth','請輸入 1 至 24 字的帳號名稱');
    if([...this.entries.values()].some(other=>other!==e&&other.profile.label===raw.trim()))throw new ProviderError('auth','帳號名稱已使用，請換個名稱');
    e.profile.label=raw.trim();this.save();this.changed();
  }
  snapshot(){
    const accounts:any[]=[],providers:Record<string,unknown>={},auth:Record<string,unknown>={},enabled:Record<string,boolean>={},visible:Record<string,boolean>={},reservePercent:Record<string,number>={},paceWindows:Record<string,string>={};
    for(const e of this.entries.values()){
      const p=e.profile;accounts.push({id:p.id,label:p.label,provider:'claude'});providers[p.id]=e.poller.states.claude;auth[p.id]=e.connections.states.claude;
      enabled[p.id]=p.enabled;visible[p.id]=p.visible;reservePercent[p.id]=p.reserve;paceWindows[p.id]=p.window;
    }
    return {accounts,providers,auth,enabled,visible,reservePercent,paceWindows};
  }
  async tick(manual=false){await Promise.all([...this.entries.values()].map(e=>e.poller.refresh('claude',manual)));}
  async hello(id:string,cwd:string){const e=this.entry(id);if(!e.profile.enabled||e.connections.states.claude?.pending||!e.service.hello)throw new ProviderError('auth','此帳號暫時無法執行 Hello');await e.service.hello(cwd);}
  refreshAccount(id:string){if(this.has(id))return this.entry(id).poller.refresh('claude',true);}
  prepareLogin(id:unknown){const e=this.entry(id);e.poller.identityChanged('claude');return e.connections.prepareClaude();}
  continueLogin(id:unknown){const e=this.entry(id);if(e.connections.states.claude?.phase!=='web_login')return;e.profile.enabled=true;e.poller.setEnabled('claude',true);this.save();return e.connections.continueClaude();}
  login(id:unknown){const e=this.entry(id);e.profile.enabled=true;e.poller.setEnabled('claude',true);this.save();return e.connections.login('claude');}
  submit(id:unknown,code:unknown){this.entry(id).connections.submitCode('claude',code);}
  reopen(id:unknown){return this.entry(id).connections.reopen('claude');}
  cancel(id:unknown){const e=this.entry(id);if(!e.connections.cancelPreparation())e.service.cancelLogin('claude');}
  async logout(id:unknown){const e=this.entry(id);if(e.connections.states.claude?.pending)throw new ProviderError('auth','請先取消或完成目前的登入');await e.service.logout('claude');e.profile.enabled=false;e.poller.setEnabled('claude',false);await e.poller.signedOut('claude');delete e.connections.states.claude;this.save();this.changed();}
  async remove(id:unknown){const e=this.entry(id);e.service.cancelLogin('claude');e.profile.enabled=false;e.poller.setEnabled('claude',false);await e.poller.signedOut('claude');e.removed=true;e.service.close();this.entries.delete(e.profile.id);this.save();rmSync(this.directory(e.profile.id),{recursive:true,force:true});this.changed();}
  patch(patch:any){
    for(const [id,e] of this.entries){
      if(typeof patch.visible?.[id]==='boolean')e.profile.visible=patch.visible[id];
      if(typeof patch.enabled?.[id]==='boolean'){e.profile.enabled=patch.enabled[id];e.poller.setEnabled('claude',e.profile.enabled);}
      const reserve=patch.reservePercent?.[id];if(typeof reserve==='number'&&Number.isFinite(reserve)&&reserve>=0&&reserve<=100)e.profile.reserve=reserve;
      if(typeof patch.paceWindows?.[id]==='string'&&patch.paceWindows[id].length<=160)e.profile.window=patch.paceWindows[id];
    }
    this.save();
  }
  close(){for(const e of this.entries.values()){e.service.close();}this.save();}
}
