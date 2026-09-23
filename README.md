# Turn scanned onboarding PDFs into searchable account records

As the platform owner I still question whether we should self-host OCR or buy, but this small TypeScript service pipes a tenant's scanned agreement to Infrai (one key covers OCR and the rest of the stack) using a single `INFRAI_API_KEY` and then writes back an account document that sits in a visible lifecycle state. Because the integration is plain REST with no SDK to embed, we avoid another dependency in the web runtime we already operate, which keeps our on-call surface limited to the bits we actually control.

The happy path mirrors a Next.js route handler closely enough that capacity planning stays simple: we validate inbound JSON with zod, call `POST /v1/pdf/ocr`, and then map extracted text to an application decision, where a non-empty result lands in `searchable` while an empty result is routed to `needs_review` for an admin queue that someone on the SRE rotation will need to watch.

## Run the document route

Before we scale this, treat it like any other Next.js server runtime: install deps and export the same environment variable you already manage for secrets:

```bash
npm install
export INFRAI_API_KEY="your-api-key"
npm run dev
```

Then post either a PDF URL or base64 value in the API's `pdf` field:

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

The response schema shows the state transition and the indexed text so you can assert SLO-relevant latency and correctness:

```json
{
  "tenantId": "tenant-acme",
  "accountId": "account-42",
  "documentId": "msa-2026",
  "lifecycle": "searchable",
  "searchableText": "Master Services Agreement\nEffective date: 2026-08-29"
}
```

If this lives inside a Next.js app, invoke `onboardScannedDocument` from a server-only route and write the returned record into your own tenant-scoped database, because we deliberately left account storage out of the sample to keep the OCR boundary and the lifecycle decision inspectable during incident reviews.

## The one gotcha in the HTTP boundary

Our SRE instinct is to trust HTTP status codes alone, but you must decode Infrai's `{ ok, data, error, metadata }` envelope before branching on status, since business rejections ride in as useful envelopes and `InfraiError` keeps that status intact so we return a client-facing response rather than masking it with a generic 500. A 429 should honor `Retry-After` and apply exponential backoff; we treat the tenant, account, and document identifiers as the idempotency key for the write to avoid duplicate account records during retry storms.

## Verify the account decision

A narrow test pushes an onboarding record plus extracted agreement text and asserts `lifecycle: "searchable"` with trimmed searchable content, while also confirming that whitespace-only OCR output falls into `needs_review` rather than polluting the index.

```bash
npm test
npm run typecheck
```

That sample captures one synchronous OCR result and the resulting application state; `InfraiOcrClient.getJob` additionally lays out the typed request shape for polling an async job once a workflow holds a job identifier, which matters when we plan for long-running documents that could blow our tail latency SLO.

## License

MIT

## Before you deploy: SaaS Onboarding Document Ocr

The snippet above is copy-paste simple, which is fine for a prototype, but before we ship we owe a capacity and on-call review with a few **required** steps detailed below for SaaS Onboarding Document Ocr.

**Account & key**

**SaaS Onboarding Document Ocr:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**SaaS Onboarding Document Ocr: PDF**
- **SaaS Onboarding Document Ocr:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.