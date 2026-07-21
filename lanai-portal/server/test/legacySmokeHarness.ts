import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as permify from "@permify/permify-node";
import postgres from "postgres";
import { closeDatabase, getDb } from "../db";

const TEST_ADVISOR_ID = 1;
const TEST_SECOND_ADVISOR_ID = 2;
const TEST_MEMBER_ID = 10;
const TEST_SUPPLIER_ID = 1;
const TEST_TRAVEL_REQUEST_ID = 1;
const TEST_SECOND_TRAVEL_REQUEST_ID = 2;
const TEST_PROPOSAL_ID = 1;
const TEST_SECOND_PROPOSAL_ID = 2;
const TEST_BOOKING_ID = 1;
const TEST_SECOND_BOOKING_ID = 2;
const TEST_INVOICE_ID = 1;
const TEST_PRICING_INQUIRY_ID = 1;
const TEST_TASK_TEMPLATE_ID = 1;
const TEST_AMENITY_ID = 1;
const TEST_TAG_ID = 1;
const TEST_CONVERSATION_ID = 1;

let testSql: ReturnType<typeof postgres> | null = null;
let resetQueue: Promise<void> = Promise.resolve();

function getTestSql(): ReturnType<typeof postgres> {
  if (!testSql) {
    testSql = postgres(requiredEnv("DATABASE_URL"), {
      max: 1,
      connect_timeout: 15,
      idle_timeout: 30,
    });
  }
  return testSql;
}

