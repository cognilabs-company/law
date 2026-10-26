import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clientStateBody,
  mergeRaSession,
  normRaCommand,
  normRaMeta,
  normRaSession,
  raElementActions,
  raGrantedActions,
  raModeScopes,
  raPhaseOf,
  type RaAck,
  type RaCommand,
} from "@/lib/services/remoteAssist";
import { raActionsFor, raPageOf, raSafeRoute, raSensitivityOf, raSensitivityOfId } from "@/lib/remoteAssist/registry";
import { createRaRunner } from "@/lib/remoteAssist/runner";
import type { RaLive } from "@/lib/remoteAssist/registry";

// The executor resolves components through the registry's DOM scan; here the
// scan returns hand-made components and the adapters are spies.
const reg = vi.hoisted(() => ({ live: [] as unknown[], setValue: vi.fn(), select: vi.fn(), toggle: vi.fn(), highlight: vi.fn() }));
vi.mock("@/lib/remoteAssist/registry", async (orig) => ({
  ...(await orig<typeof import("@/lib/remoteAssist/registry")>()),
  raCollect: () => reg.live,
  raSetValue: reg.setValue,
  raSelectOption: reg.select,
  raToggle: reg.toggle,
  raHighlight: reg.highlight,
  raClearHighlight: () => {},
  raFieldValid: () => true,
}));
const { raExecute } = await import("@/lib/remoteAssist/executor");

// GET /remote-assistance/meta as production returned it on 26 Oct 2026.
const ACTIONS: [string, string, string[], boolean, boolean][] = [
  ["route.navigate", "navigate", ["control", "guide", "prepare"], false, false],
  ["element.highlight", "highlight", ["control", "guide", "prepare"], true, false],
  ["element.tooltip", "tooltip", ["control", "guide", "prepare"], true, false],
  ["page.scroll_to", "scroll", ["control", "guide", "prepare"], true, false],
  ["element.focus", "focus", ["control", "prepare"], true, false],
  ["form.set_value", "form_fill", ["control", "prepare"], true, false],
  ["form.select_option", "form_select", ["control", "prepare"], true, false],
  ["form.toggle", "form_toggle", ["control", "prepare"], true, false],
  ["modal.open", "open_modal", ["control", "prepare"], true, false],
  ["step.next", "step_navigation", ["control", "prepare"], true, false],
  ["step.back", "step_navigation", ["control", "prepare"], true, false],
  ["draft.prepare", "prepare_draft", ["prepare"], true, true],
  ["confirmation.present", "present_confirmation", ["prepare"], true, true],
  ["editor.open", "navigate", ["control", "guide", "prepare"], true, false],
  ["editor.highlight", "highlight", ["control", "guide", "prepare"], true, false],
];
const META = normRaMeta({
  contract_version: "1.0",
  consent_version: "1.0",
  modes: [
    { key: "guide", scopes: ["highlight", "navigate", "scroll", "tooltip", "view_page_context"] },
    { key: "control", scopes: ["focus", "form_fill", "form_select", "form_toggle", "highlight", "navigate", "open_modal", "personal_form_fill", "scroll", "step_navigation", "tooltip", "view_page_context"] },
    { key: "prepare", scopes: ["focus", "form_fill", "form_select", "form_toggle", "highlight", "navigate", "open_modal", "personal_form_fill", "prepare_draft", "present_confirmation", "scroll", "step_navigation", "tooltip", "view_page_context"] },
  ],
  actions: ACTIONS.map(([action_id, scope, modes, component_required, requires_client_confirmation]) => ({ action_id, scope, modes, component_required, requires_client_confirmation })),
  session: { max_minutes: 30, idle_pause_seconds: 90, command_ttl_seconds: 20 },
  capabilities: { request: true, guide: true, control: true, prepare: true, supervise: false, emergency_revoke: false },
});
const ALL_CONTROL = META.modes.find((m) => m.key === "control")!.scopes;
const ALL_PREPARE = META.modes.find((m) => m.key === "prepare")!.scopes;

describe("route registry", () => {
  it("knows the client pages and nothing else", () => {
    expect(raPageOf("/uz/portal/client/profile")?.pageId).toBe("client.profile");
    expect(raPageOf("/ru/portal/client/subscription?x=1")?.pageId).toBe("client.subscription");
    expect(raPageOf("/en/lawyers/abc-123")?.pageId).toBe("client.marketplace.seller");
    expect(raPageOf("/uz/admin")).toBeNull();
    expect(raPageOf("/uz/portal/advocate")).toBeNull();
  });
  it("refuses admin, payment, identity, external and malformed routes", () => {
    for (const bad of [
      "/admin",
      "/uz/admin/remote-assistance",
      "/admin/call-center",
      "/login",
      "/portal/client/payments",
      "/portal/client/profile/security",
      "//evil.example.com/portal/client",
      "https://evil.example.com",
      "javascript:alert(1)",
      "/portal/client/../admin",
      "/portal%2fclient",
      "\\\\evil",
      "portal/client",
      "",
      42,
      null,
    ])
      expect(raSafeRoute(bad), String(bad)).toBe("");
  });
  it("keeps a registered route and a plain query", () => {
    expect(raSafeRoute("/uz/portal/client/profile")).toBe("/portal/client/profile");
    expect(raSafeRoute("/portal/client/subscription?plan=pro")).toBe("/portal/client/subscription?plan=pro");
  });
});

