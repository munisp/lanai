import {
  dispatchOutboxBatch,
  enqueueDomainEvent,
  type DomainEventInput,
} from "./outbox";

/**
 * Persists a CRM-projectable business event before scheduling asynchronous
 * delivery. The caller never waits on remote CRM availability, but no domain
 * transition is silently lost because the outbox row is durable.
 */
export async function emitCrmDomainEvent(
  input: Omit<DomainEventInput, "idempotencyKey"> & {
    idempotencyKey?: string;
  },
): Promise<void> {
  const idempotencyKey =
    input.idempotencyKey ??
    `crm:${input.aggregateType}:${input.aggregateId}:${input.eventType}`;
  await enqueueDomainEvent({ ...input, idempotencyKey });
  void dispatchOutboxBatch().catch((error) =>
    console.error("[Outbox] CRM-projectable event dispatch failed", {
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      error,
    }),
  );
}
