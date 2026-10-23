/* 4ASCEND · 03 · 程序化配乐引擎（5 套主题 + 3 段结局曲 + 音色与织体）
 * 经典脚本（非 module）：顶层 const/let 与其他脚本共享全局词法作用域。
 */
'use strict';

/* ================= background music（主题程序化配乐） ================= */
/* 每套主题拥有独立的调式、和声进行、旋律型、音色与织体，切换主题即换曲风 */
const MUSIC={
  /* 默认 · 星辉秘境：A 小调五声，慢速铺底 + 拨弦，神秘空灵 */
  default:{
    label:'星辉秘境',
    bpm:.62,delay:.93,fb:.34,
    scale:[220,261.63,293.66,329.63,392,440,523.25,587.33],
    chords:[[110,164.81,220,261.63],[87.31,130.81,174.61,220],
            [130.81,164.81,196,261.63],[98,146.83,196,246.94]],
    melody:[1,-1,4,-1,2,-1,0,-1,3,-1,2,-1,5,-1,3,-1],
    pad:{type:'sine',type2:'triangle',gain:.045,attack:1.3,detune:4},
    lead:{voice:'pluck',gain:.06,bright:2600,dull:900,len:1.7},
    tex:['shimmer']
  },
  /* 暗夜森林：D 多利亚，木质短拨弦 + 风声与夜鸟 */
  forest:{
    label:'月下林语',
    bpm:.72,delay:.55,fb:.28,
    scale:[293.66,329.63,349.23,392,440,493.88,587.33,659.25],
    chords:[[146.83,174.61,220,293.66],[116.54,146.83,174.61,233.08],
            [174.61,220,261.63,349.23],[130.81,164.81,196,261.63]],
    melody:[0,-1,-1,2,-1,3,-1,-1,1,-1,4,-1,-1,2,-1,-1],
    pad:{type:'sine',type2:'sine',gain:.038,attack:1.9,detune:6},
    lead:{voice:'pluck',gain:.055,bright:1500,dull:420,len:1.05},
    tex:['wind','chirp']
  },
  /* 海洋深蓝：E 利底亚，流动长音 + 潮涌白噪 */
  ocean:{
    label:'深蓝潮汐',
    bpm:.68,delay:.9,fb:.42,
    scale:[329.63,369.99,415.30,493.88,554.37,659.25,739.99,830.61],
    chords:[[164.81,207.65,246.94,329.63],[138.59,164.81,207.65,277.18],
            [110,164.81,220,277.18],[123.47,185,246.94,311.13]],
    melody:[0,2,4,2,1,3,5,3,0,2,4,6,2,4,3,1],
    pad:{type:'sine',type2:'sine',gain:.05,attack:2.4,detune:8},
    lead:{voice:'soft',gain:.045,len:2.1},
    tex:['wave']
  },
  /* 紫晶魔法：高音区全音阶，非谐波钟声 + 随机碎晶 */
  crystal:{
    label:'紫晶回响',
    bpm:.5,delay:.375,fb:.45,
    scale:[523.25,587.33,659.25,783.99,880,987.77,1046.5,1174.66],
    chords:[[261.63,329.63,392,523.25],[233.08,293.66,349.23,466.16],
            [220,277.18,329.63,440],[196,246.94,311.13,415.30]],
    melody:[0,4,2,6,1,5,3,7,2,6,4,0,3,7,5,1],
    pad:{type:'sine',type2:'triangle',gain:.028,attack:.9,detune:3},
    lead:{voice:'bell',gain:.05,len:2.2},
    tex:['sparkle']
  },
  /* 火焰熔岩：E 弗里吉亚属音阶，锯齿低音 + 心跳与爆裂 */
  lava:{
    label:'熔岩低吼',
    bpm:.48,delay:.36,fb:.25,
    scale:[164.81,174.61,207.65,220,246.94,261.63,293.66,329.63],
    chords:[[82.41,123.47,164.81,207.65],[87.31,130.81,174.61,220],
            [73.42,110,146.83,174.61],[65.41,98,130.81,164.81]],
    melody:[0,-1,0,1,0,-1,3,2,0,-1,0,1,4,3,1,0],
    pad:{type:'sawtooth',type2:'triangle',gain:.022,attack:.55,detune:7,cutoff:520},
    lead:{voice:'grit',gain:.05,len:1.2},
    tex:['ember']
  }
};

