/**
 * The app's single entry point to the shared fit-trace contract.
 *
 * Screens and state modules should import domain types and pure logic from
 * here (or directly from `@pi-fit-trace/core`) — never from the pi extension,
 * which contains Node-only code.
 */
export * from "@pi-fit-trace/core";
export * from "./ids.ts";
