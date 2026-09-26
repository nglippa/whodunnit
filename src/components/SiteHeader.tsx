"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { EngineInfo } from "@/domain/document";
import { Wordmark } from "./brand/Mark";

const NAV = [
  { href: "/", label: "Write" },
  { href: "/voiceprints", label: "Voiceprints" },
] as const;

export function SiteHeader({ engine }: { engine: EngineInfo }) {
  const pathname = usePathname();
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex h-14 max-w-[88rem] items-center gap-6 px-4 sm:px-8">
        <Link href="/" aria-label="Whodunnit, home" className="shrink-0">
          <Wordmark />
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-5 text-[0.875rem]">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative py-1 transition-colors ${active ? "text-ink" : "text-ink-soft hover:text-ink"}`}
              >
                {item.label}
                {active && <span aria-hidden className="absolute inset-x-0 -bottom-[17px] h-px bg-ink" />}
              </Link>
            );
          })}
        </nav>
        <p
          className="smallcaps ml-auto hidden text-ink-faint sm:block"
          title={engine.mode === "live" ? `Model: ${engine.model}` : "No model is configured. Reconstruction uses deterministic rules."}
        >
          {engine.mode === "live" ? `Engine · ${engine.model}` : "Demo engine · rules only"}
        </p>
      </div>
    </header>
  );
}
