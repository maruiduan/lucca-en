/* lucca English · lesson player v2 (audio-only, thumb bar, step-guided) */
(function(){
const L=window.LESSON,S=L.sentences,SEG=L.segments,{LS,Vocab,speak,toast,SPK,esc}=window.EN;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const PK='en.'+L.slug+'.p';
const P=Object.assign({seg:0,step:0,done:{},dict:{},draft:{},sub:'bi',listens:{},rate:1,t:{}},LS.get(PK,{}));
['draft','t','done','dict','listens'].forEach(k=>{if(!P[k]||typeof P[k]!=='object'||Array.isArray(P[k]))P[k]={}});
const saveP=()=>LS.set(PK,P);
const STEPS=[['盲听','01'],['听写','02'],['精读','03'],['跟读','04'],['复述','05']];
const HIDE_STEPS=[0,1,4];           /* transcript covered in these steps */
const RATES=[1,0.75,0.5];
const st={seg:Number.isInteger(P.seg)&&P.seg>=0&&P.seg<SEG.length?P.seg:0,step:Number.isInteger(P.step)&&P.step>=0&&P.step<STEPS.length?P.step:0,sub:'bi',rate:RATES.includes(P.rate)?P.rate:1,repeat:false,loopId:null,a:null,b:null,stopAt:null,onStop:null,
  cur:-1,follow:true,dictId:null,shId:null,playing:false,peekAll:false,sheet:null,resume:false,listenFrom:null};
let M=null;
const fmt=t=>{t=Math.max(0,t|0);return (t/60|0)+':'+String(t%60).padStart(2,'0')};
const seg=()=>SEG[st.seg];
const segIds=g=>{const r=[];for(let i=g.from;i<=g.to;i++)r.push(i);return r};
const wide=()=>matchMedia('(min-width:1024px)').matches;
const topH=()=>$('#stage').getBoundingClientRect().height;
const barH=()=>{const b=$('#thumb');return b?b.getBoundingClientRect().height:0};

/* ---------- media ---------- */
const qs=new URLSearchParams(location.search);
async function initMedia(){
  if(qs.get('src')==='mock'){M=new Providers.MockProvider();await M.load()}
  else{M=new Providers.AudioProvider(null,L.audio);try{await M.load()}catch(e){toast('音频加载失败，请检查网络')}
    /* timeupdate keeps loops / stop points working when rAF is throttled (screen locked, tab in background) */
    M.a&&M.a.addEventListener('timeupdate',()=>guard(M.time()));
    M.a&&M.a.addEventListener('ended',()=>{st.playing=false;updPlay()})}
  M.setRate(st.rate);M.on(e=>{st.playing=e==='play';updPlay();updSession()});window.__M=M;document.body.dataset.src=M.kind;tick();
}
function play(){if(!M)return;stopExtras();const g=seg(),t=M.time();if(t>=g.e-0.05||t<g.s-0.5)M.seek(g.s);if(st.step===0)st.listenFrom=M.time();M.play()}
function pause(){stopExtras();M&&M.pause()}
function playFrom(i,once,cb){if(!M)return;stopExtras();st.stopAt=once?S[i].e:null;st.onStop=cb||null;if(st.repeat){st.loopId=i;updLoopChip()}M.seek(S[i].s);M.play();setCur(i,true)}
function playSeg(cb){if(!M)return;stopExtras();const g=seg();st.stopAt=g.e;st.onStop=cb||null;st.listenFrom=g.s;M.seek(g.s);M.play()}
function updPlay(){$('#icPlay').innerHTML=st.playing?'<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>':'<path d="M8 5v14l11-7z"/>';$('#bPlay').setAttribute('aria-label',st.playing?'暂停':'播放')}
function idxAt(t){let lo=0,hi=S.length-1,r=0;while(lo<=hi){const m=(lo+hi)>>1;if(S[m].s<=t+0.05){r=m;lo=m+1}else hi=m-1}return r}
/* loop / stop logic — shared by rAF tick and audio timeupdate */
function guard(t){if(!M||M.paused())return;const g=seg();
  if(st.a!=null&&st.b!=null){if(t>=S[st.b].e||t<S[st.a].s-0.6)M.seek(S[st.a].s)}
  else if(st.repeat&&st.loopId!=null){if(t>=S[st.loopId].e-0.03||t<S[st.loopId].s-0.6)M.seek(S[st.loopId].s)}
  else if(st.stopAt!=null&&t>=st.stopAt-0.03){M.pause();st.stopAt=null;const cb=st.onStop;st.onStop=null;segEnd(t);cb&&cb()}
  else if(t>=g.e+0.3&&st.stopAt==null){M.pause();segEnd(t)}}
/* blind-listen counter: any play that covered most of the segment counts */
function segEnd(t){const g=seg();if(st.step===0&&st.listenFrom!=null&&st.listenFrom<=g.s+(g.e-g.s)*0.15&&t>=g.e-1){st.listenFrom=null;P.listens[g.n]=(P.listens[g.n]||0)+1;saveP();const c=$('#lc');c&&(c.textContent=P.listens[g.n]);toast('听完第 '+P.listens[g.n]+' 遍'+(P.listens[g.n]>=2?'，试着回答下面的问题':''))}}
let lastFrame=0,lastSave=0;
function tick(){
  requestAnimationFrame(tick);const now=performance.now();if(now-lastFrame<80||!M)return;lastFrame=now;
  const t=M.time(),g=seg(),playing=!M.paused();
  if(playing!==st.playing){st.playing=playing;updPlay()}
  guard(t);
  const i=idxAt(t);if(i!==st.cur)setCur(i);
  const span=g.e-g.s;$('#fill').style.width=Math.min(100,Math.max(0,(t-g.s)/span*100))+'%';
  $('#tCur').textContent=fmt(Math.max(0,t-g.s));
  if(playing&&now-lastSave>2000){lastSave=now;P.t[g.n]=+t.toFixed(2);saveP()}
  updToCur();
}
function followOK(){return st.sub!=='hide'&&(wide()||st.step===2)&&!st.sheet}
function setCur(i,force){
  st.cur=i;$$('.sent.cur').forEach(e=>e.classList.remove('cur'));const el=$('#s'+i);if(!el)return;el.classList.add('cur');
  if(st.playing&&st.follow&&followOK())scrollToSent(el);
  if(st.step===3&&st.shId!==i&&i>=seg().from&&i<=seg().to&&!st.repeat&&st.playing){st.shId=i;updShadowBig()}
}
function scrollToSent(el){const r=el.getBoundingClientRect(),h=topH();if(r.top<h+8||r.bottom>innerHeight-barH()-20){autoScroll=true;window.scrollTo({top:scrollY+r.top-h-14,behavior:'smooth'});setTimeout(()=>autoScroll=false,700)}}
let autoScroll=false;
function curVisible(){const el=$('#s'+st.cur);if(!el)return true;const r=el.getBoundingClientRect();return r.bottom>topH()&&r.top<innerHeight-barH()}
function updToCur(){const b=$('#toCur');const show=st.playing&&!st.follow&&st.sub!=='hide'&&!curVisible();if(b.hidden===show)b.hidden=!show}
$('#toCur').onclick=()=>{st.follow=true;const el=$('#s'+st.cur);el&&scrollToSent(el);$('#toCur').hidden=true};
['touchmove','wheel'].forEach(ev=>addEventListener(ev,e=>{if(autoScroll||!st.playing||st.sheet)return;if(e.target.closest&&e.target.closest('.colL')&&wide())return;st.follow=false},{passive:true}));

/* ---------- thumb bar ---------- */
$('#bPlay').onclick=()=>{if(!M)return;M.paused()?play():pause()};
$('#bPrev').onclick=()=>{if(!M)return;const c=Math.max(seg().from,st.cur);const i=Math.max(seg().from,(M.time()-S[c].s>1.2?c:c-1));step13Sync(i);playFrom(i,false)};
$('#bNext').onclick=()=>{const i=Math.min(seg().to,Math.max(seg().from,st.cur+1));step13Sync(i);playFrom(i,false)};
function step13Sync(i){if(st.step===1){st.dictId=i;renderPanel()}if(st.step===3){st.shId=i;updShadowBig()}}
$('#bRep').onclick=()=>{if(!M)return;st.repeat=!st.repeat;const base=st.step===3?st.shId:st.step===1?st.dictId:st.cur;st.loopId=st.repeat?Math.min(seg().to,Math.max(seg().from,base==null?st.cur:base)):null;
  if(st.repeat){st.a=st.b=null;updAB()}$('#bRep').classList.toggle('on',st.repeat);updLoopChip();if(st.repeat&&M.paused())playFrom(st.loopId,false)};
$('#bAB').onclick=()=>{if(!M)return;const c=Math.max(seg().from,st.cur);
  if(st.a==null){st.a=c;if(st.repeat){st.repeat=false;$('#bRep').classList.remove('on')}toast('已设起点 A，播放到想停的句子再点一次')}
  else if(st.b==null){st.b=Math.max(st.a,c);M.seek(S[st.a].s);M.play()}
  else{st.a=st.b=null}
  updAB();updLoopChip()};
function updAB(){$('#bAB').classList.toggle('on',st.a!=null);$('#abTxt').textContent=st.a==null?'A-B':st.b==null?'A…':'A·B';
  $$('.sent.inA').forEach(e=>e.classList.remove('inA'));if(st.a!=null)for(let i=st.a;i<=(st.b==null?st.a:st.b);i++){const e=$('#s'+i);e&&e.classList.add('inA')}
  const z=$('#abz'),g=seg();if(st.a!=null&&st.b!=null){z.hidden=false;const sp=g.e-g.s;z.style.left=((S[st.a].s-g.s)/sp*100)+'%';z.style.width=((S[st.b].e-S[st.a].s)/sp*100)+'%'}else z.hidden=true}
function updLoopChip(){const c=$('#loopChip'),g=seg();let t='';
  if(st.a!=null&&st.b!=null)t='A-B 循环中 · 第 '+(st.a-g.from+1)+'–'+(st.b-g.from+1)+' 句';
  else if(st.a!=null)t='已设起点 A（第 '+(st.a-g.from+1)+' 句）· 再点 A-B 设终点';
  else if(st.repeat&&st.loopId!=null)t='单句循环中 · 第 '+(st.loopId-g.from+1)+' 句';
  c.hidden=!t;c.innerHTML=t?'<span>'+t+'</span><button id="loopX" aria-label="关闭循环">✕</button>':'';
  if(t)$('#loopX').onclick=()=>{st.a=st.b=null;st.repeat=false;st.loopId=null;$('#bRep').classList.remove('on');updAB();updLoopChip()}}
function setRate(r){st.rate=r;P.rate=r;saveP();M&&M.setRate(r);$('#rateTxt').textContent=r+'×';$('#bRate').classList.toggle('on',r!==1)}
$('#bRate').onclick=()=>{setRate(RATES[(RATES.indexOf(st.rate)+1)%RATES.length]);toast('语速 '+st.rate+'×')};
$$('#subMode button').forEach(b=>b.onclick=()=>{P.sub=b.dataset.m;saveP();setSub(b.dataset.m)});
function setSub(m){st.sub=m;$$('#subMode button').forEach(x=>x.classList.toggle('on',x.dataset.m===m));const c=$('#sents');c.classList.remove('mode-en','mode-zh','mode-bi','mode-hide');c.classList.add('mode-'+m);renderCover()}
function stepSub(){return HIDE_STEPS.includes(st.step)&&!st.peekAll?'hide':(st.step===3&&!P.subTouched?'en':(P.sub||'bi'))}
$$('#subMode button').forEach(b=>b.addEventListener('click',()=>{P.subTouched=1;saveP()}));
/* timebar scrub within segment */
(function(){const tb=$('#timebar');const go=e=>{const r=tb.getBoundingClientRect(),x=e.clientX-r.left,g=seg();M&&M.seek(g.s+(g.e-g.s)*Math.min(1,Math.max(0,x/r.width)))};tb.addEventListener('pointerdown',e=>{go(e);tb.setPointerCapture(e.pointerId);tb.onpointermove=go;tb.onpointerup=()=>tb.onpointermove=null})})();

/* ---------- segments / tabs ---------- */
function doneArr(n){if(!Array.isArray(P.done[n])||P.done[n].length!==5)P.done[n]=[0,0,0,0,0];return P.done[n]}
const firstTodo=n=>{const d=doneArr(n),k=d.indexOf(0);return k<0?0:k};
const doneN=n=>doneArr(n).filter(Boolean).length;
function renderSegs(){$('#segs').innerHTML=SEG.map((g,k)=>{const d=doneArr(g.n),n=doneN(g.n);return '<button data-k="'+k+'" class="'+(k===st.seg?'on':'')+(n===5?' all':'')+'"><b>'+String(g.n).padStart(2,'0')+'</b> <small>'+fmt(g.e-g.s)+' · '+(g.to-g.from+1)+'句</small><span>'+esc(g.zh)+'</span><div class="dots">'+d.map(x=>'<i class="'+(x?'d':'')+'"></i>').join('')+'<em>'+(n===5?'✓ 完成':n+'/5')+'</em></div></button>'}).join('');
  $$('#segs button').forEach(b=>b.onclick=()=>selSeg(+b.dataset.k));const on=$('#segs .on');if(on){const c=$('#segs');c.scrollLeft=on.offsetLeft-(c.clientWidth-on.offsetWidth)/2}
  $('#segNo').textContent='第 '+(st.seg+1)+'/'+SEG.length+' 段';$('#tbSeg').textContent=String(seg().n).padStart(2,'0')+' '+seg().zh;$('#tEnd').textContent=fmt(seg().e-seg().s)}
function renderTabs(){const d=doneArr(seg().n);$('#tabs').innerHTML=STEPS.map((s,k)=>'<button data-k="'+k+'" class="'+(k===st.step?'on ':'')+(d[k]?'done':'')+'"><i>'+s[1]+'</i>'+s[0]+'</button>').join('');$$('#tabs button').forEach(b=>b.onclick=()=>selStep(+b.dataset.k))}
function resetLoops(){st.a=st.b=null;st.repeat=false;st.loopId=null;st.stopAt=null;st.onStop=null;$('#bRep').classList.remove('on');updAB();updLoopChip()}
function selSeg(k){stopExtras();if(M){M.pause()}st.seg=k;P.seg=k;st.dictId=null;st.shId=null;st.peekAll=false;resetLoops();
  st.step=firstTodo(SEG[k].n);P.step=st.step;saveP();closeSheet(true);renderAll();
  const g=seg();if(M){M.seek(g.s)}setCur(g.from,true);scrollToCard()}
function selStep(k,noScroll){stopExtras();closeSheet(true);if(M)M.pause();st.step=k;P.step=k;saveP();st.peekAll=false;resetLoops();renderAll();
  const g=seg();
  if(M){if(k===1){M.seek(S[st.dictId].s);setCur(st.dictId,true)}else if(k===3){M.seek(S[st.shId].s);setCur(st.shId,true)}else{M.seek(g.s);setCur(g.from,true)}}
  if(!noScroll)scrollToCard()}
function renderAll(){document.body.dataset.step=st.step;renderSegs();renderTabs();renderSents();renderPanel();setSub(stepSub());updAB()}
function markDone(k,msg){const d=doneArr(seg().n);if(!d[k]){d[k]=1;saveP();renderTabs();renderSegs();msg!==false&&toast(msg||('「'+STEPS[k][0]+'」完成 ✓'))}}
function scrollToCard(){if(wide()){scrollTo({top:0});const c=$('.colL');c&&(c.scrollTop=0);return}const y=$('#tabs').getBoundingClientRect().top+scrollY-topH()-10;scrollTo({top:Math.max(0,y)})}

/* segment overview sheet */
$('#bSegs').onclick=()=>{openSheet('segs','<div class="grab"></div><h3 class="sh-h">全部 '+SEG.length+' 段 · 点一段从它的下一个未完成步骤开始</h3><div class="seglist">'+SEG.map((g,k)=>{const n=doneN(g.n);return '<button data-k="'+k+'" class="'+(k===st.seg?'on':'')+'"><b>'+String(g.n).padStart(2,'0')+'</b><span>'+esc(g.zh)+'<small>'+fmt(g.e-g.s)+' · '+(g.to-g.from+1)+' 句</small></span><em class="'+(n===5?'all':'')+'">'+(n===5?'✓ 完成':n?'进行中 '+n+'/5':'未开始')+'</em></button>'}).join('')+'</div>');
  $$('.seglist button').forEach(b=>b.onclick=()=>selSeg(+b.dataset.k))};

/* ---------- transcript ---------- */
const VMAP={};SEG.forEach(g=>g.vocab.forEach(v=>{VMAP[v.w.toLowerCase()]=v}));
function vocabFor(tok,g){const t=tok.toLowerCase().replace(/[’']s$/,'');for(const v of g.vocab){const w=v.w.toLowerCase();if(w.includes(' ')||w.includes('('))continue;const stem=w.replace(/e$/,'');if(t===w||(t.startsWith(stem)&&t.length<=w.length+3))return v}return null}
function tokens(en,g){return en.split(/([A-Za-z][A-Za-z’'\-]*)/).map((p,k)=>{if(k%2===0)return esc(p);const v=vocabFor(p,g),saved=Vocab.has((v?v.w:p));return '<span class="w'+(v?' v':'')+(saved?' saved':'')+'" data-w="'+esc(p)+'"'+(v?' data-v="'+esc(v.w)+'"':'')+'>'+p+'</span>'}).join('')}
function renderSents(){const g=seg();$('#sents').innerHTML=segIds(g).map(i=>{const s=S[i];return '<div class="sent'+(st.step===1&&P.dict[i]!=null?' peek':'')+'" id="s'+i+'" data-i="'+i+'" data-n="第 '+(i-g.from+1)+' 句"><div class="side"><span class="tm">'+fmt(s.s)+'</span>'+(st.step===2?'<button class="wl" aria-label="查这句的词">查词</button>':'')+'</div><div class="t-en">'+tokens(s.en,g)+'</div><div class="t-zh">'+esc(s.zh)+'</div></div>'}).join('');
  $('#sents').classList.toggle('reading',st.step===2||st.step===3);$('#trTitle').textContent=st.step===2?'点句子播放 · 点单词或「查词」看释义':'字幕 · 点任意一句从这句开始播放';
  updAB();if(st.cur>=g.from&&st.cur<=g.to)$('#s'+st.cur).classList.add('cur')}
function renderCover(){const c=$('#cover');const hide=st.sub==='hide';c.hidden=!hide;$('#subMode').hidden=hide||!(st.step===2||st.step===3);
  if(!hide)return;const msg=st.step===0?'盲听中，先别看字幕：只听，抓大意。':st.step===1?'听写中，字幕藏起来了；核对过的句子会显示出来。':'复述中，字幕藏起来了，试着自己讲出来。';
  c.innerHTML='<b>🎧 '+msg+'</b><span>下面每一行是一句，点一行就从那句开始播放。</span><button class="btn" id="peekAll">偷看全部字幕</button>';
  $('#peekAll').onclick=()=>{st.peekAll=true;setSub(P.sub||'bi');toast('已显示字幕，切换步骤后会重新遮住')}}
$('#sents').addEventListener('click',e=>{
  const row=e.target.closest('.sent');if(!row)return;const i=+row.dataset.i;
  if(e.target.closest('.wl')){openWordList(i);return}
  const w=e.target.closest('.w');
  if(w&&(st.step===2||st.step===3)){openWord(w.dataset.w,w.dataset.v,i);return}
  st.follow=true;
  if(st.step===1){st.dictId=i;renderPanel();playFrom(i,true);return}
  if(st.step===3){st.shId=i;updShadowBig();playFrom(i,true);return}
  if(st.step===0)st.listenFrom=null;
  if(st.repeat){st.loopId=i;updLoopChip()}playFrom(i,false)});

/* ---------- sheets (word / word list / segments) ---------- */
function openSheet(kind,html){if(M&&!M.paused()&&kind!=='segs'){st.resume=true;M.pause()}else if(kind!=='segs'&&!st.sheet)st.resume=false;
  st.sheet=kind;$('#sheet').className='sheet open '+kind;$('#sheet').innerHTML=html;$('#sheetBg').classList.add('open')}
function closeSheet(silent){if(!st.sheet)return;const was=st.sheet;st.sheet=null;$('#sheet').classList.remove('open');$('#sheetBg').classList.remove('open');$$('.w.sel').forEach(e=>e.classList.remove('sel'));
  if(!silent&&st.resume&&was!=='segs'&&M){st.resume=false;M.play()}st.resume=false}
/* keep the tapped sentence visible above the sheet */
function keepAbove(i){requestAnimationFrame(()=>{const el=$('#s'+i),sh=$('#sheet');if(!el)return;const r=el.getBoundingClientRect(),top=innerHeight-sh.getBoundingClientRect().height;if(r.bottom>top-8||r.top<topH()){autoScroll=true;scrollTo({top:scrollY+r.top-topH()-12,behavior:'smooth'});setTimeout(()=>autoScroll=false,700)}})}
function openWord(word,vw,i){const v=vw?VMAP[vw.toLowerCase()]:null,s=S[i];const key=v?v.w:word.replace(/[’']s$/,'');
  speak(key);
  openSheet('word','<div class="grab"></div><div class="wh"><span class="word-big">'+esc(key)+'</span>'+(v?'<span class="ipa">'+esc(v.ipa)+'</span>':'')+'<button class="spk" id="shSpk" aria-label="朗读">'+SPK+'</button><button class="shx" id="shX" aria-label="关闭">✕</button></div>'+
   (v?'<div class="mean">'+esc(v.m)+'</div><div class="ex">'+esc(v.ex)+'<small>'+esc(v.exzh)+'</small></div>':'<div class="mean" style="color:var(--sub);font-size:14px">不在本段重点词表里。可以先加入生词本，或查词典。</div>')+
   '<div class="row sh-row"><button class="btn pri" id="shAdd">'+(Vocab.has(key)?'已在生词本':'＋ 生词本')+'</button><a class="btn" href="https://dict.youdao.com/result?word='+encodeURIComponent(key)+'&lang=en" target="_blank" rel="noopener">有道词典</a><button class="btn" id="shPlay">▶ 原句</button></div>'+
   '<div class="sh-note">播放已暂停，关闭后从原处继续</div>');
  $$('#s'+i+' .w').forEach(e=>e.classList.toggle('sel',e.dataset.w===word));
  $('#shSpk').onclick=()=>speak(key);$('#shX').onclick=()=>closeSheet();$('#shPlay').onclick=()=>{st.resume=false;closeSheet(true);playFrom(i,true)};
  $('#shAdd').onclick=()=>{const ok=Vocab.add({w:key,ipa:v?v.ipa:'',m:v?v.m:'',ex:v?v.ex:'',exzh:v?v.exzh:'',ctx:s.en,ctxzh:s.zh,src:L.slug+'#'+seg().n});$('#shAdd').textContent='已在生词本';if(ok){toast('已加入生词本');updVCount();$$('.w').forEach(e=>{if((e.dataset.v||e.dataset.w).toLowerCase()===key.toLowerCase())e.classList.add('saved')})}};
  keepAbove(i)}
function openWordList(i){const g=seg(),seen=new Set();const ws=(S[i].en.match(/[A-Za-z][A-Za-z’'\-]*/g)||[]).filter(w=>{const k=w.toLowerCase();if(seen.has(k))return false;seen.add(k);return true});
  openSheet('list','<div class="grab"></div><div class="wh"><h3 class="sh-h">这句里的词 · 点一个看释义</h3><button class="shx" id="shX" aria-label="关闭">✕</button></div><div class="wlist">'+ws.map(w=>{const v=vocabFor(w,g);return '<button data-w="'+esc(w)+'"'+(v?' data-v="'+esc(v.w)+'" class="v"':'')+'>'+esc(w)+'</button>'}).join('')+'</div>');
  $('#shX').onclick=()=>closeSheet();$$('.wlist button').forEach(b=>b.onclick=()=>{const keep=st.resume;openWord(b.dataset.w,b.dataset.v,i);st.resume=keep});keepAbove(i)}
$('#sheetBg').onclick=()=>closeSheet();
addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet()});
(function(){let y0=null;const sh=$('#sheet');sh.addEventListener('touchstart',e=>{y0=e.touches[0].clientY},{passive:true});sh.addEventListener('touchmove',e=>{if(y0!=null&&e.touches[0].clientY-y0>60&&sh.scrollTop<=0){closeSheet();y0=null}},{passive:true})})();
function updVCount(){const n=Object.keys(Vocab.all()).length;$('#vCount').textContent=n?' '+n:''}

/* ---------- step panels ---------- */
function nextBar(k){const g=seg(),last=st.seg>=SEG.length-1;
  if(k<4)return '<div class="nextbar"><button class="btn ok big" id="nextStep">完成「'+STEPS[k][0]+'」，下一步：'+STEPS[k+1][0]+' →</button></div>';
  return '<div class="nextbar"><button class="btn ok big" id="nextStep">'+(last?'完成本段 · 全部学完 🎉':'完成本段，下一段：'+esc(SEG[st.seg+1].zh)+' →')+'</button></div>'}
function bindNext(k){$('#nextStep').onclick=()=>{markDone(k,false);
  if(k<4){selStep(k+1)}else if(st.seg<SEG.length-1){toast('第 '+seg().n+' 段完成！');selSeg(st.seg+1)}else{markDone(4,false);toast('全部 '+SEG.length+' 段都学完了！去生词本复习吧');renderSegs()}}}
function renderPanel(){const g=seg(),k=st.step,el=$('#panel');
  const head=(t,how)=>'<h3>'+t+'<span class="pos">第 '+g.n+' 段 · 步骤 '+(k+1)+'/5</span></h3><div class="how">'+how+'</div>';
  if(k===0){const n=P.listens[g.n]||0;
    el.innerHTML=head('第一步 · 盲听','不看字幕，先完整听两遍，只抓大意：谁、发生了什么、他想说明什么。听不懂的地方先放过。')+
     '<div class="row"><button class="btn pri" id="pSeg">▶ 播放本段（'+fmt(g.e-g.s)+'）</button><span class="counter">已听 <b id="lc">'+n+'</b> 遍</span></div>'+
     '<div class="how" style="margin-top:14px;color:var(--ink)">'+esc(g.gist.q)+'</div><div class="quiz" id="quiz">'+g.gist.opts.map((o,j)=>'<button data-j="'+j+'">'+esc(o)+'</button>').join('')+'</div><div id="gsum"></div>'+nextBar(0);
    $('#pSeg').onclick=()=>playSeg();
    $$('#quiz button').forEach(b=>b.onclick=()=>{const j=+b.dataset.j;$$('#quiz button').forEach(x=>x.classList.remove('right','wrong'));b.classList.add(j===g.gist.ans?'right':'wrong');
      if(j===g.gist.ans){$('#gsum').innerHTML='<div class="reveal">大意：'+esc(g.gist.sum)+'</div>';markDone(0)}else toast('再听一遍试试')})}
  else if(k===1){const ids=segIds(g);if(st.dictId==null||st.dictId<g.from||st.dictId>g.to)st.dictId=ids.find(i=>P.dict[i]==null)??g.from;const i=st.dictId,pos=i-g.from+1,dn=ids.filter(x=>P.dict[x]!=null).length;
    el.innerHTML=head('第二步 · 听写','一句一句听，把听到的写下来。可以反复听；要慢一点就点底部的「语速」。写完按回车或点「核对」，漏掉和写错的词会标出来。标点和大小写不计分。')+
     '<div class="row"><button class="btn pri" id="dPlay">▶ 播放这句</button><button class="btn" id="dPrev">‹ 上一句</button><span class="qpos">第 '+pos+' / '+ids.length+' 句<small>已完成 '+dn+'</small></span><button class="btn" id="dNext">下一句 ›</button></div>'+
     '<div class="dict"><textarea id="dIn" enterkeyhint="done" placeholder="在这里写下你听到的英文…" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false"></textarea><div class="row"><button class="btn ok" id="dChk">核对</button><button class="btn" id="dShow">直接看答案</button><span class="hint">回车核对 · 再按回车下一句</span></div><div class="res" id="dRes"></div></div>'+nextBar(1);
    const go=j=>{st.dictId=j;renderPanel();playFrom(j,true)};
    $('#dPlay').onclick=()=>playFrom(i,true);
    $('#dPrev').onclick=()=>{if(i>g.from)go(i-1)};$('#dNext').onclick=()=>{if(i<g.to)go(i+1);else toast('已经是最后一句')};
    const ta=$('#dIn');ta.value=P.draft[i]||'';ta.oninput=()=>{P.draft[i]=ta.value;saveP();checked=false;$('#dChk').textContent='核对';$('#dRes').textContent=''};
    let checked=false;const chk=give=>{checkDict(i,ta.value,give);checked=true};
    $('#dChk').onclick=()=>checked?$('#dNext').click():chk();$('#dShow').onclick=()=>chk(true);
    ta.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();checked?(i<g.to?go(i+1):toast('已经是最后一句')):chk()}};
    $$('.sent').forEach(e=>e.classList.toggle('peek',P.dict[+e.dataset.i]!=null))}
  else if(k===2){el.innerHTML=head('第三步 · 精读','看中英字幕，弄懂每一句。点句子听原声；点单词或句子右边的「查词」看发音和释义，可以加入生词本。虚线标出的是这一段的重点词。')+
     '<div class="chips" id="vchips">'+g.vocab.map(v=>'<button class="chip" data-v="'+esc(v.w)+'">'+esc(v.w)+'</button>').join('')+'</div><div class="row"><button class="btn" id="addAll">＋ 重点词全部加入生词本</button></div>'+nextBar(2);
    $$('#vchips .chip').forEach(c=>c.onclick=()=>{const v=VMAP[c.dataset.v.toLowerCase()];const hit=segIds(g).find(i=>S[i].en.toLowerCase().includes(v.w.toLowerCase().split(/[ (]/)[0].replace(/e$/,'')))??g.from;openWord(v.w,v.w,hit)});
    $('#addAll').onclick=()=>{let n=0;g.vocab.forEach(v=>{const hit=segIds(g).find(i=>S[i].en.toLowerCase().includes(v.w.toLowerCase().split(/[ (]/)[0].replace(/e$/,'')))??g.from;if(Vocab.add({w:v.w,ipa:v.ipa,m:v.m,ex:v.ex,exzh:v.exzh,ctx:S[hit].en,ctxzh:S[hit].zh,src:L.slug+'#'+g.n}))n++});toast(n?'加入了 '+n+' 个词':'都已在生词本');updVCount();renderSents()}}
  else if(k===3){if(st.shId==null||st.shId<g.from||st.shId>g.to)st.shId=g.from;
    el.innerHTML=head('第四步 · 跟读模仿','一句一句模仿原声的语调、重音、连读和停顿。先听几遍（底部「单句循环」可以反复听），再点大按钮录音，录完会自动先放原声、再放你的。录音只存在这台手机上。')+
     '<div class="cur-big" id="shBig"></div>'+
     '<div class="rec"><button class="btn" id="sOrig">▶ 原声</button><button class="btn rec-big" id="sRec">● 录音</button><button class="btn" id="sMine" disabled>▶ 我的</button><button class="btn" id="sCmp" disabled>⇄ 对比</button></div>'+
     '<canvas class="wave" id="wave" hidden></canvas><div class="row"><button class="btn" id="sPrev">‹ 上一句</button><span class="qpos" id="sCnt"></span><button class="btn" id="sNext">下一句 ›</button></div>'+nextBar(3);
    updShadowBig();
    $('#sOrig').onclick=()=>playFrom(st.shId,true);
    $('#sRec').onclick=()=>toggleRec(st.shId);
    $('#sMine').onclick=()=>playMine(st.shId);
    $('#sCmp').onclick=()=>compare(st.shId);
    $('#sPrev').onclick=()=>{if(st.shId>g.from){st.shId--;updShadowBig();playFrom(st.shId,true)}};
    $('#sNext').onclick=()=>{if(st.shId<g.to){st.shId++;updShadowBig();playFrom(st.shId,true)}else toast('已经是最后一句')}}
  else{const kw=g.vocab.slice(0,6).map(v=>v.w);const key='retell'+g.n,has=!!REC.get(key);
    el.innerHTML=head('第五步 · 复述','不看字幕，用自己的话（尽量用原文的句子）把这一段讲一遍。可以先再听一遍原声，下面的关键词是提示。')+
     '<div class="chips">'+kw.map(w=>'<span class="chip">'+esc(w)+'</span>').join('')+'</div>'+
     '<div class="rec"><button class="btn" id="rSeg">▶ 再听一遍</button><button class="btn rec-big" id="rRec">'+(has?'● 重新录':'● 录下我的复述')+'</button><button class="btn" id="rMine"'+(has?'':' disabled')+'>▶ 回放</button></div><canvas class="wave" id="wave"'+(has?'':' hidden')+'></canvas>'+
     '<div class="row"><button class="btn" id="rPeek">'+(st.peekAll?'遮住原文':'对照原文')+'</button></div>'+nextBar(4);
    $('#rSeg').onclick=()=>playSeg();$('#rRec').onclick=()=>toggleRec(key);$('#rMine').onclick=()=>playMine(key);
    if(has)drawWave(REC.get(key));
    $('#rPeek').onclick=()=>{st.peekAll=!st.peekAll;setSub(stepSub());$('#rPeek').textContent=st.peekAll?'遮住原文':'对照原文';if(st.peekAll&&!wide())$('#sents').scrollIntoView({behavior:'smooth'})}}
  bindNext(k);
}
function updShadowBig(){const b=$('#shBig');if(!b)return;const s=S[st.shId],g=seg();b.innerHTML=esc(s.en)+'<small>'+esc(s.zh)+'</small>';$('#sCnt').innerHTML='第 '+(st.shId-g.from+1)+' / '+(g.to-g.from+1)+' 句<small>已录 '+segIds(g).filter(i=>REC.get(i)).length+'</small>';
  const has=!!REC.get(st.shId);$('#sMine').disabled=!has;$('#sCmp').disabled=!has;$('#sRec').textContent=has?'● 重录':'● 录音';$('#wave').hidden=!has;if(has)drawWave(REC.get(st.shId));if(st.repeat){st.loopId=st.shId;updLoopChip()}}

/* dictation diff (LCS on normalized words) */
const NUMW={'18':'eighteen','17':'seventeen','20':'twenty','30':'thirty','33':'thirty-three','35':'thirty-five'};
const canonical=w=>{for(const k in NUMW)if(w===NUMW[k])return k;return w};
const norm=s=>s.toLowerCase().replace(/[’‘]/g,"'").replace(/—/g,' ').split(/\s+/).map(w=>w.replace(/^[^a-z0-9$']+|[^a-z0-9']+$/g,'')).filter(Boolean);
function checkDict(i,typed,giveup){const ref=S[i].en.replace(/—/g,' — ').split(/\s+/).filter(Boolean),R=norm(S[i].en.replace(/—/g,' ')).map(canonical),T=norm(typed).map(canonical);
  const n=R.length,m=T.length,D=Array.from({length:n+1},()=>new Array(m+1).fill(0));
  for(let a=n-1;a>=0;a--)for(let b=m-1;b>=0;b--)D[a][b]=R[a]===T[b]?D[a+1][b+1]+1:Math.max(D[a+1][b],D[a][b+1]);
  const okR=new Set(),extra=[];let a=0,b=0;while(a<n&&b<m){if(R[a]===T[b]){okR.add(a);a++;b++}else if(D[a+1][b]>=D[a][b+1])a++;else{extra.push(T[b]);b++}}while(b<m)extra.push(T[b++]);
  let ri=0;const html=ref.map(tok=>{if(!norm(tok).length)return esc(tok);const cls=okR.has(ri++)?'ok':'miss';return '<span class="'+cls+'">'+esc(tok)+'</span>'}).join(' ');
  const sc=giveup&&!typed.trim()?0:Math.round(okR.size/n*100);P.dict[i]=Math.max(P.dict[i]||0,sc);saveP();
  $('#dRes').innerHTML=html+(extra.length?'<div class="score">多写/写错：<span class="extra">'+extra.map(esc).join(' ')+'</span></div>':'')+'<div class="score">'+(giveup&&!typed.trim()?'已显示答案':'正确率 '+sc+'%'+(sc===100?' · 完美！':sc>=80?' · 很好':' · 再听几遍'))+'<br>'+esc(S[i].zh)+'</div>';
  const e=$('#s'+i);e&&e.classList.add('peek');
  const g=seg();if(segIds(g).every(x=>P.dict[x]!=null))markDone(1,'本段听写完成 ✓');
  $('#dChk').textContent=i<g.to?'下一句 ›':'最后一句了';}

/* ---------- recording (local only: memory + IndexedDB on this device) ---------- */
const REC=new Map();let capture=null,recRequest=0,recPending=false,compareTimer=null,mine=null;
const IDB={db:null,open(){return new Promise(r=>{try{const q=indexedDB.open('lucca-en-rec',1);q.onupgradeneeded=()=>q.result.createObjectStore('r');q.onsuccess=()=>{this.db=q.result;r(this.db)};q.onerror=()=>r(null)}catch(e){r(null)}})},
  put(k,b){if(!this.db)return;try{this.db.transaction('r','readwrite').objectStore('r').put(b,L.slug+':'+k)}catch(e){}},
  all(){return new Promise(r=>{if(!this.db)return r([]);const out=[];try{const c=this.db.transaction('r').objectStore('r').openCursor();c.onsuccess=()=>{const x=c.result;if(x){out.push([x.key,x.value]);x.continue()}else r(out)};c.onerror=()=>r(out)}catch(e){r(out)}})}};
async function loadRecs(){await IDB.open();for(const [k,b] of await IDB.all()){if(!String(k).startsWith(L.slug+':'))continue;let key=String(k).slice(L.slug.length+1);if(/^\d+$/.test(key))key=+key;REC.set(key,{url:URL.createObjectURL(b),blob:b})}}
async function toggleRec(key){
  if(capture){if(capture.recorder.state==='recording')capture.recorder.stop();return}
  if(recPending)return;
  if(!navigator.mediaDevices||!window.MediaRecorder){toast('这个浏览器不支持录音（iPhone 请用 Safari 14.3 以上；微信里请点右上角用浏览器打开）',4000);return}
  stopExtras();M&&M.pause();
  const request=++recRequest,originSeg=st.seg,originStep=st.step;recPending=true;
  let stream;
  try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}})}catch(e){if(request===recRequest){recPending=false;toast('没有拿到麦克风权限')}return}
  if(request!==recRequest){stream.getTracks().forEach(t=>t.stop());return}
  recPending=false;
  let recorder;
  try{recorder=new MediaRecorder(stream)}catch(e){stream.getTracks().forEach(t=>t.stop());toast('无法启动录音，请换一个浏览器重试');return}
  const session={recorder,stream,key,chunks:[],timer:null,preview:true};capture=session;
  recorder.ondataavailable=e=>{if(e.data.size)session.chunks.push(e.data)};
  recorder.onstop=()=>{
    clearTimeout(session.timer);stream.getTracks().forEach(t=>t.stop());
    if(capture===session){capture=null;setRecBtn(false)}
    if(session.failed||!session.chunks.length)return;
    const blob=new Blob(session.chunks,{type:recorder.mimeType||'audio/webm'}),old=REC.get(key);
    old&&URL.revokeObjectURL(old.url);REC.set(key,{url:URL.createObjectURL(blob),blob});IDB.put(key,blob);
    if(st.seg!==originSeg||st.step!==originStep)return;
    if(typeof key==='number'){
      updShadowBig();
      if(segIds(seg()).filter(i=>REC.get(i)).length>=Math.ceil((seg().to-seg().from+1)/2))markDone(3,'跟读过半，本段「跟读」完成 ✓');
      if(session.preview&&!document.hidden&&st.shId===key)compare(key);
    }else{const m=$('#rMine');m&&(m.disabled=false);drawWave(REC.get(key))}
  };
  recorder.onerror=()=>{session.failed=true;session.preview=false;stream.getTracks().forEach(t=>t.stop());clearTimeout(session.timer);if(capture===session){capture=null;setRecBtn(false)}toast('录音失败，请重试')};
  try{recorder.start()}catch(e){recorder.onerror();return}
  setRecBtn(true);
  const max=typeof key==='number'?Math.max(4,(S[key].e-S[key].s)*2+2):180;
  session.timer=setTimeout(()=>{if(recorder.state==='recording')recorder.stop()},max*1000);
}
function stopRec(){recRequest++;recPending=false;if(capture){capture.preview=false;if(capture.recorder.state==='recording')capture.recorder.stop()}}
function setRecBtn(on){const b=$('#sRec')||$('#rRec');if(!b)return;b.classList.toggle('recing',on);b.textContent=on?'■ 停止录音':(st.step===3?'● 重录':'● 重新录')}
function stopExtras(){stopRec();clearTimeout(compareTimer);compareTimer=null;st.onStop=null;if(mine){mine.pause();mine=null}}
function playMine(key,cb){const r=REC.get(key);if(!r)return;stopExtras();M&&M.pause();mine=new Audio(r.url);mine.onended=()=>cb&&cb();mine.play().catch(()=>{})}
function compare(i){toast('先放原声，再放你的');playFrom(i,true,()=>{compareTimer=setTimeout(()=>playMine(i),350)})}
async function drawWave(r){const c=$('#wave');if(!c||!r)return;c.hidden=false;try{if(!r.peaks){const ac=new (window.AudioContext||window.webkitAudioContext)();const buf=await ac.decodeAudioData(await r.blob.arrayBuffer());const d=buf.getChannelData(0),N=90,step=Math.floor(d.length/N)||1;r.peaks=[];for(let k=0;k<N;k++){let mx=0;for(let j=k*step;j<(k+1)*step&&j<d.length;j+=8)mx=Math.max(mx,Math.abs(d[j]));r.peaks.push(mx)}ac.close&&ac.close()}
  const x=c.getContext('2d'),W=c.width=c.clientWidth*devicePixelRatio,H=c.height=c.clientHeight*devicePixelRatio,mx=Math.max(...r.peaks,.01);x.fillStyle=getComputedStyle(document.body).getPropertyValue('--accent');const bw=W/r.peaks.length;r.peaks.forEach((p,k)=>{const h=Math.max(2,p/mx*H*.85);x.fillRect(k*bw+1,(H-h)/2,bw-2,h)})}catch(e){}}

/* ---------- lock screen / background ---------- */
function updSession(){const ms=navigator.mediaSession;if(!ms)return;try{ms.playbackState=st.playing?'playing':'paused'}catch(e){}}
function initSession(){const ms=navigator.mediaSession;if(!ms)return;try{
  ms.metadata=new MediaMetadata({title:'第 '+seg().n+' 段 · '+seg().zh,artist:L.title,album:'lucca 英语 · 演讲跟读'});
  ms.setActionHandler('play',()=>play());ms.setActionHandler('pause',()=>pause());
  ms.setActionHandler('previoustrack',()=>$('#bPrev').click());ms.setActionHandler('nexttrack',()=>$('#bNext').click());}catch(e){}}
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopExtras();if(M){P.t[seg().n]=+M.time().toFixed(2)}saveP()}
  else if(M){const i=idxAt(M.time());setCur(i,true);st.playing=!M.paused();updPlay()}});
addEventListener('pagehide',()=>{stopExtras();if(M){P.t[seg().n]=+M.time().toFixed(2)}saveP()});

/* keyboard (desktop) */
addEventListener('keydown',e=>{if(/TEXTAREA|INPUT/.test(e.target.tagName)||st.sheet)return;if(e.code==='Space'){e.preventDefault();$('#bPlay').click()}else if(e.key==='ArrowLeft')$('#bPrev').click();else if(e.key==='ArrowRight')$('#bNext').click();else if(e.key==='r')$('#bRep').click()});
new ResizeObserver(()=>{document.documentElement.style.setProperty('--stage-h',topH()+'px');document.documentElement.style.setProperty('--bar-h',barH()+'px')}).observe($('#stage'));

/* boot */
if('scrollRestoration' in history)history.scrollRestoration='manual';
const _sel=selSeg;
renderAll();updVCount();setRate(st.rate);requestAnimationFrame(scrollToCard);
Promise.all([initMedia(),loadRecs()]).then(()=>{const g=seg(),t=P.t[g.n];const s=t!=null&&t>=g.s&&t<g.e?t:g.s;M.seek(s);setCur(idxAt(s),true);M.setRate(st.rate);initSession();
  if(st.step===3||st.step===4)renderPanel();if(!wide())scrollToCard()});
window.__lesson={st,S,SEG,P,playFrom,selSeg,selStep,REC};
})();
