import { ProviderError, ProviderId } from './model';
import { Poller } from './poller';
import { LoginProgress } from './claude-login';
export interface ConnectionState {
  pending: boolean; phase: 'web_login' | 'authorizing' | 'connecting' | 'code' | 'verifying' | 'syncing' | 'cooldown' | 'waiting' | 'ready' | 'error'; message: string;
  codeRequired?: boolean; canReopen?: boolean; automatic?:boolean;
}
export class Connections {
  states: Partial<Record<ProviderId, ConnectionState>> = {};
  private urls = new Map<ProviderId, string>();
  constructor(private service: { usesClaudeWeb?:boolean;prepareClaudeWeb?():Promise<boolean>;reopenClaudeWeb?():void;waitClaudeWeb?():Promise<void>|undefined;cancelLogin?(id:ProviderId):void;login(id: ProviderId, open: (url: string) => Promise<void>, progress: (value: LoginProgress) => void): Promise<void>; submitCode(id: ProviderId, code: unknown): void },
    private poller: Poller, private open: (url: string) => Promise<void>, private changed: () => void, private focus: () => void) {}
  async prepareClaude(){if(this.states.claude?.pending){this.service.reopenClaudeWeb?.();return;}this.states.claude={pending:true,phase:'web_login',canReopen:true,automatic:!!this.service.usesClaudeWeb,message:this.service.usesClaudeWeb?'請在 Chrome 登入 Claude；完成後會自動關閉專用視窗並同步配額。若未自動關閉，可手動關窗。':'先在 Claude 網頁登入要監控的帳號，再按「已登入正確帳號，繼續授權」。'};this.changed();try{if(this.service.usesClaudeWeb){await this.service.prepareClaudeWeb?.();const preparation=this.states.claude;void this.service.waitClaudeWeb?.()?.then(()=>{if(this.states.claude===preparation&&preparation?.phase==='web_login')return this.continueClaude();}).catch(error=>{if(this.states.claude!==preparation||preparation?.phase!=='web_login')return;this.states.claude={pending:false,phase:'error',message:error instanceof ProviderError?error.message:'Chrome 登入未完成，請重試'};this.changed();});return;}this.urls.set('claude','https://claude.ai/new');await this.open('https://claude.ai/new');}catch(error){this.service.cancelLogin?.('claude');this.states.claude={pending:false,phase:'error',message:error instanceof ProviderError?error.message:'Chrome 登入未完成，請重試'};this.changed();}}
  continueClaude(){if(this.states.claude?.phase!=='web_login')return;this.states.claude.pending=false;return this.login('claude');}
  cancelPreparation(){if(this.states.claude?.phase!=='web_login')return false;if(this.service.usesClaudeWeb)this.service.cancelLogin?.('claude');delete this.states.claude;this.urls.delete('claude');this.changed();return true;}
  async login(id: ProviderId) {
    if (this.states[id]?.pending) return;
    this.states[id] = { pending: true, phase: 'authorizing', message: '等待瀏覽器授權，完成後會自動同步配額…' };
    this.changed();
    const progress = (info: LoginProgress) => {
      const s = this.states[id]; if (!s?.pending) return;
      if (info.connecting) s.phase = 'connecting';
      if (info.message) s.message = info.message;
      if (info.browserUrl) { this.urls.set(id, info.browserUrl); s.canReopen = true; }
      if (info.codeRequired) { s.codeRequired = true; s.phase = 'code'; s.message = '瀏覽器授權後，將頁面提供的授權碼貼在下方，App 會自動完成連接與同步。'; }
      this.changed();
    };
    try {
      await this.service.login(id, async url => { progress({ browserUrl: url }); await this.open(url); }, progress);
      this.states[id] = { pending: true, phase: 'syncing', message: '授權完成，正在自動同步配額…' };
      this.changed(); this.focus();
      await this.poller.authenticated(id);
      const s = this.poller.states[id];
      this.states[id] = s.status === 'ready'
        ? { pending: false, phase: 'ready', message: '已連接，配額已自動同步' }
        : this.poller.rateLimits()[id]
        ? { pending: false, phase: 'cooldown', message: '帳號授權已完成；配額查詢仍在冷卻，期滿後會自動同步。' }
        : { pending: false, phase: 'error', message: `授權流程已完成，但配額同步失敗：${s.error ?? '服務尚未提供配額'}。App 會自動重試。` };
    } catch (e) {
      this.states[id] = { pending: false, phase: 'error', message: e instanceof ProviderError ? e.message : '登入未完成，請重試' };
      this.focus();
    } finally { this.urls.delete(id); this.changed(); }
  }
  async reopen(id: ProviderId) {if(id==='claude'&&this.service.usesClaudeWeb){this.service.reopenClaudeWeb?.();return;}const url = this.urls.get(id); if (url && this.states[id]?.pending) await this.open(url); }
  submitCode(id: ProviderId, code: unknown) {
    try { this.service.submitCode(id, code); const s = this.states[id]; if (s) { s.codeRequired = false; s.phase = 'verifying'; s.message = '正在驗證授權碼，最多等待 60 秒；可取消後重新登入。'; } }
    catch (e) { const s = this.states[id]; if (s) s.message = e instanceof ProviderError ? e.message : '授權碼無法送出'; }
    this.changed();
  }
}
