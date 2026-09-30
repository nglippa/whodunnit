/** Reproduce model input for synthetic scope controls; never calls a provider. */
import { readFileSync } from "node:fs";
import { PRESETS } from "@/domain/style";
import { getPrompt } from "@/lib/prompts";
import { buildRewritePlan } from "@/lib/reconstruction/rewrite-plan";
import { semanticRequest } from "@/lib/reconstruction/semantic-review";
import { RECONSTRUCTION_V6 } from "@/lib/reconstruction/strategies";

const version = process.argv[2] === "v3" ? 3 : 2;
const controls = JSON.parse(readFileSync("data/fixtures/semantic-review-development/substantive-controls.json", "utf8")) as { id: string; text: string }[];
const requests = controls.map((c) => ({ id: c.id, request: semanticRequest({ source: c.text, profile: PRESETS.natural }, buildRewritePlan({ source: c.text, profile: PRESETS.natural }, RECONSTRUCTION_V6)) }));
process.stdout.write(JSON.stringify({ contractVersion: `semantic-review.v${version}`, system: getPrompt({ id: "semantic-review", version }).system, requests }, null, 2) + "\n");
