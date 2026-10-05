export type GuideRole = "client" | "lawyer" | "advocate" | "staff";

export type GuideStep = {
  target: string;
  caption: string;
  focus?: boolean;
};

export type GuideSource = "instructor" | "page" | "assistant" | "local";

export type GuideTour = {
  id: string;
  source: GuideSource;
  navigate?: string;
  steps: GuideStep[];
  reply?: string;
};

export type GuidePhase = "idle" | "navigating" | "locating" | "showing" | "missing" | "done";

export type GuideState = {
  phase: GuidePhase;
  tour: GuideTour | null;
  index: number;
  element: HTMLElement | null;
  missing: string[];
  shown: number;
  dir: 1 | -1;
};

export type TargetInfo = { id: string; label: string; kind: string; in_view: boolean };

export type RegistryTarget = { id: string; text: string; route: string; page: string };

export type TourStepDef = { target: string; text: string };

export type GuidePage = {
  id: string;
  match: string[];
  roles?: GuideRole[];
  title?: string;
  tour: TourStepDef[];
  suggestions?: string[];
};
