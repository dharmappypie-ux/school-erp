"use client";

import { useState, useTransition } from "react";

import { assignSubject, createSubject } from "@/app/(app)/academics/actions";
import {
  Alert,
  Button,
  Field,
  Input,
  Select,
} from "@/components/ui";

export function CurriculumEditor({
  classLevels,
  subjects,
  teachers,
  departments,
}: {
  classLevels: { id: string; name: string }[];
  subjects: { id: string; name: string; code: string }[];
  teachers: { id: string; name: string }[];
  departments: { id: string; name: string }[];
}) {
  const [tab, setTab] = useState<"assign" | "subject">("assign");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Assign form
  const [classLevelId, setClassLevelId] = useState(classLevels[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [teacherId, setTeacherId] = useState("");
  const [weeklyPeriods, setWeeklyPeriods] = useState("5");
  const [maxMarks, setMaxMarks] = useState("100");
  const [passMarks, setPassMarks] = useState("33");

  // Subject form
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [isCoScholastic, setIsCoScholastic] = useState(false);
  const [isElective, setIsElective] = useState(false);

  return (
    <div className="space-y-4 px-5 py-5">
      <div className="flex gap-1.5">
        {(
          [
            ["assign", "Assign to class"],
            ["subject", "New subject"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setResult(null);
            }}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              tab === key
                ? "border-brand bg-brand-soft text-brand"
                : "border-border-strong text-muted hover:bg-surface-hover"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {result ? (
        <Alert tone={result.ok ? "success" : "danger"}>{result.message}</Alert>
      ) : null}

      {tab === "assign" ? (
        <>
          <Field label="Class" required>
            <Select
              value={classLevelId}
              onChange={(event) => setClassLevelId(event.target.value)}
            >
              {classLevels.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Subject" required>
            <Select
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
            >
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name} ({subject.code})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Teacher" hint="Leave blank to schedule the subject unstaffed.">
            <Select
              value={teacherId}
              onChange={(event) => setTeacherId(event.target.value)}
            >
              <option value="">Not assigned</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Periods / week" required hint="0 removes it.">
              <Input
                type="number"
                min="0"
                max="20"
                value={weeklyPeriods}
                onChange={(event) => setWeeklyPeriods(event.target.value)}
                className="numeric"
              />
            </Field>
            <Field label="Max marks" required>
              <Input
                type="number"
                min="1"
                value={maxMarks}
                onChange={(event) => setMaxMarks(event.target.value)}
                className="numeric"
              />
            </Field>
            <Field label="Pass marks" required>
              <Input
                type="number"
                min="0"
                value={passMarks}
                onChange={(event) => setPassMarks(event.target.value)}
                className="numeric"
              />
            </Field>
          </div>

          <Button
            className="w-full"
            disabled={pending || !classLevelId || !subjectId}
            onClick={() =>
              startTransition(async () => {
                setResult(
                  await assignSubject({
                    classLevelId,
                    subjectId,
                    teacherId: teacherId || undefined,
                    weeklyPeriods: Number(weeklyPeriods),
                    maxMarks: Number(maxMarks),
                    passMarks: Number(passMarks),
                  }),
                );
              })
            }
          >
            {pending ? "Saving…" : "Save assignment"}
          </Button>

          <p className="text-xs text-muted">
            Changing the curriculum does not move existing lessons — regenerate
            the timetable afterwards to apply it.
          </p>
        </>
      ) : (
        <>
          <Field label="Subject name" required>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Environmental Studies"
            />
          </Field>

          <Field label="Code" required hint="Upper-cased and stripped to letters and digits.">
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="EVS"
            />
          </Field>

          <Field label="Department">
            <Select
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
            >
              <option value="">Not assigned</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isCoScholastic}
              onChange={(event) => setIsCoScholastic(event.target.checked)}
              className="h-4 w-4 accent-[var(--brand)]"
            />
            Co-scholastic (graded separately, excluded from the percentage)
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isElective}
              onChange={(event) => setIsElective(event.target.checked)}
              className="h-4 w-4 accent-[var(--brand)]"
            />
            Elective
          </label>

          <Button
            className="w-full"
            disabled={pending || name.trim().length < 2 || code.trim().length < 2}
            onClick={() =>
              startTransition(async () => {
                const response = await createSubject({
                  name,
                  code,
                  departmentId: departmentId || undefined,
                  isCoScholastic,
                  isElective,
                });
                setResult(response);
                if (response.ok) {
                  setName("");
                  setCode("");
                }
              })
            }
          >
            {pending ? "Adding…" : "Add subject"}
          </Button>

          <p className="text-xs text-muted">
            A co-scholastic subject is reported on the card but kept out of the
            overall percentage, so a weak Art grade cannot fail a student.
          </p>
        </>
      )}
    </div>
  );
}