describe("sensitivity", () => {
  it("never lets a secret through as controllable", () => {
    for (const id of ["auth.password", "login.otp", "pay.card-number", "profile.cards.add", "checkout.cvv", "sign.esign", "kyc.passport", "settings.2fa.code", "api.token"]) expect(raSensitivityOfId(id), id).toBe("secret");
    expect(raSensitivityOf("form.x", { type: "password" })).toBe("secret");
    expect(raSensitivityOf("form.code", { autocomplete: "one-time-code" })).toBe("secret");
    expect(raSensitivityOf("form.n", { autocomplete: "cc-number" })).toBe("secret");
    expect(raSensitivityOf("form.f", { type: "file" })).toBe("secret");
  });
  it("marks personal fields personal", () => {
    expect(raSensitivityOf("profile.personal.full_name", { marked: "personal" })).toBe("personal");
    expect(raSensitivityOfId("profile.phone")).toBe("personal");
    expect(raSensitivityOf("form.x", { type: "email" })).toBe("personal");
    expect(raSensitivityOf("form.x", { private: true })).toBe("personal");
    expect(raSensitivityOfId("plans.card")).toBe("normal");
  });
  it("offers final buttons only as something to show the client", () => {
    expect(raActionsFor("plans.pro.buy", "button", {})).toContain("confirmation.present");
    expect(raActionsFor("plans.pro.buy", "button", {})).not.toContain("step.next");
    expect(raActionsFor("wizard.next", "button", {})).toContain("step.next");
    expect(raActionsFor("form.name", "field", { disabled: true })).toEqual(["element.highlight", "element.tooltip", "page.scroll_to"]);
  });
});

describe("client state payload", () => {
  it("carries identity and coarse state only — never a value", () => {
    const leaky = { componentId: "profile.personal.full_name", label: "Ism", actions: ["form.set_value"], sensitivity: "personal" as const, state: "filled", value: "Ali Valiyev", html: "<input>" };
    const body = clientStateBody({ pageId: "client.profile", route: "/portal/client/profile", uiRevision: 7, elements: [leaky] });
    expect(Object.keys(body).sort()).toEqual(["device_session_id", "elements", "page_id", "route", "ui_revision"]);
    expect(Object.keys((body.elements as object[])[0]).sort()).toEqual(["actions", "component_id", "label", "sensitivity", "state"]);
    expect(JSON.stringify(body)).not.toContain("Ali Valiyev");
    expect(body.ui_revision).toBe(7);
  });
});

describe("meta-driven permissions", () => {
  it("guide grants no value-changing action", () => {
    const g = raGrantedActions(META, "guide", META.modes.find((m) => m.key === "guide")!.scopes);
    for (const a of ["form.set_value", "form.select_option", "form.toggle", "element.focus", "draft.prepare"]) expect(g.has(a)).toBe(false);
    expect(g.has("element.highlight")).toBe(true);
  });
  it("a personal field needs personal_form_fill; a secret never", () => {
    const g = raGrantedActions(META, "control", ALL_CONTROL);
    const personal = { componentId: "profile.personal.full_name", label: "Ism", actions: ["element.highlight", "form.set_value"], sensitivity: "personal" as const, state: "empty" };
    expect(raElementActions(personal, g, ALL_CONTROL.filter((s) => s !== "personal_form_fill"))).toEqual(["element.highlight"]);
    expect(raElementActions(personal, g, ALL_CONTROL)).toEqual(["element.highlight", "form.set_value"]);
    expect(raElementActions({ ...personal, sensitivity: "secret" }, g, ALL_CONTROL)).toEqual([]);
  });
  it("uses the mode's own scope list", () => {
    expect(raModeScopes(META, "guide")).toEqual(["highlight", "navigate", "scroll", "tooltip", "view_page_context"]);
  });
});

