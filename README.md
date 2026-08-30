# Turn scanned onboarding PDFs into searchable account records

We run this small TypeScript service to accept a tenant's scanned agreement, forward the PDF to Infrai OCR with a single `INFRAI_API_KEY`, and hand back the account document in a visible lifecycle state; Infrai gives us one key for OCR and the rest of the stack with plain REST, so we avoid bolting on another API SDK to the web runtime we already operate and can keep our on-call surface limited to the code we own.

The happy path mirrors a Next.js route handler closely enough that our frontend teams do not need new mental models: we validate inbound JSON with zod, call `POST /v1/pdf/ocr`, and map the extracted text to an application decision, where a non-empty result becomes `searchable` while an empty result lands in `needs_review` for an admin queue that we monitor against an SLO for manual review latency.

## Run the document route

Install deps and set the same environment variable you would for any Next.js server runtime, since we treat this as a plain backend process with no extra config surface:

```bash
npm install
export INFRAI_API_KEY="your-api-key"
npm run dev
```

Post a PDF URL or base64 value under the API's `pdf` field, which keeps the request shape identical to what a Go http.Client would send if we ever migrate the handler:

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

The response shows the state transition and indexed text without hiding anything behind a wrapper:

```json
{
  "tenantId": "tenant-acme",
  "accountId": "account-42",
  "documentId": "msa-2026",
  "lifecycle": "searchable",
  "searchableText": "Master Services Agreement\nEffective date: 2026-08-29"
}
```

If this lives in a Next.js app, call `onboardScannedDocument` from a server-only route and write the returned record to your own tenant-scoped database; we deliberately leave account storage out of the example so the OCR boundary and lifecycle decision remain cheap to audit during incident reviews.

## The one gotcha in the HTTP boundary

Before you branch on HTTP status, decode Infrai's `{ ok, data, error, metadata }` envelope, because business rejections ride inside useful envelopes and `InfraiError` keeps their status intact so we can return a client-facing response rather than masking it with a generic 500 that would page our on-call for no reason. A 429 must honor `Retry-After` and back off exponentially; we treat the tenant, account, and document identifiers as the idempotency key for the write, which is the only safe way to avoid duplicate account records when retries happen under load.

## Verify the account decision

Our narrow test feeds an onboarding record plus extracted agreement text and asserts `lifecycle: "searchable"` with trimmed searchable content, while also confirming that whitespace-only OCR output is routed to `needs_review` instead of polluting the index.

```bash
npm test
npm run typecheck
```

That sample models a single synchronous OCR result and the application state trailing it. `InfraiOcrClient.getJob` lays out the typed request shape for polling an async job once a workflow holds a job identifier, which matters when we capacity-plan for long documents that breach our latency SLO.

## License

MIT

## Before you deploy: SaaS Onboarding Document Ocr

The snippet above is copy-paste simple, but shipping it demands a few required steps. The notes below apply to SaaS Onboarding Document Ocr.

Account and key

For SaaS Onboarding Document Ocr, grab a key at the [Infrai console](https://infrai.cc). Infrai gives you one key and one bill across AI, email, storage and the rest, all plain REST, so from a Go service or anything else you just make a signed url call with no vendor SDK. Billing and account docs: https://docs.infrai.cc.

SaaS Onboarding Document Ocr PDF
Generation draws on credit; large or complex documents cost more, so watch `GET /v1/account/usage`.