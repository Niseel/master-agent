/**
 * The LLM that grades eval output (deepeval "judge"). Chosen with AGENTHUB_JUDGE, so the same evals run at Work
 * (company Copilot) and elsewhere (milestone-1 §6, §7):
 *   copilot[:<model>]   default; the logged-in Copilot through the Copilot SDK, no tools
 *   anthropic:<model>   ANTHROPIC_API_KEY; needs `pnpm add -Dw @anthropic-ai/sdk`
 *   openai:<model>      OPENAI_API_KEY
 *   ollama:<model>      local Ollama; needs `pnpm add -Dw ollama`
 */
import type { CopilotClient, ResponseSchema } from "@microsoft/copilot-sdk";
import { AnthropicModel, DeepEvalBaseLLM, OllamaModel, OpenAIModel, type GenerationResult } from "deepeval/models";
import type { ZodType } from "zod";
import { MIN_SESSION_CREDITS } from "../packages/core/src/agents.ts";
import { newClient } from "../packages/core/src/runtime/sdk.ts";

const TIMEOUT_MS = 120_000;

/** Grades through Copilot: one session per call, no tools, the smallest credit cap the runtime accepts. */
export class CopilotJudge extends DeepEvalBaseLLM {
  private client: Promise<CopilotClient> | null = null;

  constructor(private model?: string) {
    super(model ?? "copilot");
  }

  getModelName() {
    return `copilot:${this.model ?? "default"}`;
  }

  async generate<T = string>(prompt: string, schema?: ZodType<T>): Promise<GenerationResult<T>> {
    this.client ??= (async () => {
      const c = newClient();
      await c.start();
      return c;
    })();
    const s = await (await this.client).createSession({
      clientName: "agent-hub-eval",
      model: this.model,
      tools: { availableTools: [] },
      agents: { includedBuiltinAgents: [] },
      instructions: { skipCustomInstructions: true },
      execution: { limits: { maxAiCredits: MIN_SESSION_CREDITS } },
      permissions: { onRequest: () => ({ kind: "reject", feedback: "Judge không gọi tool" }) },
    });
    try {
      const output = schema
        ? await s.sendAndWait({ prompt }, schema as unknown as ResponseSchema<T>, TIMEOUT_MS)
        : (((await s.sendAndWait({ prompt }, TIMEOUT_MS))?.data.content ?? "") as T);
      return { output, cost: null };
    } finally {
      await s.disconnect().catch(() => {});
    }
  }

  async stop() {
    if (this.client) await (await this.client).stop();
    this.client = null;
  }
}

export function judgeFrom(spec = process.env.AGENTHUB_JUDGE || "copilot"): DeepEvalBaseLLM {
  const [provider, ...rest] = spec.split(":");
  const model = rest.join(":") || undefined;
  switch (provider) {
    case "copilot":
      return new CopilotJudge(model);
    case "anthropic":
      return new AnthropicModel({ model });
    case "openai":
      return new OpenAIModel({ model });
    case "ollama":
      return new OllamaModel({ model });
    default:
      throw new Error(`AGENTHUB_JUDGE không hợp lệ: "${spec}" (copilot[:model] | anthropic:<model> | openai:<model> | ollama:<model>)`);
  }
}
