'use strict';
const words={'zh-TW':['Codex 任務完成','查看任務 ›','本機'],en:['Codex task completed','View task ›','This PC'],ja:['Codex タスク完了','タスクを見る ›','この端末'],ko:['Codex 작업 완료','작업 보기 ›','이 기기']};
const idleWords={'zh-TW':['已閒置','狀態提醒，不代表已確認成功完成'],en:['is idle','Status update; success is not confirmed'],ja:['待機中','状態の通知です。成功完了とは限りません'],ko:['유휴 상태','상태 알림이며 성공 완료를 뜻하지 않습니다']};
const batchWords={'zh-TW':['任務更新','則','完成','閒置','另有','多台裝置','關閉','通知超過保留上限，請至任務頁查看','查看全部 ›'],en:['Task updates','items','done','idle','More','Multiple devices','Close','More notifications; view the Tasks page','View all ›'],ja:['タスク更新','件','完了','待機','ほか','複数の端末','閉じる','追加の通知はタスク画面で確認してください','すべて見る ›'],ko:['작업 업데이트','개','완료','유휴','추가','여러 기기','닫기','추가 알림은 작업 페이지에서 확인하세요','모두 보기 ›']};
const $=id=>document.getElementById(id),name=provider=>({codex:'Codex',claude:'Claude Code',antigravity:'Antigravity'}[provider]||'Codex');
let current;
function node(tag,cls,text){const e=document.createElement(tag);e.className=cls;e.textContent=text;return e;}
window.bubble.listen(data=>{
 current=data;const w=words[data.locale]||words['zh-TW'],iw=idleWords[data.locale]||idleWords['zh-TW'],bw=batchWords[data.locale]||batchWords['zh-TW'],items=data.items||[data],batch=!!data.batch,idle=!batch&&data.kind==='idle';
 document.body.classList.toggle('idle',idle);document.body.classList.toggle('batch',batch);document.querySelector('.check').hidden=batch;document.querySelector('.check').textContent=idle?'Ⅱ':'✓';$('close').setAttribute('aria-label',bw[6]);
 $('heading').textContent=batch?bw[0]+' · '+(data.overflow||items.length)+' '+bw[1]:idle?name(data.provider)+' '+iw[0]:w[0].replace('Codex',name(data.provider));
 $('title').hidden=batch;$('view').hidden=batch&&!data.overflow;$('status-note').hidden=!idle;$('status-note').textContent=idle?iw[1]:'';$('batch-list').hidden=!batch;$('batch-list').replaceChildren();
 if(batch){
  const hosts=new Set(items.map(i=>i.host||w[2]));$('host').textContent=hosts.size===1?[...hosts][0]:hosts.size>1?bw[5]:'—';$('host').title=[...hosts].join(' · ');
  $('batch-summary').hidden=false;$('batch-summary').textContent=items.filter(i=>i.kind!=='idle').length+' '+bw[2]+' / '+items.filter(i=>i.kind==='idle').length+' '+bw[3];
  for(const item of items){const row=node('div','batch-row '+(item.kind==='idle'?'is-idle':'is-completed'),''),provider=node('span','batch-provider',(item.kind==='idle'?'Ⅱ ':'✓ ')+name(item.provider)),detail=node('div','batch-detail',''),title=node('div','batch-title',item.title),host=node('div','batch-host',item.host||w[2]),view=node('button','batch-view',w[1]);view.type='button';view.dataset.taskId=item.id;view.onclick=()=>bubble.view(item.id);view.setAttribute('aria-label',name(item.provider)+' · '+item.title+' · '+w[1]);provider.title=item.kind==='idle'?iw[1]:w[0].replace('Codex',name(item.provider));title.title=item.title;host.title=item.host||w[2];detail.append(title,host);row.append(provider,detail,view);$('batch-list').append(row);}
  if(data.overflow){$('batch-list').append(node('p','overflow-note',bw[7]));$('view').textContent=bw[8];$('batch-summary').hidden=true;}
  document.querySelector('article').style.setProperty('--rows',Math.max(1,items.length));
 }else{$('title').textContent=data.title;$('title').title=data.title;$('host').textContent=data.host||w[2];$('host').title=data.host||w[2];$('view').textContent=w[1];$('batch-summary').hidden=true;}
 $('pending').hidden=!data.pending;$('pending').textContent='+'+(data.pending||0);$('pending').title=bw[4]+' '+(data.pending||0)+' '+bw[1];$('pending').setAttribute('aria-label',$('pending').title);
 const placement=data.placement||(data.above?'above':'below');document.body.dataset.placement=placement;document.body.classList.toggle('below',placement==='below');document.querySelector('article').style.setProperty('--side-tip',((data.sideTip||40)-3)+'px');document.querySelector('article').style.setProperty('--tip',(data.tip-5)+'px');
});
$('close').onclick=()=>bubble.close();$('pending').onclick=()=>bubble.close();$('view').onclick=()=>current?.overflow?bubble.view(''):bubble.view();document.documentElement.onpointerenter=()=>bubble.hover(true);document.documentElement.onpointermove=()=>bubble.hover(true);document.documentElement.onpointerleave=()=>bubble.hover(false);
