"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { Revision, StyleTarget, WhodunnitDocument } from "@/domain/document";
import type { Refinement } from "@/domain/refinement";
import { PRESETS, isPresetId, type StyleProfile } from "@/domain/style";
import type { Voiceprint } from "@/domain/voiceprint";
import { getBrowserRepositories } from "@/lib/persistence/browser";
import { voiceprintToProfile } from "@/lib/voiceprints/to-profile";
import { verifyDeterministic } from "@/lib/verification/verify";
import { ApiError, requestReconstruction, type ReconstructResponse } from "./client";

/**
 * Workspace state: one working document, its source, the current result and
 * the revision trail. Every run is saved as a Revision in the browser.
 */

export type RunKind = "reconstruct" | "refine";

export interface WorkspaceState {
  loaded: boolean;
  documentId: string;
  source: string;
  target: StyleTarget;
  /** The editable result text shown to the author. */
  resultText: string;
  result: ResultMeta | null;
  /** Effective profile of the current result, the base for the next refinement. */
  activeProfile: StyleProfile | null;
  revisions: Revision[];
  currentRevisionId: string | null;
  status: { kind: "idle" } | { kind: "running"; run: RunKind } | { kind: "error"; message: string };
}

type Action =
  | { type: "loaded"; doc: WhodunnitDocument | null; revisions: Revision[] }
  | { type: "source"; value: string }
  | { type: "target"; value: StyleTarget }
  | { type: "resultText"; value: string }
  | { type: "running"; run: RunKind }
  | { type: "succeeded"; result: ReconstructResponse; revision: Revision }
  | { type: "authored"; revision: Revision }
  | { type: "failed"; message: string }
  | { type: "cancelled" }
  | { type: "restore"; revisionId: string }
  | { type: "reset"; documentId: string };

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const initialState = (documentId: string): WorkspaceState => ({
  loaded: false,
  documentId,
  source: "",
  target: { kind: "preset", presetId: "natural" },
  resultText: "",
  result: null,
  activeProfile: null,
  revisions: [],
  currentRevisionId: null,
  status: { kind: "idle" },
});

/** What the result pane needs, whether it came from a fresh run or from history. */
export interface ResultMeta {
  verification: Revision["verification"];
  engine: Revision["engine"];
  profileLabel: string;
  plan: string[];
  changes: string[];
  attempts: number | null;
  fromHistory: boolean;
  /** true while the author's hand edits are being checked in place of the engine's text. */
  editedByHand?: boolean;
}

const metaFromResponse = (r: ReconstructResponse): ResultMeta => ({
  verification: r.verification,
  engine: r.engine,
  profileLabel: r.profile.label,
  plan: r.plan,
  changes: r.changes,
  attempts: r.attempts,
  fromHistory: false,
});

const metaFromRevision = (r: Revision): ResultMeta => ({
  verification: r.verification,
  engine: r.engine,
  profileLabel: r.profileLabel,
  plan: [],
  changes: [],
  attempts: null,
  fromHistory: true,
});

export function reducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case "loaded": {
      if (!action.doc) return { ...state, loaded: true };
      const current = action.revisions.find((r) => r.id === action.doc?.currentRevisionId) ?? null;
      return {
        ...state,
        loaded: true,
        documentId: action.doc.id,
        source: action.doc.source,
        target: action.doc.target,
        revisions: action.revisions,
        currentRevisionId: current?.id ?? null,
        resultText: (current && action.doc.resultDraft) || current?.text || "",
        result: current ? metaFromRevision(current) : null,
        activeProfile: current?.profile ?? null,
      };
    }
    case "source":
      return { ...state, source: action.value };
    case "target":
      return { ...state, target: action.value };
    case "resultText":
      return { ...state, resultText: action.value };
    case "running":
      return { ...state, status: { kind: "running", run: action.run } };
    case "succeeded":
      return {
        ...state,
        status: { kind: "idle" },
        result: metaFromResponse(action.result),
        resultText: action.result.text,
        activeProfile: action.result.profile,
        revisions: [...state.revisions, action.revision],
        currentRevisionId: action.revision.id,
      };
    case "authored":
      return { ...state, revisions: [...state.revisions, action.revision], currentRevisionId: action.revision.id };
    case "failed":
      return { ...state, status: { kind: "error", message: action.message } };
    case "cancelled":
      return { ...state, status: { kind: "idle" } };
    case "restore": {
      const r = state.revisions.find((x) => x.id === action.revisionId);
      if (!r) return state;
      return { ...state, currentRevisionId: r.id, resultText: r.text, result: metaFromRevision(r), activeProfile: r.profile };
    }
    case "reset":
      return { ...initialState(action.documentId), loaded: true };
  }
}

