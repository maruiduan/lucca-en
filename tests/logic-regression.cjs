// Dependency-free regression checks against the production functions.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname,'../site/assets/lesson.js'),'utf8');
function harness() {
  const nodes = new Map();
  const timers = new Map(); let nextTimer = 0;
  const c = {Blob,Map,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},console,
    setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer},clearTimeout:id=>timers.delete(id),
    $:s=>{if(!nodes.has(s))nodes.set(s,{classList:{add(){},toggle(){}},textContent:'',innerHTML:''});return nodes.get(s)},
    S:[{s:0,e:1,en:'I was eighteen.',zh:''}],P:{dict:{}},st:{seg:0,step:3,shId:0,onStop:null},
    esc:s=>s,saveP(){},seg:()=>({from:0,to:0}),segIds:()=>[0],markDone(){},toast(){},
    updShadowBig(){},drawWave(){},document:{hidden:false},IDB:{put(k,b){c.saved.push(k)}},saved:[],
    M:{pause(){}},navigator:{mediaDevices:{getUserMedia:async()=>c.newStream()}},window:{},
    streams:[],newStream(){const s={stopped:0,getTracks:()=>[{stop(){s.stopped++}}]};c.streams.push(s);return s},
    starts:0,recorders:[],playFrom(i,once,cb){c.st.onStop=cb},Audio:class{pause(){}play(){c.plays++;return Promise.resolve()}},plays:0};
  c.MediaRecorder=c.window.MediaRecorder=class {
    constructor(stream){this.state='inactive';this.stream=stream;this.mimeType='audio/webm';c.recorders.push(this)}
    start(){this.state='recording';c.starts++}stop(){this.state='inactive'}
    finish(){this.ondataavailable({data:new Blob(['audio'])});this.onstop()}
  };
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('const NUMW='),source.indexOf('/* ---------- recording')),c);
  vm.runInContext('const REC=new Map();let capture=null,recRequest=0,recPending=false,compareTimer=null,mine=null;'+source.slice(source.indexOf('async function toggleRec(key)'),source.indexOf('async function drawWave(r)')),c);
  c.timers=timers;
  return c;
}
test('dictation accepts identical number words and numeric equivalents',()=>{
  const c=harness();
  for(const answer of ['I was eighteen.','I was 18.']){c.checkDict(0,answer,false);assert.match(c.$('#dRes').innerHTML,/100%/)}
  c.S[0].en='I was 18.';c.checkDict(0,'I was eighteen.',false);assert.match(c.$('#dRes').innerHTML,/100%/);
});
test('pending permission deduplicates and cancels after navigation',async()=>{
  const c=harness();let resolve;c.navigator.mediaDevices.getUserMedia=()=>new Promise(r=>resolve=r);
  const pending=c.toggleRec(0);await c.toggleRec(0);assert.equal(c.recorders.length,0);
  c.stopExtras();const stream=c.newStream();resolve(stream);await pending;
  assert.equal(c.starts,0);assert.equal(stream.stopped,1);
});
test('recording navigation saves original key, stops tracks, suppresses preview',async()=>{
  const c=harness();await c.toggleRec(0);c.stopExtras();c.st.seg=1;c.recorders[0].finish();
  assert.deepEqual(c.saved,[0]);assert.equal(c.streams[0].stopped,1);assert.equal(c.st.onStop,null);assert.equal(c.timers.size,0);
});
test('stop finalization cannot be crossed with a new recording',async()=>{
  const c=harness();await c.toggleRec(0);await c.toggleRec(0);await c.toggleRec(1);
  assert.equal(c.starts,1);c.document.hidden=true;c.recorders[0].finish();
  await c.toggleRec('retell1');c.stopRec();c.recorders[1].finish();assert.deepEqual(c.saved,[0,'retell1']);
  assert.deepEqual(c.streams.map(s=>s.stopped),[1,1]);
});
test('navigation cancels queued comparison and playback stops microphone',async()=>{
  const c=harness();c.compare(0);c.st.onStop();assert.equal(c.timers.size,1);c.stopExtras();assert.equal(c.timers.size,0);
  await c.toggleRec(0);c.stopExtras();assert.equal(c.recorders[0].state,'inactive');c.recorders[0].finish();assert.equal(c.st.onStop,null);
});
test('constructor and start failures release microphone',async()=>{
  for(const failAt of ['constructor','start']){
    const c=harness();c.MediaRecorder=c.window.MediaRecorder=class{constructor(){if(failAt==='constructor')throw Error('unsupported')}start(){throw Error('unsupported')}};
    await c.toggleRec(0);assert.equal(c.streams[0].stopped,1);
  }
});
