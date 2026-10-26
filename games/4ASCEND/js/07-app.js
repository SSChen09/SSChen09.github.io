/* 4ASCEND · 07 · 对局流程、主题切换、启动与事件绑定
 * 经典脚本（非 module）：顶层 const/let 与其他脚本共享全局词法作用域。
 */
'use strict';

/* ================= game flow ================= */
function newGame(){
  stopAuto();
  replay.active=false;replay.live=null;
  $('#replaybar').classList.remove('show');
  locked=false;            // 清掉可能残留的 AI 等待锁
  newState();
  buildBoard();fitBoard();
  S.record.initial=makeSnapshot();
  refreshThreats();
  renderAll();renderRecord();
  /* 放在 newState 之后：这时 S.over 才是 false，场景判定才会回到主题曲 */
  syncSceneMusic(false);
  if(mode==='ai')maybeAI();
}

function onCell(i){
  if(locked||replay.active)return;
  /* 联机时落子要先过网络层：自己这手可能是「发给房主」，对手那半场则直接忽略 */
  if(typeof netHandleCell==='function'&&netHandleCell(i))return;
  play(i,false);
}

/* 「新对局」的统一入口：本地直接重开，联机则变成一次「请求再来一局」，
 * 否则双方各自 newGame 会得到两份不同的棋（随机数不一样），必然走岔。 */
function requestNewGame(){
  if(typeof netRequestRematch==='function'&&typeof NET!=='undefined'&&NET.active){
    netRequestRematch();
    return;
  }
  newGame();
}

/* 「重新开始」= 把这一局从头再走一遍。
 * 与「新游戏」的差别只在记录：新游戏会连对局记录一起换新（新的开局时间戳），
 * 重新开始沿用本局那份记录头（开局时间、设置），只把已走的步数清空，
 * 所以导出的棋谱里仍然看得出这一局是从什么时候开始的。 */
function restartGame(){
  stopAuto();
  replay.active=false;replay.live=null;
  $('#replaybar').classList.remove('show');
  locked=false;
  const rec=S.record;
  newState();          // 这里会新建一份 record，下面换回本局那一份
  if(rec){
    rec.steps=[];rec.result=null;rec.forkedFrom=null;
    S.record=rec;
  }
  buildBoard();fitBoard();
  S.record.initial=makeSnapshot();
  refreshThreats();
  renderAll();renderRecord();
  syncSceneMusic(false);
  if(mode==='ai')maybeAI();
}


/* ================= theme management ================= */
let currentTheme = 'default';

function setTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelectorAll('#seg-theme .seg-btn').forEach(b =>
    b.classList.toggle('on', b.dataset.theme === theme));
  localStorage.setItem('4ascend-theme', theme);
  applyMusicTheme();   // 主题切换后同步换曲风（正在播放时平滑过渡）
}

function initTheme() {
  const savedTheme = localStorage.getItem('4ascend-theme') || 'default';
  setTheme(savedTheme);
}


/* ================= boot & events ================= */
buildBoard();
newState();
S.record.initial=makeSnapshot();
refreshThreats();
renderAll();
renderRecord();
fitBoard();
/* 落盘的特效开关要在首帧之前落到根元素上：CSS 靠 html.fx-off 兜底，
   晚一步就会先闪一下特效再消失 */
document.documentElement.classList.toggle('fx-off',!fxOn);
initTheme();
initMusic();
initAiMode();
MUS.wantStart=true;  // 等待首次手势后自动开始

$('#board').addEventListener('click',e=>{
  const cell=e.target.closest('.cell');
  if(!cell)return;
  if(!AC)ac();
  ensureMusic();
  onCell(+cell.dataset.i);
});
document.addEventListener('pointerdown',()=>{if(!AC)ac();ensureMusic();},{once:true});
window.addEventListener('resize',fitBoard);

$('#btn-new').addEventListener('click',()=>requestNewGame());
$('#btn-rules').addEventListener('click',()=>$('#modal').classList.add('open'));
$('#btn-close').addEventListener('click',()=>$('#modal').classList.remove('open'));
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')$('#modal').classList.remove('open');});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    $('#modal').classList.remove('open');
    $('#setmodal').classList.remove('open');
    closeCtx();
  }
  if(!replay.active)return;
  if(e.key==='ArrowLeft'){replayTo(replay.index-1);}
  if(e.key==='ArrowRight'){replayTo(replay.index+1);}
});

