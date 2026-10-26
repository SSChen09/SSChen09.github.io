/* 4ASCEND · 05 · 落子结算、启发式 AI、MCTS 搜索
 * 经典脚本（非 module）：顶层 const/let 与其他脚本共享全局词法作用域。
 */
'use strict';

/* ================= play ================= */
function play(idx,isAI){
  if(S.over||replay.active)return;
  if(S.board[idx]!==EMPTY)return;
  if(!isAI&&mode==='ai'&&S.turn===DEMON)return;

  const p=S.turn,foe=other(p);
  /* fx 是这一手的「演出清单」：联机时房主要把它随局面一起发给对手，
   * 对手才能重放同样的涟漪、金光、飘字与发芽，而不是只看到结果。
   * 所以这里记录的是「发生了什么」，而不是直接去动 DOM。 */
  const info={acts:[],note:[],fx:{ascend:null,grown:[],dmg:null,counter:0}};
  let ascend=null;

  info.note.push(SHORT[p]+' 落子 ('+(Math.floor(idx/N)+1)+','+(idx%N+1)+')');

  /* 反击 */
  if(S.pending&&S.pending.owner===foe){
    const hit=S.pending.stones.filter(s=>s.idx===idx);
    if(hit.length){
      const cnt=hit.length,stolen=hit.filter(s=>s.plant).length;
      S.pending.stones=S.pending.stones.filter(s=>s.idx!==idx);
      S.pending.count=S.pending.stones.length;
      S.pending.power=Math.max(0,S.pending.power-(cnt+stolen));
      S.reserve[p]+=stolen;
      info.acts.push('反击');
      info.fx.counter=cnt;
      info.note.push('反击 '+cnt+' 枚'+(stolen?'，夺得 '+stolen+' 株魔力植物':''));
      addLog(SHORT[p]+'反击：落在残影上，'+SHORT[foe]+' 的 '+cnt+' 枚棋子失效'+(stolen?'，夺得 '+stolen+' 株魔力植物':''));
      sfx('counter');
      if(S.pending.stones.length===0){
        info.note.push('对手 ASCEND 被完全瓦解');
        addLog(SHORT[foe]+' 的 ASCEND 被完全瓦解');
        const owner=S.pending.owner;
        S.pending=null;
        const g=growPlants(owner);
        info.fx.grown.push(...g);
        if(g.length){info.acts.push('生长');info.note.push('生长 '+g.length+' 株魔力植物');}
      }
    }
  }

  /* 落子 */
  S.board[idx]=p;S.moves++;
  sfx('place',p);
  animateDrop(idx,p);

  /* ASCEND 判定 */
  const line=lineThrough(idx,p);
  if(line){
    ascend=line.map(i=>({idx:i,plant:!!S.plants[i]}));
    info.fx.ascend=ascend.map(s=>({idx:s.idx,plant:s.plant}));
    line.forEach(i=>{S.board[i]=EMPTY;S.plants[i]=false;});
    S.barren++;
    const cnt=ascend.length;
    const plantBonus=ascend.filter(s=>s.plant).length;
    const reserveBonus=S.reserve[p];
    S.reserve[p]=0;
    const attack={owner:p,stones:ascend,count:cnt,power:cnt+plantBonus+reserveBonus};
    info.acts.push('ASCEND');

    if(S.pending&&S.pending.owner===foe){
      const atk=S.pending,diff=attack.power-atk.power;
      let victim=0,dmg=0;
      if(diff>0){victim=atk.owner;dmg=diff;}
      else if(diff<0){victim=attack.owner;dmg=-diff;}
      S.pending=null;
      info.acts.push('抵消');
      info.note.push('ASCEND '+cnt+' 枚（战力 '+attack.power+'）↔ '+SHORT[atk.owner]+' '+atk.count+' 枚（战力 '+atk.power+'）'+
        (dmg?'，'+SHORT[victim]+' 受到 '+dmg+' 点伤害':'，完全抵消'));
      addLog('抵消：'+SHORT[p]+' '+cnt+'枚+'+(plantBonus+reserveBonus)+'魔力 ↔ '+
             SHORT[atk.owner]+' '+atk.count+'枚+'+Math.max(0,atk.power-atk.count)+'魔力'+
             (dmg?'，'+SHORT[victim]+' 受到 '+dmg+' 点伤害':'，完全抵消'));
      sfx('cancel');
      if(dmg){applyDamage(victim,dmg);animateDamage(dmg,victim);info.fx.dmg={victim:victim,amount:dmg};}
      const g=growPlants(atk.owner);
      info.fx.grown.push(...g);
      if(g.length){info.acts.push('生长');info.note.push('生长 '+g.length+' 株魔力植物');}
    }else{
      S.pending=attack;
      info.note.push('构成 ASCEND '+cnt+' 枚'+(plantBonus?' · 含 '+plantBonus+' 株魔力':'')+
        (reserveBonus?' · 消耗 '+reserveBonus+' 株储备':'')+'，伤害 '+cnt);
      addLog(SHORT[p]+' 构成 ASCEND：'+cnt+' 枚'+(plantBonus?' · 含 '+plantBonus+' 株魔力':'')+
             (reserveBonus?' · 消耗 '+reserveBonus+' 株储备':'')+'，伤害 '+cnt);
      sfx('ascend');
    }
  }else if(S.pending&&S.pending.owner===foe){
    const atk=S.pending;
    S.pending=null;
    info.acts.push('受伤');
    info.note.push('承受 '+SHORT[atk.owner]+' 的 ASCEND，'+SHORT[p]+' 受到 '+atk.count+' 点伤害');
    addLog(SHORT[atk.owner]+' 的 ASCEND 落下：'+SHORT[p]+' 受到 '+atk.count+' 点伤害');
    if(atk.count){applyDamage(p,atk.count);animateDamage(atk.count,p);info.fx.dmg={victim:p,amount:atk.count};}
    sfx('damage');
    const g=growPlants(atk.owner);
    info.fx.grown.push(...g);
    if(g.length){info.acts.push('生长');info.note.push('生长 '+g.length+' 株魔力植物');}
  }

  if(!ascend)S.barren=0;
  if(!S.over&&!S.board.includes(EMPTY))endByFill();
  if(!S.over)S.turn=foe;

  pushStep(p,idx,info);
  refreshThreats();
  renderAll();
  renderRecord();
  /* 联机：房主是唯一权威，落子结算完立刻把整份局面推给对手。
   * 用「全量快照 + 这一手的演出清单」而不是增量指令，对手那边的随机数
   * （植物生长、AI）就永远不会和房主走岔。放在动画之前，先发出再演出。 */
  if(typeof netAfterPlay==='function')netAfterPlay(p,idx,info,ascend);
  if(ascend)animateAscend(ascend,p);
  if(!S.over)maybeAI();
}