/* 结局配乐：与主题曲同构，可被同一调度器循环演奏 */
const ENDING={
  /* 胜利 · 凯旋：D 大调 I–V–vi–IV，号角式上行 + 定音鼓 */
  win:{
    label:'凯旋',
    bpm:.46,delay:.42,fb:.30,
    scale:[293.66,329.63,369.99,440,493.88,587.33,659.25,739.99],
    chords:[[146.83,220,293.66,369.99],[110,164.81,220,277.18],
            [123.47,185,246.94,293.66],[98,146.83,196,246.94]],
    melody:[0,2,4,5,4,2,3,-1,4,5,7,5,4,2,0,-1],
    pad:{type:'triangle',type2:'sine',gain:.05,attack:.6,detune:5},
    lead:{voice:'pluck',gain:.07,bright:3200,dull:1200,len:1.35},
    tex:['triumph'],
    intro:'win'
  },
  /* 失败 · 挽歌：D 小调 Dm–B♭–Gm–A，长音下行 + 低沉钟声 */
  lose:{
    label:'挽歌',
    bpm:.58,delay:.6,fb:.34,
    scale:[293.66,329.63,349.23,392,440,466.16,523.25,587.33],
    chords:[[146.83,174.61,220,293.66],[116.54,146.83,174.61,233.08],
            [98,146.83,196,233.08],[110,164.81,220,277.18]],
    melody:[5,-1,4,-1,3,-1,-1,2,1,-1,0,-1,-1,-1,-1,-1],
    pad:{type:'sine',type2:'sine',gain:.05,attack:1.7,detune:7},
    lead:{voice:'soft',gain:.042,len:2.6},
    tex:['toll'],
    intro:'lose'
  },
  /* 平局 · 未竟：挂留和弦，钟声对峙后悬而不决 */
  draw:{
    label:'未竟',
    bpm:.54,delay:.7,fb:.38,
    scale:[293.66,329.63,349.23,440,493.88,587.33,659.25,739.99],
    chords:[[146.83,196,220,293.66],[110,164.81,220,246.94],
            [123.47,174.61,246.94,293.66],[98,146.83,196,261.63]],
    melody:[0,-1,2,-1,3,-1,2,-1,-1,1,-1,0,-1,-1,-1,-1],
    pad:{type:'sine',type2:'triangle',gain:.042,attack:1.4,detune:6},
    lead:{voice:'bell',gain:.04,len:2.4},
    tex:['drift'],
    intro:'draw'
  }
};

/* 回放配乐：只在「看棋」时出现，与五套主题曲、三段结局曲都区分开。
 * 编配刻意留白：慢速钟声 + 每四拍一记轻响（像胶片过片），
 * 动机整体下行呼应「把时间往回拨」，延迟更长、反馈更高，留出回忆的余响。 */
const REPLAY_MUSIC={
  label:'回响 · 复盘',
  bpm:.46,delay:1.05,fb:.44,
  scale:[220,246.94,293.66,329.63,392,440,523.25,587.33],
  chords:[[110,164.81,220,261.63],[98,146.83,196,246.94],
          [87.31,130.81,174.61,220],[110,164.81,220,293.66]],
  melody:[6,-1,5,-1,4,3,-1,2,1,-1,0,-1,2,-1,-1,-1],
  pad:{type:'sine',type2:'sine',gain:.034,attack:1.15,detune:5},
  lead:{voice:'bell',gain:.036,len:1.85},
  tex:['tick','drift']
};