/* ---------- 终局后：点击任意处 / 按空格 再来一局 ---------- */
function canRestart(){
  if(!S.over||replay.active)return false;
  /* 结束这局的那一次点击会紧跟着冒泡上来，用时间戳挡掉 */
  if(performance.now()-(S.overAt||0)<400)return false;
  if($('#drawer').classList.contains('open'))return false;
  if(document.querySelector('.modal.open'))return false;
  return true;
}
function isUIControl(t){
  if(!t||!t.closest)return false;
  if(t.closest('.drawer,.modal,.replaybar,input,select,textarea,a'))return true;
  const b=t.closest('button');
  return !!(b&&!b.classList.contains('cell'));   // 棋盘格本身就是 button，不算控件
}
document.addEventListener('click',e=>{
  if(!canRestart())return;
  if(isUIControl(e.target))return;
  requestNewGame();
});
document.addEventListener('keydown',e=>{
  if(e.key!==' '&&e.code!=='Space')return;
  if(!canRestart())return;
  /* 菜单开着时空格归菜单（焦点在某一项上，浏览器会自己点它），别再顺手开一局 */
  if(CTX.classList.contains('open'))return;
  const t=e.target;
  if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'))return;
  e.preventDefault();   // 同时阻止焦点按钮被空格「按下」
  requestNewGame();
});

/* 设置面板：音效 / 音乐 / AI / 主题分组 */
/* 音效开关：菜单与设置面板共用这一个入口，两处状态才不会走岔，也才会落盘 */
function setSfxWanted(on){
  soundOn=!!on;
  try{localStorage.setItem('4ascend-sound',soundOn?'1':'0');}catch(e){}
  syncSoundUI();
}
function syncSoundUI(){
  $('#lbl-sound').textContent=soundOn?'开':'关';
  document.querySelectorAll('#seg-sound .seg-btn').forEach(b=>
    b.classList.toggle('on',(b.dataset.sound==='1')===soundOn));
  syncVolUI();
}

/* 视觉特效总开关：设置面板与右键菜单共用这一个入口，两处状态才不会走岔。
 * 关掉时要把「正在播的」一并收干净——否则半空中的碎片会一直飘到动画结束，
 * 或者面板停在抖动中途，看起来像卡死了。 */
function setFxWanted(on){
  on=!!on;
  const was=fxOn;
  fxOn=on;
  try{localStorage.setItem('4ascend-fx',on?'1':'0');}catch(e){}
  document.documentElement.classList.toggle('fx-off',!on);
  if(!on)cutFx();
  syncFxUI();
  syncCtxMenu();
  if(was!==on)toast(on?'视觉特效：开':'视觉特效：关');
}
function syncFxUI(){
  const l=$('#lbl-fx');
  if(l)l.textContent=fxOn?'开':'关';
  document.querySelectorAll('#seg-fx .seg-btn').forEach(b=>
    b.classList.toggle('on',(b.dataset.fx==='1')===fxOn));
}
/* 收掉正在进行的特效：碎片层、抖动态、飘在棋盘上的临时层、震屏与晕影。
 * 碎片层被撤掉时，败者面板必须补成残骸，不能留在「正常」状态。 */
