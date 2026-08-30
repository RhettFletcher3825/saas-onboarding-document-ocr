import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiError, InfraiOcrClient } from "./infrai_ocr_client.js";
import {
  onboardingDocumentSchema,
  onboardScannedDocument,
  type OnboardingDocument
} from "./tenant_onboarding.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const client = new InfraiOcrClient(apiKey);

function reply(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/documents/ocr") {
    reply(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = onboardingDocumentSchema.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8"))
    ) as OnboardingDocument;
    const document = await onboardScannedDocument(client, input);
    reply(response, 200, document);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      reply(response, 400, { error: "Invalid document request" });
      return;
    }
    if (error instanceof InfraiError) {
      reply(response, error.status >= 400 && error.status < 500 ? error.status : 502, {
        error: error.code
      });
      return;
    }
    reply(response, 500, { error: "Document processing failed" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Onboarding OCR listening on http://localhost:${port}`));