describe("session payloads", () => {
  it("reads status phases and keeps known fields over partial socket events", () => {
    expect(raPhaseOf("pending_consent")).toBe("pending");
    expect(raPhaseOf("emergency_revoked")).toBe("closed");
    const full = normRaSession({ id: "s1", status: "active", mode: "control", operator: { name: "Dilnoza", lexgo_id: "LGC-1" }, granted_scopes: ["highlight"], client_ui_revision: 5, current_page_id: "client.profile", capabilities: { can_command: true } });
    const partial = normRaSession({ session: { id: "s1", status: "paused" } });
    const merged = mergeRaSession(full, partial);
    expect(merged).toMatchObject({ status: "paused", phase: "paused", mode: "control", grantedScopes: ["highlight"], clientUiRevision: 5 });
    expect(merged.operator.name).toBe("Dilnoza");
    expect(merged.caps?.canCommand).toBe(true);
  });
});

// ---- executor ----

type El = { scrollIntoView: () => void; focus: () => void; click: () => void };
const fakeEl = (): El => ({ scrollIntoView: vi.fn(), focus: vi.fn(), click: vi.fn() });
const liveOf = (componentId: string, actions: string[], sensitivity: "normal" | "personal" = "normal", state = "empty"): RaLive =>
  ({ def: { componentId, label: componentId, actions, sensitivity, state }, el: fakeEl(), field: fakeEl(), kind: "field" }) as unknown as RaLive;

let path = "/uz/portal/client/profile";
const cmdOf = (over: Partial<RaCommand> & { actionId: string }): RaCommand =>
  normRaCommand({ id: over.id ?? "c1", action_id: over.actionId, page_id: over.pageId ?? "client.profile", component_id: over.componentId ?? "profile.personal.full_name", payload: over.payload ?? { value: "Ali" }, expected_ui_revision: over.expectedUiRevision ?? 10, status: "pending" });
const ctxOf = (over: Partial<Parameters<typeof raExecute>[1]> = {}) => ({
  meta: META,
  mode: "control",
  grantedScopes: ALL_CONTROL,
  live: true,
  deviceOk: true,
  pageRevision: 10,
  operator: "Dilnoza",
  confirm: vi.fn(async () => true),
  confirmationShown: vi.fn(async () => {}),
  navigate: vi.fn(),
  pathname: () => path,
  ...over,
});

describe("executor", () => {
  beforeEach(() => {
    path = "/uz/portal/client/profile";
    reg.setValue.mockReset();
    reg.select.mockReset();
    reg.live = [liveOf("profile.personal.full_name", ["element.highlight", "element.focus", "form.set_value", "draft.prepare"], "personal"), liveOf("profile.region", ["element.highlight", "form.select_option"])];
  });

  it("fills a field through its adapter when control + personal scope are granted", async () => {
    const ack = await raExecute(cmdOf({ actionId: "form.set_value" }), ctxOf());
    expect(ack.status).toBe("executed");
    expect(reg.setValue).toHaveBeenCalledWith(reg.live[0], "Ali");
    expect(JSON.stringify(ack)).not.toContain("Ali");
  });
  it("guide mode can't modify values", async () => {
    const ack = await raExecute(cmdOf({ actionId: "form.set_value" }), ctxOf({ mode: "guide", grantedScopes: META.modes[0].scopes }));
    expect(ack).toMatchObject({ status: "rejected", failureCode: "action_not_granted" });
    expect(reg.setValue).not.toHaveBeenCalled();
  });
  it("a personal field needs personal_form_fill", async () => {
    const ack = await raExecute(cmdOf({ actionId: "form.set_value" }), ctxOf({ grantedScopes: ALL_CONTROL.filter((s) => s !== "personal_form_fill") }));
    expect(ack).toMatchObject({ status: "rejected", failureCode: "personal_scope_required" });
    expect(reg.setValue).not.toHaveBeenCalled();
  });
  it("rejects a command aimed at an older screen or another page", async () => {
    expect(await raExecute(cmdOf({ actionId: "form.set_value", expectedUiRevision: 9 }), ctxOf())).toMatchObject({ status: "rejected", failureCode: "ui_revision_conflict" });
    expect(await raExecute(cmdOf({ actionId: "form.set_value", pageId: "client.subscription" }), ctxOf())).toMatchObject({ status: "rejected", failureCode: "page_changed" });
  });
  it("refuses while paused, on another device, and for unmounted, secret or unlisted actions", async () => {
    expect((await raExecute(cmdOf({ actionId: "form.set_value" }), ctxOf({ live: false }))).failureCode).toBe("session_not_active");
    expect((await raExecute(cmdOf({ actionId: "form.set_value" }), ctxOf({ deviceOk: false }))).failureCode).toBe("device_session_mismatch");
    expect((await raExecute(cmdOf({ actionId: "form.set_value", componentId: "profile.gone" }), ctxOf())).failureCode).toBe("component_not_mounted");
    reg.live = [{ ...liveOf("auth.password", ["form.set_value"]), def: { componentId: "auth.password", label: "", actions: ["form.set_value"], sensitivity: "secret", state: "empty" } } as RaLive];
    expect((await raExecute(cmdOf({ actionId: "form.set_value", componentId: "auth.password" }), ctxOf())).failureCode).toBe("secret_component_blocked");
    reg.live = [liveOf("profile.region", ["element.highlight", "form.select_option"])];
    expect((await raExecute(cmdOf({ actionId: "form.set_value", componentId: "profile.region" }), ctxOf())).failureCode).toBe("action_not_permitted");
  });
  it("never navigates outside the registry", async () => {
    const nav = vi.fn();
    expect(await raExecute(cmdOf({ actionId: "route.navigate", payload: { route: "/admin" } }), ctxOf({ navigate: nav }))).toMatchObject({ status: "rejected", failureCode: "route_not_allowed" });
    expect(await raExecute(cmdOf({ actionId: "route.navigate", payload: { route: "//evil.example.com" } }), ctxOf({ navigate: nav }))).toMatchObject({ status: "rejected" });
    expect(nav).not.toHaveBeenCalled();
    expect((await raExecute(cmdOf({ actionId: "route.navigate", payload: { route: "/portal/client/subscription" } }), ctxOf({ navigate: nav }))).status).toBe("executed");
    expect(nav).toHaveBeenCalledWith("/portal/client/subscription");
  });
  it("a draft is applied only after the client confirms", async () => {
    const shown = vi.fn(async () => {});
    const yes = await raExecute(cmdOf({ actionId: "draft.prepare" }), ctxOf({ mode: "prepare", grantedScopes: ALL_PREPARE, confirmationShown: shown, confirm: vi.fn(async () => true) }));
    expect(shown).toHaveBeenCalledTimes(1);
    expect(yes.status).toBe("confirmed");
    expect(reg.setValue).toHaveBeenCalledTimes(1);
    reg.setValue.mockReset();
    const no = await raExecute(cmdOf({ actionId: "draft.prepare" }), ctxOf({ mode: "prepare", grantedScopes: ALL_PREPARE, confirm: vi.fn(async () => false) }));
    expect(no).toMatchObject({ status: "cancelled" });
    expect(reg.setValue).not.toHaveBeenCalled();
  });
});