function cutFx(){
  document.querySelectorAll('.shatter').forEach(n=>n.remove());
  document.querySelectorAll('.panel.doomed').forEach(n=>n.classList.remove('doomed'));
  if(floats)floats.textContent='';
  document.body.classList.remove('hit');
  if(S&&S.over&&S.winner&&!replay.active){
    wrecked=other(S.winner);
    renderHUD();
  }
  /* 3D 倾斜模块是 IIFE，够不到这里，用事件通知它回正 */
  document.dispatchEvent(new CustomEvent('fxchange',{detail:{on:false}}));
}
/* 音量滑块：数值 + 当前是否静音，一并反映到标签上 */
function syncVolUI(){
  const sv=$('#in-svol'),mv=$('#in-mvol');
  if(sv){
    sv.value=sfxVol;
    $('#lbl-svol').textContent=sfxVol+'%'+(soundOn?'':'（静音）');
  }
  if(mv){
    mv.value=musicVol;
    /* 跟着「用户的开关」走，与 #lbl-music 保持一致 */
    $('#lbl-mvol').textContent=musicVol+'%'+(musicWanted()?'':'（静音）');
  }
}
let lastVolPreview=0;
$('#in-svol').addEventListener('input',e=>{
  setSfxVol(+e.target.value);
  syncVolUI();
  /* 拖动时试听，限流避免连续触发糊成一片 */
  const now=performance.now();
  if(soundOn&&now-lastVolPreview>110){lastVolPreview=now;sfx('place',1);}
});
$('#in-mvol').addEventListener('input',e=>{
  setMusicVol(+e.target.value);
  syncVolUI();
});
$('#seg-sound').addEventListener('click',e=>{
  const b=e.target.closest('.seg-btn');if(!b)return;
  setSfxWanted(b.dataset.sound==='1');
  if(soundOn)sfx('place');
});
$('#seg-music').addEventListener('click',e=>{
  const b=e.target.closest('.seg-btn');if(!b)return;
  MUS.wantStart=false;
  const want=b.dataset.music==='1';
  /* 和「用户想要的状态」比，而不是和「此刻是否在响」比：
     首次点击前音乐还没启动，用 MUS.on 判断会让「关」点了没反应 */
  if(want!==musicWanted())toggleMusic(want);
  syncVolUI();
});
$('#seg-ai').addEventListener('click',e=>{
  const b=e.target.closest('.seg-btn');if(!b)return;
  const k=b.dataset.ai;
  if(!AI_LEVELS[k])return;
  aiLevel=k;
  localStorage.setItem('4ascend-ai',aiLevel);
  initAiMode();
  syncAiCustomUI();
  const c=aiCfg();
  toast('AI 难度：'+c.label+(c.kind==='mcts'?' · 搜索 '+(c.budget/1000).toFixed(2)+' 秒':' · 一步评分'));
  renderAll();
});
/* 自定义难度：参数一改就存盘，下一手 AI 即生效，不必重开对局 */
$('#in-ai-budget').addEventListener('input',e=>{
  aiCustom.budget=+e.target.value;
  saveAiCustom();syncAiCustomUI();
});
$('#in-ai-blunder').addEventListener('input',e=>{
  aiCustom.blunder=+e.target.value;
  saveAiCustom();syncAiCustomUI();
});
$('#seg-theme').addEventListener('click',e=>{
  const b=e.target.closest('.seg-btn');if(!b)return;
  setTheme(b.dataset.theme);
  const m=MUSIC[b.dataset.theme];
  if(m)toast('主题：'+b.textContent+' · 配乐：'+m.label);
});
$('#seg-fx').addEventListener('click',e=>{
  const b=e.target.closest('.seg-btn');if(!b)return;
  setFxWanted(b.dataset.fx==='1');
});
$('#seg-hints').addEventListener('click',e=>{
  const b=e.target.closest('.seg-btn');if(!b)return;
  hintsOn=b.dataset.hints==='1';
  localStorage.setItem('4ascend-hints',hintsOn?'1':'0');
  syncHintsUI();
  renderAll();
  toast(hintsOn?'残影与提示：开':'残影与提示：关');
});
function syncHintsUI(){
  $('#lbl-hints').textContent=hintsOn?'开':'关';
  document.querySelectorAll('#seg-hints .seg-btn').forEach(b=>
    b.classList.toggle('on',(b.dataset.hints==='1')===hintsOn));
}
$('#btn-mode').addEventListener('click',e=>{
  /* 联机中不允许在本地切模式：那只会改到本机的 mode 变量，
     对手那边仍在联机，两边对「谁该走」的判断会立刻分家 */
  if(typeof NET!=='undefined'&&NET.active){
    /* 对手已经走了、桌子作废：先干净地退出联机，再让模式切换照常进行。
     * 否则会留下「本地已换模式、联机状态还挂着」的半吊子，点棋盘会往死桌子上发消息 */
    if(!NET.tableDead){toast('联机中不能切换模式，请先断开连接');return;}
    netLeaveToLocal();
  }
  mode=mode==='ai'?'pvp':'ai';
  e.currentTarget.textContent=mode==='ai'?'模式：挑战魔族':'模式：双人对战';
  syncSetForm();
  newGame();
});