const MUS={
  on:false,timer:null,step:0,nextTime:0,master:null,delay:null,fb:null,
  vol:null,     // 用户音量层（0~1），在 master 之后、输出之前
  scene:null    // null=主题曲；'win'/'lose'/'draw'=结局曲；'replay'=回放曲
};
let MP=MUSIC.default;      // 当前生效的那一段配乐
let NOISE=null;
const PADS=[];             // 正在发声的和弦铺底，切换场景时统一淡出

function noiseBuf(){       // 复用的白噪缓冲，用于风声/潮涌/爆裂
  if(NOISE)return NOISE;
  const ctx=AC,len=Math.floor(ctx.sampleRate*2);
  NOISE=ctx.createBuffer(1,len,ctx.sampleRate);
  const d=NOISE.getChannelData(0);
  for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
  return NOISE;
}

/* ---------- 和声铺底 ---------- */
function musPad(freqs,t0,dur,c){
  const ctx=AC,cfg=c||{};
  const gain=cfg.gain||.045,atk=cfg.attack||1.3,det=cfg.detune==null?4:cfg.detune;
  freqs.forEach((f,k)=>{
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.type=k%2?(cfg.type2||'triangle'):(cfg.type||'sine');
    o.frequency.value=f;
    o.detune.value=(k-1.5)*det;
    if(cfg.cutoff){
      const flt=ctx.createBiquadFilter();
      flt.type='lowpass';flt.frequency.value=cfg.cutoff;flt.Q.value=.7;
      o.connect(flt);flt.connect(g);
    }else o.connect(g);
    g.gain.setValueAtTime(.0001,t0);
    g.gain.exponentialRampToValueAtTime(gain,t0+atk);
    g.gain.setValueAtTime(gain,Math.max(t0+atk+.05,t0+dur-1.6));
    g.gain.exponentialRampToValueAtTime(.0001,t0+dur);
    g.connect(MUS.master);
    o.start(t0);o.stop(t0+dur+.15);
    PADS.push(g);
    if(PADS.length>16)PADS.shift();
  });
}

/* ---------- 钟声（可独立调用：非谐波泛音叠加） ---------- */
function musBell(f,t0,c){
  const ctx=AC,cfg=c||{};
  [1,2.76,5.4].forEach((m,k)=>{
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.type='sine';o.frequency.value=f*m;
    const len=(cfg.len||2.2)/(1+k*.6);
    g.gain.setValueAtTime(.0001,t0);
    g.gain.exponentialRampToValueAtTime((cfg.gain||.05)*(k?.32/k:1),t0+.012);
    g.gain.exponentialRampToValueAtTime(.0001,t0+len);
    o.connect(g);g.connect(MUS.master);
    o.start(t0);o.stop(t0+len+.2);
  });
}

/* ---------- 旋律声部：四种音色 ---------- */
function musLead(f,t0,cfg){
  const ctx=AC,c=cfg||MP.lead||{};

  if(c.voice==='bell'){            // 水晶/钟
    musBell(f,t0,c);
    return;
  }

  if(c.voice==='soft'){            // 潮汐长音：双振荡器微失谐、缓慢起音
    [0,7].forEach((dt,k)=>{
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.type='sine';o.frequency.value=f;o.detune.value=dt;
      g.gain.setValueAtTime(.0001,t0);
      g.gain.exponentialRampToValueAtTime((c.gain||.045)*(k?.55:1),t0+.16);
      g.gain.exponentialRampToValueAtTime(.0001,t0+(c.len||2.1));
      o.connect(g);g.connect(MUS.master);
      o.start(t0);o.stop(t0+(c.len||2.1)+.2);
    });
    return;
  }

  if(c.voice==='grit'){            // 熔岩：锯齿波过共振低通，带轻微下滑
    const o=ctx.createOscillator(),g=ctx.createGain(),flt=ctx.createBiquadFilter();
    const len=c.len||1.2;
    o.type='sawtooth';
    o.frequency.setValueAtTime(f*1.012,t0);
    o.frequency.exponentialRampToValueAtTime(f*.986,t0+len);
    flt.type='lowpass';flt.Q.value=6;
    flt.frequency.setValueAtTime(1800,t0);
    flt.frequency.exponentialRampToValueAtTime(380,t0+len);
    g.gain.setValueAtTime(.0001,t0);
    g.gain.exponentialRampToValueAtTime(c.gain||.05,t0+.02);
    g.gain.exponentialRampToValueAtTime(.0001,t0+len);
    o.connect(flt);flt.connect(g);g.connect(MUS.master);
    o.start(t0);o.stop(t0+len+.1);
    return;
  }

  /* 默认 pluck：三角波 + 滤波扫落，木质拨弦感 */
  const o=ctx.createOscillator(),g=ctx.createGain(),flt=ctx.createBiquadFilter();
  const len=c.len||1.7;
  o.type='triangle';o.frequency.value=f;
  flt.type='lowpass';
  flt.frequency.setValueAtTime(c.bright||2600,t0);
  flt.frequency.exponentialRampToValueAtTime(c.dull||900,t0+len*.82);
  g.gain.setValueAtTime(.0001,t0);
  g.gain.exponentialRampToValueAtTime(c.gain||.06,t0+.05);
  g.gain.exponentialRampToValueAtTime(.0001,t0+len);
  o.connect(flt);flt.connect(g);g.connect(MUS.master);
  o.start(t0);o.stop(t0+len+.15);
}

