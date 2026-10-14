import admin from 'firebase-admin';

let app;
export function db() {
  if (app) return admin.database(app);
  const url = process.env.FIREBASE_DATABASE_URL;
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!url || !encoded) throw new Error('Missing FIREBASE_DATABASE_URL or FIREBASE_SERVICE_ACCOUNT_BASE64');
  const serviceAccount = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  app = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(serviceAccount), databaseURL: url });
  return admin.database(app);
}
export async function get(path, fallback = null) {
  const snap = await db().ref(path).get();
  return snap.exists() ? snap.val() : fallback;
}
export async function set(path, value) { await db().ref(path).set(value); }
export async function update(path, value) { await db().ref(path).update(value); }
export async function push(path, value) { const ref = db().ref(path).push(); await ref.set(value); return ref.key; }
export async function transaction(path, updater) { return db().ref(path).transaction(updater); }
