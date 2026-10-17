export type SxHue = "blue" | "violet" | "jade" | "cyan" | "amber" | "crimson" | "orange" | "teal" | "iris" | "plum";

export const HUES: readonly SxHue[] = ["blue", "violet", "jade", "cyan", "amber", "crimson", "orange", "teal", "iris", "plum"];

export const GROUP_HUE: Readonly<Record<string, SxHue>> = {
  services_packages: "blue",
  documents_texts: "violet",
  process_quality: "jade",
  communications: "cyan",
  finance_tariffs: "amber",
  security_access: "crimson",
  operations: "orange",
  integrations: "teal",
  system_reference: "iris",
  advertising: "plum",
};

export function groupHue(key: string, order: number): SxHue {
  if (Object.prototype.hasOwnProperty.call(GROUP_HUE, key)) return GROUP_HUE[key];
  const n = Number.isFinite(order) ? Math.floor(order) : 1;
  return HUES[(Math.max(1, n) - 1) % HUES.length];
}
