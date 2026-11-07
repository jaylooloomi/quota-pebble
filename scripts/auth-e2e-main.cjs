// Test-only entry point, excluded from shipped application files. No real OAuth
// browser page or provider network is contacted. Exercise actual IPC, callbacks,
// encrypted storage, CLI stdin, Connections, Poller and renderer together.
const { shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { OAuth2Client } = require('google-auth-library');
const { Providers } = require('../dist/providers');
const { ClaudeLogin } = require('../dist/claude-login');
const { ProviderError, parseClaude, parseCodex } = require('../dist/model');
if (!process.argv.includes('--test-mode') || !process.env.QUOTA_TEST_DATA) throw new Error('Test isolation required');
// This fixture specifically retains coverage for the legacy authorization-code
// adapter. Web-session account isolation is exercised by test:claude-web.
Object.defineProperty(Providers.prototype,'usesClaudeWeb',{get(){return false;}});
globalThis.__AUTH_TEST_URLS = [];
shell.openExternal = async url => { globalThis.__AUTH_TEST_URLS.push(url); };
const makeClient = () => {
  const client = new OAuth2Client({ clientId:'fixture.apps.googleusercontent.com' });
  client.getToken = async ({ code }) => {
    if (code !== 'TEST-GOOGLE-CODE') throw new Error('Unexpected test code');
    return { tokens:{ access_token:'TEST-GOOGLE-NOT-REAL', refresh_token:'TEST-REFRESH-NOT-REAL', expiry_date:Date.now()+3600000 } };
  };
  client.getAccessToken = async () => ({ token:client.credentials.access_token });
  client.request = async ({ url }) => ({ data:url.endsWith(':loadCodeAssist') ? { cloudaicompanionProject:'fixture-project', currentTier:{ name:'Test' } } : { buckets:[{modelId:'gemini-test-pro',remainingFraction:.6,resetTime:'2026-11-01T00:00:00Z'}] } });
  return client;
};
const read = Providers.prototype.read;
Providers.prototype.read = async function(id) {
  if (id === 'codex') {
    if(globalThis.__AUTH_TEST_CODEX_SIGNED_OUT)throw new ProviderError('auth','請登入以讀取配額');
    return parseCodex({rateLimits:{primary:{usedPercent:globalThis.__AUTH_TEST_CODEX_SWITCHED?65:12,windowDurationMins:300}}});
  }
  if (id === 'claude') {
    if (!fs.existsSync(path.join(process.env.CLAUDE_CONFIG_DIR,'.credentials.json'))) throw new ProviderError('auth','Fixture signed out');
    return parseClaude({five_hour:{utilization:42}});
  }
  this.gemini.makeClient = makeClient;
  this.googleSource = () => 'code_assist';
  return read.call(this,id);
};
const login = Providers.prototype.login;
Providers.prototype.login = function(id, open, progress) {
  if(id==='codex')this.rpc.call=async method=>{
    if(method==='account/logout'){globalThis.__AUTH_TEST_CODEX_SIGNED_OUT=true;return {};}
    if(method!=='account/login/start')throw Error('Unexpected fixture RPC');
    globalThis.__AUTH_TEST_CODEX_COMPLETE=()=>{
      globalThis.__AUTH_TEST_CODEX_SWITCHED=true;
      globalThis.__AUTH_TEST_CODEX_SIGNED_OUT=false;
      this.rpc.onNotification('account/login/completed',{loginId:'fixture-codex-login',success:true});
    };
    return {loginId:'fixture-codex-login',authUrl:'https://auth.openai.com/authorize?state=FIXTURE-CODEX'};
  };
  if (id === 'claude'){this.claudeWeb=undefined;this.claudeLogin = new ClaudeLogin(() => ({ file:process.execPath, args:[path.join(__dirname,'../test/fixtures/claude-auth.cjs')], env:{...process.env,ELECTRON_RUN_AS_NODE:'1'} }));}
  if (id === 'gemini') { this.gemini.makeClient = makeClient; this.googleSource=()=>'code_assist'; }
  return login.call(this,id,open,progress);
};
const logout=Providers.prototype.logout;
Providers.prototype.logout=async function(id){
  if(id!=='claude')return logout.call(this,id);
  const cli=require('../dist/cli'),original=cli.findCli;
  cli.findCli=()=>({file:process.execPath,args:[path.join(__dirname,'../test/fixtures/claude-auth.cjs')],env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});
  try{return await logout.call(this,id);}finally{cli.findCli=original;}
};
require('../dist/main');
