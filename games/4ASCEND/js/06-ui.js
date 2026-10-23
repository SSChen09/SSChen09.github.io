/* 4ASCEND · 06 · 特效、渲染、对局记录、回放、导入导出
 * 经典脚本（非 module）：顶层 const/let 与其他脚本共享全局词法作用域。
 */
'use strict';

/* ================= fx ================= */
/* 下面这些「演出」都受 fxOn 控制。关掉特效时函数直接返回，连临时 DOM 都不建，
 * 不是靠 CSS 藏起来——省得白白创建几十个节点又立刻丢掉。
 * 注意：棋盘上的残影、ASCEND 虚线、金光预警是提示（hintsOn），不在这里拦。 */
function animateAscend(stones,player){
  if(!fxOn)return;
  const px=cellEls[0].offsetWidth;
  stones.forEach((s,k)=>{
    const el=document.createElement('div');
    el.className='spirit '+(player===ELF?'spirit-w':'spirit-b')+(s.plant?' spirit-plant':'');
    const r=Math.floor(s.idx/N),c=s.idx%N;
    el.style.left=((c+.5)*px)+'px';
    el.style.top=((r+.5)*px)+'px';
    el.style.animationDelay=(k*48)+'ms';
    floats.appendChild(el);
    setTimeout(()=>el.remove(),1100+k*48);
  });
}
/* 落子：一圈扩散的涟漪 + 一点落点柔光，白/黑两色各有色调 */
function animateDrop(idx,player){
  if(!fxOn)return;
  const px=cellEls[0]&&cellEls[0].offsetWidth;
  if(!px)return;
  const r=Math.floor(idx/N),c=idx%N;
  const x=(c+.5)*px,y=(r+.5)*px;
  const ring=document.createElement('div');
  ring.className='ripple '+(player===ELF?'r-w':'r-b');
  ring.style.left=x+'px';ring.style.top=y+'px';
  floats.appendChild(ring);
  setTimeout(()=>ring.remove(),640);
  const glow=document.createElement('div');
  glow.className='dropglow '+(player===ELF?'g-w':'g-b');
  glow.style.left=x+'px';glow.style.top=y+'px';
  floats.appendChild(glow);
  setTimeout(()=>glow.remove(),560);
}
function animateSprout(i){
  if(!fxOn)return;
  const px=cellEls[0].offsetWidth;
  const el=document.createElement('div');
  el.className='sprout';
  const r=Math.floor(i/N),c=i%N;
  el.style.left=((c+.5)*px)+'px';
  el.style.top=((r+.5)*px)+'px';
  floats.appendChild(el);
  setTimeout(()=>el.remove(),900);
}
/* 伤害反馈三件套：飘字 + 震屏 + 红色晕影，一并在特效开关里 */
function animateDamage(amount,victim){
  if(!fxOn)return;
  const el=document.createElement('div');
  el.className='dmg';
  el.textContent=NAMES[victim].slice(0,2)+'  -'+amount;
  el.style.left='50%';el.style.top='44%';
  floats.appendChild(el);
  setTimeout(()=>el.remove(),1200);
  document.body.classList.add('hit');
  setTimeout(()=>document.body.classList.remove('hit'),520);
}
function toast(msg){
  const t=$('#toast');
  t.textContent=msg;t.classList.add('show');
  clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),1900);
}


/* ================= 淘汰：败者面板炸成碎片 ================= */
/* 做法：把面板按 6×5 切成小片，每片是一块用 overflow 裁切出来的「面板副本」，
 * 所以碎片上带着真实内容（生命条、棋子数、徽章都在），而不是一堆纯色方块。
 * 先把碎片层建好但用 animation-play-state 冻住，等面板抖完再一起放开。 */
const SHARD_COLS=6,SHARD_ROWS=5;

/* 面板露出多少（0~1）：手机上面板排在棋盘下方，可能在视野外 */
function visibleRatio(el){
  const r=el.getBoundingClientRect(),vh=window.innerHeight;
  if(!r.height)return 0;
  return Math.max(0,Math.min(r.bottom,vh)-Math.max(r.top,0))/r.height;
}

