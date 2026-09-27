/**
 * Applies every backend/migrations/*.sql file in filename order against the
 * database in DATABASE_URL. Each file runs in its own transaction; idempotent
 * migrations (IF NOT EXISTS) make re-runs safe.
 *
 * Usage (PowerShell), run from neurativoofficial/backend:
 *   $env:DATABASE_URL="postgresql://postgres:<pwd>@db.<ref>.supabase.co:5432/postgres"
 *   node run_all_migrations.js
 */
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }

  const dir = path.resolve(__dirname, "migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  console.log(`Found ${files.length} migration files.`);

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log("Connected to database.\n");

  let ok = 0;
  let failed = 0;
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    process.stdout.write(`Running ${file} ... `);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("COMMIT");
      console.log("OK");
      ok += 1;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.log(`FAILED: ${err.message}`);
      failed += 1;
    }
  }

  console.log(`\nDone. ${ok} succeeded, ${failed} failed.`);
  await client.end();
}

main().catch((e) => {
  console.error("Unexpected error:", e.message);
  process.exit(1);
});
