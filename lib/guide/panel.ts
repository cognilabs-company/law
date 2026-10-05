const EVT = "lexgo:instructor-open";

export type InstructorOpen = { text?: string; send?: boolean };

export function openInstructor(detail: InstructorOpen = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<InstructorOpen>(EVT, { detail }));
}

export function onInstructorOpen(fn: (detail: InstructorOpen) => void): () => void {
  const handler = (e: Event) => fn((e as CustomEvent<InstructorOpen>).detail ?? {});
  window.addEventListener(EVT, handler);
  return () => window.removeEventListener(EVT, handler);
}
