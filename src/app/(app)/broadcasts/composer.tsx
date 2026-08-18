"use client";

import { useState, useTransition } from "react";

import {
  previewBroadcast,
  sendBroadcast,
  type AudiencePreview,
} from "@/app/(app)/broadcasts/actions";
import {
  Alert,
  Badge,
  Button,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { AUDIENCES } from "@/lib/broadcast";

const CHANNELS = [
  { value: "SMS", label: "SMS" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "IN_APP", label: "In-app / push" },
];

export function Composer({
  sections,
}: {
  sections: { id: string; label: string }[];
}) {
  const [audience, setAudience] = useState("ALL_PARENTS");
  const [channel, setChannel] = useState("SMS");
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [sent, setSent] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const payload = {
    audience: audience as never,
    channel: channel as never,
    sectionId: audience === "SECTION_PARENTS" ? sectionId : undefined,
    subject: subject || undefined,
    body,
  };

  function runPreview() {
    setSent(null);
    startTransition(async () => setPreview(await previewBroadcast(payload)));
  }

  function send() {
    startTransition(async () => {
      const result = await sendBroadcast(payload);
      setSent(result);
      if (result.ok) {
        setBody("");
        setSubject("");
        setPreview(null);
      }
    });
  }

  return (
    <div className="space-y-4 px-5 py-5">
      {sent ? (
        <Alert tone={sent.ok ? "success" : "danger"}>{sent.message}</Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Audience" required>
          <Select
            value={audience}
            onChange={(event) => {
              setAudience(event.target.value);
              setPreview(null);
            }}
          >
            {AUDIENCES.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Channel" required>
          <Select
            value={channel}
            onChange={(event) => {
              setChannel(event.target.value);
              setPreview(null);
            }}
          >
            {CHANNELS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {audience === "SECTION_PARENTS" ? (
        <Field label="Class" required>
          <Select
            value={sectionId}
            onChange={(event) => {
              setSectionId(event.target.value);
              setPreview(null);
            }}
          >
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {channel === "EMAIL" ? (
        <Field label="Subject">
          <Input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Parent–teacher meeting"
          />
        </Field>
      ) : null}

      <Field
        label="Message"
        required
        hint="Use {{name}} or {{studentName}} to personalise each message."
      >
        <Textarea
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setPreview(null);
          }}
          rows={5}
          placeholder="Dear {{name}}, the parent–teacher meeting is on Saturday at 9am."
        />
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          disabled={pending || body.trim().length === 0}
          onClick={runPreview}
        >
          {pending ? "Checking…" : "Check audience"}
        </Button>
        <Button
          disabled={pending || !preview?.ok}
          onClick={send}
          title={preview ? undefined : "Check the audience first"}
        >
          Send broadcast
        </Button>
      </div>

      {preview ? (
        <div className="rounded-[var(--radius-base)] border border-border bg-surface-muted px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={preview.reachable > 0 ? "success" : "danger"}>
              {preview.reachable} reachable
            </Badge>
            {preview.unreachable > 0 ? (
              <Badge tone="warning">{preview.unreachable} unreachable</Badge>
            ) : null}
            {preview.duplicatesCollapsed > 0 ? (
              <Badge tone="info">
                {preview.duplicatesCollapsed} duplicates collapsed
              </Badge>
            ) : null}
            {channel === "SMS" ? (
              <Badge tone={preview.encoding === "UNICODE" ? "warning" : "neutral"}>
                {preview.segments} segment{preview.segments === 1 ? "" : "s"} ·{" "}
                {preview.encoding.toLowerCase()} · {preview.totalSegments} total
              </Badge>
            ) : null}
          </div>

          {channel === "SMS" && preview.encoding === "UNICODE" ? (
            <p className="mt-2 text-xs text-warning">
              A non-Latin character or emoji forces Unicode encoding, cutting
              each segment from 160 to 70 characters. This message costs more
              to send than its length suggests.
            </p>
          ) : null}

          {preview.sampleUnreachable.length > 0 ? (
            <div className="mt-2">
              <p className="text-[11px] font-medium text-muted uppercase">
                Cannot be reached
              </p>
              <ul className="mt-1 space-y-0.5">
                {preview.sampleUnreachable.map((entry) => (
                  <li key={entry} className="text-xs text-muted">
                    {entry}
                  </li>
                ))}
                {preview.unreachable > preview.sampleUnreachable.length ? (
                  <li className="text-xs text-muted">
                    … and {preview.unreachable - preview.sampleUnreachable.length} more
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="text-xs text-muted">
        A guardian with several children receives one message, not one per
        child. Recipients with no contact detail for the chosen channel are
        listed rather than silently skipped.
      </p>
    </div>
  );
}
