/**
 * Lanai Lifestyle CRM API Client
 * Connects to the live Twenty CRM GraphQL API via Vite proxy (/crm)
 * All data is real — fetched from the running Twenty instance.
 */

const CRM_ENDPOINT = "/crm/graphql";
// API token is proxied — the Vite proxy injects the Authorization header
// so we don't expose the token in the browser bundle.

async function gql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(CRM_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`CRM request failed: ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CRMPerson {
  id: string;
  name: { firstName: string; lastName: string };
  emails: { primaryEmail: string };
  phones: { primaryPhoneNumber: string };
  city: string;
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

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function fetchClients(first = 50): Promise<{ totalCount: number; clients: CRMPerson[] }> {
  const data = await gql<{ people: { totalCount: number; edges: { node: CRMPerson }[] } }>(`
    query GetClients($first: Int) {
      people(first: $first, orderBy: { updatedAt: DescNullsLast }) {
        totalCount
        edges {
          node {
            id
            name { firstName lastName }
            emails { primaryEmail }
            phones { primaryPhoneNumber }
            city
            createdAt
            updatedAt
          }
        }
      }
    }
  `, { first });
  return {
    totalCount: data.people.totalCount,
    clients: data.people.edges.map((e) => e.node),
  };
}

export async function fetchOpportunities(first = 50): Promise<{ totalCount: number; opportunities: CRMOpportunity[] }> {
  const data = await gql<{ opportunities: { totalCount: number; edges: { node: CRMOpportunity }[] } }>(`
    query GetOpportunities($first: Int) {
      opportunities(first: $first, orderBy: { updatedAt: DescNullsLast }) {
        totalCount
        edges {
          node {
            id
            name
            stage
            amount { amountMicros currencyCode }
            closeDate
            createdAt
            updatedAt
            pointOfContact {
              id
              name { firstName lastName }
            }
          }
        }
      }
    }
  `, { first });
  return {
    totalCount: data.opportunities.totalCount,
    opportunities: data.opportunities.edges.map((e) => e.node),
  };
}

export async function fetchRecentNotes(first = 20): Promise<{ totalCount: number; notes: CRMNote[] }> {
  const data = await gql<{ notes: { totalCount: number; edges: { node: CRMNote }[] } }>(`
    query GetNotes($first: Int) {
      notes(first: $first, orderBy: { createdAt: DescNullsLast }) {
        totalCount
        edges {
          node {
            id
            title
            createdAt
            updatedAt
          }
        }
      }
    }
  `, { first });
  return {
    totalCount: data.notes.totalCount,
    notes: data.notes.edges.map((e) => e.node),
  };
}

export async function fetchTasks(first = 20): Promise<{ totalCount: number; tasks: CRMTask[] }> {
  const data = await gql<{ tasks: { totalCount: number; edges: { node: CRMTask }[] } }>(`
    query GetTasks($first: Int) {
      tasks(first: $first, orderBy: { createdAt: DescNullsLast }) {
        totalCount
        edges {
          node {
            id
            title
            status
            dueAt
            createdAt
            assignee {
              id
              name { firstName lastName }
            }
          }
        }
      }
    }
  `, { first });
  return {
    totalCount: data.tasks.totalCount,
    tasks: data.tasks.edges.map((e) => e.node),
  };
}

export async function fetchDashboardStats() {
  const [clientsRes, oppsRes, notesRes, tasksRes] = await Promise.all([
    fetchClients(1),
    fetchOpportunities(200),
    fetchRecentNotes(1),
    fetchTasks(1),
  ]);

  const opps = oppsRes.opportunities;
  const pipelineValue = opps.reduce((sum, o) => sum + (o.amount?.amountMicros ?? 0) / 1_000_000, 0);
  const openRequests = opps.filter((o) => ["NEW", "SCREENING", "PROPOSAL", "MEETING"].includes(o.stage)).length;
  const activeMembers = opps.filter((o) => o.stage === "CUSTOMER").length;

  return {
    activeClients: clientsRes.totalCount,
    openRequests,
    activeMembers,
    pipelineValue: Math.round(pipelineValue),
    recentOpportunities: opps.slice(0, 8),
  };
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
    data: {
      title: data.title,
    },
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