/* ---------- 织体层：每个主题独有的氛围声 ---------- */
function musShimmer(f,t0){          // 高音泛光点缀
  const ctx=AC;
  const o=ctx.createOscillator(),g=ctx.createGain();
  o.type='sine';o.frequency.value=f*3;
  g.gain.setValueAtTime(.0001,t0);
  g.gain.exponentialRampToValueAtTime(.018,t0+.4);
  g.gain.exponentialRampToValueAtTime(.0001,t0+2.4);
  o.connect(g);g.connect(MUS.master);
  o.start(t0);o.stop(t0+2.5);
}
function musWind(t0,dur){           // 林间风：带通白噪缓慢起伏
  const ctx=AC,src=ctx.createBufferSource(),flt=ctx.createBiquadFilter(),g=ctx.createGain();
  src.buffer=noiseBuf();src.loop=true;
  flt.type='bandpass';flt.Q.value=1.1;
  flt.frequency.setValueAtTime(480,t0);
  flt.frequency.linearRampToValueAtTime(880,t0+dur*.5);
  flt.frequency.linearRampToValueAtTime(420,t0+dur);
  g.gain.setValueAtTime(.0001,t0);
  g.gain.linearRampToValueAtTime(.05,t0+dur*.45);
  g.gain.linearRampToValueAtTime(.0001,t0+dur);
  src.connect(flt);flt.connect(g);g.connect(MUS.master);
  src.start(t0);src.stop(t0+dur+.1);
}
function musChirp(t0){              // 夜鸟：短促上滑高音
  const ctx=AC,o=ctx.createOscillator(),g=ctx.createGain();
  const base=1400+Math.random()*900;
  o.type='sine';
  o.frequency.setValueAtTime(base,t0);
  o.frequency.exponentialRampToValueAtTime(base*(1.3+Math.random()*.5),t0+.09);
  g.gain.setValueAtTime(.0001,t0);
  g.gain.exponentialRampToValueAtTime(.026,t0+.02);
  g.gain.exponentialRampToValueAtTime(.0001,t0+.22);
  o.connect(g);g.connect(MUS.master);
  o.start(t0);o.stop(t0+.3);
}
function musWave(t0,dur){           // 潮涌：低通白噪的长呼吸
  const ctx=AC,src=ctx.createBufferSource(),flt=ctx.createBiquadFilter(),g=ctx.createGain();
  src.buffer=noiseBuf();src.loop=true;
  flt.type='lowpass';flt.Q.value=.8;
  flt.frequency.setValueAtTime(280,t0);
  flt.frequency.linearRampToValueAtTime(720,t0+dur*.42);
  flt.frequency.linearRampToValueAtTime(240,t0+dur);
  g.gain.setValueAtTime(.0001,t0);
  g.gain.linearRampToValueAtTime(.075,t0+dur*.38);
  g.gain.linearRampToValueAtTime(.0001,t0+dur);
  src.connect(flt);flt.connect(g);g.connect(MUS.master);
  src.start(t0);src.stop(t0+dur+.1);
}
function musSparkle(t0){            // 碎晶：极高音短钟
  const ctx=AC,o=ctx.createOscillator(),g=ctx.createGain();
  o.type='sine';o.frequency.value=1400+Math.random()*1600;
  g.gain.setValueAtTime(.0001,t0);
  g.gain.exponentialRampToValueAtTime(.016,t0+.008);
  g.gain.exponentialRampToValueAtTime(.0001,t0+.9+Math.random()*.8);
  o.connect(g);g.connect(MUS.master);
  o.start(t0);o.stop(t0+1.9);
}
function musThump(t0,vol){          // 定音鼓/心跳：低频下滑
  const ctx=AC,o=ctx.createOscillator(),g=ctx.createGain();
  o.type='sine';
  o.frequency.setValueAtTime(98,t0);
  o.frequency.exponentialRampToValueAtTime(42,t0+.3);
  g.gain.setValueAtTime(.0001,t0);
  g.gain.exponentialRampToValueAtTime(vol||.15,t0+.012);
  g.gain.exponentialRampToValueAtTime(.0001,t0+.38);
  o.connect(g);g.connect(MUS.master);
  o.start(t0);o.stop(t0+.42);
}
function musCrack(t0){              // 爆裂：高通白噪短脉冲
  const ctx=AC,src=ctx.createBufferSource(),flt=ctx.createBiquadFilter(),g=ctx.createGain();
  src.buffer=noiseBuf();
  flt.type='highpass';flt.frequency.value=1800;
  g.gain.setValueAtTime(.0001,t0);
  g.gain.exponentialRampToValueAtTime(.07,t0+.006);
  g.gain.exponentialRampToValueAtTime(.0001,t0+.16);
  src.connect(flt);flt.connect(g);g.connect(MUS.master);
  src.start(t0);src.stop(t0+.2);
}
function musClock(t0,vol){          // 过片声：窄带白噪的极短脉冲，只做节奏骨架
  const ctx=AC,src=ctx.createBufferSource(),flt=ctx.createBiquadFilter(),g=ctx.createGain();
  src.buffer=noiseBuf();
  flt.type='bandpass';flt.frequency.value=2400;flt.Q.value=7;
  g.gain.setValueAtTime(.0001,t0);
  g.gain.exponentialRampToValueAtTime(vol||.05,t0+.004);
  g.gain.exponentialRampToValueAtTime(.0001,t0+.075);
  src.connect(flt);flt.connect(g);g.connect(MUS.master);
  src.start(t0);src.stop(t0+.09);
}

