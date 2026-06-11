#!/usr/bin/env node
/* Aplica o schema.sql no Postgres do Supabase.
   Uso:
     DATABASE_URL="postgresql://...:SENHA@...supabase.com:5432/postgres" node scripts/migrate.js

   Pegue a connection string no Supabase: botão "Connect" no topo do projeto →
   aba "ORMs"/"psql" → copie a URI (troque [YOUR-PASSWORD] pela senha do banco).
*/
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Defina DATABASE_URL com a connection string do Supabase. Ex:');
  console.error('  DATABASE_URL="postgresql://postgres.<ref>:<senha>@<host>.supabase.com:5432/postgres" node scripts/migrate.js');
  process.exit(1);
}

const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');

(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(sql);
  const { rows } = await client.query(
    "select table_name from information_schema.tables where table_schema='public' order by table_name"
  );
  console.log('✓ schema aplicado. Tabelas em public:', rows.map(r => r.table_name).join(', '));
  await client.end();
})().catch(err => {
  console.error('✗ falha na migração:', err.message);
  process.exit(1);
});
