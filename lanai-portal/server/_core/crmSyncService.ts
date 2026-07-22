import { eq } from "drizzle-orm";
import {
  bookings,
  celebrations,
  communicationTimeline,
  invoices,
  members,
  npsResponses,
  outboxEvents,
  pricingInquiries,
  proposals,
  suppliers,
  travelRequests,
  vipAmenities,
  type OutboxEvent,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  TWENTY_OBJECT_API_NAMES,
  communicationNoteProjection,
  experienceProjection,
  initialPersonProjection,
  invoiceProjection,
  memberProjection,
  proposalProjection,
  supplierInquiryProjection,
  supplierProjection,
  travelRequestProjection,
  tripProjection,
} from "./crmProjection";
import {
  beginCrmSyncDelivery,
  findCrmObjectLink,
  hashCrmProjection,
  markCrmObjectLinkState,
  markCrmSyncDelivery,
  recordCrmSyncAttempt,
  upsertCrmObjectLink,
  type CrmObjectType,
} from "./crmSyncStore";
import { TwentyCrmClient } from "./twentyClient";

export type CrmSyncOutcome = {
  attempted: boolean;
  synced: number;
  skipped: boolean;
};

type ProjectionInput = {
  objectType: CrmObjectType;
  lanaiObjectType: string;
  lanaiObjectId: string | number;
  projection: Record<string, unknown>;
  idempotencyKey: string;
  outboxEventId?: number;
  legacyCrmId?: string | null;
};

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Idempotent create-or-update against Twenty. The delivery row is persisted
 * before networking. The resulting link is only marked synced after the remote
 * record acknowledges the operation.
 */
async function upsertCrmProjection(input: ProjectionInput) {
  const existingLink = await findCrmObjectLink(
    input.lanaiObjectType,
    input.lanaiObjectId,
    input.objectType,
  );
  const projectionHash = hashCrmProjection(input.projection);
  const link =
    existingLink ??
    (input.legacyCrmId
      ? await upsertCrmObjectLink({
          lanaiObjectType: input.lanaiObjectType,
          lanaiObjectId: input.lanaiObjectId,
          crmObjectType: input.objectType,
          crmObjectId: input.legacyCrmId,
          syncState: "pending",
        })
      : null);

  const operation = link && link.syncState !== "detached" ? "update" : "create";
  const { delivery, created } = await beginCrmSyncDelivery({
    outboxEventId: input.outboxEventId,
    crmObjectLinkId: link?.id ?? null,
    operation,
    idempotencyKey: input.idempotencyKey,
    request: input.projection,
  });
  if (!created && delivery.status === "synced") return link;

  await recordCrmSyncAttempt(delivery.id);
  const client = new TwentyCrmClient();
  try {
    const objectName = TWENTY_OBJECT_API_NAMES[input.objectType];
    const record =
      operation === "update" && link
        ? await client.updateRecord(
            objectName,
            link.crmObjectId,
            input.projection,
            input.idempotencyKey,
          )
        : await client.createRecord(
            objectName,
            input.projection,
            input.idempotencyKey,
          );

    const syncedLink = await upsertCrmObjectLink({
      lanaiObjectType: input.lanaiObjectType,
      lanaiObjectId: input.lanaiObjectId,
      crmObjectType: input.objectType,
      crmObjectId: record.id,
      lastLanaiVersion: 1,
      lastCrmRevision: nonEmptyString(record.updatedAt),
      lanaiProjectionHash: projectionHash,
      crmProjectionHash: projectionHash,
      syncState: "synced",
    });
    await markCrmSyncDelivery(delivery.id, "synced", {
      remoteRevision: nonEmptyString(record.updatedAt),
    });
    return syncedLink;
  } catch (error) {
    await markCrmSyncDelivery(delivery.id, "failed", { error });
    if (link) await markCrmObjectLinkState(link.id, "failed");
    throw error;
  }
}

