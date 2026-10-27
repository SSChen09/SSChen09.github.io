/* 4ASCEND · 09 · 远程联机（WebSocket 大厅 + 服务端权威对局）
 * 经典脚本（非 module）：顶层 const/let 与其他脚本共享全局词法作用域。
 *
 * 这里只管两件事：把玩家送进大厅，以及把服务端算好的局面画出来。
 * 规则判定、植物生长、伤害结算全部在服务器上（server/engine.js），
 * 客户端**不参与任何计算**——所以两台机器不可能走出两盘棋，也没法改前端作弊。
 *
 * 传输是 WebSocket：大厅列表、匹配、落子都走同一条连接。
 * 断线会自动重连（同一 sessionToken），90 秒内回来能接着下。
 */
'use strict';

/* 状态放在最前面：06-ui.js 的 renderHUD 会在本文件加载之前就被调用一次，
 * 那边用 typeof NET 做了保护，所以这里必须尽早完成初始化（避免 TDZ）。 */
const NET={
  ws:null,
  connected:false,
  connecting:false,
  id:'',
  name:'',
  token:'',
  addr:'',             // 服务器地址（用户填的原文，重连时复用）
  active:false,        // 是否在一局对局里
  tableId:'',
  mySide:ELF,
  oppName:'',
  pendingMove:null,    // 已发出、等服务端回传的落点
  queued:false,
  invite:null,         // 收到的邀请 {tableId, fromName}
  waitingInvite:null,  // 我发出、还没被接受的邀请
  players:[],
  tables:[],
  latency:0,           // 我到服务器的往返（自己测的）
  oppLat:0,            // 对手到服务器的往返（服务端转告的）
  attempts:0,
  everOpened:false,    // 这一轮连接是否成功握手过——用来区分「连不上」和「连上又断了」
  retryTimer:null,
  pingTimer:null,
  prevMode:'pvp',
  away:false,          // 对手掉线、等他重连
  tableDead:false      // 对手已离开、桌面作废（只能转本地新局）
};

const NET_WS_PATH='/ws';
const NET_RETRY_MAX=8000;
const NET_RETRY_LIMIT=6;     // 地址填错时别无限重试，试够就停下来让人改
const NET_LAT_SMOOTH=0.45;   // 延迟平滑系数：太小跟不动，太大抖

/* ================= 小工具 ================= */
const netEl=id=>document.getElementById(id);

function netDom(tag,cls,text){
  const n=document.createElement(tag);
  if(cls)n.className=cls;
  if(text!=null)n.textContent=text;
  return n;
}

function netState(title,kind){
  const box=netEl('lobby-state');
  if(!box)return;
  box.textContent=title;
  const dot=netEl('lobby-conn');
  if(dot)dot.dataset.kind=kind||'idle';
}

function netBar(){
  const bar=netEl('netbar');
  if(!bar)return;
  const show=NET.active||(!!NET.ws&&!NET.connected);
  bar.classList.toggle('show',show);
  if(!show)return;
  bar.classList.toggle('wait',!NET.connected||NET.away||NET.tableDead);
  let txt;
  if(NET.tableDead)txt='对手已离开对局';
  else if(!NET.connected)txt='连接断开，正在重连…';
  else if(NET.away)txt='对手掉线，等待重连…';
  else txt='联机中 · 对手 '+NET.oppName+' · 你执'+(NET.mySide===ELF?'精灵':'魔族');
  netEl('netbar-txt').textContent=txt;
  netLatBar();
}

/* 延迟分级：只用来上色，不影响任何判定 */
function netLatQuality(ms){
  if(!ms)return '';
  if(ms<60)return 'good';
  if(ms<140)return 'ok';
  return 'bad';
}

/* 状态条右侧那一小格：我的一直有，对手的要等他的 ping 转一圈回来 */
function netLatBar(){
  const el=netEl('netbar-lat');
  if(!el)return;
  if(!NET.connected||!NET.active||NET.tableDead){
    el.hidden=true;el.textContent='';return;
  }
  el.hidden=false;
  el.dataset.q=netLatQuality(Math.max(NET.latency,NET.oppLat||0));
  el.textContent='你 '+(NET.latency||'—')+'ms · 对手 '+(NET.oppLat?NET.oppLat+'ms':'—');
  el.title='你与对手各自到服务器的往返延迟';
}

function netPingUI(){
  const p=netEl('lobby-ping');
  if(!p)return;
  p.textContent=NET.connected&&NET.latency?NET.latency+'ms':'';
  p.title='你到服务器的往返延迟';
}

/* 大厅里某个玩家的延迟变了：只改那一格，不整表重绘，
 * 否则每次 ping 都把按钮重建一遍，鼠标悬停会闪 */