// ---- runner ----

describe("command runner", () => {
  const make = (status: RaAck["status"] = "executed", confirm = false) => {
    const handled = new Set<string>();
    const acks: [string, string][] = [];
    const execute = vi.fn(async (cmd: RaCommand, shown: () => Promise<void>): Promise<RaAck> => {
      if (confirm) {
        await shown();
        await shown();
      }
      return { status };
    });
    const runner = createRaRunner({
      handled: { has: (id) => handled.has(id), mark: (id) => handled.add(id) },
      canRun: () => true,
      execute,
      ack: async (cmd, ack) => {
        acks.push([cmd.id, ack.status]);
      },
    });
    return { runner, acks, execute, handled };
  };
  const c = (id: string, at = "2026-10-26T10:00:00Z", status = "pending") => normRaCommand({ id, action_id: "element.highlight", created_at: at, status });

  it("acks every command exactly once and never replays it", async () => {
    const { runner, acks, execute } = make();
    runner.enqueue([c("a"), c("a")]);
    await runner.drain();
    runner.enqueue([c("a")]); // the same command again from the poll / a reconnect
    await runner.drain();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(acks).toEqual([["a", "executed"]]);
  });
  it("runs in creation order and skips what the backend already settled", async () => {
    const { runner, acks } = make();
    runner.enqueue([c("late", "2026-10-26T10:00:05Z"), c("early", "2026-10-26T10:00:01Z"), c("done", "2026-10-26T10:00:00Z", "executed")]);
    await runner.drain();
    await vi.waitFor(() => expect(acks.length).toBe(2));
    expect(acks.map((x) => x[0])).toEqual(["early", "late"]);
  });
  it("sends confirmation_required once, then the final status", async () => {
    const { runner, acks } = make("confirmed", true);
    runner.enqueue([c("d")]);
    await runner.drain();
    await vi.waitFor(() => expect(acks.length).toBe(2));
    expect(acks).toEqual([
      ["d", "confirmation_required"],
      ["d", "confirmed"],
    ]);
  });
  it("holds commands while the session can't run", async () => {
    let live = false;
    const acks: string[] = [];
    const runner = createRaRunner({ handled: { has: () => false, mark: () => {} }, canRun: () => live, execute: async () => ({ status: "executed" }), ack: async (cmd) => void acks.push(cmd.id) });
    runner.enqueue([c("p")]);
    await runner.drain();
    expect(acks).toEqual([]);
    live = true;
    await runner.drain();
    expect(acks).toEqual(["p"]);
  });
});
