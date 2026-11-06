'use strict';
// Shared deterministic scheduler for separate VM realms. No timers, network or browser emulation.
module.exports = function mockWebLocks() {
  const states = new Map();
  function pump(name,s) {
    if(s.active && s.mode==='exclusive')return;
    while(s.queue.length && (!s.active || (s.mode==='shared' && s.queue[0].mode==='shared'))) {
      const job=s.queue.shift();s.mode=job.mode;s.active++;
      Promise.resolve().then(()=>job.callback({name,mode:job.mode})).then(job.resolve,job.reject).finally(()=>{
        s.active--;pump(name,s);
        if(!s.active && !s.queue.length)states.delete(name);
      });
      if(job.mode==='exclusive')break;
    }
  }
  return {request(name, options, callback) {
    if (typeof options === 'function') {callback=options; options={};}
    const s=states.get(name)||{active:0,mode:null,queue:[]},mode=options.mode||'exclusive';
    if(options.ifAvailable && (s.queue.length || (s.active && (s.mode!=='shared' || mode!=='shared'))))return Promise.resolve(callback(null));
    states.set(name,s);
    return new Promise((resolve,reject)=>{s.queue.push({mode,callback,resolve,reject});pump(name,s);});
  }};
};