function shatterPanel(player){
  const panel=document.getElementById('panel-'+player);
  if(!panel||panel.classList.contains('destroyed'))return;
  /* 特效关着就不炸：直接落到残骸态。
   * 「败者的框塌了」本身是信息，不能省；被省掉的只是那 30 片碎片 */
  if(!fxOn){wrecked=player;panel.classList.add('destroyed');return;}
  /* 看不见就先滚过去，否则手机上这局「炸了」玩家根本没看见 */
  if(visibleRatio(panel)>=.6||window.matchMedia('(prefers-reduced-motion:reduce)').matches){
    burstPanel(player);return;
  }
  try{panel.scrollIntoView({block:'center',behavior:'smooth'});}
  catch(e){panel.scrollIntoView();}
  /* 等滚动落定再拍快照，否则碎片会照旧位置生成。
   * 平滑滚动没有可靠的结束事件，这里轮询到看得见为止；超时就硬跳一次兜底 */
  let tries=0;
  const wait=()=>{
    if(!S.over||!S.winner||S.winner===player)return;   // 期间开了新局就不炸
    if(visibleRatio(panel)>=.55){
      setTimeout(()=>burstPanel(player),80);   // 再等一帧，位置稳定下来
      return;
    }
    if(++tries>12){
      try{panel.scrollIntoView({block:'center'});}catch(e){}
      burstPanel(player);return;
    }
    setTimeout(wait,60);
  };
  wait();
}

