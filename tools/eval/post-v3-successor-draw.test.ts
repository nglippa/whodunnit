import assert from "node:assert/strict";
import { test } from "node:test";
import { mapPulseOutputToIndex } from "./post-v3-successor-draw";

// This synthetic fixture is the committed arithmetic vector, not a Beacon pulse.
const SYNTHETIC_PULSE = Buffer.from(Array.from({ length: 64 }, (_, i) => i)).toString("hex");

test("maps the registered synthetic arithmetic vector to its recorded index", () => {
  assert.deepEqual(mapPulseOutputToIndex(SYNTHETIC_PULSE), {
    counter: 0,
    firstUint32: 915_892_842,
    index: 2,
  });
});

test("hex decoding is case-insensitive and input length is exact", () => {
  assert.deepEqual(mapPulseOutputToIndex(SYNTHETIC_PULSE.toUpperCase()), mapPulseOutputToIndex(SYNTHETIC_PULSE));
  for (const invalid of ["", "00", SYNTHETIC_PULSE.slice(2), SYNTHETIC_PULSE + "00", "g".repeat(128)]) {
    assert.throws(() => mapPulseOutputToIndex(invalid), /exactly 64 hex-decoded bytes/);
  }
});

test("result is always one of five indices for synthetic inputs", () => {
  for (let i = 0; i < 32; i++) {
    const synthetic = Buffer.alloc(64, i).toString("hex");
    const proof = mapPulseOutputToIndex(synthetic);
    assert.ok(proof.index >= 0 && proof.index < 5);
    assert.ok(proof.firstUint32 < 4_294_967_295);
  }
});
