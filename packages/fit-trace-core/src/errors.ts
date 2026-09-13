import type { ValidationWarning } from "./types.ts";

/**
 * Error contract for fit-trace tools.
 *
 * pi signals tool failure by *throwing* from `execute` (returning a value never
 * sets `isError`), so validation and conflict failures are represented as
 * thrown errors. Each error carries a stable `code` and a JSON-serializable
 * payload so the Extension can return readable errors to the LLM.
 */

export interface ValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export class FitTraceError extends Error {
  code: string;
  details: Record<string, unknown>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "FitTraceError";
    this.code = code;
    this.details = details;
  }

  toJSON(): Record<string, unknown> {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export class ValidationError extends FitTraceError {
  issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[] = []) {
    super("VALIDATION_ERROR", message, { issues });
    this.name = "ValidationError";
    this.issues = issues;
  }
}

export class ConflictError extends FitTraceError {
  existingId: string;

  constructor(id: string) {
    super("CONFLICT", `A record with id "${id}" already exists with different content.`, {
      existing_id: id,
    });
    this.name = "ConflictError";
    this.existingId = id;
  }
}

/** Raised when the persisted store contains a record that no longer validates. */
export class CorruptStoreError extends FitTraceError {
  recordIndex: number;

  constructor(index: number, reason: string) {
    const message =
      index >= 0
        ? `Stored workout record at index ${index} is invalid: ${reason}`
        : `Corrupt store: ${reason}`;
    super("CORRUPT_STORE", message, { index, reason });
    this.name = "CorruptStoreError";
    this.recordIndex = index;
  }
}

export function warningsToIssues(warnings: ValidationWarning[]): ValidationIssue[] {
  return warnings.map((w) => ({ code: w.code, message: w.message, path: w.path }));
}
