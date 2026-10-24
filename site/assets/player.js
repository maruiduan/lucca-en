/* Media provider abstraction. Audio-only: self-hosted mp3; lesson timeline = file time. */
(function(){
class Base{constructor(){this.listeners=[];this.rate=1}on(f){this.listeners.push(f)}emit(e){this.listeners.forEach(f=>f(e))}}

class AudioProvider extends Base{
  /* self-hosted file; offset/scale map lesson time -> file time (identity for the corrected file) */
  constructor(el,src,opt){super();this.kind='audio';this.label='音频';this.el=el;this.src=src;this.k=(opt&&opt.scale)||1;this.off=(opt&&opt.offset)||0}
  load(timeoutMs){return new Promise((res,rej)=>{
    const a=this.a=new Audio();a.preload='auto';a.src=this.src;a.playsInline=true;
    const to=setTimeout(()=>rej(new Error('timeout')),timeoutMs||15000);
    a.addEventListener('loadedmetadata',()=>{clearTimeout(to);res(this)},{once:true});
    a.addEventListener('error',()=>{clearTimeout(to);rej(new Error('audio'))},{once:true});
    a.addEventListener('play',()=>this.emit('play'));a.addEventListener('pause',()=>this.emit('pause'));
    a.load();
  })}
  play(){const p=this.a.play();p&&p.catch(()=>{})}pause(){this.a.pause()}
  seek(t){this.a.currentTime=Math.max(0,(t-this.off)/this.k)}
  time(){return this.a.currentTime*this.k+this.off}
  paused(){return this.a.paused}
  setRate(r){this.rate=r;this.a.playbackRate=r;this.a.preservesPitch=true}
  destroy(){this.a.pause();this.a.removeAttribute('src')}
}

/* Mock: virtual clock. For headless tests (?src=mock) — verifies seek/loop logic without network. */
class MockProvider extends Base{
  constructor(){super();this.kind='mock';this.label='模拟播放器（测试）';this.t=0;this.run=false;this.log=[]}
  load(){return Promise.resolve(this)}
  _tick(){if(!this.run)return;const n=performance.now();this.t+=(n-this.l)/1000*this.rate;this.l=n}
  play(){if(this.run)return;this.run=true;this.l=performance.now();this.log.push(['play',+this.t.toFixed(2)]);this.emit('play')}
  pause(){this._tick();this.run=false;this.log.push(['pause',+this.t.toFixed(2)]);this.emit('pause')}
  seek(t){this._tick();this.t=t;this.log.push(['seek',+t.toFixed(2)])}
  time(){this._tick();return this.t}
  paused(){return !this.run}
  setRate(r){this._tick();this.rate=r}
}
window.Providers={AudioProvider,MockProvider};
})();
