import { and, desc, eq, gt, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  InsertMember,
  InsertMemberInvitation,
  InsertMemberSession,
  InsertUser,
  Member,
  memberInvitations,
  memberSessions,
  members,
  users,
  chatwootConfig,
  chatwootConversations,
  chatwootMessages,
  InsertChatwootConfig,
  InsertChatwootConversation,
  InsertChatwootMessage,
  ChatwootConfig,
  ChatwootConversation,
  ChatwootMessage,
  storageObjects,
  InsertStorageObject,
  StorageObject,
  memberPreferences,
  memberFamilyMembers,
  celebrations,
  travelRequests,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let client: postgres.Sql | null = null;

// PostgreSQL is the platform system of record. Runtime code must fail closed when
// it is not configured instead of silently falling back to process-local state.
export async function getDb(): Promise<NonNullable<typeof _db>> {
  if (!_db) {
    const databaseUrl = ENV.databaseUrl;
    if (!databaseUrl)
      throw new Error("DATABASE_URL is required for all runtime persistence");
    client = postgres(databaseUrl, {
      max: 20,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => undefined,
    });
    _db = drizzle(client);
  }
  return _db;
}

export async function assertDatabaseReady(): Promise<void> {
  const database = await getDb();
  await database.execute("select 1");
}

export async function closeDatabase(): Promise<void> {
  await client?.end({ timeout: 5 });
  client = null;
  _db = null;
}

// ─── Advisor / Staff Users ────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  const db = await getDb();
  if (!user.email)
    throw new Error(
      "A verified identity email is required for advisor synchronization",
    );

  const values: InsertUser = {
    openId: user.openId,
    email: user.email.toLowerCase(),
  };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];

  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    if (field === "email") {
      values[field] = normalized ?? values.email;
    } else {
      (values as Record<string, unknown>)[field] = normalized;
    }
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db
    .insert(users)
    .values(values)
    .onConflictDoUpdate({ target: [users.openId], set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result[0] ?? undefined;
}

export async function getAllAdvisors() {
  const db = await getDb();
  return db.select().from(users).orderBy(users.name);
}

export async function updateUserRole(
  userId: number,
  role: "advisor" | "senior_advisor" | "admin",
) {
  const db = await getDb();
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

// ─── Members ──────────────────────────────────────────────────────────────────

export async function getMemberByEmail(
  email: string,
): Promise<Member | undefined> {
  const db = await getDb();
  const result = await db
    .select()
    .from(members)
    .where(
      and(eq(members.email, email.toLowerCase()), eq(members.active, true)),
    )
    .limit(1);
  return result[0] ?? undefined;
}

export async function getMemberById(id: number): Promise<Member | undefined> {
  const db = await getDb();
  const result = await db
    .select()
    .from(members)
    .where(eq(members.id, id))
    .limit(1);
  return result[0] ?? undefined;
}

export async function getAllMembers(): Promise<Member[]> {
  const db = await getDb();
  return db.select().from(members).orderBy(members.name);
}

export async function createMember(data: InsertMember): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .insert(members)
    .values({ ...data, email: data.email.toLowerCase() })
    .returning({ id: members.id });
  return row?.id ?? 0;
}

export async function updateMemberPin(
  memberId: number,
  pinHash: string,
): Promise<void> {
  const db = await getDb();
  await db
    .update(members)
    .set({ pinHash, onboardingComplete: true, updatedAt: new Date() })
    .where(eq(members.id, memberId));
}

export async function updateMemberLastSignedIn(
  memberId: number,
): Promise<void> {
  const db = await getDb();
  await db
    .update(members)
    .set({ lastSignedIn: new Date() })
    .where(eq(members.id, memberId));
}

export async function updateMember(
  memberId: number,
  data: Partial<Pick<Member, "name" | "tier" | "crmPersonId" | "active">>,
): Promise<void> {
  const db = await getDb();
  await db
    .update(members)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(members.id, memberId));
}

// ─── Member Invitations ───────────────────────────────────────────────────────