async function syncMemberPerson(
  memberId: number,
  outboxEventId: number,
  idempotencyPrefix: string,
) {
  const db = await getDb();
  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1);
  if (!member) throw new Error(`CRM sync could not find member ${memberId}`);

  const existingLink = await findCrmObjectLink("member", member.id, "person");
  const projection = existingLink
    ? memberProjection({
        memberId: member.id,
        tier: member.tier,
        active: member.active,
        assignedAdvisorId: member.assignedAdvisorId,
      })
    : initialPersonProjection({
        memberId: member.id,
        name: member.name,
        email: member.email,
        phone: member.phone,
        tier: member.tier,
        active: member.active,
        assignedAdvisorId: member.assignedAdvisorId,
      });

  const link = await upsertCrmProjection({
    objectType: "person",
    lanaiObjectType: "member",
    lanaiObjectId: member.id,
    projection,
    idempotencyKey: `${idempotencyPrefix}:person:${member.id}`,
    outboxEventId,
    legacyCrmId: member.crmPersonId,
  });

  if (member.crmPersonId !== link.crmObjectId) {
    await db
      .update(members)
      .set({ crmPersonId: link.crmObjectId, updatedAt: new Date() })
      .where(eq(members.id, member.id));
  }
  return { member, link };
}

async function syncTravelRequestOpportunity(
  travelRequestId: number,
  outboxEventId: number,
  idempotencyPrefix: string,
) {
  const db = await getDb();
  const [request] = await db
    .select()
    .from(travelRequests)
    .where(eq(travelRequests.id, travelRequestId))
    .limit(1);
  if (!request)
    throw new Error(
      `CRM sync could not find travel request ${travelRequestId}`,
    );

  const { member } = await syncMemberPerson(
    request.memberId,
    outboxEventId,
    idempotencyPrefix,
  );
  const opportunityLink = await upsertCrmProjection({
    objectType: "opportunity",
    lanaiObjectType: "travel_request",
    lanaiObjectId: request.id,
    projection: travelRequestProjection({
      travelRequestId: request.id,
      destination: request.destination,
      dates: request.dates,
      pax: request.pax,
      tier: member.tier,
      status: request.status,
      budget: request.budget,
      currency: request.budgetCurrency,
    }),
    idempotencyKey: `${idempotencyPrefix}:opportunity:${request.id}`,
    outboxEventId,
    legacyCrmId: request.crmOpportunityId,
  });

  if (request.crmOpportunityId !== opportunityLink.crmObjectId) {
    await db
      .update(travelRequests)
      .set({
        crmOpportunityId: opportunityLink.crmObjectId,
        updatedAt: new Date(),
      })
      .where(eq(travelRequests.id, request.id));
  }
  return opportunityLink;
}

async function syncProposal(
  proposalId: number,
  outboxEventId: number,
  idempotencyPrefix: string,
) {
  const db = await getDb();
  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);
  if (!proposal)
    throw new Error(`CRM sync could not find proposal ${proposalId}`);
  await syncTravelRequestOpportunity(
    proposal.travelRequestId,
    outboxEventId,
    idempotencyPrefix,
  );
  return upsertCrmProjection({
    objectType: "proposal",
    lanaiObjectType: "proposal",
    lanaiObjectId: proposal.id,
    projection: proposalProjection({
      proposalId: proposal.id,
      title: proposal.title,
      status: proposal.status,
      sentAt: proposal.sentAt,
      validUntil: proposal.validUntil,
      totalPrice: proposal.totalPrice,
      currency: proposal.currency,
    }),
    idempotencyKey: `${idempotencyPrefix}:proposal:${proposal.id}`,
    outboxEventId,
  });
}

async function syncBooking(
  bookingId: number,
  outboxEventId: number,
  idempotencyPrefix: string,
) {
  const db = await getDb();
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking) throw new Error(`CRM sync could not find booking ${bookingId}`);
  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, booking.proposalId))
    .limit(1);
  if (!proposal)
    throw new Error(
      `CRM sync could not find booking proposal ${booking.proposalId}`,
    );
  const [request] = await db
    .select()
    .from(travelRequests)
    .where(eq(travelRequests.id, proposal.travelRequestId))
    .limit(1);
  if (!request)
    throw new Error(`CRM sync could not find booking travel request`);
  await syncTravelRequestOpportunity(
    request.id,
    outboxEventId,
    idempotencyPrefix,
  );
  if (booking.supplierId)
    await syncSupplier(booking.supplierId, outboxEventId, idempotencyPrefix);
  return upsertCrmProjection({
    objectType: "trip",
    lanaiObjectType: "booking",
    lanaiObjectId: booking.id,
    projection: tripProjection({
      bookingId: booking.id,
      status: booking.status,
      destination: request.destination,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      totalAmount: booking.totalAmount,
      currency: booking.currency,
    }),
    idempotencyKey: `${idempotencyPrefix}:trip:${booking.id}`,
    outboxEventId,
  });
}

