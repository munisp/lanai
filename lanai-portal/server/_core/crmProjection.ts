import type { CrmFieldOwnershipPolicy, CrmObjectType } from "./crmSyncStore";

export const TWENTY_OBJECT_API_NAMES = {
  person: "people",
  company: "companies",
  opportunity: "opportunities",
  proposal: "proposals",
  trip: "trips",
  supplier_inquiry: "supplierInquiries",
  invoice: "invoices",
  commission_reconciliation: "commissionReconciliations",
  experience_moment: "experienceMoments",
  note: "notes",
  task: "tasks",
} as const satisfies Record<CrmObjectType, string>;

/**
 * Ownership is explicit at the payload boundary. Fields absent from an
 * allowlist are never projected to CRM, even if an upstream entity contains
 * them. This prevents accidental export of passports, payments, raw messages,
 * family details, security notes, internal costs, or commercial margins.
 */
export const CRM_FIELD_OWNERSHIP: Record<
  CrmObjectType,
  Record<string, CrmFieldOwnershipPolicy>
> = {
  person: {
    name: "crm_authoritative",
    emails: "crm_authoritative",
    phones: "crm_authoritative",
    companyId: "crm_authoritative",
    lanaiMemberId: "lanai_authoritative",
    lanaiMembershipTier: "lanai_authoritative",
    lanaiPortalActive: "lanai_authoritative",
    lanaiConciergeOwnerId: "lanai_authoritative",
    lanaiTravelStyle: "lanai_publish_only",
    lanaiFavouriteDestinations: "lanai_publish_only",
  },
  company: {
    name: "crm_authoritative",
    domainName: "crm_authoritative",
    accountOwnerId: "crm_authoritative",
    lanaiSupplierId: "lanai_authoritative",
    lanaiServiceCategories: "lanai_publish_only",
    lanaiPreferredPartner: "lanai_publish_only",
    lanaiOperationalStatus: "lanai_authoritative",
  },
  opportunity: {
    name: "lanai_publish_only",
    stage: "manual_conflict",
    closeDate: "crm_authoritative",
    amount: "manual_conflict",
    lanaiTravelRequestId: "lanai_authoritative",
    destination: "lanai_publish_only",
    travelWindow: "lanai_publish_only",
    partySizeBand: "lanai_publish_only",
    membershipTier: "lanai_publish_only",
    lanaiRequestStatus: "lanai_authoritative",
  },
  proposal: {
    name: "lanai_publish_only",
    lanaiProposalId: "lanai_authoritative",
    status: "lanai_authoritative",
    sentAt: "lanai_authoritative",
    validUntil: "lanai_authoritative",
    selectedTier: "lanai_publish_only",
    clientFacingTotal: "lanai_publish_only",
    currency: "lanai_publish_only",
  },
  trip: {
    name: "lanai_publish_only",
    lanaiBookingId: "lanai_authoritative",
    status: "lanai_authoritative",
    destination: "lanai_publish_only",
    startDate: "lanai_publish_only",
    endDate: "lanai_publish_only",
    totalAmount: "lanai_publish_only",
    currency: "lanai_publish_only",
  },
  supplier_inquiry: {
    name: "lanai_publish_only",
    lanaiInquiryId: "lanai_authoritative",
    serviceType: "lanai_publish_only",
    status: "lanai_authoritative",
    responseDueAt: "lanai_authoritative",
  },
  invoice: {
    name: "lanai_publish_only",
    lanaiInvoiceId: "lanai_authoritative",
    invoiceNumber: "lanai_publish_only",
    status: "lanai_authoritative",
    totalAmount: "lanai_publish_only",
    currency: "lanai_publish_only",
    dueDate: "lanai_authoritative",
  },
  commission_reconciliation: {
    name: "lanai_publish_only",
    lanaiInvoiceId: "lanai_authoritative",
    period: "lanai_authoritative",
    status: "lanai_authoritative",
    totalAmount: "lanai_publish_only",
    currency: "lanai_publish_only",
  },
  experience_moment: {
    name: "lanai_publish_only",
    lanaiExperienceId: "lanai_authoritative",
    type: "lanai_publish_only",
    scheduledAt: "lanai_authoritative",
    status: "lanai_authoritative",
    npsScore: "lanai_publish_only",
  },
  note: {
    name: "lanai_publish_only",
    body: "lanai_publish_only",
    lanaiCommunicationId: "lanai_authoritative",
    category: "lanai_publish_only",
    followUpDueAt: "lanai_authoritative",
  },
  task: {
    title: "crm_authoritative",
    body: "manual_conflict",
    status: "crm_authoritative",
    dueAt: "crm_authoritative",
    lanaiTaskId: "lanai_authoritative",
  },
};

