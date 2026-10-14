// Real Atlas integration check. Creates and drops only a unique arc_ test database.
import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
process.env.MONGODB_DB = `arc_thenar_check_${Date.now()}`;
const { mongoSql, closeMongoSql } = await import('../lib/server/mongo-sql.ts');
const schema = db => db.exec('CREATE TABLE IF NOT EXISTS counters(id TEXT PRIMARY KEY, n INTEGER NOT NULL)');
const q = (sql, params=[], write=false) => mongoSql(sql,params,write,schema);
try {
  await q('INSERT INTO counters VALUES (?,?)',['concurrency',0],true);
  await Promise.all(Array.from({length:8},()=>q('UPDATE counters SET n=n+1 WHERE id=?',['concurrency'],true)));
  assert.equal((await q('SELECT n FROM counters WHERE id=?',['concurrency']))[0].n,8);
  await closeMongoSql();
  assert.equal((await q('SELECT n FROM counters'))[0].n,8);
  await assert.rejects(q('DELETE FROM counters'),/must not mutate/);
  console.log('PASS: 8 concurrent writes preserved; data survives reconnect; reads cannot mutate');
} finally {
  await closeMongoSql();
  const cleanup = new MongoClient(process.env.MONGODB_URI);
  try { await cleanup.db(process.env.MONGODB_DB).dropDatabase(); } finally { await cleanup.close(); }
}
