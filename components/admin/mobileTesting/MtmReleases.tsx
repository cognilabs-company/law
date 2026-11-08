"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import CheckBox from "@/components/CheckBox";
import DatePicker from "@/components/DatePicker";
import TimePicker from "@/components/TimePicker";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { notify } from "@/lib/toast";
import { isPrimaryOnly } from "@/lib/services/superadvokat";
import { useAuth } from "@/lib/auth";
import {
  TRACKS,
  createMtmRelease,
  listMtmReleases,
  mtmErrorKey,
  patchMtmRelease,
  releaseFieldErrors,
  tashIso,
  tashParts,
  type MtmRelease,
  type MtmReleasePatch,
  type ReleaseField,
} from "@/lib/services/mobileTesting";
import { IconAlert, IconEdit, IconLock, IconPackage, IconPlus, IconRefresh } from "@/components/icons";
import { Badge, LiveBar, MtmEmpty, MtmError, MtmForbidden, MtmFrame, MtmSkeleton, TashTime, TzNote, useLabels, useMtmLive, useMtmLoad } from "./MtmBits";

const MAX_CODE = 2147483647;
// The backend may enrol an observed Android test build on its own.
const LIVE = ["mobile_testing.installation_registered"] as const;

// Release management (contract §5): list, create, edit, close and reopen.
export default function MtmReleases() {
  const t = useTranslations("admin.mtm.rel");
  const res = useMtmLoad<MtmRelease[]>((s) => listMtmReleases(s), "releases");
  const online = useMtmLive(LIVE, () => res.reload(true));
  const [form, setForm] = useState<{ mode: "create" } | { mode: "edit"; rel: MtmRelease } | null>(null);
  // Every release action is the primary superadmin's (/auth/me
  // is_primary_superadmin; others get 403 primary_superadmin_required): no
  // "new release" button for anyone else, not even while the list loads, and
  // a 403 on an action takes them all away.
  const primary = useAuth().session?.isPrimarySuperadmin === true;
  const [denied, setDenied] = useState(false);
  const deny = () => {
    setForm(null);
    setDenied(true);
  };

  if (!primary || denied || (res.status === "error" && isPrimaryOnly(res.error))) {
    return (
      <MtmFrame>
        <MtmForbidden />
      </MtmFrame>
    );
  }
  const items = res.data ?? [];
  const sorted = [...items].sort((a, b) => (a.status === b.status ? (b.versionCode ?? 0) - (a.versionCode ?? 0) : a.status === "active" ? -1 : 1));

  return (
    <MtmFrame>
      <div className="mtm-bar">
        <button type="button" className="btn btn--pri btn--sm" onClick={() => setForm({ mode: "create" })}>
          <IconPlus aria-hidden="true" />
          {t("new")}
        </button>
        <LiveBar online={online} at={res.at} refreshing={res.refreshing} failed={res.refreshFailed} onRefresh={() => res.reload(true)} />
      </div>
      <section className="mtm-panel" aria-labelledby="mtm-rel-h">
        <div className="mtm-panel__h">
          <div>
            <h2 id="mtm-rel-h">{t("title")}</h2>
            <p>{t("lead")}</p>
          </div>
          <TzNote />
        </div>
        {res.status === "loading" ? (
          <MtmSkeleton rows={4} />
        ) : res.status === "error" ? (
          <MtmError error={res.error} onRetry={() => res.reload(false)} />
        ) : sorted.length ? (
          <ul className="mtm-rels" data-testid="mtm-releases">
            {sorted.map((r) => (
              <ReleaseRow key={r.id} r={r} onEdit={() => setForm({ mode: "edit", rel: r })} onChanged={() => res.reload(true)} onDenied={deny} />
            ))}
          </ul>
        ) : (
          <MtmEmpty icon={<IconPackage aria-hidden="true" />} title={t("empty")} text={t("emptyText")}>
            <button type="button" className="btn btn--line btn--sm" onClick={() => setForm({ mode: "create" })}>
              <IconPlus aria-hidden="true" />
              {t("new")}
            </button>
          </MtmEmpty>
        )}
      </section>
      {form ? (
        <ReleaseForm
          key={form.mode === "edit" ? form.rel.id : "new"}
          rel={form.mode === "edit" ? form.rel : null}
          onClose={() => setForm(null)}
          onDenied={deny}
          onSaved={() => {
            setForm(null);
            res.reload(true);
          }}
        />
      ) : null}
    </MtmFrame>
  );
}

