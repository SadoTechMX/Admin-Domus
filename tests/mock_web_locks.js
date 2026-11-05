'use strict';
// Shared deterministic scheduler for separate VM realms. No timers, network or browser emulation.
module.exports = function mockWebLocks() {
  const tails = new Map();
  return {request(name, options, callback) {
    if (typeof options === 'function') {callback=options; options={};}
    if (options.ifAvailable && tails.has(name)) return Promise.resolve(callback(null));
    const previous=tails.get(name) || Promise.resolve();
    const run=previous.catch(()=>{}).then(()=>callback({name}));
    const tail=run.finally(()=>{if(tails.get(name)===tail)tails.delete(name);});
    tails.set(name,tail);return tail;
  }};
};
