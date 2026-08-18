/**
 * Broadcast audience resolution and message sizing.
 *
 * Pure, so the compose screen's preview and the send path agree exactly on who
 * receives a message and what it will cost. A preview that disagrees with the
 * send is worse than no preview at all.
 */

export type Channel = "EMAIL" | "SMS" | "WHATSAPP" | "PUSH" | "IN_APP";

export type AudienceKey =
  | "ALL_PARENTS"
  | "ALL_STUDENTS"
  | "ALL_STAFF"
  | "TEACHING_STAFF"
  | "SECTION_PARENTS"
  | "FEE_DEFAULTERS";

export const AUDIENCES: { key: AudienceKey; label: string; description: string }[] = [
  { key: "ALL_PARENTS", label: "All parents", description: "Every guardian of an active student" },
  { key: "ALL_STUDENTS", label: "All students", description: "Every active student" },
  { key: "ALL_STAFF", label: "All staff", description: "Every active staff member" },
  { key: "TEACHING_STAFF", label: "Teaching staff", description: "Teachers only" },
  { key: "SECTION_PARENTS", label: "Parents of one class", description: "Guardians of a single section" },
  { key: "FEE_DEFAULTERS", label: "Fee defaulters", description: "Guardians with an outstanding balance" },
];

export interface Candidate {
  /** Stable identity used to collapse duplicates. */
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  userId?: string | null;
  /** Per-recipient template variables. */
  variables?: Record<string, string>;
}

export interface ResolvedRecipient extends Candidate {
  /** The address the chosen channel will actually use. */
  destination: string;
}

export interface AudienceResolution {
  recipients: ResolvedRecipient[];
  /** Candidates with no usable address for the chosen channel. */
  unreachable: { candidate: Candidate; reason: string }[];
  /** Duplicates collapsed — one guardian with three children gets one message. */
  duplicatesCollapsed: number;
}

/** Which contact field a channel delivers to. */
export function destinationFor(
  channel: Channel,
  candidate: Candidate,
): { destination: string } | { reason: string } {
  switch (channel) {
    case "EMAIL":
      return candidate.email
        ? { destination: candidate.email }
        : { reason: "No email address on record" };
    case "SMS":
    case "WHATSAPP":
      return candidate.phone
        ? { destination: candidate.phone }
        : { reason: "No phone number on record" };
    case "PUSH":
    case "IN_APP":
      return candidate.userId
        ? { destination: candidate.userId }
        : { reason: "No portal account, so there is nowhere to deliver in-app" };
    default:
      return { reason: "Unsupported channel" };
  }
}

/**
 * Turns candidates into a deliverable recipient list.
 *
 * Two rules matter more than the rest:
 *
 * - **Duplicates collapse by identity.** A guardian with three children in the
 *   school must receive one message, not three. Getting this wrong is the
 *   fastest way to have a school's SMS sender flagged as spam.
 * - **Unreachable candidates are reported, never silently dropped.** "Sent to
 *   400" when 60 had no phone number is a lie the office would act on.
 */
export function resolveAudience(
  candidates: readonly Candidate[],
  channel: Channel,
): AudienceResolution {
  const recipients: ResolvedRecipient[] = [];
  const unreachable: { candidate: Candidate; reason: string }[] = [];
  const seenIds = new Set<string>();
  const seenDestinations = new Set<string>();
  let duplicatesCollapsed = 0;

  for (const candidate of candidates) {
    if (seenIds.has(candidate.id)) {
      duplicatesCollapsed += 1;
      continue;
    }
    seenIds.add(candidate.id);

    const result = destinationFor(channel, candidate);
    if ("reason" in result) {
      unreachable.push({ candidate, reason: result.reason });
      continue;
    }

    // Two guardians sharing a household phone should also collapse.
    const key = result.destination.trim().toLowerCase();
    if (seenDestinations.has(key)) {
      duplicatesCollapsed += 1;
      continue;
    }
    seenDestinations.add(key);

    recipients.push({ ...candidate, destination: result.destination });
  }

  return { recipients, unreachable, duplicatesCollapsed };
}

export interface MessageSize {
  characters: number;
  /** SMS segments; 1 for other channels. */
  segments: number;
  /** GSM-7 alphabet, or Unicode because of an emoji or non-Latin script. */
  encoding: "GSM7" | "UNICODE";
}

// Characters representable in the GSM 03.38 alphabet used for single-rate SMS.
const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENDED = "^{}\\[~]|€";

/**
 * Message length in SMS terms.
 *
 * A single Devanagari character or one emoji forces the whole message to
 * Unicode, cutting capacity from 160 to 70 characters — so a message that
 * looks short can silently cost three times as much to send. The compose
 * screen shows this before anyone presses send.
 */
export function measureMessage(body: string, channel: Channel): MessageSize {
  const characters = [...body].length;

  if (channel !== "SMS") {
    return { characters, segments: 1, encoding: "GSM7" };
  }

  let isGsm7 = true;
  let weighted = 0;
  for (const character of body) {
    if (GSM7.includes(character)) weighted += 1;
    else if (GSM7_EXTENDED.includes(character)) weighted += 2; // escape + char
    else {
      isGsm7 = false;
      break;
    }
  }

  if (!isGsm7) {
    const single = 70;
    const concatenated = 67;
    return {
      characters,
      segments: characters <= single ? 1 : Math.ceil(characters / concatenated),
      encoding: "UNICODE",
    };
  }

  const single = 160;
  const concatenated = 153;
  return {
    characters: weighted,
    segments: weighted <= single ? 1 : Math.ceil(weighted / concatenated),
    encoding: "GSM7",
  };
}

/** Placeholders a template expects but the supplied variables do not cover. */
export function missingVariables(
  body: string,
  variables: Record<string, string>,
): string[] {
  const used = [...body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1]);
  return [...new Set(used)].filter((name) => !(name in variables));
}
