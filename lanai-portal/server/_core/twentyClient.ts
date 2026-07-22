import { ENV } from "./env";

export type TwentyRecord = Record<string, unknown> & {
  id: string;
  updatedAt?: string;
  createdAt?: string;
};

export type TwentyObjectDefinition = {
  nameSingular: string;
  namePlural: string;
  labelSingular: string;
  labelPlural: string;
  icon?: string;
  fields: Array<{
    name: string;
    label: string;
    type:
      "TEXT" | "DATE" | "DATE_TIME" | "NUMBER" | "CURRENCY" | "SELECT" | "JSON";
    description: string;
    options?: string[];
  }>;
};

/**
 * Metadata is declarative and deliberately contains only CRM-safe fields.
 * Sensitive operational, identity, payment, and raw-message data remains in Lanai.
 */
export const LANAI_TWENTY_OBJECT_DEFINITIONS: TwentyObjectDefinition[] = [
  {
    nameSingular: "trip",
    namePlural: "trips",
    labelSingular: "Trip",
    labelPlural: "Trips",
    icon: "IconPlane",
    fields: [
      {
        name: "lanaiBookingId",
        label: "Lanai Booking ID",
        type: "TEXT",
        description: "Stable Lanai booking identifier",
      },
      {
        name: "status",
        label: "Status",
        type: "SELECT",
        description: "Operational booking stage",
        options: ["pending", "confirmed", "paid", "cancelled", "refunded"],
      },
      {
        name: "destination",
        label: "Destination",
        type: "TEXT",
        description: "CRM-safe destination label",
      },
      {
        name: "startDate",
        label: "Start Date",
        type: "DATE",
        description: "Trip start date",
      },
      {
        name: "endDate",
        label: "End Date",
        type: "DATE",
        description: "Trip end date",
      },
      {
        name: "totalAmount",
        label: "Client-facing Total",
        type: "CURRENCY",
        description: "Client-facing booking amount only",
      },
      {
        name: "currency",
        label: "Currency",
        type: "TEXT",
        description: "ISO currency code",
      },
    ],
  },
  {
    nameSingular: "proposal",
    namePlural: "proposals",
    labelSingular: "Proposal",
    labelPlural: "Proposals",
    icon: "IconFileDescription",
    fields: [
      {
        name: "lanaiProposalId",
        label: "Lanai Proposal ID",
        type: "TEXT",
        description: "Stable Lanai proposal identifier",
      },
      {
        name: "status",
        label: "Status",
        type: "SELECT",
        description: "Client proposal lifecycle",
        options: ["draft", "sent", "approved", "rejected", "expired"],
      },
      {
        name: "sentAt",
        label: "Sent At",
        type: "DATE_TIME",
        description: "Client-send timestamp",
      },
      {
        name: "validUntil",
        label: "Valid Until",
        type: "DATE",
        description: "Proposal expiry date",
      },
      {
        name: "selectedTier",
        label: "Selected Tier",
        type: "TEXT",
        description: "Client-selected pricing tier",
      },
      {
        name: "clientFacingTotal",
        label: "Client-facing Total",
        type: "CURRENCY",
        description: "Never includes margin or commission detail",
      },
      {
        name: "currency",
        label: "Currency",
        type: "TEXT",
        description: "ISO currency code",
      },
    ],
  },
  {
    nameSingular: "supplierInquiry",
    namePlural: "supplierInquiries",
    labelSingular: "Supplier Inquiry",
    labelPlural: "Supplier Inquiries",
    icon: "IconBuildingStore",
    fields: [
      {
        name: "lanaiInquiryId",
        label: "Lanai Inquiry ID",
        type: "TEXT",
        description: "Stable Lanai pricing inquiry identifier",
      },
      {
        name: "serviceType",
        label: "Service Type",
        type: "TEXT",
        description: "Requested service category",
      },
      {
        name: "status",
        label: "Status",
        type: "SELECT",
        description: "Inquiry state",
        options: ["pending", "responded", "accepted", "declined", "expired"],
      },
      {
        name: "responseDueAt",
        label: "Response Due At",
        type: "DATE_TIME",
        description: "Supplier response deadline",
      },
    ],
  },
  {
    nameSingular: "commissionReconciliation",
    namePlural: "commissionReconciliations",
    labelSingular: "Commission Reconciliation",
    labelPlural: "Commission Reconciliations",
    icon: "IconReceipt",
    fields: [
      {
        name: "lanaiInvoiceId",
        label: "Lanai Invoice ID",
        type: "TEXT",
        description: "Stable Lanai invoice identifier",
      },
      {
        name: "period",
        label: "Reconciliation Period",
        type: "TEXT",
        description: "YYYY-MM accounting period",
      },
      {
        name: "status",
        label: "Status",
        type: "SELECT",
        description: "Supplier commission reconciliation state",
        options: ["draft", "issued", "paid", "overdue", "cancelled"],
      },
      {
        name: "totalAmount",
        label: "Aggregate Commission",
        type: "CURRENCY",
        description: "Aggregate supplier reconciliation total",
      },
      {
        name: "currency",
        label: "Currency",
        type: "TEXT",
        description: "ISO currency code",
      },
    ],
  },
  {
    nameSingular: "experienceMoment",
    namePlural: "experienceMoments",
    labelSingular: "Experience Moment",
    labelPlural: "Experience Moments",
    icon: "IconSparkles",
    fields: [
      {
        name: "lanaiExperienceId",
        label: "Lanai Experience ID",
        type: "TEXT",
        description: "Stable celebration, amenity, or feedback identifier",
      },
      {
        name: "type",
        label: "Type",
        type: "SELECT",
        description: "CRM-safe experience category",
        options: ["celebration", "vip_amenity", "feedback", "nps"],
      },
      {
        name: "scheduledAt",
        label: "Scheduled At",
        type: "DATE",
        description: "Scheduled moment date",
      },
      {
        name: "status",
        label: "Status",
        type: "SELECT",
        description: "Fulfillment state",
        options: ["pending", "planned", "fulfilled", "cancelled"],
      },
      {
        name: "npsScore",
        label: "NPS Score",
        type: "NUMBER",
        description: "Numeric score only; raw feedback remains in Lanai",
      },
    ],
  },
];

