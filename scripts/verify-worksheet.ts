/**
 * Checks worksheet marking in src/lib/worksheet.ts.
 *
 *   npx tsx scripts/verify-worksheet.ts
 *
 * The line these checks defend: the machine marks multiple choice and nothing
 * else. Auto-marking a written answer by string comparison would fail a correct
 * paraphrase, and a teacher trusting the total would never catch it. Every case
 * below asserts that written work reaches a human.
 */

import {
  autoMarkableShare,
  isAutoMarkable,
  markSubmission,
  validateQuestion,
  type AnswerSpec,
  type QuestionSpec,
} from "../src/lib/worksheet";

let failures = 0;
function check(label: string, passed: boolean, detail = "") {
  console.log(`[${passed ? "  ok  " : " FAIL "}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

const mcq = (id: string, correct: number | null, marks = 1): QuestionSpec => ({
  id,
  type: "MULTIPLE_CHOICE",
  correctOption: correct,
  options: ["A", "B", "C", "D"],
  marks,
});
const text = (id: string, marks = 5): QuestionSpec => ({
  id,
  type: "SHORT_TEXT",
  correctOption: null,
  options: [],
  marks,
});

console.log("\n— what can be marked automatically —");
{
  check("a multiple-choice question with a key is auto-markable", isAutoMarkable(mcq("q1", 2)));
  check(
    "a multiple-choice question with no key is not",
    !isAutoMarkable(mcq("q1", null)),
    "the teacher never said which option is right",
  );
  check(
    "a key pointing outside the options is not trusted",
    !isAutoMarkable({ ...mcq("q1", 9) }),
  );
  check("a written question is never auto-markable", !isAutoMarkable(text("q2")));
}

console.log("\n— marking multiple choice —");
{
  const questions = [mcq("q1", 2, 2), mcq("q2", 0, 2), mcq("q3", 1, 2)];
  const answers: AnswerSpec[] = [
    { questionId: "q1", selectedOption: 2, textAnswer: null },
    { questionId: "q2", selectedOption: 3, textAnswer: null },
    { questionId: "q3", selectedOption: 1, textAnswer: null },
  ];

  const result = markSubmission(questions, answers);
  check("right answers score full marks", result.autoAwarded === 4, `${result.autoAwarded}/6`);
  check("a wrong answer scores zero", result.answers[1].awardedMarks === 0);
  check("correctness is recorded per answer", result.answers[0].isCorrect === true);
  check("nothing needs review on an all-MCQ paper", result.needsReviewCount === 0);
  check("the paper total is reported", result.totalMarks === 6);
}

console.log("\n— written answers always reach a human —");
{
  const questions = [mcq("q1", 1, 2), text("q2", 8)];
  const answers: AnswerSpec[] = [
    { questionId: "q1", selectedOption: 1, textAnswer: null },
    { questionId: "q2", selectedOption: null, textAnswer: "Because water evaporates and condenses." },
  ];

  const result = markSubmission(questions, answers);
  check("the multiple-choice part is marked", result.autoAwarded === 2);
  check(
    "the written answer is not marked",
    result.answers[1].awardedMarks === null && result.answers[1].isCorrect === null,
    "no string comparison is attempted against a model answer",
  );
  check("it is flagged for review", result.answers[1].needsReview);
  check("with a reason the teacher can read", result.answers[1].reason === "written answer");
  check(
    "the marks still resting on the teacher are reported",
    result.pendingMarks === 8,
    "so a total of 2/10 is never mistaken for a finished mark",
  );
  check("the review count is surfaced", result.needsReviewCount === 1);
}

console.log("\n— blanks and gaps —");
{
  const questions = [mcq("q1", 1), text("q2")];
  const result = markSubmission(questions, []);

  check(
    "an unanswered multiple-choice scores zero without review",
    result.answers[0].awardedMarks === 0 && !result.answers[0].needsReview,
    "a blank is decidable, so it should not cost the teacher a click",
  );
  check(
    "an unanswered written question still reaches the teacher",
    result.answers[1].needsReview && result.answers[1].reason === "not answered",
  );
}

{
  // A teacher who forgot the answer key must not get a silent zero.
  const result = markSubmission([mcq("q1", null, 3)], [
    { questionId: "q1", selectedOption: 2, textAnswer: null },
  ]);
  check(
    "a multiple-choice question with no key is sent for review, not failed",
    result.answers[0].needsReview && result.answers[0].reason === "unmarkable question",
    "marking it wrong would penalise the student for the teacher's omission",
  );
  check("its marks count as pending", result.pendingMarks === 3);
}

console.log("\n— an empty paper —");
{
  const result = markSubmission([], []);
  check("nothing to mark yields zeroes, not NaN", result.totalMarks === 0 && result.autoAwarded === 0);
  check("and no review work", result.needsReviewCount === 0);
}

console.log("\n— question validation —");
{
  const base = {
    prompt: "What is the capital of India?",
    type: "MULTIPLE_CHOICE" as const,
    options: ["Delhi", "Mumbai", "Chennai"],
    correctOption: 0,
    marks: 2,
  };

  check("a well-formed question is accepted", validateQuestion(base).ok);
  check("a blank prompt is refused", !validateQuestion({ ...base, prompt: " " }).ok);
  check("zero marks is refused", !validateQuestion({ ...base, marks: 0 }).ok);
  check(
    "one option is refused",
    !validateQuestion({ ...base, options: ["Delhi"], correctOption: 0 }).ok,
  );
  check(
    "a missing answer key is refused",
    !validateQuestion({ ...base, correctOption: null }).ok,
    "otherwise the question silently cannot be auto-marked",
  );
  check(
    "an out-of-range key is refused",
    !validateQuestion({ ...base, correctOption: 7 }).ok,
  );
  check(
    "duplicate options are refused",
    !validateQuestion({ ...base, options: ["Delhi", "delhi", "Chennai"] }).ok,
    "two identical choices make the key ambiguous",
  );
  check(
    "a blank option among filled ones is refused",
    !validateQuestion({ ...base, options: ["Delhi", "", "Chennai"] }).ok,
  );
  check(
    "a written question needs no options or key",
    validateQuestion({
      prompt: "Explain the water cycle.",
      type: "LONG_TEXT",
      options: [],
      correctOption: null,
      marks: 10,
    }).ok,
  );
}

console.log("\n— how much of a paper is automatic —");
{
  check("all multiple choice is fully automatic", autoMarkableShare([mcq("a", 0), mcq("b", 1)]) === 100);
  check("a mixed paper reports the share", autoMarkableShare([mcq("a", 0), text("b")]) === 50);
  check("an all-written paper is zero", autoMarkableShare([text("a")]) === 0);
  check("an empty paper does not divide by zero", autoMarkableShare([]) === 0);
}

console.log(
  failures === 0
    ? "\nAll worksheet checks passed.\n"
    : `\n${failures} worksheet check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
