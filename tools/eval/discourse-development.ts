/** Deterministic development corpus only. Never loads evaluation holdout data. */
import { readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { developmentCorpusSchema, evaluateDevelopmentCorpus } from "@/lib/discourse/development-eval";

const directory = resolve(process.cwd(), "data/fixtures/discourse-development");
try {
  const files = readdirSync(directory).filter((name) => name.endsWith(".json")).sort();
  if (!files.length) throw new Error("No development fixtures");
  const cases = files.flatMap((name) => developmentCorpusSchema.parse(JSON.parse(readFileSync(join(directory, name), "utf8"))));
  process.stdout.write(`${JSON.stringify({ files: files.length, ...evaluateDevelopmentCorpus(cases) })}\n`);
} catch (error) {
  // Zod issues and parser errors may contain raw fixture values. Emit only a fixed code.
  const code = error instanceof Error && error.message === "No development fixtures" ? "EMPTY_CORPUS" : "INVALID_OR_UNREADABLE_CORPUS";
  process.stderr.write(`${JSON.stringify({ error: code })}\n`);
  process.exitCode = 1;
}