export function resolveProfile(target: StyleTarget, voiceprints: Voiceprint[]): StyleProfile | null {
  if (target.kind === "preset") return isPresetId(target.presetId) ? PRESETS[target.presetId] : null;
  const vp = voiceprints.find((v) => v.id === target.voiceprintId);
  return vp ? voiceprintToProfile(vp) : null;
}

const CURRENT_DOC_KEY = "whodunnit:v1:current-document";

export function useWorkspace(voiceprints: Voiceprint[]) {
  const [state, dispatch] = useReducer(reducer, "pending", initialState);
  const abortRef = useRef<AbortController | null>(null);
  const stateRef = useRef(state);
  // Handlers read the latest state without being recreated on every keystroke.
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Restore the last working document from this browser.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const repos = getBrowserRepositories();
      let id: string | null = null;
      try {
        id = window.localStorage.getItem(CURRENT_DOC_KEY);
      } catch {}
      const doc = id ? await repos.documents.get(id) : null;
      const revisions = doc ? await repos.documents.listRevisions(doc.id) : [];
      if (cancelled) return;
      if (doc) dispatch({ type: "loaded", doc, revisions });
      else dispatch({ type: "reset", documentId: newId() });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Autosave the working document (debounced).
  useEffect(() => {
    if (!state.loaded) return;
    const t = window.setTimeout(() => {
      const now = new Date().toISOString();
      const repos = getBrowserRepositories();
      const current = state.revisions.find((r) => r.id === state.currentRevisionId);
      void repos.documents.get(state.documentId).then((existing) => {
        const doc: WhodunnitDocument = {
          id: state.documentId,
          title: state.source.trim().split(/\s+/).slice(0, 8).join(" ").slice(0, 120),
          source: state.source.slice(0, 20_000),
          target: state.target,
          revisionIds: state.revisions.map((r) => r.id),
          currentRevisionId: state.currentRevisionId,
          resultDraft: current && state.resultText !== current.text ? state.resultText.slice(0, 40_000) : null,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        return repos.documents.save(doc).then(() => {
          try {
            window.localStorage.setItem(CURRENT_DOC_KEY, state.documentId);
          } catch {}
        });
      });
    }, 400);
    return () => window.clearTimeout(t);
  }, [state.loaded, state.documentId, state.source, state.target, state.revisions, state.currentRevisionId, state.resultText]);

  const run = useCallback(
    async (kind: RunKind, change?: Refinement) => {
      const s = stateRef.current;
      if (s.status.kind === "running" || !s.source.trim()) return;
      const baseProfile = kind === "refine" && s.activeProfile ? s.activeProfile : resolveProfile(s.target, voiceprints);
      if (!baseProfile) {
        dispatch({ type: "failed", message: "That style target is no longer available. Pick another." });
        return;
      }
      if (kind === "refine" && (!change || !s.resultText.trim())) return;

      // Preserve the author's hand edits as their own revision before building on them.
      const current = s.revisions.find((r) => r.id === s.currentRevisionId);
      let parentId = s.currentRevisionId;
      if (current && s.resultText.trim() && s.resultText !== current.text) {
        const authored: Revision = {
          ...current,
          id: newId(),
          parentRevisionId: current.id,
          text: s.resultText,
          refinement: null,
          verification: verifyDeterministic(s.source, s.resultText, current.profile),
          editedByAuthor: true,
          createdAt: new Date().toISOString(),
        };
        await getBrowserRepositories().documents.saveRevision(authored);
        dispatch({ type: "authored", revision: authored });
        parentId = authored.id;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      dispatch({ type: "running", run: kind });
      try {
        const result = await requestReconstruction(
          {
            source: s.source,
            profile: baseProfile,
            refinement: kind === "refine" && change ? { current: s.resultText, change } : undefined,
          },
          controller.signal,
        );
        const revision: Revision = {
          id: newId(),
          documentId: s.documentId,
          parentRevisionId: kind === "refine" ? parentId : null,
          text: result.text,
          target: s.target,
          profileLabel: result.profile.label,
          profile: result.profile,
          refinement: kind === "refine" && change ? change : null,
          verification: result.verification,
          engine: result.engine,
          promptVersion: result.promptVersion,
          editedByAuthor: false,
          createdAt: new Date().toISOString(),
        };
        await getBrowserRepositories().documents.saveRevision(revision);
        dispatch({ type: "succeeded", result, revision });
      } catch (err) {
        if (err instanceof ApiError && err.code === "aborted") dispatch({ type: "cancelled" });
        else dispatch({ type: "failed", message: err instanceof Error ? err.message : "Something went wrong." });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [voiceprints],
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "reset", documentId: newId() });
  }, []);

  return { state, dispatch, run, cancel, reset };
}
