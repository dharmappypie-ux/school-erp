"use client";

import { addBook, issueBook } from "@/app/(app)/library/actions";
import { ManageForm } from "@/components/manage-form";

export function AddBook() {
  return (
    <ManageForm
      title="Add a title"
      description="Accession numbers are generated for each copy"
      action={addBook}
      submitLabel="Add to catalogue"
      footnote="Copies are numbered automatically so the sequence has no gaps or duplicates."
      fields={[
        { name: "title", label: "Title", required: true },
        { name: "author", label: "Author", half: true },
        { name: "isbn", label: "ISBN", half: true },
        { name: "publisher", label: "Publisher", half: true },
        { name: "category", label: "Category", placeholder: "Fiction", half: true },
        { name: "language", label: "Language", placeholder: "English", half: true },
        { name: "rackNumber", label: "Rack", half: true },
        { name: "publishYear", label: "Published", type: "number", min: "1400", half: true },
        { name: "price", label: "Price", type: "number", min: "0", step: "0.01", half: true },
        { name: "copies", label: "Copies", type: "number", min: "1", required: true, defaultValue: "1", half: true },
      ]}
    />
  );
}

export function IssueBook({
  copies,
  students,
  staff,
}: {
  copies: { value: string; label: string }[];
  students: { value: string; label: string }[];
  staff: { value: string; label: string }[];
}) {
  return (
    <ManageForm
      title="Issue a copy"
      description="To a student or a staff member"
      action={issueBook}
      submitLabel="Issue"
      footnote="Choose exactly one borrower — the loan has to belong to one person."
      fields={[
        {
          name: "copyId",
          label: "Available copy",
          type: "select",
          required: true,
          options: copies,
          hint: copies.length === 0 ? "Nothing is available to issue." : undefined,
        },
        { name: "studentId", label: "Student", type: "select", options: students },
        { name: "staffId", label: "Or staff member", type: "select", options: staff },
        { name: "days", label: "Loan days", type: "number", min: "1", required: true, defaultValue: "14", half: true },
      ]}
    />
  );
}
