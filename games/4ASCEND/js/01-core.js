/* 4ASCEND · 01 · 常量、全局状态、棋盘构建、快照与棋谱记录
 * 经典脚本（非 module）：顶层 const/let 与其他脚本共享全局词法作用域。
 */
'use strict';

/* ================= constants & state ================= */
const DIRS=[[1,0],[0,1],[1,1],[1,-1]];
const NAMES={1:'精灵阵营',2:'魔族阵营'};
const SHORT={1:'精灵',2:'魔族'};
const EMPTY=0,ELF=1,DEMON=2;
const $=s=>document.querySelector(s);
const other=p=>p===ELF?DEMON:ELF;

let N=9,TOTAL=81;
const CFG={size:9,maxHp:20,plantChance:.7};
let mode='ai';
/* 音效开关落盘：右键菜单和设置面板都能改它，重开页面后状态要一致 */
let soundOn=(function(){try{return localStorage.getItem('4ascend-sound')!=='0';}catch(e){return true;}})();
let locked=false;
let hintsOn=localStorage.getItem('4ascend-hints')!=='0';  // 残影与提示开关
/* 视觉特效总开关：落子涟漪、升变灵体、发芽、伤害飘字与震屏、淘汰碎片、棋盘 3D 倾斜。
 * 与 hintsOn 是两件事——残影、ASCEND 虚线、金光预警属于「提示」，不归这里管。 */
let fxOn=(function(){try{return localStorage.getItem('4ascend-fx')!=='0';}catch(e){return true;}})();
let cellEls=[];
const floats=$('#floats');
let armSet=new Set(),vacSet=new Set();
let wrecked=0;          // 面板已被淘汰炸毁的阵营（0 = 无），回放时按局面还原
let S=null;
const replay={active:false,index:0,total:0,timer:null,speed:1,live:null};

const inb=(r,c)=>r>=0&&r<N&&c>=0&&c<N;


/* ================= board build ================= */
function buildBoard(){
  const board=$('#board');
  cellEls.forEach(el=>el.remove());
  cellEls=[];
  const stars=new Set();
  if(N>=7){
    const a=2,b=N-3,m=Math.floor(N/2);
    [[a,a],[a,b],[m,m],[b,a],[b,b]].forEach(([r,c])=>stars.add(r*N+c));
  }else if(N>=5){stars.add(Math.floor(N/2)*N+Math.floor(N/2));}
  for(let i=0;i<TOTAL;i++){
    const cell=document.createElement('button');
    cell.type='button';
    cell.className='cell'+(stars.has(i)?' star':'');
    cell.dataset.i=i;
    cell.setAttribute('aria-label','第'+(Math.floor(i/N)+1)+'行第'+(i%N+1)+'列');
    cell.innerHTML='<span class="ln-h"></span><span class="ln-v"></span><span class="dot"></span>'+
                   '<span class="plant"></span><span class="ring"></span><span class="mark"></span>'+
                   '<span class="ghost"></span><span class="stone"></span>';
    board.insertBefore(cell,floats);
    cellEls.push(cell);
  }
  board.style.setProperty('--n',N);
}

function fitBoard(){
  const frame=$('#frame');
  const area=$('.board-area').clientWidth;
  /* 内边距直接量出来，改 CSS 的 padding 不必再同步改这里 */
  const pad=(parseFloat(getComputedStyle(frame).paddingLeft)||16)*2+2;
  let px=Math.floor((area-pad)/N);

  /* 矮屏（手机横屏）再按高度收一次，保证整盘一屏可见，不必滚动找棋盘 */
  const vh=window.innerHeight;
  if(vh<620){
    const landscape=window.matchMedia('(orientation:landscape)').matches;
    px=Math.min(px,Math.floor((vh-(landscape?124:158))/N));
  }

  px=Math.max(18,Math.min(60,px));
  document.documentElement.style.setProperty('--cell',px+'px');
}


/* ================= state ================= */
function newState(){
  N=CFG.size;TOTAL=N*N;
  wrecked=0;   // 新局把上一局的残骸清掉
  /* 上一局的碎片层可能还在飞，直接收掉，别让它飘到新棋盘上 */
  document.querySelectorAll('.shatter').forEach(n=>n.remove());
  document.querySelectorAll('.panel.doomed').forEach(n=>n.classList.remove('doomed'));
  S={
    board:new Array(TOTAL).fill(EMPTY),
    plants:new Array(TOTAL).fill(false),
    hp:{1:CFG.maxHp,2:CFG.maxHp},
    maxHp:CFG.maxHp,
    plantChance:CFG.plantChance,
    reserve:{1:0,2:0},
    turn:ELF,moves:0,pending:null,barren:0,
    over:false,winner:0,overAt:0,log:[],threats:new Map(),threatKey:'',
    record:{
      game:'4ASCEND',version:1,
      createdAt:new Date().toISOString(),
      settings:{size:N,maxHp:CFG.maxHp,plantChance:CFG.plantChance,mode:mode,connect:4},
      initial:null,steps:[],result:null
    }
  };
}


/* ================= snapshot / record ================= */
function makeSnapshot(){
  return {
    board:S.board.join(''),
    plants:S.plants.map(b=>b?'1':'0').join(''),
    hp:[S.hp[1],S.hp[2]],
    res:[S.reserve[1],S.reserve[2]],
    turn:S.turn,moves:S.moves,barren:S.barren,
    pending:S.pending?{
      owner:S.pending.owner,count:S.pending.count,power:S.pending.power,
      stones:S.pending.stones.map(s=>[s.idx,s.plant?1:0])
    }:null,
    over:S.over?1:0,winner:S.winner
  };
}
function applySnapshot(s){
  S.board=s.board.split('').map(ch=>+ch);
  S.plants=s.plants.split('').map(ch=>ch==='1');
  S.hp={1:s.hp[0],2:s.hp[1]};
  S.reserve={1:s.res[0],2:s.res[1]};
  S.turn=s.turn;S.moves=s.moves;S.barren=s.barren;
  S.pending=s.pending?{
    owner:s.pending.owner,count:s.pending.count,power:s.pending.power,
    stones:s.pending.stones.map(x=>({idx:x[0],plant:!!x[1]}))
  }:null;
  S.over=!!s.over;S.winner=s.winner||0;
}
function pushStep(player,idx,info){
  const rec=S.record;
  rec.steps.push({
    n:rec.steps.length+1,
    player:player,idx:idx,
    r:Math.floor(idx/N)+1,c:idx%N+1,
    acts:info.acts.slice(),
    note:info.note.join(' · '),
    snapshot:makeSnapshot()
  });
  if(S.over){
    rec.result={
      winner:S.winner,
      hp:[S.hp[1],S.hp[2]],
      stones:[countStones(ELF),countStones(DEMON)],
      moves:rec.steps.length
    };
  }
}