export class TwentyCrmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly responseBody?: string,
  ) {
    super(message);
    this.name = "TwentyCrmError";
  }
}

function trimUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalisePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function responseRecord(payload: unknown): TwentyRecord {
  if (!payload || typeof payload !== "object") {
    throw new TwentyCrmError("Twenty returned an empty or non-object record");
  }
  const candidate = payload as Record<string, unknown>;
  const record = (candidate.data ?? candidate) as Record<string, unknown>;
  if (typeof record.id !== "string") {
    throw new TwentyCrmError("Twenty response did not include a record id");
  }
  return record as TwentyRecord;
}

/**
 * Workspace-schema-aware client. It intentionally uses the generated REST API
 * and never assumes object UUIDs or mutable display names.
 */
export class TwentyCrmClient {
  readonly coreBaseUrl: string;
  readonly metadataBaseUrl: string;

  constructor(options?: {
    baseUrl?: string;
    apiToken?: string;
    coreApiBasePath?: string;
    metadataBasePath?: string;
    fetchImpl?: typeof fetch;
  }) {
    const baseUrl = options?.baseUrl ?? ENV.twentyCrmUrl;
    const apiToken = options?.apiToken ?? ENV.twentyCrmApiToken;
    if (!baseUrl || !apiToken) {
      throw new TwentyCrmError(
        "TWENTY_CRM_URL and TWENTY_CRM_API_TOKEN are required for CRM network operations",
      );
    }
    this.baseUrl = trimUrl(baseUrl);
    this.apiToken = apiToken;
    this.coreBaseUrl = `${this.baseUrl}${normalisePath(
      options?.coreApiBasePath ?? ENV.twentyCrmCoreApiBasePath,
    )}`;
    this.metadataBaseUrl = `${this.baseUrl}${normalisePath(
      options?.metadataBasePath ?? ENV.twentyCrmMetadataBasePath,
    )}`;
    this.fetchImpl = options?.fetchImpl ?? fetch;
  }