function netSetRowLat(pid,ms){
  const list=netEl('player-list');
  if(!list)return;
  const row=list.querySelector('.lb-row[data-pid="'+String(pid).replace(/"/g,'')+'"]');
  if(!row)return;
  let el=row.querySelector('.lb-lat');
  if(!el){
    el=netDom('span','lb-lat');
    const name=row.querySelector('.lb-name');
    if(name)name.after(el);else row.prepend(el);
  }
  el.textContent=ms+'ms';
  el.dataset.q=netLatQuality(ms);
  el.title='他到服务器的往返延迟';
}

function netCfg(){
  return {size:CFG.size,maxHp:CFG.maxHp,plantChance:CFG.plantChance};
}

function netSend(obj){
  if(!NET.ws||NET.ws.readyState!==1)return false;
  try{NET.ws.send(JSON.stringify(obj));return true;}catch(e){return false;}
}

/* ================= 服务器地址 =================
 * 两种用法：
 *   1) 页面本来就是联机服务器发出来的 → 地址默认就是 location.host，不用填；
 *   2) 页面在别处（本地文件、别的静态托管、内网另一台机器）→ 手填地址连过去。
 * 手填时支持这几种写法，都会被归一化：
 *   192.168.1.10:8080      ws://192.168.1.10:8080
 *   game.example.com       https://game.example.com
 *   wss://game.example.com/ws
 * 没写协议时按当前页面的协议猜（https 页面用 wss，其余用 ws），
 * 没写路径时补 /ws。 */

function netDefaultAddr(){
  if(!/^https?:$/.test(location.protocol))return '';
  return location.host;
}

/* 把用户填的一行字变成可用的 WebSocket URL；认不出来就返回 null */
function netParseAddr(raw){
  let s=String(raw||'').trim();
  if(!s)return null;
  /* 中间夹空格是粘贴地址时最常见的错。必须在这里拦：
   * URL 会把空格转成 %20 当成合法主机名，结果变成一个永远解析不了的名字 */
  if(/\s/.test(s))return null;
  /* 只填了主机（可能带端口）时补协议：https 页面必须走 wss，否则浏览器会拦混合内容 */
  if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)){
    s=(location.protocol==='https:'?'wss://':'ws://')+s;
  }
  let u;
  try{u=new URL(s);}catch(e){return null;}
  if(u.protocol==='http:')u.protocol='ws:';
  else if(u.protocol==='https:')u.protocol='wss:';
  if(u.protocol!=='ws:'&&u.protocol!=='wss:')return null;
  if(!u.host)return null;
  /* 主机名再核一遍：域名 / IPv4 / [IPv6] 只允许这些字符，
   * 挡住 %20、中文、括号之类被 URL 悄悄编码过的输入 */
  const host=u.hostname;
  if(!host)return null;
  if(!/^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/i.test(host)&&!/^\[[0-9a-f:.]+\]$/i.test(host))return null;
  const port=u.port;
  if(port&&!(+port>0&&+port<65536))return null;
  /* 只给了主机就补默认路径；给了具体路径就照用，方便挂在子路径后面 */
  if(!u.pathname||u.pathname==='/')u.pathname=NET_WS_PATH;
  u.hash='';u.search='';
  return u.toString();
}

/* 归一化后的地址用来显示与重连；顺手把结果写回输入框，让人看见实际连的是哪儿 */
function netAddrLabel(url){
  try{
    const u=new URL(url);
    return u.host+(u.pathname===NET_WS_PATH?'':u.pathname);
  }catch(e){return url;}
}

function syncAddrUI(){
  const i=netEl('in-server');
  if(!i||document.activeElement===i)return;
  /* 显示成「主机:端口」这种人能读的形式，而不是完整的 ws://.../ws */
  i.value=NET.addr?netAddrLabel(NET.addr):netDefaultAddr();
}

/* 用户点了「连接」或改了地址：记住、必要时断开重连 */
function netApplyAddr(raw,silent){
  const url=netParseAddr(raw);
  if(!url){
    netState('地址无效','err');
    netHint('服务器地址看不懂。填「主机:端口」就行，比如 192.168.1.10:8080。',true);
    syncAddrUI();
    return false;
  }
  const changed=url!==NET.addr;

  /* 对局中不许换服务器。注意要在改 NET.addr **之前**拦下来：
   * 否则地址被偷偷换掉，等会儿掉线自动重连就会连到另一台服务器上，
   * 那一局也就再也接不回来了 */
  if(changed&&NET.active){
    toast('对局中不能换服务器，先离开这一局');
    syncAddrUI();
    return false;
  }

  NET.addr=url;
  try{localStorage.setItem('4ascend-server',raw.trim());}catch(e){}
  const i=netEl('in-server');
  if(i&&document.activeElement!==i)i.value=netAddrLabel(url);
  if(!silent)netHint('服务器：'+netAddrLabel(url));

  if(changed)netReconnect();
  else if(!NET.connected&&!NET.connecting)netConnect(true);
  return true;
}