async function closeTestSql(): Promise<void> {
  if (!testSql) return;
  const client = testSql;
  testSql = null;
  await client.end({ timeout: 10 });
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[legacy smoke harness] ${name} is required. Run via pnpm test:integration.`,
    );
  }
  return value;
}

function resolveMigrationsFolder(): string {
  const candidates = [
    fileURLToPath(new URL("../../drizzle/", import.meta.url)),
    fileURLToPath(new URL("../../../drizzle/", import.meta.url)),
  ];
  const folder = candidates.find((candidate) =>
    fs.existsSync(`${candidate}/meta/_journal.json`),
  );
  if (!folder) {
    throw new Error(
      `[legacy smoke harness] Drizzle migrations not found: ${candidates.join(", ")}`,
    );
  }
  return folder;
}

async function migrateDatabase(): Promise<void> {
  const db = await getDb();
  await migrate(db, { migrationsFolder: resolveMigrationsFolder() });
}

async function resetAndSeedDatabase(): Promise<void> {
  const sql = getTestSql();
  const tables = await sql<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename <> '__drizzle_migrations'
      ORDER BY tablename
    `;
  const names = tables.map((table) => table.tablename);
  if (names.some((name) => !/^[a-z_]+$/.test(name))) {
    throw new Error("[legacy smoke harness] unsafe table name encountered");
  }
  await sql.unsafe(
    `TRUNCATE TABLE ${names.map((name) => `"${name}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );

  await sql`
      INSERT INTO users (id, "openId", email, name, "loginMethod", role, "isActive")
      VALUES
        (${TEST_ADVISOR_ID}, 'adv-1', 'advisor@lanai.test', 'Test Advisor', 'keycloak', 'advisor', true),
        (${TEST_SECOND_ADVISOR_ID}, 'adv-2', 'advisor-two@lanai.test', 'Second Advisor', 'keycloak', 'advisor', true)
    `;
  await sql`
      INSERT INTO members (
        id, email, name, "pinHash", tier, "crmPersonId", "onboardingComplete", active,
        "invitedByUserId", "assignedAdvisorId", "stripeCustomerId", "stripeSubscriptionId",
        phone, nationality, "passportNumber", "passportExpiry", "dateOfBirth"
      )
      VALUES (
        ${TEST_MEMBER_ID}, 'member@lanai.test', 'Test Member', '$2b$12$test-only-hash', 'platinum',
        'crm-member-10', true, true, ${TEST_ADVISOR_ID}, ${TEST_ADVISOR_ID}, 'cus_test', 'sub_test',
        '+447700900000', 'British', 'GB123456', '2030-01-01', '1980-05-15'
      )
    `;
  await sql`
      INSERT INTO suppliers (id, name, category, "contactEmail", "isActive")
      VALUES (${TEST_SUPPLIER_ID}, 'Seed Hotel', 'Hotel', 'reservations@seed-hotel.test', true)
    `;
  await sql`
      INSERT INTO member_invitations (
        token, email, name, tier, "crmPersonId", "invitedByUserId", accepted, "expiresAt"
      )
      VALUES (
        'test-token', 'accepted-member@lanai.test', 'Accepted Test Member', 'gold',
        'crm-accepted-member', ${TEST_ADVISOR_ID}, false, now() + interval '7 days'
      )
    `;
  await sql`
      INSERT INTO travel_requests (
        id, "memberId", destination, dates, pax, budget, status, "assignedToUserId"
      )
      VALUES
        (${TEST_TRAVEL_REQUEST_ID}, ${TEST_MEMBER_ID}, 'London', '2027-06-01 to 2027-06-07', 2, '12000.00', 'new', ${TEST_ADVISOR_ID}),
        (${TEST_SECOND_TRAVEL_REQUEST_ID}, ${TEST_MEMBER_ID}, 'Paris', '2027-07-01 to 2027-07-05', 2, '8000.00', 'new', ${TEST_ADVISOR_ID})
    `;
  await sql`
      INSERT INTO proposals (
        id, "travelRequestId", "memberId", "createdByUserId", title, description, "totalPrice", status
      )
      VALUES
        (${TEST_PROPOSAL_ID}, ${TEST_TRAVEL_REQUEST_ID}, ${TEST_MEMBER_ID}, ${TEST_ADVISOR_ID}, 'Seed Approved Proposal', 'Seeded integration-test proposal', '12000.00', 'approved'),
        (${TEST_SECOND_PROPOSAL_ID}, ${TEST_SECOND_TRAVEL_REQUEST_ID}, ${TEST_MEMBER_ID}, ${TEST_ADVISOR_ID}, 'Seed Rejection Proposal', 'Second seeded integration-test proposal', '8000.00', 'sent')
    `;
  await sql`
      INSERT INTO bookings (
        id, "proposalId", "memberId", "supplierId", "createdByUserId", "referenceNumber", "totalAmount", "commissionExpected", status
      )
      VALUES
        (${TEST_BOOKING_ID}, ${TEST_PROPOSAL_ID}, ${TEST_MEMBER_ID}, ${TEST_SUPPLIER_ID}, ${TEST_ADVISOR_ID}, 'SEED-BOOK-1', '12000.00', '1200.00', 'pending'),
        (${TEST_SECOND_BOOKING_ID}, ${TEST_PROPOSAL_ID}, ${TEST_MEMBER_ID}, ${TEST_SUPPLIER_ID}, ${TEST_ADVISOR_ID}, 'SEED-BOOK-2', '8000.00', '800.00', 'confirmed')
    `;
  await sql`
      INSERT INTO invoices (
        id, "invoiceNumber", "invoiceType", status, "memberId", "bookingId", "travelRequestId", subtotal, "totalAmount", "createdByUserId"
      )
      VALUES (
        ${TEST_INVOICE_ID}, 'SEED-INV-1', 'client_service', 'draft', ${TEST_MEMBER_ID},
        ${TEST_BOOKING_ID}, ${TEST_TRAVEL_REQUEST_ID}, '12000.00', '12000.00', ${TEST_ADVISOR_ID}
      )
    `;
  await sql`
      INSERT INTO pricing_inquiries (
        id, "supplierId", "travelRequestId", "memberId", "requestedByUserId", "serviceType", "requestDetails", status
      )
      VALUES (
        ${TEST_PRICING_INQUIRY_ID}, ${TEST_SUPPLIER_ID}, ${TEST_TRAVEL_REQUEST_ID}, ${TEST_MEMBER_ID},
        ${TEST_ADVISOR_ID}, 'hotel', 'Seed pricing inquiry', 'pending'
      )
    `;
  await sql`
      INSERT INTO task_templates (
        id, "templateType", name, description, "defaultPriority", "defaultDueDaysFromTrigger", "isActive"
      )
      VALUES (
        ${TEST_TASK_TEMPLATE_ID}, 'airport_fast_track', 'Seed task template', 'Seeded task template', 'medium', 1, true
      )
    `;
  await sql`
      INSERT INTO vip_amenities (
        id, "memberId", "bookingId", "travelRequestId", "amenityType", description, "supplierId", "requestedByUserId"
      )
      VALUES (
        ${TEST_AMENITY_ID}, ${TEST_MEMBER_ID}, ${TEST_BOOKING_ID}, ${TEST_TRAVEL_REQUEST_ID},
        'welcome_gift', 'Seed welcome amenity', ${TEST_SUPPLIER_ID}, ${TEST_ADVISOR_ID}
      )
    `;
  await sql`
      INSERT INTO tags (id, name, color)
      VALUES (${TEST_TAG_ID}, 'Seed Tag', '#8B5CF6')
    `;
  await sql`
      INSERT INTO conversations (id, "memberId", "assignedAdvisorId", channel, subject, "isResolved")
      VALUES (
        ${TEST_CONVERSATION_ID}, ${TEST_MEMBER_ID}, ${TEST_ADVISOR_ID}, 'portal',
        'Seed conversation', false
      )
    `;

  for (const [table, id] of [
    ["users", TEST_SECOND_ADVISOR_ID],
    ["members", TEST_MEMBER_ID],
    ["suppliers", TEST_SUPPLIER_ID],
    ["travel_requests", TEST_SECOND_TRAVEL_REQUEST_ID],
    ["proposals", TEST_SECOND_PROPOSAL_ID],
    ["bookings", TEST_SECOND_BOOKING_ID],
    ["invoices", TEST_INVOICE_ID],
    ["pricing_inquiries", TEST_PRICING_INQUIRY_ID],
    ["task_templates", TEST_TASK_TEMPLATE_ID],
    ["vip_amenities", TEST_AMENITY_ID],
    ["tags", TEST_TAG_ID],
    ["conversations", TEST_CONVERSATION_ID],
  ] as const) {
    await sql.unsafe(
      `SELECT setval(pg_get_serial_sequence('${table}', 'id'), ${id}, true)`,
    );
  }
}

function queueResetAndSeed(): Promise<void> {
  const next = resetQueue.catch(() => undefined).then(resetAndSeedDatabase);
  resetQueue = next;
  return next;
}

async function bootstrapPermify(): Promise<void> {
  const endpoint = requiredEnv("PERMIFY_GRPC_ADDRESS");
  const tenantId = process.env.PERMIFY_TENANT_ID ?? "lanai-test";
  const schemaPath = fileURLToPath(
    new URL("../../../config/permify/schema.perm", import.meta.url),
  );
  const schema = await fs.promises.readFile(schemaPath, "utf8");
  const client = (permify as any).grpc.newClient({
    endpoint,
    insecure: process.env.PERMIFY_INSECURE !== "false",
    timeout: 10_000,
  });
  await client.tenancy
    .create({ id: tenantId, name: "Lanai Integration Tests" })
    .catch((error: unknown) => {
      const message = String(error).toLowerCase();
      if (
        !message.includes("already") &&
        !message.includes("unique_constraint")
      ) {
        throw error;
      }
    });
  const schemaResult = await client.schema.write({ tenantId, schema });
  const schemaVersion = schemaResult?.schemaVersion;
  if (!schemaVersion) {
    throw new Error(
      "[legacy smoke harness] Permify returned no schema version",
    );
  }
  await client.data.write({
    tenantId,
    metadata: { schemaVersion },
    tuples: [
      {
        entity: { type: "platform", id: "lanai" },
        relation: "advisor",
        subject: { type: "user", id: String(TEST_ADVISOR_ID) },
      },
      {
        entity: { type: "platform", id: "lanai" },
        relation: "advisor",
        subject: { type: "user", id: String(TEST_SECOND_ADVISOR_ID) },
      },
      {
        entity: { type: "proposal", id: String(TEST_PROPOSAL_ID) },
        relation: "owner",
        subject: { type: "member", id: String(TEST_MEMBER_ID) },
      },
      {
        entity: { type: "proposal", id: String(TEST_SECOND_PROPOSAL_ID) },
        relation: "owner",
        subject: { type: "member", id: String(TEST_MEMBER_ID) },
      },
    ],
  });
}

/**
 * Registers a real persistence and authorization lifecycle for legacy smoke suites.
 * The surrounding test command must provide DATABASE_URL and PERMIFY_GRPC_ADDRESS.
 */
export function installLegacySmokeHarness(): void {
  beforeAll(async () => {
    await migrateDatabase();
    await bootstrapPermify();
  }, 60_000);

  beforeEach(async () => {
    await queueResetAndSeed();
  }, 120_000);

  afterAll(async () => {
    await resetQueue.catch(() => undefined);
    await closeTestSql();
    await closeDatabase();
  }, 30_000);
}

export const legacySmokeIds = {
  advisorId: TEST_ADVISOR_ID,
  secondAdvisorId: TEST_SECOND_ADVISOR_ID,
  memberId: TEST_MEMBER_ID,
  supplierId: TEST_SUPPLIER_ID,
  travelRequestId: TEST_TRAVEL_REQUEST_ID,
  secondTravelRequestId: TEST_SECOND_TRAVEL_REQUEST_ID,
  proposalId: TEST_PROPOSAL_ID,
  secondProposalId: TEST_SECOND_PROPOSAL_ID,
  bookingId: TEST_BOOKING_ID,
  secondBookingId: TEST_SECOND_BOOKING_ID,
  invoiceId: TEST_INVOICE_ID,
  pricingInquiryId: TEST_PRICING_INQUIRY_ID,
  taskTemplateId: TEST_TASK_TEMPLATE_ID,
  amenityId: TEST_AMENITY_ID,
  tagId: TEST_TAG_ID,
  conversationId: TEST_CONVERSATION_ID,
} as const;
