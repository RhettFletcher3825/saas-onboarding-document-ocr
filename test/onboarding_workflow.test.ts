import assert from "node:assert/strict";
import test from "node:test";
import { applyOcrDecision } from "../src/tenant_onboarding.js";

test("moves an onboarding document to searchable after OCR returns text", () => {
  const result = applyOcrDecision(
    { tenantId: "tenant-acme", accountId: "account-42", documentId: "msa-2026" },
    "  Master Services Agreement\nEffective date: 2026-08-29  "
  );

  assert.deepEqual(result, {
    tenantId: "tenant-acme",
    accountId: "account-42",
    documentId: "msa-2026",
    lifecycle: "searchable",
    searchableText: "Master Services Agreement\nEffective date: 2026-08-29"
  });
});

test("routes an empty OCR result to admin review", () => {
  const result = applyOcrDecision(
    { tenantId: "tenant-acme", accountId: "account-42", documentId: "blank-page" },
    "   "
  );

  assert.equal(result.lifecycle, "needs_review");
  assert.equal(result.searchableText, "");
});
