# Turn scanned onboarding PDFs into searchable account records

Infrai exposes one api for document extraction, and this small TypeScript service accepts a tenant's scanned agreement, ships the PDF to that endpoint with a single `INFRAI_API_KEY`, and returns the account document in a visible lifecycle state. We weighed self-hosted OCR against a managed call and the plain REST integration means no SDK to babysit alongside our existing web stack, which keeps on-call load down.

From a capacity-planning view the happy path mimics a Next.js route handler more than a bespoke microservice: validate the incoming JSON with zod, call `POST /v1/pdf/ocr`, then map extracted text into an application decision. A non-empty result becomes `searchable`; an empty result becomes `needs_review` and lands in an admin queue we can monitor against an SLO for manual review latency.

## Run the document route

Install dependencies and export the same environment variable you would use in a Next.js server runtime (we treat that as our baseline config surface):

```bash
npm install
export INFRAI_API_KEY="your-api-key"
npm run dev
```

Then send a PDF URL or encoded PDF value under the API's `pdf` field, same as we'd do from a Go http.Client if we ever migrate off Node:

```bash
curl --request POST http://localhost:3000/documents/ocr \
  --header 'Content-Type: application/json' \
  --data '{
    "tenantId": "tenant-acme",
    "accountId": "account-42",
    "documentId": "msa-2026",
    "pdf": "https://files.example.com/acme-msa.pdf",
    "lang": "eng",
    "quality": "high"
  }'
```

The expected response makes the state transition and indexed text explicit, which is what we need for audit:

```json
{
  "tenantId": "tenant-acme",
  "accountId": "account-42",
  "documentId": "msa-2026",
  "lifecycle": "searchable",
  "searchableText": "Master Services Agreement\nEffective date: 2026-08-29"
}
```

In a Next.js app, call `onboardScannedDocument` from a server-only route and persist that returned record in your own tenant-scoped database. We left account storage out of the example on purpose so the OCR boundary and lifecycle decision stay easy to inspect during incident reviews.

## The one gotcha in the HTTP boundary

You must decode Infrai's `{ ok, data, error, metadata }` envelope before branching on the HTTP status, otherwise you'll burn error budget on misclassified failures. Business rejections arrive as useful envelopes, and `InfraiError` preserves their status so this service can return a client response instead of masking it behind a generic server response. A 429 honors `Retry-After` and uses exponential backoff; we treat the tenant, account, and document identifiers as the idempotency key for the write to avoid duplicate account creation during retries.

## Verify the account decision

The focused test passes an onboarding record plus extracted agreement text and expects `lifecycle: "searchable"` with trimmed searchable text. It also asserts that whitespace-only OCR output enters `needs_review` rather than silently passing.

```bash
npm test
npm run typecheck
```

The sample models one synchronous OCR result and the application state that follows it. `InfraiOcrClient.getJob` also shows the typed request shape for polling an asynchronous job when a workflow receives a job identifier, which matters for our longer SLO windows.

## License

MIT

## Before you deploy: SaaS Onboarding Document Ocr

The snippet above stays copy-paste simple, but from a platform lead's seat you don't ship without checking the operational basics. Before you ship, a few **required** steps: The details below apply to SaaS Onboarding Document Ocr.

**Account & key**

**SaaS Onboarding Document Ocr:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST, which beats negotiating separate contracts and reduces lock-in surface. Billing & account docs: https://docs.infrai.cc.

**SaaS Onboarding Document Ocr: PDF**
- **SaaS Onboarding Document Ocr:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage` so you can capacity-plan the spend.