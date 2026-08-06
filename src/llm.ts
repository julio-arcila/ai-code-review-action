/** OpenAI-compatible LLM client (GitHub Models by default — free with GITHUB_TOKEN). */
import OpenAI from "openai";

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function makeClient(cfg: LlmConfig): OpenAI {
  return new OpenAI({ baseURL: cfg.baseUrl, apiKey: cfg.apiKey });
}

export async function reviewBatch(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  retries = 3
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 4000,
      });
      return res.choices[0]?.message?.content ?? "[]";
    } catch (err: any) {
      lastErr = err;
      const status = err?.status ?? 0;
      if (status === 429 || status >= 500) {
        const wait = attempt * 15_000;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