function burstPanel(player){
  const panel=document.getElementById('panel-'+player);
  if(!panel||panel.classList.contains('destroyed'))return;
  const reduce=window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  const r=panel.getBoundingClientRect();

  /* 减弱动效 / 量不到尺寸：不炸，直接落到残骸态 */
  if(reduce||!r.width||!r.height){
    wrecked=player;panel.classList.add('destroyed');return;
  }

  const host=document.createElement('div');
  host.className='shatter';
  host.setAttribute('aria-hidden','true');
  host.style.cssText='left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;height:'+r.height+'px';

  const cw=r.width/SHARD_COLS,ch=r.height/SHARD_ROWS;
  const cx=r.width/2,cy=r.height/2;
  const frag=document.createDocumentFragment();

  for(let row=0;row<SHARD_ROWS;row++){
    for(let col=0;col<SHARD_COLS;col++){
      const x=col*cw,y=row*ch;
      const tile=document.createElement('div');
      tile.className='shard';
      tile.style.cssText='left:'+x.toFixed(1)+'px;top:'+y.toFixed(1)+'px;'+
        'width:'+(cw+.6).toFixed(1)+'px;height:'+(ch+.6).toFixed(1)+'px';

      const inner=panel.cloneNode(true);
      inner.removeAttribute('id');
      /* 副本里的 id 会和真面板撞车（renderHUD 每次都查 #badge-2），全部摘掉 */
      inner.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
      inner.classList.remove('destroyed','doomed');
      /* 面板本身是「6% 白的玻璃」压在页面底色上，单拎出来飞到半空会几乎透明，
       * 所以给副本垫一层不透明的主题底色，碎片才有「实心材质」的分量感 */
      inner.style.cssText='position:absolute;left:'+(-x).toFixed(1)+'px;top:'+(-y).toFixed(1)+'px;'+
        'width:'+r.width+'px;height:'+r.height+'px;margin:0;transform:none;animation:none;'+
        'background-color:var(--bg);'+
        'background-image:linear-gradient(165deg,var(--panel-bg1),var(--panel-bg2))';
      tile.appendChild(inner);

      /* 朝外炸：方向取碎片中心相对面板中心，再叠一点随机让边缘不那么整齐 */
      const tx=x+cw/2,ty=y+ch/2;
      const ang=Math.atan2(ty-cy,tx-cx)+(Math.random()-.5)*.55;
      const spd=60+Math.random()*110+Math.hypot(tx-cx,ty-cy)*.45;
      tile.style.setProperty('--dx',(Math.cos(ang)*spd).toFixed(1)+'px');
      tile.style.setProperty('--dy',(Math.sin(ang)*spd*.72+96+Math.random()*70).toFixed(1)+'px');
      tile.style.setProperty('--rot',((Math.random()-.5)*150).toFixed(0)+'deg');
      tile.style.setProperty('--delay',(Math.random()*.075).toFixed(3)+'s');
      tile.style.setProperty('--dur',(.74+Math.random()*.26).toFixed(2)+'s');

      /* 四角各歪一点，缝口才像「碎」而不是「切成格子」。
       * 只往里收：往外会被 overflow:hidden 削平，白费 */
      const jx=()=>-Math.random()*cw*.14,jy=()=>-Math.random()*ch*.14;
      tile.style.clipPath='polygon('+
        jx().toFixed(1)+'px '+jy().toFixed(1)+'px,'+
        (cw+jx()).toFixed(1)+'px '+jy().toFixed(1)+'px,'+
        (cw+jx()).toFixed(1)+'px '+(ch+jy()).toFixed(1)+'px,'+
        jx().toFixed(1)+'px '+(ch+jy()).toFixed(1)+'px)';
      frag.appendChild(tile);
    }
  }
  host.appendChild(frag);

  /* 爆点白光 + 冲击波 */
  const core=document.createElement('div');core.className='shock-core';host.appendChild(core);
  const wave=document.createElement('div');wave.className='shock-wave';host.appendChild(wave);

  /* 碎屑：颜色取该阵营的主题色，飞得更远更快 */
  const tint=player===ELF?'127,227,212':'255,107,125';
  for(let i=0;i<26;i++){
    const b=document.createElement('i');
    b.className='debris';
    const size=2.5+Math.random()*5.5;
    const ang=Math.random()*Math.PI*2;
    const spd=90+Math.random()*170;
    b.style.cssText='left:'+(cx-size/2).toFixed(1)+'px;top:'+(cy-size/2).toFixed(1)+'px;'+
      'width:'+size.toFixed(1)+'px;height:'+size.toFixed(1)+'px;'+
      'background:rgba('+tint+','+(.55+Math.random()*.45).toFixed(2)+')';
    b.style.setProperty('--dx',(Math.cos(ang)*spd).toFixed(1)+'px');
    b.style.setProperty('--dy',(Math.sin(ang)*spd*.6+80+Math.random()*80).toFixed(1)+'px');
    b.style.setProperty('--rot',((Math.random()-.5)*720).toFixed(0)+'deg');
    b.style.setProperty('--delay',(Math.random()*.08).toFixed(3)+'s');
    b.style.setProperty('--dur',(.7+Math.random()*.45).toFixed(2)+'s');
    host.appendChild(b);
  }
  document.body.appendChild(host);

  /* 先抖 300ms 让玩家看清「就是这块框」，再炸 */
  panel.classList.add('doomed');
  sfx('shatter');

  setTimeout(()=>{
    /* 这 300ms 里可能已经开了新局、关了特效，甚至这局的结果都变了。
     * 定时器不能无脑落地，否则残骸会盖到新局（甚至平局）的面板上。 */
    if(!fxOn||!S.over||S.winner!==other(player)||host.parentNode!==document.body)return;
    panel.classList.remove('doomed');
    wrecked=player;
    panel.classList.add('destroyed');
    host.classList.add('on');   // 放开碎片层的动画
  },300);

  setTimeout(()=>host.remove(),2500);
}


/* ================= render ================= */
function renderBoard(){
  armSet=new Set();
  vacSet=new Set();
  if(hintsOn){
    S.threats.forEach(line=>line.forEach(i=>armSet.add(i)));
    vacSet=new Set(S.pending?S.pending.stones.map(s=>s.idx):[]);
  }
  for(let i=0;i<TOTAL;i++){
    const el=cellEls[i],v=S.board[i];
    el.classList.toggle('is-w',v===ELF);
    el.classList.toggle('is-b',v===DEMON);
    el.classList.toggle('has-plant',!!S.plants[i]);
    el.classList.toggle('armed',hintsOn&&armSet.has(i)&&v!==EMPTY);
    el.classList.toggle('threat',hintsOn&&S.threats.has(i));
    el.classList.toggle('vacant',hintsOn&&vacSet.has(i));
  }
  $('#board').dataset.turn=S.turn;
}

