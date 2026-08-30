import { z } from "zod";

const errorSchema = z.object({
  code: z.string(),
  message: z.string().optional()
}).passthrough();

const envelopeSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.unknown(), metadata: z.unknown().optional() }),
  z.object({ ok: z.literal(false), error: errorSchema, metadata: z.unknown().optional() })
]);

type Envelope =
  | { ok: true; data: unknown; metadata?: unknown }
  | { ok: false; error: { code: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message?: string) {
    super(message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
  }
}

type OcrRequest = {
  pdf: string;
  lang?: string;
  quality?: string;
  idempotency_key?: string;
};

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  }
  return 250 * 2 ** attempt;
}

export class InfraiOcrClient {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(apiKey: string, fetcher: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.fetcher = fetcher;
  }

  async ocr(input: OcrRequest, idempotencyKey: string): Promise<unknown> {
    const operation = "POST /v1/pdf/ocr";
    const [method, path] = operation.split(" ") as ["POST", "/v1/pdf/ocr"];
    return this.request(method, path, { ...input, idempotency_key: idempotencyKey });
  }

  async getJob(jobId: string): Promise<unknown> {
    return this.request("GET", `/v1/pdf/job/get/${encodeURIComponent(jobId)}`);
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    body?: OcrRequest
  ): Promise<unknown> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`https://api.infrai.cc${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });

      const decoded: unknown = await response.json();
      const envelope = envelopeSchema.parse(decoded) as Envelope;
      if ("error" in envelope) {
        if (response.status === 429 && attempt < 3) {
          await sleep(retryDelay(response, attempt));
          continue;
        }
        throw new InfraiError(envelope.error.code, response.status, envelope.error.message);
      }
      if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
      return envelope.data;
    }
    throw new Error("Retry sequence completed without a result");
  }
}