export async function createInvitation(data: InsertMemberInvitation) {
  const db = await getDb();
  await db.insert(memberInvitations).values(data);
}

export async function getInvitationByToken(token: string) {
  const db = await getDb();
  const now = new Date();
  const result = await db
    .select()
    .from(memberInvitations)
    .where(
      and(
        eq(memberInvitations.token, token),
        eq(memberInvitations.accepted, false),
        gt(memberInvitations.expiresAt, now),
      ),
    )
    .limit(1);
  return result[0] ?? undefined;
}

export async function markInvitationAccepted(token: string): Promise<void> {
  const db = await getDb();
  await db
    .update(memberInvitations)
    .set({ accepted: true })
    .where(eq(memberInvitations.token, token));
}

export async function getPendingInvitations() {
  const db = await getDb();
  const now = new Date();
  return db
    .select()
    .from(memberInvitations)
    .where(
      and(
        eq(memberInvitations.accepted, false),
        gt(memberInvitations.expiresAt, now),
      ),
    )
    .orderBy(memberInvitations.createdAt);
}

// ─── Member Sessions ──────────────────────────────────────────────────────────

export async function createMemberSession(
  data: InsertMemberSession,
): Promise<void> {
  const db = await getDb();
  await db.insert(memberSessions).values(data);
}

export async function getMemberSessionByToken(token: string) {
  const db = await getDb();
  const now = new Date();
  const result = await db
    .select()
    .from(memberSessions)
    .where(
      and(eq(memberSessions.token, token), gt(memberSessions.expiresAt, now)),
    )
    .limit(1);
  return result[0] ?? undefined;
}

export async function deleteMemberSession(token: string): Promise<void> {
  const db = await getDb();
  await db.delete(memberSessions).where(eq(memberSessions.token, token));
}

export async function deleteExpiredMemberSessions(): Promise<void> {
  const db = await getDb();
  const now = new Date();
  await db.delete(memberSessions).where(lt(memberSessions.expiresAt, now));
}

// ─── Chatwoot Configuration ─────────────────────────────────────────────────

export async function createChatwootConfig(
  data: InsertChatwootConfig,
): Promise<number> {
  const db = await getDb();
  const result = await db
    .insert(chatwootConfig)
    .values(data)
    .returning({ id: chatwootConfig.id });
  return result[0]?.id ?? 0;
}

export async function getChatwootConfig(): Promise<ChatwootConfig | null> {
  const db = await getDb();
  const results = await db.select().from(chatwootConfig).limit(1);
  return results[0] ?? null;
}

export async function updateChatwootConfig(
  id: number,
  data: Partial<InsertChatwootConfig>,
): Promise<ChatwootConfig | null> {
  const db = await getDb();
  await db
    .update(chatwootConfig)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(chatwootConfig.id, id));
  const results = await db
    .select()
    .from(chatwootConfig)
    .where(eq(chatwootConfig.id, id))
    .limit(1);
  return results[0] ?? null;
}

// ─── Chatwoot Conversations ─────────────────────────────────────────────────

export async function createChatwootConversation(
  data: InsertChatwootConversation,
): Promise<number> {
  const db = await getDb();
  const result = await db
    .insert(chatwootConversations)
    .values(data)
    .returning({ id: chatwootConversations.id });
  return result[0]?.id ?? 0;
}

export async function getChatwootConversationByChatwootId(
  chatwootId: string,
): Promise<ChatwootConversation | null> {
  const db = await getDb();
  const results = await db
    .select()
    .from(chatwootConversations)
    .where(eq(chatwootConversations.chatwootId, chatwootId))
    .limit(1);
  return results[0] ?? null;
}

export async function updateChatwootConversation(
  chatwootId: string,
  data: Partial<InsertChatwootConversation>,
): Promise<ChatwootConversation | null> {
  const db = await getDb();
  await db
    .update(chatwootConversations)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(chatwootConversations.chatwootId, chatwootId));
  const results = await db
    .select()
    .from(chatwootConversations)
    .where(eq(chatwootConversations.chatwootId, chatwootId))
    .limit(1);
  return results[0] ?? null;
}