function statusText(p){
  if(replay.active)return '回放中';
  if(S.over)return '对局结束';
  if(S.pending&&S.pending.owner!==p)return '危急：对手的 ASCEND 待结算';
  if(S.turn===p)return mode==='ai'&&p===DEMON?'思考中…':'你的回合';
  if(S.pending&&S.pending.owner===p)return 'ASCEND 蓄势中';
  return '等待对手';
}

function renderHUD(){
  for(const p of [ELF,DEMON]){
    const panel=document.getElementById('panel-'+p);
    panel.classList.toggle('active',!S.over&&S.turn===p&&!replay.active);
    /* 淘汰残骸：只有本局败者留残骸；回放到未分胜负的局面时先收起来，退出回放再补回 */
    panel.classList.toggle('destroyed',
      wrecked===p&&S.over&&!!S.winner&&S.winner!==p&&!replay.active);
    panel.querySelector('.hp-fill').style.width=(S.hp[p]/S.maxHp*100)+'%';
    panel.querySelector('.hp-num').textContent=S.hp[p]+' / '+S.maxHp;
    panel.querySelector('.stone-count').textContent=countStones(p);
    panel.querySelector('.reserve').innerHTML=S.reserve[p]
      ? '<span class="pip"></span>'.repeat(S.reserve[p])
      : '<span class="none">无</span>';
    panel.querySelector('.status').textContent=statusText(p);
  }
  $('#badge-2').textContent=mode==='ai'?'AI · '+aiCfg().label:'玩家 2';

  const t=$('#turnbar');
  if(replay.active){
    t.innerHTML='<span class="ok">回放中 · 第 '+replay.index+' / '+replay.total+' 步</span>'+
      '<span style="color:var(--muted);letter-spacing:.12em">'+NAMES[S.turn]+' 行动的那一刻</span>';
  }else if(S.over){
    t.innerHTML='<span class="ok">'+(S.winner?NAMES[S.winner]+'获胜':'平局')+'</span>'+
      '<span style="color:var(--muted);letter-spacing:.12em">点击「对局记录」可回放全局</span>';
  }else{
    const col=S.turn===ELF?'var(--elf)':'var(--demon)';
    let extra='';
    if(S.pending&&hintsOn){
      extra='<span class="warn">⚠ '+NAMES[S.pending.owner]+'的 ASCEND 待结算 · '+
            S.pending.count+' 枚 · '+S.pending.count+' 点伤害 · 落在残影处可反击</span>';
    }else if(S.pending){
      extra='<span class="warn">⚠ '+NAMES[S.pending.owner]+'的 ASCEND 待结算 · '+
            S.pending.count+' 点伤害</span>';
    }else if(S.threats.size&&hintsOn){
      extra='<span class="ok">✦ 你有 '+S.threats.size+' 处可以发动 ASCEND</span>';
    }
    t.innerHTML='<span><span class="turn-dot" style="background:'+col+'"></span>'+
                '<b>'+NAMES[S.turn]+'</b> 行动</span>'+extra;
  }

  const hint=$('#hint');
  if(replay.active)hint.textContent='拖动进度条或点击右侧记录，可逐手查看这局的每一次落子与结算。';
  else if(S.over)hint.textContent='对局结束。点击任意处或按空格即可再来一局，也可打开「对局记录」回放。';
  else if(!hintsOn)hint.textContent='';
  else if(S.pending)hint.textContent='对手的 ASCEND 悬在头顶：落在虚影处可反击削弱它，或以更大的 ASCEND 抵消，否则将承受全部伤害。';
  else if(S.threats.size)hint.textContent='金色虚线处落子即可发动 ASCEND，闪烁金光的棋子将一同离盘。';
  else hint.textContent='点击空位落子。连成 4 枚或以上即可发动 ASCEND，注意魔力植物上的棋子会更有力。';

  /* 终局提示条：可点击/空格重开 */
  $('#again').classList.toggle('show',S.over&&!replay.active);

  /* AI 思考统计 */
  const info=$('#ai-info');
  if(aiStat&&!replay.active&&mode==='ai'){
    info.innerHTML=aiStat.level+' · 耗时 <b>'+aiStat.ms+'ms</b>'+
      (aiStat.iters?' · <b>'+aiStat.iters+'</b> 次模拟 · 着法胜率 <b>'+aiStat.wr+'%</b>':'');
  }else info.textContent='';

  $('#log').innerHTML=S.log.slice(-16).reverse().map(x=>'<li>'+x+'</li>').join('');
}