/* ================= AI ================= */
/* 四档预设：两档一步评分（不同失误率），两档树搜索（同一算法，不同时间预算）
 * 第五档 custom 的参数由 customCfg() 现算，不写死在表里 */
const AI_LEVELS={
  novice:{label:'新手',kind:'heuristic',noise:34,blockMul:.30,blunder:.10,delay:520},
  normal:{label:'熟练',kind:'heuristic',noise:4, blockMul:1,  blunder:0,  delay:640},
  expert:{label:'老练',kind:'mcts',budget:260,cap:6000,rollout:8,negamax:true,delay:360},
  master:{label:'噩梦',kind:'mcts',budget:900,cap:20000,rollout:8,negamax:true,delay:260},
  custom:{label:'自定义'}
};
const LEGACY_AI={heuristic:'normal',mcts:'expert'};   // 兼容旧存档

/* 自定义难度只有两个参数，却能覆盖从「几乎不会玩」到「比噩梦更深」的整段区间：
 * budget 决定算法（≤120ms 用一步评分，否则树搜索），blunder 对两种算法都生效 */
const AI_CUSTOM_DEF={budget:500,blunder:8};
let aiCustom={budget:AI_CUSTOM_DEF.budget,blunder:AI_CUSTOM_DEF.blunder};
function loadAiCustom(){
  try{
    const o=JSON.parse(localStorage.getItem('4ascend-ai-custom')||'null');
    if(!o)return;
    if(isFinite(o.budget))aiCustom.budget=Math.max(50,Math.min(2000,Math.round(o.budget)));
    if(isFinite(o.blunder))aiCustom.blunder=Math.max(0,Math.min(40,Math.round(o.blunder)));
  }catch(e){}
}
loadAiCustom();
function saveAiCustom(){
  try{localStorage.setItem('4ascend-ai-custom',JSON.stringify(aiCustom));}catch(e){}
}
function customCfg(){
  const b=aiCustom.budget,bl=aiCustom.blunder/100;
  if(b<=120){
    /* 一步评分：思考时间越短，评分噪声越大、防守越松 */
    return {label:'自定义',kind:'heuristic',
      noise:Math.round(3+b/10),
      blockMul:.55+Math.min(.45,b/260),
      blunder:bl,delay:Math.max(220,b)};
  }
  return {label:'自定义',kind:'mcts',
    budget:b,cap:Math.round(b*24),rollout:8,negamax:true,
    blunder:bl,delay:Math.min(420,Math.max(180,Math.round(b*.35)))};
}

