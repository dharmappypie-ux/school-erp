/**
 * Image upload validation.
 *
 * Pure checks, separated from the filesystem write so they can be tested and
 * so the rules are stated in one place. Every one of them exists because the
 * alternative is a hole: an uploaded file is attacker-controlled input.
 */

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

/** Allowed types, mapped to the extension actually written to disk. */
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface UploadValidation {
  ok: boolean;
  reason?: string;
  extension?: string;
}

/**
 * Validates a declared file type and size.
 *
 * The declared MIME type is not trusted on its own — `sniffImageType` below
 * checks the actual bytes — but rejecting early avoids reading a 500 MB file
 * into memory just to discover it is not an image.
 */
export function validateImageUpload(file: {
  type: string;
  size: number;
  name?: string;
}): UploadValidation {
  if (file.size === 0) {
    return { ok: false, reason: "That file is empty." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      reason: `That image is ${mb} MB. The limit is ${MAX_IMAGE_BYTES / (1024 * 1024)} MB.`,
    };
  }

  const extension = ALLOWED_IMAGE_TYPES[file.type];
  if (!extension) {
    return {
      ok: false,
      reason: "Only JPEG, PNG and WebP images are accepted.",
    };
  }

  return { ok: true, extension };
}

/**
 * Identifies an image from its leading bytes.
 *
 * A file claiming `image/png` can contain anything at all, so the magic number
 * is the real check. Returns null for anything not recognised, which the
 * caller must treat as a rejection.
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((byte, index) => bytes[index] === byte)) {
    return "image/png";
  }

  // WebP: "RIFF" .... "WEBP"
  const riff = [0x52, 0x49, 0x46, 0x46];
  const webp = [0x57, 0x45, 0x42, 0x50];
  if (
    riff.every((byte, index) => bytes[index] === byte) &&
    webp.every((byte, index) => bytes[index + 8] === byte)
  ) {
    return "image/webp";
  }

  return null;
}

/**
 * A safe on-disk filename.
 *
 * Built entirely from the record id and a server-chosen extension — the
 * uploader's filename is never used, so `../../etc/passwd` and friends cannot
 * escape the upload directory.
 */
export function safeImageName(recordId: string, extension: string): string {
  const id = recordId.replace(/[^a-zA-Z0-9_-]/g, "");
  const ext = extension.replace(/[^a-z0-9]/g, "");
  if (!id || !ext) {
    throw new Error("Refusing to build a filename from unsafe input");
  }
  // A cache-busting suffix, so replacing a photo is visible immediately.
  return `${id}-${Date.now().toString(36)}.${ext}`;
}

// ---------------------------------------------------------------------------
// Documents (worksheets, and work handed in as a scan or photo)
//
// Same defence as images — declared type checked against a whitelist, then the
// bytes sniffed to confirm the file really is what it claims. A worksheet is
// usually a PDF and handed-in work is usually a phone photo, so both are
// allowed; anything that a browser might execute is not.

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Recognises a document from its leading bytes.
 *
 * Uploads are served from the app's own origin, so a file that a browser would
 * render as markup is a stored-XSS vector. Sniffing means a .pdf that is really
 * an HTML page is refused, however the client labelled it.
 */
export function sniffDocumentType(bytes: Uint8Array): string | null {
  // PDF: "%PDF-"
  const pdf = [0x25, 0x50, 0x44, 0x46, 0x2d];
  if (bytes.length >= 5 && pdf.every((byte, index) => bytes[index] === byte)) {
    return "application/pdf";
  }
  return sniffImageType(bytes);
}

export function validateDocumentUpload(file: {
  type: string;
  size: number;
}): UploadValidation {
  if (file.size === 0) {
    return { ok: false, reason: "That file is empty." };
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return {
      ok: false,
      reason: `Files must be ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB or smaller.`,
    };
  }

  const extension = ALLOWED_DOCUMENT_TYPES[file.type];
  if (!extension) {
    return {
      ok: false,
      reason: "Attach a PDF or an image (JPEG, PNG or WebP).",
    };
  }

  return { ok: true, extension };
}

/**
 * A filename built only from characters we chose.
 *
 * The user's own filename is never used: it is the classic path-traversal
 * vector, and a name like `../../server.js` must not be able to reach the
 * filesystem call.
 */
export function safeFileName(recordId: string, extension: string): string {
  return safeImageName(recordId, extension);
}
