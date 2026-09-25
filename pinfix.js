// Runs inside the lanai-portal pod: sets numeric demo PIN 2026 for the 4 personas.
const b = require("/app/node_modules/bcryptjs");
const { Client } = require("/app/node_modules/pg");
(async () => {
  const hash = b.hashSync("2026", 12);
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  for (const email of ["eleanor.vance@example.com","marcus.chen@example.com","sofia.almeida@example.com","james.whitfield@example.com"]) {
    const r = await c.query('UPDATE members SET "pinHash"=$1, "onboardingComplete"=true WHERE email=$2', [hash, email]);
    console.log(email + ": updated " + r.rowCount);
  }
  await c.end();
})().catch(e => { console.error("DBERR", e.message); process.exit(1); });
