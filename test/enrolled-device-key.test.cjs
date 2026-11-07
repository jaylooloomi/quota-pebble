const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('native CNG helper rejects unsupported providers, malformed namespaces and mutations without exposing input',{skip:process.platform!=='win32'},()=>{
  const executable=path.resolve('dist/native/enrolled-device-key.exe');
  for(const input of [
    {keyId:'dk_tpm_'+'A'.repeat(43),protectionClass:'plaintext',action:'public'},
    {keyId:'dk_osn_'+'A'.repeat(43),protectionClass:'hardware_tpm',action:'public'},
    {keyId:'dk_tpm_'+'A'.repeat(43)+'\n',protectionClass:'hardware_tpm',action:'public'},
    {keyId:'../PRIVATE_VALUE',protectionClass:'hardware_tpm',action:'public'},
    {keyId:'dk_osn_'+'A'.repeat(43),protectionClass:'os_protected_nonextractable',action:'create'},
    {keyId:'dk_tpm_'+'A'.repeat(43),protectionClass:'hardware_tpm',action:'delete'},
  ]){
    const r=spawnSync(executable,[],{input:JSON.stringify(input),encoding:'utf8',timeout:5000,windowsHide:true});
    assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(r.stderr.trim(),'Pebble CNG operation failed');
  }
});