async function syncSupplier(
  supplierId: number,
  outboxEventId: number,
  idempotencyPrefix: string,
) {
  const db = await getDb();
  const [supplier] = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);
  if (!supplier)
    throw new Error(`CRM sync could not find supplier ${supplierId}`);
  return upsertCrmProjection({
    objectType: "company",
    lanaiObjectType: "supplier",
    lanaiObjectId: supplier.id,
    projection: supplierProjection({
      supplierId: supplier.id,
      name: supplier.name,
      category: supplier.category,
      subCategory: supplier.subCategory,
      preferredStatus: supplier.preferredStatus,
      isActive: supplier.isActive,
    }),
    idempotencyKey: `${idempotencyPrefix}:company:${supplier.id}`,
    outboxEventId,
  });
}

async function syncPricingInquiry(
  inquiryId: number,
  outboxEventId: number,
  idempotencyPrefix: string,
) {
  const db = await getDb();
  const [inquiry] = await db
    .select()
    .from(pricingInquiries)
    .where(eq(pricingInquiries.id, inquiryId))
    .limit(1);
  if (!inquiry)
    throw new Error(`CRM sync could not find pricing inquiry ${inquiryId}`);
  await syncSupplier(inquiry.supplierId, outboxEventId, idempotencyPrefix);
  if (inquiry.travelRequestId)
    await syncTravelRequestOpportunity(
      inquiry.travelRequestId,
      outboxEventId,
      idempotencyPrefix,
    );
  return upsertCrmProjection({
    objectType: "supplier_inquiry",
    lanaiObjectType: "pricing_inquiry",
    lanaiObjectId: inquiry.id,
    projection: supplierInquiryProjection({
      inquiryId: inquiry.id,
      serviceType: inquiry.serviceType,
      status: inquiry.status,
      expiresAt: inquiry.expiresAt,
    }),
    idempotencyKey: `${idempotencyPrefix}:supplier-inquiry:${inquiry.id}`,
    outboxEventId,
  });
}

async function syncInvoice(
  invoiceId: number,
  outboxEventId: number,
  idempotencyPrefix: string,
) {
  const db = await getDb();
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!invoice) throw new Error(`CRM sync could not find invoice ${invoiceId}`);
  if (invoice.memberId)
    await syncMemberPerson(invoice.memberId, outboxEventId, idempotencyPrefix);
  if (invoice.supplierId)
    await syncSupplier(invoice.supplierId, outboxEventId, idempotencyPrefix);
  if (invoice.travelRequestId)
    await syncTravelRequestOpportunity(
      invoice.travelRequestId,
      outboxEventId,
      idempotencyPrefix,
    );
  const objectType =
    invoice.invoiceType === "commission"
      ? "commission_reconciliation"
      : "invoice";
  return upsertCrmProjection({
    objectType,
    lanaiObjectType: "invoice",
    lanaiObjectId: invoice.id,
    projection: invoiceProjection({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      totalAmount: invoice.totalAmount,
      currency: invoice.currency,
      dueDate: invoice.dueDate,
      reconciliationPeriod: invoice.reconciliationPeriod,
      isCommission: invoice.invoiceType === "commission",
    }),
    idempotencyKey: `${idempotencyPrefix}:${objectType}:${invoice.id}`,
    outboxEventId,
  });
}

async function syncCommunication(
  communicationId: number,
  outboxEventId: number,
  idempotencyPrefix: string,
) {
  const db = await getDb();
  const [communication] = await db
    .select()
    .from(communicationTimeline)
    .where(eq(communicationTimeline.id, communicationId))
    .limit(1);
  if (!communication)
    throw new Error(`CRM sync could not find communication ${communicationId}`);
  await syncMemberPerson(
    communication.memberId,
    outboxEventId,
    idempotencyPrefix,
  );
  return upsertCrmProjection({
    objectType: "note",
    lanaiObjectType: "communication",
    lanaiObjectId: communication.id,
    projection: communicationNoteProjection({
      communicationId: communication.id,
      summary: communication.summary ?? communication.subject,
      category: communication.inquiryCategory,
      followUpDueAt: communication.followUpDueAt,
    }),
    idempotencyKey: `${idempotencyPrefix}:note:${communication.id}`,
    outboxEventId,
  });
}

