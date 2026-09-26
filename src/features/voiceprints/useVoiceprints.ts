"use client";

import { useCallback, useEffect, useState } from "react";
import type { Observation, Voiceprint, WritingSample } from "@/domain/voiceprint";
import { getBrowserRepositories } from "@/lib/persistence/browser";
import { words } from "@/lib/analysis/tokenize";
import { rebuildVoiceprint } from "@/lib/voiceprints/aggregate";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Voiceprint CRUD against browser storage. Stats are recomputed on every sample change. */
export function useVoiceprints() {
  const [voiceprints, setVoiceprints] = useState<Voiceprint[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    setVoiceprints(await getBrowserRepositories().voiceprints.list());
    setLoaded(true);
  }, []);

  useEffect(() => {
    // Initial load from browser storage (an external system).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (name: string) => {
      const now = new Date().toISOString();
      const vp: Voiceprint = {
        id: newId(),
        name: name.trim().slice(0, 60) || "My voice",
        description: "",
        sampleCount: 0,
        totalWords: 0,
        stats: null,
        observations: [],
        confidence: 0,
        createdAt: now,
        updatedAt: now,
      };
      await getBrowserRepositories().voiceprints.save(vp);
      await refresh();
      return vp;
    },
    [refresh],
  );

  const rebuild = useCallback(async (id: string) => {
    const repos = getBrowserRepositories();
    const vp = await repos.voiceprints.get(id);
    if (!vp) return;
    const samples = await repos.voiceprints.listSamples(id);
    await repos.voiceprints.save(rebuildVoiceprint(vp, samples, new Date().toISOString()));
  }, []);

  const addSample = useCallback(
    async (voiceprintId: string, title: string, text: string) => {
      const sample: WritingSample = {
        id: newId(),
        voiceprintId,
        title: title.trim().slice(0, 120),
        text: text.trim().slice(0, 40_000),
        wordCount: words(text).length,
        createdAt: new Date().toISOString(),
      };
      await getBrowserRepositories().voiceprints.saveSample(sample);
      await rebuild(voiceprintId);
      await refresh();
    },
    [rebuild, refresh],
  );

  const removeSample = useCallback(
    async (voiceprintId: string, sampleId: string) => {
      await getBrowserRepositories().voiceprints.removeSample(sampleId);
      await rebuild(voiceprintId);
      await refresh();
    },
    [rebuild, refresh],
  );

  const update = useCallback(
    async (vp: Voiceprint, patch: Partial<Pick<Voiceprint, "name" | "description">>) => {
      await getBrowserRepositories().voiceprints.save({ ...vp, ...patch, updatedAt: new Date().toISOString() });
      await refresh();
    },
    [refresh],
  );

  const setModelObservations = useCallback(
    async (vp: Voiceprint, observations: Observation[]) => {
      const measured = vp.observations.filter((o) => o.source === "measured");
      await getBrowserRepositories().voiceprints.save({ ...vp, observations: [...measured, ...observations].slice(0, 20), updatedAt: new Date().toISOString() });
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await getBrowserRepositories().voiceprints.remove(id);
      await refresh();
    },
    [refresh],
  );

  const listSamples = useCallback((id: string) => getBrowserRepositories().voiceprints.listSamples(id), []);

  return { voiceprints, loaded, create, addSample, removeSample, update, remove, listSamples, setModelObservations };
}
