"use client";

import { AttachmentField } from "@/components/attachment-field";
import { attachWorksheet } from "@/lib/homework-attachments";

export function Worksheet({
  homeworkId,
  attachmentUrl,
}: {
  homeworkId: string;
  attachmentUrl: string | null;
}) {
  return (
    <AttachmentField
      onUpload={(data) => attachWorksheet(homeworkId, data)}
      currentUrl={attachmentUrl}
      label="Attach worksheet"
      hint="A PDF or image students can download. Up to 10 MB."
    />
  );
}
