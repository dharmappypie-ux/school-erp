"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface StudentPickerOption {
  id: string;
  name: string;
  admissionNo: string;
  /** "VII" — empty when the student is not enrolled this year. */
  classLevel: string;
  /** "B" — the section within that class. */
  section: string;
  /** Father's name where known; the usual way two "Aadhya Patel"s are told apart. */
  guardianName: string;
}

/**
 * Type-ahead picker for a student.
 *
 * A plain <select> of the whole roll is unusable once a school has three
 * hundred students and four of them are called Aadhya Patel: the only way to
 * tell the duplicates apart is to read something other than the name, and a
 * scrolling option list shows one line per student with no room for it. So this
 * searches across name, admission number, class and guardian, and always
 * renders the disambiguators underneath the name.
 */
export function StudentPicker({
  students,
  name = "studentId",
  required = false,
  error,
  defaultValue = "",
}: {
  students: StudentPickerOption[];
  name?: string;
  required?: boolean;
  error?: string;
  defaultValue?: string;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [selectedId, setSelectedId] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const byId = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students],
  );
  const selected = selectedId ? byId.get(selectedId) : undefined;

  // Classes in the order the server sent them, so the dropdown reads
  // I, II, III … rather than alphabetically (where XII would precede II).
  const classes = useMemo(() => {
    const seen: string[] = [];
    for (const student of students) {
      if (student.classLevel && !seen.includes(student.classLevel)) {
        seen.push(student.classLevel);
      }
    }
    return seen;
  }, [students]);

  // Sections belonging to the chosen class only — picking VII then offering
  // section "D" that exists only in class V would return nothing.
  const sections = useMemo(() => {
    const seen: string[] = [];
    for (const student of students) {
      if (classFilter && student.classLevel !== classFilter) continue;
      if (student.section && !seen.includes(student.section)) {
        seen.push(student.section);
      }
    }
    return seen.sort((left, right) => left.localeCompare(right));
  }, [students, classFilter]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const terms = needle ? needle.split(/\s+/) : [];
    return students.filter((student) => {
      if (classFilter && student.classLevel !== classFilter) return false;
      if (sectionFilter && student.section !== sectionFilter) return false;
      if (terms.length === 0) return true;
      const haystack =
        `${student.name} ${student.admissionNo} ${student.classLevel} ${student.section} ${student.guardianName}`.toLowerCase();
      // Every term must appear somewhere, so "aadhya vii" narrows by both.
      return terms.every((term) => haystack.includes(term));
    });
  }, [students, query, classFilter, sectionFilter]);

  const matches = useMemo(() => filtered.slice(0, 50), [filtered]);
  const matchCount = filtered.length;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const row = listRef.current.children[activeIndex] as
      HTMLElement | undefined;
    row?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function choose(student: StudentPickerOption) {
    setSelectedId(student.id);
    setQuery("");
    setOpen(false);
  }

  function clearSelection() {
    setSelectedId("");
    setQuery("");
    setOpen(true);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => {
        const next = index + step;
        if (next < 0) return matches.length - 1;
        if (next >= matches.length) return 0;
        return next;
      });
      return;
    }
    if (event.key === "Enter" && open) {
      const match = matches[activeIndex];
      if (match) {
        // Otherwise Enter submits the surrounding form with nothing chosen.
        event.preventDefault();
        choose(match);
      }
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={selectedId} />

      {selected ? (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{selected.name}</p>
            <p className="truncate text-[11px] text-muted">
              {[
                selected.admissionNo,
                [selected.classLevel, selected.section]
                  .filter(Boolean)
                  .join(" "),
                selected.guardianName,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="shrink-0 text-[11px] font-medium text-muted underline-offset-2 hover:underline"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label="Search students"
            autoComplete="off"
            value={query}
            placeholder="Search by student name, admission no. or father"
            required={required && selectedId === ""}
            onChange={(event) => {
              setQuery(event.target.value);
              // The list shrinks under typing; keep the highlight in range.
              setActiveIndex(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />

          {classes.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label="Filter by class"
                value={classFilter}
                onChange={(event) => {
                  setClassFilter(event.target.value);
                  // The chosen section may not exist in the new class.
                  setSectionFilter("");
                  setActiveIndex(0);
                  setOpen(true);
                }}
                className="w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              >
                <option value="">All classes</option>
                {classes.map((classLevel) => (
                  <option key={classLevel} value={classLevel}>
                    {classLevel}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by section"
                value={sectionFilter}
                disabled={sections.length === 0}
                onChange={(event) => {
                  setSectionFilter(event.target.value);
                  setActiveIndex(0);
                  setOpen(true);
                }}
                className="w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
              >
                <option value="">All sections</option>
                {sections.map((section) => (
                  <option key={section} value={section}>
                    Section {section}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <p className="text-[11px] text-muted">
            {matchCount === students.length
              ? `${students.length} students`
              : `${matchCount} of ${students.length} students`}
          </p>
        </div>
      )}

      {open && !selected ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-[13px] text-muted">
              {query.trim() ? `No student matches “${query}”` : "No students"}
              {classFilter
                ? ` in class ${classFilter}${sectionFilter ? ` ${sectionFilter}` : ""}`
                : ""}
              .
            </li>
          ) : (
            matches.map((student, index) => (
              <li
                key={student.id}
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  // mousedown, not click: the input's blur would close the list first.
                  event.preventDefault();
                  choose(student);
                }}
                className={`cursor-pointer px-3 py-2 ${
                  index === activeIndex ? "bg-brand/10" : ""
                }`}
              >
                <p className="text-[13px] font-medium">{student.name}</p>
                <p className="text-[11px] text-muted">
                  {[
                    student.admissionNo,
                    [student.classLevel, student.section]
                      .filter(Boolean)
                      .join(" "),
                    student.guardianName,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))
          )}
          {matchCount > matches.length ? (
            <li className="border-t border-border px-3 py-1.5 text-[11px] text-muted">
              Showing {matches.length} of {matchCount} — keep typing to narrow.
            </li>
          ) : null}
        </ul>
      ) : null}

      {error ? <p className="mt-1 text-[11px] text-danger">{error}</p> : null}
    </div>
  );
}
