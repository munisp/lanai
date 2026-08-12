import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  members, travelRequests, proposals, bookings, suppliers,
  conversations, messages, invoices, celebrations, npsResponses, memberPreferences,
  taskTemplates,
} from "./drizzle/schema";
import { getDb, closeDatabase } from "./server/db";

async function main() {
  const db = await getDb();

  // ── Members ───────────────────────────────────────────────────────────
  const pinHash = await bcrypt.hash("123456", 10);
  const memberRows = [
    { email: "demo@lanai.test", name: "Demo Member", tier: "platinum", pinHash, onboardingComplete: true, active: true, phone: "+447700900123", nationality: "British" },
    { email: "sophie@lanai.test", name: "Sophie Whitmore", tier: "platinum", pinHash, onboardingComplete: true, active: true, phone: "+447700900124", nationality: "British" },
    { email: "james@lanai.test", name: "James Okafor", tier: "gold", pinHash, onboardingComplete: true, active: true, phone: "+15551230001", nationality: "American" },
    { email: "amelia@lanai.test", name: "Amelia Laurent", tier: "platinum", pinHash, onboardingComplete: true, active: true, phone: "+33612345678", nationality: "French" },
    { email: "noah@lanai.test", name: "Noah Tanaka", tier: "silver", pinHash, onboardingComplete: true, active: true, phone: "+819012345678", nationality: "Japanese" },
  ];
  const insertedMembers = [];
  for (const m of memberRows) {
    const [row] = await db.insert(members).values(m).onConflictDoNothing().returning();
    if (row) insertedMembers.push(row);
  }
  console.log(`Seeded ${insertedMembers.length} members`);
  const id = async (email: string) => {
    const found = insertedMembers.find((m) => m.email === email);
    if (found) return found.id;
    const [existing] = await db.select().from(members).where(eq(members.email, email)).limit(1);
    if (existing) return existing.id;
    throw new Error(`member not found: ${email}`);
  };

  // ── Suppliers ─────────────────────────────────────────────────────────
  const supplierRows = [
    { name: "Aman Resorts", category: "Hotel", country: "Indonesia", city: "Bali", rating: 5, preferredStatus: true, defaultCommissionRate: "12", contactEmail: "res@aman.com" },
    { name: "Belmond", category: "Hotel", country: "Italy", city: "Amalfi Coast", rating: 5, preferredStatus: true, defaultCommissionRate: "10", contactEmail: "res@belmond.com" },
    { name: "VistaJet", category: "Private Jet", country: "Global", rating: 5, preferredStatus: true, defaultCommissionRate: "8", contactEmail: "charter@vistajet.com" },
    { name: "Fraser Yachts", category: "Yacht", country: "Greece", city: "Athens", rating: 4, preferredStatus: false, defaultCommissionRate: "15", contactEmail: "charter@fraseryachts.com" },
    { name: "The Connaught", category: "Hotel", country: "United Kingdom", city: "London", rating: 5, preferredStatus: true, defaultCommissionRate: "10", contactEmail: "res@connaught.com" },
  ];
  const supplierIds: number[] = [];
  for (const s of supplierRows) {
    const [row] = await db.insert(suppliers).values(s).onConflictDoNothing().returning();
    if (row) supplierIds.push(row.id);
  }
  console.log(`Seeded ${supplierIds.length} suppliers`);

  // ── Travel Requests ────────────────────────────────────────────────────
  const trRows = [
    { memberId: await id("demo@lanai.test"), destination: "Santorini, Greece", originCity: "London", dates: "14–21 Sep 2026", pax: 2, budget: "25000", status: "proposal_sent", priority: "high", specialRequests: "Sea view, quiet luxury, private transfer" },
    { memberId: await id("sophie@lanai.test"), destination: "Bali, Indonesia", originCity: "London", dates: "1–14 Dec 2026", pax: 2, budget: "40000", status: "in_progress", priority: "high", specialRequests: "Honeymoon, villa with private pool" },
    { memberId: await id("james@lanai.test"), destination: "Amalfi Coast, Italy", originCity: "New York", dates: "20–27 Jul 2026", pax: 4, budget: "30000", status: "booked", priority: "medium", specialRequests: "Family trip, two suites" },
    { memberId: await id("amelia@lanai.test"), destination: "Kyoto, Japan", originCity: "Paris", dates: "5–12 Nov 2026", pax: 2, budget: "20000", status: "new", priority: "medium", specialRequests: "Traditional ryokan experience" },
    { memberId: await id("noah@lanai.test"), destination: "London, UK", originCity: "Tokyo", dates: "10–17 Oct 2026", pax: 1, budget: "12000", status: "completed", priority: "low", specialRequests: "Business trip, central location" },
  ];
  const trIds: number[] = [];
  for (const t of trRows) {
    const [row] = await db.insert(travelRequests).values(t).onConflictDoNothing().returning();
    if (row) trIds.push(row.id);
  }
  console.log(`Seeded ${trIds.length} travel requests`);

  // ── Proposals ─────────────────────────────────────────────────────────
  const proposalRows = [
    { travelRequestId: trIds[0], memberId: await id("demo@lanai.test"), title: "Santorini Bespoke Luxury Escape", status: "sent", totalPrice: "24500", currency: "GBP", aiGenerated: true, aiModel: "qwen2.5:0.5b", description: "Five nights at a cliffside suite with private plunge pool, sea-view dining and a private catamaran day." },
    { travelRequestId: trIds[1], memberId: await id("sophie@lanai.test"), title: "Bali Honeymoon — Villa & Spa", status: "draft", totalPrice: "38500", currency: "GBP", aiGenerated: true, aiModel: "qwen2.5:0.5b", description: "Two weeks across a private pool villa in Ubud and a beachfront resort in Nusa Dua." },
    { travelRequestId: trIds[2], memberId: await id("james@lanai.test"), title: "Amalfi Coast Family Retreat", status: "approved", totalPrice: "29500", currency: "USD", aiGenerated: true, aiModel: "qwen2.5:0.5b", description: "Two sea-facing suites at a cliffside hotel with a private boat to Capri." },
  ];
  for (const p of proposalRows) {
    await db.insert(proposals).values(p).onConflictDoNothing();
  }
  console.log("Seeded proposals");

  // ── Bookings ───────────────────────────────────────────────────────────
  const bookingRows = [
    { proposalId: trIds[2], memberId: await id("james@lanai.test"), supplierId: supplierIds[1], referenceNumber: "LNB-1001", status: "confirmed", totalAmount: "29500", currency: "USD" },
    { proposalId: trIds[0], memberId: await id("demo@lanai.test"), supplierId: supplierIds[0], referenceNumber: "LNB-1002", status: "pending", totalAmount: "24500", currency: "GBP" },
  ];
  for (const b of bookingRows) {
    await db.insert(bookings).values(b).onConflictDoNothing();
  }
  console.log("Seeded bookings");

  // ── Conversations + Messages ───────────────────────────────────────────
  const convRows = [
    { memberId: await id("demo@lanai.test"), channel: "whatsapp", subject: "Santorini proposal follow-up", isResolved: false },
    { memberId: await id("sophie@lanai.test"), channel: "portal", subject: "Bali villa options", isResolved: false },
  ];
  const convIds: number[] = [];
  for (const c of convRows) {
    const [row] = await db.insert(conversations).values(c).onConflictDoNothing().returning();
    if (row) convIds.push(row.id);
  }
  if (convIds.length) {
    await db.insert(messages).values([
      { conversationId: convIds[0], senderType: "member", senderMemberId: await id("demo@lanai.test"), body: "Hi! Can we add a private chef for one evening?", isRead: false },
      { conversationId: convIds[0], senderType: "ai", body: "Certainly — I can arrange a private chef dinner on the terrace. Shall I include it in the proposal?", isRead: false },
      { conversationId: convIds[1], senderType: "member", senderMemberId: await id("sophie@lanai.test"), body: "Which villas have a private pool?", isRead: false },
    ]);
  }
  console.log(`Seeded ${convIds.length} conversations + messages`);

  // ── Invoices ───────────────────────────────────────────────────────────
  await db.insert(invoices).values([
    { invoiceNumber: "INV-2026-0001", invoiceType: "client_service", status: "paid", memberId: await id("james@lanai.test"), bookingId: 1, subtotal: "26500", taxAmount: "0", totalAmount: "29500", currency: "USD", issuedAt: new Date("2026-07-01"), dueDate: new Date("2026-07-15"), paidAt: new Date("2026-07-10") },
    { invoiceNumber: "INV-2026-0002", invoiceType: "client_service", status: "sent", memberId: await id("demo@lanai.test"), bookingId: 2, subtotal: "24500", taxAmount: "0", totalAmount: "24500", currency: "GBP", issuedAt: new Date("2026-08-01"), dueDate: new Date("2026-08-15") },
  ]).onConflictDoNothing();
  console.log("Seeded invoices");

  // ── Celebrations ──────────────────────────────────────────────────────
  await db.insert(celebrations).values([
    { memberId: await id("demo@lanai.test"), celebrationType: "anniversary", title: "10th Wedding Anniversary", celebrationDate: new Date("2026-09-20"), isRecurring: true, reminderDaysBefore: 30, giftStatus: "planned", giftBudget: "2000" },
    { memberId: await id("sophie@lanai.test"), celebrationType: "birthday", title: "Sophie's Birthday", celebrationDate: new Date("2026-11-12"), isRecurring: true, reminderDaysBefore: 30, giftStatus: "pending", giftBudget: "1500" },
  ]).onConflictDoNothing();
  console.log("Seeded celebrations");

  // ── NPS ───────────────────────────────────────────────────────────────
  await db.insert(npsResponses).values([
    { memberId: await id("james@lanai.test"), bookingId: 1, score: 9, category: "promoter", feedback: "Outstanding service, the Amalfi trip was flawless.", followUpRequired: false },
    { memberId: await id("noah@lanai.test"), score: 8, category: "passive", feedback: "Great but the hotel location was a bit far from meetings.", followUpRequired: false },
  ]).onConflictDoNothing();
  console.log("Seeded NPS responses");

  // ── Member Preferences ─────────────────────────────────────────────────
  await db.insert(memberPreferences).values([
    { memberId: await id("demo@lanai.test"), preferredCabinClass: "business", preferredRoomType: "suite", seatPreference: "aisle", mealPreference: "pescatarian", travelStyle: "quiet luxury", favouriteDestinations: ["Santorini", "Kyoto", "Lake Como"], communicationPreference: "whatsapp" },
    { memberId: await id("sophie@lanai.test"), preferredCabinClass: "first", preferredRoomType: "villa", travelStyle: "romantic", favouriteDestinations: ["Bali", "Maldives"], communicationPreference: "email" },
  ]).onConflictDoNothing();
  console.log("Seeded member preferences");

  // ── Task Templates (pre-made, seeded once) ───────────────────────────────
  const [existingTemplateCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(taskTemplates);
  if (existingTemplateCount && existingTemplateCount.count > 0) {
    console.log(`Skipped task template seed (${existingTemplateCount.count} already present)`);
  } else {
    const templateRows = [
      { templateType: "airport_fast_track", name: "Airport Fast-Track VIP", description: "Meet-and-greet with fast-track immigration and lounge access for a seamless arrival.", defaultPriority: "high", defaultDueDaysFromTrigger: 1, triggerOnBookingStatus: "confirmed", checklistItems: [{ item: "Confirm flight arrival time", required: true }, { item: "Book fast-track immigration slot", required: true }, { item: "Arrange meet & greet agent", required: true }, { item: "Reserve airport lounge access", required: true }, { item: "Notify driver of pickup point", required: false }] },
      { templateType: "villa_provisioning", name: "Villa Provisioning", description: "Stock and prepare a private villa ahead of guest arrival.", defaultPriority: "medium", defaultDueDaysFromTrigger: 2, triggerOnBookingStatus: "confirmed", checklistItems: [{ item: "Confirm villa check-in date", required: true }, { item: "Collect grocery & beverage preferences", required: true }, { item: "Arrange private chef if requested", required: false }, { item: "Pre-stock welcome essentials", required: true }, { item: "Schedule housekeeping", required: false }] },
      { templateType: "yacht_charter", name: "Yacht Charter", description: "Arrange a private yacht charter with crew and itinerary.", defaultPriority: "high", defaultDueDaysFromTrigger: 3, triggerOnBookingStatus: "confirmed", checklistItems: [{ item: "Confirm charter dates & ports", required: true }, { item: "Shortlist yachts by capacity", required: true }, { item: "Confirm crew & catering", required: true }, { item: "Draft day-by-day itinerary", required: true }, { item: "Arrange transfers to marina", required: false }] },
      { templateType: "restaurant_reservation", name: "Restaurant Reservation", description: "Secure a private table or exclusive dining experience.", defaultPriority: "low", defaultDueDaysFromTrigger: 1, triggerOnBookingStatus: "confirmed", checklistItems: [{ item: "Confirm party size & date", required: true }, { item: "Shortlist restaurants", required: true }, { item: "Request private room if available", required: false }, { item: "Confirm booking & special requests", required: true }, { item: "Notify member of confirmation", required: true }] },
      { templateType: "celebration_planning", name: "Celebration Planning", description: "Plan a bespoke celebration (birthday, anniversary, proposal).", defaultPriority: "high", defaultDueDaysFromTrigger: 7, triggerOnBookingStatus: "confirmed", checklistItems: [{ item: "Confirm occasion & date", required: true }, { item: "Agree budget with member", required: true }, { item: "Arrange venue & decor", required: true }, { item: "Coordinate photographer", required: false }, { item: "Prepare surprise elements", required: false }] },
      { templateType: "visa_check", name: "Visa & Travel Document Check", description: "Verify visa and passport requirements for the destination.", defaultPriority: "high", defaultDueDaysFromTrigger: 14, triggerOnBookingStatus: "confirmed", checklistItems: [{ item: "Check visa requirements for destination", required: true }, { item: "Verify passport validity", required: true }, { item: "Prepare document checklist", required: true }, { item: "Submit visa application if needed", required: false }, { item: "Confirm processing timeline", required: true }] },
      { templateType: "welcome_gift", name: "Welcome Gift", description: "Arrange a personalised welcome gift at the destination.", defaultPriority: "low", defaultDueDaysFromTrigger: 1, triggerOnBookingStatus: "confirmed", checklistItems: [{ item: "Confirm arrival date & location", required: true }, { item: "Select gift based on preferences", required: true }, { item: "Arrange delivery to property", required: true }, { item: "Add personalised note", required: false }] },
      { templateType: "vip_amenity", name: "VIP Amenity Upgrade", description: "Request VIP amenities and upgrades with partners.", defaultPriority: "medium", defaultDueDaysFromTrigger: 1, triggerOnBookingStatus: "confirmed", checklistItems: [{ item: "Identify upgrade opportunities", required: true }, { item: "Contact partner for availability", required: true }, { item: "Confirm upgrade & amenities", required: true }, { item: "Notify member of confirmed perks", required: false }] },
      { templateType: "jet_charter", name: "Private Jet Charter", description: "Arrange a private jet charter with flexible scheduling.", defaultPriority: "urgent", defaultDueDaysFromTrigger: 3, triggerOnBookingStatus: "confirmed", checklistItems: [{ item: "Confirm route & dates", required: true }, { item: "Check aircraft availability", required: true }, { item: "Confirm catering & ground handling", required: true }, { item: "Send itinerary & timing", required: true }, { item: "Arrange airport transfers", required: false }] },
      { templateType: "transfer_arrangement", name: "Transfer Arrangement", description: "Book private transfers between airports, hotels and venues.", defaultPriority: "medium", defaultDueDaysFromTrigger: 1, triggerOnBookingStatus: "confirmed", checklistItems: [{ item: "Confirm pickup points & times", required: true }, { item: "Book vehicle by group size", required: true }, { item: "Share driver contact", required: true }, { item: "Confirm meet point", required: false }] },
    ];
    for (const t of templateRows) {
      await db.insert(taskTemplates).values(t).onConflictDoNothing();
    }
    console.log(`Seeded ${templateRows.length} task templates`);
  }

  await closeDatabase();
  console.log("Seed complete.");
}

main().catch(async (e) => { console.error(e); await closeDatabase(); process.exit(1); });