/* 设置面板 */
function syncAiCustomUI(){
  $('#in-ai-budget').value=aiCustom.budget;
  $('#in-ai-blunder').value=aiCustom.blunder;
  $('#lbl-ai-budget').textContent=(aiCustom.budget/1000).toFixed(2)+' 秒';
  $('#lbl-ai-blunder').textContent=aiCustom.blunder+'%';
  $('#ai-custom').classList.toggle('on',aiLevel==='custom');
  const c=customCfg();
  $('#ai-custom-sum').textContent=c.kind==='mcts'
    ? '当前：树搜索 '+(c.budget/1000).toFixed(2)+' 秒 · 失误率 '+aiCustom.blunder+'%'
    : '当前：一步评分（防守 '+Math.round(c.blockMul*100)+'%）· 失误率 '+aiCustom.blunder+'%';
}
function syncSetForm(){
  $('#in-size').value=CFG.size;
  $('#in-hp').value=CFG.maxHp;
  $('#in-plant').value=Math.round(CFG.plantChance*100);
  $('#lbl-size').textContent=CFG.size+' × '+CFG.size;
  $('#lbl-hp').textContent=CFG.maxHp+' 点';
  $('#lbl-plant').textContent=Math.round(CFG.plantChance*100)+'%';
  document.querySelectorAll('#seg-mode .seg-btn').forEach(b=>b.classList.toggle('on',b.dataset.mode===mode));
  $('#btn-mode').textContent=mode==='ai'?'模式：挑战魔族':mode==='net'?'模式：远程联机':'模式：双人对战';
  syncSoundUI();syncMusicUI();initAiMode();syncFxUI();syncHintsUI();syncAiCustomUI();
  document.querySelectorAll('#seg-theme .seg-btn').forEach(b=>b.classList.toggle('on',b.dataset.theme===currentTheme));
}
$('#btn-set').addEventListener('click',()=>{syncSetForm();$('#setmodal').classList.add('open');});
$('#btn-set-close').addEventListener('click',()=>$('#setmodal').classList.remove('open'));
$('#setmodal').addEventListener('click',e=>{if(e.target.id==='setmodal')$('#setmodal').classList.remove('open');});
$('#in-size').addEventListener('input',e=>{$('#lbl-size').textContent=e.target.value+' × '+e.target.value;});
$('#in-hp').addEventListener('input',e=>{$('#lbl-hp').textContent=e.target.value+' 点';});
$('#in-plant').addEventListener('input',e=>{$('#lbl-plant').textContent=e.target.value+'%';});
$('#seg-mode').addEventListener('click',e=>{
  const b=e.target.closest('.seg-btn');
  if(!b)return;
  mode=b.dataset.mode;
  document.querySelectorAll('#seg-mode .seg-btn').forEach(x=>x.classList.toggle('on',x===b));
  $('#btn-mode').textContent=mode==='ai'?'模式：挑战魔族':'模式：双人对战';
});
$('#btn-apply').addEventListener('click',()=>{
  /* 联机中的棋盘大小/生命由房主在开局时统一广播，本地改了也不会生效，
     干脆挡住，免得玩家以为改完了却还是老样子 */
  if(typeof NET!=='undefined'&&NET.active){
    /* 同上：桌子已废就别拦着，先退出联机再改设置 */
    if(!NET.tableDead){
      toast('联机中由房主决定对局设置，请先断开连接');
      return;
    }
    netLeaveToLocal();
  }
  CFG.size=+$('#in-size').value;
  CFG.maxHp=+$('#in-hp').value;
  CFG.plantChance=(+$('#in-plant').value)/100;
  $('#setmodal').classList.remove('open');
  newGame();
  toast('新对局：'+CFG.size+'×'+CFG.size+' · 生命 '+CFG.maxHp);
});

/* 记录抽屉 */
$('#btn-record').addEventListener('click',()=>{
  renderRecord();
  $('#drawer').classList.add('open');
});
$('#btn-drawer-close').addEventListener('click',()=>$('#drawer').classList.remove('open'));

