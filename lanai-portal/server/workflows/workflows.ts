import { proxyActivities } from "@temporalio/workflow";

export type DomainEventWorkflowInput = {
  aggregateType: string;
  aggregateId: string | number;
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
};

const activities = proxyActivities<{
  persistAndDispatchDomainEvent(input: DomainEventWorkflowInput): Promise<void>;
  generateMorningBriefing(input: { requestedByUserId?: number }): Promise<void>;
}>({
  startToCloseTimeout: "2 minutes",
  retry: {
    maximumAttempts: 8,
    initialInterval: "2s",
    maximumInterval: "2m",
    backoffCoefficient: 2,
  },
});

/** Durable retry boundary for a business event that has failed immediate delivery. */
export async function domainEventWorkflow(
  input: DomainEventWorkflowInput,
): Promise<void> {
  await activities.persistAndDispatchDomainEvent(input);
}

/** Durable scheduled/manual generation boundary for the advisor morning briefing. */
export async function morningBriefingWorkflow(
  input: { requestedByUserId?: number } = {},
): Promise<void> {
  await activities.generateMorningBriefing(input);
}

// Financial workflows are exported from the same bundle loaded by the Temporal
// worker. Keeping this explicit prevents a client from successfully starting a
// workflow name that no worker can ever execute.
export {
  bookingCommissionSaga,
  invoicePaymentSaga,
  commissionReconciliationSaga,
} from "./financialWorkflows";
