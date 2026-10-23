/* 4ASCEND · 02 · 音效合成（落子 / 威胁 / ASCEND / 抵消 / 受伤 / 胜利）
 * 音高取自当前主题配乐的调式（MP.scale），音色取自该主题的 lead 声部，
 * 并与配乐共用同一条延迟线 —— 音效与 BGM 始终在同一个调、同一个空间里。
 * 经典脚本（非 module）：顶层 const/let 与其他脚本共享全局词法作用域。
 */
'use strict';

/* ================= audio ================= */
let AC=null;
function ac(){
  if(!AC){try{AC=new (window.AudioContext||window.webkitAudioContext)();}catch(e){}}
  return AC;
}

/* ---------- 音量 ---------- */
function readVol(key,def){
  let raw=null;
  try{raw=localStorage.getItem(key);}catch(e){}
  if(raw==null)return def;
  const v=+raw;
  return (isFinite(v)&&v>=0&&v<=100)?Math.round(v):def;
}
let musicVol=readVol('4ascend-music-vol',70);   // 0~100
let sfxVol  =readVol('4ascend-sfx-vol',85);     // 0~100

function applySfxVol(){
  if(!AC||!SFX_BUS)return;
  const g=.95*(sfxVol/100);
  try{SFX_BUS.gain.setTargetAtTime(g,AC.currentTime,.04);}
  catch(e){SFX_BUS.gain.value=g;}
}
function applyMusicVol(){
  if(!AC||!MUS||!MUS.vol)return;
  const g=musicVol/100;
  try{MUS.vol.gain.setTargetAtTime(g,AC.currentTime,.06);}
  catch(e){MUS.vol.gain.value=g;}
}
function setSfxVol(v){
  sfxVol=Math.max(0,Math.min(100,Math.round(+v||0)));
  try{localStorage.setItem('4ascend-sfx-vol',sfxVol);}catch(e){}
  applySfxVol();
}
function setMusicVol(v){
  musicVol=Math.max(0,Math.min(100,Math.round(+v||0)));
  try{localStorage.setItem('4ascend-music-vol',musicVol);}catch(e){}
  applyMusicVol();
}

/* ---------- 与配乐共享的空间 ---------- */
let SFX_BUS=null,SFX_SEND=null,SFX_NOISE=null;

function sfxBus(){
  const ctx=ac();if(!ctx)return null;
  if(!SFX_BUS){
    SFX_BUS=ctx.createGain();
    SFX_BUS.gain.value=.95*(sfxVol/100);
    SFX_BUS.connect(ctx.destination);
  }
  /* 配乐启动后，把音效也送一点进它的延迟线，回声与 BGM 同源 */
  if(typeof MUS!=='undefined'&&MUS&&MUS.delay&&SFX_SEND!==MUS.delay){
    try{
      const s=ctx.createGain();s.gain.value=.14;
      SFX_BUS.connect(s);s.connect(MUS.delay);
      SFX_SEND=MUS.delay;
    }catch(e){}
  }
  return SFX_BUS;
}

/* 短促衰减噪声：落子的"叩击"质感 */
function sfxNoise(ctx){
  if(SFX_NOISE)return SFX_NOISE;
  const n=Math.floor(ctx.sampleRate*.06);
  SFX_NOISE=ctx.createBuffer(1,n,ctx.sampleRate);
  const d=SFX_NOISE.getChannelData(0);
  for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/n,2.4);
  return SFX_NOISE;
}
function click(o){
  if(!soundOn)return;
  const ctx=ac();if(!ctx)return;
  const bus=sfxBus();if(!bus)return;
  const t0=ctx.currentTime+(o.delay||0);
  const src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();
  src.buffer=sfxNoise(ctx);
  f.type='bandpass';f.frequency.value=o.freq||1700;f.Q.value=o.q||1.2;
  g.gain.value=o.gain||.1;
  src.connect(f);f.connect(g);g.connect(bus);
  src.start(t0);src.stop(t0+.08);
}

function tone(o){
  if(!soundOn)return;
  const ctx=ac();if(!ctx)return;
  if(ctx.state==='suspended'){try{ctx.resume();}catch(e){}}
  const bus=sfxBus();if(!bus)return;
  const t0=ctx.currentTime+(o.delay||0);
  const osc=ctx.createOscillator(),g=ctx.createGain();
  osc.type=o.type||'sine';
  osc.frequency.setValueAtTime(o.freq,t0);
  if(o.slide)osc.frequency.exponentialRampToValueAtTime(Math.max(40,o.freq+o.slide),t0+o.dur);
  g.gain.setValueAtTime(.0001,t0);
  g.gain.exponentialRampToValueAtTime(o.gain||.12,t0+.014);
  g.gain.exponentialRampToValueAtTime(.0001,t0+o.dur);
  osc.connect(g);g.connect(bus);
  osc.start(t0);osc.stop(t0+o.dur+.06);
}