export async function listChatwootConversations(
  advisorUserId?: number,
): Promise<ChatwootConversation[]> {
  const db = await getDb();
  if (advisorUserId) {
    const results = await db
      .select()
      .from(chatwootConversations)
      .where(eq(chatwootConversations.advisorUserId, advisorUserId))
      .orderBy(chatwootConversations.updatedAt);
    return results;
  }
  const results = await db
    .select()
    .from(chatwootConversations)
    .orderBy(chatwootConversations.updatedAt);
  return results;
}

/**
 * Fetch a single local Chatwoot conversation only if it belongs to the given
 * member. Used for member-facing ownership checks so a member cannot read
 * another member's conversation by changing the ID. A null memberId column
 * (advisor-only conversations) never matches, so those are treated as not-owned
 * by any member.
 */
export async function getOwnedChatwootConversation(
  conversationId: number,
  memberId: number,
): Promise<ChatwootConversation | null> {
  const db = await getDb();
  const results = await db
    .select()
    .from(chatwootConversations)
    .where(
      and(
        eq(chatwootConversations.id, conversationId),
        eq(chatwootConversations.memberId, memberId),
      ),
    )
    .limit(1);
  return results[0] ?? null;
}

// ─── Chatwoot Messages ──────────────────────────────────────────────────────

export async function createChatwootMessage(
  data: InsertChatwootMessage,
): Promise<number> {
  const db = await getDb();
  // Upsert on chatwootId so concurrent syncs can never create duplicate
  // mirror rows (chatwootId is globally unique per message).
  const result = await db
    .insert(chatwootMessages)
    .values(data)
    .onConflictDoNothing({ target: chatwootMessages.chatwootId })
    .returning({ id: chatwootMessages.id });
  return result[0]?.id ?? 0;
}

export async function getChatwootMessageByChatwootId(
  chatwootId: string,
): Promise<ChatwootMessage | null> {
  const db = await getDb();
  const results = await db
    .select()
    .from(chatwootMessages)
    .where(eq(chatwootMessages.chatwootId, chatwootId))
    .limit(1);
  return results[0] ?? null;
}

export async function listChatwootMessages(
  conversationId: number,
): Promise<ChatwootMessage[]> {
  const db = await getDb();
  const results = await db
    .select()
    .from(chatwootMessages)
    .where(eq(chatwootMessages.conversationId, conversationId))
    .orderBy(chatwootMessages.createdAt);
  return results;
}

// ─── Storage ownership registry ──────────────────────────────────────────────

const STORAGE_URL_PREFIX = "/manus-storage/";

/**
 * Extract the storage key from a `/manus-storage/<key>` URL. Returns null for
 * URLs that are not storage-backed so callers can pass mixed URL lists safely.
 */
export function storageKeyFromUrl(
  url: string | null | undefined,
): string | null {
  if (!url || !url.startsWith(STORAGE_URL_PREFIX)) return null;
  return url.slice(STORAGE_URL_PREFIX.length);
}

/**
 * Register a storage object's owning member so the download proxy can authorize
 * it. Idempotent: re-registering a key (e.g. on a proposal update) is a no-op.
 */
export async function registerStorageObject(
  key: string,
  memberId: number,
  source: string,
): Promise<void> {
  const db = await getDb();
  await db
    .insert(storageObjects)
    .values({ storageKey: key, memberId, source })
    .onConflictDoNothing({ target: storageObjects.storageKey });
}

/**
 * Register every storage-backed URL in the list for the given member. Used at
 * document upload and proposal write points so new objects are authorizable for
 * download immediately. Non-storage URLs are ignored.
 */
export async function registerStorageUrls(
  urls: (string | null | undefined)[],
  memberId: number,
  source: string,
): Promise<void> {
  const keys = new Set<string>();
  for (const url of urls) {
    const key = storageKeyFromUrl(url);
    if (key) keys.add(key);
  }
  if (keys.size === 0) return;
  await Promise.all(
    [...keys].map((key) => registerStorageObject(key, memberId, source)),
  );
}