/* 把旧 socket 摘干净再关：否则它稍后触发的 onclose 会把刚建立的新连接
 * 当成「意外断线」，转手又排一次重连，两个连接互相打架 */
function netDropSocket(){
  const old=NET.ws;
  NET.ws=null;
  if(!old)return;
  old.onopen=null;old.onmessage=null;old.onclose=null;old.onerror=null;
  try{old.close();}catch(e){}
}

/* 断开当前连接并连到（可能换了地址的）服务器 */
function netReconnect(){
  netStopPing();
  netDropSocket();
  NET.connected=false;NET.connecting=false;
  NET.attempts=0;NET.everOpened=false;
  NET.id='';NET.latency=0;NET.oppLat=0;
  NET.players=[];NET.tables=[];NET.queued=false;NET.invite=null;NET.waitingInvite=null;
  netSyncUI();renderLobby();
  netConnect(true);
}

/* ================= 连接 ================= */
function netConnect(force){
  /* 手动点「连接」：把排着的重连和试错计数清掉，从干净状态重来 */
  if(force){
    if(NET.retryTimer){clearTimeout(NET.retryTimer);NET.retryTimer=null;}
    NET.attempts=0;NET.everOpened=false;
    if(NET.ws)netDropSocket();
  }
  if(!force&&NET.ws&&(NET.ws.readyState===0||NET.ws.readyState===1))return;

  /* 地址优先用手填的；没填就用当前页面所在的服务器。
   * 直接双击打开 html（file://）时页面自己没有服务器，必须手填。 */
  if(!NET.addr)NET.addr=netParseAddr(netDefaultAddr())||'';
  if(!NET.addr){
    netState('未填写服务器','err');
    netHint('这台页面不是由联机服务器发出来的，请在上面填服务器地址（例如 192.168.1.10:8080）。',true);
    return;
  }

  /* https 页面里的 ws:// 属于混合内容，浏览器会直接拦掉；
   * 报出来的错和「服务器没起来」长得一模一样，所以在这里就说清楚，
   * 别让人去查端口和防火墙 */
  if(location.protocol==='https:'&&/^ws:\/\//.test(NET.addr)){
    netState('HTTPS 页面不能连明文 ws','err');
    netHint('这个页面是 https 打开的，浏览器只允许 wss://。把地址换成域名（服务器配好证书或走 Cloudflare 代理）再连，例如 game.example.com。',true);
    return;
  }

  NET.connecting=true;
  netState('正在连接 '+netAddrLabel(NET.addr)+'…','busy');

  let ws;
  try{ws=new WebSocket(NET.addr);}
  catch(e){
    netState('地址无效','err');
    netHint('WebSocket 地址无法打开：'+netAddrLabel(NET.addr),true);
    NET.connecting=false;
    return;
  }
  NET.ws=ws;

  ws.onopen=()=>{
    NET.connected=true;NET.connecting=false;NET.attempts=0;NET.everOpened=true;
    netSend({t:'hello',name:NET.name,token:NET.token});
    netState('已连接','ok');
    netHint('已连上 '+netAddrLabel(NET.addr));
    netStartPing();
    netSyncUI();
  };

  ws.onmessage=(e)=>{
    let msg=null;
    try{msg=JSON.parse(e.data);}catch(err){return;}
    if(msg&&typeof msg.t==='string')netOnMessage(msg);
  };

  ws.onclose=()=>{
    const was=NET.connected;
    const hadOpen=NET.everOpened;
    NET.connected=false;NET.connecting=false;NET.ws=null;
    netStopPing();
    netSyncUI();
    /* 对局中断线不清局：牌桌在服务端留着，重连后补发完整局面 */
    if(was||!hadOpen)netScheduleReconnect();
  };

  ws.onerror=()=>{};
}

function netScheduleReconnect(){
  if(NET.retryTimer)return;

  /* 一次都没握手成功，多半是地址/端口写错、防火墙没放行、服务没起来。
   * 这种错重试再多次也不会自己好，试几轮就停下，把选择权交回给人 */
  if(!NET.everOpened&&NET.attempts>=NET_RETRY_LIMIT){
    netState('连不上 '+netAddrLabel(NET.addr),'err');
    /* https 页面 → 只能是 wss；服务端若只说明文 ws，在这边看起来就是「连不上」。
     * 这条原因最容易被忽略，直接写进提示里 */
    const tls=location.protocol==='https:'
      ?' 另外：这个页面是 https 打开的，服务器必须支持 wss://（明文 ws 会被浏览器拦下）。'
      :'';
    netHint('试了 '+NET_RETRY_LIMIT+' 次都连不上 '+netAddrLabel(NET.addr)+
      '。检查地址与端口、服务器是否已启动，改完点「连接」重试。'+tls,true);
    netSyncUI();
    return;
  }

  NET.attempts++;
  const delay=Math.min(NET_RETRY_MAX,500*Math.pow(2,NET.attempts-1));
  netState(NET.everOpened?'连接断开，'+Math.round(delay/1000)+' 秒后重连…'
                        :'连不上，'+Math.round(delay/1000)+' 秒后重试…','err');
  NET.retryTimer=setTimeout(()=>{
    NET.retryTimer=null;
    netConnect();
  },delay);
}

