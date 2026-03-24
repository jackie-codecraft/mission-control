'use strict';

const store = new Map();

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function set(key, value, ttlMs = 10000) {
  store.set(key, { value, expires: Date.now() + ttlMs });
}

function cached(key, ttlMs, fn) {
  const hit = get(key);
  if (hit !== null) return Promise.resolve(hit);
  return Promise.resolve(fn()).then(v => { set(key, v, ttlMs); return v; });
}

module.exports = { get, set, cached };
