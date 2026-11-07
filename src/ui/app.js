'use strict';
let petDraft=null,petBusy=false;
const api=window.quota;
const ids=['claude','gemini','codex'];
const isExtra=id=>typeof id==='string'&&id.startsWith('claude-account-');
const baseId=id=>isExtra(id)?'claude':id;
function syncAccounts(next){
  const wanted=new Set(['claude','gemini','codex',...(next.accounts??[]).map(a=>a.id)]);
  for(let i=ids.length-1;i>=0;i--)if(!wanted.has(ids[i])){if(cardNodes[ids[i]]?.contains($('pace-details')))document.querySelector('.panel-body').append($('pace-details'));cardNodes[ids[i]]?.remove();delete cardNodes[ids[i]];ids.splice(i,1);}
  for(const account of next.accounts??[]){names[account.id]=account.label;subtitles[account.id]='Claude Code';if(!ids.includes(account.id))ids.push(account.id);}
  makeCards();
}
const names={claude:'Claude',gemini:'Gemini',codex:'Codex'};
const subtitles={claude:'Claude Code',gemini:'CLI / Code Assist',codex:'ChatGPT 訂閱'};
const presentation=window.QuotaPresentation;
const $=id=>document.getElementById(id);
const cardNodes={};
let state,settingsOpen=false,activeDetail=null,draggedProvider=null,suppressClickUntil=0;
let currentView='quota',confirmLogout=null,logoutBusy=null;
let footerPopover=null,syncBusy=false;
let quotaDetailsOpen=false;
let quotaDetailsProvider='gemini';
let paceDetailsProvider=null;
let quotaPanelHeight=480;
let compactClaudeId='claude',compactClaudeHovered=false,compactClaudeFocused=false,compactClaudeNext=Date.now()+5000;
function compactClaudeAccounts(){return ['claude',...(state?.settings.order??[]).filter(isExtra)].filter(id=>state?.providers[id]&&state.settings.visible?.[id]!==false);}
function advanceCompactClaude(){const accounts=compactClaudeAccounts();if(accounts.length<2)return;compactClaudeId=accounts[(Math.max(0,accounts.indexOf(compactClaudeId))+1)%accounts.length];compactClaudeNext=Date.now()+5000;renderCompactClaude();}
function renderCompactClaude(){
  if(!state)return;
  const accounts=compactClaudeAccounts(),button=document.querySelector('.compact-provider.claude');
  button.hidden=!accounts.length;
  if(!accounts.includes(compactClaudeId))compactClaudeId=accounts[0]??'claude';
  if(accounts.length)renderCompact(compactClaudeId,'claude');
  const badge=$('claude-account-count');badge.textContent=accounts.length>1?`${accounts.indexOf(compactClaudeId)+1}/${accounts.length}`:'';badge.hidden=accounts.length<2;
  button.setAttribute('aria-label',paceText(accounts.length>1?'切換下一個帳號':'展開 Claude 配額'));
  button.dataset.account=compactClaudeId;
}
const quotaCardHeights={};
function closeFooterPopover(focus=false){const trigger=footerPopover==='language'?'language-shortcut':'sync-shortcut';footerPopover=null;render(state);if(focus)$(trigger).focus();}
function openFooterPopover(kind){footerPopover=footerPopover===kind?null:kind;settingsOpen=false;render(state);if(footerPopover==='language')$('language-popover').querySelector('[aria-checked="true"]').focus();else if(footerPopover==='sync')$('sync-popover').focus();}
function setView(view){if(view==='tasks')void api.tasksStart();currentView=view;settingsOpen=false;activeDetail=null;confirmLogout=null;footerPopover=null;quotaDetailsOpen=false;paceDetailsProvider=null;render(state);}
function renderFooter(){
  const enabled=ids.map(id=>state.providers[id]).filter(s=>s.enabled);
  const busy=syncBusy||enabled.some(s=>s.status==='loading'||s.refreshing);
  for(const id of ['compact-refresh','refresh'])$(id).classList.toggle('spinning',busy);
  const failed=enabled.some(s=>['unavailable','stale','signed_out'].includes(s.status));
  const updated=enabled.map(s=>Date.parse(s.updatedAt)).filter(Number.isFinite);
  $('sync-summary').textContent=state.paused||!enabled.length?'已暫停同步':busy?'同步中':failed?'部分失敗':updated.length?elapsed(new Date(Math.min(...updated)).toISOString()):'尚未同步';
  $('sync-shortcut').title=$('sync-summary').textContent;
  for(const kind of ['language','sync']){$(`${kind}-popover`).hidden=footerPopover!==kind;$(`${kind}-shortcut`).setAttribute('aria-expanded',String(footerPopover===kind));}
  for(const button of $('language-popover').querySelectorAll('[data-locale]'))button.setAttribute('aria-checked',String(button.dataset.locale===(state.settings.locale??'zh-TW')));
  const sources=$('sync-sources');sources.replaceChildren();
  for(const id of state.settings.order??ids){
    const s=state.providers[id],entry=document.createElement('div');entry.className='sync-entry';
    const header=document.createElement('div');header.className='sync-entry-heading';
    const name=document.createElement('strong');name.textContent=names[id];if(isExtra(id))name.setAttribute('data-localized-text','');
    const status=document.createElement('span');status.textContent=!s.enabled?'已暫停':s.refreshing||s.status==='loading'?'同步中':s.status==='ready'?'已連接':s.status==='signed_out'?'未連接':'更新失敗';header.append(name,status);
    const time=document.createElement('p');time.textContent=elapsed(s.updatedAt);if(s.updatedAt){time.title=presentation.resetDate(s.updatedAt,state.settings.locale);time.setAttribute('data-localized-title','');}
    entry.append(header,time);
    if(s.error){const error=document.createElement('p');error.className='sync-error';error.textContent=s.error;entry.append(error);
      if(s.enabled&&retryLabel(s)){const retry=document.createElement('p');retry.className='sync-retry';retry.textContent=retryLabel(s);entry.append(retry);}}
    sources.append(entry);
  }
  $('sync-refresh').disabled=syncBusy||state.paused||!enabled.length;
  $('sync-refresh').textContent=syncBusy?'自動同步中…':'重新同步';
}
const previousPending=new Map();
function orderProviders(order){
  const strip=$('provider-strip');
  let compactIndex=0;
  for(const [index,id] of order.entries()){
    const button=strip.querySelector(`[data-provider="${id}"]`);
    if(button){if(strip.children[compactIndex]!==button)strip.insertBefore(button,strip.children[compactIndex]??null);compactIndex++;}
    if(!cardNodes[id])continue;
    if($('cards').children[index]!==cardNodes[id])$('cards').insertBefore(cardNodes[id],$('cards').children[index]??null);
  }
}
function moveProvider(id,target){
  if(!state||id===target)return;
  const order=[...state.settings.order],to=order.indexOf(target);
  order.splice(order.indexOf(id),1);order.splice(to,0,id);
  state.settings.order=order;orderProviders(order);api.settings({order});
}
function finishDrag(){draggedProvider=null;suppressClickUntil=Date.now()+400;document.querySelectorAll('.reordering,.reorder-target').forEach(node=>node.classList.remove('reordering','reorder-target'));}
function enableReorder(node,id,targetNode=node){
  node.draggable=true;
  node.addEventListener('dragstart',event=>{
    if(event.target.closest('button,input')&&event.target.closest('button')!==node){event.preventDefault();return;}
    draggedProvider=id;suppressClickUntil=Date.now()+600;
    event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-quota-provider',id);targetNode.classList.add('reordering');
  });
  targetNode.addEventListener('dragover',event=>{if(draggedProvider&&draggedProvider!==id){event.preventDefault();event.dataTransfer.dropEffect='move';targetNode.classList.add('reorder-target');}});
  targetNode.addEventListener('dragleave',event=>{if(!targetNode.contains(event.relatedTarget))targetNode.classList.remove('reorder-target');});
  targetNode.addEventListener('drop',event=>{if(!draggedProvider)return;event.preventDefault();moveProvider(draggedProvider,id);finishDrag();});
  node.addEventListener('dragend',finishDrag);
}
function elapsed(date){
  if(!date)return '尚未同步';
  const seconds=Math.max(0,(Date.now()-Date.parse(date))/1000);
  return seconds<60?'剛剛同步':seconds<3600?`${Math.floor(seconds/60)} 分鐘前同步`:`${Math.floor(seconds/3600)} 小時前同步`;
}
function countdown(date){
  if(!date)return '重設時間未提供';
  const remaining=Math.max(0,Date.parse(date)-Date.now());
  if(!remaining)return '已到重設時間 · 等待同步';
  const minutes=Math.ceil(remaining/60000),hours=Math.floor(minutes/60);
  if(minutes<60)return `${minutes} 分鐘後重設`;
  if(hours<24)return `${hours} 小時 ${minutes%60} 分後重設`;
  return `${Math.floor(hours/24)} 天 ${hours%24} 小時後重設`;
}
function percent(w){return Math.round(state.settings.remaining?100-w.usedPercent:w.usedPercent);}
function retryLabel(s){
  if(!s.nextPollAt||s.nextPollAt<=Date.now())return '';
  const minutes=Math.max(1,Math.ceil((s.nextPollAt-Date.now())/60000));
  return minutes>=60?`${Math.floor(minutes/60)} 小時 ${minutes%60} 分後自動重試`:`約 ${minutes} 分鐘後自動重試`;
}
function resetLabel(id,date){
  const formatted=presentation.resetDate(date,state.settings.locale);
  return formatted?countdown(date):'重設時間未提供';
}
function tone(w){return w.usedPercent>=95?'danger':w.usedPercent>=80?'warning':'';}
function ready(s){return s.enabled&&s.status==='ready'&&s.reading&&(!s.updatedAt||Date.now()-Date.parse(s.updatedAt)<24*3600000);}
function sourceFor(id){
  if(id==='gemini')return state.settings.googleSource==='antigravity'?'Antigravity 本機服務的 Gemini 模型配額；沿用 Antigravity 帳號，需保持 Antigravity 執行。這不是 Gemini 網頁版或企業 Code Assist 額度。':'企業 Code Assist OAuth 配額；個人版請選擇 Antigravity 來源。';
  return id==='codex'?'官方 Codex app-server · account/rateLimits/read。由 Codex CLI 管理 ChatGPT 帳號授權。':state.claudeQuotaSource==='web'?'使用 Chrome 登入，完成後自動關閉專用視窗並同步；每 15 分鐘更新配額。':'官方 Claude Code 管理登入，讀取本機授權後查詢 Claude OAuth 用量端點。';
}
function startLogin(id){activeDetail=id;settingsOpen=false;render(state);if(!state.auth[id]?.pending)void api.login(id);}
function makeCards(){
  for(const id of ids){
    if(cardNodes[id])continue;
    const card=$('card-template').content.firstElementChild.cloneNode(true);card.classList.add(baseId(id));card.dataset.provider=id;
    card.querySelector('h2').textContent=names[id];card.querySelector('.provider-subtitle').textContent=subtitles[id];
    const logo=document.createElement('img');logo.src=`icons/${baseId(id)}.svg`;logo.alt='';logo.draggable=false;card.querySelector('.provider-icon').append(logo);
    card.querySelector('.connection-logo').src=`icons/${baseId(id)}.svg`;
    if(isExtra(id)){
      card.querySelector('.provider-identity h2').setAttribute('data-localized-text','');
      const rename=document.createElement('button');rename.className='rename-account';rename.textContent='重新命名';
      const editor=document.createElement('form');editor.className='rename-editor';editor.hidden=true;
      const input=document.createElement('input');input.className='rename-input';input.maxLength=24;input.required=true;input.setAttribute('aria-label','Claude 帳號名稱');
      const save=document.createElement('button');save.type='submit';save.textContent='儲存';
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';
      const error=document.createElement('p');error.setAttribute('role','alert');
      rename.addEventListener('click',()=>{input.value=names[id];editor.hidden=false;error.textContent='';render(state);input.focus();input.select();});
      cancel.addEventListener('click',()=>{editor.hidden=true;render(state);});
      editor.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;try{const result=await api.renameAccount(id,input.value);if(result.ok){editor.hidden=true;render(await api.getState());}else{error.textContent=paceText(result.message);render(state);}}finally{save.disabled=false;}});
      editor.append(input,save,cancel,error);card.querySelector('.account-actions').append(rename,editor);
      const remove=document.createElement('button');remove.className='remove-account danger';remove.textContent='移除帳號';
      remove.addEventListener('click',()=>{card.querySelector('.remove-confirm').hidden=false;});
      const confirm=document.createElement('div');confirm.className='remove-confirm';confirm.hidden=true;
      const note=document.createElement('p');note.textContent='只移除此獨立帳號，不影響其他帳號。';
      const yes=document.createElement('button');yes.textContent='確認移除';yes.addEventListener('click',async()=>{await api.removeAccount(id);if(activeDetail===id)activeDetail=null;if(paceDetailsProvider===id)paceDetailsProvider=null;render(await api.getState());});
      const no=document.createElement('button');no.textContent='取消';no.addEventListener('click',()=>{confirm.hidden=true;});confirm.append(note,yes,no);card.querySelector('.account-actions').append(remove,confirm);
    }
    const heading=card.querySelector('.card-heading');heading.title='拖曳調整卡片順序';enableReorder(heading,id,card);
    const grip=document.createElement('button');grip.className='card-grip';grip.type='button';grip.title='拖曳調整卡片順序';grip.setAttribute('aria-label',`${names[id]} · 拖曳調整卡片順序`);grip.textContent='⠿';
    enableReorder(grip,id,card);card.prepend(grip);
    grip.addEventListener('keydown',event=>{if(!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key))return;const order=state.settings.order,index=order.indexOf(id),target=order[index+(event.key==='ArrowUp'?-1:1)];if(target){event.preventDefault();moveProvider(id,target);grip.focus();}});
    card.querySelector('.connection-status').addEventListener('click',()=>{activeDetail=activeDetail===id?null:id;render(state);});
    card.querySelector('.close-connection').addEventListener('click',()=>{activeDetail=null;render(state);});
      card.querySelector('.connect-primary').addEventListener('click',()=>{if(state.auth[id]?.pending){startLogin(id);return;}const s=state.providers[id];if(baseId(id)==='claude'&&s.errorCode==='rate_limit'){void api.openProvider('claude');return;}if(s.status==='unavailable'&&!/429|限制查詢|查詢頻率/.test(s.error??''))void api.refresh();else startLogin(id);});
    card.querySelector('.continue-claude-login').addEventListener('click',()=>api.continueClaudeLogin(id));
    card.querySelector('.login').addEventListener('click',()=>{if(baseId(id)==='claude'&&state.providers[id].errorCode==='rate_limit'&&!state.auth[id]?.pending){void api.openProvider('claude');return;}startLogin(id);});
    card.querySelector('.quota-details-link').addEventListener('click',()=>{window.UsageTrends.close();quotaDetailsProvider=id;quotaDetailsOpen=true;activeDetail=null;settingsOpen=false;footerPopover=null;render(state);});
    card.querySelector('.pace-link').addEventListener('click',()=>{window.UsageTrends.close();paceDetailsProvider=paceDetailsProvider===id?null:id;quotaDetailsOpen=false;activeDetail=null;footerPopover=null;render(state);});
    card.querySelector('.account-switch').addEventListener('click',async()=>{
      if(state.auth[id]?.pending){startLogin(id);return;}
      if(id==='gemini'&&state.settings.googleSource==='antigravity'){
        activeDetail=id;render(state);const result=await api.antigravityAccount('switch');
        if(!result.ok){state.auth[id]={pending:false,phase:'error',message:result.message};render(state);}
      }else startLogin(id);
    });
    card.querySelector('.account-logout').addEventListener('click',async()=>{if(id==='gemini'&&state.settings.googleSource==='antigravity'){await api.antigravityAccount('disconnect');render(await api.getState());return;}confirmLogout=id;render(state);});
    card.querySelector('.cancel-logout').addEventListener('click',()=>{confirmLogout=null;render(state);});
    card.querySelector('.confirm-logout').addEventListener('click',async()=>{
      logoutBusy=id;render(state);
      let result;
      try{result=await api.logout(id);}catch{result={ok:false,message:'登出未完成，請稍後重試'};}
      finally{logoutBusy=null;confirmLogout=null;const next=await api.getState();if(!result?.ok){next.auth[id]={pending:false,phase:'error',message:result?.message};activeDetail=id;}render(next);}
    });
    card.querySelector('.cancel-login').addEventListener('click',()=>api.cancelLogin(id));
    card.querySelector('.provider-link').addEventListener('click',()=>api.openProvider(baseId(id)));
    card.querySelector('.reopen-login').addEventListener('click',()=>api.reopenLogin(id));
    card.querySelector('.auth-code-form').addEventListener('submit',event=>{event.preventDefault();const input=card.querySelector('.auth-code'),code=input.value.trim();input.value='';if(code)api.submitCode(id,code);});
    card.querySelector('.setup-links button').addEventListener('click',()=>api.openProvider(`install-${baseId(id)}`));
    $('cards').append(card);cardNodes[id]=card;
    const miniTrack=document.createElement('span');miniTrack.className='mini-track';miniTrack.innerHTML='<span></span>';
    document.querySelector(`.compact-provider[data-provider="${id}"] .mini-info`)?.append(miniTrack);
  }
}
function renderConnection(id,s,auth){
  const card=cardNodes[id],connected=ready(s),antigravity=id==='gemini'&&state.settings.googleSource==='antigravity';
  const details=card.querySelector('.connection-details');details.hidden=activeDetail!==id;
  card.classList.toggle('details-open',!details.hidden);
  card.querySelector('.connection-status').setAttribute('aria-expanded',String(!details.hidden));
  card.querySelector('.connection-description').textContent=id==='codex'?'登入要監控的 ChatGPT 訂閱帳號，可與 Claude、Gemini 使用不同帳號。':antigravity?'沿用 Antigravity 的 Google 帳號，讀取 Gemini 配額資訊。':`連接你的 ${id==='gemini'?'Google':names[id]} 帳號以讀取配額資訊。`;
  card.querySelector('.connection-account h4').textContent=baseId(id)==='claude'?'Claude Code':id==='codex'?'Codex':antigravity?'Antigravity · Gemini':'Google Code Assist';
  const phase=auth?.phase;
  card.querySelector('.continue-claude-login').hidden=phase!=='web_login'||!!auth?.automatic;
  const step=connected?4:phase==='syncing'||phase==='cooldown'||phase==='waiting'?2:phase==='connecting'||phase==='verifying'?1:0;
  card.querySelector('.connection-steps').style.setProperty('--progress',`${Math.min(100,step/3*100)}%`);
  for(const node of card.querySelectorAll('.connection-steps li')){
    const index=Number(node.dataset.step);node.classList.toggle('done',index<step);node.classList.toggle('active',index===step&&!!auth?.pending);
    node.querySelector('span').textContent=index<step?'✓':String(index+1);
  }
  const message=card.querySelector('.auth-message');
  message.textContent=auth?.pending||['error','cooldown','waiting'].includes(auth?.phase)?auth.message:connected?'已連接，配額已自動同步':s.error||'完成授權後會自動同步配額。';
  message.classList.toggle('success',!!connected);message.classList.toggle('error',phase==='error'||(!auth?.pending&&!['cooldown','waiting'].includes(phase)&&['stale','unavailable'].includes(s.status)));
  const text=phase==='syncing'?'自動同步中…':phase==='connecting'?'連接中…':auth?.pending?'等待授權…':id==='codex'?(connected?'切換 Codex 帳號 →':'登入 Codex（ChatGPT） →'):connected?'重新連接':antigravity?'連接 Antigravity 並同步 →':`登入 ${id==='gemini'?'Google':names[id]} 並同步 →`;
  for(const button of [card.querySelector('.login'),card.querySelector('.connect-primary')]){button.textContent=text;button.disabled=!!auth?.pending||(!s.enabled&&!isExtra(id));}
  if(auth?.pending){const entry=card.querySelector('.connect-primary');entry.disabled=false;entry.textContent=phase==='web_login'?'繼續登入':'查看登入進度';}
  if(phase==='verifying')card.querySelector('.login').textContent='驗證授權碼中…';
  const limited=/429|限制查詢|查詢頻率/.test(s.error??'');
  card.querySelector('.connect-primary').hidden=false;
  if(limited&&!auth?.pending){for(const button of [card.querySelector('.login'),card.querySelector('.connect-primary')])button.textContent=`登入 ${id==='gemini'?'Google':names[id]}（管理授權） →`;}
  if(limited&&!auth?.pending&&baseId(id)==='claude')for(const button of [card.querySelector('.login'),card.querySelector('.connect-primary')])button.textContent='查看官方配額 ↗';
  else if(s.status==='unavailable'&&!auth?.pending)card.querySelector('.connect-primary').textContent='重新同步';
  else if(s.status==='loading'&&!auth?.pending){card.querySelector('.connect-primary').textContent='同步中…';card.querySelector('.connect-primary').disabled=true;}
  card.querySelector('.connection-note').textContent=limited?`目前限制的是配額查詢，不代表已登出。可登入或更新授權；重新登入不會解除限流。${retryLabel(s)||'冷卻後自動重試'}。`:'登入完成後自動更新，不必手動查用量。';
  if(id==='codex')card.querySelector('.connection-note').textContent+=' Codex 使用獨立的 OpenAI／ChatGPT 授權；切換會同步更新本機 Codex CLI 的帳號，不會登出 Claude 或 Gemini。瀏覽器若帶入其他帳號，請選擇使用其他帳號登入。';
  if(auth?.pending)card.querySelector('.connection-note').textContent=phase==='verifying'?'正在等待官方登入程序完成驗證；配額限流不會阻止帳號授權。':'請在瀏覽器完成登入；若選錯帳號，可取消後重試。';
  card.querySelector('.cancel-login').hidden=baseId(id)!=='claude'||!auth?.pending||phase==='syncing';
  card.querySelector('.auth-code-form').hidden=!auth?.pending||!auth?.codeRequired;
  card.querySelector('.reopen-login').hidden=!auth?.pending||!auth?.canReopen||phase==='syncing';
  card.querySelector('.provider-link').hidden=!s.reading;
  card.querySelector('.setup-links').hidden=id==='gemini'||!s.error?.includes('CLI');
  card.querySelector('.source p').textContent=s.reading?.source||sourceFor(id);
}
function renderCard(id){
  const s=state.providers[id],card=cardNodes[id],auth=state.auth[id];
  const expired=s.updatedAt&&Date.now()-Date.parse(s.updatedAt)>24*3600000;
  const allWindows=s.enabled&&!expired?presentation.groupWindows(s.reading?.windows??[]):[];
  const grouped=allWindows.some(w=>w.group);
  const scopedClaude=baseId(id)==='claude'&&allWindows.some(w=>/^seven_day_/.test(w.id));
  const primaryClaude=allWindows.filter(w=>['five_hour','seven_day'].includes(w.id));
  const windows=scopedClaude?(primaryClaude.length?primaryClaude:allWindows.slice(0,1)):grouped?[...allWindows].sort((a,b)=>b.usedPercent-a.usedPercent).slice(0,2):allWindows;
  const paceMode=!!state.settings.pacing&&currentView==='quota'&&activeDetail!==id;
  card.querySelector('.quota-details-link').hidden=(!grouped&&!scopedClaude)||currentView==='accounts'||activeDetail===id;
  card.querySelector('.quota-details-link').textContent=scopedClaude?'查看模型配額':`查看所有配額 (${allWindows.length})`;
  card.querySelector('.quota-details-link').title=scopedClaude?'Claude':`${allWindows.length} · Antigravity`;
  if(paceMode)card.querySelector('.quota-details-link').hidden=true;
  card.querySelector('.provider-identity h2').textContent=id==='gemini'&&grouped?'Antigravity':names[id];
  card.classList.remove('ready','stale','signed_out','loading','unavailable','disabled');card.classList.add(!s.enabled?'disabled':expired?'unavailable':s.status);
  card.classList.toggle('pending',!!auth?.pending);
  const usesAntigravity=id==='gemini'&&state.settings.googleSource==='antigravity';
  const disconnected=usesAntigravity&&!s.enabled&&s.status==='signed_out';
  const limited=/429|限制查詢|查詢頻率/.test(s.error??'');
  card.querySelector('.provider-subtitle').textContent=id==='gemini'?(state.demo?'CLI / Code Assist':usesAntigravity?'Antigravity':'Code Assist · 企業版'):subtitles[id];
  const plan=card.querySelector('.plan');plan.textContent=s.reading?.plan??'';plan.hidden=!s.reading?.plan;plan.title=s.reading?.plan??'';
  card.querySelector('.quota-display-mode').textContent=state.settings.remaining?'剩餘額度':'已用額度';
  if(state.settings.pacing)card.querySelector('.quota-display-mode').textContent='配速建議';
  let status=!s.enabled?'已暫停':s.status==='ready'?'已連接':s.status==='stale'?'更新失敗':s.status==='loading'?'同步中':s.status==='signed_out'?'未連接':limited?'服務限流':'讀取失敗';
  if(expired)status='資料過期';if(auth?.pending)status=auth.phase==='web_login'?'等待登入':auth.codeRequired?'等待授權碼':auth.phase==='syncing'?'同步中':'連接中';
  card.querySelector('.status-label').textContent=status;
  if(disconnected)card.querySelector('.status-label').textContent='已中斷連接';
  const updated=card.querySelector('.updated');updated.textContent=elapsed(s.updatedAt);updated.title=s.error??(s.updatedAt?new Date(s.updatedAt).toLocaleString():'尚未同步');
  const container=card.querySelector('.quota-windows');container.replaceChildren();container.classList.toggle('single',windows.length===1);container.classList.toggle('many',windows.length>2);container.hidden=!windows.length;
  for(const w of windows){
    const row=$('window-template').content.firstElementChild.cloneNode(true);if(tone(w))row.classList.add(tone(w));
    row.querySelector('.window-label').textContent=grouped?`${w.group==='Claude and GPT models'?'Claude／GPT':w.group==='Gemini Models'?'Gemini':w.group} · ${w.label.split(' · ').at(-1)}`:presentation.windowLabel(w.label);row.querySelector('.window-label').title=w.variants.join(' / ');
    const value=percent(w);row.querySelector('.quota-number').textContent=`${value}%`;
    const track=row.querySelector('.track');track.setAttribute('aria-valuenow',String(value));track.setAttribute('aria-label',`${names[id]} ${w.label} ${state.settings.remaining?'剩餘':'已用'}`);
    row.querySelector('.fill').style.width=`${value}%`;
    row.querySelector('.reset').textContent=resetLabel(id,w.resetsAt);
    if(presentation.resetDate(w.resetsAt,state.settings.locale)){
      row.querySelector('.reset').title=new Intl.DateTimeFormat(state.settings.locale,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'short'}).format(new Date(w.resetsAt));
      row.querySelector('.reset').setAttribute('data-localized-title','');
      row.querySelector('.reset').dataset.countdown=countdown(w.resetsAt);
      row.querySelector('.reset').title+=' · '+window.QuotaI18n.translate(countdown(w.resetsAt),state.settings.locale);
    }
    container.append(row);
  }
  const paceContent=card.querySelector('.pacing-content');paceContent.hidden=!paceMode||!windows.length;
  if(windows.length)renderPaceCard(id,allWindows);
  if(paceMode&&windows.length)container.hidden=true;
  const empty=card.querySelector('.empty-state');empty.hidden=!!windows.length;
  card.querySelector('.empty-title').textContent=!s.enabled?'已暫停此來源':auth?.pending?(auth.codeRequired?'等待授權碼':auth.phase==='syncing'?'連接完成，正在同步…':'等待帳號連接…'):s.status==='signed_out'?'連接你的帳號':s.status==='loading'?'正在讀取配額…':expired?'資料已過期':limited?'配額服務暫時限流':'暫時無法取得配額';
  const errorText=limited?['服務回覆 HTTP 429',retryLabel(s)].filter(Boolean).join(' · '):s.error?[s.error,retryLabel(s)].filter(Boolean).join(' · '):'';
  card.querySelector('.empty-message').textContent=!s.enabled?'在設定中開啟來源即可恢復同步。':auth?.pending||auth?.phase==='error'?auth.message:errorText||'完成連接後，配額會自動出現在這裡。';
  if(disconnected){card.querySelector('.empty-title').textContent='已中斷連接';card.querySelector('.empty-message').textContent='Antigravity 仍保持登入，可在帳號頁重新連接。';}
  card.querySelector('.empty-message').title=s.error??'';
  renderConnection(id,s,auth);
  const accountActions=card.querySelector('.account-actions');accountActions.hidden=currentView!=='accounts'||activeDetail===id;
  const switchButton=card.querySelector('.account-switch');switchButton.textContent=auth?.pending?(auth.phase==='web_login'?'繼續登入':'查看登入進度'):usesAntigravity?'切換帳號':ready(s)?'切換帳號':'登入帳號';
  switchButton.disabled=logoutBusy===id||(!auth?.pending&&!s.enabled&&!usesAntigravity&&!isExtra(id));
  const logoutButton=card.querySelector('.account-logout');logoutButton.textContent=usesAntigravity?'中斷連接':'登出';logoutButton.hidden=usesAntigravity?!s.enabled:id==='gemini'||!s.reading;logoutButton.disabled=!!auth?.pending||logoutBusy===id;
  card.querySelector('.logout-confirm').hidden=confirmLogout!==id;
  if(isExtra(id))card.querySelector('.logout-confirm p').textContent='只登出此獨立帳號，不影響其他帳號。';
  for(const button of card.querySelectorAll('.logout-confirm button'))button.disabled=logoutBusy===id;
  if(!isExtra(id))renderCompact(id);
}
function renderCompact(id,slot=id){
  const s=state.providers[id],expired=s.updatedAt&&Date.now()-Date.parse(s.updatedAt)>24*3600000;
  const limited=/429|限制查詢|查詢頻率/.test(s.error??'');
  const allWindows=s.enabled&&!expired?presentation.groupWindows(s.reading?.windows??[]):[];
  const mini=$(`mini-${slot}`),windowLabel=$(`window-${slot}`),button=document.querySelector(`.compact-provider[data-provider="${slot}"]`),w=presentation.weeklyWindow(allWindows);
  if(!mini)return;
  button.classList.toggle('unconnected',!w);button.classList.toggle('disabled',!s.enabled);button.classList.toggle('stale',s.status==='stale');
  mini.className=`mini-value${w&&s.enabled&&!expired&&s.status!=='stale'?'':' unknown'}`;
  mini.textContent=!s.enabled?'暫停':expired?'資料過期':s.status==='stale'?'更新失敗':w?`${percent(w)}%`:s.status==='loading'?'同步中':s.status==='signed_out'?'未連接':limited?'限流中':s.reading?'未提供週額度':'讀取失敗';
  mini.textContent=paceText(mini.textContent);
  windowLabel.textContent=s.status==='stale'&&w?`${percent(w)}%`:w?presentation.shortWindow(w.label):'';
  windowLabel.setAttribute('aria-label',s.status==='stale'&&w?`上次資料 ${percent(w)}%`:windowLabel.textContent);
  if(id==='codex')button.querySelector('.mini-logo').src=s.status==='stale'?'icons/codex-error.svg':'icons/codex.svg';
  button.querySelector('.mini-alert').hidden=!['stale','unavailable','signed_out'].includes(s.status);
  const reset=w?presentation.resetDate(w.resetsAt,state.settings.locale):null;
  const detail=w?`${paceText(w.label)} · ${paceText('剩餘')} ${Math.round(100-w.usedPercent)}% · ${paceText('已用')} ${Math.round(w.usedPercent)}%\n${paceText(countdown(w.resetsAt))}${reset?` (${reset})`:''}`:paceText(mini.textContent);
  button.title=`${names[id]}\n${detail}${s.error?`\n${s.error}`:''}${s.status==='stale'?`\n${paceText('更新失敗')}`:''}`;button.setAttribute('data-localized-title','');
  mini.removeAttribute('title');
  button.querySelector('.mini-track').hidden=!w;
  button.querySelector('.mini-track span').style.width=w?`${percent(w)}%`:'0%';
}
function paceNumber(value){return new Intl.NumberFormat(state.settings.locale,{maximumFractionDigits:1,roundingMode:'floor'}).format(value);}
function paceData(id,windows){const w=presentation.paceWindow(windows,state.settings.paceWindows?.[id]);return {w,p:ready(state.providers[id])&&!state.paused?presentation.pacing(w,state.settings.reservePercent?.[id]??10):null};}
function paceText(text){return window.QuotaI18n.translate(text,state.settings.locale);}
function fillPaceBar(bar,p){
  bar.replaceChildren();bar.hidden=!p;if(!p)return;
  for(const [kind,value] of [['available',p.available],['reserve',p.reserve],['used',p.used]]){
    const segment=document.createElement('span');segment.className=`pace-segment ${kind}`;segment.style.width=`${value}%`;
    if(value>=8)segment.textContent=`${paceNumber(value)}%`;
    const label=kind==='available'?'可分配':kind==='reserve'?'保留比例':'已用';segment.title=`${paceText(label)} ${paceNumber(value)}%`;segment.setAttribute('data-localized-title','');bar.append(segment);
  }
  bar.setAttribute('aria-label',`可分配 ${paceNumber(p.available)}%, 保留比例 ${paceNumber(p.reserve)}%, 已用 ${paceNumber(p.used)}%`);
}
function renderPaceCard(id,windows){
  const card=cardNodes[id],{w,p}=paceData(id,windows),row=card.querySelector('.pacing-content');
  row.querySelector('.pace-value').textContent=p?paceNumber(p.allowance):'—';
  row.querySelector('.pace-unit').textContent=p?(p.unit==='hour'?'%／小時':'%／天'):'配速暫不可用';
  row.querySelector('.pace-value').title=w?.label??'';
  row.querySelector('.pace-reserve-label').textContent=`保留 ${paceNumber(state.settings.reservePercent?.[id]??10)}%`;
  row.querySelector('.pace-reserve-label').title=paceText('保留比例以總配額為基準；各來源與窗口獨立計算。');row.querySelector('.pace-reserve-label').setAttribute('data-localized-title','');
  fillPaceBar(row.querySelector('.pace-bar'),p);
  row.querySelector('.pace-remaining').textContent=p?`剩餘 ${paceNumber(p.remaining)}%`:w?.label??'';
  row.querySelector('.pace-reset').textContent=w?countdown(w.resetsAt):'等待配額資料';
  row.querySelector('.pace-reset').title=w?presentation.resetDate(w.resetsAt,state.settings.locale)??'':'';row.querySelector('.pace-reset').setAttribute('data-localized-title','');
}
function renderPaceDetails(){
  if(!paceDetailsProvider)return;
  const id=paceDetailsProvider,windows=presentation.groupWindows(state.providers[id].reading?.windows??[]),{w,p}=paceData(id,windows);
  $('pace-details-title').textContent=`${id==='gemini'?'Antigravity':names[id]} · 配速詳情`;
  if(isExtra(id)){$('pace-details-title').textContent=`${names[id]} · ${paceText('配速詳情')}`;$('pace-details-title').setAttribute('data-localized-text','');}else $('pace-details-title').removeAttribute('data-localized-text');
  const select=$('pace-window');select.replaceChildren();
  for(const window of windows){const option=document.createElement('option');option.value=window.id;option.textContent=window.label;option.selected=window.id===w?.id;select.append(option);}
  select.disabled=!windows.length;$('pace-reserve').value=state.settings.reservePercent?.[id]??10;$('pace-reserve-value').textContent=`${$('pace-reserve').value}%`;
  const summary=$('pace-summary');summary.setAttribute('data-localized-text','');summary.replaceChildren();
  if(!p){summary.textContent=paceText('配速暫不可用');return;}
  const heading=document.createElement('h3');heading.textContent=paceText('建議用量');
  const budget=document.createElement('strong');budget.className='pace-detail-value';budget.textContent=`${paceNumber(p.allowance)} ${paceText(p.unit==='hour'?'%／小時':'%／天')}`;
  const formula=document.createElement('p');formula.textContent=`(${paceNumber(p.remaining)}% − ${paceNumber(p.reserve)}%) ÷ ${paceNumber(p.periods)} ${paceText(p.unit==='hour'?'小時':'天')} ≈ ${paceNumber(p.allowance)}%`;
  const track=document.createElement('div');track.className=`pace-bar ${id}`;track.setAttribute('role','img');fillPaceBar(track,p);
  const reset=document.createElement('p');reset.textContent=paceText(countdown(w.resetsAt));reset.title=presentation.resetDate(w.resetsAt,state.settings.locale);reset.setAttribute('data-localized-title','');
  summary.append(heading,budget,formula,track,reset);
  if(p.hours<1){const note=document.createElement('p');note.textContent=paceText('不足一小時，建議量以可分配餘額為上限。');summary.append(note);}
  if(p.available===0){const note=document.createElement('p');note.textContent=paceText('剩餘額度已在保留範圍內，建議暫停使用。');summary.append(note);}
}
function renderQuotaDetails(){
  const container=$('quota-groups');container.replaceChildren();
  const groups=new Map();
  const claude=baseId(quotaDetailsProvider)==='claude';
  $('quota-details').querySelector('.quota-details-heading h2').textContent=claude?'Claude 模型配額':'Antigravity 配額';
  const modelTitle=$('quota-details').querySelector('.quota-details-heading h2');
  if(isExtra(quotaDetailsProvider)){modelTitle.textContent=`${names[quotaDetailsProvider]} · ${paceText('Claude 模型配額')}`;modelTitle.setAttribute('data-localized-text','');}else modelTitle.removeAttribute('data-localized-text');
  document.querySelector('.quota-details-note').textContent=claude?'模型專屬限制可能與所有模型限制同時適用，兩者不能相加。':'以下都是 Antigravity 內的配額，不是獨立 Claude Code／Codex 訂閱額度。';
  for(const window of state.providers[quotaDetailsProvider].reading?.windows??[]){
    const group=claude?(window.id==='five_hour'?null:'每週配額'):window.group;
    if(!group)continue;if(!groups.has(group))groups.set(group,[]);groups.get(group).push(window);
  }
  for(const [name,windows] of groups){
    const section=document.createElement('section');section.className='quota-group';
    const title=document.createElement('h3');title.textContent=name;section.append(title);
    for(const window of windows){
      const row=document.createElement('div');row.className='group-limit';
      const label=document.createElement('span');label.textContent=claude?window.label:window.label.split(' · ').at(-1);
      const value=document.createElement('strong');value.className='group-number';value.textContent=`${percent(window)}%`;
      const track=document.createElement('div');track.className='group-track';track.setAttribute('role','progressbar');track.setAttribute('aria-label',`${name} ${window.label}`);track.setAttribute('aria-valuenow',String(percent(window)));track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');
      const fill=document.createElement('span');fill.style.width=`${percent(window)}%`;track.append(fill);
      const reset=document.createElement('small');reset.textContent=countdown(window.resetsAt);if(window.resetsAt){reset.title=presentation.resetDate(window.resetsAt,state.settings.locale);reset.setAttribute('data-localized-title','');}
      row.append(label,value,track,reset);section.append(row);
    }
    container.append(section);
  }
  if(!groups.size)container.textContent='來源尚未提供群組配額';
}
function render(next){
  if(!next)return;syncAccounts(next);state=next;
  if(activeDetail&&!state.providers[activeDetail])activeDetail=null;
  if(paceDetailsProvider&&!state.providers[paceDetailsProvider])paceDetailsProvider=null;
  if(!state.providers[quotaDetailsProvider]){quotaDetailsOpen=false;quotaDetailsProvider='claude';}
  if(paceDetailsProvider&&(!state.settings.pacing||currentView!=='quota'||settingsOpen||activeDetail||state.settings.visible?.[paceDetailsProvider]===false))paceDetailsProvider=null;
  if(!state.expanded)footerPopover=null;
  for(const id of ids){
    const wasPending=previousPending.get(id),pending=!!state.auth[id]?.pending;
    if(pending&&!wasPending)activeDetail=id;
    if(wasPending&&!pending&&state.auth[id]?.phase==='ready')setTimeout(()=>{if(activeDetail===id&&state.auth[id]?.phase==='ready'){activeDetail=null;render(state);}},1200);
    previousPending.set(id,pending);
  }
  orderProviders(state.settings.order??ids);$('island').classList.toggle('expanded',state.expanded);$('panel').hidden=!state.expanded;
  $('toggle').setAttribute('aria-expanded',String(state.expanded));
  $('compact-mode').textContent=state.settings.remaining?'剩餘':'已用';$('mode-label').textContent=state.settings.remaining?'剩餘額度':'已用額度';
  $('mode-remaining').setAttribute('aria-pressed',String(!state.settings.pacing&&state.settings.remaining));$('mode-used').setAttribute('aria-pressed',String(!state.settings.pacing&&!state.settings.remaining));$('mode-pacing').setAttribute('aria-pressed',String(!!state.settings.pacing));
  if(state.settings.pacing)$('mode-label').textContent='配速建議';
  $('demo-banner').hidden=!state.demo;$('app-version').textContent=`v${state.version}`;
  for(const id of ['compact-version','header-version','footer-version'])$(id).textContent=`v${state.version}`;
  $('island').classList.toggle('accounts-view',currentView==='accounts');
  $('island').classList.toggle('settings-view',settingsOpen);
  $('island').classList.toggle('quota-details-view',quotaDetailsOpen&&!settingsOpen);
  $('island').classList.toggle('pacing-view',!!state.settings.pacing);
  $('settings').hidden=!settingsOpen;
  $('settings-toggle').setAttribute('aria-expanded',String(settingsOpen));
  $('cards').hidden=settingsOpen;
  $('cards').hidden=settingsOpen||quotaDetailsOpen||(currentView==='tasks'||currentView==='messages');
  $('quota-details').hidden=!quotaDetailsOpen||settingsOpen;
  $('pace-details').hidden=!paceDetailsProvider||settingsOpen;
  for(const id of ids){
    const open=paceDetailsProvider===id;cardNodes[id].classList.toggle('pace-expanded',open);
    cardNodes[id].style.setProperty('--pace-row-height',`${Math.max(72,(quotaCardHeights[id]??98)-26)}px`);
    const button=cardNodes[id].querySelector('.pace-link');button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-controls','pace-details');button.textContent=open?'收起配速詳情 ⌃':'配速詳情 ›';
  }
  if(paceDetailsProvider)cardNodes[paceDetailsProvider].append($('pace-details'));
  else if($('pace-details').parentElement!==document.querySelector('.panel-body'))document.querySelector('.panel-body').append($('pace-details'));
  for(const view of ['quota','accounts','tasks','messages']){$(`tab-${view}`).setAttribute('aria-selected',String(view===currentView));$(`tab-${view}`).tabIndex=view===currentView?0:-1;}
  $('cards').setAttribute('role','tabpanel');$('cards').setAttribute('aria-labelledby',`tab-${currentView}`);
  const healthy=!state.paused&&ids.some(id=>ready(state.providers[id]));$('live-dot').classList.toggle('off',!healthy);
  document.querySelector('.footer-dot').classList.toggle('off',!healthy);$('footer-status').textContent=state.paused?'已暫停同步':'自動同步';
  for(const key of ['taskCompletionNotifications','autoStart','alwaysOnTop','notifications','petIdle','petAlerts','petRoam'])$(key).checked=state.settings[key];
  $('autoStart').disabled=!['win32','darwin'].includes(state.platform);
  $('pet-character').value=petDraft?.petCharacter??state.settings.petCharacter??'claude';
  $('pet-placement').value=petDraft?.petPlacement??state.settings.petPlacement??'title';
  $('pet-background').value=petDraft?.petBackground??state.settings.petBackground??'meteor';
  $('island').dataset.petBackground=window.QuotaPets?.previewSettings?.petBackground??state.settings.petBackground??'meteor';
  $('morningHelloEnabled').checked=state.settings.morningHelloEnabled===true;
  $('google-source').value=state.settings.googleSource;$('google-source').disabled=!!state.auth.gemini?.pending;
  for(const input of document.querySelectorAll('[data-enable]'))input.checked=state.settings.enabled[input.dataset.enable];
  ids.forEach(renderCard);
  window.UsageTrends.update(state,cardNodes,{visible:!settingsOpen&&!quotaDetailsOpen&&!activeDetail&&currentView==='quota',open:()=>{paceDetailsProvider=null;quotaDetailsOpen=false;activeDetail=null;render(state);},resize:()=>render(state)});
  for(const id of ids){const visible=state.settings.visible?.[id]!==false;cardNodes[id].hidden=!visible;const compact=document.querySelector(`.compact-provider[data-provider="${id}"]`);if(compact)compact.hidden=!visible;}
  const extraSettings=$('extra-account-settings');extraSettings.replaceChildren();
  for(const account of state.accounts??[]){const label=document.createElement('label'),name=document.createElement('span');name.textContent=account.label;name.setAttribute('data-localized-text','');const input=document.createElement('input');input.type='checkbox';input.setAttribute('role','switch');input.checked=state.settings.visible[account.id]!==false;input.addEventListener('change',()=>api.settings({visible:{[account.id]:input.checked}}));label.append(name,input);extraSettings.append(label);}
  renderCompactClaude();
  $('add-account-area').hidden=settingsOpen||quotaDetailsOpen||(currentView==='tasks'||currentView==='messages');
  for(const input of document.querySelectorAll('[data-visible]'))input.checked=state.settings.visible?.[input.dataset.visible]!==false;
  $('no-visible-providers').hidden=settingsOpen||quotaDetailsOpen||(currentView==='tasks'||currentView==='messages')||ids.some(id=>state.settings.visible?.[id]!==false);
  renderPaceDetails();
  renderQuotaDetails();
  renderFooter();
  $('language').value=state.settings.locale??'zh-TW';
  window.QuotaI18n.localizeDocument(document,state.settings.locale);
  window.TaskPanel.update(state,currentView==='tasks'&&!settingsOpen&&!quotaDetailsOpen);
  document.querySelector('.panel-header .segmented')?.classList.toggle('tasks-mode-hidden',(currentView==='tasks'||currentView==='messages'));
  window.QuotaPets.update(state);window.CompanionSettings.update(state,currentView==='messages'&&!settingsOpen&&!quotaDetailsOpen);
  const growth=$('pet-growth');if(growth){const labels={'zh-TW':['成長','小蛋','幼幼','夥伴','星際','以週配額增量記錄經驗，每日最多 20 XP；不用刻意增加用量。'],en:['Growth','Egg','Little one','Companion','Space friend','Weekly quota increases earn XP, capped at 20 daily. No extra usage needed.'],ja:['成長','たまご','ちび','仲間','宇宙の友','週間利用枠の増加で経験値を記録。1日最大20 XP。無理に使う必要はありません。'],ko:['성장','알','아기','친구','우주 친구','주간 할당량 증가로 경험치를 기록하며 하루 최대 20 XP입니다. 추가 사용은 필요 없습니다.']}[state.settings.locale]||[];growth.replaceChildren();const role=state.settings.petCharacter==='random'?'claude':state.settings.petCharacter,g=state.petGrowth?.[role];if(g){const name=document.createElement('span');name.textContent=labels[0]+' · Lv.'+g.level+' '+labels[g.level]+' · '+g.xp+' XP';const bar=document.createElement('progress');bar.max=100;bar.value=g.progress;bar.setAttribute('aria-label',labels[0]);growth.append(name,bar);growth.title=labels[5];}}
  if(state.settings.locale==='en')$('compact-mode').textContent=state.settings.remaining?'Left':'Used';
  requestAnimationFrame(()=>{
    if(state.expanded&&!settingsOpen&&!quotaDetailsOpen&&!activeDetail&&!paceDetailsProvider){
      for(const id of ids){
        const card=cardNodes[id];if(card.hidden)continue;
        if(card.classList.contains('trend-expanded'))continue;
        if(currentView==='quota'){
          card.style.minHeight='';
          const quota=card.querySelector('.quota-windows'),pace=card.querySelector('.pacing-content');
          let height=card.getBoundingClientRect().height;
          if(quota.children.length){
            const quotaHidden=quota.hidden,paceHidden=pace.hidden;
            quota.hidden=false;pace.hidden=true;height=Math.max(height,card.getBoundingClientRect().height);
            quota.hidden=true;pace.hidden=false;height=Math.max(height,card.getBoundingClientRect().height);
            quota.hidden=quotaHidden;pace.hidden=paceHidden;
          }
          quotaCardHeights[id]=Math.ceil(height);
        }
        card.style.minHeight=`${quotaCardHeights[id]??98}px`;
      }
    }
    const content=(settingsOpen?$('settings'):quotaDetailsOpen?$('quota-details'):currentView==='tasks'?$('task-panel'):currentView==='messages'?$('messages-panel'):$('cards')).getBoundingClientRect().height+document.querySelector('.context-line').getBoundingClientRect().height+(!settingsOpen&&!quotaDetailsOpen?$('add-account-area').getBoundingClientRect().height:0);
    const chrome=document.querySelector('.panel-header').getBoundingClientRect().height+document.querySelector('footer').getBoundingClientRect().height+18;
    const height=Math.max(480,Math.ceil(content+chrome+(settingsOpen?24:12)));
    if(!window.UsageTrends.active&&!settingsOpen&&!quotaDetailsOpen&&!activeDetail&&!paceDetailsProvider&&currentView==='quota')quotaPanelHeight=height;
    api.panelHeight(currentView!=='tasks'&&currentView!=='messages'&&!window.UsageTrends.active&&!settingsOpen&&!quotaDetailsOpen&&!activeDetail&&!paceDetailsProvider?quotaPanelHeight:height);
  });
}
makeCards();
$('add-account-toggle').addEventListener('click',()=>{$('add-account-form').hidden=!$('add-account-form').hidden;render(state);if(!$('add-account-form').hidden)$('account-label').focus();});
$('cancel-add-account').addEventListener('click',()=>{$('add-account-form').hidden=true;$('add-account-error').textContent='';render(state);});
$('add-account-form').addEventListener('submit',async event=>{
  event.preventDefault();const result=await api.addAccount($('account-label').value);
  if(!result.ok){$('add-account-error').textContent=result.message;render(state);return;}
  $('add-account-form').hidden=true;$('account-label').value='';activeDetail=result.id;render(await api.getState());void api.login(result.id);
});
document.querySelectorAll('[data-expand]').forEach(button=>{
  enableReorder(button,button.dataset.provider);
  button.addEventListener('click',()=>{if(!draggedProvider&&Date.now()>suppressClickUntil){if(button.dataset.provider==='claude'&&compactClaudeAccounts().length>1)advanceCompactClaude();else api.expand(true);}});
  button.addEventListener('keydown',event=>{if(!event.altKey||!['ArrowLeft','ArrowRight'].includes(event.key)||!state)return;const order=state.settings.order,index=order.indexOf(button.dataset.provider),target=order[index+(event.key==='ArrowLeft'?-1:1)];if(target){event.preventDefault();moveProvider(button.dataset.provider,target);button.focus();}});
});
$('toggle').addEventListener('click',()=>api.expand(true));$('collapse').addEventListener('click',()=>api.expand(false));
const compactClaudeButton=document.querySelector('.compact-provider.claude');
compactClaudeButton.addEventListener('mouseenter',()=>{compactClaudeHovered=true;});
compactClaudeButton.addEventListener('mouseleave',()=>{compactClaudeHovered=false;compactClaudeNext=Date.now()+5000;});
compactClaudeButton.addEventListener('focus',()=>{compactClaudeFocused=compactClaudeButton.matches(':focus-visible');});
compactClaudeButton.addEventListener('blur',()=>{compactClaudeFocused=false;compactClaudeNext=Date.now()+5000;});
setInterval(()=>{if(state&&!state.expanded&&!compactClaudeHovered&&!compactClaudeFocused&&!draggedProvider&&Date.now()>=compactClaudeNext)advanceCompactClaude();},250);
$('refresh').addEventListener('click',async()=>{$('refresh').disabled=true;$('refresh').classList.add('spinning');try{await api.refresh();}finally{$('refresh').classList.remove('spinning');setTimeout(()=>{$('refresh').disabled=false;},700);}});
$('settings-toggle').addEventListener('click',()=>{footerPopover=null;settingsOpen=!settingsOpen;$('settings-toggle').setAttribute('aria-expanded',String(settingsOpen));render(state);});
$('mode-remaining').addEventListener('click',()=>{paceDetailsProvider=null;api.settings({remaining:true,pacing:false});});$('mode-used').addEventListener('click',()=>{paceDetailsProvider=null;api.settings({remaining:false,pacing:false});});
$('mode-pacing').addEventListener('click',()=>api.settings({pacing:true}));
$('pace-window').addEventListener('change',event=>{if(paceDetailsProvider)api.settings({paceWindows:{[paceDetailsProvider]:event.target.value}});});
$('pace-reserve').addEventListener('input',event=>{$('pace-reserve-value').textContent=`${event.target.value}%`;});
$('pace-reserve').addEventListener('change',event=>{if(paceDetailsProvider)api.settings({reservePercent:{[paceDetailsProvider]:Number(event.target.value)}});});
$('hide').addEventListener('click',()=>api.hide());$('quit').addEventListener('click',()=>api.quit());
$('google-source').addEventListener('change',event=>api.settings({googleSource:event.target.value}));
for(const view of ['quota','accounts','tasks','messages'])$(`tab-${view}`).addEventListener('click',()=>setView(view));
document.querySelector('.view-tabs').addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const views=['quota','accounts','tasks','messages'];const view=event.key==='Home'?'quota':event.key==='End'?'messages':views[(views.indexOf(currentView)+(event.key==='ArrowRight'?1:3))%4];setView(view);$(`tab-${view}`).focus();}});
$('language-shortcut').addEventListener('click',()=>openFooterPopover('language'));
$('sync-shortcut').addEventListener('click',()=>openFooterPopover('sync'));
for(const button of $('language-popover').querySelectorAll('[data-locale]'))button.addEventListener('click',async()=>{await api.settings({locale:button.dataset.locale});closeFooterPopover(true);});
$('language-popover').addEventListener('keydown',event=>{
  const buttons=[...$('language-popover').querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}
});
$('sync-refresh').addEventListener('click',async()=>{syncBusy=true;render(state);try{await api.refresh();}finally{syncBusy=false;render(await api.getState());}});
document.addEventListener('pointerdown',event=>{if(footerPopover&&!event.target.closest('.footer-popover,#language-shortcut,#sync-shortcut'))closeFooterPopover();});
$('compact-refresh').addEventListener('click',()=>api.refresh());
$('close-quota-details').addEventListener('click',()=>{quotaDetailsOpen=false;render(state);});
$('language').addEventListener('change',event=>api.settings({locale:event.target.value}));
for(const key of ['taskCompletionNotifications','autoStart','alwaysOnTop','notifications'])$(key).addEventListener('change',event=>api.settings({[key]:event.target.checked}));
for(const key of ['petIdle','petAlerts','petRoam'])$(key).addEventListener('change',event=>api.settings({[key]:event.target.checked}));
function selectedPet(){return {petPlacement:$('pet-placement').value,petBackground:$('pet-background').value,petCharacter:$('pet-character').value};}
for(const id of ['pet-placement','pet-character','pet-background'])$(id).addEventListener('change',()=>{petDraft=selectedPet();});
async function runPetChoice(apply){if(petBusy)return;petBusy=true;const config=selectedPet(),action=$('pet-action').value;for(const id of ['pet-action-preview','pet-action-apply'])$(id).disabled=true;try{if(apply){window.QuotaPets.cancelPreview();await api.settings({...config,petRoam:true});petDraft=null;}await api.expand(false);setTimeout(()=>{if(apply){action==='walk'?window.QuotaPets.roam(config.petCharacter):window.QuotaPets.action(action,config.petCharacter);}else window.QuotaPets.previewAction(action,config);},300);}finally{petBusy=false;for(const id of ['pet-action-preview','pet-action-apply'])$(id).disabled=false;}}
$('pet-action-preview').addEventListener('click',()=>runPetChoice(false));
$('pet-action-apply').addEventListener('click',()=>runPetChoice(true));
$('morningHelloEnabled').addEventListener('change',event=>api.settings({morningHelloEnabled:event.target.checked}));
for(const input of document.querySelectorAll('[data-enable]'))input.addEventListener('change',()=>api.settings({enabled:{[input.dataset.enable]:input.checked}}));
for(const input of document.querySelectorAll('[data-visible]'))input.addEventListener('change',()=>api.settings({visible:{[input.dataset.visible]:input.checked}}));
document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if(footerPopover){closeFooterPopover(true);event.preventDefault();}else if(window.UsageTrends.active){window.UsageTrends.close();render(state);}else if(paceDetailsProvider){paceDetailsProvider=null;render(state);}else if(quotaDetailsOpen){quotaDetailsOpen=false;render(state);}else if(confirmLogout){confirmLogout=null;render(state);}else if(activeDetail){activeDetail=null;render(state);}else if(settingsOpen){settingsOpen=false;$('settings-toggle').setAttribute('aria-expanded','false');render(state);}else api.expand(false);});
window.addEventListener('companion-layout-change',()=>{if(state&&(settingsOpen||currentView==='messages'))render(state);});
window.addEventListener('task-layout-change',()=>{if(state&&currentView==='tasks')render(state);});
api.subscribe(render);api.getState().then(render);setInterval(()=>{if(state)render(state);},15000);

api.onTaskFocus(id=>{setView('tasks');requestAnimationFrame(()=>TaskPanel.focusTask(id));});
let bubbleAnchorFrame=0;function reportBubbleAnchor(){cancelAnimationFrame(bubbleAnchorFrame);bubbleAnchorFrame=requestAnimationFrame(()=>{const anchors={};for(const [provider,id] of [['codex','codex'],['claude','claude'],['antigravity','gemini']]){const node=document.getElementById('mini-'+id);if(node&&node.getBoundingClientRect().width){const r=node.getBoundingClientRect();anchors[provider]=r.x+r.width/2;}}void api.taskBubbleAnchor(anchors);});}new ResizeObserver(reportBubbleAnchor).observe(document.body);new MutationObserver(reportBubbleAnchor).observe(document.querySelector('.compact-providers')||document.querySelector('.compact-bar')||document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});
