import {taskSourceDiagnostics} from './task-source-diagnostics';
import {ClaudeWebSession} from './claude-web-session';
import {PetMessages} from './pet-messages';
import {RssTitleTranslator} from './rss-translation';
import {PetMessageWindow} from './pet-message-window';
import {PetGrowth} from './pet-growth';
import {CombinedTaskMonitor as TaskMonitor} from './combined-task-monitor';
import {TaskBubble} from './task-bubble';
import {IdleTracker} from './task-idle';
import {TaskPeak} from './task-peak';
import {UsageHistory} from './usage-history';
import {AutoReconnect} from './auto-reconnect';
import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, shell, Tray, globalShortcut, powerMonitor, Notification, safeStorage, clipboard } from 'electron';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import {syncLoginStartup} from './login-startup';
import { Poller } from './poller';
import { Providers } from './providers';
import { Gemini, GeminiVault } from './gemini';
import { Connections } from './connections';
import { CredentialWatch } from './credential-watch';
import {Accounts} from './accounts';
import {Diagnostics} from './diagnostics';
import {MorningHello} from './morning-hello';
import {fitWindow,snapWindow,Dock,Rect} from './window-position';
import { homedir } from 'node:os';
import { ProviderError, ProviderId, ProviderState, providerIds, Reading } from './model';
const demo = process.argv.includes('--demo');
const testing = process.argv.includes('--test-mode');
const { translate, normalizeLocale } = require('./ui/i18n');
const t = (value: string) => translate(value, settings.locale);
let updateTrayMenu = () => {};
if (testing) {
  const testData = process.env.QUOTA_TEST_DATA;
  if (!testData) throw new Error('QUOTA_TEST_DATA required');
  app.setPath('userData', testData);
}
const petBackgrounds = ["meteor","meteor-day","cloud-day","cloud-night","sakura-day","sakura-night","coast-day","coast-night","snow-day","snow-night","greenhouse-day","greenhouse-night"] as const;
type Settings = { taskCompletionNotifications:boolean; compactTaskSummary:boolean; petCharacter:'claude'|'codex'|'gemini'|'octopus'|'random'; petPlacement:'stage'|'title'; autoStart:boolean; petBackground:typeof petBackgrounds[number]; petRoam:boolean; petStyle:'smooth'; petIdle:boolean;petAlerts:boolean; morningHelloEnabled:boolean; morningHelloTime:string; locale: 'zh-TW' | 'en' | 'ja' | 'ko'; remaining: boolean; pacing: boolean; reserveDefaultsVersion:3; reservePercent: Record<ProviderId, number>; paceWindows: Partial<Record<ProviderId, string>>; alwaysOnTop: boolean; notifications: boolean; visible: Record<ProviderId, boolean>; enabled: Record<ProviderId, boolean>; order: string[]; googleSource: 'antigravity' | 'code_assist'; presentationVersion:2; dock?:Dock; x?: number; y?: number };
let settings: Settings = { taskCompletionNotifications:true, compactTaskSummary:true, petCharacter:'claude', petPlacement:'stage', autoStart:true, petBackground:'meteor', petRoam:!demo, petStyle:'smooth', petIdle:!demo,petAlerts:!demo, morningHelloEnabled:true, morningHelloTime:'08:00', locale:'zh-TW', remaining: true, pacing:false, reserveDefaultsVersion:3, reservePercent:{claude:10,codex:10,gemini:10}, paceWindows:{}, alwaysOnTop: true, notifications: true, visible: { claude:true, codex:true, gemini:true }, enabled: { claude: true, gemini: true, codex: true }, order: ['claude','codex','gemini'], googleSource:'antigravity', presentationVersion:2 };
function validOrder(raw: unknown): raw is string[] {
  return Array.isArray(raw) && raw.length >= 3 && raw.length <= 23 && new Set(raw).size === raw.length && providerIds.every(id=>raw.includes(id)) && raw.every(id => providerIds.includes(id) || (typeof id === 'string' && /^claude-account-[0-9a-f-]{36}$/.test(id)));
}
let win: BrowserWindow;
let tray: Tray;
let topTimer:NodeJS.Timeout|undefined;
function maintainTop(){if(!win||win.isDestroyed()||!win.isVisible()||!settings.alwaysOnTop)return;if(!win.isAlwaysOnTop())win.setAlwaysOnTop(true);win.moveTop();}
let expanded = false;
let quitting = false;
let paused = false;
let providers: Providers;
let poller: Poller;
let usageHistory:UsageHistory;let petGrowth:PetGrowth;let petMessages:PetMessages;let petMessageWindow:PetMessageWindow;
let taskMonitor:TaskMonitor;let taskBubble:TaskBubble;const idleTracker=new IdleTracker();let taskPeak:TaskPeak;
let interval: NodeJS.Timeout;
let connections: Connections;
let credentialWatch: CredentialWatch;
const warned = new Map<string, string>();
let savedRateLimits='';
function persistRateLimits(){
  if(!poller||demo)return;
  const limits:any=poller.rateLimits();if(limits.claude&&providers?.usesClaudeWeb)limits.claude.source='claude-web-v1';
  const serialized=JSON.stringify(limits);if(serialized===savedRateLimits)return;
  try{const file=path.join(app.getPath('userData'),'provider-cooldowns.json');mkdirSync(app.getPath('userData'),{recursive:true});writeFileSync(file+'.tmp',serialized,{mode:0o600});renameSync(file+'.tmp',file);savedRateLimits=serialized;}catch{/* A cache write must never stop quota updates. */}
}
function saveSettings() {
  if (demo && !testing) return;
  try {
    const dir = app.getPath('userData'); mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'preferences.json');
    writeFileSync(file + '.tmp', JSON.stringify(settings), { mode: 0o600 }); renameSync(file + '.tmp', file);
  } catch { /* Preferences must never prevent the monitoring window from working. */ }
}
function readSettings() {
  if (demo && !testing) return;
  try {
    const s = JSON.parse(readFileSync(path.join(app.getPath('userData'), 'preferences.json'), 'utf8'));
    if (validOrder(s.order)) settings.order = [...s.order];
    settings.locale=normalizeLocale(s.locale);
    if(['claude','codex','gemini','octopus','random'].includes(s.petCharacter))settings.petCharacter=s.petCharacter;
    if(['stage','title'].includes(s.petPlacement))settings.petPlacement=s.petPlacement;
    if((petBackgrounds as readonly string[]).includes(s.petBackground))settings.petBackground=s.petBackground;
    settings.petStyle='smooth';
    if(typeof s.morningHelloEnabled==='boolean')settings.morningHelloEnabled=s.morningHelloEnabled;
    if(typeof s.morningHelloTime==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s.morningHelloTime))settings.morningHelloTime=s.morningHelloTime;
    if(s.dock&&[null,'left','right'].includes(s.dock.horizontal)&&[null,'top','bottom'].includes(s.dock.vertical))settings.dock={horizontal:s.dock.horizontal,vertical:s.dock.vertical};
    for(const id of providerIds){if(typeof s.reservePercent?.[id]==='number'&&Number.isFinite(s.reservePercent[id])&&s.reservePercent[id]>=0&&s.reservePercent[id]<=100)settings.reservePercent[id]=s.reserveDefaultsVersion===2&&s.reservePercent[id]===5?10:s.reservePercent[id];if(typeof s.paceWindows?.[id]==='string'&&s.paceWindows[id].length<=160)settings.paceWindows[id]=s.paceWindows[id];}
    for (const id of providerIds) if (typeof s.visible?.[id] === 'boolean') settings.visible[id] = s.visible[id];
    if (s.googleSource === 'antigravity' || s.googleSource === 'code_assist') settings.googleSource=s.googleSource;
    for (const key of ['taskCompletionNotifications','autoStart','remaining', 'pacing', 'alwaysOnTop', 'notifications','petIdle','petAlerts','petRoam'] as const) if (typeof s[key] === 'boolean' && (key!=='remaining'||s.presentationVersion===2)) settings[key] = s[key];
    for (const id of providerIds) if (typeof s.enabled?.[id] === 'boolean') settings.enabled[id] = s.enabled[id];
    if (Number.isFinite(s.x) && Number.isFinite(s.y)) { settings.x = s.x; settings.y = s.y; }
  } catch { /* First run or invalid preferences: use defaults. */ }
}
let accounts:Accounts;
let autoReconnect:AutoReconnect|undefined;
let diagnostics:Diagnostics|undefined;
let morningHello:MorningHello|undefined;
function snapshot() { const extra=accounts?.snapshot();return { providers: {...poller.states,...extra?.providers}, settings:{...settings,order:[...settings.order.filter(id=>providerIds.includes(id as ProviderId)||accounts?.has(id)),...(extra?.accounts??[]).map(a=>a.id).filter(id=>!settings.order.includes(id))],enabled:{...settings.enabled,...extra?.enabled},visible:{...settings.visible,...extra?.visible},reservePercent:{...settings.reservePercent,...extra?.reservePercent},paceWindows:{...settings.paceWindows,...extra?.paceWindows}}, tasks:taskMonitor?{...taskMonitor.snapshot(),peak:taskPeak?.snapshot()}:undefined, petMessages:petMessages?.snapshot(), petGrowth:petGrowth?.snapshot(), morningHello:morningHello?.snapshot()??{}, accounts:extra?.accounts??[], auth:{...connections?.states,...extra?.auth}, expanded, paused, demo, claudeQuotaSource:providers?.usesClaudeWeb?'web':'oauth', version: app.getVersion(), platform: process.platform }; }
function publish() {
  persistRateLimits();
  if(taskMonitor)taskPeak?.observe(taskMonitor.snapshot(),!paused);
  if(taskMonitor)for(const notice of idleTracker.observe(taskMonitor.snapshot().rows,settings.taskCompletionNotifications&&!paused)){diagnostics?.taskNotice('idle',notice.provider,'eligible');taskBubble?.enqueue(notice);}
  if(taskMonitor)diagnostics?.taskMonitor(taskMonitor.snapshot(),idleTracker.diagnostics(),{enabled:settings.taskCompletionNotifications,paused,visible:!!win?.isVisible()});
  if(poller){const snap=snapshot();diagnostics?.observe(snap);for(const [id,s] of Object.entries(snap.providers) as [string,ProviderState][])if(snap.paused||((snap.auth as any)?.[id]?.pending&&(snap.auth as any)[id].phase!=='syncing')||!s.enabled||['stale','unavailable','signed_out'].includes(s.status))usageHistory?.gap(id);}
  if (!win?.isDestroyed() && !win?.webContents.isDestroyed()) win?.webContents.send('state', snapshot());
  if (settings.notifications && !demo && !testing && Notification.isSupported()) {
    for (const [accountId,s] of Object.entries({...poller.states,...accounts?.snapshot().providers}) as [string,ProviderState][]) {
      if (!s.enabled || s.status !== 'ready') continue;
      for (const w of s.reading?.windows ?? []) {
        const key = `${accountId}:${w.id}`;
        const reset = w.resetsAt ?? 'unknown';
        if (w.usedPercent < 85) warned.delete(key);
        if (w.usedPercent >= 90 && warned.get(key) !== reset) {
          warned.set(key, reset);
          new Notification({ title: t(`${s.provider} 配額即將用完`), body: t(`${w.label} 已使用 ${Math.round(w.usedPercent)}%`) }).show();
        }
      }
    }
  }
}
let panelHeight = 480;
let petHeight=0;
let expectedBounds:Rect|undefined;
let dragTimer:NodeJS.Timeout|undefined;
let userDragging=false;
function applyBounds(bounds:Rect){const current=win.getBounds();expectedBounds=bounds;if(['x','y','width','height'].some(key=>current[key as keyof Rect]!==bounds[key as keyof Rect]))win.setBounds(bounds);}
function settlePosition(){
  if(!win||win.isDestroyed())return;
  const bounds=win.getBounds();if(expectedBounds&&bounds.x===expectedBounds.x&&bounds.y===expectedBounds.y)return;
  const result=snapWindow(bounds,screen.getDisplayMatching(bounds).workArea);settings.dock=result.dock;
  applyBounds(result.bounds);settings.x=result.bounds.x;settings.y=result.bounds.y;saveSettings();
}
function reposition() {
  if(!win||win.isDestroyed()||userDragging)return;
  const bounds = win.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const width = Math.min(464, area.width);
  const height = Math.min(expanded ? panelHeight : 76+petHeight, area.height);
  applyBounds(fitWindow(bounds,area,width,height,settings.dock));
}
function setExpanded(value: boolean) { expanded = value; reposition(); publish(); }
const external: Record<string, string> = {
  claude: 'https://claude.ai/settings/usage', codex: 'https://chatgpt.com/codex/settings/usage',
  gemini: 'https://antigravity.google/docs/cli/commands/usage',
  'install-claude': 'https://code.claude.com/docs/en/setup', 'install-codex': 'https://developers.openai.com/codex/cli',
};
async function openAuthUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !['auth.openai.com', 'auth0.openai.com', 'chatgpt.com', 'accounts.google.com', 'claude.ai', 'claude.com', 'platform.claude.com', 'console.anthropic.com'].includes(url.hostname)) throw new ProviderError('auth', '登入服務提供的網址無法辨識');
  await shell.openExternal(url.href);
}
function validateId(raw: unknown): ProviderId {
  if (!providerIds.includes(raw as ProviderId)) throw new Error('Unknown provider');
  return raw as ProviderId;
}
function demoReading(id: ProviderId): Reading {
  const later = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString();
  const base = { provider: id, plan: id === 'claude' ? 'Max' : 'Pro', source: '展示資料 · 非真實帳號用量' };
  return { ...base, windows: id === 'gemini'
    ? [{ id: 'pro', label: 'Gemini Pro', usedPercent: 38, resetsAt: later(11) }, { id: 'flash', label: 'Gemini Flash', usedPercent: 12, resetsAt: later(11) }]
    : id === 'claude' ? [{ id: 'session', label: '5 小時', usedPercent:64, resetsAt: later(2.4) }, { id: 'weekly', label: '每週', usedPercent:43, resetsAt: later(72) }]
    : [{ id:'weekly', label:'7 天', usedPercent:88, resetsAt:'2026-11-04T11:22:00.000Z' }] };
}
function installHandlers() {
  // Only our trusted local renderer may call IPC. No arbitrary URLs, commands or paths.
  for (const [channel, handler] of Object.entries({
    'get-state': () => snapshot(),
    'pet-feed-configure':(_event:any,action:unknown,value:unknown)=>{try{petMessages.configure(action,value);return{ok:true};}catch{return{ok:false};}},
    'pet-message-preview':()=>petMessages.preview(),
    'pet-message-present':(_event:any,id:unknown,anchor:unknown)=>{if(typeof anchor!=='number'||!Number.isFinite(anchor))return;const message=petMessages.snapshot().items[0];petMessageWindow.show(message&&message.id===id?message:null,Math.max(0,Math.min(464,anchor)),expanded||paused||taskBubble.isVisible);},
    'task-bubble-anchor':(_event:any,x:unknown)=>taskBubble?.setAnchor(x),
    'tasks-start':async()=>{await taskMonitor.refresh();return taskMonitor.snapshot();},
    'task-diagnostics-copy':async()=>{await clipboard.writeText(JSON.stringify(taskSourceDiagnostics(taskMonitor.snapshot(),app.getVersion(),require('node:os').hostname()),null,2));return{ok:true};},
    'history-query': (_event:any,id:unknown,window:unknown,days:unknown)=>{if(typeof id!=='string'||!providerIds.includes(id as ProviderId)&&!accounts.has(id))throw new Error('Unknown account');return usageHistory.query(id,window,days);},
    'history-clear':()=>({ok:usageHistory.clear()}),
    'pet-height': (_event:any,value:unknown)=>{if(value!==0&&value!==112)return;petHeight=value;reposition();},
    'expand': (_event: any, value: unknown) => { if (typeof value === 'boolean') setExpanded(value); },
    'panel-height': (_event: any, value: unknown) => { if (typeof value === 'number' && Number.isFinite(value)) { const height = Math.max(480, Math.min(1200, Math.ceil(value))); if (height !== panelHeight) { panelHeight = height; reposition(); } } },
    'refresh': async () => { if (!paused) await Promise.all([poller.tick(true),accounts.tick(true)]); return snapshot(); },
    'account-add': (_event:any,label:unknown)=>{try{return {ok:true,id:accounts.add(label)};}catch(e){return {ok:false,message:e instanceof ProviderError?e.message:'無法新增帳號'};}},
    'account-remove': async (_event:any,id:unknown)=>{try{await accounts.remove(id);usageHistory.clear(String(id));return {ok:true};}catch{return {ok:false,message:'無法移除帳號'};}},
    'account-rename': (_event:any,id:unknown,label:unknown)=>{try{accounts.rename(id,label);return {ok:true};}catch(e){return {ok:false,message:e instanceof ProviderError?e.message:'無法重新命名'};}},
    'hide': () => win.hide(),
    'quit': () => { quitting = true; app.quit(); },
    'open-provider': async (_event: any, id: unknown) => { if (typeof id === 'string' && external[id]) await shell.openExternal(external[id]!); },
    'settings': (_event: any, patch: any) => {
      if (!patch || typeof patch !== 'object') return;
      if(typeof patch.autoStart==='boolean')patch={...patch,autoStart:syncLoginStartup(app,patch.autoStart,{platform:process.platform,packaged:app.isPackaged,demo,testing,executable:process.execPath})};
      if(typeof patch.morningHelloEnabled==='boolean')settings.morningHelloEnabled=patch.morningHelloEnabled;
      if(typeof patch.morningHelloTime==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(patch.morningHelloTime))settings.morningHelloTime=patch.morningHelloTime;
      if(['claude','codex','gemini','octopus','random'].includes(patch.petCharacter))settings.petCharacter=patch.petCharacter;
      if(['stage','title'].includes(patch.petPlacement))settings.petPlacement=patch.petPlacement;
      if((petBackgrounds as readonly string[]).includes(patch.petBackground))settings.petBackground=patch.petBackground;
      settings.petStyle='smooth';
      accounts.patch(patch);
      for(const id of providerIds){if(typeof patch.reservePercent?.[id]==='number'&&Number.isFinite(patch.reservePercent[id])&&patch.reservePercent[id]>=0&&patch.reservePercent[id]<=100)settings.reservePercent[id]=patch.reservePercent[id];if(typeof patch.paceWindows?.[id]==='string'&&patch.paceWindows[id].length<=160)settings.paceWindows[id]=patch.paceWindows[id];}
      for (const id of providerIds) if (typeof patch.visible?.[id] === 'boolean') settings.visible[id] = patch.visible[id];
      if (['zh-TW','en','ja','ko'].includes(patch.locale)) { settings.locale=patch.locale; updateTrayMenu(); }
      if (validOrder(patch.order)&&patch.order.every((id:string)=>providerIds.includes(id as ProviderId)||accounts.has(id))) settings.order = [...patch.order];
      const sourceChanged = !connections.states.gemini?.pending && (patch.googleSource === 'antigravity' || patch.googleSource === 'code_assist') && patch.googleSource !== settings.googleSource;
      if (sourceChanged) { settings.googleSource=patch.googleSource; delete connections.states.gemini; }
      for (const key of ['taskCompletionNotifications','autoStart','remaining', 'pacing', 'alwaysOnTop', 'notifications','petIdle','petAlerts','petRoam'] as const) if (typeof patch[key] === 'boolean') settings[key] = patch[key];
      if (patch.enabled && typeof patch.enabled === 'object') for (const id of providerIds) if (typeof patch.enabled[id] === 'boolean') {
        if(settings.enabled[id]!==patch.enabled[id])diagnostics?.sourceToggle(id,patch.enabled[id]);
        settings.enabled[id] = patch.enabled[id]; poller.setEnabled(id, patch.enabled[id]);
      }
      win.setAlwaysOnTop(settings.alwaysOnTop);maintainTop();taskBubble?.configure(settings.locale,settings.taskCompletionNotifications);if(settings.taskCompletionNotifications&&!demo)void taskMonitor.start(); saveSettings(); publish();
      if (sourceChanged) {poller.identityChanged('gemini');usageHistory.boundary('gemini','source');void poller.authenticated('gemini');}
      if (!paused) void poller.tick();
    },
    'login': (_event: any, raw: unknown) => {
      if(typeof raw==='string'&&(providerIds.includes(raw as ProviderId)||accounts.has(raw)))petGrowth.boundary(raw);
      if(accounts.has(raw)){if(!demo){usageHistory.gap(raw,'auth');void accounts.prepareLogin(raw);}return;}
      const id = validateId(raw);
      if (demo) { connections.states[id] = { pending: false, phase: 'error', message: '展示模式不會啟動登入；正常啟動即可連接帳號' }; publish(); return; }
      poller.identityChanged(id);usageHistory.gap(id,'auth');if(id==='claude')void connections.prepareClaude();else void connections.login(id);
    },
    'continue-claude-login': (_event:any,raw:unknown)=>{if(demo)return;if(accounts.has(raw))void accounts.continueLogin(raw);else if(raw==='claude')void connections.continueClaude();},
    'reopen-login': (_event: any, raw: unknown) => accounts.has(raw)?accounts.reopen(raw):connections.reopen(validateId(raw)),
    'cancel-login': (_event: any, raw: unknown) => accounts.has(raw)?accounts.cancel(raw):(raw==='claude'&&connections.cancelPreparation()?undefined:providers.cancelLogin(validateId(raw))),
    'logout': async (_event: any, raw: unknown) => {
      if(accounts.has(raw)){if(demo)return {ok:false,message:'展示模式不會登出帳號'};try{await accounts.logout(raw);usageHistory.gap(raw);return {ok:true};}catch(e){return {ok:false,message:e instanceof ProviderError?e.message:'登出未完成，請稍後重試'};}}
      const id=validateId(raw);
      if (demo) return {ok:false,message:'展示模式不會登出帳號'};
      if (connections.states[id]?.pending) return {ok:false,message:'請先取消或完成目前的登入'};
      try {
        await providers.logout(id);usageHistory.gap(id);await poller.signedOut(id);delete connections.states[id];publish();return {ok:true};
      } catch(e) { return {ok:false,message:e instanceof ProviderError?e.message:'登出未完成，請稍後重試'}; }
    },
    'open-antigravity': async () => {
      if (demo) return {ok:false,message:'展示模式不會開啟外部應用'};
      const file=process.platform==='win32'?path.join(homedir(),'AppData/Local/Programs/Antigravity/Antigravity.exe'):process.platform==='darwin'?'/Applications/Antigravity.app':null;
      if (!file) return {ok:false,message:'請自行開啟 Antigravity，在其中登出並切換 Google 帳號'};
      const error=await shell.openPath(file);
      return error?{ok:false,message:'請自行開啟 Antigravity，在其中登出並切換 Google 帳號'}:{ok:true};
    },
    'antigravity-account': async (_event:any,action:unknown) => {
      if(settings.googleSource!=='antigravity'||!['disconnect','switch'].includes(String(action)))return {ok:false};
      if(action==='disconnect'){
        providers.cancelAntigravitySwitch();
        settings.enabled.gemini=false;poller.setEnabled('gemini',false);await poller.signedOut('gemini');delete connections.states.gemini;saveSettings();publish();return {ok:true};
      }
      if(demo)return {ok:false,message:'展示模式不會開啟外部應用'};
      const file=process.platform==='win32'?path.join(homedir(),'AppData/Local/Programs/Antigravity/Antigravity.exe'):process.platform==='darwin'?'/Applications/Antigravity.app':null;
      if(!file)return {ok:false,message:'請自行開啟 Antigravity，在其中登出並切換 Google 帳號'};
      const error=await shell.openPath(file);if(error)return {ok:false,message:'請自行開啟 Antigravity，在其中登出並切換 Google 帳號'};
      poller.identityChanged('gemini');usageHistory.boundary('gemini');providers.beginAntigravitySwitch();settings.enabled.gemini=true;poller.setEnabled('gemini',true);saveSettings();await poller.signedOut('gemini');void poller.authenticated('gemini');publish();return {ok:true};
    },
    'submit-code': (_event: any, raw: unknown, code: unknown) => accounts.has(raw)?accounts.submit(raw,code):connections.submitCode(validateId(raw), code),
  })) {
    ipcMain.handle(channel, (event, ...args) => {
      if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Untrusted sender');
      return (handler as (...args: any[]) => unknown)(event, ...args);
    });
  }
}
function makeTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'ui/icons/quota-pebble-tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('Quota Pebble · Claude / Gemini / Codex');
  const updateMenu = () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: t('顯示動態島'), click: () => { win.show(); win.focus(); } },
    { label: t('展開配額面板'), click: () => { setExpanded(true); win.show(); win.focus(); } },
    { label: t(paused ? '繼續更新' : '暫停更新'), click: () => { paused = !paused; updateMenu(); publish(); if (!paused) void poller.tick(); } },
    { type: 'separator' }, { label: t('結束'), click: () => { quitting = true; app.quit(); } }
  ]));
  updateTrayMenu=updateMenu;
  updateMenu(); tray.on('click', () => { win.show(); win.focus(); });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
  app.whenReady().then(async () => {
    readSettings();
    if(!demo&&!testing){if(process.argv.includes('--enable-autostart'))settings.autoStart=true;try{settings.autoStart=syncLoginStartup(app,settings.autoStart,{platform:process.platform,packaged:app.isPackaged,demo,testing,executable:process.execPath});saveSettings();}catch{settings.autoStart=false;}}
    usageHistory=new UsageHistory(path.join(app.getPath('userData'),demo?'demo-usage-history':'usage-history'));
    petGrowth=new PetGrowth(path.join(app.getPath('userData'),demo?'demo-pet-growth.json':'pet-growth.json'));
    taskPeak=new TaskPeak(path.join(app.getPath('userData'),demo?'demo-task-peak.json':'task-peak.json'));
    taskMonitor=new TaskMonitor(testing?(process.env.QUOTA_TEST_SESSION_ROOT||path.join(app.getPath('userData'),'codex-sessions')):path.join(process.env.CODEX_HOME||path.join(homedir(),'.codex'),'sessions'),publish,!demo&&!testing,item=>{diagnostics?.taskNotice('completed',item.provider,'eligible');idleTracker.completion(item.id);if(settings.taskCompletionNotifications&&!paused)taskBubble?.enqueue(item);},()=>{const dir=process.env.CLAUDE_CONFIG_DIR||path.join(homedir(),'.claude');return [...(settings.enabled.claude?[{directory:dir,config:process.env.CLAUDE_CONFIG_DIR?path.join(dir,'.claude.json'):path.join(homedir(),'.claude.json'),label:'Claude'}]:[]),...(accounts?.snapshot().accounts||[]).filter((a:any)=>accounts.snapshot().enabled[a.id]).map((a:any)=>({directory:path.join(app.getPath('userData'),'claude-accounts',a.id),config:path.join(app.getPath('userData'),'claude-accounts',a.id,'.claude.json'),label:a.label}))];});
    diagnostics=new Diagnostics(path.join(app.getPath('userData'),demo?'demo-logs':'logs'));diagnostics.startup(app.getVersion(),settings.enabled);
    const web=demo?undefined:new ClaudeWebSession(path.join(app.getPath('userData'),'claude-web','primary'),t);
    if(web&&!testing)diagnostics.webMigration(await web.importValidation(path.join(app.getPath('appData'),'quota-pebble-web-validation','verified-session.bin')).catch(()=>'failed'));
    providers = new Providers(new Gemini(new GeminiVault(app.getPath('userData'), safeStorage)), () => settings.googleSource,undefined,web);
    poller = new Poller(id => demo ? Promise.resolve(demoReading(id)) : providers.read(id), publish,Date.now,(id,reading,time)=>{usageHistory.record(id,reading,time,id==='claude'?600000:120000);petGrowth.record(id,reading,time);});if(!demo)poller.setMinimumInterval('claude',900000);
    if(!demo){try{const limits=JSON.parse(readFileSync(path.join(app.getPath('userData'),'provider-cooldowns.json'),'utf8'));if(web&&limits.claude?.source!=='claude-web-v1')delete limits.claude;poller.restoreRateLimits(limits);}catch{/* No prior cooldowns. */}}
    connections = new Connections(providers, poller, openAuthUrl, publish, () => {
      if (!quitting && win && !win.isDestroyed()) { setExpanded(true); win.show(); win.focus(); }
    });
    accounts=new Accounts(path.join(app.getPath('userData'),demo?'demo-claude-accounts':'claude-accounts'),directory=>{
      const service=new Providers(new Gemini(new GeminiVault(app.getPath('userData'),safeStorage)),()=>settings.googleSource,directory,demo?undefined:new ClaudeWebSession(path.join(directory,'web-quota'),t));
      if(demo)service.read=async()=>demoReading('claude');
      return service;
    },openAuthUrl,publish,()=>{if(!quitting&&win&&!win.isDestroyed()){setExpanded(true);win.show();win.focus();}},(id,reading,time)=>{usageHistory.record(id,reading,time,600000);petGrowth.record(id,reading,time);});
    morningHello=new MorningHello(path.join(app.getPath('userData'),demo?'demo-morning-hello.json':'morning-hello.json'),async id=>{
      if(demo)throw new ProviderError('auth','展示模式不會送出 Hello');
      if(!settings.morningHelloEnabled||paused||(id==='claude'&&(!poller.states.claude.enabled||connections.states.claude?.pending)))throw new ProviderError('auth','Hello 已停用或帳號正在連接');
      const cwd=path.join(app.getPath('userData'),'hello-workspace');
      if(id==='claude')await providers.hello(cwd);else await accounts.hello(id,cwd);
      const timer=setTimeout(()=>{if(!quitting){if(id==='claude')void poller.refresh('claude',true);else void accounts.refreshAccount(id);}},5500);timer.unref();
    },publish);
    credentialWatch = new CredentialWatch({
      gemini: [path.join(app.getPath('userData'), 'gemini-session.bin'), path.join(homedir(), '.gemini', 'oauth_creds.json')],
    }, async (id, modifiedAt) => {
      if (!poller.states[id].enabled || connections.states[id]?.pending) return;
      const state = poller.states[id];
      if (state.status === 'ready' && state.updatedAt && Date.parse(state.updatedAt) >= modifiedAt) return;
      await poller.authenticated(id);
      if (poller.states[id].status === 'ready') { connections.states[id] = { pending: false, phase: 'ready', message: '已偵測到登入更新，配額已自動同步' }; publish(); }
    });
    for (const id of providerIds) poller.states[id].enabled = settings.enabled[id];
    const area = screen.getPrimaryDisplay().workArea;
    win = new BrowserWindow({ width: 464, height: 76, x: settings.x ?? Math.round(area.x + (area.width - 464) / 2), y: settings.y ?? area.y + 12,
      frame: false, transparent: true, resizable: false, maximizable: false, fullscreenable: false, hasShadow: false,
      alwaysOnTop: settings.alwaysOnTop, skipTaskbar: true, show: false, title: 'Quota Pebble', icon: path.join(__dirname, 'ui/icons/quota-pebble.png'),
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
    });
    const liveFeed=!demo&&!testing;
    petMessages=new PetMessages(
      path.join(app.getPath('userData'),demo?'demo-pet-messages.json':'pet-messages.json'),
      publish,undefined,Date.now,liveFeed,liveFeed?new RssTitleTranslator():undefined
    );
    petMessageWindow=new PetMessageWindow(win,id=>petMessages.acknowledge(id),()=>!!taskBubble?.isVisible);
    taskBubble=new TaskBubble(win,id=>{setExpanded(true);win.show();win.webContents.send('task-focus',id);},(kind,provider,stage)=>diagnostics?.taskNotice(kind,provider,stage));taskBubble.configure(settings.locale,settings.taskCompletionNotifications);
    win.setMenu(null); reposition();
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    win.on('close', event => { if (!quitting) { event.preventDefault(); win.hide(); } });
    win.on('will-move',()=>{win.webContents.send('pet-suspend','drag');expectedBounds=undefined;settings.dock=undefined;userDragging=true;});
    win.on('hide',()=>win.webContents.send('pet-suspend','hide'));
    win.on('show',()=>{maintainTop();win.webContents.send('pet-suspend','resume');});
    win.on('blur',()=>{setTimeout(maintainTop,100);});
    win.on('restore',maintainTop);
    topTimer=setInterval(maintainTop,2000);
    win.on('move',()=>{
      const b=win.getBounds();if(expectedBounds&&b.x===expectedBounds.x&&b.y===expectedBounds.y)return;
      if(process.platform==='win32'&&userDragging)return;
      clearTimeout(dragTimer);dragTimer=setTimeout(()=>{userDragging=false;settlePosition();reposition();win.webContents.send('pet-suspend','resume');},180);
    });
    win.on('moved',()=>{if(process.platform==='win32'){clearTimeout(dragTimer);userDragging=false;settlePosition();reposition();}win.webContents.send('pet-suspend','resume');});
    screen.on('display-metrics-changed', reposition);
    screen.on('display-removed', reposition);
    installHandlers(); makeTray();
    globalShortcut.register('CommandOrControl+Alt+Q', () => { win.isVisible() ? win.hide() : win.show(); });
    powerMonitor.on('suspend', () => { paused = true; publish(); });
    powerMonitor.on('resume', () => { paused = false; publish(); void poller.tick(); });
    await win.loadFile(path.join(__dirname, 'ui/index.html'));
    if((settings.compactTaskSummary||settings.taskCompletionNotifications)&&!demo)void taskMonitor.start();
    win.show();petMessages.start();
    if (!demo) await credentialWatch.scan();
    void poller.tick();
    void accounts.tick();
    if(!demo&&!testing)autoReconnect=new AutoReconnect(path.join(app.getPath('userData'),'auto-reconnect.json'),id=>{if(id==='claude'){poller.identityChanged('claude');usageHistory.gap('claude','auth');return connections.prepareClaude();}return accounts.prepareLogin(id);});
    interval = setInterval(() => { if(!paused&&autoReconnect){const current=snapshot();void autoReconnect.check(current.providers as any,Object.values(current.auth).some((a:any)=>a?.pending)).catch(()=>{});} if (!paused) { if (!demo) void credentialWatch.scan(); if(!demo&&settings.enabled.gemini&&settings.googleSource==='antigravity'&&providers.waitingForAntigravityAccount)void poller.authenticated('gemini'); void poller.tick();void accounts.tick(); }
      if(!demo&&morningHello){const current:any=snapshot();void morningHello.tick(settings.morningHelloEnabled,settings.morningHelloTime,['claude',...current.accounts.map((a:any)=>a.id)].map((id:string)=>({id,state:current.providers[id],pending:current.auth[id]?.pending})),paused);}
    }, 5000);
  });
  app.on('before-quit', () => { quitting = true;petMessageWindow?.close();petMessages?.close(); taskBubble?.close();taskMonitor?.close();clearInterval(interval);clearInterval(topTimer); clearTimeout(dragTimer); accounts?.close();providers?.close(); globalShortcut.unregisterAll(); saveSettings(); });
  app.on('window-all-closed', () => { if (quitting) app.quit(); });
}