function netStartPing(){
  netStopPing();
  const tick=()=>{
    if(!NET.connected)return;
    /* 顺手把自己测到的延迟报给服务端，好让它转告对手。
     * 延迟测量留在客户端：那才是玩家真正感知到的往返。
     * 还没测出来时干脆不带这个字段，别报个 0 让服务端当成「延迟极好」 */
    const m={t:'ping',at:Date.now()};
    if(NET.latency>0)m.lat=NET.latency;
    netSend(m);
  };
  tick();                                   // 先立刻测一次，别让人对着空白等 5 秒
  NET.pingTimer=setInterval(tick,5000);
}
function netStopPing(){
  if(NET.pingTimer){clearInterval(NET.pingTimer);NET.pingTimer=null;}
}

function netDisconnectLocal(){
  netDropSocket();
  NET.connected=false;NET.connecting=false;
  NET.attempts=0;NET.everOpened=false;
  NET.latency=0;NET.oppLat=0;
  netStopPing();
  netSyncUI();
}

/* ================= 消息分发 ================= */
function netOnMessage(msg){
  switch(msg.t){
    case 'welcome':
      NET.id=msg.id||'';
      if(msg.name)NET.name=msg.name;
      syncNameUI();
      break;

    case 'renamed':
      NET.name=msg.name;
      syncNameUI();
      break;

    case 'lobby':
      NET.players=Array.isArray(msg.players)?msg.players:[];
      NET.tables=Array.isArray(msg.tables)?msg.tables:[];
      renderLobby();
      break;

    case 'pong':{
      /* 延迟做指数平滑：单次样本会被 GC、系统调度带偏，
       * 直接显示原始值会跳得很厉害，看着像网络在抽风 */
      const sample=Math.max(0,Date.now()-(msg.at||Date.now()));
      NET.latency=NET.latency
        ?Math.round(NET.latency*(1-NET_LAT_SMOOTH)+sample*NET_LAT_SMOOTH)
        :sample;
      /* 服务端顺手把对手的延迟带回来；不在对局里时是 null */
      const opp=msg.opp;
      if(opp&&typeof opp.lat==='number'){
        NET.oppLat=Math.max(0,Math.round(opp.lat));
        netSetRowLat(opp.id,NET.oppLat);
      }else{
        NET.oppLat=0;
      }
      netPingUI();
      netBar();
      break;
    }

    case 'queued':
      NET.queued=true;
      netHint('正在匹配…设置相同的人会被凑到一起');
      netSyncUI();
      break;

    case 'unqueued':
      NET.queued=false;
      netHint('已取消匹配');
      netSyncUI();
      break;

    case 'created':
      NET.tableId=msg.tableId;
      netHint('房间已创建，等对手进来；也可以直接把房间发在群里');
      netSyncUI();
      break;

    case 'invited':
      if(msg.incoming)netShowInvite(msg);
      else{
        NET.waitingInvite=msg.tableId;
        NET.tableId=msg.tableId;
        netHint('已向 '+msg.target+' 发出挑战，等待接受…');
        netSyncUI();
      }
      break;

    case 'start':
      netApplyStart(msg);
      break;

    case 'state':
      netApplyState(msg);
      break;

    case 'error':
      netHint(msg.msg||'操作失败',true);
      toast(msg.msg||'操作失败');
      break;

    case 'toast':
      toast(msg.msg);
      break;

    case 'oppname':
      NET.oppName=msg.name;
      netBar();
      break;

    case 'oppgone':
      NET.away=true;
      NET.pendingMove=null;
      netBar();
      netHint('对手掉线了，'+msg.seconds+' 秒内重连可以接着下');
      toast('对手掉线，等待重连…');
      break;

    case 'oppback':
      NET.away=false;
      netBar();
      toast('对手回来了，继续');
      break;

    case 'oppleft':
      /* 对手认输/掉线没回来：服务端已经把这局判给留下的人，
       * 这里就在本地把结局落定，让终局画面正常出来。
       * 不直接踢回本地——那样玩家会莫名其妙从胜利画面掉到另一盘棋上。
       * 桌面已作废，之后点「再来一局」会转成本地新局。 */
      netSettleLeave(msg.msg||'对手离开了对局');
      break;

    case 'tableClosed':
      toast(msg.reason||'对局结束');
      netLeaveToLocal();
      break;

    case 'left':
      NET.tableId='';
      break;
  }
}

