/* 4ASCEND · 04 · 规则引擎（连珠判定、威胁预判、植物生长、伤害与终局）
 * 经典脚本（非 module）：顶层 const/let 与其他脚本共享全局词法作用域。
 */
'use strict';

/* ================= rules engine ================= */
function lineThrough(idx,player){
  const r=Math.floor(idx/N),c=idx%N;
  let found=0;const set=new Set([idx]);
  for(let d=0;d<4;d++){
    const dr=DIRS[d][0],dc=DIRS[d][1];
    const arr=[idx];
    for(let sign=1;sign>=-1;sign-=2){
      let k=1;
      while(true){
        const rr=r+dr*k*sign,cc=c+dc*k*sign;
        if(!inb(rr,cc))break;
        if(S.board[rr*N+cc]!==player)break;
        arr.push(rr*N+cc);k++;
      }
    }
    if(arr.length>=4){found++;arr.forEach(i=>set.add(i));}
  }
  return found?[...set]:null;
}

function computeThreats(player){
  const map=new Map();
  for(let i=0;i<TOTAL;i++){
    if(S.board[i]!==EMPTY)continue;
    S.board[i]=player;
    const line=lineThrough(i,player);
    S.board[i]=EMPTY;
    if(line)map.set(i,line);
  }
  return map;
}

function countStones(p){let n=0;for(let i=0;i<TOTAL;i++)if(S.board[i]===p)n++;return n;}

function addLog(t){
  const round=Math.max(1,Math.ceil(S.moves/2));
  S.log.push('第'+round+'回合 · '+t);
  if(S.log.length>70)S.log.shift();
}

function growPlants(favored){
  const grown=[];
  const chance=Math.max(0,Math.min(1,S.plantChance))/(1+S.barren*.55);
  for(let t=0;t<2;t++){
    if(Math.random()>chance)continue;
    const cands=[];
    for(let i=0;i<TOTAL;i++)if(S.board[i]===EMPTY&&!S.plants[i])cands.push(i);
    if(!cands.length)break;
    const scored=cands.map(i=>({i,s:favorScore(i,favored)+Math.random()*1.6}));
    scored.sort((a,b)=>b.s-a.s);
    const pool=scored.slice(0,Math.min(4,scored.length));
    const pick=pool[Math.floor(Math.random()*pool.length)].i;
    S.plants[pick]=true;
    grown.push(pick);
    animateSprout(pick);
    sfx('plant');
  }
  return grown;
}

function favorScore(i,p){
  const r=Math.floor(i/N),c=i%N;let s=0;
  for(let d=0;d<4;d++){
    const dr=DIRS[d][0],dc=DIRS[d][1];
    for(let sign=1;sign>=-1;sign-=2){
      for(let k=1;k<=3;k++){
        const rr=r+dr*k*sign,cc=c+dc*k*sign;
        if(!inb(rr,cc))break;
        const v=S.board[rr*N+cc];
        if(v===p)s+=(4-k);
        else if(v!==EMPTY)break;
      }
    }
  }
  s+=(4-Math.abs(4-r))*.16+(4-Math.abs(4-c))*.16;
  return s;
}

function applyDamage(victim,dmg){
  if(dmg<=0||S.over)return;
  S.hp[victim]=Math.max(0,S.hp[victim]-dmg);
  if(S.hp[victim]<=0)endGame(other(victim),NAMES[victim]+'的生命值归零');
}
function endGame(winner,reason){
  S.over=true;S.winner=winner;
  S.overAt=performance.now();   // 用于屏蔽「结束这局的那一次点击」触发的重开
  addLog('对局结束：'+reason+'。'+(winner?NAMES[winner]+'获胜！':'双方势均力敌，平局。'));
  /* 先切结局配乐：音效要从结局曲的调式取音，顺序反了会撞调 */
  syncSceneMusic(true);
  /* 配乐开着时由结局前奏本身收尾，再叠一个音效只会互相打架；
     配乐关着时才补音效，且胜负平各用一段，不能都放上行音 */
  if(!MUS.on)sfx(endingKind()||'win');
  /* 淘汰动画：败者的面板炸开。平局不炸。
     延后到本次结算的 renderAll 之后再拍快照，碎片上的生命条才是归零后的样子 */
  if(winner)setTimeout(()=>{
    if(S.over&&S.winner===winner)shatterPanel(other(winner));
  },0);
}
function endByFill(){
  const a=S.hp[ELF],b=S.hp[DEMON];
  if(a!==b)endGame(a>b?ELF:DEMON,'棋盘已满，生命值领先');
  else{
    const ca=countStones(ELF),cb=countStones(DEMON);
    if(ca!==cb)endGame(ca>cb?ELF:DEMON,'生命值相同，盘面棋子更多');
    else endGame(0,'棋盘已满，一切持平');
  }
}
