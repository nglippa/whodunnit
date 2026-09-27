import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { judgeResultSchema } from "@/domain/judge";
import type { CachedJudgeEntry, JudgeCache } from "./judge";
import { EVALUATIONS_DIR } from "./store";

/**
 * Judge results on disk, one file per exact-input key:
 *
 *   .evaluations/judge-cache/<sha256>.json
 *
 * Gitignored with the rest of .evaluations. A corrupt or schema-invalid
 * entry is treated as a miss (and overwritten by the next live call), never
 * as a pass.
 */

const entrySchema = z.object({ result: judgeResultSchema, runId: z.string().nullable(), cachedAt: z.string() }).strict();

export class FileJudgeCache implements JudgeCache {
  readonly dir: string;
  hits = 0;
  misses = 0;
  constructor(root: string, dir = join(EVALUATIONS_DIR, "judge-cache")) {
    this.dir = join(root, dir);
  }

  private path(key: string) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid judge cache key");
    return join(this.dir, `${key}.json`);
  }

  get(key: string): CachedJudgeEntry | null {
    const p = this.path(key);
    if (!existsSync(p)) {
      this.misses++;
      return null;
    }
    try {
      const parsed = entrySchema.safeParse(JSON.parse(readFileSync(p, "utf8")));
      if (parsed.success) {
        this.hits++;
        return parsed.data;
      }
    } catch {
      // fall through: unreadable entries are misses
    }
    this.misses++;
    return null;
  }

  set(key: string, entry: CachedJudgeEntry) {
    mkdirSync(this.dir, { recursive: true });
    // The stored result is the live one; provenance is rewritten on every hit.
    writeFileSync(this.path(key), JSON.stringify(entrySchema.parse(entry), null, 2) + "\n");
  }
}