/* ================= 开局 / 落子 ================= */
function netApplyStart(msg){
  const c=msg.cfg||{};
  CFG.size=Math.max(5,Math.min(15,+c.size||9));
  CFG.maxHp=Math.max(1,+c.maxHp||20);
  CFG.plantChance=Math.max(0,Math.min(1,c.plantChance==null?0.7:+c.plantChance));

  NET.active=true;
  NET.tableId=msg.tableId||'';
  NET.mySide=msg.side===DEMON?DEMON:ELF;
  NET.oppName=msg.opponent||'对手';
  NET.pendingMove=null;
  NET.queued=false;
  NET.waitingInvite=null;
  NET.away=false;
  NET.tableDead=false;
  NET.invite=null;
  NET.oppLat=0;          // 上一局对手的延迟不能留着冒充这一局的
  if(mode!=='net')NET.prevMode=mode;
  mode='net';

  /* 立刻 ping 一次，让状态条上的「对手 xx ms」尽快有数，
   * 而不是干等 5 秒的下一个心跳 */
  if(NET.connected){
    const m={t:'ping',at:Date.now()};
    if(NET.latency>0)m.lat=NET.latency;
    netSend(m);
  }

  stopAuto();
  replay.active=false;replay.live=null;
  const bar=netEl('replaybar');
  if(bar)bar.classList.remove('show');
  locked=false;

  newState();
  buildBoard();fitBoard();
  applySnapshot(msg.snap);

  S.record.settings={size:CFG.size,maxHp:CFG.maxHp,plantChance:CFG.plantChance,mode:'net',connect:4};
  /* 重连补发时 snap 是当前局面，开局局面要单独带过来，否则回放会从半路开始 */
  S.record.initial=msg.initial||msg.snap;
  if(Array.isArray(msg.steps)&&msg.steps.length)S.record.steps=msg.steps;
  S.log=Array.isArray(msg.log)?msg.log.slice():[];
  S.overAt=0;

  refreshThreats(true);
  renderAll();renderRecord();
  syncSceneMusic(false);
  netEl('netmodal').classList.remove('open');
  hideInvite();
  netBar();netSyncUI();
  try{sessionStorage.setItem('4ascend-in-game','1');}catch(e){}

  if(msg.resumed)toast('已回到对局 · 你执'+(NET.mySide===ELF?'精灵':'魔族'));
  else if(msg.rematch)toast('再来一局 · 你执'+(NET.mySide===ELF?'精灵':'魔族'));
  else toast('对局开始 · 你执'+(NET.mySide===ELF?'精灵':'魔族'));
}

/* 服务端算完一手推过来：套用快照 → 补棋谱 → 重放演出 */
function netApplyState(msg){
  if(!msg.snap)return;
  if(replay.active)exitReplay();

  const wasOver=S.over;
  const prevThreatKey=S.threatKey;
  NET.pendingMove=null;
  NET.away=false;
  applySnapshot(msg.snap);
  if(Array.isArray(msg.log))S.log=msg.log.slice();

  if(msg.step){
    const steps=S.record.steps;
    /* 同一步重复到达就覆盖，别把棋谱撑出重复行 */
    if(steps.length&&steps[steps.length-1].n===msg.step.n)steps[steps.length-1]=msg.step;
    else steps.push(msg.step);
  }
  if(S.over){
    S.record.result={
      winner:S.winner,
      hp:[S.hp[1],S.hp[2]],
      stones:[countStones(ELF),countStones(DEMON)],
      moves:S.record.steps.length
    };
    S.overAt=performance.now();
  }

  refreshThreats(true);
  renderAll();renderRecord();
  netPlayFx(msg,prevThreatKey);
  if(!wasOver&&S.over)netGuestEnding();
}

/* 把服务端那一手的演出在本机重放：涟漪、反击、金光、飘字、发芽。
 * 音效按 acts 推，不用把 sfx 名字塞进网络包，省字节也不易走岔。 */
function netPlayFx(msg,prevThreatKey){
  const fx=msg.fx||{};
  const st=msg.step||{};
  const who=st.player||other(S.turn);

  if(st.idx!=null){
    sfx('place',who);
    animateDrop(st.idx,who);
  }
  if(fx.counter)sfx('counter');

  const acts=st.acts||[];
  if(acts.indexOf('抵消')>=0)sfx('cancel');
  else if(acts.indexOf('ASCEND')>=0)sfx('ascend');

  if(fx.ascend&&fx.ascend.length)animateAscend(fx.ascend,who);
  if(fx.dmg&&fx.dmg.amount>0){
    animateDamage(fx.dmg.amount,fx.dmg.victim);
    sfx('damage');
  }
  if(fx.grown&&fx.grown.length){
    fx.grown.forEach(i=>animateSprout(i));
    sfx('plant');
  }
  if(S.turn===NET.mySide&&S.threats.size&&S.threatKey!==prevThreatKey)sfx('threat');
}

