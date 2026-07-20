const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../config/database');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitForDb() {
  for (let i=1;i<=60;i++) {
    try { await pool.query('SELECT 1'); return; } catch (e) { if (i===60) throw e; await sleep(2000); }
  }
}
(async()=>{
  await waitForDb();
  await pool.query(`CREATE TABLE IF NOT EXISTS app_schema_migrations(
    filename text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
  const dir=path.join(__dirname,'..','db-init');
  const files=fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort();
  for (const filename of files) {
    let sql=fs.readFileSync(path.join(dir,filename),'utf8');
    sql=sql.split(/\r?\n/).filter(line=>!line.trim().startsWith('\\')).join('\n');
    const checksum=crypto.createHash('sha256').update(sql).digest('hex');
    const previous=await pool.query('SELECT checksum FROM app_schema_migrations WHERE filename=$1',[filename]);
    if (previous.rowCount) {
      if (previous.rows[0].checksum!==checksum) throw new Error(`Migration ${filename} changed after release`);
      console.log(`Skip ${filename}`); continue;
    }
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO app_schema_migrations(filename,checksum) VALUES($1,$2)',[filename,checksum]);
      await client.query('COMMIT');
      console.log(`Applied ${filename}`);
    } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
  await pool.end();
})().catch(e=>{console.error(e);process.exit(1)});
