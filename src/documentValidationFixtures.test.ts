import { describe, expect, it } from "vitest";
import valid from "../fixtures/document-validation/valid.json";
import invalid from "../fixtures/document-validation/invalid.json";
import { PersistenceError, validateDocument } from "./plannerPersistence";

describe("shared document-validation fixtures", () => {
  it.each(valid)("accepts $name", ({ document }) => {
    const before = structuredClone(document);
    expect(() => validateDocument(document)).not.toThrow();
    expect(document).toEqual(before);
  });

  it.each(invalid)("rejects $name", ({ document }) => {
    const before = structuredClone(document);
    expect(() => validateDocument(document)).toThrow(PersistenceError);
    expect(document).toEqual(before);
  });
});