/* ---------- 调色板：音高与音色都跟随当前主题 ---------- */
function sfxProfile(){
  if(typeof MP!=='undefined'&&MP&&MP.scale&&MP.scale.length>=4)return MP;
  return MUSIC.default;
}
/* 取当前调式第 d 级音（可跨八度：d 为负即下行） */
function sDeg(d,oct){
  const sc=sfxProfile().scale,n=sc.length;
  const k=((d%n)+n)%n,o=Math.floor(d/n)+(oct||0);
  return sc[k]*Math.pow(2,o);
}
/* 每种 lead 音色对应一套落子质感，保证换主题后音效材质也跟着换 */
const VOICE_CFG={
  pluck:{osc:'triangle',click:1700,len:1.00,body:.13},
  soft :{osc:'sine',    click:1050,len:1.60,body:.12},
  bell :{osc:'sine',    click:2500,len:2.10,body:.10},
  grit :{osc:'sawtooth',click:900, len:.85, body:.12}
};
function vCfg(){
  const v=(sfxProfile().lead||{}).voice||'pluck';
  return VOICE_CFG[v]||VOICE_CFG.pluck;
}

function sfx(name,arg){
  if(!soundOn)return;
  const v=vCfg(),osc=v.osc;

  switch(name){
    case 'place':{
      /* 落子：一声叩击 + 一枚同调低音。白子取三级、黑子取主音，两色交替成和声 */
      const d=arg===DEMON?0:2;
      click({freq:v.click,gain:.11});
      tone({freq:sDeg(d,-1),dur:.09*v.len,type:osc,gain:v.body,slide:-5});
      tone({freq:sDeg(d,-1)*2,dur:.045,type:'sine',gain:.045,delay:.005});
      break;
    }
    case 'threat':
      tone({freq:sDeg(4,0),dur:.13,type:osc,gain:.085});
      tone({freq:sDeg(6,0),dur:.2,type:osc,gain:.08,delay:.115});
      break;
    case 'ascend':
      /* 上行琶音：调式内五声级进，与铺底和弦同源 */
      [0,2,4,6,7].forEach((d,i)=>tone({freq:sDeg(d,0),dur:.2,type:osc,gain:.115,delay:i*.072}));
      tone({freq:sDeg(0,-1),dur:.34,type:'sine',gain:.07,delay:.04});
      break;
    case 'cancel':
      /* 下行三音：力量被抵消、回落 */
      [7,5,3].forEach((d,i)=>tone({freq:sDeg(d,0),dur:.16,type:osc,gain:.085,delay:i*.085}));
      break;
    case 'damage':
      tone({freq:sDeg(0,-1),dur:.34,type:'sawtooth',gain:.13,slide:-sDeg(0,-1)*.45});
      tone({freq:sDeg(0,-2),dur:.4,type:'sine',gain:.15,slide:-14});
      break;
    case 'counter':
      tone({freq:sDeg(2,0),dur:.09,type:osc,gain:.1});
      tone({freq:sDeg(5,0),dur:.14,type:osc,gain:.1,delay:.075});
      break;
    case 'plant':
      [4,6,8].forEach((d,i)=>tone({freq:sDeg(d,1),dur:.18,type:'sine',gain:.075,delay:i*.065}));
      break;
    case 'win':
      /* 胜利：上行五音，逐级抬升 */
      [0,2,4,5,7].forEach((d,i)=>tone({freq:sDeg(d,0),dur:.3,type:osc,gain:.11,delay:i*.12}));
      break;
    case 'lose':
      /* 失败：下行四音落到主音，每枚都带一点下滑，像一声叹息 */
      [7,5,3,0].forEach((d,i)=>tone({freq:sDeg(d,0),dur:.42,type:osc,gain:.1,delay:i*.21,slide:-9}));
      tone({freq:sDeg(0,-1),dur:1.15,type:'sine',gain:.085,delay:.05,slide:-6});
      break;
    case 'draw':
      /* 平局：大二度两音对峙后悬住，底下垫一个不解决的低音 */
      tone({freq:sDeg(3,0),dur:.55,type:osc,gain:.085});
      tone({freq:sDeg(4,0),dur:.62,type:osc,gain:.075,delay:.33});
      tone({freq:sDeg(0,-1),dur:1.25,type:'sine',gain:.07,delay:.02});
      break;
    case 'shatter':{
      /* 淘汰爆裂：一段宽带噪声下扫 + 一记砸地的低音 + 几粒碎片落地
       * 噪声本身无音高，但低音与碎片音仍从当前调式取，不会脱调 */
      const ctx=ac();if(!ctx)return;
      const bus=sfxBus();if(!bus)return;
      const t0=ctx.currentTime;
      const n=Math.floor(ctx.sampleRate*.55);
      const buf=ctx.createBuffer(1,n,ctx.sampleRate);
      const d=buf.getChannelData(0);
      for(let i=0;i<n;i++){const k=1-i/n;d[i]=(Math.random()*2-1)*Math.pow(k,3.4);}
      const src=ctx.createBufferSource();src.buffer=buf;
      const lp=ctx.createBiquadFilter();lp.type='lowpass';
      lp.frequency.setValueAtTime(5600,t0);
      lp.frequency.exponentialRampToValueAtTime(300,t0+.46);
      const g=ctx.createGain();
      g.gain.setValueAtTime(.30,t0);
      g.gain.exponentialRampToValueAtTime(.0001,t0+.55);
      src.connect(lp);lp.connect(g);g.connect(bus);
      src.start(t0);src.stop(t0+.56);
      tone({freq:sDeg(0,-2),dur:.6,type:'sine',gain:.26,slide:-sDeg(0,-2)*.55});
      for(let i=0;i<4;i++)
        click({freq:1700+Math.random()*2600,gain:.05,delay:.14+i*.085+Math.random()*.06});
      break;
    }
  }
}
