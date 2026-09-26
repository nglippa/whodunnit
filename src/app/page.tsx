import { Workspace } from "@/features/editor/Workspace";
import { connection } from "next/server";
import { getEngineInfo } from "@/lib/ai";

export default async function Home() {
  await connection();
  return (
    <>
      <div className="mx-auto max-w-[88rem] px-4 pt-10 pb-6 sm:px-8 sm:pt-14">
        <h1 className="max-w-3xl font-serif text-[2rem] leading-[1.15] tracking-[-0.015em] text-ink sm:text-[2.6rem]">
          Your thoughts. <em className="text-accent">Your voice.</em>
        </h1>
        <p className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-soft">
          Paste prose that reads as if nobody wrote it. Whodunnit rebuilds how it is said, keeps what it says, and shows you
          what changed and whether any fact moved.
        </p>
      </div>
      <Workspace engine={getEngineInfo()} />
    </>
  );
}