function text(value: unknown, maxLength = 512): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function isoDate(value: unknown): string | undefined {
  if (!(value instanceof Date) || Number.isNaN(value.valueOf()))
    return undefined;
  return value.toISOString().slice(0, 10);
}

function isoDateTime(value: unknown): string | undefined {
  if (!(value instanceof Date) || Number.isNaN(value.valueOf()))
    return undefined;
  return value.toISOString();
}

function numeric(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, entry]) => entry !== undefined && entry !== null,
    ),
  ) as T;
}

export function initialPersonProjection(input: {
  memberId: number;
  name: string;
  email: string;
  phone?: string | null;
  tier: string;
  active: boolean;
  assignedAdvisorId?: number | null;
}): Record<string, unknown> {
  return omitUndefined({
    name: text(input.name, 255),
    emails: input.email
      ? { primaryEmail: input.email.toLowerCase() }
      : undefined,
    phones: text(input.phone, 64)
      ? { primaryPhoneNumber: text(input.phone, 64) }
      : undefined,
    lanaiMemberId: String(input.memberId),
    lanaiMembershipTier: input.tier,
    lanaiPortalActive: input.active,
    lanaiConciergeOwnerId: input.assignedAdvisorId
      ? String(input.assignedAdvisorId)
      : undefined,
  });
}

/** Updates never overwrite CRM-owned identity fields. */
export function memberProjection(input: {
  memberId: number;
  tier: string;
  active: boolean;
  assignedAdvisorId?: number | null;
  travelStyle?: string | null;
  favouriteDestinations?: unknown;
}): Record<string, unknown> {
  const destinations = Array.isArray(input.favouriteDestinations)
    ? input.favouriteDestinations
        .filter((value): value is string => typeof value === "string")
        .slice(0, 10)
    : undefined;
  return omitUndefined({
    lanaiMemberId: String(input.memberId),
    lanaiMembershipTier: input.tier,
    lanaiPortalActive: input.active,
    lanaiConciergeOwnerId: input.assignedAdvisorId
      ? String(input.assignedAdvisorId)
      : undefined,
    lanaiTravelStyle: text(input.travelStyle, 128),
    lanaiFavouriteDestinations: destinations?.length ? destinations : undefined,
  });
}

export function supplierProjection(input: {
  supplierId: number;
  name: string;
  category?: string | null;
  subCategory?: string | null;
  preferredStatus: boolean;
  isActive: boolean;
}): Record<string, unknown> {
  const categories = [
    text(input.category, 128),
    text(input.subCategory, 128),
  ].filter(Boolean);
  return omitUndefined({
    name: text(input.name, 255),
    lanaiSupplierId: String(input.supplierId),
    lanaiServiceCategories: categories.length ? categories : undefined,
    lanaiPreferredPartner: input.preferredStatus,
    lanaiOperationalStatus: input.isActive ? "active" : "inactive",
  });
}

export function travelRequestProjection(input: {
  travelRequestId: number;
  destination: string;
  dates: string;
  pax: number;
  tier?: string | null;
  status: string;
  budget?: string | number | null;
  currency?: string | null;
}): Record<string, unknown> {
  return omitUndefined({
    name: `Lanai request #${input.travelRequestId}: ${text(input.destination, 120) ?? "Travel"}`,
    lanaiTravelRequestId: String(input.travelRequestId),
    destination: text(input.destination, 255),
    travelWindow: text(input.dates, 255),
    partySizeBand: input.pax > 6 ? "7+" : String(Math.max(input.pax, 1)),
    membershipTier: text(input.tier, 32),
    lanaiRequestStatus: input.status,
    amount: numeric(input.budget),
    currency: text(input.currency, 8),
  });
}

