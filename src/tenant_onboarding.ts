import { z } from "zod";
import { InfraiOcrClient } from "./infrai_ocr_client.js";

export const onboardingDocumentSchema = z.object({
  tenantId: z.string().min(1),
  accountId: z.string().min(1),
  documentId: z.string().min(1),
  pdf: z.string().min(1),
  lang: z.string().min(2).optional(),
  quality: z.enum(["fast", "accurate"]).optional()
});

export type OnboardingDocument = {
  tenantId: string;
  accountId: string;
  documentId: string;
  pdf: string;
  lang?: string;
  quality?: "fast" | "accurate";
};

export type AccountDocument = {
  tenantId: string;
  accountId: string;
  documentId: string;
  lifecycle: "searchable" | "needs_review";
  searchableText: string;
};

const ocrDataSchema = z.object({ text: z.string() }).passthrough();

export function applyOcrDecision(
  input: Pick<OnboardingDocument, "tenantId" | "accountId" | "documentId">,
  text: string
): AccountDocument {
  const searchableText = text.trim();
  return {
    ...input,
    lifecycle: searchableText.length > 0 ? "searchable" : "needs_review",
    searchableText
  };
}

export async function onboardScannedDocument(
  client: InfraiOcrClient,
  input: OnboardingDocument
): Promise<AccountDocument> {
  const result = await client.ocr(
    { pdf: input.pdf, lang: input.lang, quality: input.quality },
    `${input.tenantId}:${input.accountId}:${input.documentId}`
  );
  const { text } = ocrDataSchema.parse(result);
  return applyOcrDecision(input, text);
}