/* ---------- 织体调度表 ---------- */
const TEXTURE={
  shimmer(s,t){if(s%8===0){const m=MP.melody[s%16];musShimmer(MP.scale[m>=0?m:0],t+.28);}},
  wind(s,t){if(s%16===0)musWind(t,MP.bpm*17);},
  chirp(s,t){if(Math.random()<.16)musChirp(t+Math.random()*MP.bpm*.8);},
  wave(s,t){if(s%32===0)musWave(t,MP.bpm*34);},
  sparkle(s,t){if(Math.random()<.3)musSparkle(t+Math.random()*MP.bpm*.9);},
  ember(s,t){if(s%2===0)musThump(t);if(s%8===7)musCrack(t+MP.bpm*.5);},
  /* 回放织体：四拍一记过片声，强拍稍重 */
  tick(s,t){if(s%4===0)musClock(t,s%8===0?.05:.032);},
  /* 结局织体 */
  triumph(s,t){if(s%4===0)musThump(t,.11);if(s%8===4)musBell(MP.scale[5],t+.1,{gain:.028,len:2.6});},
  toll(s,t){if(s%16===0)musBell(MP.chords[0][0]*2,t,{gain:.05,len:3.6});},
  drift(s,t){if(s%8===0)musSparkle(t);}
};