async function syncCelebration(
  celebrationId: number,
  outboxEventId: number,
  idempotencyPrefix: string,
) {
  const db = await getDb();
  const [celebration] = await db
    .select()
    .from(celebrations)
    .where(eq(celebrations.id, celebrationId))
    .limit(1);
  if (!celebration)
    throw new Error(`CRM sync could not find celebration ${celebrationId}`);
  await syncMemberPerson(
    celebration.memberId,
    outboxEventId,
    idempotencyPrefix,
  );
  return upsertCrmProjection({
    objectType: "experience_moment",
    lanaiObjectType: "celebration",
    lanaiObjectId: celebration.id,
    projection: experienceProjection({
      experienceId: celebration.id,
      type: "celebration",
      scheduledAt: celebration.celebrationDate,
      status: celebration.giftStatus,
    }),
    idempotencyKey: `${idempotencyPrefix}:experience:celebration:${celebration.id}`,
    outboxEventId,
  });
}

async function syncVipAmenity(
  amenityId: number,
  outboxEventId: number,
  idempotencyPrefix: string,
) {
  const db = await getDb();
  const [amenity] = await db
    .select()
    .from(vipAmenities)
    .where(eq(vipAmenities.id, amenityId))
    .limit(1);
  if (!amenity)
    throw new Error(`CRM sync could not find VIP amenity ${amenityId}`);
  await syncMemberPerson(amenity.memberId, outboxEventId, idempotencyPrefix);
  return upsertCrmProjection({
    objectType: "experience_moment",
    lanaiObjectType: "vip_amenity",
    lanaiObjectId: amenity.id,
    projection: experienceProjection({
      experienceId: amenity.id,
      type: "vip_amenity",
      scheduledAt:
        amenity.deliveredAt ?? amenity.confirmedAt ?? amenity.createdAt,
      status: amenity.deliveredAt
        ? "fulfilled"
        : amenity.confirmedAt
          ? "planned"
          : "pending",
    }),
    idempotencyKey: `${idempotencyPrefix}:experience:vip-amenity:${amenity.id}`,
    outboxEventId,
  });
}

async function syncNpsResponse(
  responseId: number,
  outboxEventId: number,
  idempotencyPrefix: string,
) {
  const db = await getDb();
  const [response] = await db
    .select()
    .from(npsResponses)
    .where(eq(npsResponses.id, responseId))
    .limit(1);
  if (!response)
    throw new Error(`CRM sync could not find NPS response ${responseId}`);
  await syncMemberPerson(response.memberId, outboxEventId, idempotencyPrefix);
  return upsertCrmProjection({
    objectType: "experience_moment",
    lanaiObjectType: "nps_response",
    lanaiObjectId: response.id,
    projection: experienceProjection({
      experienceId: response.id,
      type: "nps",
      scheduledAt: response.createdAt,
      status:
        response.followUpRequired && !response.followedUpAt
          ? "planned"
          : "fulfilled",
      npsScore: response.score,
    }),
    idempotencyKey: `${idempotencyPrefix}:experience:nps:${response.id}`,
    outboxEventId,
  });
}

/**
 * Projects all supported operational aggregates. Unsupported aggregates safely
 * no-op, preserving the platform’s ability to roll out new CRM objects behind
 * an explicit projection rather than accidentally exporting raw event payloads.
 */
