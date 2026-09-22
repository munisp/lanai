/**
 * Lanai Lifestyle CRM API Client
 *
 * The portal pages (Dashboard, Clients, Members, Travel Requests) consume CRM
 * shapes (CRMPerson / CRMOpportunity / CRMNote / CRMTask). These are sourced
 * from the platform's own database via the `/api/crm/data` aggregator route
 * (server/_core/crmData.ts), so the full workflow works without an external
 * Twenty CRM. When an external CRM is configured it can still be used for
 * writes via the GraphQL proxy.
 */

const CRM_DATA_ENDPOINT = "/api/crm/data";

export interface CRMPerson {
  id: string;
  name: { firstName: string; lastName: string };
  emails: { primaryEmail: string };
  phones: { primaryPhoneNumber: string };
  city: string;
  tier?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CRMOpportunity {
  id: string;
  name: string;
  stage: string;
  amount: { amountMicros: number; currencyCode: string };
  closeDate: string;
  createdAt: string;
  updatedAt: string;
  pointOfContact?: { id: string; name: { firstName: string; lastName: string } };
}

export interface CRMNote {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface CRMTask {
  id: string;
  title: string;
  status: string;
  dueAt: string;
  createdAt: string;
  assignee?: { id: string; name: { firstName: string; lastName: string } };
}

interface CrmDataResponse {
  clients: { totalCount: number; clients: CRMPerson[] };
  opportunities: { totalCount: number; opportunities: CRMOpportunity[] };
  notes: { totalCount: number; notes: CRMNote[] };
  tasks: { totalCount: number; tasks: CRMTask[] };
  stats: {
    activeClients: number;
    openRequests: number;
    activeMembers: number;
    pipelineValue: number;
    recentOpportunities: CRMOpportunity[];
  };
}

async function fetchCrmData(): Promise<CrmDataResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(CRM_DATA_ENDPOINT, { credentials: "include", signal: controller.signal });
    if (!res.ok) throw new Error(`CRM data request failed: ${res.status}`);
    return (await res.json()) as CrmDataResponse;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function fetchClients(first = 50): Promise<{ totalCount: number; clients: CRMPerson[] }> {
  const data = await fetchCrmData();
  return { totalCount: data.clients.totalCount, clients: data.clients.clients.slice(0, first) };
}

export async function fetchMembers(first = 50): Promise<{ totalCount: number; members: CRMPerson[] }> {
  const data = await fetchCrmData();
  return { totalCount: data.clients.totalCount, members: data.clients.clients.slice(0, first) };
}

export async function fetchOpportunities(first = 50): Promise<{ totalCount: number; opportunities: CRMOpportunity[] }> {
  const data = await fetchCrmData();
  return { totalCount: data.opportunities.totalCount, opportunities: data.opportunities.opportunities.slice(0, first) };
}

export async function fetchRecentNotes(first = 20): Promise<{ totalCount: number; notes: CRMNote[] }> {
  const data = await fetchCrmData();
  return { totalCount: data.notes.totalCount, notes: data.notes.notes.slice(0, first) };
}

export async function fetchTasks(first = 20): Promise<{ totalCount: number; tasks: CRMTask[] }> {
  const data = await fetchCrmData();
  return { totalCount: data.tasks.totalCount, tasks: data.tasks.tasks.slice(0, first) };
}

export async function fetchDashboardStats() {
  const data = await fetchCrmData();
  return {
    activeClients: data.stats.activeClients,
    openRequests: data.stats.openRequests,
    activeMembers: data.stats.activeMembers,
    pipelineValue: data.stats.pipelineValue,
    recentOpportunities: data.stats.recentOpportunities,
  };
}

// ─── Mutations (delegated to external CRM when configured) ───────────────────
// Writes still target Twenty via the GraphQL proxy so integrations remain live.
// Until the external CRM token is configured these are best-effort no-ops that
// throw a clear error surfaced to the UI.

const CRM_GQL_ENDPOINT = "/crm/graphql";

async function gql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(CRM_GQL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`CRM request failed: ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

export async function createPerson(data: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}): Promise<CRMPerson> {
  const result = await gql<{ createPerson: CRMPerson }>(`
    mutation CreatePerson($data: PersonCreateInput!) {
      createPerson(data: $data) {
        id
        name { firstName lastName }
        emails { primaryEmail }
        phones { primaryPhoneNumber }
        createdAt
      }
    }
  `, {
    data: {
      name: { firstName: data.firstName, lastName: data.lastName },
      emails: { primaryEmail: data.email },
      phones: data.phone ? { primaryPhoneNumber: data.phone } : undefined,
    },
  });
  return result.createPerson;
}

export async function createOpportunity(data: {
  name: string;
  stage?: string;
  amountGBP?: number;
  closeDate?: string;
  personId?: string;
}): Promise<CRMOpportunity> {
  const result = await gql<{ createOpportunity: CRMOpportunity }>(`
    mutation CreateOpportunity($data: OpportunityCreateInput!) {
      createOpportunity(data: $data) {
        id
        name
        stage
        amount { amountMicros currencyCode }
        closeDate
        createdAt
      }
    }
  `, {
    data: {
      name: data.name,
      stage: data.stage ?? "NEW",
      amount: data.amountGBP ? { amountMicros: data.amountGBP * 1_000_000, currencyCode: "GBP" } : undefined,
      closeDate: data.closeDate,
      pointOfContactId: data.personId,
    },
  });
  return result.createOpportunity;
}

export async function createNote(data: {
  title: string;
  body?: string;
  personId?: string;
}): Promise<CRMNote> {
  const result = await gql<{ createNote: CRMNote }>(`
    mutation CreateNote($data: NoteCreateInput!) {
      createNote(data: $data) {
        id
        title
        createdAt
      }
    }
  `, {
    data: { title: data.title },
  });
  return result.createNote;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatCurrency(amountMicros: number, currency = "GBP"): string {
  const amount = amountMicros / 1_000_000;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function stageLabel(stage: string): string {
  const map: Record<string, string> = {
    NEW: "Enquiry",
    SCREENING: "Qualification",
    MEETING: "Discovery",
    PROPOSAL: "Proposal",
    CUSTOMER: "Booking",
    CLOSED_WON: "Confirmed",
    CLOSED_LOST: "Closed",
    BOOKED: "Booked",
    IN_PROGRESS: "In Progress",
    DONE: "Done",
  };
  return map[stage] ?? stage;
}

export function stageColor(stage: string): string {
  const map: Record<string, string> = {
    NEW: "bg-blue-100 text-blue-800",
    SCREENING: "bg-purple-100 text-purple-800",
    MEETING: "bg-amber-100 text-amber-800",
    PROPOSAL: "bg-orange-100 text-orange-800",
    CUSTOMER: "bg-green-100 text-green-800",
    BOOKED: "bg-emerald-100 text-emerald-800",
    IN_PROGRESS: "bg-cyan-100 text-cyan-800",
    DONE: "bg-gray-100 text-gray-800",
    CLOSED_WON: "bg-emerald-100 text-emerald-800",
    CLOSED_LOST: "bg-red-100 text-red-800",
  };
  return map[stage] ?? "bg-gray-100 text-gray-800";
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