function renderAll(){renderBoard();renderHUD();updateReplayBar();}

function refreshThreats(silent){
  if(S.over||replay.active){S.threats=new Map();S.threatKey='';return;}
  S.threats=computeThreats(S.turn);
  const key=S.turn+':'+[...S.threats.keys()].sort((a,b)=>a-b).join(',');
  if(!silent&&S.threats.size&&key!==S.threatKey)sfx('threat');
  S.threatKey=key;
}


/* ================= record UI ================= */
function renderRecord(){
  const rec=S.record;
  const st=rec.settings;
  const result=S.over
    ? (S.winner?NAMES[S.winner]+' 获胜':'平局')
    : (replay.active?'回放中':'对局进行中');
  $('#rec-meta').innerHTML=
    '<b>'+st.size+' × '+st.size+'</b> 棋盘 · 初始生命 <b>'+st.maxHp+'</b> · 魔力植物 <b>'+
    Math.round(st.plantChance*100)+'%</b> · '+(st.mode==='ai'?'挑战魔族':'双人对战')+'<br>'+
    '共 <b>'+rec.steps.length+'</b> 手 · 结果：<b>'+result+'</b>'+
    (rec.forkedFrom!=null?'<br>本谱由第 '+rec.forkedFrom+' 步分叉而来':'');

  let html='<li data-k="0" class="'+(replay.active&&replay.index===0?'cur':'')+'">'+
    '<span class="no">0</span><span class="who w">—</span><span class="txt">开局（'+st.size+'×'+st.size+'，生命 '+st.maxHp+'）</span></li>';
  html+=rec.steps.map((s,i)=>{
    const cur=replay.active&&replay.index===i+1?' cur':'';
    return '<li data-k="'+(i+1)+'" class="'+cur+'">'+
      '<span class="no">'+s.n+'</span>'+
      '<span class="who '+(s.player===1?'w':'b')+'">'+SHORT[s.player]+'</span>'+
      '<span class="txt">'+s.note+'</span></li>';
  }).join('');
  $('#steps').innerHTML=html;

  const cur=$('#steps li.cur');
  if(cur&&replay.active&&cur.scrollIntoView)cur.scrollIntoView({block:'nearest'});
}

function updateReplayBar(){
  $('#replaybar').classList.toggle('show',replay.active);
  $('#rp-label').textContent='第 '+replay.index+' / '+replay.total+' 步';
  const sl=$('#rp-slider');
  sl.max=replay.total;sl.value=replay.index;
}