/* 记录抽屉：逐手回放 */
$('#steps').addEventListener('click',e=>{
  const li=e.target.closest('li');
  if(!li)return;
  enterReplay(+li.dataset.k);
});
$('#btn-replay').addEventListener('click',()=>{
  enterReplay(0);
  startAuto();
  $('#drawer').classList.remove('open');
});
$('#btn-export').addEventListener('click',exportJSON);
$('#btn-copy').addEventListener('click',copyText);
$('#btn-import').addEventListener('click',()=>$('#in-file').click());
$('#in-file').addEventListener('change',e=>{
  const f=e.target.files&&e.target.files[0];
  if(!f)return;
  const rd=new FileReader();
  rd.onload=()=>{
    try{importRecord(JSON.parse(rd.result));}
    catch(err){toast('棋谱格式有误，无法导入');}
    e.target.value='';
  };
  rd.readAsText(f);
});
$('#btn-continue').addEventListener('click',()=>{
  const k=replay.active?replay.index:replay.total;
  const snap=k===0?S.record.initial:S.record.steps[k-1].snapshot;
  if(snap.over){toast('此步对局已结束，无法继续');return;}
  const keep=JSON.parse(JSON.stringify(S.record));
  keep.steps=keep.steps.slice(0,k);
  keep.result=null;
  keep.forkedFrom=k;
  stopAuto();
  replay.active=false;replay.live=null;
  $('#replaybar').classList.remove('show');
  CFG.size=keep.settings.size;
  CFG.maxHp=keep.settings.maxHp;
  CFG.plantChance=keep.settings.plantChance;
  mode=keep.settings.mode==='pvp'?'pvp':'ai';
  newState();
  buildBoard();fitBoard();
  applySnapshot(snap);
  S.record=keep;
  refreshThreats(true);
  renderAll();renderRecord();
  syncSceneMusic(false);   // 分叉续下 → 回到主题曲（快照已应用，S.over 是分叉点上的状态）
  $('#drawer').classList.remove('open');
  toast('已回到第 '+k+' 步，继续对局');
  maybeAI();
});

/* 回放控制 */
$('#rp-first').addEventListener('click',()=>{stopAuto();replayTo(0);});
$('#rp-prev').addEventListener('click',()=>{stopAuto();replayTo(replay.index-1);});
$('#rp-next').addEventListener('click',()=>{stopAuto();replayTo(replay.index+1);});
$('#rp-last').addEventListener('click',()=>{stopAuto();replayTo(replay.total);});
$('#rp-play').addEventListener('click',()=>{replay.timer?stopAuto():startAuto();});
$('#rp-exit').addEventListener('click',exitReplay);
$('#rp-slider').addEventListener('input',e=>{stopAuto();replayTo(+e.target.value);});
$('#rp-speed').addEventListener('change',e=>{
  replay.speed=+e.target.value;
  if(replay.timer)startAuto();
});


/* ================= 右键快捷菜单 ================= */
/* 覆盖浏览器默认菜单：右键任意处弹出「背景音乐 / 音效 / 新游戏 / 重新开始」。
 * 两处例外放行系统菜单：表单控件上，以及在弹层里选中了文字时（规则里的字还要能右键复制）。 */
const CTX=$('#ctxmenu');
const CTX_GAP=8;      // 与视口边缘至少留这么多，免得贴着屏幕边看不清

const ctxItem=act=>CTX.querySelector('[data-act="'+act+'"]');

/* 菜单文案与圆点每次都按当前状态重算：音乐可能在设置面板里被改过，
 * 音效也可能被这一项自己改掉，缓存下来一定会不同步。 */
function syncCtxMenu(){
  const m=musicWanted(),s=!!soundOn;
  const mi=ctxItem('music'),si=ctxItem('sfx'),fi=ctxItem('fx'),ri=ctxItem('restart');

  mi.classList.toggle('on',m);
  mi.querySelector('.ctx-txt').textContent=m?'禁用背景音乐':'启用背景音乐';
  mi.querySelector('.ctx-val').textContent=m?'开':'关';

  si.classList.toggle('on',s);
  si.querySelector('.ctx-txt').textContent=s?'禁用音效':'启用音效';
  si.querySelector('.ctx-val').textContent=s?'开':'关';

  fi.classList.toggle('on',fxOn);
  fi.querySelector('.ctx-txt').textContent=fxOn?'关闭全部特效':'开启全部特效';
  fi.querySelector('.ctx-val').textContent=fxOn?'开':'关';

  /* 一步未走又没终局，「重新开始」没有可重来的东西 */
  ri.disabled=!S.over&&!replay.active&&S.moves===0;
}

