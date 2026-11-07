// Offline capability probe. Does not read auth, private keys, transcripts or hooks.
// Usage: node scripts/research-remote-windows-readiness.cjs <official-app-resources>
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

function probe(runtime, modulePath, env = process.env) {
  const code = `try { const n=require(process.argv[1]);
    console.log(JSON.stringify({loaded:true,exports:Object.keys(n)}));
  } catch(e) { console.log(JSON.stringify({loaded:false,code:e.code||'LOAD_FAILED',
    reason:e.message.includes('Access is denied')?'Access is denied':'Native load failed'})); }`;
  const r = spawnSync(runtime, ['-e', code, modulePath], {
    env, encoding:'utf8', windowsHide:true, timeout:15000, maxBuffer:16384,
  });
  if (r.error || r.status !== 0) return {loaded:false,reason:'Runtime probe failed',exitCode:r.status};
  try { return JSON.parse(r.stdout.trim()); }
  catch { return {loaded:false,reason:'Invalid probe response'}; }
}

function main(resources) {
  if (!resources || !path.isAbsolute(resources)) throw Error('Provide an absolute official App resources directory');
  const modulePath = path.join(resources, 'native', 'remote-control-device-key.node');
  const present = fs.existsSync(modulePath);
  const report = {checkedAt:new Date().toISOString(),platform:process.platform,
    nativeModulePresent:present, networkRequests:0,privateKeysRead:false,
    authTokensRead:false,pairingChanged:false,cliStarted:false,hooksUsed:false};
  if (present) {
    report.node = probe(process.execPath, modulePath);
    report.electron = probe(require('electron'), modulePath, {...process.env,ELECTRON_RUN_AS_NODE:'1'});
  }
  report.remoteHandshakeVerified = false;
  report.remoteTaskQueryVerified = false;
  console.log(JSON.stringify(report,null,2));
}
if (require.main === module) {
  try { main(process.argv[2]); }
  catch(e) { console.error(e.message);process.exitCode=1; }
}
module.exports = {probe};
