"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logApiError } from "@/lib/http";
import { findCreationJourney, normCreationJourney, peekCreationJourney, rememberCreationJourney, saveCreationJourney, type StudioCreationJourney } from "@/lib/services/studio";
import { JOURNEY_EVENT, studioEventJourneyId, studioEventObjectId, useStudioLive } from "../live";
import { isFullJourneyPayload, isOlderJourney, mergeJourney, stepsKey, unionSteps } from "./model";
import { journeyEventData } from "./useCreationJourneys";

export type JourneyPatch = { completedSteps: string[]; currentStep: string; context: Record<string, unknown> };

export type WizardJourney = {
  phase: "loading" | "ready" | "missing" | "error";
  journey: StudioCreationJourney | null;
  error: unknown;
  remoteChanged: boolean;
  adopt: () => void;
  patch: (input: JourneyPatch) => Promise<boolean>;
  patching: boolean;
  patchError: unknown;
  retryPatch: () => Promise<boolean>;
  reload: () => void;
};

type Load = { journey: StudioCreationJourney | null; error: unknown; done: boolean };

const EVENT_DEBOUNCE_MS = 300;

export function useWizardJourney(id: string): WizardJourney {
  const [load, setLoad] = useState<Load>(() => {
    const seed = peekCreationJourney(id);
    return { journey: seed, error: null, done: false };
  });
  const [attempt, setAttempt] = useState(0);
  const [candidate, setCandidate] = useState<StudioCreationJourney | null>(null);
  const [patching, setPatching] = useState(false);
  const [patchError, setPatchError] = useState<unknown>(null);
  const journeyRef = useRef<StudioCreationJourney | null>(load.journey);
  const sentRef = useRef<string>("");
  const failedRef = useRef<JourneyPatch | null>(null);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const patchingRef = useRef(false);
  const firstDone = useRef(false);

  useEffect(() => {
    journeyRef.current = load.journey;
  });

  const consider = useCallback((next: StudioCreationJourney) => {
    const local = journeyRef.current;
    if (!local) {
      journeyRef.current = next;
      setLoad({ journey: next, error: null, done: true });
      return;
    }
    if (isOlderJourney(next, local)) return;
    const merged = mergeJourney(local, next);
    const remote = stepsKey(merged);
    if (remote === stepsKey(local) || remote === sentRef.current) {
      journeyRef.current = merged;
      setLoad((s) => ({ ...s, journey: merged, error: null, done: true }));
      return;
    }
    setCandidate(merged);
  }, []);

  const lookup = useCallback(
    (initial: boolean) => {
      const my = ++seq.current;
      findCreationJourney(id)
        .then((found) => {
          if (my !== seq.current) return;
          if (initial) firstDone.current = true;
          if (!found) {
            setLoad((s) => ({ ...s, done: true }));
            return;
          }
          if (initial) {
            const merged = mergeJourney(journeyRef.current, found);
            journeyRef.current = merged;
            setLoad({ journey: merged, error: null, done: true });
          } else consider(found);
        })
        .catch((e: unknown) => {
          logApiError("studio.journeys.find", e);
          if (my !== seq.current) return;
          if (initial) firstDone.current = true;
          setLoad((s) => ({ ...s, error: e, done: true }));
        });
    },
    [id, consider],
  );

  useEffect(() => {
    lookup(true);
  }, [lookup, attempt]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const lookupSoon = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      lookup(false);
    }, EVENT_DEBOUNCE_MS);
  };

  useStudioLive((e) => {
    if (e.event === "studio.resync") {
      lookup(!firstDone.current);
      return;
    }
    if (e.event === "studio.object_published") {
      const own = journeyRef.current?.context.studio_object_id;
      const objectId = studioEventObjectId(e);
      if (objectId && typeof own === "string" && own === objectId) lookupSoon();
      return;
    }
    if (e.event !== JOURNEY_EVENT) return;
    const d = journeyEventData(e);
    const full = isFullJourneyPayload(d);
    const jid = studioEventJourneyId(e) || (full ? normCreationJourney(d).id : "");
    if (jid !== id) return;
    if (full) {
      const j = normCreationJourney(d);
      consider(j.id ? j : { ...j, id });
    } else lookupSoon();
  });

  const send = useCallback(async (raw: JourneyPatch): Promise<boolean> => {
    if (patchingRef.current) return false;
    const failed = failedRef.current;
    const input: JourneyPatch =
      failed && failed !== raw ? { completedSteps: unionSteps(failed.completedSteps, raw.completedSteps), currentStep: raw.currentStep, context: { ...failed.context, ...raw.context } } : raw;
    patchingRef.current = true;
    seq.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPatching(true);
    sentRef.current = stepsKey(input);
    try {
      const res = await saveCreationJourney(id, input);
      const local = journeyRef.current;
      const sentJ = local
        ? { ...local, completedSteps: input.completedSteps, currentStep: input.currentStep, context: input.context, completedCount: Math.max(local.completedCount, input.completedSteps.length) }
        : null;
      const merged = mergeJourney(sentJ, res.id ? res : { ...res, id });
      rememberCreationJourney(merged);
      firstDone.current = true;
      journeyRef.current = merged;
      failedRef.current = null;
      setPatchError(null);
      setCandidate(null);
      setLoad((s) => ({ ...s, journey: merged, error: null, done: true }));
      return true;
    } catch (e) {
      logApiError("studio.journeys.patch", e);
      failedRef.current = input;
      setPatchError(e);
      return false;
    } finally {
      patchingRef.current = false;
      setPatching(false);
    }
  }, [id]);

  const retryPatch = useCallback(async (): Promise<boolean> => {
    const input = failedRef.current;
    if (!input) return true;
    return send(input);
  }, [send]);

  const adopt = () => {
    if (!candidate) return;
    journeyRef.current = candidate;
    setLoad((s) => ({ ...s, journey: candidate, error: null, done: true }));
    setCandidate(null);
  };

  const reload = () => {
    firstDone.current = false;
    setLoad((s) => ({ ...s, error: null, done: false }));
    setAttempt((n) => n + 1);
  };

  const phase: WizardJourney["phase"] = load.journey ? "ready" : !load.done ? "loading" : load.error ? "error" : "missing";

  return {
    phase,
    journey: load.journey,
    error: load.error,
    remoteChanged: candidate !== null,
    adopt,
    patch: send,
    patching,
    patchError,
    retryPatch,
    reload,
  };
}
