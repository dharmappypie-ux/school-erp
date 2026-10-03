"use client";

import { startThread } from "@/app/(app)/messages/actions";
import { DrawerForm } from "@/components/drawer-form";
import { ManageForm } from "@/components/manage-form";

export function NewMessage({
  recipients,
}: {
  recipients: { value: string; label: string }[];
}) {
  return (
    <DrawerForm
      trigger="New message"
      title="New message"
      description="Start a conversation"
    >
      <ManageForm
        bare
        title="New message"
        action={startThread}
        submitLabel="Send"
        footnote="Opens a private conversation with the person you choose."
        fields={[
          { name: "recipientId", label: "To", type: "select", required: true, options: recipients },
          { name: "subject", label: "Subject", placeholder: "Optional" },
          { name: "body", label: "Message", type: "textarea", required: true, placeholder: "Type your message…" },
        ]}
      />
    </DrawerForm>
  );
}
