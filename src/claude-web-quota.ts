import {createHash} from 'node:crypto';
import {parseClaude,ProviderError,Reading} from './model';
import {retryDelay} from './http';

export function claudeWebPlan(org:any):string|null{
  // Never infer the subscription from an organization display name.
  const tier=[org?.rate_limit_tier,org?.subscription_type,org?.plan,org?.organization_type].filter(value=>typeof value==='string').join(' ').toLowerCase();
  if(/(?:^|[_\s-])enterprise(?:$|[_\s-])/.test(tier))return 'Enterprise';
  if(/(?:^|[_\s-])teams?(?:$|[_\s-])/.test(tier))return 'Team';
  if(/(?:^|[_\s-])ultra(?:$|[_\s-])/.test(tier))return 'Ultra';
  if(/(?:^|[_\s-])max(?:$|[_\s-])/.test(tier))return 'Max';
  if(/(?:^|[_\s-])pro(?:$|[_\s-])/.test(tier))return 'Pro';
  return null;
}

// Inject an Electron Session.fetch bound to a dedicated account partition.
// Never import browser cookies or return account/session payloads to the UI.
export class ClaudeWebQuota {
  private until=0;
  private pending?:Promise<Reading>;
  private cached?:{at:number;org:string;reading:Reading};
  constructor(private fetcher:typeof fetch,private now=Date.now){}
  invalidate(){this.cached=undefined;}
  private async get(route:string):Promise<any>{
    if(!/^\/api\/(account|organizations(?:\/[a-f0-9-]{36}\/usage)?)$/.test(route))throw new ProviderError('schema','Invalid Claude web route');
    if(this.now()<this.until)throw new ProviderError('rate_limit','Claude 網頁配額查詢冷卻中',this.until-this.now());
    let response:Response;
    try{response=await this.fetcher(`https://claude.ai${route}`,{method:'GET',credentials:'include',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});}
    catch{throw new ProviderError('network','Claude 網頁配額連線失敗');}
    if(response.status===429){const delay=Math.max(15*60000,retryDelay(response.headers.get('retry-after'),this.now()));this.until=this.now()+delay;throw new ProviderError('rate_limit','Claude 網頁配額暫時限流',delay);}
    if(response.status===401)throw new ProviderError('auth','請在獨立的 Claude 登入視窗登入');
    if(response.status===403)throw new ProviderError('auth','Claude 網頁拒絕存取；請在登入視窗確認驗證或權限');
    if(!response.ok)throw new ProviderError('network',`Claude 網頁配額 HTTP ${response.status}`);
    if(!response.headers.get('content-type')?.includes('application/json'))throw new ProviderError('schema','Claude 網頁尚未提供 JSON 配額；請檢查登入視窗');
    const reader=response.body?.getReader();if(!reader)throw new ProviderError('schema','Claude 網頁回傳空資料');
    const chunks:Uint8Array[]=[];let size=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024*1024){await reader.cancel();throw new ProviderError('schema','Claude 網頁回傳超過大小限制');}chunks.push(value);}}
    catch(e){if(e instanceof ProviderError)throw e;throw new ProviderError('network','Claude 網頁回應讀取失敗');}
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ProviderError('schema','Claude 網頁回傳格式無法辨識');}
  }
  async organizations():Promise<{id:string;name:string;plan:string|null}[]>{
    const rows=await this.get('/api/organizations');if(!Array.isArray(rows))throw new ProviderError('schema','Claude 組織清單格式無法辨識');
    return rows.slice(0,50).filter(row=>typeof row?.uuid==='string'&&/^[a-f0-9-]{36}$/.test(row.uuid)).map(row=>({id:row.uuid,name:typeof row.name==='string'?row.name.slice(0,100):'Claude',plan:claudeWebPlan(row)}));
  }
  read(org:string):Promise<Reading>{
    if(!/^[a-f0-9-]{36}$/.test(org))return Promise.reject(new ProviderError('schema','Invalid Claude organization'));
    if(this.now()<this.until)return Promise.reject(new ProviderError('rate_limit','Claude 網頁配額查詢冷卻中',this.until-this.now()));
    if(this.cached?.org===org&&this.now()-this.cached.at<15*60000)return Promise.resolve(this.cached.reading);
    if(this.pending)return Promise.reject(new ProviderError('network','Claude 網頁配額查詢進行中'));
    const job=(async()=>{
      const account=await this.get('/api/account');
      const accountId=account?.uuid??account?.account?.uuid;
      if(typeof accountId!=='string'||!accountId)throw new ProviderError('schema','無法確認 Claude 網頁帳號身分');
      const orgs=await this.organizations();if(!orgs.some(row=>row.id===org))throw new ProviderError('auth','目前帳號不屬於選取的 Claude 組織');
      const data=await this.get(`/api/organizations/${org}/usage`);
      // Recheck identity before publishing, in case login switched during the request.
      const after=await this.get('/api/account');if((after?.uuid??after?.account?.uuid)!==accountId)throw new ProviderError('auth','Claude 帳號已變更，請重新確認組織');
      const reading={...parseClaude(data,orgs.find(row=>row.id===org)?.plan??null),source:'Claude 網頁 · 非公開配額端點',identityKey:createHash('sha256').update(`${accountId}:${org}`).digest('hex')};
      this.cached={at:this.now(),org,reading};return reading;
    })();this.pending=job;void job.finally(()=>{this.pending=undefined;}).catch(()=>{});return job;
  }
}
