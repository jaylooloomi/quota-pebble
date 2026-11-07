import {BrowserWindow,ipcMain,screen} from 'electron';
import path from 'node:path';
import {bubbleBounds} from './task-completion';
import {TaskNoticeQueue,TaskNotice} from './task-notice-queue';
export class TaskBubble {
  get isVisible(){return !!this.window?.isVisible();}
  private window?:BrowserWindow;private inbox=new TaskNoticeQueue();
  private timer?:NodeJS.Timeout;private collectTimer?:NodeJS.Timeout;private remaining=12000;private started=0;private hovered=false;private ready=false;
  private anchor=280;private anchors:Record<string,number>={};private closed=false;private enabled=true;private locale='zh-TW';private announced=new WeakSet<object>();
  constructor(private parent:BrowserWindow,private view:(id:string)=>void,private audit?:(kind:string,provider:string,stage:string)=>void){
    ipcMain.on('task-bubble-action',this.action);ipcMain.on('task-bubble-hover',this.hover);
    parent.on('move',this.position);parent.on('resize',this.position);parent.on('show',this.resume);parent.on('hide',this.suspend);
  }
  private report(item:TaskNotice,stage:string){this.audit?.(item.kind??'completed',item.provider,stage);}
  private action=(event:Electron.IpcMainEvent,value:unknown)=>{
    if(event.sender!==this.window?.webContents)return;
    const target=value==='view'?this.inbox.active[0]?.id:value&&typeof value==='object'&&(value as any).action==='view'&&typeof (value as any).id==='string'?(value as any).id:undefined;
    if(target!==undefined){
      if(target===''&&this.inbox.activeOverflow){this.inbox.dismiss();this.view('');this.finishSelection();return;}
      const item=this.inbox.take(target);if(!item)return;this.report(item,'viewed');this.view(item.id);this.finishSelection();
    }else if(value==='close'){for(const item of this.inbox.dismiss())this.report(item,'closed');this.next();}
  };
  private finishSelection(){if(this.inbox.hasActive){this.remaining=this.duration();this.position();this.arm();}else this.next();}
  private hover=(event:Electron.IpcMainEvent,value:unknown)=>{if(event.sender!==this.window?.webContents||typeof value!=='boolean'||this.hovered===value)return;if(value)this.pauseClock();this.hovered=value;if(!value)this.arm();};
  private pauseClock(){if(this.timer){clearTimeout(this.timer);this.timer=undefined;this.remaining=Math.max(0,this.remaining-(Date.now()-this.started));}}
  private suspend=()=>{this.pauseClock();clearTimeout(this.collectTimer);this.collectTimer=undefined;this.hovered=false;this.window?.hide();};
  private resume=()=>{if(this.closed||!this.enabled)return;if(this.inbox.hasActive){this.position();if(!this.timer)this.arm();}else this.schedule();};
  setAnchor(x:unknown){const valid=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=this.parent.getBounds().width;if(valid(x))this.anchor=x;else if(x&&typeof x==='object'){this.anchors={};for(const id of ['codex','claude','antigravity']){const value=(x as Record<string,unknown>)[id];if(valid(value))this.anchors[id]=value;}}this.position();}
  configure(locale:string,enabled:boolean){this.locale=locale;this.enabled=enabled;if(!enabled)this.clear();else this.resume();}
  enqueue(item:TaskNotice){
    if(this.closed||!this.enabled)return;
    const result=this.inbox.enqueue(item);if(result==='duplicate')return;this.report(item,'queued');
    if(result==='updated'){this.remaining=this.duration();this.position();this.arm();}else if(this.inbox.hasActive)this.position();else this.schedule();
  }
  private duration(){return this.inbox.active.length>1||this.inbox.activeOverflow?20000:12000;}
  private schedule(){clearTimeout(this.collectTimer);this.collectTimer=undefined;if(this.closed||!this.enabled||!this.parent.isVisible()||this.inbox.hasActive)return;const delay=this.inbox.delay();if(delay===null)return;this.collectTimer=setTimeout(()=>{this.collectTimer=undefined;if(this.inbox.start())this.present();else this.schedule();},delay);}
  private arm(){clearTimeout(this.timer);this.timer=undefined;if(!this.inbox.hasActive||this.hovered||!this.ready||!this.parent.isVisible())return;this.started=Date.now();this.timer=setTimeout(()=>{this.timer=undefined;for(const item of this.inbox.dismiss())this.report(item,'expired');this.next();},this.remaining);}
  private next(){clearTimeout(this.timer);this.timer=undefined;this.hovered=false;this.window?.hide();this.schedule();}
  private present(){this.hovered=false;this.remaining=this.duration();if(!this.window){
    this.window=new BrowserWindow({width:300,height:142,parent:this.parent,frame:false,transparent:true,resizable:false,show:false,focusable:false,skipTaskbar:true,hasShadow:false,alwaysOnTop:true,webPreferences:{preload:path.join(__dirname,'task-bubble-preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    this.window.setMenu(null);this.window.webContents.on('will-navigate',e=>e.preventDefault());this.window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    this.window.webContents.once('did-finish-load',()=>{if(this.closed)return;this.ready=true;this.position();this.arm();});void this.window.loadFile(path.join(__dirname,'ui/task-bubble.html'));
  }this.position();this.arm();}
  private position=()=>{
    if(!this.inbox.hasActive||!this.ready||!this.window||this.parent.isDestroyed()||!this.parent.isVisible()||!this.enabled)return;
    const items=this.inbox.active,p=this.parent.getBounds(),batch=items.length>1||this.inbox.activeOverflow>0;
    const height=batch?101+Math.max(1,items.length)*42:items[0]?.kind==='idle'?166:142;
    const b=bubbleBounds(p,screen.getDisplayMatching({...p,height:Math.min(60,p.height)}).workArea,batch?p.width/2:this.anchors[items[0]!.provider]??this.anchor,height,batch?420:300);
    this.window.setBounds({x:b.x,y:b.y,width:b.width,height:b.height});this.window.webContents.send('task-bubble-state',{...items[0],items,batch,overflow:this.inbox.activeOverflow,pending:this.inbox.waiting,locale:this.locale,above:b.above,placement:b.placement,sideTip:b.sideTip,tip:b.tip});this.window.showInactive();
    if(this.window.isVisible())for(const item of items)if(!this.announced.has(item)){this.announced.add(item);this.report(item,'shown');}
  };
  private clear=()=>{for(const item of this.inbox.active)this.report(item,'cleared');this.suspend();this.inbox.clear();};
  close(){this.closed=true;this.clear();ipcMain.removeListener('task-bubble-action',this.action);ipcMain.removeListener('task-bubble-hover',this.hover);this.parent.removeListener('move',this.position);this.parent.removeListener('resize',this.position);this.parent.removeListener('show',this.resume);this.parent.removeListener('hide',this.suspend);this.window?.destroy();}
}
