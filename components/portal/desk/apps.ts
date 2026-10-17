import type { ComponentType } from "react";

// What sits on the lawyer's desktop. Every section of the cabinet is an
// app; the everyday ones stand on the desktop, the rest are grouped in
// folders. Each app has its own tile colour and the apps it is used with,
// which its right-click menu offers to open next.

export type DeskNav = { href: string; key: string; Icon: ComponentType<{ className?: string }> };
export type DeskApp = DeskNav & { label: string; locked: boolean };
export type FolderId = "docs" | "market" | "comms" | "account";

export const FOLDERS: { id: FolderId; keys: string[] }[] = [
  { id: "docs", keys: ["documents", "documentRequests", "files"] },
  { id: "market", keys: ["marketplace", "marketplaceOrders", "services", "urgentAssigned"] },
  { id: "comms", keys: ["meetings", "notifications", "support"] },
  { id: "account", keys: ["profile", "subscription", "referrals", "promotion"] },
];

// The tile colours, two stops of a gradient.
export const TILE: Record<string, [string, string]> = {
  dashboard: ["#4F8BFF", "#1D5BE0"],
  cases: ["#F5A524", "#E07B0B"],
  tasks: ["#34C38F", "#119A68"],
  calendar: ["#FF6B6B", "#D93D52"],
  clients: ["#7C6CF2", "#5435D6"],
  chat: ["#22C3E6", "#0A8FC2"],
  ai: ["#B26CF5", "#7A2FD6"],
  assistant: ["#5ED1C1", "#16998A"],
  documents: ["#5B8DEF", "#2D5BC4"],
  documentRequests: ["#6FA8FF", "#3E6FD8"],
  files: ["#F2C14E", "#D59A12"],
  marketplace: ["#2EC4B6", "#12907F"],
  marketplaceOrders: ["#FF8A5B", "#E25A2A"],
  services: ["#9B8CFF", "#6650E6"],
  urgentAssigned: ["#FF5D73", "#D42645"],
  meetings: ["#3DDC97", "#159E66"],
  notifications: ["#FFB547", "#E58A0B"],
  support: ["#4CB8FF", "#1D84D6"],
  profile: ["#8E9BB0", "#5C6A80"],
  subscription: ["#E86BD6", "#B9349F"],
  referrals: ["#FF7AA8", "#E0447A"],
  promotion: ["#FFC93C", "#E89B00"],
};
export const tileOf = (key: string): [string, string] => TILE[key] ?? ["#7F8EA3", "#56657B"];

// Apps a section is used with.
export const RELATED: Record<string, string[]> = {
  dashboard: ["cases", "tasks", "calendar"],
  cases: ["tasks", "documents", "clients"],
  tasks: ["calendar", "cases"],
  calendar: ["meetings", "tasks"],
  clients: ["chat", "cases", "meetings"],
  chat: ["clients", "meetings"],
  ai: ["assistant", "documents"],
  assistant: ["ai", "documents"],
  documents: ["documentRequests", "files", "ai"],
  documentRequests: ["documents", "files"],
  files: ["documents", "cases"],
  marketplace: ["marketplaceOrders", "services"],
  marketplaceOrders: ["marketplace", "chat"],
  services: ["marketplace", "promotion"],
  urgentAssigned: ["cases", "chat"],
  meetings: ["calendar", "clients"],
  notifications: ["support", "tasks"],
  support: ["notifications"],
  profile: ["subscription", "services"],
  subscription: ["promotion", "referrals"],
  referrals: ["subscription"],
  promotion: ["services", "subscription"],
};

export const folderOf = (key: string): FolderId | null => FOLDERS.find((f) => f.keys.includes(key))?.id ?? null;

// What kind of program each section is, so its window looks like the one a
// computer has for that job: a file manager, a calendar, a messenger, a
// to-do list, contacts, a store, settings, an assistant, or the home screen.
// Sections of one kind share a side menu, as one program would.
export type AppKind = "home" | "files" | "calendar" | "comms" | "todo" | "people" | "store" | "settings" | "ai";
export const KINDS: { kind: AppKind; keys: string[] }[] = [
  { kind: "home", keys: ["dashboard"] },
  { kind: "files", keys: ["cases", "documents", "documentRequests", "files"] },
  { kind: "calendar", keys: ["calendar", "meetings"] },
  { kind: "comms", keys: ["chat", "notifications", "support"] },
  { kind: "todo", keys: ["tasks", "urgentAssigned"] },
  { kind: "people", keys: ["clients"] },
  { kind: "store", keys: ["marketplace", "marketplaceOrders", "services"] },
  { kind: "settings", keys: ["profile", "subscription", "referrals", "promotion"] },
  { kind: "ai", keys: ["ai", "assistant"] },
];
export const kindOf = (key: string): AppKind => KINDS.find((k) => k.keys.includes(key))?.kind ?? "home";
