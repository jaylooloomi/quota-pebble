import {createHash} from 'node:crypto';
import { readFile,stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { CodexRpc } from './rpc';
import { findCli } from './cli';
import { Gemini } from './gemini';
import { jsonRequest } from './http';
import { ClaudeLogin, LoginProgress } from './claude-login';
import { Antigravity } from './antigravity';
import { ProviderError, ProviderId, parseClaude, parseCodex, parseGemini, Reading } from './model';
import {sendClaudeHello} from './hello-command';
import type {ClaudeWebSession} from './claude-web-session';
const exec = promisify(execFile);
export class Providers {
  rpc = new CodexRpc(() => findCli('codex'));
  private claudeLogin = new ClaudeLogin();
  private authJobs = new Map<ProviderId, Promise<void>>();
  private antigravity = new Antigravity();
  beginAntigravitySwitch(){this.antigravity.beginSwitch();}
  cancelAntigravitySwitch(){this.antigravity.cancelSwitch();}
  get waitingForAntigravityAccount(){return this.antigravity.waitingForAccount;}
  constructor(private gemini: Gemini, private googleSource: () => 'antigravity' | 'code_assist' = () => 'code_assist', private claudeConfigDir?:string, private claudeWeb?:ClaudeWebSession) {
    if(claudeConfigDir)this.claudeLogin=new ClaudeLogin(()=>this.claudeCommand());
  }
  get usesClaudeWeb(){return !!this.claudeWeb;}
  async prepareClaudeWeb(){if(!this.claudeWeb)return false;await this.claudeWeb.prepare();return true;}
  reopenClaudeWeb(){this.claudeWeb?.reopen();}
  waitClaudeWeb(){return this.claudeWeb?.waitForChromeLogin?.();}
  private claudeCommand(){
    const command=findCli('claude');if(!this.claudeConfigDir)return command;
    const env={...command.env,CLAUDE_CONFIG_DIR:this.claudeConfigDir};
    for(const key of ['CLAUDE_CODE_OAUTH_TOKEN','ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN'])delete (env as NodeJS.ProcessEnv)[key];
    return {...command,env};
  }
  async hello(cwd:string){const dir=this.claudeConfigDir||process.env.CLAUDE_CONFIG_DIR||path.join(homedir(),'.claude');return sendClaudeHello(this.claudeCommand(),dir,cwd);}
  async read(id: ProviderId): Promise<Reading> {
    if (id === 'codex') {
      const account = await this.rpc.call('account/read', { refreshToken: false });
      if (account?.account?.type !== 'chatgpt') throw new ProviderError('auth', '請使用 ChatGPT 帳號登入 Codex；API Key 無訂閱配額');
      const data = await this.rpc.call('account/rateLimits/read');
      return {...parseCodex(data, account.account.planType ?? null),identityKey:createHash('sha256').update(String(account.account.id??account.account.email??'codex-local')).digest('hex')};
    }
    if (id === 'gemini') {
      return this.googleSource() === 'antigravity' ? this.antigravity.read() : this.gemini.read();
    }
    if(this.claudeWeb)return this.claudeWeb.read();
    const dir = this.claudeConfigDir || process.env.CLAUDE_CONFIG_DIR || path.join(homedir(), '.claude');
    let credentials: any;
    try { credentials = JSON.parse(await readFile(path.join(dir, '.credentials.json'), 'utf8')); } catch { /* Keychain fallback below */ }
    if (!this.claudeConfigDir && !credentials?.claudeAiOauth?.accessToken && process.platform === 'darwin') {
      try {
        const { stdout } = await exec('/usr/bin/security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], { timeout: 10_000, maxBuffer: 128 * 1024 });
        const text = stdout.trim();
        credentials = JSON.parse(text.startsWith('{') ? text : Buffer.from(text.replace(/^0x/, ''), 'hex').toString('utf8'));
      } catch { /* Report signed out without leaking keychain output */ }
    }
    const oauth = credentials?.claudeAiOauth;
    if (!oauth?.accessToken) throw new ProviderError('auth', '請先登入 Claude Code，以讀取訂閱配額');
    // The usage endpoint can report stale credentials as 429 rather than 401.
    // Never spend its rate-limit budget on a token known to have expired.
    if(typeof oauth.expiresAt==='number'&&Number.isFinite(oauth.expiresAt)&&oauth.expiresAt<=Date.now())throw new ProviderError('auth','Claude 授權已過期，請重新登入');
    let identity=oauth.accessToken;try{const config=JSON.parse(await readFile(this.claudeConfigDir||process.env.CLAUDE_CONFIG_DIR?path.join(dir,'.claude.json'):path.join(homedir(),'.claude.json'),'utf8'));identity=config.oauthAccount?.accountUuid||identity;}catch{}
    const data = await jsonRequest('https://api.anthropic.com/api/oauth/usage', {
      Authorization: `Bearer ${oauth.accessToken}`, Accept: 'application/json', 'anthropic-beta': 'oauth-2025-04-20', 'User-Agent': 'quota-island/0.1.0'
    });
    return {...parseClaude(data, typeof oauth.subscriptionType === 'string' ? oauth.subscriptionType : null),identityKey:createHash('sha256').update(identity).digest('hex')};
  }
  async login(id: ProviderId, openUrl: (url: string) => Promise<void>, progress: (value: LoginProgress) => void = () => {}) {
    if (this.authJobs.has(id)) return this.authJobs.get(id)!;
    const job = this.performLogin(id, openUrl, progress).finally(() => this.authJobs.delete(id));
    this.authJobs.set(id, job);
    return job;
  }
  private async performLogin(id: ProviderId, openUrl: (url: string) => Promise<void>, progress: (value: LoginProgress) => void) {
    if (id === 'gemini') {
      if (this.googleSource() === 'antigravity') { progress({ connecting:true, message:'正在連接 Antigravity，本機帳號就緒後會自動同步配額…' }); await this.antigravity.connect(); }
      else await this.gemini.login(openUrl);
      return;
    }
    if (id === 'codex') {
      let loginId: string | undefined;
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const previous = this.rpc.onNotification;
        const timer = setTimeout(() => {
          if (loginId) void this.rpc.call('account/login/cancel', { loginId }).catch(() => {});
          finish(new ProviderError('auth', '登入逾時，請重試'));
        }, 300_000);
        const finish = (error?: Error) => { if (settled) return; settled = true; clearTimeout(timer); this.rpc.onNotification = previous; error ? reject(error) : resolve(); };
        this.rpc.onNotification = (method, params) => {
          previous(method, params);
          if (method === 'account/login/completed' && (!loginId || params.loginId === loginId)) finish(params.success ? undefined : new ProviderError('auth', '登入未完成，請重試'));
        };
        void this.rpc.call('account/login/start', { type: 'chatgpt' }).then(async r => {
          loginId = r.loginId;
          if (settled) { if (loginId) void this.rpc.call('account/login/cancel', { loginId }).catch(() => {}); return; }
          if (typeof r.authUrl !== 'string') throw new ProviderError('auth', 'Codex 未提供登入網址');
          await openUrl(r.authUrl);
        }).catch(e => finish(e));
      });
      return;
    }
    if(this.claudeWeb){progress({connecting:true,message:'正在驗證 Claude 網頁帳號與配額…'});await this.claudeWeb.login();return;}
    const configDir=this.claudeConfigDir||process.env.CLAUDE_CONFIG_DIR||path.join(homedir(),'.claude'),credentialFile=path.join(configDir,'.credentials.json');
    const before=await stat(credentialFile).then(s=>s.mtimeMs).catch(()=>0);
    try{await this.claudeLogin.start(info => {
      progress(info);
      // Official CLI opens the browser. Keep the URL only for explicit Reopen.
    },300000,async()=>{const stamp=await stat(credentialFile).then(s=>s.mtimeMs).catch(()=>0);if(stamp<=before)return false;const cmd=this.claudeCommand();const r=await exec(cmd.file,[...cmd.args,'auth','status','--json'],{env:cmd.env,windowsHide:true,timeout:10000,maxBuffer:65536});return JSON.parse(r.stdout).loggedIn===true;});}catch(error){const after=await stat(credentialFile).then(s=>s.mtimeMs).catch(()=>0);let verified=false;if(after>before){try{const cmd=this.claudeCommand();const result=await exec(cmd.file,[...cmd.args,'auth','status','--json'],{env:cmd.env,windowsHide:true,timeout:15000,maxBuffer:65536});verified=JSON.parse(result.stdout).loggedIn===true;}catch{}}if(!verified)throw error;}
  }
  submitCode(id: ProviderId, code: unknown) { if (id !== 'claude') throw new ProviderError('auth', '此來源不接受授權碼'); this.claudeLogin.submitCode(code); }
  cancelLogin(id: ProviderId) { if (id === 'claude'){this.claudeLogin.close();this.claudeWeb?.cancel();} }
  async logout(id: ProviderId) {
    if (this.authJobs.has(id)) throw new ProviderError('auth','請先取消或完成目前的登入');
    if (id === 'codex') { await this.rpc.call('account/logout'); return; }
    if (id === 'claude') {
      if(this.claudeWeb){await this.claudeWeb.logout();return;}
      const command=this.claudeCommand();
      try { await exec(command.file,[...command.args,'auth','logout'],{env:command.env,windowsHide:true,timeout:15_000,maxBuffer:128*1024}); }
      catch { throw new ProviderError('auth','登出未完成，請稍後重試'); }
      return;
    }
    throw new ProviderError('auth','請在 Antigravity 或 Google 帳號中管理授權');
  }
  close() { this.rpc.close(); this.gemini.close(); this.claudeLogin.close(); this.claudeWeb?.close(); }
}
