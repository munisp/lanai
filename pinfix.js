// Set demo persona PINs to 2026 (bcryptjs 12 rounds, matching BCRYPT_ROUNDS)
// and mark onboarding complete. Runs INSIDE the portal pod where the image
// provides /app/node_modules/postgres (postgres-js) and bcryptjs. Note: this
// image has no `pg` package, so postgres-js is used instead.
const bcrypt = require("/app/node_modules/bcryptjs");
const postgres = require("/app/node_modules/postgres");

const emails = [
  "eleanor.vance@example.com",
  "marcus.chen@example.com",
  "sofia.almeida@example.com",
  "james.whitfield@example.com",
];

(async () => {
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  const pinHash = bcrypt.hashSync("2026", 12);
  for (const email of emails) {
    const rows = await sql`
      update members
      set "pinHash" = ${pinHash}, "onboardingComplete" = true
      where email = ${email}
      returning id, email`;
    if (rows.length) console.log("updated:", rows[0].email, "id", rows[0].id);
    else console.log("NOT FOUND:", email);
  }
  await sql.end();
})().catch((error) => {
  console.error("DBERR:", error.message);
  process.exit(1);
});