const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {operation,publicSpki,derSignature}=require('./windows-device-key.cjs');
(async()=>{
  const id='qp_osn_'+crypto.randomUUID();let created=false;
  try {
    const key=await operation('create',id);created=true;
    assert.equal(key.exportPolicy,0);assert.equal(key.protectionClass,'os_protected_nonextractable');
    const spki=publicSpki(key.publicBlobBase64),publicKey=crypto.createPublicKey({key:Buffer.from(spki,'base64'),type:'spki',format:'der'});
    const again=await operation('public',id);assert.equal(publicSpki(again.publicBlobBase64),spki,'public key survives helper restart');
    const payload=Buffer.from('Quota Pebble independent CNG signer self-test');
    for(let i=0;i<8;i++){
      const signed=await operation('sign',id,payload),der=derSignature(Buffer.from(signed.signatureP1363Base64,'base64'));
      assert.equal(crypto.verify('sha256',payload,publicKey,der),true);
      assert.equal(crypto.verify('sha256',Buffer.from('tampered'),publicKey,der),false);
    }
    await assert.rejects(operation('public','official-or-unscoped-key'));
    await assert.rejects(operation('sign',id,Buffer.alloc(16385)));
    await assert.rejects(operation('unsupported',id));
    assert.throws(()=>publicSpki(Buffer.alloc(72).toString('base64')));
    assert.throws(()=>derSignature(Buffer.alloc(63)));
    console.log('PASS Windows CNG: independent non-exportable key, persisted public key, eight signatures verified by Node, tamper rejection and scope guards');
  } finally {
    if(created){await operation('delete',id);await assert.rejects(operation('public',id));console.log('PASS self-test key deleted; no official device enrollment changed');}
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