/* ================= replay engine ================= */
function replayTo(k){
  const rec=S.record;
  const total=rec.steps.length;
  replay.total=total;
  replay.index=Math.max(0,Math.min(k,total));
  applySnapshot(replay.index===0?rec.initial:rec.steps[replay.index-1].snapshot);
  refreshThreats(true);
  renderAll();
  renderRecord();
}
function enterReplay(k){
  if(!replay.active){
    replay.active=true;
    replay.live=makeSnapshot();
  }
  /* 回放有自己的曲子：结局曲/主题曲都让位，由场景判定统一接管 */
  syncSceneMusic(false);
  stopAuto();
  replayTo(k);
}
function exitReplay(){
  stopAuto();
  replay.active=false;
  $('#replaybar').classList.remove('show');
  if(replay.live){applySnapshot(replay.live);replay.live=null;}
  refreshThreats(true);
  renderAll();renderRecord();
  /* 退回场景判定：本局已分胜负就接回结局曲，否则回到主题曲。
   * 从回放退回来不重复放结局开场乐句（刚才已经听过一遍了） */
  syncSceneMusic(false);
}
function startAuto(){
  if(replay.index>=replay.total)replayTo(0);
  stopAuto();
  $('#rp-play').textContent='暂停';
  replay.timer=setInterval(()=>{
    if(replay.index>=replay.total){stopAuto();return;}
    replayTo(replay.index+1);
  },Math.round(780/replay.speed));
}
function stopAuto(){
  if(replay.timer){clearInterval(replay.timer);replay.timer=null;}
  $('#rp-play').textContent='播放';
}


/* ================= export / import ================= */
function stamp(){
  const d=new Date(),p=n=>String(n).padStart(2,'0');
  return ''+d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes());
}
function recordText(){
  const rec=S.record,st=rec.settings;
  const lines=[];
  lines.push('4ASCEND 对局记录');
  lines.push('棋盘 '+st.size+'×'+st.size+' · 初始生命 '+st.maxHp+' · 魔力植物 '+
             Math.round(st.plantChance*100)+'% · 模式：'+(st.mode==='ai'?'挑战魔族':'双人对战'));
  lines.push('结果：'+(S.over?(S.winner?NAMES[S.winner]+' 获胜':'平局'):'对局进行中')+
             ' · 共 '+rec.steps.length+' 手');
  lines.push('────────────────────────────');
  rec.steps.forEach(s=>{
    lines.push(String(s.n).padStart(3,' ')+'. '+SHORT[s.player]+' ('+s.r+','+s.c+') '+s.note);
  });
  return lines.join('\n');
}
function exportJSON(){
  const data=JSON.parse(JSON.stringify(S.record));
  data.exportedAt=new Date().toISOString();
  if(S.over)data.result={winner:S.winner,hp:[S.hp[1],S.hp[2]],stones:[countStones(ELF),countStones(DEMON)]};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='4ASCEND-'+stamp()+'.json';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),3000);
  toast('棋谱已导出为 JSON');
}
function copyText(){
  const text=recordText();
  const done=()=>toast('文本棋谱已复制');
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done).catch(()=>fallback());
  }else fallback();
  function fallback(){
    const ta=document.createElement('textarea');
    ta.value=text;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy');done();}catch(e){toast('复制失败，请手动导出');}
    ta.remove();
  }
}
function importRecord(data){
  if(!data||data.game!=='4ASCEND'||!data.settings||!data.initial||!Array.isArray(data.steps))
    throw new Error('bad format');
  const size=+data.settings.size;
  if(!(size>=5&&size<=15)||data.initial.board.length!==size*size)throw new Error('bad size');

  stopAuto();
  replay.active=false;replay.live=null;
  $('#replaybar').classList.remove('show');

  CFG.size=size;
  CFG.maxHp=Math.max(1,+data.settings.maxHp||20);
  CFG.plantChance=Math.max(0,Math.min(1,+data.settings.plantChance||0));
  mode=data.settings.mode==='pvp'?'pvp':'ai';
  newState();
  buildBoard();fitBoard();
  S.record=data;
  if(!S.record.initial)S.record.initial=data.initial;
  applySnapshot(data.steps.length?data.steps[data.steps.length-1].snapshot:data.initial);
  refreshThreats(true);
  renderAll();
  replay.active=true;replay.live=makeSnapshot();
  replay.total=data.steps.length;
  $('#replaybar').classList.add('show');
  replayTo(data.steps.length);
  renderRecord();
  /* 导入即进入回放态：直接切回放曲 */
  syncSceneMusic(false);
  toast('棋谱已导入 · 共 '+data.steps.length+' 手');
}