/* 对手离开对局：把这一局在本地判给还在的人，终局画面照常出来。
 * 服务端那边其实已经算好了胜负，但只发了通知没发终局快照，
 * 所以这里按「留下的人获胜」补上，让棋谱和结算面板都对得上。 */
function netSettleLeave(text){
  toast(text);
  NET.away=true;
  NET.pendingMove=null;
  NET.tableDead=true;          // 桌面作废：不能再请求再来一局
  try{sessionStorage.removeItem('4ascend-in-game');}catch(e){}

  const mine=NET.mySide;
  if(!S.over&&mine){
    S.over=true;S.overAt=performance.now();
    S.winner=mine;
    S.record.result={
      winner:mine,
      hp:[S.hp[1],S.hp[2]],
      stones:[countStones(ELF),countStones(DEMON)],
      moves:S.record.steps.length,
      reason:'oppleft'
    };
    refreshThreats(true);
    renderAll();renderRecord();
    netGuestEnding();
  }else{
    netBar();netSyncUI();
  }
}

/* 终局：结局配乐与败者面板炸开在服务端不会发生，这边自己补 */
function netGuestEnding(){
  NET.pendingMove=null;
  syncSceneMusic(true);
  if(!MUS.on)sfx(endingKind()||'win');
  if(S.winner)setTimeout(()=>{
    if(S.over&&S.winner)shatterPanel(other(S.winner));
  },0);
  netBar();netSyncUI();
}

/* 落子入口（由 07-app.js 的 onCell 调用）。返回 true 表示这一手已被联机层接管 */
function netHandleCell(i){
  if(!NET.active)return false;
  if(S.over||replay.active||NET.pendingMove!=null)return true;
  if(NET.away||!NET.connected){toast('对手掉线了，等他回来');return true;}
  if(S.turn!==NET.mySide){toast('还没轮到你');return true;}
  if(S.board[i]!==EMPTY)return true;

  /* 本地不结算，只把落点报给服务器；真正的判定在 server/engine.js 里 */
  NET.pendingMove=i;
  if(!netSend({t:'move',idx:i})){
    NET.pendingMove=null;
    toast('连接已断开，正在重连…');
    return true;
  }
  renderAll();
  setTimeout(()=>{
    if(NET.pendingMove===i){
      NET.pendingMove=null;
      renderAll();
      toast('服务器没有回应，请再点一次');
    }
  },8000);
  return true;
}

/* 再来一局：服务端收到就重开，两人同时进新局 */
function netRequestRematch(){
  if(!NET.active){newGame();return;}
  /* 对手已经走了，桌子没了：没人会收到 rematch 请求，
   * 与其干等着，不如把这一页翻过去，直接开一盘本地的 */
  if(NET.tableDead){
    netLeaveToLocal();
    newGame();
    toast('对手已离开，已开一局本地对战');
    return;
  }
  if(!netSend({t:'rematch'})){toast('连接已断开');return;}
  toast('已请求再来一局');
}

/* 退出对局回到本地 */
function netLeaveToLocal(){
  netSend({t:'leave'});
  try{sessionStorage.removeItem('4ascend-in-game');}catch(e){}
  const was=NET.active;
  NET.active=false;NET.tableId='';NET.pendingMove=null;NET.away=false;
  NET.tableDead=false;
  NET.oppLat=0;
  NET.oppName='';NET.queued=false;NET.waitingInvite=null;
  /* 一律回本地双人：联机那盘棋两边都是人下的，落到 ai 模式会让魔族那半场
   * 直接点不动（play() 会拦），看着像卡死 */
  if(mode==='net')mode='pvp';
  netBar();netSyncUI();
  if(was){renderAll();renderRecord();}
}

/* ================= 大厅 UI ================= */
const NET_STATUS={idle:'空闲',queued:'匹配中',playing:'对局中',waiting:'房间中',away:'离线'};

function netHint(text,bad){
  const h=netEl('lobby-hint');
  if(!h)return;
  h.textContent=text||'';
  h.classList.toggle('bad',!!bad);
}

function syncNameUI(){
  const i=netEl('in-name');
  if(i&&document.activeElement!==i)i.value=NET.name;
}