function musTick(){
  const ctx=AC;if(!ctx||!MUS.on)return;
  while(MUS.nextTime<ctx.currentTime+1.2){
    const s=MUS.step,P=MP,bar=16;
    if(s%bar===0)musPad(P.chords[Math.floor(s/bar)%P.chords.length],MUS.nextTime,P.bpm*bar*1.05,P.pad);
    const m=P.melody[s%bar];
    if(m>=0)musLead(P.scale[m%P.scale.length],MUS.nextTime);
    (P.tex||[]).forEach(k=>{const fn=TEXTURE[k];if(fn)fn(s,MUS.nextTime);});
    MUS.step++;
    MUS.nextTime+=P.bpm;
  }
}
/* 依据当前场景换曲（无需停播：旧和弦淡出、新曲从下一个小节头接管） */
function applyMusicTheme(){
  const t=document.documentElement.getAttribute('data-theme')||'default';
  /* 场景优先：回放 > 结局 > 主题 */
  MP=MUS.scene==='replay'?REPLAY_MUSIC
    :(MUS.scene?(ENDING[MUS.scene]||MUSIC.default):(MUSIC[t]||MUSIC.default));
  syncMusicUI();   // 设置面板里的「当前曲目」跟着场景走
  if(!AC)return;
  const now=AC.currentTime;
  if(MUS.delay&&MUS.delay.delayTime)MUS.delay.delayTime.setTargetAtTime(MP.delay,now,.25);
  if(MUS.fb&&MUS.fb.gain)MUS.fb.gain.setTargetAtTime(MP.fb,now,.25);
  if(MUS.on){
    /* 上一段的和弦在 0.7s 内淡出，避免两段和声叠在一起 */
    PADS.forEach(g=>{
      try{
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(Math.max(.0001,g.gain.value),now);
        g.gain.exponentialRampToValueAtTime(.0001,now+.7);
      }catch(e){}
    });
    PADS.length=0;
    /* 从新曲的小节头重新起拍，切换后立刻听到新的和弦与动机。
     * nextTime 只许往后推、不许往回拨：未来 1.2s 的音符早已排好队，
     * 拨回去会让同一批音符被重复触发一遍（听感像「打嗝」）。 */
    MUS.step=0;
    MUS.nextTime=Math.max(MUS.nextTime,now+.06);
  }
}

/* ---------- 场景配乐 ---------- */
/* 场景判定：回放 > 结局 > 主题。
 * 回放排在最前，因为回放里 S.over 取自快照，不能让它把曲子带回结局曲 */
function desiredScene(){
  if(replay.active)return 'replay';
  if(S.over)return endingKind();
  return null;
}
/* 结局类型：胜负/平局的唯一判定来源，配乐与音效都从这里取 */
function endingKind(){
  if(!S.over)return null;
  if(!S.winner)return 'draw';
  return (mode==='pvp'||S.winner===ELF)?'win':'lose';
}
/* 开场乐句：胜利上行号角 / 失败下行叹息 / 平局对峙钟声 */
function endingIntro(kind,t0){
  if(kind==='win'){
    [293.66,369.99,440,587.33,739.99].forEach((f,i)=>musBell(f,t0+i*.13,{gain:.045,len:1.7}));
    musThump(t0,.17);musThump(t0+.52,.13);
  }else if(kind==='lose'){
    [440,349.23,293.66,220].forEach((f,i)=>musLead(f,t0+i*.58,{voice:'soft',gain:.048,len:2.5}));
    musBell(146.83,t0,{gain:.055,len:3.4});
  }else{
    musBell(392,t0,{gain:.042,len:2.8});
    musBell(415.30,t0+.55,{gain:.038,len:2.8});
  }
}
/* 进入回放：一串快速下行 + 一记过片声，像把时间往回拨 */
function replayIntro(t0){
  [6,5,4,2].forEach((d,i)=>musBell(REPLAY_MUSIC.scale[d],t0+i*.09,{gain:.028,len:1.4}));
  musClock(t0,.045);
}
/* 场景配乐的唯一入口：谁都不用自己判断该放哪首，只要说「现在是什么状态」 */
function syncSceneMusic(withIntro){
  const want=desiredScene();
  if(want===MUS.scene)return;
  const was=MUS.scene;
  MUS.scene=want;
  applyMusicTheme();
  if(!AC||!MUS.on)return;
  const t0=AC.currentTime+.1;
  /* 只在真正「进入」某个场景时给乐句：
   * 回放进出用轻过门；结局只在从对局直接进入时放开场乐句（从回放退回来就不重复了） */
  if(want==='replay')replayIntro(t0);
  else if(want&&was!=='replay'&&withIntro)endingIntro(want,t0);
}