function openCtx(x,y){
  syncCtxMenu();
  /* 用 offsetWidth/Height 量尺寸：这是布局尺寸，不受入场 scale 动画影响，
     getBoundingClientRect 在动画刚开始时量到的是缩小后的值 */
  const w=CTX.offsetWidth,h=CTX.offsetHeight;
  const vw=window.innerWidth,vh=window.innerHeight;
  let left=x,top=y,flip='';
  /* 放不下就往指针另一侧翻，翻转后原点跟着换，动画才从贴着指针的角长出来 */
  if(left+w>vw-CTX_GAP){left=x-w;flip+='x';}
  if(top+h>vh-CTX_GAP){top=y-h;flip+='y';}
  /* 翻转后仍可能贴边（指针本来就挨着屏幕边），最后统一夹一次，保证四周都留出空隙 */
  left=Math.max(CTX_GAP,Math.min(left,vw-CTX_GAP-w));
  top=Math.max(CTX_GAP,Math.min(top,vh-CTX_GAP-h));
  CTX.style.left=Math.round(left)+'px';
  CTX.style.top=Math.round(top)+'px';
  CTX.dataset.flip=flip;
  CTX.classList.add('open');
  CTX.setAttribute('aria-hidden','false');
  /* 焦点给第一项，键盘用户可以直接上下选、回车确认 */
  const first=CTX.querySelector('.ctx-item:not(:disabled)');
  if(first)try{first.focus({preventScroll:true});}catch(e){first.focus();}
}

function closeCtx(){
  if(!CTX.classList.contains('open'))return;
  /* 先交还焦点再藏起来：给一个仍聚焦的元素挂 aria-hidden 是无效的，
     而且焦点留在菜单里的话，Esc 之后按空格会落到那个看不见的按钮上 */
  if(CTX.contains(document.activeElement))document.activeElement.blur();
  CTX.classList.remove('open');
  CTX.setAttribute('aria-hidden','true');
}

/* 音乐开关：读写的都是「用户意图」（musicWanted 落盘在 localStorage），
   与「此刻是否在响」分开，所以首次点击前点「禁用」也能立刻生效 */
function setMusicWanted(on){
  MUS.wantStart=false;   // 用户已明确表态，不再等首次手势自动起播
  if(on!==musicWanted())toggleMusic(on);
  syncVolUI();
  toast(on?'背景音乐：开':'背景音乐：关');
}

document.addEventListener('contextmenu',e=>{
  const t=e.target;
  if(!t||!t.closest)return;
  if(CTX.contains(t)){e.preventDefault();return;}   // 在菜单上右键：别把它自己挪走
  if(t.closest('input,textarea,select'))return;
  if(t.closest('.sheet')&&String(window.getSelection()||''))return;
  e.preventDefault();
  openCtx(e.clientX,e.clientY);
});

CTX.addEventListener('click',e=>{
  const it=e.target.closest('.ctx-item');
  if(!it||it.disabled)return;
  const act=it.dataset.act;
  closeCtx();
  if(act==='music')setMusicWanted(!musicWanted());
  else if(act==='sfx'){setSfxWanted(!soundOn);if(soundOn)sfx('place');}
  else if(act==='fx')setFxWanted(!fxOn);
  else if(act==='new'){requestNewGame();toast('新对局');}
  else if(act==='restart'){restartGame();toast('已重新开始这一局');}
  /* 动作已经改掉了状态，把文案写回 DOM：虽然下次打开也会重算，
     但让隐藏的菜单保持诚实，省得以后有别处直接读它的文本 */
  syncCtxMenu();
});

CTX.addEventListener('keydown',e=>{
  const items=[...CTX.querySelectorAll('.ctx-item:not(:disabled)')];
  if(!items.length)return;
  const i=items.indexOf(document.activeElement);
  if(e.key==='ArrowDown'){e.preventDefault();items[(i+1)%items.length].focus();}
  else if(e.key==='ArrowUp'){e.preventDefault();items[(i-1+items.length)%items.length].focus();}
  else if(e.key==='Home'){e.preventDefault();items[0].focus();}
  else if(e.key==='End'){e.preventDefault();items[items.length-1].focus();}
  /* Tab 先让浏览器把焦点移走，再关菜单；直接关会把这次 Tab 一起吞掉 */
  else if(e.key==='Tab'){setTimeout(closeCtx,0);}
});

/* 菜单是 fixed 定位，页面一滚就会和指针脱节，所以滚动/缩放/失焦都直接收起。
 * pointerdown 用捕获：右键的第一步是 pointerdown，这样在别处右键时
 * 旧菜单先关、紧接着 contextmenu 再在新位置打开，看起来就是「挪过去了」 */
document.addEventListener('pointerdown',e=>{
  if(CTX.contains(e.target))return;
  closeCtx();
},true);
window.addEventListener('scroll',closeCtx,{passive:true,capture:true});
window.addEventListener('resize',closeCtx);
window.addEventListener('blur',closeCtx);

syncSetForm();
