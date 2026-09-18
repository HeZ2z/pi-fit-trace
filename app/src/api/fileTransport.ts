/**
 * The only browser I/O in the api layer.
 *
 * Kept deliberately tiny so the pure logic (serialization, parsing) never
 * touches the DOM and can be tested without browser quirks.
 */

/** Trigger a file download. No-op-safe in tests where this is mocked. */
export function downloadJson(filename: string, text: string): void {
  if (
    typeof Blob === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    typeof document === "undefined"
  ) {
    throw new Error("Cannot download JSON: browser download APIs are unavailable.");
  }

  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Read a user-selected file as UTF-8 text. */
export async function readTextFile(file: File): Promise<string> {
  if (file === null || file === undefined || typeof file.text !== "function") {
    throw new Error("Cannot read file: the provided value is not a File.");
  }
  return file.text();
}