function ReleaseRow({ r, onEdit, onChanged, onDenied }: { r: MtmRelease; onEdit: () => void; onChanged: () => void; onDenied: () => void }) {
  const t = useTranslations("admin.mtm.rel");
  const tm = useTranslations("admin.mtm");
  const L = useLabels();
  const active = r.status === "active";
  const name = r.versionName || t("noName");
  const change = async (patch: MtmReleasePatch, ask: { title: string; text: string; ok: string; done: string; danger?: boolean }) => {
    await confirmDialog({
      title: ask.title,
      text: ask.text,
      confirmLabel: ask.ok,
      tone: ask.danger ? "danger" : "primary",
      onConfirm: async () => {
        try {
          await patchMtmRelease(r.id, patch);
          notify.success(ask.done);
          onChanged();
        } catch (e) {
          notify.error(tm(`err.${mtmErrorKey(e)}`));
          if (isPrimaryOnly(e)) onDenied();
          throw e;
        }
      },
    });
  };
  const vars = { name, code: r.versionCode ?? "" };
  return (
    <li className="mtm-rel" data-status={active ? "active" : "closed"}>
      <span className="mtm-rel__ic" aria-hidden="true">
        {active ? <IconPackage /> : <IconLock />}
      </span>
      <div className="mtm-rel__main">
        <div className="mtm-rel__top">
          <b className="mtm-rel__v">{name}</b>
          {r.versionCode !== null ? <span className="mtm-rel__code">{t("code", { code: String(r.versionCode) })}</span> : null}
          <Badge tone={active ? "ok" : "off"}>{active ? t("status.active") : r.status === "closed" ? t("status.closed") : t("status.other")}</Badge>
          {r.autoEnroll ? <Badge tone="info">{t("autoOn")}</Badge> : <Badge tone="off">{t("autoOff")}</Badge>}
        </div>
        <dl className="mtm-rel__dl">
          <div>
            <dt>{t("platform")}</dt>
            <dd>{L.platform(r.platform)}</dd>
          </div>
          <div>
            <dt>{t("track")}</dt>
            <dd>{L.track(r.track)}</dd>
          </div>
          <div>
            <dt>{t("starts")}</dt>
            <dd>
              <TashTime iso={r.startsAt} empty={t("startsNone")} />
            </dd>
          </div>
          <div>
            <dt>{t("ends")}</dt>
            <dd>
              <TashTime iso={r.endsAt} empty={t("endsNone")} />
            </dd>
          </div>
          <div>
            <dt>{t("updated")}</dt>
            <dd>
              <TashTime iso={r.updatedAt || r.createdAt} />
            </dd>
          </div>
        </dl>
      </div>
      <div className="mtm-rel__acts">
        <button type="button" className="btn btn--line btn--sm" onClick={onEdit} aria-label={t("editOf", vars)}>
          <IconEdit aria-hidden="true" />
          {t("edit")}
        </button>
        {active && r.autoEnroll ? (
          <button
            type="button"
            className="btn btn--line btn--sm"
            onClick={() => void change({ autoEnroll: false }, { title: t("stopAuto.title", vars), text: t("stopAuto.text"), ok: t("stopAuto.ok"), done: t("stopAuto.done") })}
          >
            {t("stopAuto.btn")}
          </button>
        ) : null}
        {active ? (
          <button
            type="button"
            className="btn btn--line btn--sm mtm-danger"
            onClick={() => void change({ status: "closed", autoEnroll: false }, { title: t("close.title", vars), text: t("close.text"), ok: t("close.ok"), done: t("close.done"), danger: true })}
          >
            <IconLock aria-hidden="true" />
            {t("close.btn")}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--line btn--sm"
            onClick={() => void change({ status: "active" }, { title: t("reopen.title", vars), text: t("reopen.text"), ok: t("reopen.ok"), done: t("reopen.done") })}
          >
            <IconRefresh aria-hidden="true" />
            {t("reopen.btn")}
          </button>
        )}
      </div>
    </li>
  );
}

type Draft = { platform: string; name: string; code: string; track: string; auto: boolean; sd: string; st: string; ed: string; et: string };
const draftOf = (r: MtmRelease | null): Draft => {
  const s = r ? tashParts(r.startsAt) : null;
  const e = r ? tashParts(r.endsAt) : null;
  return {
    platform: r?.platform || "android",
    name: r?.versionName ?? "",
    code: r?.versionCode !== null && r?.versionCode !== undefined ? String(r.versionCode) : "",
    track: r?.track || "closed",
    auto: r ? r.autoEnroll : true,
    sd: s?.date ?? "",
    st: s?.time ?? "",
    ed: e?.date ?? "",
    et: e?.time ?? "",
  };
};

