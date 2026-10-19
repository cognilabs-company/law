"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logApiError } from "@/lib/http";
import { normCreationJourney, peekCreationJourney, rememberCreationJourney, saveCreationJourney, type StudioCreationJourney } from "@/lib/services/studio";
import { studioEventJourneyId, studioEventObjectId, useStudioLive } from "../live";
import { getCreationJourney, isJourneyEvent, runJourneyAction, type JourneyAction } from "./journeyApi";
import { isFullJourneyPayload, isOlderJourney, mergeJourney, stepsKey, unionSteps } from "./model";
import { journeyEventData } from "./useCreationJourneys";

export type JourneyPatch = { completedSteps: string[]; currentStep: string; context: Record<string, unknown> };

export type WizardJourney = {
  phase: "loading" | "ready" | "missing" | "error";
  journey: StudioCreationJourney | null;
  error: unknown;
  remoteChanged: boolean;
  adopt: () => void;
  patch: (input: JourneyPatch) => Promise<StudioCreationJourney | null>;
  patching: boolean;
  patchError: unknown;
  retryPatch: () => Promise<StudioCreationJourney | null>;
  act: (action: JourneyAction) => Promise<StudioCreationJourney | null>;
  acting: JourneyAction | "";
  actError: unknown;
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
  const [acting, setActing] = useState<JourneyAction | "">("");
  const [actError, setActError] = useState<unknown>(null);
  const journeyRef = useRef<StudioCreationJourney | null>(load.journey);
  const sentRef = useRef<string>("");
  const failedRef = useRef<JourneyPatch | null>(null);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const patchingRef = useRef(false);
  const actingRef = useRef(false);
  const firstDone = useRef(false);

  useEffect(() => {
    journeyRef.current = load.journey;
  });

  const accept = useCallback((next: StudioCreationJourney) => {
    const merged = mergeJourney(journeyRef.current, next);
    journeyRef.current = merged;
    rememberCreationJourney(merged);
    setCandidate(null);
    setLoad((s) => ({ ...s, journey: merged, error: null, done: true }));
    return merged;
  }, []);

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
    if (remote === stepsKey(local) || remote === sentRef.current || merged.status !== local.status) {
      journeyRef.current = merged;
      setLoad((s) => ({ ...s, journey: merged, error: null, done: true }));
      return;
    }
    setCandidate(merged);
  }, []);

  const lookup = useCallback(
    (initial: boolean) => {
      const my = ++seq.current;
      getCreationJourney(id)
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
          logApiError("studio.journeys.get", e);
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
    if (!isJourneyEvent(e.event)) return;
    const d = journeyEventData(e);
    const full = isFullJourneyPayload(d);
    const jid = studioEventJourneyId(e) || (full ? normCreationJourney(d).id : "");
    if (jid !== id) return;
    if (full) {
      const j = normCreationJourney(d);
      consider(j.id ? j : { ...j, id });
    } else lookupSoon();
  });

  const send = useCallback(
    async (raw: JourneyPatch): Promise<StudioCreationJourney | null> => {
      if (patchingRef.current) return null;
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
        return merged;
      } catch (e) {
        logApiError("studio.journeys.patch", e);
        failedRef.current = input;
        setPatchError(e);
        return null;
      } finally {
        patchingRef.current = false;
        setPatching(false);
      }
    },
    [id],
  );

  const retryPatch = useCallback(async (): Promise<StudioCreationJourney | null> => {
    const input = failedRef.current;
    if (!input) return journeyRef.current;
    return send(input);
  }, [send]);

  const act = useCallback(
    async (action: JourneyAction): Promise<StudioCreationJourney | null> => {
      if (actingRef.current || patchingRef.current) return null;
      actingRef.current = true;
      seq.current += 1;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      setActing(action);
      setActError(null);
      try {
        const res = await runJourneyAction(id, action);
        failedRef.current = null;
        setPatchError(null);
        firstDone.current = true;
        return accept(res);
      } catch (e) {
        logApiError(`studio.journeys.${action}`, e);
        setActError(e);
        return null;
      } finally {
        actingRef.current = false;
        setActing("");
      }
    },
    [id, accept],
  );

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
    act,
    acting,
    actError,
    reload,
  };
}
