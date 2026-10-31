import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

/** 旅行プラン作成・翻訳に使うモデル（画像の生成には使わない） */
export const CLAUDE_MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;
function getClient() {
  client ??= new Anthropic();
  return client;
}

export class AiError extends Error {}

/**
 * Claude に JSON を返させ、zod スキーマで検証して返す。
 * 安全分類器で断られた場合は、サーバー側フォールバックで別モデルが続きを生成する。
 */
export async function generateJson<T extends z.ZodType>(opts: {
  schema: T;
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<z.infer<T>> {
  const response = await getClient().beta.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: opts.system,
    messages: opts.messages,
    output_config: {
      effort: opts.effort ?? "medium",
      format: betaZodOutputFormat(opts.schema),
    },
  });

  if (response.stop_reason === "refusal") throw new AiError("refusal");
  if (response.stop_reason === "max_tokens") throw new AiError("max_tokens");
  if (response.parsed_output == null) throw new AiError("invalid_output");
  return response.parsed_output as z.infer<T>;
}
