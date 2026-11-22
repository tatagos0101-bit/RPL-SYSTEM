// Coalesce simultaneous reads only. No completed account data is cached.
let generation = 0;
const requests = new Map();

export function invalidateSharedReads(resource) {
  if (!resource) generation++;
  for (const [key, entry] of requests) {
    if (!resource || entry.resource === resource) requests.delete(key);
  }
}

export function createSharedRead(resource, load, getScope) {
  return config => {
    // A caller-owned signal/config must retain its own cancellation semantics.
    if (config !== undefined) return load(config);
    const scope = getScope();
    const version = generation;
    const key = JSON.stringify([resource, scope, version]);
    if (requests.has(key)) return requests.get(key).promise;
    const entry = { resource };
    const clear = () => { if (requests.get(key) === entry) requests.delete(key); };
    entry.promise = Promise.resolve().then(() => load()).then(value => {
      if (version !== generation || scope !== getScope()) {
        const error = new Error('The account changed while loading.');
        error.name = 'AbortError';
        throw error;
      }
      return value;
    }).then(value => { clear(); return value; }, error => { clear(); throw error; });
    requests.set(key, entry);
    return entry.promise;
  };
}
