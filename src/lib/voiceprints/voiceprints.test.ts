import { describe, expect, it } from "vitest";
import { styleProfileSchema } from "@/domain/style";
import { voiceprintSchema, type Voiceprint } from "@/domain/voiceprint";
import { computeVoiceprintStats, consistency, describeStats, rebuildVoiceprint, recurringPhrases, volumeConfidence } from "./aggregate";
import { isVoiceprintUsable, voiceprintToProfile } from "./to-profile";

const casualA =
  "I don't love meetings. Honestly? Most of them could be an email. We're all busy, and I'd rather ship. That's the whole point, right? Anyway, here's the plan for this week and what I'd change.";
const casualB =
  "I'm not sure the new tool helps. It's slow. We've tried it twice and I don't think it's worth it. Honestly, the old way was fine. Here's the plan for next quarter, if you're curious.";
const formal =
  "The committee has reviewed the proposal in considerable detail. Its recommendations, which are summarised below, reflect extensive consultation with departmental representatives and external specialists.";

/** Realistic volume: several paragraphs per sample (~350 words each). */
const bulk = (t: string) => Array.from({ length: 8 }, (_, i) => t.replace("this week", `week ${i + 1}`)).join("\n\n");

const emptyVp = (): Voiceprint => ({
  id: "vp1",
  name: "My voice",
  description: "",
  sampleCount: 0,
  totalWords: 0,
  stats: null,
  observations: [{ id: "model-0", text: "Opens with a question.", confidence: 0.6, source: "model" }],
  confidence: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("confidence model", () => {
  it("grows with volume and saturates below 1", () => {
    expect(volumeConfidence(0)).toBe(0);
    expect(volumeConfidence(600)).toBeGreaterThan(0.4);
    expect(volumeConfidence(600)).toBeLessThan(0.6);
    expect(volumeConfidence(5000)).toBeLessThan(1);
  });

  it("rewards consistency across samples and is cautious with one sample", () => {
    expect(consistency([5])).toBe(0.5);
    expect(consistency([5, 5, 5])).toBe(1);
    expect(consistency([1, 9])).toBeLessThan(consistency([4.8, 5.2]));
  });
});

describe("aggregation", () => {
  it("returns null for no usable text", () => {
    expect(computeVoiceprintStats([])).toBeNull();
    expect(computeVoiceprintStats([{ text: "   " }])).toBeNull();
  });

  it("measures real differences between a casual and a formal author", () => {
    const casual = computeVoiceprintStats([{ text: casualA }, { text: casualB }])!;
    const stiff = computeVoiceprintStats([{ text: formal }])!;
    expect(casual.stats.vocabulary.contractionRate.value).toBeGreaterThan(5);
    expect(stiff.stats.vocabulary.contractionRate.value).toBe(0);
    expect(casual.stats.sentences.meanLength.value).toBeLessThan(stiff.stats.sentences.meanLength.value);
    expect(casual.stats.sentences.questionRate.value).toBeGreaterThan(0);
  });

  it("finds phrases shared across samples, not within one", () => {
    expect(recurringPhrases([casualA, casualB])).toContain("here's the plan for");
    expect(recurringPhrases([casualA])).toEqual([]);
    // One phrase, not a pile of its overlapping fragments.
    expect(recurringPhrases([casualA, casualB]).filter((p) => p.includes("plan"))).toHaveLength(1);
  });

  it("declines to describe habits from too little text", () => {
    const { stats } = computeVoiceprintStats([{ text: casualA }, { text: casualB }])!;
    expect(describeStats(stats)).toEqual([]);
  });

  it("describes only habits it measured, each with a confidence", () => {
    const { stats } = computeVoiceprintStats([{ text: bulk(casualA) }, { text: bulk(casualB) }])!;
    const obs = describeStats(stats);
    expect(obs.map((o) => o.id)).toContain("contractions");
    expect(obs.every((o) => o.source === "measured" && o.confidence > 0 && o.confidence <= 1)).toBe(true);
  });
});

describe("rebuildVoiceprint", () => {
  it("produces a schema-valid voiceprint and keeps model observations", () => {
    const vp = rebuildVoiceprint(emptyVp(), [
      { id: "s1", voiceprintId: "vp1", title: "", text: casualA, wordCount: 0, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "s2", voiceprintId: "vp1", title: "", text: casualB, wordCount: 0, createdAt: "2026-01-01T00:00:00.000Z" },
    ], "2026-02-01T00:00:00.000Z");
    expect(voiceprintSchema.safeParse(vp).success).toBe(true);
    expect(vp.sampleCount).toBe(2);
    expect(vp.observations.some((o) => o.source === "model")).toBe(true);
    expect(vp.updatedAt).toBe("2026-02-01T00:00:00.000Z");
  });

  it("clears stats when all samples are removed", () => {
    const vp = rebuildVoiceprint(emptyVp(), [], "2026-02-01T00:00:00.000Z");
    expect(vp.stats).toBeNull();
    expect(vp.confidence).toBe(0);
  });
});

describe("voiceprintToProfile", () => {
  it("maps measured habits into a valid StyleProfile", () => {
    const long = [bulk(casualA), bulk(casualB), bulk(casualA.replace("meetings", "standups"))];
    const vp = rebuildVoiceprint(
      emptyVp(),
      long.map((text, i) => ({ id: `s${i}`, voiceprintId: "vp1", title: "", text, wordCount: 0, createdAt: "2026-01-01T00:00:00.000Z" })),
      "2026-02-01T00:00:00.000Z",
    );
    const p = voiceprintToProfile(vp);
    expect(styleProfileSchema.safeParse(p).success).toBe(true);
    expect(p.kind).toBe("voiceprint");
    expect(p.contractions).toBe("prefer");
  });

  it("falls back to neutral defaults when nothing has been measured", () => {
    const p = voiceprintToProfile(emptyVp());
    expect(p.contractions).toBe("allow");
    expect(p.sentenceLengthMean).toBe(17);
    expect(isVoiceprintUsable(emptyVp())).toBe(false);
  });
});
