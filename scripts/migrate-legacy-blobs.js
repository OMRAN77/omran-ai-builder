#!/usr/bin/env node
// One-off: move records that older versions wrote to public, guessable Blob paths
// into the encrypted, unguessable layout used by api/_store.js, then overwrite the
// public copies with {migrated:true}. Covers user accounts and DeHashed audit logs.
// Accounts are also migrated lazily on their next login; this script covers the
// ones that never log in again. Old per-username quota counters are only wiped
// (namespace null): counting now happens elsewhere, but their paths name accounts.
//
// Dry run by default. Run with the production values of these variables:
//   AUTH_SECRET=... BLOB_READ_WRITE_TOKEN=... BLOB_STORE_ID=... node scripts/migrate-legacy-blobs.js
//   ...same... node scripts/migrate-legacy-blobs.js --apply
const store = require('../api/_store');
const { getAuthSecret } = require('../api/_secrets');

const LEGACY = [
  { prefix: 'taryam/db/users/', namespace: 'users' },
  { prefix: 'taryam/db/dehashed_audit/', namespace: 'dehashed-audit' },
  { prefix: 'taryam/db/usage/', namespace: null },
];

async function listBlobs(prefix) {
  const out = [];
  let cursor = null;
  do {
    const u = new URL('https://blob.vercel-storage.com/');
    u.searchParams.set('prefix', prefix);
    u.searchParams.set('limit', '1000');
    if (cursor) u.searchParams.set('cursor', cursor);
    const res = await fetch(u, { headers: { Authorization: 'Bearer ' + process.env.BLOB_READ_WRITE_TOKEN } });
    if (!res.ok) throw new Error('Blob list failed (' + res.status + ')');
    const data = await res.json();
    out.push(...(data.blobs || []).map((b) => b.pathname));
    cursor = data.hasMore ? data.cursor : null;
  } while (cursor);
  return out;
}

async function migrate({ apply = false, log = console.log } = {}) {
  if (!getAuthSecret()) throw new Error('AUTH_SECRET (at least 32 characters) is required');
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('BLOB_READ_WRITE_TOKEN is required');
  const summary = { migrated: 0, alreadyMigrated: 0, unreadable: 0 };
  for (const { prefix, namespace } of LEGACY) {
    for (const pathname of await listBlobs(prefix)) {
      const id = decodeURIComponent(pathname.slice(prefix.length).replace(/\.json$/, ''));
      const data = await store.readPublicJson(pathname);
      if (!data) { summary.unreadable++; log('unreadable, left as is: ' + pathname); continue; }
      if (data.migrated) { summary.alreadyMigrated++; continue; }
      const target = namespace ? store.secretPath(namespace, id) : null;
      log((apply ? 'migrating ' : 'would migrate ') + pathname + ' -> ' + (target || '(wiped)'));
      if (apply) {
        // Never overwrite an encrypted record that is already there (it is newer).
        if (target && !(await store.readSecret(target))) await store.writeSecret(target, data);
        await store.writePublicJson(pathname, { migrated: true });
      }
      summary.migrated++;
    }
  }
  return summary;
}

if (require.main === module) {
  const apply = process.argv.includes('--apply');
  migrate({ apply })
    .then((s) => console.log((apply ? 'done: ' : 'dry run (pass --apply to write): ') + JSON.stringify(s)))
    .catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { migrate };
