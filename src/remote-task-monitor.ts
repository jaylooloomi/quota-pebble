import {retryDelay} from './http';
import {CompletionTracker,TaskCompletion} from './task-completion';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import type {TaskRow,TaskStatus} from './task-monitor';
const WebSocket:any=require('ws');
const ORIGIN='https://chatgpt.com',BASE=ORIGIN+'/backend-api';
const clean=(v:any,n=160)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,n):'';
const hash=(v:string)=>crypto.createHash('sha256').update(v).digest('base64url');
export function validateEnrollment(e:any){
  if(e?.algorithm!=='ecdsa_p256_sha256')throw Error('ENROLLMENT_ALGORITHM_UNSUPPORTED');
  const prefix=e.protectionClass==='hardware_tpm'?'tpm':e.protectionClass==='os_protected_nonextractable'?'osn':null;
  if(!prefix)throw Error('ENROLLMENT_PROTECTION_UNSUPPORTED');
  if(typeof e.keyId!=='string'||e.keyId.length!==50||!new RegExp('^dk_'+prefix+'_[A-Za-z0-9_-]{43}$').test(e.keyId))throw Error('ENROLLMENT_KEY_FORMAT_UNSUPPORTED');
  if(typeof e.clientId!=='string'||!e.clientId||typeof e.accountUserId!=='string'||!e.accountUserId||typeof e.publicKeySpkiDerBase64!=='string'||!e.publicKeySpkiDerBase64)throw Error('ENROLLMENT_INVALID');
  return e;
}
export const remoteErrorCode=(error:unknown)=>error instanceof Error&&/^[A-Z_0-9]+$/.test(error.message)?error.message:(error as any)?.code==='ENOENT'?'LOCAL_STATE_MISSING':(error as any)?.code==='EACCES'?'LOCAL_STATE_DENIED':'REMOTE_UNAVAILABLE';
export type RemoteHostHealth={id:string;name:string;online:boolean;state:'ready'|'unconfirmed'|'offline'|'error';error:string;counts:Record<TaskStatus,number>;checkedAt:number};
function readJson(file:string,max:number){if(fs.statSync(file).size>max)throw Error('LOCAL_STATE_LIMIT');return JSON.parse(fs.readFileSync(file,'utf8'));}
export function remoteStatus(value:any):TaskStatus {
  if(value?.type==='idle')return 'idle';
  if(value?.type==='active'){const flags=value.activeFlags;if(!Array.isArray(flags))return 'unknown';if(flags.some((f:any)=>f==='waitingOnApproval'||f==='waitingOnUserInput'))return 'waiting';return flags.length?'unknown':'running';}
  return 'unknown';
}
export function remoteRow(thread:any,env:string,host:string,now:number):TaskRow|null {
  if(typeof thread?.id!=='string'||!/^[-\w]{1,128}$/.test(thread.id)||thread.parentThreadId)return null;
  const time=typeof thread.updatedAt==='number'?thread.updatedAt*1000:null;
  return {id:env+':'+thread.id,provider:'codex',title:clean(thread.name)||'Codex session',project:clean(thread.cwd,512),host:clean(host,60),source:'remote',status:remoteStatus(thread.status),confirmedAt:time!==null&&time>0&&time<=now+1000?time:null,observedAt:now};
}
export function publicSpki(encoded:string){
  const b=Buffer.from(encoded,'base64');if(b.length!==72||b.readUInt32LE(0)!==0x31534345||b.readUInt32LE(4)!==32)throw Error('INVALID_PUBLIC_KEY');
  return crypto.createPublicKey({key:{kty:'EC',crv:'P-256',x:b.subarray(8,40).toString('base64url'),y:b.subarray(40).toString('base64url')},format:'jwk'}).export({type:'spki',format:'der'}).toString('base64');
}
export function derSignature(b:Buffer){
  if(b.length!==64)throw Error('INVALID_SIGNATURE');const integer=(v:Buffer)=>{while(v.length>1&&v[0]===0)v=v.subarray(1);if(v[0]!&128)v=Buffer.concat([Buffer.from([0]),v]);return Buffer.concat([Buffer.from([2,v.length]),v]);};
  const body=Buffer.concat([integer(b.subarray(0,32)),integer(b.subarray(32))]);return Buffer.concat([Buffer.from([48,body.length]),body]);
}
export function validateChallenge(c:any,e:any,phase:'refresh'|'socket',token?:string,expires?:number,scopes?:string[]){
  const socket=phase==='socket',origin=socket?c?.targetOrigin:c?.target_origin,target=socket?c?.targetPath:c?.target_path;
  const client=socket?c?.clientId:c?.client_id,account=socket?c?.accountUserId:c?.account_user_id;
  if(origin!==ORIGIN||target!=='/backend-api/codex/remote/control/client'+(socket?'':'/refresh/finish')||client!==e.clientId||account!==e.accountUserId||typeof c.nonce!=='string'||!/^[\w-]{43,256}$/.test(c.nonce))throw Error('CHALLENGE_MISMATCH');
  if(socket){if(c.type!=='device_key_challenge'||c.audience!=='remote_control_client_websocket'||c.purpose!=='remote_control_client_websocket'||c.tokenSha256Base64url!==hash(token!)||c.tokenExpiresAt!==expires||JSON.stringify(c.scopes)!==JSON.stringify(scopes)||typeof c.sessionId!=='string')throw Error('CHALLENGE_MISMATCH');}
  else {const expiry=typeof c.challenge_expires_at==='number'?c.challenge_expires_at*1000:Date.parse(c.challenge_expires_at);if(c.audience!=='remote_control_client_enrollment'||!Number.isFinite(expiry)||expiry<=Date.now()||expiry>Date.now()+600000)throw Error('CHALLENGE_EXPIRED');}
}
async function cng(e:any,payload?:Buffer){
  const helper=path.join(__dirname,'native','enrolled-device-key.exe').replace('app.asar'+path.sep,'app.asar.unpacked'+path.sep);
  return new Promise<any>((resolve,reject)=>{
    const child=spawn(helper,[],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='',done=false;const finish=(error?:Error,value?:any)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value);};
    const timer=setTimeout(()=>{child.kill();finish(Error('SIGNER_TIMEOUT'));},12000);child.stderr.resume();child.stdin.on('error',()=>{});
    child.stdout.on('data',b=>{output+=b;if(output.length>16384){child.kill();finish(Error('SIGNER_LIMIT'));}});
    child.on('error',()=>finish(Error('SIGNER_UNAVAILABLE')));child.on('close',code=>{if(code!==0)return finish(Error('SIGNER_FAILED'));try{finish(undefined,JSON.parse(output.replace(/^\uFEFF/,'')));}catch{finish(Error('SIGNER_RESPONSE'));}});
    child.stdin.end(JSON.stringify({keyId:e.keyId,protectionClass:e.protectionClass,action:payload?'sign':'public',...(payload?{payloadBase64:payload.toString('base64')}:{})}));
  });
}
async function sign(e:any,payload:any){
  const bytes=Buffer.from(JSON.stringify({domain:'codex-device-key-sign-payload/v1',payload})),raw=await cng(e,bytes),signature=derSignature(Buffer.from(raw.signatureP1363Base64,'base64'));
  const publicKey=crypto.createPublicKey({key:Buffer.from(e.publicKeySpkiDerBase64,'base64'),format:'der',type:'spki'});
  if(!crypto.verify('sha256',bytes,publicKey,signature))throw Error('SIGNATURE_MISMATCH');
  return {algorithm:e.algorithm,signatureDerBase64:signature.toString('base64'),signedPayloadBase64:bytes.toString('base64')};
}
type Stream={env:string;id:string;seq:number};
export class Controller {
  private ws:any;private pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:NodeJS.Timeout;env:string;stream:string}>();
  private streams=new Map<string,Stream>();private nextId=0;private authenticated=false;private closed=false;private expiry=0;private chunks=new Map<string,{parts:Map<number,Buffer>;size:number;count:number;time:number}>();
  private headers:any;private enrollment:any;private authFingerprint='';private socketReady?:Promise<void>;private resolveReady?:()=>void;private rejectReady?:(e:Error)=>void;
  constructor(private root:string,private lost:()=>void){}
  get usable(){return this.authenticated&&this.ws?.readyState===1&&Date.now()<this.expiry-30000;}
  async request(route:string,method='GET',body?:any){
    if(!(method==='GET'&&route==='/codex/remote/control/environments?limit=100')&&!(method==='POST'&&['/codex/remote/control/client/refresh/start','/codex/remote/control/client/refresh/finish'].includes(route)))throw Error('INVALID_ROUTE');
    const response=await fetch(BASE+route,{method,headers:this.headers,...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(12000)});
    if(!response.ok){const wait=response.status===429?retryDelay(response.headers.get('retry-after')):0;await response.body?.cancel();throw Object.assign(Error('REMOTE_HTTP_'+response.status),{retryAfterMs:wait});}
    const reader=response.body?.getReader();if(!reader)throw Error('EMPTY_RESPONSE');let length=0;const chunks:Uint8Array[]=[];
    for(;;){const v=await reader.read();if(v.done)break;length+=v.value.length;if(length>2097152){await reader.cancel();throw Error('RESPONSE_LIMIT');}chunks.push(v.value);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  async connect(){
    const auth=readJson(path.join(this.root,'auth.json'),262144).tokens;
    if(typeof auth?.access_token!=='string')throw Error('AUTH_REQUIRED');
    const fingerprint=hash(JSON.stringify([auth.access_token,auth.account_id]));if(this.usable&&fingerprint===this.authFingerprint)return;
    if(this.authFingerprint&&fingerprint!==this.authFingerprint)this.lost();this.disconnect();this.closed=false;
    const state=readJson(path.join(this.root,'.codex-global-state.json'),8388608);
    const claims=JSON.parse(Buffer.from(auth.access_token.split('.')[1],'base64url').toString()),ids=claims['https://api.openai.com/auth']||{};
    const enrollments=Object.values(state['electron-remote-control-client-enrollments']||{});this.enrollment=enrollments.find((e:any)=>[ids.chatgpt_account_user_id,ids.account_user_id,ids.user_id,claims.sub].filter(Boolean).includes(e?.accountUserId));
    if(!this.enrollment)throw Error(enrollments.length?'ACCOUNT_NOT_ENROLLED':'ENROLLMENT_REQUIRED');
    const e=validateEnrollment(this.enrollment);
    const pub=await cng(e);if(pub.exportPolicy!==0||pub.protectionClass!==e.protectionClass||pub.keyId!==e.keyId||publicSpki(pub.publicBlobBase64)!==e.publicKeySpkiDerBase64)throw Error('PUBLIC_KEY_MISMATCH');
    if(this.closed)throw Error('CLOSED');
    this.headers={Authorization:'Bearer '+auth.access_token,'ChatGPT-Account-ID':auth.account_id,'User-Agent':'Quota-Pebble','originator':'quota_pebble','Content-Type':'application/json'};
    const start=await this.request('/codex/remote/control/client/refresh/start','POST',{client_id:e.clientId}),c=start.device_key_challenge;
    if(this.closed)throw Error('CLOSED');
    if(start.client_id!==e.clientId||start.account_user_id!==e.accountUserId)throw Error('ACCOUNT_MISMATCH');validateChallenge(c,e,'refresh');
    const identity={algorithm:e.algorithm,keyId:e.keyId,protectionClass:e.protectionClass,publicKeySpkiDerBase64:e.publicKeySpkiDerBase64};
    const proof=await sign(e,{accountUserId:c.account_user_id,audience:c.audience,challengeExpiresAt:c.challenge_expires_at,challengeId:c.challenge_id,clientId:c.client_id,deviceIdentitySha256Base64url:hash(JSON.stringify(identity)),nonce:c.nonce,targetOrigin:c.target_origin,targetPath:c.target_path,type:'remoteControlClientEnrollment'});
    if(this.closed)throw Error('CLOSED');
    const r=await this.request('/codex/remote/control/client/refresh/finish','POST',{client_id:e.clientId,device_key_proof:{challenge_token:c.challenge_token,key_id:e.keyId,signature_der_base64:proof.signatureDerBase64,signed_payload_base64:proof.signedPayloadBase64,algorithm:proof.algorithm}});
    if(this.closed)throw Error('CLOSED');
    this.expiry=Date.parse(r.expires_at);if(r.client_id!==e.clientId||r.account_user_id!==e.accountUserId||!Number.isFinite(this.expiry)||this.expiry<=Date.now()+30000||JSON.stringify(r.scopes)!==JSON.stringify(['remote_control_controller_websocket']))throw Error('TOKEN_MISMATCH');
    this.socketReady=new Promise((resolve,reject)=>{this.resolveReady=resolve;this.rejectReady=reject;});
    const ws=this.ws=new WebSocket('wss://chatgpt.com/backend-api/codex/remote/control/client',{headers:{...this.headers,'x-codex-client-session-token':'Bearer '+r.remote_control_token,'x-codex-client-id':e.clientId,'x-codex-protocol-version':'3'},maxPayload:2097152,handshakeTimeout:12000,perMessageDeflate:false});
    let first=true,frameStart=Date.now(),frames=0;const timeout=setTimeout(()=>{if(this.ws===ws)this.fail();},15000);
    ws.on('error',()=>{if(this.ws===ws)this.fail();});ws.on('close',()=>{if(this.ws===ws)this.fail();});
    ws.on('message',(bytes:Buffer)=>{if(this.ws!==ws)return;void(async()=>{
      if(Date.now()-frameStart>1000){frameStart=Date.now();frames=0;}if(++frames>500||bytes.length>2097152)throw Error('FRAME_LIMIT');const v=JSON.parse(bytes.toString());
      if(first){first=false;validateChallenge(v,e,'socket',r.remote_control_token,Math.floor(this.expiry/1000),r.scopes);const proof=await sign(e,{accountUserId:v.accountUserId,audience:v.audience,clientId:v.clientId,nonce:v.nonce,scopes:r.scopes,sessionId:v.sessionId,targetOrigin:v.targetOrigin,targetPath:v.targetPath,tokenExpiresAt:v.tokenExpiresAt,tokenSha256Base64url:v.tokenSha256Base64url,type:'remoteControlClientConnection'});if(this.ws!==ws||ws.readyState!==1)throw Error('CLOSED');ws.send(JSON.stringify({type:'device_key_proof',keyId:e.keyId,...proof}));this.authenticated=true;clearTimeout(timeout);this.resolveReady?.();return;}
      this.receive(v);
    })().catch(()=>{clearTimeout(timeout);this.fail();});});
    try{await this.socketReady;this.authFingerprint=fingerprint;}finally{clearTimeout(timeout);}
  }
  private receive(v:any){
    if(v.client_id&&v.client_id!==this.enrollment.clientId)return;
    if(v.type==='server_message_chunk'){
      if(!Number.isInteger(v.segment_count)||v.segment_count<1||v.segment_count>64||!Number.isInteger(v.segment_id)||v.segment_id<0||v.segment_id>=v.segment_count||!Number.isInteger(v.message_size_bytes)||v.message_size_bytes>2097152)throw Error('CHUNK_LIMIT');
      const key=JSON.stringify([v.env_id,v.stream_id,v.seq_id]);for(const [k,a] of this.chunks)if(Date.now()-a.time>12000)this.chunks.delete(k);
      if(!this.chunks.has(key)){if(this.chunks.size>=4)throw Error('CHUNK_LIMIT');this.chunks.set(key,{parts:new Map(),size:v.message_size_bytes,count:v.segment_count,time:Date.now()});}
      const a=this.chunks.get(key)!;if(a.size!==v.message_size_bytes||a.count!==v.segment_count)throw Error('CHUNK_MISMATCH');const b=Buffer.from(v.message_chunk_base64,'base64');if(b.length>153600)throw Error('CHUNK_LIMIT');a.parts.set(v.segment_id,b);
      if([...a.parts.values()].reduce((n,b)=>n+b.length,0)>a.size)throw Error('CHUNK_LIMIT');if(a.parts.size!==a.count)return;
      const all=Buffer.concat(Array.from({length:a.count},(_,i)=>a.parts.get(i)!));this.chunks.delete(key);if(all.length!==a.size)throw Error('CHUNK_SIZE');v={...v,type:'server_message',message:JSON.parse(all.toString())};
    }
    // A host can reject initialization via a notification instead of an RPC
    // error response. Bind it to the exact environment/stream, and do not
    // mistake ordinary task error notifications for transport failures.
    if(v.type==='server_message'&&v.message?.method==='error'&&v.message.params?.error?.message==='Remote environment is not paired for this client'){
      for(const [id,p] of this.pending)if(p.env===v.env_id&&p.stream===v.stream_id){this.pending.delete(id);clearTimeout(p.timer);p.reject(Error('REMOTE_HOST_NOT_PAIRED'));}
      return;
    }
    // Only RPC replies are retained. No transcript notifications, output logs or ack feedback loops.
    if(v.type!=='server_message')return;const m=v.message,p=this.pending.get(m?.id);if(!p||p.env!==v.env_id||p.stream!==v.stream_id)return;
    this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error('REMOTE_RPC_ERROR')):p.resolve(m.result);
  }
  async rpc(env:string,method:string,params:any){
    if(!['initialize','thread/list','thread/read','thread/turns/list'].includes(method))throw Error('METHOD_NOT_ALLOWED');
    if(method==='thread/read'&&params?.includeTurns===true)throw Error('TURN_ITEMS_NOT_ALLOWED');
    if(method==='thread/turns/list'&&(params?.itemsView!=='notLoaded'||params?.limit!==1||params?.sortDirection!=='desc'))throw Error('INVALID_TURN_QUERY');
    if(!this.usable)throw Error('DISCONNECTED');let stream=this.streams.get(env);
    if(!stream){stream={env,id:crypto.randomUUID(),seq:0};this.streams.set(env,stream);try{await this.rpc(env,'initialize',{clientInfo:{name:'quota_pebble',version:'1.20.0'},capabilities:{experimentalApi:true}});this.send(stream,{method:'initialized',params:{}});}catch(e){this.streams.delete(env);throw e;}}
    const timeoutCode=({initialize:'RPC_INITIALIZE_TIMEOUT','thread/list':'RPC_LIST_TIMEOUT','thread/read':'RPC_READ_TIMEOUT','thread/turns/list':'RPC_TURN_METADATA_TIMEOUT'} as Record<string,string>)[method];
    const id=++this.nextId;return new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error(timeoutCode));},12000);this.pending.set(id,{resolve,reject,timer,env,stream:stream!.id});try{this.send(stream!,{id,method,params});}catch{clearTimeout(timer);this.pending.delete(id);reject(Error('DISCONNECTED'));}});
  }
  private send(s:Stream,message:any){this.ws.send(JSON.stringify({type:'client_message',client_id:this.enrollment.clientId,env_id:s.env,stream_id:s.id,seq_id:++s.seq,skip_history:false,message}));}
  heartbeat(){if(this.usable)for(const s of this.streams.values())this.ws.send(JSON.stringify({type:'ping',client_id:this.enrollment.clientId,env_id:s.env,stream_id:s.id,seq_id:++s.seq,state:'foreground',skip_history:true}));}
  private fail(){if(this.closed)return;this.disconnect();this.lost();}
  disconnect(){this.closed=true;this.authenticated=false;this.rejectReady?.(Error('DISCONNECTED'));this.rejectReady=undefined;this.resolveReady=undefined;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('DISCONNECTED'));}this.pending.clear();this.chunks.clear();const ws=this.ws;this.ws=undefined;if(ws?.readyState===1){try{for(const s of this.streams.values())ws.send(JSON.stringify({type:'client_closed',client_id:this.enrollment.clientId,env_id:s.env,stream_id:s.id,seq_id:++s.seq}));ws.close();setTimeout(()=>ws.terminate(),500).unref();}catch{ws.terminate();}}else ws?.terminate();this.streams.clear();}
}
export class RemoteTaskMonitor {
  private completions=new CompletionTracker();private controller:Controller;private rows:TaskRow[]=[];private hosts:RemoteHostHealth[]=[];private busy=false;private closed=false;private timer?:NodeJS.Timeout;private retryAt=0;private failures=0;private checkedAt:number|null=null;private available=false;private partial=false;private error='';
  constructor(private root:string,private changed:()=>void,private completed?:(value:TaskCompletion)=>void){this.controller=new Controller(root,()=>{this.invalidate();this.changed();});}
  private counts(rows:TaskRow[]){return Object.fromEntries(['running','waiting','idle','unknown'].map(s=>[s,rows.filter(r=>r.status===s).length])) as Record<TaskStatus,number>;}
  private invalidate(reason='DISCONNECTED'){this.completions.reset();this.available=false;this.rows=this.rows.map(r=>({...r,status:'unknown'}));this.hosts=this.hosts.map(h=>({...h,state:'error',error:reason,counts:{running:0,waiting:0,idle:0,unknown:Object.values(h.counts).reduce((a,b)=>a+b,0)}}));}
  snapshot(){if(this.checkedAt&&Date.now()-this.checkedAt>65000)this.invalidate('STALE');const now=Date.now();return {rows:this.rows.map(r=>r.observedAt&&now-r.observedAt>65000?{...r,status:'unknown' as const}:r),available:this.available,controllerConnected:this.controller.usable,partial:this.partial,checkedAt:this.checkedAt,error:this.error,retryAt:this.retryAt,checking:this.busy,hosts:this.hosts.map(h=>({...h,counts:{...h.counts}}))};}
  start(force=false){if(this.closed)return Promise.resolve();if(!this.timer){this.timer=setInterval(()=>void this.tick(),30000);this.timer.unref();}return this.tick(force);}
  async tick(force=false){
    // User recheck may re-read repaired local authorization, but never skip server rate-limit cooldown.
    if(this.closed||this.busy||Date.now()<this.retryAt&&(!force||this.error==='REMOTE_HTTP_429'))return;this.busy=true;
    try{
      await this.controller.connect();if(this.closed)return;
      const state=readJson(path.join(this.root,'.codex-global-state.json'),8388608),local=state['electron-local-remote-control-environment-id'];
      const catalog=await this.controller.request('/codex/remote/control/environments?limit=100'),environments=(catalog.items||[]).filter((e:any)=>e.env_id!==local&&/^env_[-\w]+$/.test(e.env_id));
      const rows:TaskRow[]=[],hosts:RemoteHostHealth[]=[];let partial=!!catalog.cursor||environments.length>5;
      for(const env of environments.slice(0,5)){
        if(this.closed)return;
        const host:RemoteHostHealth={id:env.env_id,name:clean(env.display_name||env.host_name||env.name,80)||'Codex PC',online:env.online===true,state:'ready',error:'',counts:{running:0,waiting:0,idle:0,unknown:0},checkedAt:Date.now()},hostRows:TaskRow[]=[];
        const previous=this.rows.filter(r=>r.id.startsWith(env.env_id+':'));
        if(!env.online){this.completions.reset();hostRows.push(...previous.map(r=>({...r,status:'unknown' as const})));host.state='offline';host.error='HOST_OFFLINE';partial=true;}
        else try{
          const list=await this.controller.rpc(env.env_id,'thread/list',{limit:30,sortKey:'updated_at',sortDirection:'desc'});partial=partial||!!list.nextCursor;
          if(!Array.isArray(list.data))throw Error('UNSUPPORTED_SCHEMA');
          const deadline=Date.now()+20000;
          const candidates=[...list.data].sort((a,b)=>Number(['active'].includes(b.status?.type))-Number(['active'].includes(a.status?.type))).slice(0,30);
          for(const t of candidates){
            if(this.closed)return;
            let row=remoteRow(t,env.env_id,host.name,Date.now());if(!row)continue;
            try{if(Date.now()>deadline)throw Error('SCAN_BUDGET');const read=await this.controller.rpc(env.env_id,'thread/read',{threadId:t.id,includeTurns:false});row=remoteRow(read.thread,env.env_id,host.name,Date.now());if(!row)throw Error('UNSUPPORTED_SCHEMA');}catch(e){if(row)row={...row,status:'unknown'};partial=true;host.error=remoteErrorCode(e);}
            if(row){
              const prior=previous.find(r=>r.id===row!.id);
              if(row.status==='unknown')this.completions.reset();
              if(this.completed&&row.status!=='unknown'&&(['running','waiting'].includes(row.status)||prior&&['running','waiting'].includes(prior.status))){
                try{if(Date.now()>deadline)throw Error('SCAN_BUDGET');const result=await this.controller.rpc(env.env_id,'thread/turns/list',{threadId:t.id,limit:1,sortDirection:'desc',itemsView:'notLoaded'});const turn=result.data?.[0];
                  if(typeof turn?.id==='string'&&/^[\w-]{1,128}$/.test(turn.id)&&['inProgress','completed','interrupted','failed'].includes(turn.status)){
                    const item=this.completions.observe(row,turn.id,turn.status,Date.now());if(item&&!this.closed)this.completed(item);
                  }
                }catch{this.completions.reset();}
              }
              hostRows.push(row);
            }
          }
          if(host.error||hostRows.length&&hostRows.every(r=>r.status==='unknown')){host.state='unconfirmed';host.error=host.error||'RUNTIME_UNAVAILABLE';partial=true;}
        }catch(e){hostRows.push(...previous.map(r=>({...r,status:'unknown' as const})));host.state='error';host.error=remoteErrorCode(e);partial=true;}
        host.counts=this.counts(hostRows);host.checkedAt=Date.now();hosts.push(host);rows.push(...hostRows);
      }
      if(!this.closed){this.rows=rows.slice(0,100);this.hosts=hosts;this.available=this.controller.usable&&hosts.some(h=>h.state==='ready'||h.state==='unconfirmed');this.partial=partial;this.checkedAt=Date.now();this.error=hosts.length?this.available?(hosts.some(h=>h.error)?'PARTIAL_HOSTS':''):hosts[0]!.error:'NO_REMOTE_HOSTS';this.failures=0;this.retryAt=0;this.controller.heartbeat();}
    }catch(e){this.error=remoteErrorCode(e);this.invalidate(this.error);this.controller.disconnect();this.failures++;this.retryAt=Date.now()+Math.max(Number((e as any)?.retryAfterMs)||0,Math.min(300000,30000*2**Math.min(3,this.failures-1)))+Math.random()*3000;}
    finally{this.busy=false;if(!this.closed)this.changed();}
  }
  close(){this.closed=true;clearInterval(this.timer);this.invalidate();this.controller.disconnect();}
}