  private readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly fetchImpl: typeof fetch;

  static isConfigured(): boolean {
    return Boolean(
      ENV.twentyCrmSyncEnabled && ENV.twentyCrmUrl && ENV.twentyCrmApiToken,
    );
  }

  private async request<T>(
    url: string,
    init: RequestInit,
    idempotencyKey?: string,
  ): Promise<T> {
    const response = await this.fetchImpl(url, {
      ...init,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.apiToken}`,
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new TwentyCrmError(
        `Twenty API ${init.method ?? "GET"} ${url} failed with ${response.status}`,
        response.status,
        raw.slice(0, 4_000),
      );
    }
    if (!raw) return {} as T;
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new TwentyCrmError(
        `Twenty API ${init.method ?? "GET"} ${url} returned invalid JSON`,
        response.status,
        raw.slice(0, 4_000),
      );
    }
  }

  async createRecord(
    objectName: string,
    values: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<TwentyRecord> {
    const result = await this.request<unknown>(
      `${this.coreBaseUrl}/${encodeURIComponent(objectName)}`,
      { method: "POST", body: JSON.stringify(values) },
      idempotencyKey,
    );
    return responseRecord(result);
  }

  async updateRecord(
    objectName: string,
    recordId: string,
    values: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<TwentyRecord> {
    const result = await this.request<unknown>(
      `${this.coreBaseUrl}/${encodeURIComponent(objectName)}/${encodeURIComponent(recordId)}`,
      { method: "PATCH", body: JSON.stringify(values) },
      idempotencyKey,
    );
    return responseRecord(result);
  }

  async getRecord(objectName: string, recordId: string): Promise<TwentyRecord> {
    const result = await this.request<unknown>(
      `${this.coreBaseUrl}/${encodeURIComponent(objectName)}/${encodeURIComponent(recordId)}`,
      { method: "GET" },
    );
    return responseRecord(result);
  }

  async deleteRecord(
    objectName: string,
    recordId: string,
    idempotencyKey: string,
  ): Promise<void> {
    await this.request<unknown>(
      `${this.coreBaseUrl}/${encodeURIComponent(objectName)}/${encodeURIComponent(recordId)}`,
      { method: "DELETE" },
      idempotencyKey,
    );
  }

  /**
   * Creates missing custom objects/fields when the workspace metadata API is
   * available. A conflict response is treated as an idempotent existing object.
   */
  async ensureLanaiMetadata(): Promise<void> {
    if (!ENV.twentyCrmMetadataBootstrapEnabled) {
      throw new TwentyCrmError(
        "TWENTY_CRM_METADATA_BOOTSTRAP_ENABLED must be true to modify Twenty metadata",
      );
    }
    for (const object of LANAI_TWENTY_OBJECT_DEFINITIONS) {
      await this.ensureMetadataResource("objects", {
        nameSingular: object.nameSingular,
        namePlural: object.namePlural,
        labelSingular: object.labelSingular,
        labelPlural: object.labelPlural,
        icon: object.icon,
      });
      for (const field of object.fields) {
        await this.ensureMetadataResource("fields", {
          objectName: object.nameSingular,
          ...field,
        });
      }
    }
  }

  private async ensureMetadataResource(
    resource: "objects" | "fields",
    values: Record<string, unknown>,
  ) {
    try {
      await this.request<unknown>(
        `${this.metadataBaseUrl}/${resource}`,
        { method: "POST", body: JSON.stringify(values) },
        `lanai:metadata:${resource}:${String(values.name ?? values.nameSingular)}`,
      );
    } catch (error) {
      if (error instanceof TwentyCrmError && error.status === 409) return;
      throw error;
    }
  }
}