function renderLobby(){
  const pl=netEl('player-list');
  const tl=netEl('table-list');
  if(!pl||!tl)return;

  pl.textContent='';
  const others=NET.players.filter(p=>p.id!==NET.id);
  netEl('player-count').textContent=others.length;
  if(!others.length){
    pl.appendChild(netDom('li','lb-empty','还没有别人，等一等或者把地址发给朋友'));
  }
  for(const p of others){
    const li=netDom('li','lb-row');
    li.dataset.pid=p.id;
    li.appendChild(netDom('span','lb-name',p.name));
    /* 延迟只有测到了才显示；没测到就留白，别写个 0ms 骗人 */
    if(p.lat){
      const lat=netDom('span','lb-lat',p.lat+'ms');
      lat.dataset.q=netLatQuality(p.lat);
      lat.title='他到服务器的往返延迟';
      li.appendChild(lat);
    }
    li.appendChild(netDom('span','lb-status s-'+(p.status||'idle'),NET_STATUS[p.status]||'空闲'));
    if(p.status==='idle'&&!NET.active&&!NET.queued){
      const b=netDom('button','chip tiny','挑战');
      b.type='button';
      b.addEventListener('click',()=>{
        netSend({t:'invite',target:p.id,cfg:netCfg()});
      });
      li.appendChild(b);
    }
    pl.appendChild(li);
  }

  tl.textContent='';
  netEl('table-count').textContent=NET.tables.length;
  if(!NET.tables.length){
    tl.appendChild(netDom('li','lb-empty','还没有公开房间，可以自己开一个'));
  }
  for(const t of NET.tables){
    const li=netDom('li','lb-row');
    const info=netDom('div','lb-info');
    info.appendChild(netDom('b','lb-host',t.host+' 的房间'));
    info.appendChild(netDom('span','lb-meta',
      t.size+'×'+t.size+' · 生命 '+t.maxHp+' · 植物 '+Math.round(t.plantChance*100)+'%'));
    li.appendChild(info);
    if(!NET.active&&!NET.queued){
      const b=netDom('button','chip tiny','加入');
      b.type='button';
      b.addEventListener('click',()=>netSend({t:'join',tableId:t.id}));
      li.appendChild(b);
    }
    tl.appendChild(li);
  }
  netSyncUI();
}

function netSyncUI(){
  const c=NET.connected;
  const quick=netEl('btn-quick');
  if(quick){
    quick.disabled=!c||NET.active;
    quick.textContent=NET.queued?'取消匹配':'开始匹配';
    quick.classList.toggle('gold',!NET.queued);
  }
  const create=netEl('btn-create-room');
  if(create)create.disabled=!c||NET.active||NET.queued;
  const leave=netEl('btn-net-leave');
  if(leave)leave.hidden=!NET.active;
  const name=netEl('in-name');
  if(name)name.disabled=!c;
  /* 地址框始终可编辑：连上了也可能想换一台服务器 */
  const conn=netEl('btn-connect');
  if(conn){
    conn.disabled=NET.connecting;
    conn.textContent=NET.connecting?'连接中…':(c?'重连':'连接');
  }
  const q=netEl('quick-desc');
  if(q){
    q.textContent='按当前设置 '+CFG.size+'×'+CFG.size+' · 生命 '+CFG.maxHp+
      ' · 植物 '+Math.round(CFG.plantChance*100)+'%（设置相同的人才会被凑到一起）';
  }
  netPingUI();
  netBar();
}

function netShowInvite(msg){
  NET.invite={tableId:msg.tableId,fromName:msg.fromName};
  const box=netEl('lobby-invite');
  if(!box)return;
  netEl('invite-txt').textContent=msg.fromName+' 邀请你对局（'+msg.cfg.size+'×'+msg.cfg.size+
    ' · 生命 '+msg.cfg.maxHp+'）';
  box.hidden=false;
  /* 人可能正在棋盘上，弹个 toast 让他知道 */
  if(!netEl('netmodal').classList.contains('open')){
    toast(msg.fromName+' 邀请你对局，打开「联机」接受');
  }
}

function hideInvite(){
  NET.invite=null;
  const box=netEl('lobby-invite');
  if(box)box.hidden=true;
}

