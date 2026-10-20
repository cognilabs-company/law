"use client";

import "../sx-tones.css";
import "./sx-settings.css";
import { useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import IconButton from "@/components/ui/IconButton";
import { aiId } from "@/lib/ai/ids";
import { logApiError } from "@/lib/http";
import { STUDIO_ROLES, isRetiredStudioCode, saveStudioAccess, studioErrorOf, useStudioRegistry, type StudioAccessGrant } from "@/lib/services/studio";
import { toast } from "@/lib/toast";
import { SxButton } from "../Button";
import { SxDialog } from "../editor/SxDialog";
import { useEditorErrorText } from "../editor/useEditorErrorText";
import { Picker } from "../form/Picker";
import { CalendarIcon, CircleCheckIcon, CirclePauseIcon, HourglassIcon, LayersIcon, LockIcon, PencilLineIcon, RefreshCwIcon, ctorIcon, glyph } from "../icons";
import { SxEmpty } from "../layout/Empty";
import { SxNote } from "../layout/Note";
import { SxTable, type SxColumn } from "../layout/Table";
import { SxToolbar } from "../layout/Toolbar";
import type { SxOption } from "../types";
import { useStudioLabels } from "../useStudioLabels";
import { GrantDrawer, type GrantMode, type GrantSaved } from "./GrantDrawer";
import { ROLE_HUE, ROLE_ICON, SET_AI, TAB_HUE, TAB_ICON, byCtorRank, grantKey, grantLexgo, grantName, groupKeyOf, matchesTerms, roleCodeOf } from "./model";
import { Avatar, Card, SectionHead, useRoleName } from "./parts";
import { RoleMatrix } from "./RoleMatrix";
import type { AccessList } from "./useAccessList";
import { PlayIcon, UserPlusIcon, UsersIcon } from "lucide-react";

const AI = `${SET_AI}.access`;
const SCOPE_MAX = 4;

type Ask = { grant: StudioAccessGrant; active: boolean };

export function AccessSection({ list }: { list: AccessList }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const roleName = useRoleName();
  const errText = useEditorErrorText();
  const reg = useStudioRegistry();
  const [busy, setBusy] = useState(false);
  const [writeOff, setWriteOff] = useState(false);
  const [drawer, setDrawer] = useState<GrantMode | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [toggling, setToggling] = useState("");
  const [q, setQ] = useState("");
  const [roleF, setRoleF] = useState("");
  const [stateF, setStateF] = useState("");

  const items = list.items;
  const canWrite = list.phase === "ready" && list.known && !writeOff;
  const activeN = items.filter((g) => g.active).length;
  const pausedN = items.length - activeN;
  const roleN = (r: string) => items.filter((g) => g.roles.some((x) => roleCodeOf(x) === r)).length;

  async function refresh() {
    setBusy(true);
    await list.load();
    setBusy(false);
  }

  function onMissing() {
    setDrawer(null);
    setWriteOff(true);
    toast(t("settings.access.writeMissing"), { tone: "info", ms: 7000 });
  }

  async function onSaved(s: GrantSaved) {
    setDrawer(null);
    const fresh = await list.load();
    const seen = fresh?.find((g) => g.userId === s.input.userId);
    if (fresh && !seen) toast(t("settings.access.savedHidden"), { tone: "info", ms: 7000 });
    else toast(t("settings.access.saved", { name: s.userName }), { tone: "ok" });
  }

  async function setActive(g: StudioAccessGrant, active: boolean) {
    setToggling(grantKey(g));
    try {
      await saveStudioAccess({ id: g.id || undefined, userId: g.userId, roles: g.roles, constructorCodes: g.constructorCodes, active });
      setAsk(null);
      await list.load();
      toast(active ? t("settings.access.resumed") : t("settings.access.paused"), { tone: "ok" });
    } catch (e) {
      logApiError("studio.access.toggle", e);
      setAsk(null);
      if (studioErrorOf(e).kind === "missing") onMissing();
      else toast(errText(e).text, { tone: "err" });
    } finally {
      setToggling("");
    }
  }

  const ctorTitle = (code: string) => labels.ctorName(code, reg.items.find((c) => c.code === code)?.title);
  const gkOf = (code: string) => groupKeyOf(code, reg.groups, reg.items);

  const shown = items.filter((g) => {
    if (roleF && !g.roles.some((r) => roleCodeOf(r) === roleF)) return false;
    if (stateF === "active" && !g.active) return false;
    if (stateF === "paused" && g.active) return false;
    return matchesTerms([g.userName, g.phone, g.userId, grantLexgo(g), ...g.roles.map((r) => roleName(r)), ...g.constructorCodes, ...g.constructorCodes.map(ctorTitle)], q);
  });

  const all: SxOption = { value: "", label: t("common.all") };
  const roleOpts: SxOption[] = [all, ...STUDIO_ROLES.map((r) => ({ value: r, label: `${roleName(r)} (${labels.num(roleN(r))})`, icon: ROLE_ICON[r] }))];
  const stateOpts: SxOption[] = [
    all,
    { value: "active", label: `${t("settings.access.active")} (${labels.num(activeN)})`, icon: CircleCheckIcon },
    { value: "paused", label: `${t("settings.access.pausedState")} (${labels.num(pausedN)})`, icon: CirclePauseIcon },
  ];

  const columns: SxColumn<StudioAccessGrant>[] = [
    {
      key: "person",
      header: t("sx.set.access.colPerson"),
      primary: true,
      width: "28%",
      cell: (g) => {
        const name = grantName(g) || t("monitoring.unknownUser");
        const lexgo = grantLexgo(g);
        const sub = [g.phone && g.phone !== name ? g.phone : "", lexgo ? `LexGo ID ${lexgo}` : ""].filter(Boolean);
        return (
          <span className="sx-st-person">
            <Avatar name={name} />
            <span className="sx-st-person__m">
              <span className="sx-st-person__name">{name}</span>
              {sub.length ? (
                <span className="sx-st-person__sub">
                  {sub.map((s) => (
                    <span key={s}>{s}</span>
                  ))}
                </span>
              ) : null}
            </span>
          </span>
        );
      },
    },
    {
      key: "roles",
      header: t("settings.access.roles"),
      cell: (g) => {
        const codes = g.roles.map((r) => ({ raw: r, code: roleCodeOf(r) }));
        if (!codes.length) return <span className="sx-st-dim">{t("settings.access.noRoles")}</span>;
        return (
          <span className="sx-st-chips">
            {codes.map(({ raw, code }) => (
              <span key={raw} className="sx-st-role" data-hue={code ? ROLE_HUE[code] : undefined}>
                {code ? glyph(ROLE_ICON[code], { size: 14 }) : null}
                {roleName(raw)}
              </span>
            ))}
          </span>
        );
      },
    },
    {
      key: "scope",
      header: t("sx.set.access.colScope"),
      width: "26%",
      cell: (g) => {
        const wild = g.constructorCodes.includes("*");
        const listed = g.constructorCodes.filter((c) => c !== "*" && !isRetiredStudioCode(c));
        const all = (
          <span className="sx-st-scope" data-all="">
            {glyph(LayersIcon, { size: 14 })}
            {t("settings.access.allCtors")}
          </span>
        );
        if (!listed.length) return wild || !g.constructorCodes.length ? all : <span className="sx-st-dim">—</span>;
        const codes = [...listed].sort(byCtorRank);
        const room = wild ? SCOPE_MAX - 1 : SCOPE_MAX;
        const rest = codes.slice(room);
        return (
          <span className="sx-st-chips">
            {wild ? all : null}
            {codes.slice(0, room).map((c) => {
              const Icon = ctorIcon(c, gkOf(c));
              return (
                <span key={c} className="sx-st-scope" title={`${c} · ${ctorTitle(c)}`}>
                  {glyph(Icon, { size: 14 })}
                  <span className="sx-st-scope__t">{ctorTitle(c)}</span>
                </span>
              );
            })}
            {rest.length ? (
              <span className="sx-st-more" title={rest.map(ctorTitle).join(", ")}>
                +{labels.num(rest.length)}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "state",
      header: t("settings.access.filterState"),
      cell: (g) => (
        <span className="sx-st-state">
          <span className="sx-st-pill" data-on={g.active ? "" : undefined}>
            <i aria-hidden="true" />
            {g.active ? t("settings.access.active") : t("settings.access.pausedState")}
          </span>
          {g.createdAt ? (
            <span className="sx-st-since sx-num" title={t("sx.set.access.colSince")}>
              {glyph(CalendarIcon, { size: 12 })}
              {t("settings.access.since", { d: labels.date(g.createdAt) })}
            </span>
          ) : null}
        </span>
      ),
    },
  ];

  if (canWrite) {
    columns.push({
      key: "acts",
      header: t("sx.set.access.colActions"),
      srOnlyHeader: true,
      align: "end",
      cell: (g) => {
        if (!g.userId) return null;
        const key = grantKey(g);
        const off = Boolean(toggling);
        return (
          <span className="sx-st-acts">
            <IconButton
              className="sx-ibtn"
              size="sm"
              variant="line"
              label={t("settings.access.edit")}
              icon={glyph(PencilLineIcon, { size: 16 })}
              disabled={off}
              onClick={() => setDrawer({ kind: "edit", grant: g })}
              aiId={aiId(`${AI}.row`, key, "edit")}
            />
            {g.active ? (
              <IconButton
                className="sx-ibtn"
                size="sm"
                variant="line"
                label={t("settings.access.pause")}
                icon={glyph(CirclePauseIcon, { size: 16 })}
                disabled={off}
                onClick={() => setAsk({ grant: g, active: false })}
                aiId={aiId(`${AI}.row`, key, "pause")}
              />
            ) : (
              <IconButton
                className="sx-ibtn"
                size="sm"
                variant="line"
                label={t("settings.access.resume")}
                icon={glyph(PlayIcon, { size: 16 })}
                disabled={off}
                busy={toggling === key}
                onClick={() => setAsk({ grant: g, active: true })}
                aiId={aiId(`${AI}.row`, key, "resume")}
              />
            )}
          </span>
        );
      },
    });
  }

  const grantBtn = canWrite ? (
    <SxButton variant="primary" icon={UserPlusIcon} onClick={() => setDrawer({ kind: "new" })} aiId={`${AI}.grant`}>
      {t("settings.access.grant")}
    </SxButton>
  ) : null;

  const actions = (
    <>
      {list.phase !== "loading" ? (
        <IconButton
          className="sx-ibtn"
          variant="line"
          label={t("settings.common.refresh")}
          icon={glyph(RefreshCwIcon, { size: 18, className: busy ? "sx-st-spin" : undefined })}
          disabled={busy}
          onClick={() => void refresh()}
          aiId={`${AI}.refresh`}
        />
      ) : null}
      {grantBtn}
    </>
  );

  const filtered = Boolean(q.trim() || roleF || stateF);
  const reset = () => {
    setQ("");
    setRoleF("");
    setStateF("");
  };

  const chip = (value: string, label: string, n: number, icon: typeof UsersIcon, tone: string) => (
    <button
      key={value || "all"}
      type="button"
      className="sx-st-stat"
      data-tone={tone}
      aria-pressed={stateF === value}
      onClick={() => setStateF(stateF === value ? "" : value)}
      data-ai-id={aiId(`${AI}.summary`, value || "all")}
      data-ai-type="button"
      data-ai-label={label}
    >
      <span className="sx-st-stat__ico" aria-hidden="true">
        {glyph(icon, { size: 16 })}
      </span>
      <span className="sx-st-stat__n sx-num">{labels.num(n)}</span>
      <span className="sx-st-stat__l">{label}</span>
    </button>
  );

  let body: ReactElement;
  if (list.phase === "error") {
    body =
      studioErrorOf(list.error).kind === "missing" ? (
        <SxEmpty
          icon={HourglassIcon}
          title={t("settings.common.missingTitle")}
          text={t("settings.access.missing")}
          action={
            <SxButton icon={RefreshCwIcon} busy={busy} onClick={() => void refresh()} aiId={`${AI}.recheck`}>
              {t("settings.common.recheck")}
            </SxButton>
          }
        />
      ) : (
        <SxNote
          tone="error"
          title={t("sx.ui.errorTitle")}
          action={
            <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} busy={busy} onClick={() => void refresh()} aiId={`${AI}.retry`}>
              {t("sx.ui.retry")}
            </SxButton>
          }
        >
          {errText(list.error).text}
        </SxNote>
      );
  } else if (list.phase === "ready" && !items.length) {
    body = <SxEmpty icon={LockIcon} title={t("settings.access.emptyTitle")} text={t("settings.access.emptyText")} action={grantBtn ?? undefined} />;
  } else {
    body = (
      <>
        <SxToolbar
          aiId={`${AI}.filters`}
          search={{ value: q, onChange: (v) => setQ(v.slice(0, 80)), placeholder: t("settings.access.searchPh"), label: t("settings.access.searchPh"), aiId: `${AI}.search.input` }}
          count={list.phase === "ready" ? t("sx.set.access.count", { n: labels.num(shown.length) }) : undefined}
          active={filtered}
          onReset={reset}
        >
          <Picker size="sm" label={t("settings.access.filterRole")} placeholder={t("settings.access.filterRole")} options={roleOpts} value={roleF} onChange={setRoleF} searchable={false} aiId={`${AI}.filter.role`} />
          <Picker size="sm" label={t("settings.access.filterState")} placeholder={t("settings.access.filterState")} options={stateOpts} value={stateF} onChange={setStateF} searchable={false} aiId={`${AI}.filter.state`} />
        </SxToolbar>
        <SxTable
          rows={shown}
          columns={columns}
          rowKey={grantKey}
          caption={t("settings.access.title")}
          loading={list.phase === "loading"}
          skeletonRows={4}
          busy={busy}
          rowTone={(g) => (g.active ? undefined : "muted")}
          rowTitle={(g) => grantName(g)}
          onRowClick={canWrite ? (g) => (g.userId ? setDrawer({ kind: "edit", grant: g }) : undefined) : undefined}
          empty={<SxEmpty compact icon={UsersIcon} title={t("settings.common.noMatch")} text={t("settings.common.noMatchText")} />}
          aiId={AI}
        />
      </>
    );
  }

  const askName = ask ? grantName(ask.grant) : "";

  return (
    <div className="sx-st-stack">
      <SectionHead
        icon={TAB_ICON.access}
        hue={TAB_HUE.access}
        title={t("settings.access.title")}
        lead={t("settings.access.lead")}
        actions={actions}
        titleId="sx-set-access-title"
      >
        {list.phase === "ready" && items.length ? (
          <div className="sx-st-stats" role="group" aria-label={t("sx.set.access.summary")}>
            {chip("", t("sx.set.access.total"), items.length, UsersIcon, "all")}
            {chip("active", t("settings.access.active"), activeN, CircleCheckIcon, "on")}
            {chip("paused", t("settings.access.pausedState"), pausedN, CirclePauseIcon, "off")}
            <span className="sx-st-stats__sep" aria-hidden="true" />
            {STUDIO_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                className="sx-st-role sx-st-role--btn"
                data-hue={ROLE_HUE[r]}
                aria-pressed={roleF === r}
                onClick={() => setRoleF(roleF === r ? "" : r)}
                data-ai-id={aiId(`${AI}.summary.role`, r)}
                data-ai-type="button"
                data-ai-label={roleName(r)}
              >
                {glyph(ROLE_ICON[r], { size: 14 })}
                {roleName(r)}
                <b className="sx-num">{labels.num(roleN(r))}</b>
              </button>
            ))}
          </div>
        ) : null}
      </SectionHead>

      {list.phase === "ready" && (!list.known || writeOff) ? <SxNote tone="info">{writeOff ? t("settings.access.readOnlyWrite") : t("settings.access.readOnlyShape")}</SxNote> : null}
      {list.phase === "ready" && list.error ? (
        <SxNote
          tone="error"
          action={
            <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} busy={busy} onClick={() => void refresh()}>
              {t("sx.ui.retry")}
            </SxButton>
          }
        >
          {errText(list.error).text}
        </SxNote>
      ) : null}

      <Card className="sx-st-tablecard sx-st-people" aiId={`${AI}.list`} aiLabel={t("settings.access.title")}>
        {body}
      </Card>

      <RoleMatrix />

      <GrantDrawer mode={drawer} grants={items} onClose={() => setDrawer(null)} onSaved={(s) => void onSaved(s)} onMissing={onMissing} />

      <SxDialog
        open={ask !== null}
        onClose={() => setAsk(null)}
        title={ask?.active ? t("sx.set.access.resumeTitle") : t("settings.access.pauseTitle")}
        size="sm"
        busy={Boolean(toggling)}
        aiId={ask?.active ? `${AI}.resume-confirm` : `${AI}.pause-confirm`}
        footer={
          <>
            <SxButton onClick={() => setAsk(null)} disabled={Boolean(toggling)} aiId={`${AI}.confirm.cancel`}>
              {t("sx.ui.cancel")}
            </SxButton>
            <SxButton
              variant={ask?.active ? "primary" : "danger"}
              icon={ask?.active ? PlayIcon : CirclePauseIcon}
              busy={Boolean(toggling)}
              onClick={() => {
                if (ask) void setActive(ask.grant, ask.active);
              }}
              aiId={`${AI}.confirm.ok`}
            >
              {ask?.active ? t("settings.access.resume") : t("settings.access.pause")}
            </SxButton>
          </>
        }
      >
        {ask ? (
          <div className="sx-st-confirm" data-tone={ask.active ? "on" : "off"}>
            <Avatar name={askName} size="lg" />
            <p>{ask.active ? t("sx.set.access.resumeText", { name: askName }) : t("settings.access.pauseText", { name: askName })}</p>
          </div>
        ) : null}
      </SxDialog>
    </div>
  );
}