let aiLevel=(function(){
  const v=localStorage.getItem('4ascend-ai')||'normal';
  const k=LEGACY_AI[v]||v;
  return AI_LEVELS[k]?k:'normal';
})();
function aiCfg(){
  if(aiLevel==='custom')return customCfg();
  return AI_LEVELS[aiLevel]||AI_LEVELS.normal;
}

function localScore(i,p){
  S.board[i]=p;
  const r=Math.floor(i/N),c=i%N;let s=0;
  for(let d=0;d<4;d++){
    const dr=DIRS[d][0],dc=DIRS[d][1];
    let len=1,open=0;
    for(let sign=1;sign>=-1;sign-=2){
      let k=1;
      while(true){
        const rr=r+dr*k*sign,cc=c+dc*k*sign;
        if(!inb(rr,cc)){open++;break;}
        const v=S.board[rr*N+cc];
        if(v===p){len++;k++;continue;}
        if(v===EMPTY)open++;
        break;
      }
    }
    if(len>=4)s+=120;else s+=len*len*(open>0?1.1:.25);
  }
  S.board[i]=EMPTY;
  return s;
}

function aiMove(){
  if(S.over)return;
  const L=aiCfg();
  const t0=performance.now();

  /* 失误：整步改走闲棋，制造「看漏了」的感觉。
     放在算法分派之前，自定义难度的失误率对树搜索同样生效 */
  if(L.blunder&&Math.random()<L.blunder){
    const empties=[];
    for(let i=0;i<TOTAL;i++)if(S.board[i]===EMPTY)empties.push(i);
    if(empties.length){
      aiStat={ms:Math.round(performance.now()-t0),iters:0,wr:null,level:L.label};
      play(empties[Math.floor(Math.random()*empties.length)],true);
      return;
    }
  }

  if(L.kind==='mcts'){mctsMove();return;}

  const p=DEMON,foe=ELF;
  let best=-Infinity,bestIdx=-1;
  for(let i=0;i<TOTAL;i++){
    if(S.board[i]!==EMPTY)continue;
    let sc=Math.random()*L.noise;
    if(S.pending&&S.pending.owner===foe){
      const hit=S.pending.stones.filter(s=>s.idx===i);
      if(hit.length)sc+=14*hit.length+12*hit.filter(s=>s.plant).length;
    }
    S.board[i]=p;
    const mine=lineThrough(i,p);
    S.board[i]=EMPTY;
    if(mine){
      const pb=mine.filter(k=>S.plants[k]).length+S.reserve[p];
      if(S.pending&&S.pending.owner===foe)sc+=220+(mine.length+pb-S.pending.power)*38;
      else sc+=170+mine.length*26+pb*12;
    }
    S.board[i]=foe;
    const opp=lineThrough(i,foe);
    S.board[i]=EMPTY;
    if(opp)sc+=(132+opp.length*18)*L.blockMul;   // 新手防守权重打折，容易漏防
    sc+=localScore(i,p)*1.15+localScore(i,foe);
    if(S.plants[i])sc+=7;
    const r=Math.floor(i/N),c=i%N;
    sc+=(4-Math.abs(4-r))*.35+(4-Math.abs(4-c))*.35;
    if(sc>best){best=sc;bestIdx=i;}
  }
  aiStat={ms:Math.round(performance.now()-t0),iters:0,wr:null,level:L.label};
  if(bestIdx>=0)play(bestIdx,true);
}

function maybeAI(){
  if(mode!=='ai'||S.over||S.turn!==DEMON||replay.active)return;
  locked=true;
  setTimeout(()=>{locked=false;if(!S.over&&S.turn===DEMON&&!replay.active)aiMove();},aiCfg().delay);
}


/* ================= MCTS AI ================= */
function initAiMode(){
  document.querySelectorAll('#seg-ai .seg-btn').forEach(b=>
    b.classList.toggle('on',b.dataset.ai===aiLevel));
}

