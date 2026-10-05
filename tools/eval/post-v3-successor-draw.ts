import { createHash } from "node:crypto";

// Pure arithmetic for the committed successor registration. This module has no
// network or file access and deliberately returns an index, not an effort value.
const DOMAIN = Buffer.from("whodunnit-post-v3-successor-effort-v1", "utf8");
const LEVEL_COUNT = 5;
const ACCEPT_BELOW = Math.floor(2 ** 32 / LEVEL_COUNT) * LEVEL_COUNT;

export interface DrawIndexProof {
  readonly counter: number;
  readonly firstUint32: number;
  readonly index: number;
}

export function mapPulseOutputToIndex(outputValueHex: string): DrawIndexProof {
  if (!/^[0-9a-fA-F]{128}$/.test(outputValueHex)) {
    throw new Error("pulse.outputValue must be exactly 64 hex-decoded bytes");
  }
  const pulseBytes = Buffer.from(outputValueHex, "hex");
  for (let counter = 0; counter <= 0xffff_ffff; counter++) {
    const counterBytes = Buffer.alloc(4);
    counterBytes.writeUInt32BE(counter);
    const digest = createHash("sha256")
      .update(DOMAIN)
      .update(Buffer.from([0]))
      .update(pulseBytes)
      .update(counterBytes)
      .digest();
    const firstUint32 = digest.readUInt32BE(0);
    if (firstUint32 < ACCEPT_BELOW) {
      return { counter, firstUint32, index: firstUint32 % LEVEL_COUNT };
    }
  }
  throw new Error("uint32 counter exhausted before an acceptable draw index");
}
