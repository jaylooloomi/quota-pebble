(function(){
  const $=id=>document.getElementById(id),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let state,playing=false,previewPlaying=false,idle=false,idlePreview=false,idleResident=false,roamOverride=false,lastAlert=0,nextIdle=Date.now()+120000+Math.random()*180000,idleIndex=0,finishTimer,phaseTimer,restTimer,previewLoopTimer;
  let latestState,temporary=null,temporaryTimer,previousWanted=false;
  function cancelPreview(){if(!temporary)return;clearTimeout(temporaryTimer);temporary=null;stop();roamWanted=previousWanted;if(latestState){state=latestState;$('island').dataset.petBackground=state.settings.petBackground;check();}}
  let seen={};try{seen=JSON.parse(localStorage.getItem('quota-pet-alerts')||'{}');if(!seen||Array.isArray(seen)||typeof seen!=='object')seen={};}catch{}
  const text=value=>window.QuotaI18n.translate(value,state?.settings.locale??'zh-TW');
  const brand=document.querySelector('.compact-brand');
  const brandPet=document.createElement('span');brandPet.className='pet-sprite brand-pet';brandPet.setAttribute('aria-hidden','true');brand.append(brandPet);
  let dragSuspended=false,nativeSuspended=false,roaming=false,roamWanted=false,roamRequest=0,roamTicket=0,lastRole=null;
  const roamPet=document.createElement('span');roamPet.id='roam-pet';roamPet.hidden=true;roamPet.setAttribute('aria-hidden','true');const roamCanvas=document.createElement('canvas');roamCanvas.width=144;roamCanvas.height=144;roamCanvas.className='pet-canvas';roamPet.append(roamCanvas);$('pet-stage').append(roamPet);
  let roamControls=null;
  const food=document.createElement('span');food.id='pet-food';food.hidden=true;food.setAttribute('aria-hidden','true');$('pet-stage').append(food);
  $('pet-stage').addEventListener('click',event=>{if(!roaming||event.target.closest('button'))return;const bounds=$('pet-stage').getBoundingClientRect();roamControls?.feed(Math.max(24,Math.min(bounds.width-24,event.clientX-bounds.left)),event.clientY-bounds.top);});
  function roam(manual=false,requested=state?.settings.petCharacter??'claude',initialAction){
    if(!state||state.expanded||document.hidden||state.paused)return;
    if(manual)stop();else if(playing||roaming)return;
    stop();roaming=true;roamOverride=!!initialAction;if(manual)roamWanted=true;const ticket=++roamTicket,roles=['claude','codex','gemini','octopus'].filter(id=>id!==lastRole),role=['claude','codex','gemini','octopus'].includes(requested)?requested:roles[Math.floor(Math.random()*roles.length)];lastRole=role;
    const isPixel=false;roamPet.dataset.renderStyle='smooth';
    const resources=Promise.all([window.QuotaPetAnimation.load('walk'),window.QuotaPetAnimation.load('smooth'),window.QuotaPetAnimation.loadRest(),window.QuotaPetAnimation.loadCare(),window.QuotaPetAnimation.loadSad(),window.QuotaPetAnimation.loadRecharge()]);
    resources.then(([frames,greetings,rest,care,sad,recharge])=>{
      if(ticket!==roamTicket||!roaming)return;
      const stage=$('pet-stage');stage.dataset.phase='roam';stage.title=text('點擊舞台投食');stage.hidden=false;roamPet.hidden=false;roamPet.dataset.role=role;roamPet.dataset.growth=String(state.petGrowth?.[role]?.level??1);$('island').classList.add('pet-playing');
      $('pet-caption').textContent=`${text('太空散步')} · ${role==='claude'?'Claude':role==='codex'?'Codex':role==='octopus'?text('小章魚'):'Antigravity'}`;$('pet-caption').title=$('pet-caption').textContent;$('pet-message').style.width='68px';$('pet-close').setAttribute('aria-label',text('關閉散步'));void window.quota.petHeight(112);
      const path=window.QuotaPetWander.create(stage.clientWidth),behavior=window.QuotaPetBehavior.create();let last=performance.now(),elapsed=0,previous='',previousMode='walk';
      const messages={walk:'職守中',seek:'開飯了！',eat:'好好吃！',hello:'跟你打招呼',sad:'偶爾也會有點累',sleep:'充電小睡中',drink:'記得喝水喔',recharge:'補充電力'};
      roamControls={act(action){if(behavior.act(action)){path.cancelGoal();food.hidden=true;roamPet.dataset.action=action;}},feed(x,y){const target=window.QuotaPetWander.feedingTarget(stage.clientWidth,x);food.hidden=false;food.style.left=target.foodX+'px';food.style.setProperty('--fall',Math.min(0,y-stage.clientHeight+18)+'px');food.style.animation='none';void food.offsetWidth;food.style.animation='pet-food-fall .45s ease-in both';path.go(target.petX);behavior.feed();if(reduced.matches){for(let i=0;i<100;i++)if(path.step(.1).arrived)break;behavior.arrive();step(performance.now());}}};
      if(initialAction)roamControls.act(initialAction);
      const step=time=>{
        roamRequest=0;if(!roaming||document.hidden)return;if(dragSuspended){last=time;roamRequest=requestAnimationFrame(step);return;}
        const dt=Math.max(0,(time-last)/1000);last=time;let action=behavior.step(reduced.matches?0:dt),position=path.step(action.mode==='walk'||action.mode==='seek'?(reduced.matches?0:dt):0);
        if(action.mode==='seek'&&position.arrived){behavior.arrive();action=behavior.step(0);}
        if(previousMode==='eat'&&action.mode!=='eat'){food.hidden=true;path.cancelGoal();}previousMode=action.mode;if(roamOverride&&action.mode==='walk')roamOverride=false;
        const walking=action.mode==='walk'||action.mode==='seek';if(walking&&position.moving&&!reduced.matches)elapsed+=dt*1000*position.speed/38;
        roamPet.style.transform=`translateX(${position.x}px)`;roamCanvas.style.transform=`scaleX(${position.face})`;roamPet.dataset.moving=String(walking&&position.moving&&!reduced.matches);roamPet.dataset.action=action.mode;
        const message=reduced.matches?'陪你休息':messages[action.mode];if(message!==previous){$('pet-message').textContent=text(message);previous=message;}
        let list=frames[role],sample=window.QuotaPetAnimation.sample(isPixel?'pixel-walk':'walk',role,elapsed,reduced.matches);
        if(!walking){
          const age=reduced.matches?0:action.elapsed*1000;
          if(action.mode==='recharge'){list=recharge[role];const phase=age%3600/3600*5,i=Math.floor(phase);sample={frame:i,next:Math.min(5,i+1),mix:reduced.matches?0:phase-i};}
          else if(action.mode==='hello'){list=greetings[role];sample=window.QuotaPetAnimation.sample(isPixel?'pixel':role==='octopus'?'hello':'smooth',role,age,reduced.matches);}
          else if(action.mode==='sad'){list=sad[role];sample=window.QuotaPetAnimation.sadPose(age,reduced.matches,isPixel);}
          else if(action.mode==='drink'||action.mode==='eat'){list=care[role];const phase=age%2400/2400*6,i=Math.floor(phase),offset=action.mode==='eat'?6:0;sample={frame:offset+i,next:offset+(i+1)%6,mix:reduced.matches?0:phase-i};}
          else if(role==='octopus'||isPixel){list=rest[role];const phase=age%3000/3000*6,i=Math.floor(phase),offset=action.mode==='sleep'?6:0;sample={frame:offset+i,next:offset+(i+1)%6,mix:reduced.matches?0:phase-i};}
          else {list=rest[role];const pose=action.mode==='sleep'?2:1;sample={frame:pose,next:pose,mix:0};}
        }
        roamPet.dataset.emotionPhase=action.mode==='sad'?sample.emotion??'lower':'';roamPet.style.setProperty('--pet-sigh',JSON.stringify(text('呼…')));
        if(isPixel)sample.mix=0;
        const ctx=roamCanvas.getContext('2d');ctx.imageSmoothingEnabled=!isPixel;ctx.clearRect(0,0,144,144);ctx.save();if(!walking&&!reduced.matches&&!isPixel&&!(role==='octopus'&&(action.mode==='hello'||action.mode==='recharge'))){const breath=Math.sin(action.elapsed*2)*.012;ctx.translate(0,134);ctx.scale(1,1+breath);ctx.translate(0,-134);}ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1-sample.mix;paint(ctx,list[sample.frame],role);if(sample.mix){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=sample.mix;paint(ctx,list[sample.next],role);}ctx.restore();roamPet.dataset.frame=String(sample.frame);
        if(!reduced.matches)roamRequest=requestAnimationFrame(step);
      };
      step(last);
    }).catch(()=>{if(ticket===roamTicket)stop();});
  }
  let frameRequest=0,animationStart=0,atlas=null,style=null,assetVersion=0;
  const actors=[brandPet,...$('pet-stage').querySelectorAll('.pet-sprite')];
  for(const el of actors){const canvas=document.createElement('canvas');canvas.width=144;canvas.height=144;canvas.className='pet-canvas';canvas.setAttribute('aria-hidden','true');el.append(canvas);}
  function draw(time){
    frameRequest=0;if((!playing&&!idle)||document.hidden||!atlas)return;
    const elapsed=Math.max(0,time-animationStart);
    for(const el of actors){if(el===brandPet?!idle:!playing||el.hidden)continue;const provider=el.dataset.actor??el.dataset.pet,frames=atlas[provider];if(!frames)continue;let sample=window.QuotaPetAnimation.sample(style==='pixel'?'pixel':provider==='octopus'?'hello':style,provider,elapsed,reduced.matches),activeFrames=frames;const canvas=el.querySelector('canvas'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,144,144);ctx.imageSmoothingEnabled=style!=='pixel';ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1-sample.mix;paint(ctx,activeFrames[sample.frame],provider);if(sample.mix){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=sample.mix;paint(ctx,activeFrames[sample.next],provider);}ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';el.dataset.frame=String(sample.frame);}
    if(!reduced.matches)frameRequest=requestAnimationFrame(draw);
  }
  function startAnimation(){if(idleResident)return;cancelAnimationFrame(frameRequest);animationStart=performance.now();if(atlas)draw(animationStart);}
  function chooseStyle(next){
    const selected='smooth';if(selected===style)return;
    style=selected;atlas=null;const version=++assetVersion;cancelAnimationFrame(frameRequest);
    $('island').dataset.petStyle=style;
    window.QuotaPetAnimation.load('smooth').then(result=>{if(version!==assetVersion)return;atlas=result;startAnimation();}).catch(()=>{if(version!==assetVersion)return;atlas=null;});
  }
  function sprite(el,provider,pose=0){el.dataset.actor=provider;el.style.setProperty('--pet-row',provider==='codex'?50:provider==='gemini'?100:0);el.style.setProperty('--pet-pose',pose*50);}
  function paint(ctx,frame,role){const level=state?.petGrowth?.[role]?.level??1,scale=.88+(Math.min(4,Math.max(1,level))-1)*.04;ctx.save();ctx.translate(72,140);ctx.scale(scale,scale);ctx.translate(-72,-140);ctx.drawImage(frame,0,0);ctx.restore();}
  function align(){
    if(!playing)return;
    const stage=$('pet-stage'),bounds=stage.getBoundingClientRect();
    for(const pet of stage.querySelectorAll('.pet-sprite')){
      const slot=document.querySelector(`.compact-provider[data-provider="${pet.dataset.pet}"]`),rect=slot.getBoundingClientRect();
      pet.hidden=slot.hidden||!rect.width;
      if(!pet.hidden)pet.style.left=`${rect.left+rect.width/2-bounds.left-pet.offsetWidth/2}px`;
    }
    $('pet-message').style.width=`${Math.max(56,brand.getBoundingClientRect().right-bounds.left-15)}px`;
  }
  function stop(){roamControls=null;food.hidden=true;$('pet-stage').removeAttribute('title');cancelAnimationFrame(roamRequest);roamRequest=0;roaming=false;roamTicket++;roamPet.hidden=true;cancelAnimationFrame(frameRequest);frameRequest=0;clearTimeout(finishTimer);clearTimeout(phaseTimer);clearTimeout(restTimer);clearInterval(previewLoopTimer);playing=false;previewPlaying=false;idle=false;idlePreview=false;idleResident=false;roamOverride=false;$('pet-stage').hidden=true;$('island').classList.remove('pet-playing');brand.classList.remove('pet-idle','pet-resident');void window.quota.petHeight(0);nextIdle=Date.now()+120000+Math.random()*180000;}
  function alert(event,preview=false){
    stop();playing=true;previewPlaying=preview;if(!preview){lastAlert=Date.now();seen=window.QuotaPetPolicy.claim(seen,event);try{localStorage.setItem('quota-pet-alerts',JSON.stringify(seen));}catch{}}
    const account=preview?text('預覽・展示資料'):state.accounts?.find(a=>a.id===event.id)?.label??(event.provider==='gemini'?'Antigravity':event.provider==='codex'?'Codex':'Claude');
    $('pet-caption').textContent=`${account} · ${text(event.label)} · ${text('剩餘')} ${event.remaining}%`;
    $('pet-caption').title=`${account} · ${event.label} · ${window.QuotaPresentation.resetDate(event.reset,state.settings.locale)}`;
    $('pet-message').textContent=text(event.level===3?'額度用盡，先休息一下':event.level===2?'能源即將用盡，放慢腳步':'能源偏低，救援隊出動');
    for(const el of $('pet-stage').querySelectorAll('.pet-sprite'))sprite(el,el.dataset.pet,el.dataset.pet===event.provider?1:0);
    $('pet-stage').dataset.affected=event.provider;$('pet-stage').dataset.phase='warning';$('pet-stage').hidden=false;$('island').classList.add('pet-playing');
    align();requestAnimationFrame(align);
    startAnimation();
    $('pet-close').setAttribute('aria-label',text('關閉小劇場'));
    void window.quota.petHeight(112);
    const phases=()=>{
      if(!playing)return;clearTimeout(phaseTimer);clearTimeout(restTimer);$('pet-stage').dataset.phase='warning';$('pet-message').textContent=text(event.level===3?'額度用盡，先休息一下':event.level===2?'能源即將用盡，放慢腳步':'能源偏低，救援隊出動');for(const el of $('pet-stage').querySelectorAll('.pet-sprite'))sprite(el,el.dataset.pet,el.dataset.pet===event.provider?1:0);
    if(!reduced.matches)phaseTimer=setTimeout(()=>{if(!playing)return;$('pet-stage').dataset.phase='rescue';for(const el of $('pet-stage').querySelectorAll('.pet-sprite'))sprite(el,el.dataset.pet,el.dataset.pet===event.provider?2:el.dataset.pet==='codex'?1:0);$('pet-message').textContent=text(event.level===3?'等待重置，一起充電':'補給一下，保持配速');},2000);
    restTimer=setTimeout(()=>{if(!playing)return;$('pet-stage').dataset.phase='rest';$('pet-message').textContent=text(event.level===3?'等待重置，一起充電':'補給一下，保持配速');for(const el of $('pet-stage').querySelectorAll('.pet-sprite'))sprite(el,el.dataset.pet,2);},4000);
    };
    phases();if(preview&&!reduced.matches)previewLoopTimer=setInterval(phases,6000);
    finishTimer=setTimeout(stop,preview?180000:6000);
  }
  async function startTitleResident(role,initialAction){
    cancelAnimationFrame(frameRequest);const ticket=++assetVersion;
    const [walk,greetings,sad,rest,care,recharge]=await Promise.all([QuotaPetAnimation.load('walk'),QuotaPetAnimation.load('smooth'),QuotaPetAnimation.loadSad(),QuotaPetAnimation.loadRest(),QuotaPetAnimation.loadCare(),QuotaPetAnimation.loadRecharge()]);
    if(ticket!==assetVersion||!idleResident)return;
    const behavior=QuotaPetBehavior.create(Math.random,{title:true}),canvas=brandPet.querySelector('canvas'),ctx=canvas.getContext('2d');let last=performance.now(),x=13,face=1,travel=0;
    if(initialAction)behavior.act(initialAction);
    const tick=time=>{frameRequest=0;if(!idleResident||document.hidden)return;if(dragSuspended){last=time;frameRequest=requestAnimationFrame(tick);return;}const dt=Math.min(.1,Math.max(0,(time-last)/1000));last=time;const action=behavior.step(reduced.matches?0:dt),moving=action.mode==='walk';
      if(moving&&!reduced.matches){x+=face*12*dt;if(x>=25){x=50-x;face=-1;}if(x<=1){x=2-x;face=1;}travel+=12*dt;}
      let frames=walk[role],sample=QuotaPetAnimation.sample('walk',role,travel/14*1100,reduced.matches),age=action.elapsed*1000;
      if(action.mode==='hello'){frames=greetings[role];sample=QuotaPetAnimation.sample(role==='octopus'?'hello':'smooth',role,age,reduced.matches);}
      else if(action.mode==='sad'){frames=sad[role];sample=QuotaPetAnimation.sadPose(age,reduced.matches);}
      else if(action.mode==='recharge'){frames=recharge[role];const f=reduced.matches?0:age%3600/3600*5,i=Math.floor(f);sample={frame:i,next:Math.min(5,i+1),mix:reduced.matches?0:f-i};}
      else if(action.mode==='drink'){frames=care[role];const f=reduced.matches?0:age%2400/400,i=Math.floor(f);sample={frame:i,next:(i+1)%6,mix:reduced.matches?0:f-i};}
      else if(action.mode==='sleep'){frames=rest[role];if(role==='octopus'){const f=reduced.matches?0:age%3000/500,i=Math.floor(f);sample={frame:6+i,next:6+(i+1)%6,mix:reduced.matches?0:f-i};}else sample={frame:2,next:2,mix:0};}
      if(moving)sample.mix=0;const gait=moving&&!reduced.matches?Math.abs(Math.sin(travel/14*Math.PI*2))*1:0;brandPet.style.top='calc(50% - '+gait+'px)';brandPet.dataset.stride=String(Math.floor(travel/7)%2);brandPet.style.left=x+'px';brandPet.dataset.growth=String(state.petGrowth?.[role]?.level??1);brandPet.dataset.action=action.mode;brandPet.dataset.frame=sample.frame;canvas.style.transform='scaleX('+face+')';ctx.clearRect(0,0,144,144);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1-sample.mix;paint(ctx,frames[sample.frame],role);if(sample.mix){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=sample.mix;paint(ctx,frames[sample.next],role);}ctx.globalAlpha=1;
      if(!reduced.matches)frameRequest=requestAnimationFrame(tick);
    };tick(last);
  }
  function showIdle(preview=false,requested=state?.settings.petCharacter??'claude',resident=false,initialAction){
    stop();idle=true;idlePreview=preview;idleResident=resident;brand.classList.toggle('pet-resident',resident);brandPet.style.animationDuration=preview?'15s':'4.5s';sprite(brandPet,['claude','codex','gemini','octopus'].includes(requested)?requested:['claude','codex','gemini','octopus'][idleIndex++%4]);brand.classList.add('pet-idle');if(resident){lastRole=brandPet.dataset.actor;void startTitleResident(lastRole,initialAction).catch(stop);}else startAnimation();if(!resident)finishTimer=setTimeout(stop,preview?15000:4500);
  }
  function check(){
    if(dragSuspended)return;
    if(!state||state.expanded||nativeSuspended||document.hidden||state.paused){if(playing||idle||roaming)stop();return;}
    if(playing){if(!previewPlaying&&state.settings.petAlerts===false)stop();return;}
    if(window.quotaPetDragging||document.querySelector('.reordering')){if(idle||roaming)stop();return;}
    if(idlePreview)return;
    const event=!temporary&&window.QuotaPetPolicy.events(state,seen)[0];
    if(event&&Date.now()-lastAlert>=30000){alert(event);return;}
    if(roaming&&roamOverride)return;
    if((state.settings.petRoam===true||roamWanted)&&state.settings.petPlacement==='title'){if(!idleResident)showIdle(false,undefined,true);return;}
    if(idleResident)stop();
    if(roaming){if(!roamWanted&&state.settings.petRoam!==true)stop();return;}
    if(state.settings.petRoam===true||roamWanted){roam();return;}
    if(state.settings.petIdle===false||reduced.matches){if(idle)stop();return;}
    if(!idle&&Date.now()>=nextIdle&&!brand.matches(':hover')){
      showIdle();
    }
  }
  $('pet-close').addEventListener('click',()=>{if(temporary){cancelPreview();return;}if(roaming){roamWanted=false;if(state?.settings.petRoam)void window.quota.settings({petRoam:false});}stop();});
  window.quota.onPetSuspend(reason=>{if(reason==='drag'){dragSuspended=true;return;}dragSuspended=false;if(reason==='resume'){nativeSuspended=false;check();}else{nativeSuspended=reason==='hide';stop();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else nextIdle=Date.now()+120000+Math.random()*180000;});
  document.addEventListener('dragstart',()=>{window.quotaPetDragging=true;stop();});document.addEventListener('dragend',()=>{window.quotaPetDragging=false;});document.addEventListener('drop',()=>{window.quotaPetDragging=false;});
  reduced.addEventListener('change',()=>{if(idle||roaming)stop();else startAnimation();});
  setInterval(check,1000);
  new ResizeObserver(align).observe($('provider-strip'));
  function summon(role,action){if(!state||state.expanded||nativeSuspended||document.hidden||state.paused)return;roamWanted=true;if(state.settings.petPlacement==='title')showIdle(false,role,true,action);else roam(true,role,action);}
  window.QuotaPets={get previewSettings(){return temporary;},cancelPreview,previewAction(action,config){cancelPreview();previousWanted=roamWanted;temporary={...config,petRoam:true};state={...latestState,settings:{...latestState.settings,...temporary}};$('island').dataset.petBackground=config.petBackground;summon(config.petCharacter,action==='walk'?undefined:action);temporaryTimer=setTimeout(cancelPreview,12000);},action:(action,role)=>{if(Object.hasOwn(QuotaPetBehavior.durations,action))summon(role,action);else if(action==='walk')summon(role);},previewIdle(role){if(state&&!state.expanded&&!nativeSuspended&&!document.hidden&&!state.paused)showIdle(true,role);},roam:role=>summon(role),update(next){latestState=next;if(temporary&&next.expanded)cancelPreview();if(temporary)next={...next,settings:{...next.settings,...temporary}};if(state&&((state.settings.petCharacter??'claude')!==(next.settings.petCharacter??'claude')||state.settings.petPlacement!==next.settings.petPlacement)&&(roaming||idle))stop();if(state?.settings.petRoam===true&&next.settings.petRoam===false)roamWanted=false;state=next;chooseStyle(next.settings.petStyle);check();align();},preview(){if(state&&!state.expanded)alert({provider:'claude',id:'claude',label:'每週',remaining:15,reset:new Date(Date.now()+86400000).toISOString(),level:1},true);}};
})();
