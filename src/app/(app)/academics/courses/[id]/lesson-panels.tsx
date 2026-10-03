"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  addResource,
  createLesson,
  deleteLesson,
  deleteResource,
  setCourseStatus,
} from "@/app/(app)/academics/courses/actions";
import { DrawerForm } from "@/components/drawer-form";
import { ManageForm } from "@/components/manage-form";
import { Alert, Button } from "@/components/ui";
import { COURSE_RESOURCE_TYPES, RESOURCE_TYPE_LABEL } from "@/lib/lms";

export function AddLesson({ courseId }: { courseId: string }) {
  return (
    <DrawerForm
      trigger="Add lesson"
      title="Add a lesson"
      description="Lessons are numbered automatically and shown to students in order."
    >
      <ManageForm
        bare
        title="Add a lesson"
        action={createLesson}
        submitLabel="Add lesson"
        hiddenValues={{ courseId }}
        footnote="Write the lesson body in plain text or Markdown. Add resources to it afterwards."
        fields={[
          { name: "title", label: "Lesson title", required: true, placeholder: "What are fractions?" },
          {
            name: "content",
            label: "Lesson content",
            type: "textarea",
            placeholder: "The lesson text students will read. Markdown is supported.",
          },
          {
            name: "videoUrl",
            label: "Video URL",
            placeholder: "https://…",
            hint: "Optional — a link to a lecture video.",
          },
          {
            name: "durationMinutes",
            label: "Duration (min)",
            type: "number",
            min: "0",
            hint: "Optional estimate.",
            half: true,
          },
        ]}
      />
    </DrawerForm>
  );
}

export function AddResource({
  courseId,
  lessons,
}: {
  courseId: string;
  lessons: { value: string; label: string }[];
}) {
  return (
    <DrawerForm
      trigger="Add resource"
      title="Attach a resource"
      description="A link or file for the whole course, or for one lesson."
    >
      <ManageForm
        bare
        title="Attach a resource"
        action={addResource}
        submitLabel="Attach resource"
        hiddenValues={{ courseId }}
        footnote="Only http(s) links are accepted. Upload files to your storage first, then paste the link."
        fields={[
          { name: "title", label: "Title", required: true, placeholder: "Chapter 1 notes" },
          {
            name: "type",
            label: "Type",
            type: "select",
            required: true,
            options: COURSE_RESOURCE_TYPES.map((t) => ({ value: t, label: RESOURCE_TYPE_LABEL[t] })),
            half: true,
          },
          {
            name: "lessonId",
            label: "Lesson",
            type: "select",
            options: lessons,
            hint: "Leave blank to attach to the whole course.",
            half: true,
          },
          { name: "url", label: "URL", required: true, placeholder: "https://…" },
        ]}
      />
    </DrawerForm>
  );
}

/**
 * Publish / unpublish / archive controls. The available actions depend on the
 * course's current status, so a published course offers "Unpublish", not
 * "Publish" again.
 */
export function CourseStatusControls({
  courseId,
  status,
  canPublish,
}: {
  courseId: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  canPublish: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const run = (next: "DRAFT" | "PUBLISHED" | "ARCHIVED") =>
    startTransition(async () => {
      setError(null);
      const result = await setCourseStatus(courseId, next);
      if (result.ok) router.refresh();
      else setError(result.message);
    });

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-2">
        {status !== "PUBLISHED" && canPublish ? (
          <Button size="sm" disabled={pending} onClick={() => run("PUBLISHED")}>
            {pending ? "Working…" : "Publish"}
          </Button>
        ) : null}
        {status === "PUBLISHED" ? (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("DRAFT")}>
            {pending ? "Working…" : "Unpublish"}
          </Button>
        ) : null}
        {status !== "ARCHIVED" ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("ARCHIVED")}>
            Archive
          </Button>
        ) : (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("DRAFT")}>
            Restore
          </Button>
        )}
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}

/** Small inline delete used for both lessons and resources. */
export function DeleteButton({
  kind,
  id,
  label,
}: {
  kind: "lesson" | "resource";
  id: string;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        aria-label={`Delete ${label}`}
        onClick={() =>
          startTransition(async () => {
            if (!window.confirm(`Delete “${label}”? This cannot be undone.`)) return;
            setError(null);
            const result = kind === "lesson" ? await deleteLesson(id) : await deleteResource(id);
            if (result.ok) router.refresh();
            else setError(result.message);
          })
        }
      >
        {pending ? "…" : "Delete"}
      </Button>
      {error ? <span className="text-[11px] text-danger">{error}</span> : null}
    </>
  );
}
