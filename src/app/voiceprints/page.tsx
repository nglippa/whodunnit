import type { Metadata } from "next";
import { VoiceprintsView } from "@/features/voiceprints/VoiceprintsView";
import { connection } from "next/server";
import { getEngineInfo } from "@/lib/ai";

export const metadata: Metadata = { title: "Voiceprints" };

export default async function VoiceprintsPage() {
  await connection();
  return <VoiceprintsView engine={getEngineInfo()} />;
}
