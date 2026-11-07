import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { Duplex } from 'node:stream';
import { ProviderError } from './model';
const WebSocket=require('ws');
export class CodexRpc {
  private child: ChildProcessWithoutNullStreams | null = null;
  private seq = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private starting: Promise<void> | null = null;
  private websocket:any=null;
  onNotification: (method: string, params: any) => void = () => {};
  constructor(private command: () => { file: string; args: string[]; env?: NodeJS.ProcessEnv }, private transport:'standalone'|'proxy'='standalone') {}
  private async ensure() {
    if (this.starting) return this.starting;
    if (this.child) return;
    this.starting = this.start().finally(() => { this.starting = null; });
    return this.starting;
  }
  private async start() {
    const cmd = this.command();
    const child = spawn(cmd.file, [...cmd.args, 'app-server', ...(this.transport==='proxy'?['proxy']:[])], { windowsHide: true, stdio: 'pipe', env: cmd.env ?? process.env });
    this.child = child;
    const receive=(line:string) => {
      let m: any; try { m = JSON.parse(line); } catch { return; }
      if (m.id != null && this.pending.has(m.id)) {
        const p = this.pending.get(m.id)!; this.pending.delete(m.id); clearTimeout(p.timer);
        m.error ? p.reject(new ProviderError('network', 'Codex 介面拒絕請求；請確認 CLI 版本與登入狀態')) : p.resolve(m.result);
      } else if (m.method && m.id == null) this.onNotification(m.method, m.params);
      else if (m.id != null && m.method) {
        // Never grant tool execution or other server requests in this read-only client.
        this.write({ id: m.id, error: { code: -32601, message: 'Read-only quota client' } });
      }
    };
    const rl=this.transport==='standalone'?createInterface({input:child.stdout}):null;
    rl?.on('line',receive);
    child.stderr.resume(); // Drain diagnostics without persisting credentials or raw provider output.
    child.stdin.on('error', () => this.disconnected(child)); // A rejected proxy may close before initialize is written (EPIPE).
    child.on('error', () => this.disconnected(child));
    child.on('exit', () => { rl?.close(); this.disconnected(child); });
    try {
      if(this.transport==='proxy'){
        // `proxy` forwards raw Unix-socket bytes. The socket speaks WebSocket,
        // not JSONL; perform HTTP Upgrade before sending JSON-RPC.
        const stream=new Duplex({read(){},write(b,encoding,callback){child.stdin.write(b,encoding,callback);},destroy(error,callback){child.kill();callback(error);}});
        child.stdout.on('data',b=>{if(!stream.destroyed)stream.push(b);});child.stdout.on('end',()=>{if(!stream.destroyed)stream.push(null);});
        stream.on('error',()=>this.disconnected(child));
        const ws=new WebSocket('ws://localhost/',{createConnection:()=>stream,handshakeTimeout:5000,maxPayload:8*1024*1024});this.websocket=ws;
        ws.on('message',(b:Buffer)=>receive(b.toString('utf8')));
        ws.on('error',()=>this.disconnected(child));ws.on('close',()=>this.disconnected(child));
        await new Promise<void>((resolve,reject)=>{ws.once('open',resolve);ws.once('error',()=>reject(new ProviderError('network','Codex 本機 Runtime 未連接')));ws.once('close',()=>reject(new ProviderError('network','Codex 本機 Runtime 連線已關閉')));});
      }
      await this.send('initialize', { clientInfo: { name: 'quota_island', title: 'Quota Island', version: '0.1.0' } });
      this.write({ method: 'initialized' });
    } catch (e) { child.kill(); throw e; }
  }
  private disconnected(child: ChildProcessWithoutNullStreams) {
    if (this.child !== child) return;
    this.child = null;
    const ws=this.websocket;this.websocket=null;ws?.terminate();
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new ProviderError('missing_cli', 'Codex CLI 未安裝或已關閉，請安裝官方 Codex CLI')); }
    this.pending.clear();
  }
  private write(message:any,callback?:(error?:Error|null)=>void){
    const text=JSON.stringify(message);
    if(this.transport==='proxy'){if(this.websocket?.readyState===WebSocket.OPEN)this.websocket.send(text,callback);else callback?.(new Error('Disconnected'));}
    else this.child?.stdin.write(text+'\n',callback);
  }
  private send(method: string, params?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new ProviderError('network', 'Codex 回應逾時')); }, 20_000);
      this.pending.set(id, { resolve, reject, timer });
      const child = this.child;
      if (!child || child.stdin.destroyed) { clearTimeout(timer); this.pending.delete(id); reject(new ProviderError('missing_cli', '找不到可使用的 Codex CLI')); return; }
      this.write({ id, method, ...(params === undefined ? {} : { params }) }, err => {
        if (err) { clearTimeout(timer); this.pending.delete(id); reject(new ProviderError('network', 'Codex 連線中斷')); }
      });
    });
  }
  async call(method: string, params?: any) { await this.ensure(); return this.send(method, params); }
  close() { const child=this.child;child?.kill();if(child)this.disconnected(child); }
}
