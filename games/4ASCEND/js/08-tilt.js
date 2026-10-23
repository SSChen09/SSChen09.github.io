/* 4ASCEND · 08 · 棋盘 3D 倾斜
 * 指针位置驱动棋盘的 rotateX / rotateY 与跟随高光，rAF 插值，离开后回正。
 * 只在「精确指针（鼠标/触控笔）+ 未开启减弱动态效果」时启用；
 * 触屏设备保持平面，避免手指按住时盘面乱晃。
 * 整个模块包在 IIFE 里，避免与外层脚本的全局词法作用域撞名。
 */
'use strict';

(function(){
  const frame=$('#frame');
  if(!frame)return;

  const REDUCE=matchMedia('(prefers-reduced-motion: reduce)');
  const FINE=matchMedia('(hover:hover) and (pointer:fine)');

  const EASE=.16;        // 插值系数，越大越跟手
  const REACH=.55;       // 指针离开中心多远算「满倾斜」（相对棋盘尺寸）
  const GLARE_MIN=.5;    // 悬停时的基础高光强度

  let tX=0,tY=0;         // 目标倾斜（-1 左/上，+1 右/下）
  let cX=0,cY=0;         // 当前倾斜
  let tMx=50,tMy=50;     // 目标光斑位置（%）
  let cMx=50,cMy=50;     // 当前光斑位置
  let tG=0,cG=0;         // 目标 / 当前高光强度
  let raf=0,hover=false;
  let shStep=-1;         // 投影当前档位，避免每帧重绘 box-shadow

  const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
  /* 倾斜是「演出」，归视觉特效总开关管：关掉后盘面保持平面。
     触屏与 prefers-reduced-motion 本来就不启用 */
  const enabled=()=>FINE.matches&&!REDUCE.matches&&fxOn;

  function paint(){
    frame.style.setProperty('--tx',cX.toFixed(4));
    frame.style.setProperty('--ty',cY.toFixed(4));
    frame.style.setProperty('--mx',cMx.toFixed(2)+'%');
    frame.style.setProperty('--my',cMy.toFixed(2)+'%');
    frame.style.setProperty('--glare',cG.toFixed(3));

    /* 投影分 7 档、配合 CSS 的 .4s 过渡：视觉上连续，实际只重绘几次 */
    const step=Math.round(Math.min(1,Math.hypot(cX,cY))*6);
    if(step!==shStep){
      shStep=step;
      const k=step/6;
      frame.style.setProperty('--shx',(-cX*20).toFixed(1)+'px');
      frame.style.setProperty('--shy',(34-cY*13).toFixed(1)+'px');
      frame.style.setProperty('--shb',(78+k*22).toFixed(0)+'px');
      frame.style.setProperty('--sha',(0.60+k*0.12).toFixed(2));
    }
  }

  function settled(){
    return Math.abs(cX-tX)<8e-4&&Math.abs(cY-tY)<8e-4&&
           Math.abs(cMx-tMx)<.05&&Math.abs(cMy-tMy)<.05&&
           Math.abs(cG-tG)<4e-3;
  }

  function tick(){
    cX+=(tX-cX)*EASE;
    cY+=(tY-cY)*EASE;
    cMx+=(tMx-cMx)*EASE*1.25;
    cMy+=(tMy-cMy)*EASE*1.25;
    cG+=(tG-cG)*EASE;
    if(settled()){
      cX=tX;cY=tY;cMx=tMx;cMy=tMy;cG=tG;
      paint();
      raf=0;
      frame.classList.remove('tilting');
      return;
    }
    paint();
    raf=requestAnimationFrame(tick);
  }

  function kick(){
    if(raf)return;
    frame.classList.add('tilting');
    raf=requestAnimationFrame(tick);
  }

  function onMove(e){
    if(!enabled()){release();return;}
    if(e.pointerType&&e.pointerType!=='mouse'&&e.pointerType!=='pen'){release();return;}

    /* 用布局尺寸做归一化、用 rect 中心做原点。
       旋转以中心为轴，中心点本身不动，所以这里不会形成「越转越偏」的反馈 */
    const r=frame.getBoundingClientRect();
    const w=frame.offsetWidth||r.width;
    const h=frame.offsetHeight||r.height;
    if(!w||!h)return;

    const dx=clamp((e.clientX-(r.left+r.width/2))/(w*REACH),-1,1);
    const dy=clamp((e.clientY-(r.top+r.height/2))/(h*REACH),-1,1);

    tX=dx;tY=dy;                       // CSS 里：rotateX 用 -ty，rotateY 用 +tx
    tMx=(dx+1)*50;tMy=(dy+1)*50;       // 高光贴住指针
    tG=GLARE_MIN+(1-GLARE_MIN)*Math.min(1,Math.hypot(dx,dy));
    hover=true;
    kick();
  }

  function release(){
    if(!hover&&tX===0&&tY===0&&tG===0)return;
    hover=false;
    tX=0;tY=0;tMx=50;tMy=50;tG=0;
    kick();
  }

  window.addEventListener('pointermove',onMove,{passive:true});
  document.addEventListener('mouseleave',release);
  window.addEventListener('blur',release);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});

  /* 用户在系统里切换「减弱动态效果」，或换成触屏设备时立即回正 */
  const onChange=()=>{if(!enabled())release();};
  if(REDUCE.addEventListener)REDUCE.addEventListener('change',onChange);
  else if(REDUCE.addListener)REDUCE.addListener(onChange);
  if(FINE.addEventListener)FINE.addEventListener('change',onChange);
  else if(FINE.addListener)FINE.addListener(onChange);

  /* 特效开关是运行中随时能改的，这里接一次通知立即回正，
     不必等下一次 pointermove 才发现「已经关了」 */
  document.addEventListener('fxchange',e=>{
    if(!e.detail||!e.detail.on)release();
  });

  paint();
})();