/**
 * Resolve the owning memberId for a storage key. Used by the download proxy to
 * enforce cross-member isolation. Returns null for unregistered keys, which the
 * proxy treats as forbidden for member requesters (fail-closed).
 */
export async function getStorageObjectOwner(
  key: string,
): Promise<number | null> {
  const db = await getDb();
  const results = await db
    .select({ memberId: storageObjects.memberId })
    .from(storageObjects)
    .where(eq(storageObjects.storageKey, key))
    .limit(1);
  return results[0]?.memberId ?? null;
}

// ─── Client memory context (AI grounding) ───────────────────────────────────

/**
 * Assemble a concise, human-readable context string for an advisor-facing AI
 * draft reply: the member's profile, travel preferences, family, upcoming
 * important dates, and recent requests. Used to ground WhatsApp triage so the
 * draft references real client memory rather than the inbound message alone.
 */
export async function buildClientMemoryContext(
  memberId: number,
): Promise<string> {
  const db = await getDb();
  const member = await getMemberById(memberId);
  if (!member) return "";
  const lines: string[] = [];
  lines.push(`Member: ${member.name}. Tier: ${member.tier ?? "unspecified"}.`);

  const prefs = await db
    .select()
    .from(memberPreferences)
    .where(eq(memberPreferences.memberId, memberId))
    .limit(1);
  const p = prefs[0];
  if (p) {
    const bits: string[] = [];
    if (p.travelStyle) bits.push(`travel style ${p.travelStyle}`);
    if (p.preferredCabinClass) bits.push(`cabin ${p.preferredCabinClass}`);
    if (p.preferredRoomType) bits.push(`room ${p.preferredRoomType}`);
    if (p.seatPreference) bits.push(`seat ${p.seatPreference}`);
    if (p.mealPreference) bits.push(`meal ${p.mealPreference}`);
    const dests = joinJsonb(p.favouriteDestinations);
    if (dests) bits.push(`favourite destinations: ${dests}`);
    const airlines = joinJsonb(p.preferredAirlines);
    if (airlines) bits.push(`preferred airlines: ${airlines}`);
    if (bits.length) lines.push(`Preferences: ${bits.join("; ")}.`);
  }

  const family = await db
    .select()
    .from(memberFamilyMembers)
    .where(eq(memberFamilyMembers.memberId, memberId))
    .limit(10);
  if (family.length) {
    lines.push(
      `Family: ${family
        .map(
          (f) =>
            `${f.name} (${f.relationship}${f.nationality ? `, ${f.nationality}` : ""}${f.dietaryRequirements ? `, dietary: ${f.dietaryRequirements}` : ""})`,
        )
        .join("; ")}.`,
    );
  }

  const celebs = await db
    .select()
    .from(celebrations)
    .where(eq(celebrations.memberId, memberId))
    .limit(20);
  const now = Date.now();
  const upcoming = celebs
    .filter((c) => c.celebrationDate && new Date(c.celebrationDate).getTime() >= now)
    .sort(
      (a, b) =>
        new Date(a.celebrationDate!).getTime() -
        new Date(b.celebrationDate!).getTime(),
    )
    .slice(0, 5);
  if (upcoming.length) {
    lines.push(
      `Upcoming important dates: ${upcoming
        .map(
          (c) =>
            `${c.title} (${c.celebrationType}, ${new Date(c.celebrationDate!).toDateString()})`,
        )
        .join("; ")}.`,
    );
  }

  const requests = await db
    .select()
    .from(travelRequests)
    .where(eq(travelRequests.memberId, memberId))
    .orderBy(desc(travelRequests.createdAt))
    .limit(3);
  if (requests.length) {
    lines.push(
      `Recent requests: ${requests
        .map((r) => `${r.destination} (${r.dates}, status: ${r.status})`)
        .join("; ")}.`,
    );
  }

  return lines.join("\n");
}

/** Join a jsonb array of strings (or scalar values) into a comma-separated string. */
function joinJsonb(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((v) => (typeof v === "string" ? v : String(v)))
    .filter(Boolean)
    .join(", ");
}