function netOpen(){
  netEl('netmodal').classList.add('open');
  syncAddrUI();
  syncNameUI();
  netSyncUI();
  renderLobby();
  /* https 页面只允许 wss：如果地址还是「IP:端口」这种明文写法，
   * 进大厅就把规则摆出来，别让人等六轮重试（约一分钟）才知道原因 */
  if(location.protocol==='https:'&&!NET.connected&&!NET.active){
    let host='';
    try{host=NET.addr?new URL(NET.addr).hostname:'';}catch(e){}
    if(!host||/^[\d.]+$/.test(host)||/^\[/.test(host)){
      netHint('本页是 https，联机地址要填支持 wss:// 的域名（例如 game.example.com）；直接填 IP:端口 会因服务器没有证书而连不上。');
    }
  }
  netConnect();
}

/* ================= 事件绑定 ================= */
function netBindUI(){
  const btnNet=netEl('btn-net');
  if(btnNet)btnNet.addEventListener('click',netOpen);

  const close=netEl('btn-net-close');
  if(close)close.addEventListener('click',()=>netEl('netmodal').classList.remove('open'));

  const leave=netEl('btn-net-leave');
  if(leave)leave.addEventListener('click',()=>{
    netLeaveToLocal();
    netEl('netmodal').classList.remove('open');
    toast('已离开对局');
  });

  const barX=netEl('netbar-x');
  if(barX)barX.addEventListener('click',()=>{
    if(NET.active)netLeaveToLocal();else netDisconnectLocal();
    toast('已断开联机');
  });

  netEl('netmodal').addEventListener('click',e=>{
    if(e.target.id==='netmodal')netEl('netmodal').classList.remove('open');
  });

  const name=netEl('in-name');
  const saveName=()=>{
    const v=String(name.value||'').trim().slice(0,12);
    if(!v){toast('昵称不能为空');name.value=NET.name;return;}
    NET.name=v;
    try{localStorage.setItem('4ascend-name',v);}catch(e){}
    netSend({t:'rename',name:v});
    toast('昵称：'+v);
  };
  if(name){
    name.addEventListener('keydown',e=>{
      if(e.key==='Enter'){e.preventDefault();saveName();}
    });
    name.addEventListener('blur',()=>{if(name.value.trim()&&name.value.trim()!==NET.name)saveName();});
  }
  const nameBtn=netEl('btn-name');
  if(nameBtn)nameBtn.addEventListener('click',saveName);

  /* 手动填地址连接：回车等同点按钮，省得手从键盘上挪开。
   * 对局中想用同一地址重连是允许的，只有「换成别的服务器」才会被 netApplyAddr 挡下 */
  const addr=netEl('in-server');
  const doConnect=()=>netApplyAddr(addr?addr.value:'');
  if(addr){
    addr.addEventListener('keydown',e=>{
      if(e.key==='Enter'){e.preventDefault();doConnect();}
    });
  }
  const conn=netEl('btn-connect');
  if(conn)conn.addEventListener('click',doConnect);

  const quick=netEl('btn-quick');
  if(quick)quick.addEventListener('click',()=>{
    if(NET.queued)netSend({t:'queue',on:false});
    else netSend({t:'queue',on:true,cfg:netCfg()});
  });

  const create=netEl('btn-create-room');
  if(create)create.addEventListener('click',()=>{
    netSend({t:'create',cfg:netCfg()});
  });

  const yes=netEl('btn-invite-yes');
  if(yes)yes.addEventListener('click',()=>{
    if(!NET.invite)return;
    netSend({t:'accept',tableId:NET.invite.tableId});
    hideInvite();
  });
  const no=netEl('btn-invite-no');
  if(no)no.addEventListener('click',()=>{
    if(!NET.invite)return;
    netSend({t:'decline',tableId:NET.invite.tableId});
    hideInvite();
  });

  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    const m=netEl('netmodal');
    if(m&&m.classList.contains('open'))m.classList.remove('open');
  });

  /* 关页面/刷新**不发 leave**：leave 在服务端等于「认输退出」。
   * 直接断线就好，牌桌会保留 90 秒，刷新后同一 token 连回来能接着下。 */
}

/* 名字与 token：token 用 sessionStorage（每个标签页一份，刷新还在、新标签页另算），
 * 这样「刷新页面」能接回原局，而开第二个标签页不会被当成同一个人 */
(function netBoot(){
  try{
    NET.name=localStorage.getItem('4ascend-name')||'';
  }catch(e){}
  try{
    NET.token=sessionStorage.getItem('4ascend-token')||'';
    if(!NET.token){
      NET.token='t'+Math.random().toString(36).slice(2)+Date.now().toString(36);
      sessionStorage.setItem('4ascend-token',NET.token);
    }
  }catch(e){
    NET.token='t'+Math.random().toString(36).slice(2);
  }
  if(!NET.name)NET.name='玩家'+Math.floor(Math.random()*900+100);
  syncNameUI();

  /* 服务器地址：上次填过的优先，否则用当前页面所在的服务器（同一台机器起的服务） */
  try{
    NET.addr=netParseAddr(localStorage.getItem('4ascend-server'))||netParseAddr(netDefaultAddr())||'';
  }catch(e){
    NET.addr=netParseAddr(netDefaultAddr())||'';
  }
  syncAddrUI();

  /* 刷新前正在对局 → 主动连回去，服务端会把整盘棋补发过来。
   * 只是打开页面玩单机的话不必占用一条连接 */
  let wasPlaying=false;
  try{wasPlaying=sessionStorage.getItem('4ascend-in-game')==='1';}catch(e){}
  if(wasPlaying)setTimeout(netConnect,300);
})();

netBindUI();