export function proposalProjection(input: {
  proposalId: number;
  title: string;
  status: string;
  sentAt?: Date | null;
  validUntil?: Date | null;
  selectedTier?: string | null;
  totalPrice?: string | number | null;
  currency?: string | null;
}): Record<string, unknown> {
  return omitUndefined({
    name: text(input.title, 255),
    lanaiProposalId: String(input.proposalId),
    status: input.status,
    sentAt: isoDateTime(input.sentAt),
    validUntil: isoDate(input.validUntil),
    selectedTier: text(input.selectedTier, 128),
    clientFacingTotal: numeric(input.totalPrice),
    currency: text(input.currency, 8),
  });
}

export function tripProjection(input: {
  bookingId: number;
  status: string;
  destination?: string | null;
  checkIn?: Date | null;
  checkOut?: Date | null;
  totalAmount?: string | number | null;
  currency?: string | null;
}): Record<string, unknown> {
  return omitUndefined({
    name: `Lanai trip #${input.bookingId}${input.destination ? `: ${text(input.destination, 120)}` : ""}`,
    lanaiBookingId: String(input.bookingId),
    status: input.status,
    destination: text(input.destination, 255),
    startDate: isoDate(input.checkIn),
    endDate: isoDate(input.checkOut),
    totalAmount: numeric(input.totalAmount),
    currency: text(input.currency, 8),
  });
}

export function supplierInquiryProjection(input: {
  inquiryId: number;
  serviceType: string;
  status: string;
  expiresAt?: Date | null;
}): Record<string, unknown> {
  return omitUndefined({
    name: `Supplier inquiry #${input.inquiryId}: ${text(input.serviceType, 120) ?? "Service"}`,
    lanaiInquiryId: String(input.inquiryId),
    serviceType: text(input.serviceType, 128),
    status: input.status,
    responseDueAt: isoDateTime(input.expiresAt),
  });
}

export function invoiceProjection(input: {
  invoiceId: number;
  invoiceNumber: string;
  status: string;
  totalAmount: string | number;
  currency?: string | null;
  dueDate?: Date | null;
  reconciliationPeriod?: string | null;
  isCommission: boolean;
}): Record<string, unknown> {
  return omitUndefined({
    name: `${input.isCommission ? "Commission reconciliation" : "Client invoice"} ${text(input.invoiceNumber, 64) ?? `#${input.invoiceId}`}`,
    lanaiInvoiceId: String(input.invoiceId),
    invoiceNumber: text(input.invoiceNumber, 64),
    period: text(input.reconciliationPeriod, 7),
    status: input.status,
    totalAmount: numeric(input.totalAmount),
    currency: text(input.currency, 8),
    dueDate: isoDate(input.dueDate),
  });
}

export function communicationNoteProjection(input: {
  communicationId: number;
  summary?: string | null;
  category?: string | null;
  followUpDueAt?: Date | null;
}): Record<string, unknown> {
  return omitUndefined({
    name: `Lanai communication #${input.communicationId}`,
    lanaiCommunicationId: String(input.communicationId),
    body: text(input.summary, 2_000),
    category: text(input.category, 64),
    followUpDueAt: isoDateTime(input.followUpDueAt),
  });
}

export function experienceProjection(input: {
  experienceId: number;
  type: "celebration" | "vip_amenity" | "feedback" | "nps";
  scheduledAt?: Date | null;
  status: string;
  npsScore?: number | null;
}): Record<string, unknown> {
  return omitUndefined({
    name: `Lanai ${input.type.replace("_", " ")} #${input.experienceId}`,
    lanaiExperienceId: String(input.experienceId),
    type: input.type,
    scheduledAt: isoDate(input.scheduledAt),
    status: input.status,
    npsScore: numeric(input.npsScore),
  });
}

export function allowedInboundFields(objectType: CrmObjectType): string[] {
  return Object.entries(CRM_FIELD_OWNERSHIP[objectType])
    .filter(
      ([, policy]) =>
        policy === "crm_authoritative" || policy === "manual_conflict",
    )
    .map(([field]) => field);
}
