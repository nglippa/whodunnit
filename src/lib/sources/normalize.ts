import { createHash } from "node:crypto";
import { normalizedSourceSchema, type NormalizedSource, type SourceSection } from "@/domain/sources";
import type { SourceType } from "@/domain/writing-rules";

/**
 * Every extractor (webpage scrape, local Markdown or text, and later a
 * book-to-skill style chapter set) produces the same NormalizedSource: a list
 * of heading-anchored sections plus a content hash.
 *
 * Source text is untrusted. It is sanitised here (control and zero-width
 * characters removed, HTML comments and tags stripped from Markdown) and is
 * only ever treated as data by the compiler.
 */

const ZERO_WIDTH = /[​-‍⁠﻿]/g;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export function sanitize(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(ZERO_WIDTH, "")
    .replace(CONTROL, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** sha256 of whitespace-normalised content: formatting-only changes do not change the hash. */
export function contentHash(text: string): string {
  const normalised = text.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n\n").trim();
  return createHash("sha256").update(normalised, "utf8").digest("hex");
}

export function slugify(s: string, max = 60): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, max)
      .replace(/-$/, "") || "section"
  );
}

/** Split Markdown into sections at ATX headings. Front matter is dropped. */
export function sectionsFromMarkdown(markdown: string): SourceSection[] {
  const body = sanitize(markdown).replace(/^---\n[\s\S]*?\n---\n/, "");
  const raw: { heading: string; level: number; lines: string[] }[] = [{ heading: "", level: 0, lines: [] }];
  let fence = false;
  for (const line of body.split("\n")) {
    if (/^```/.test(line)) fence = !fence;
    const m = !fence && /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) raw.push({ heading: m[2].replace(/#+\s*$/, "").trim(), level: m[1].length, lines: [] });
    else raw[raw.length - 1].lines.push(line);
  }
  return raw
    .map((s, i) => ({ anchor: `s${i}-${slugify(s.heading || "intro", 50)}`, heading: s.heading, level: s.level, text: s.lines.join("\n").trim() }))
    .filter((s) => s.text || s.heading);
}

export function normalizeMarkdown(input: { id: string; type: SourceType; title: string; url?: string; markdown: string; retrievedAt?: string }): NormalizedSource {
  const sections = sectionsFromMarkdown(input.markdown);
  return normalizedSourceSchema.parse({
    id: input.id,
    type: input.type,
    title: input.title.slice(0, 200),
    url: input.url,
    retrievedAt: input.retrievedAt ?? new Date().toISOString(),
    contentHash: contentHash(sections.map((s) => `${s.heading}\n${s.text}`).join("\n\n")),
    sections: sections.length ? sections : [{ anchor: "s0-intro", heading: "", level: 0, text: "(empty)" }],
  });
}

/** Plain text: paragraphs become one section; lines ending with ":" and short title-like lines become headings. */
export function normalizeText(input: { id: string; title: string; text: string; url?: string }): NormalizedSource {
  const md = sanitize(input.text)
    .split("\n")
    .map((l) => (/^[A-Z][^.!?]{2,80}:$/.test(l.trim()) ? `## ${l.trim().replace(/:$/, "")}` : l))
    .join("\n");
  return normalizeMarkdown({ id: input.id, type: "text", title: input.title, url: input.url, markdown: md });
}

/** Output of tools/source-ingestion/scrape.py. */
export interface ScrapeRecord {
  url: string;
  finalUrl: string;
  title: string;
  retrievedAt: string;
  contentHash: string;
  markdown: string;
  cache: "hit" | "miss" | "refreshed" | "unchanged";
  robots: string;
}

export function normalizeScrape(id: string, rec: ScrapeRecord): NormalizedSource {
  return normalizeMarkdown({ id, type: "webpage", title: rec.title, url: rec.url, markdown: rec.markdown, retrievedAt: rec.retrievedAt });
}
