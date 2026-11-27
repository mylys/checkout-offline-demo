// This worker has a dedicated sub-scope, no fetch handler and no persistent data store.
const parked = new Map();
self.addEventListener('message',event => {
  const {type,ticket,snapshot} = event.data || {};
  if (event.origin !== self.location.origin || !/^[0-9a-f-]{36}$/.test(ticket)) return;
  const previous = parked.get(ticket);
  if (type === 'park') {
    previous?.finish();
    let resolve;
    const pending = new Promise(done => { resolve = done; });
    const finish = () => {
      clearTimeout(timer);
      parked.delete(ticket);
      resolve();
    };
    const timer = setTimeout(finish,30000);
    parked.set(ticket,{snapshot,expires:Date.now() + 30000,finish});
    event.waitUntil(pending);
  } else if (type === 'take') {
    event.ports[0]?.postMessage(previous && Date.now() < previous.expires ? previous.snapshot : null);
    previous?.finish();
  } else if (type === 'discard') previous?.finish();
});
