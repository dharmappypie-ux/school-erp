"use client";

import { useMemo, useState, useTransition } from "react";

import { saveAttendance } from "@/app/(app)/attendance/actions";
import { Alert, Badge, Button, Td, Th, cn } from "@/components/ui";
import { initials } from "@/lib/format";

type Status = "PRESENT" | "ABSENT" | "LATE" | "HALF_DAY" | "EXCUSED" | "ON_LEAVE";

const OPTIONS: { value: Status; label: string; short: string; className: string }[] = [
  { value: "PRESENT", label: "Present", short: "P", className: "bg-success text-white border-success" },
  { value: "ABSENT", label: "Absent", short: "A", className: "bg-danger text-white border-danger" },
  { value: "LATE", label: "Late", short: "L", className: "bg-warning text-white border-warning" },
  { value: "ON_LEAVE", label: "Leave", short: "LV", className: "bg-info text-white border-info" },
];

export interface SheetStudent {
  studentId: string;
  firstName: string;
  lastName: string | null;
  admissionNo: string;
  rollNumber: string | null;
  status: Status | null;
}

export function AttendanceSheet({
  sectionId,
  date,
  students,
  readOnly,
}: {
  sectionId: string;
  date: string;
  students: SheetStudent[];
  readOnly: boolean;
}) {
  const [marks, setMarks] = useState<Record<string, Status>>(() =>
    Object.fromEntries(
      students.map((student) => [student.studentId, student.status ?? "PRESENT"]),
    ),
  );
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const tally = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const status of Object.values(marks)) {
      counts[status] = (counts[status] ?? 0) + 1;
    }
    return counts;
  }, [marks]);

  const alreadyMarked = students.some((student) => student.status !== null);

  function setAll(status: Status) {
    setMarks(
      Object.fromEntries(students.map((student) => [student.studentId, status])),
    );
  }

  function submit() {
    startTransition(async () => {
      const response = await saveAttendance({
        sectionId,
        date,
        entries: students.map((student) => ({
          studentId: student.studentId,
          status: marks[student.studentId] ?? "PRESENT",
        })),
      });
      setResult({ ok: response.ok, message: response.message });
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">Summary:</span>
          {OPTIONS.map((option) => (
            <Badge
              key={option.value}
              tone={
                option.value === "PRESENT" ? "success"
                : option.value === "ABSENT" ? "danger"
                : option.value === "LATE" ? "warning"
                : "info"
              }
            >
              {option.label} {tally[option.value] ?? 0}
            </Badge>
          ))}
          {alreadyMarked ? (
            <span className="text-muted">· already recorded, editing</span>
          ) : null}
        </div>

        {!readOnly ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAll("PRESENT")}
              className="h-8 rounded-[var(--radius-base)] border border-border-strong px-3 text-xs font-medium hover:bg-surface-hover"
            >
              Mark all present
            </button>
            <Button size="sm" onClick={submit} disabled={pending}>
              {pending ? "Saving…" : "Save attendance"}
            </Button>
          </div>
        ) : null}
      </div>

      {result ? (
        <div className="px-5 pt-4">
          <Alert tone={result.ok ? "success" : "danger"}>{result.message}</Alert>
        </div>
      ) : null}

      <div className="scroll-slim w-full overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr>
              <Th className="w-16">Roll</Th>
              <Th>Student</Th>
              <Th className="text-right">Attendance</Th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => {
              const current = marks[student.studentId];
              return (
                <tr key={student.studentId} className="hover:bg-surface-hover">
                  <Td className="numeric text-muted">{student.rollNumber ?? "—"}</Td>
                  <Td>
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-[10px] font-semibold text-brand">
                        {initials(student.firstName, student.lastName)}
                      </span>
                      <span>
                        <span className="block font-medium">
                          {student.firstName} {student.lastName}
                        </span>
                        <span className="block font-mono text-[11px] text-muted">
                          {student.admissionNo}
                        </span>
                      </span>
                    </span>
                  </Td>
                  <Td>
                    <div
                      className="flex justify-end gap-1"
                      role="radiogroup"
                      aria-label={`Attendance for ${student.firstName} ${student.lastName ?? ""}`}
                    >
                      {OPTIONS.map((option) => {
                        const active = current === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            aria-label={option.label}
                            title={option.label}
                            disabled={readOnly}
                            onClick={() =>
                              setMarks((previous) => ({
                                ...previous,
                                [student.studentId]: option.value,
                              }))
                            }
                            className={cn(
                              "h-7 w-9 rounded-[var(--radius-base)] border text-[11px] font-semibold transition-colors disabled:opacity-50",
                              active
                                ? option.className
                                : "border-border-strong text-muted hover:bg-surface-hover",
                            )}
                          >
                            {option.short}
                          </button>
                        );
                      })}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
