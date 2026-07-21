import {
  enqueueDomainEvent,
  dispatchOutboxBatch,
  type DomainEventInput,
} from "../_core/outbox";

export async function persistAndDispatchDomainEvent(
  input: DomainEventInput,
): Promise<void> {
  await enqueueDomainEvent(input);
  const result = await dispatchOutboxBatch();
  if (result.failed > 0)
    throw new Error(
      `Outbox dispatch retained ${result.failed} failed delivery attempt(s)`,
    );
}

/**
 * The morning briefing model invocation is deliberately delegated to the AI
 * gateway, which is the only service allowed to run inference. This activity
 * makes a scheduler retry the request instead of manufacturing a briefing.
 */
export async function generateMorningBriefing(input: {
  requestedByUserId?: number;
}): Promise<void> {
  const gateway = process.env.AI_GATEWAY_URL;
  const token = process.env.AI_GATEWAY_TOKEN;
  if (!gateway || !token)
    throw new Error(
      "AI gateway configuration is required for morning briefing generation",
    );
  const response = await fetch(
    `${gateway.replace(/\/$/, "")}/briefing/morning-briefing`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok)
    throw new Error(
      `Morning briefing gateway request failed (${response.status})`,
    );
}
