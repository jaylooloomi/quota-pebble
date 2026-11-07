const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Providers}=require('../dist/providers');
test('known expired Claude credentials are rejected locally without a usage request or token mutation',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pebble-expired-credential-')),file=path.join(dir,'.credentials.json');
  const before=JSON.stringify({claudeAiOauth:{accessToken:'fixture-private-token',expiresAt:Date.now()-60000}});fs.writeFileSync(file,before);
  const original=global.fetch;let requests=0;global.fetch=async()=>{requests++;throw Error('Unexpected network')};const service=new Providers({close(){}},()=> 'code_assist',dir);
  try{await assert.rejects(service.read('claude'),e=>e.code==='auth'&&e.message.includes('授權已過期'));assert.equal(requests,0);assert.equal(fs.readFileSync(file,'utf8'),before);}
  finally{global.fetch=original;service.close();fs.rmSync(dir,{recursive:true,force:true});}
});