function ReleaseForm({ rel, onClose, onSaved, onDenied }: { rel: MtmRelease | null; onClose: () => void; onSaved: () => void; onDenied: () => void }) {
  const t = useTranslations("admin.mtm.rel");
  const tf = useTranslations("admin.mtm.rel.form");
  const tm = useTranslations("admin.mtm");
  const L = useLabels();
  const uid = useId();
  const [v, setV] = useState<Draft>(() => draftOf(rel));
  const [initial] = useState<Draft>(() => draftOf(rel));
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState<Partial<Record<ReleaseField, string>>>({});
  const [top, setTop] = useState("");
  const set = <K extends keyof Draft>(k: K, val: Draft[K]) => setV((d) => ({ ...d, [k]: val }));
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const edit = rel !== null;

  const check = (): Partial<Record<ReleaseField, string>> => {
    const out: Partial<Record<ReleaseField, string>> = {};
    if (!edit) {
      const n = Number(v.code);
      if (!/^\d+$/.test(v.code.trim()) || n < 1 || n > MAX_CODE) out.version_code = tf("err.code");
    }
    if (v.name.trim().length > 40) out.version_name = tf("err.name");
    if ((v.st && !v.sd) || (v.et && !v.ed)) out[v.st && !v.sd ? "starts_at" : "ends_at"] = tf("err.dateNeeded");
    const s = v.sd ? tashIso(v.sd, v.st) : "";
    const e = v.ed ? tashIso(v.ed, v.et || "23:59") : "";
    // Same fixed +05:00 offset on both, so text order is time order.
    if (s && e && e <= s) out.ends_at = tf("err.order");
    return out;
  };

  const submit = async () => {
    const local = check();
    setBad(local);
    setTop("");
    if (Object.keys(local).length) return;
    setBusy(true);
    const startsAt = v.sd ? tashIso(v.sd, v.st) : null;
    const endsAt = v.ed ? tashIso(v.ed, v.et || "23:59") : null;
    try {
      if (rel) {
        await patchMtmRelease(rel.id, { versionName: v.name, track: v.track, autoEnroll: v.auto, startsAt, endsAt });
        notify.success(tf("savedEdit"));
      } else {
        await createMtmRelease({ platform: v.platform, versionName: v.name, versionCode: Number(v.code), track: v.track, autoEnroll: v.auto, startsAt, endsAt });
        notify.success(tf("savedNew"));
      }
      onSaved();
    } catch (e) {
      const key = mtmErrorKey(e);
      if (isPrimaryOnly(e)) {
        notify.error(tm(`err.${key}`));
        onDenied();
        return;
      }
      const fields = releaseFieldErrors(e);
      const next: Partial<Record<ReleaseField, string>> = {};
      for (const f of fields) next[f] = key === "releaseExists" && f === "version_code" ? tf("err.exists", { code: v.code }) : tf(`fieldErr.${f}`);
      setBad(next);
      setTop(key === "releaseExists" ? tf("err.exists", { code: v.code }) : key === "validation" && fields.length ? tf("err.fix") : tm(`err.${key}`));
    } finally {
      setBusy(false);
    }
  };

  const err = (f: ReleaseField) =>
    bad[f] ? (
      <small className="mtm-field__err" id={`${uid}-${f}`} role="alert">
        <IconAlert aria-hidden="true" />
        {bad[f]}
      </small>
    ) : null;
  const trackOpts = TRACKS.map((x) => ({ value: x, label: L.track(x), hint: tf(`trackHint.${x}`) }));

  return (
    <Modal
      open
      onClose={onClose}
      title={edit ? t("editTitle", { name: rel.versionName || t("noName") }) : t("newTitle")}
      icon={<IconPackage />}
      size="md"
      busy={busy}
      dirty={dirty}
      footer={
        <div className="cdlg__acts">
          <button type="button" className="btn btn--line" onClick={onClose} disabled={busy}>
            {tf("cancel")}
          </button>
          <button type="submit" form={`${uid}-f`} className="btn btn--pri" disabled={busy} aria-busy={busy || undefined}>
            {busy ? tf("saving") : edit ? tf("save") : tf("create")}
          </button>
        </div>
      }
    >
      <form
        id={`${uid}-f`}
        className="mtm-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {top ? (
          <p className="mtm-form__top" role="alert" data-testid="mtm-release-error">
            <IconAlert aria-hidden="true" />
            {top}
          </p>
        ) : null}
        <div className="mtm-form__row">
          <div className="mtm-field">
            <span className="mtm-field__l" id={`${uid}-pl`}>
              {t("platform")}
            </span>
            {edit ? (
              <b className="mtm-field__ro">{L.platform(v.platform)}</b>
            ) : (
              <Select value={v.platform} onChange={(x) => set("platform", x)} options={[{ value: "android", label: L.platform("android") }]} labelId={`${uid}-pl`} invalid={!!bad.platform} describedBy={bad.platform ? `${uid}-platform` : undefined} />
            )}
            {err("platform")}
          </div>
          <div className="mtm-field">
            <label className="mtm-field__l" htmlFor={`${uid}-code`}>
              {tf("code")}
            </label>
            {edit ? (
              <b className="mtm-field__ro">{v.code || tm("none")}</b>
            ) : (
              <input
                id={`${uid}-code`}
                className="mtm-input"
                inputMode="numeric"
                autoComplete="off"
                value={v.code}
                onChange={(e) => set("code", e.target.value.replace(/[^\d]/g, "").slice(0, 10))}
                placeholder="20400"
                aria-invalid={!!bad.version_code || undefined}
                aria-describedby={bad.version_code ? `${uid}-version_code` : `${uid}-codeh`}
              />
            )}
            {err("version_code") ?? (!edit ? <small className="mtm-field__h" id={`${uid}-codeh`}>{tf("codeHint")}</small> : <small className="mtm-field__h">{tf("codeLocked")}</small>)}
          </div>
        </div>
        <div className="mtm-form__row">
          <div className="mtm-field">
            <label className="mtm-field__l" htmlFor={`${uid}-name`}>
              {tf("name")}
            </label>
            <input
              id={`${uid}-name`}
              className="mtm-input"
              value={v.name}
              maxLength={40}
              onChange={(e) => set("name", e.target.value)}
              placeholder="2.4.0"
              aria-invalid={!!bad.version_name || undefined}
              aria-describedby={bad.version_name ? `${uid}-version_name` : undefined}
            />
            {err("version_name")}
          </div>
          <div className="mtm-field">
            <span className="mtm-field__l" id={`${uid}-tr`}>
              {t("track")}
            </span>
            <Select value={v.track} onChange={(x) => set("track", x)} options={trackOpts} labelId={`${uid}-tr`} invalid={!!bad.distribution_track} describedBy={bad.distribution_track ? `${uid}-distribution_track` : undefined} />
            {err("distribution_track")}
          </div>
        </div>
        <div className="mtm-field">
          <CheckBox checked={v.auto} onChange={(x) => set("auto", x)} hint={tf("autoHint")} invalid={!!bad.auto_enroll}>
            {tf("auto")}
          </CheckBox>
          {err("auto_enroll")}
        </div>
        <fieldset className="mtm-field mtm-fs">
          <legend className="mtm-field__l">
            {tf("starts")} <TzNote />
          </legend>
          <div className="mtm-dt">
            <DatePicker value={v.sd} onChange={(x) => set("sd", x)} placeholder={tf("date")} ariaLabel={tf("startsDate")} clearLabel={tf("clear")} />
            <TimePicker value={v.st} onChange={(x) => set("st", x)} placeholder={tf("time")} ariaLabel={tf("startsTime")} clearLabel={tf("clear")} />
          </div>
          {err("starts_at") ?? <small className="mtm-field__h">{tf("startsHint")}</small>}
        </fieldset>
        <fieldset className="mtm-field mtm-fs">
          <legend className="mtm-field__l">
            {tf("ends")} <TzNote />
          </legend>
          <div className="mtm-dt">
            <DatePicker value={v.ed} onChange={(x) => set("ed", x)} placeholder={tf("date")} ariaLabel={tf("endsDate")} min={v.sd || undefined} clearLabel={tf("clear")} />
            <TimePicker value={v.et} onChange={(x) => set("et", x)} placeholder={tf("time")} ariaLabel={tf("endsTime")} clearLabel={tf("clear")} />
          </div>
          {err("ends_at") ?? <small className="mtm-field__h">{tf("endsHint")}</small>}
        </fieldset>
        {err("status")}
      </form>
    </Modal>
  );
}
