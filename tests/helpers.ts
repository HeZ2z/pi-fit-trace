import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/** Load a JSON fixture from /fixtures by file name. */
export async function loadFixture<T = unknown>(name: string): Promise<T> {
  const path = fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
  return JSON.parse(await readFile(path, "utf8")) as T;
}
