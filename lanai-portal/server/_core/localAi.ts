import { ENV } from "./env";

export type LocalAiCapability =
  "proposal" | "intelligence" | "briefing" | "whatsapp";

export async function invokeLocalAi(input: {
  capability: LocalAiCapability;
  system: string;
  prompt: string;
  responseFormat?: "text" | "json";
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
}): Promise<{ output: string; structured?: Record<string, unknown> }> {
  if (!ENV.aiGatewayUrl || !ENV.aiGatewayToken) {
    throw new Error("Local AI gateway is not configured");
  }
  const response = await fetch(`${ENV.aiGatewayUrl.replace(/\/$/, "")}/infer`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.aiGatewayToken}`,
    },
    body: JSON.stringify({
      capability: input.capability,
      system: input.system,
      prompt: input.prompt,
      response_format: input.responseFormat ?? "text",
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxTokens ?? 1_024,
      metadata: input.metadata ?? {},
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 2_000);
    throw new Error(
      `Local AI inference failed (${response.status}): ${detail}`,
    );
  }
  const result = (await response.json()) as { output?: unknown };
  const output = typeof result.output === "string" ? result.output.trim() : "";
  if (!output) throw new Error("Local AI inference returned an empty response");
  if (input.responseFormat !== "json") return { output };
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    if (!parsed || Array.isArray(parsed))
      throw new Error("Expected JSON object");
    return { output, structured: parsed };
  } catch (error) {
    throw new Error(
      `Local AI inference returned invalid structured output: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
