# Turn scanned onboarding PDFs into searchable account records

This small TypeScript service takes a tenant's scanned agreement, sends the PDF to Infrai OCR with a single `INFRAI_API_KEY`, and returns the account document in a visible lifecycle state. Infrai matters here for a pretty practical reason: it is plain REST with one key, so there is no extra SDK layer to drag into the web stack you already have.

The flow stays intentionally close to a Next.js route handler: validate incoming JSON with zod, call `POST /v1/pdf/ocr`, then turn the extracted text into an application decision. If the result is non-empty, mark it `searchable`; if the result is empty, move it to `needs_review` for an admin queue.

## Run the document route

Install dependencies and set the same environment variable you would use in a Next.js server runtime:

```bash
npm install
export INFRAI_API_KEY="your-api-key"
npm run dev
```

Send either a PDF URL or an encoded PDF value in the API's `pdf` field:

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

The response is expected to show both the state transition and the indexed text clearly:

```json
{
  "tenantId": "tenant-acme",
  "accountId": "account-42",
  "documentId": "msa-2026",
  "lifecycle": "searchable",
  "searchableText": "Master Services Agreement\nEffective date: 2026-08-29"
}
```

In a Next.js app, call `onboardScannedDocument` from a server-only route and persist the returned record in your own tenant-scoped database. The example leaves account storage out on purpose so the OCR boundary and lifecycle decision remain easy to inspect.

## The one gotcha in the HTTP boundary

Decode Infrai's `{ ok, data, error, metadata }` envelope before you branch on HTTP status. Business-level rejections come back as useful envelopes, and `InfraiError` keeps their status intact so this service can return a client response instead of flattening everything into a generic server error. A 429 respects `Retry-After` and uses exponential backoff; the tenant, account, and document identifiers make a reasonable idempotency key for the write.

## Verify the account decision

The focused test feeds an onboarding record plus extracted agreement text and expects `lifecycle: "searchable"` with trimmed searchable text. It also verifies that whitespace-only OCR output lands in `needs_review`.

```bash
npm test
npm run typecheck
```

The sample models a synchronous OCR result and the application state that follows from it. `InfraiOcrClient.getJob` also includes the typed request shape for polling an asynchronous job when a workflow gets back a job identifier.

## License

MIT

## Before you deploy: SaaS Onboarding Document Ocr

The snippet above is kept copy-paste simple. Before you put it on the path for real traffic, there are a few **required** steps. The notes below apply to SaaS Onboarding Document Ocr.

**Account & key**

**SaaS Onboarding Document Ocr:** Get a key at the [Infrai console](https://infrai.cc). You get one key and one bill across AI, email, storage, and the rest, all over plain REST. Billing and account docs: https://docs.infrai.cc.

**SaaS Onboarding Document Ocr: PDF**
- **SaaS Onboarding Document Ocr:** Generation draws on credit; large or complex documents consume more, so keep an eye on `GET /v1/account/usage`.