/* --- 轻量局面（与 rules engine 规则一致的纯逻辑副本） --- */
function simClone(){
  return {
    board:S.board.slice(),plants:S.plants.slice(),
    hp:[S.hp[1],S.hp[2]],res:[S.reserve[1],S.reserve[2]],
    turn:S.turn,barren:S.barren,
    pending:S.pending?{owner:S.pending.owner,count:S.pending.count,power:S.pending.power,
      stones:S.pending.stones.map(s=>({idx:s.idx,plant:s.plant}))}:null,
    over:false,winner:0
  };
}
function simLine(s,idx,player){
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
        if(s.board[rr*N+cc]!==player)break;
        arr.push(rr*N+cc);k++;
      }
    }
    if(arr.length>=4){found++;arr.forEach(i=>set.add(i));}
  }
  return found?[...set]:null;
}
function simGrow(s,favored){
  const chance=Math.max(0,Math.min(1,S.plantChance))/(1+s.barren*.55);
  for(let t=0;t<2;t++){
    if(Math.random()>chance)continue;
    const cands=[];
    for(let i=0;i<TOTAL;i++)if(s.board[i]===EMPTY&&!s.plants[i])cands.push(i);
    if(!cands.length)break;
    s.plants[cands[Math.floor(Math.random()*cands.length)]]=true;
  }
}
/* 在局面 s 上落子 idx，返回伤害信息；直接修改 s */
function simApply(s,idx){
  const p=s.turn,foe=p===1?2:1;
  if(s.board[idx]!==EMPTY)return null;
  let dmgTo=null,dmg=0,ascend=false;

  if(s.pending&&s.pending.owner===foe){  // 反击
    const hit=s.pending.stones.filter(x=>x.idx===idx);
    if(hit.length){
      const cnt=hit.length,stolen=hit.filter(x=>x.plant).length;
      s.pending.stones=s.pending.stones.filter(x=>x.idx!==idx);
      s.pending.count=s.pending.stones.length;
      s.pending.power=Math.max(0,s.pending.power-(cnt+stolen));
      s.res[p===1?0:1]+=stolen;
      if(s.pending.stones.length===0){const ow=s.pending.owner;s.pending=null;simGrow(s,ow);}
    }
  }
  s.board[idx]=p;
  const line=simLine(s,idx,p);
  if(line){
    ascend=true;
    const stones=line.map(i=>({idx:i,plant:!!s.plants[i]}));
    line.forEach(i=>{s.board[i]=EMPTY;s.plants[i]=false;});
    s.barren++;
    const cnt=stones.length;
    const power=cnt+stones.filter(x=>x.plant).length+s.res[p===1?0:1];
    s.res[p===1?0:1]=0;
    if(s.pending&&s.pending.owner===foe){
      const atk=s.pending,diff=power-atk.power;
      s.pending=null;
      if(diff>0){dmgTo=foe;dmg=diff;}
      else if(diff<0){dmgTo=p;dmg=-diff;}
      simGrow(s,atk.owner);
    }else s.pending={owner:p,count:cnt,power:power,stones:stones};
  }else if(s.pending&&s.pending.owner===foe){
    const atk=s.pending;s.pending=null;
    dmgTo=p;dmg=atk.count;
    simGrow(s,atk.owner);
  }
  if(!ascend)s.barren=0;
  if(dmgTo){
    const vi=dmgTo===1?0:1;
    s.hp[vi]=Math.max(0,s.hp[vi]-dmg);
    if(s.hp[vi]<=0){s.over=true;s.winner=foe===dmgTo?p:foe;}
  }
  if(!s.over&&!s.board.includes(EMPTY)){  // 棋盘满
    if(s.hp[0]!==s.hp[1]){s.over=true;s.winner=s.hp[0]>s.hp[1]?1:2;}
    else{
      let ca=0,cb=0;
      for(let i=0;i<TOTAL;i++){if(s.board[i]===1)ca++;else if(s.board[i]===2)cb++;}
      if(ca!==cb){s.over=true;s.winner=ca>cb?1:2;}
      else{s.over=true;s.winner=0;}
    }
  }
  s.turn=foe;
  return {dmgTo:dmg,dmg:dmg,ascend:ascend};
}
/* 候选着法：只考虑已有棋子/植物/残影 2 格内的空点，大幅提速 */
function simMoves(s){
  const near=new Set();
  for(let i=0;i<TOTAL;i++){
    if(s.board[i]!==EMPTY||s.plants[i]){
      const r=Math.floor(i/N),c=i%N;
      for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++){
        const rr=r+dr,cc=c+dc;
        if(inb(rr,cc)){const j=rr*N+cc;if(s.board[j]===EMPTY)near.add(j);}
      }
    }
  }
  if(s.pending)s.pending.stones.forEach(x=>near.add(x.idx));
  if(near.size===0){const m=Math.floor(N/2);return [m*N+m];}
  return [...near];
}
/* 叶子评估：DEMON 视角 0..1。血量差为主，叠加待结算威胁与「一手成 ASCEND」机会差 */
function simEval(s){
  if(s.over)return s.winner===DEMON?1:(s.winner===ELF?0:.5);
  let v=.5+(s.hp[1]-s.hp[0])/(2*S.maxHp)*.85;
  if(s.pending){
    const sign=s.pending.owner===DEMON?1:-1;
    v+=sign*Math.min(.22,s.pending.power*.035);
  }
  let a=0,b=0;
  for(let i=0;i<TOTAL;i++){
    if(s.board[i]!==EMPTY)continue;
    s.board[i]=ELF;if(simLine(s,i,ELF))a++;s.board[i]=EMPTY;
    s.board[i]=DEMON;if(simLine(s,i,DEMON))b++;s.board[i]=EMPTY;
  }
  v+=(b-a)*.03;
  return Math.max(0,Math.min(1,v));
}
function simRollout(s,depth){
  const cap=depth||8;
  let d=0;
  while(!s.over&&d<cap){
    const ms=simMoves(s);
    if(!ms.length)break;
    // 轮盘赌：反击优先，其余随机
    let pick=ms[Math.floor(Math.random()*ms.length)];
    if(s.pending&&s.pending.owner===s.turn){
      const cnt=s.pending.stones.filter(x=>s.board[x.idx]===EMPTY);
      if(cnt.length&&Math.random()<.8)pick=cnt[Math.floor(Math.random()*cnt.length)].idx;
    }
    simApply(s,pick);
    d++;
  }
  return simEval(s);
}
/* MCTS 主循环：UCT + 前瞻调度，按难度配置限时搜索 */
function mctsRoot(cfg){
  const C=cfg||AI_LEVELS.normal;
  const root={s:simClone(),visits:0,value:0,untried:simMoves(simClone()),children:new Map()};
  const deadline=performance.now()+C.budget;
  let iters=0;
  while(performance.now()<deadline&&iters<C.cap){
    iters++;
    let node=root,path=[node];
    /* 选择 */
    while(node.untried.length===0&&node.children.size>0&&!node.s.over){
      const mover=node.s.turn;          // 该节点轮到谁走
      let best=-Infinity,bn=null;
      for(const [,cn] of node.children){
        const wr=cn.value/cn.visits;
        /* negamax：对手节点反转胜率，避免「对手配合我赢」的偏差 */
        const exploit=(C.negamax&&mover!==DEMON)?1-wr:wr;
        const u=exploit+1.4*Math.sqrt(Math.log(node.visits)/cn.visits);
        if(u>best){best=u;bn=cn;}
      }
      node=bn;path.push(node);   // 状态在展开时已应用，此处仅下钻
    }
    /* 展开 */
    if(node.untried.length>0&&!node.s.over){
      const k=Math.floor(Math.random()*node.untried.length);
      const mv=node.untried.splice(k,1)[0];
      const cs=simClone2(node.s);
      simApply(cs,mv);
      const cn={s:cs,visits:0,value:0,untried:simMoves(cs),children:new Map(),last:mv};
      node.children.set(mv,cn);
      node=cn;path.push(node);
    }
    /* 模拟 */
    const v=simRollout(simClone2(node.s),C.rollout);
    /* 回溯 */
    for(const n of path){n.visits++;n.value+=v;}
  }
  return {root,iters};
}
function simClone2(s){  // 克隆任意局面（非根）
  return {
    board:s.board.slice(),plants:s.plants.slice(),
    hp:[s.hp[0],s.hp[1]],res:[s.res[0],s.res[1]],
    turn:s.turn,barren:s.barren,
    pending:s.pending?{owner:s.pending.owner,count:s.pending.count,power:s.pending.power,
      stones:s.pending.stones.map(x=>({idx:x.idx,plant:x.plant}))}:null,
    over:s.over,winner:s.winner
  };
}
let aiStat=null;  // 最近一次 AI 思考统计 {ms,iters,wr,level}
function mctsMove(){
  if(S.over)return;
  const L=aiCfg();
  const t0=performance.now();
  const res=mctsRoot(L);
  const root=res.root;
  const cost=Math.round(performance.now()-t0);
  let best=-1,bv=-1;
  for(const [mv,cn] of root.children){
    if(cn.visits>bv){bv=cn.visits;best=mv;}
  }
  if(best>=0){
    const cn=root.children.get(best);
    aiStat={ms:cost,iters:res.iters,wr:Math.round(cn.value/cn.visits*100),level:L.label};
    play(best,true);
  }
  else aiMove();  // 兜底：回退到一步评分
}