export async function synchronizeOutboxEventToCrm(
  event: OutboxEvent,
): Promise<CrmSyncOutcome> {
  if (!TwentyCrmClient.isConfigured()) {
    return { attempted: false, synced: 0, skipped: true };
  }
  const prefix = `crm:${event.eventId}:${event.schemaVersion}`;
  const aggregateId = Number(event.aggregateId);
  if (!Number.isInteger(aggregateId) || aggregateId <= 0) {
    throw new Error(
      `CRM sync requires a positive numeric aggregate id: ${event.aggregateId}`,
    );
  }
  switch (event.aggregateType) {
    case "travel_request":
      await syncTravelRequestOpportunity(aggregateId, event.id, prefix);
      return { attempted: true, synced: 2, skipped: false };
    case "member":
      await syncMemberPerson(aggregateId, event.id, prefix);
      return { attempted: true, synced: 1, skipped: false };
    case "proposal":
      await syncProposal(aggregateId, event.id, prefix);
      return { attempted: true, synced: 3, skipped: false };
    case "booking":
      await syncBooking(aggregateId, event.id, prefix);
      return { attempted: true, synced: 4, skipped: false };
    case "supplier":
      await syncSupplier(aggregateId, event.id, prefix);
      return { attempted: true, synced: 1, skipped: false };
    case "pricing_inquiry":
      await syncPricingInquiry(aggregateId, event.id, prefix);
      return { attempted: true, synced: 2, skipped: false };
    case "invoice":
      await syncInvoice(aggregateId, event.id, prefix);
      return { attempted: true, synced: 1, skipped: false };
    case "communication":
      await syncCommunication(aggregateId, event.id, prefix);
      return { attempted: true, synced: 2, skipped: false };
    case "celebration":
      await syncCelebration(aggregateId, event.id, prefix);
      return { attempted: true, synced: 2, skipped: false };
    case "vip_amenity":
      await syncVipAmenity(aggregateId, event.id, prefix);
      return { attempted: true, synced: 2, skipped: false };
    case "nps_response":
      await syncNpsResponse(aggregateId, event.id, prefix);
      return { attempted: true, synced: 2, skipped: false };
    default:
      return { attempted: false, synced: 0, skipped: true };
  }
}

/** Allows controlled backfill or reconciliation without fabricating an outbox event. */
export async function synchronizeMemberToCrm(memberId: number) {
  if (!TwentyCrmClient.isConfigured()) {
    throw new Error("Twenty CRM synchronization is not configured");
  }
  return syncMemberPerson(memberId, 0, `crm:manual:member:${memberId}`);
}

export async function synchronizeTravelRequestToCrm(travelRequestId: number) {
  if (!TwentyCrmClient.isConfigured()) {
    throw new Error("Twenty CRM synchronization is not configured");
  }
  return syncTravelRequestOpportunity(
    travelRequestId,
    0,
    `crm:manual:travel-request:${travelRequestId}`,
  );
}

/** Kept exported for integration tests and controlled replay commands. */
export const crmSyncInternals = {
  upsertCrmProjection,
};

/**
 * Reprojects a linked object through the same mapping used by outbox delivery.
 * Manual operations deliberately use a fresh operation key; they never mutate an
 * existing outbox delivery payload or bypass CRM-safe field projections.
 */
export async function synchronizeCrmObjectLink(input: {
  lanaiObjectType: string;
  lanaiObjectId: string;
  reason: string;
}) {
  if (!TwentyCrmClient.isConfigured()) {
    throw new Error("Twenty CRM synchronization is not configured");
  }
  const id = Number(input.lanaiObjectId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(
      `CRM object link has an invalid Lanai object id: ${input.lanaiObjectId}`,
    );
  }
  const prefix = `crm:manual:${input.reason}:${input.lanaiObjectType}:${id}:${Date.now()}`;
  switch (input.lanaiObjectType) {
    case "member":
      return syncMemberPerson(id, 0, prefix);
    case "travel_request":
      return syncTravelRequestOpportunity(id, 0, prefix);
    case "proposal":
      return syncProposal(id, 0, prefix);
    case "booking":
      return syncBooking(id, 0, prefix);
    case "supplier":
      return syncSupplier(id, 0, prefix);
    case "pricing_inquiry":
      return syncPricingInquiry(id, 0, prefix);
    case "invoice":
      return syncInvoice(id, 0, prefix);
    case "communication":
      return syncCommunication(id, 0, prefix);
    case "celebration":
      return syncCelebration(id, 0, prefix);
    case "vip_amenity":
      return syncVipAmenity(id, 0, prefix);
    case "nps_response":
      return syncNpsResponse(id, 0, prefix);
    default:
      throw new Error(
        `CRM resynchronization is not supported for ${input.lanaiObjectType}`,
      );
  }
}
