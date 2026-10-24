/* lucca English · shared: storage, vocab SRS, speech, toast */
(function(){
const LS={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const DAY=864e5;
const Vocab={
  key:'en.vocab.v1',
  all(){return LS.get(this.key,{})},
  save(m){LS.set(this.key,m)},
  has(w){return !!this.all()[w.toLowerCase()]},
  add(item){const m=this.all();const k=item.w.toLowerCase();if(m[k])return false;
    m[k]=Object.assign({added:Date.now(),due:Date.now(),iv:0,ease:2.5,reps:0,lapses:0},item);this.save(m);return true},
  remove(w){const m=this.all();delete m[w.toLowerCase()];this.save(m)},
  due(){const now=Date.now();return Object.values(this.all()).filter(x=>x.due<=now).sort((a,b)=>a.due-b.due)},
  /* SM-2 lite: g 0=忘了 1=模糊 2=记得 */
  grade(w,g){const m=this.all();const x=m[w.toLowerCase()];if(!x)return;
    if(g===0){x.lapses++;x.reps=0;x.iv=0;x.ease=Math.max(1.3,x.ease-0.2);x.due=Date.now()+10*60e3}
    else{x.reps++;
      if(g===1){x.iv=x.iv?Math.max(1,Math.round(x.iv*1.2)):1;x.ease=Math.max(1.3,x.ease-0.15)}
      else{x.iv=x.reps===1?2:x.reps===2?5:Math.round(x.iv*x.ease);x.ease=Math.min(3,x.ease+0.05)}
      x.due=Date.now()+x.iv*DAY}
    x.last=Date.now();m[x.w.toLowerCase()]=x;this.save(m);return x},
  nextLabel(x,g){if(g===0)return'10分钟';let iv;if(g===1)iv=x.iv?Math.max(1,Math.round(x.iv*1.2)):1;else iv=x.reps===0?2:x.reps===1?5:Math.round(x.iv*x.ease);return iv+'天'}
};
let voice=null;
function pickVoice(){const vs=(window.speechSynthesis&&speechSynthesis.getVoices())||[];
  voice=vs.find(v=>/en-US/i.test(v.lang)&&/Samantha|Google US|Aria|Jenny|Ava/i.test(v.name))||vs.find(v=>/en-US/i.test(v.lang))||vs.find(v=>/^en/i.test(v.lang))||null}
if(window.speechSynthesis){pickVoice();speechSynthesis.onvoiceschanged=pickVoice}
function speak(t,rate){if(!window.speechSynthesis){toast('这个浏览器不支持朗读');return}
  speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.lang='en-US';if(voice)u.voice=voice;u.rate=rate||0.9;speechSynthesis.speak(u)}
let tt;function toast(msg,ms){let el=document.querySelector('.toast');if(!el){el=document.createElement('div');el.className='toast';document.body.appendChild(el)}
  el.textContent=msg;el.classList.add('show');clearTimeout(tt);tt=setTimeout(()=>el.classList.remove('show'),ms||2200)}
const SPK='<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>';
window.EN={LS,Vocab,speak,toast,SPK,esc:s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))};
})();