function startMusic(){
  const ctx=ac();if(!ctx)return;
  if(ctx.state==='suspended'){try{ctx.resume();}catch(e){}}
  applyMusicTheme();
  if(!MUS.master){
    MUS.master=ctx.createGain();MUS.master.gain.value=.0001;
    MUS.vol=ctx.createGain();MUS.vol.gain.value=musicVol/100;
    MUS.delay=ctx.createDelay(2);MUS.delay.delayTime.value=MP.delay;
    MUS.fb=ctx.createGain();MUS.fb.gain.value=MP.fb;
    /* master 只管淡入淡出，vol 是用户音量；延迟尾音也走 vol，调音量时不会漏音 */
    MUS.master.connect(MUS.vol);
    MUS.master.connect(MUS.delay);
    MUS.delay.connect(MUS.fb);MUS.fb.connect(MUS.delay);
    MUS.delay.connect(MUS.vol);
    MUS.vol.connect(ctx.destination);
  }
  MUS.on=true;
  MUS.step=0;MUS.nextTime=ctx.currentTime+.15;
  MUS.master.gain.cancelScheduledValues(ctx.currentTime);
  MUS.master.gain.setValueAtTime(Math.max(.0001,MUS.master.gain.value),ctx.currentTime);
  MUS.master.gain.exponentialRampToValueAtTime(.6,ctx.currentTime+2.5);
  if(!MUS.timer)MUS.timer=setInterval(musTick,300);
  musTick();
  syncMusicUI();
}
function stopMusic(){
  const ctx=AC;MUS.on=false;
  if(MUS.timer){clearInterval(MUS.timer);MUS.timer=null;}
  if(ctx&&MUS.master){
    MUS.master.gain.cancelScheduledValues(ctx.currentTime);
    MUS.master.gain.setValueAtTime(Math.max(.0001,MUS.master.gain.value),ctx.currentTime);
    MUS.master.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.9);
  }
  syncMusicUI();
}
/* 用户是否想要背景音乐（设置里的开关状态，与「此刻是否在响」分开） */
function musicWanted(){
  try{return localStorage.getItem('4ascend-music')!=='0';}catch(e){return true;}
}
function syncMusicUI(){
  const want=musicWanted();
  $('#lbl-music').textContent=want?'开':'关';
  document.querySelectorAll('#seg-music .seg-btn').forEach(b=>
    b.classList.toggle('on',(b.dataset.music==='1')===want));
  /* 顺带把当前这首曲子的名字写出来：换场景时它会跟着变 */
  const now=$('#lbl-track');
  if(now)now.textContent='当前曲目 · '+MP.label;
}
function toggleMusic(want){
  if(want==null)want=!musicWanted();
  /* 先落盘再启停：start/stop 内部会调 syncMusicUI，读的是这份偏好 */
  try{localStorage.setItem('4ascend-music',want?'1':'0');}catch(e){}
  if(want)startMusic();
  else stopMusic();
  syncMusicUI();
}
function initMusic(){
  if(!musicWanted())MUS.on=false;
  applyMusicTheme();
  syncMusicUI();
}
function ensureMusic(){  // 浏览器要求首次手势后才能出声
  if(MUS.on||!MUS.wantStart)return;
  if(!musicWanted())return;
  MUS.wantStart=false;
  startMusic();
}
