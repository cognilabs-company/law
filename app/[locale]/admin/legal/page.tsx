"use client";

import { useMemo, useRef, useState, type FormEvent, type ReactElement } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  listAdminConsentDocs,
  listUserConsents,
  createConsentDoc,
  createConsentVersion,
  cmpVersion,
  searchUsers,
  type ConsentDoc,
  type UserConsentRow,
} from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { useAiReveal } from "@/lib/guide/targets";
import { notify } from "@/lib/toast";
import { useScrollEdges } from "@/lib/useScrollEdges";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import CheckBox from "@/components/CheckBox";
import PersonName from "@/components/ui/PersonName";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import FilterBar from "@/components/filters/FilterBar";
import ScrollCue from "@/components/ui/ScrollCue";
import { Skeleton, EmptyState, ErrorState } from "@/components/portal/DataState";
import { IconAlert, IconClock, IconFileText, IconShieldCheck, IconPlus, IconEye, IconUser } from "@/components/icons";
import { dateTimeFull } from "@/lib/date";
import { legalLang, type LegalLang } from "@/lib/legal";
import { LEGAL_LANGS, draftOf, emptyDraft, firstErrorLang, i18nPayload, langState, missingLangs, serverDraftErrors, validateDraft, type LegalDraft, type LegalDraftErrors, type LegalPart } from "@/lib/legalAdmin";
import { FlagEn, FlagRu, FlagUz } from "@/components/flags";
import { humanize } from "@/lib/labels";
import { isForbidden } from "@/lib/http";

// T0-18: the legal documents with their versions and the consents journal
// (who accepted what, when, from which IP). Every document is written in
// Uzbek (required), Russian and English (LEXGO_LEGAL_DOCUMENT_LANGUAGES_
// FRONTEND_FINAL_2026_11_01); each version keeps exactly the translations it
// was published with, and archived versions are read-only.
// The canonical documents LexGo publishes (backend eecebb9); the footer's
// "terms" / "disclaimer" are aliases of user_offer / platform_rules.
const REQUIRED_SLUGS = [
  "user_offer",
  "privacy",
  "platform_rules",
  "cookie",
  "personal_data_consent",
  "payment_refund_warranty",
  "age_18",
  "lawyer_partnership_offer",
  "organization_agreement",
  "client_advocate_contract_template",
  "remote_assistance_consent",
] as const;
const PLACEHOLDER_MAX = 120; // shorter body = still a placeholder
const LANG_FLAG: Record<LegalLang, () => ReactElement> = { uz: FlagUz, ru: FlagRu, en: FlagEn };

function fmt(s: string, locale: string) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s || "—" : dateTimeFull(s, locale);
}

// The languages a version has, as flags and names (never codes).
function LangChips({ langs }: { langs: readonly string[] }) {
  const t = useTranslations("admin.legal");
  const shown = LEGAL_LANGS.filter((l) => langs.includes(l));
  if (!shown.length) return null;
  return (
    <span className="lglang" aria-label={t("langsAria")}>
      {shown.map((l) => {
        const Flag = LANG_FLAG[l];
        return (
          <span key={l} className="lglang__c">
            <Flag />
            {t(`lang.${l}`)}
          </span>
        );
      })}
    </span>
  );
}

export default function AdminLegal() {
  const t = useTranslations("admin.legal");
  const locale = useLocale();
  const lang = legalLang(locale);
  const [tab, setTab] = useState<"docs" | "journal">("docs");
  useAiReveal(/^(legal:docs-list|button:new-legal-doc)$/, () => setTab("docs"));
  useAiReveal("legal:journal", () => setTab("journal"));
  const [key, setKey] = useState(0);
  const docs = useResource(() => listAdminConsentDocs(lang), [key, lang]);
  const [view, setView] = useState<ConsentDoc | null>(null);
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // Publishing (POST/PATCH /admin/legal/consents) sits under this page's
  // users.manage. A 403 anyway keeps its message and takes New document /
  // New version / Publish off the page; versions stay readable.
  const [writeDenied, setWriteDenied] = useState(false);

  // Slug → versions (newest first).
  const bySlug = useMemo(() => {
    const m = new Map<string, ConsentDoc[]>();
    for (const d of docs.data) { if (!m.has(d.slug)) m.set(d.slug, []); m.get(d.slug)!.push(d); }
    for (const v of m.values()) v.sort((a, b) => cmpVersion(b.version, a.version) || b.createdAt.localeCompare(a.createdAt));
    return m;
  }, [docs.data]);
  const slugs = [...REQUIRED_SLUGS, ...[...bySlug.keys()].filter((s) => !(REQUIRED_SLUGS as readonly string[]).includes(s))];
  // The admin's own label for a known document, else the document's own title.
  const nameOf = (slug: string) => {
    if (t.has(`slugs.${slug}`)) return t(`slugs.${slug}`);
    const d = bySlug.get(slug)?.[0];
    return d?.titleI18n[lang] || d?.title || humanize(slug);
  };
  const published = REQUIRED_SLUGS.filter((s) => bySlug.get(s)?.some((d) => d.active && d.body.length > PLACEHOLDER_MAX)).length;

  return (
    <>
      <div className="ppanel">
        <div className="ppanel__h">
          <b>{t("title")}</b>
          <span className="advmuted">{t("readiness", { n: published, total: REQUIRED_SLUGS.length })}</span>
        </div>
        <p className="ppanel__note">{t("lead")}</p>
        <ScrollCue className="tabs" role="tablist" style={{ marginBottom: 0 }} data-ai-target="legal:tabs">
          <button type="button" role="tab" aria-selected={tab === "docs"} className="tab" onClick={() => setTab("docs")}><IconFileText />{t("tabDocs")}</button>
          <button type="button" role="tab" aria-selected={tab === "journal"} className="tab" onClick={() => setTab("journal")}><IconShieldCheck />{t("tabJournal")}</button>
        </ScrollCue>
      </div>

      {tab === "docs" ? (
        <div className="ppanel">
          <div className="ppanel__h">
            <b>{t("docsTitle")}</b>
            {writeDenied ? null : <button type="button" className="btn btn--pri btn--sm" onClick={() => setEdit({ base: null, slug: "" })} data-ai-target="button:new-legal-doc"><IconPlus />{t("newDoc")}</button>}
          </div>
          {docs.status === "loading" ? (
            <Skeleton rows={5} />
          ) : docs.status === "error" ? (
            <ErrorState title={t("loadError")} error={docs.error} onRetry={docs.refresh} />
          ) : (
            <div className="alist" data-ai-target="legal:docs-list">
              {slugs.map((slug) => {
                const versions = bySlug.get(slug) ?? [];
                const cur = versions.find((d) => d.active) ?? versions[0];
                const state = !cur ? "missing" : cur.body.length <= PLACEHOLDER_MAX ? "placeholder" : "ready";
                const histId = `lghist-${slug}`;
                return (
                  <div className="aitem lgitem" key={slug}>
                    <div className="aitem__m">
                      <b>{nameOf(slug)}</b>
                      {cur ? <span className="aitem__meta">{`v${cur.version} · ${fmt(cur.createdAt, locale)}`}</span> : null}
                      <div className="aitem__tags">
                        <em className={`atag${state === "ready" ? " atag--ok" : state === "missing" ? "" : " atag--muted"}`}>{t(`state.${state}`)}</em>
                        {cur ? <LangChips langs={cur.availableLanguages} /> : null}
                      </div>
                    </div>
                    {versions.length || !writeDenied ? (
                    <div className="aitem__acts">
                      {versions.length ? (
                        <button type="button" className="btn btn--line btn--sm" aria-expanded={open === slug} aria-controls={histId} onClick={() => setOpen((o) => (o === slug ? null : slug))}>
                          <IconClock />
                          {t("history", { n: versions.length })}
                        </button>
                      ) : null}
                      {writeDenied ? null : (
                        <button type="button" className="btn btn--soft btn--sm" onClick={() => setEdit(cur ? { base: cur, slug } : { base: null, slug })}>
                          {cur ? t("newVersion") : t("publish")}
                        </button>
                      )}
                    </div>
                    ) : null}
                    {open === slug ? (
                      <ul className="lghist" id={histId} aria-label={t("historyAria", { doc: nameOf(slug) })}>
                        {versions.map((v) => (
                          <li key={v.id} className={v.active ? "is-on" : undefined}>
                            <button type="button" className="lghist__row" onClick={() => setView(v)}>
                              <b>v{v.version}</b>
                              <span className="lghist__when">{fmt(v.createdAt, locale)}</span>
                              <em className={`atag${v.active ? " atag--ok" : " atag--muted"}`}>{v.active ? t("active") : t("archived")}</em>
                              <LangChips langs={v.availableLanguages} />
                              <span className="lghist__open"><IconEye />{t("view")}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <Journal />
      )}

      <VersionView doc={view} name={view ? nameOf(view.slug) : ""} onClose={() => setView(null)} />
      <EditModal target={edit} name={edit?.slug ? nameOf(edit.slug) : ""} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); setKey((k) => k + 1); }} onForbidden={() => { setWriteDenied(true); setEdit(null); }} />
    </>
  );
}

// One version, read-only, in each language it has. Archived versions are
// only ever shown here; nothing edits them.
function VersionView({ doc, name, onClose }: { doc: ConsentDoc | null; name: string; onClose: () => void }) {
  const t = useTranslations("admin.legal");
  const locale = useLocale();
  const draft = draftOf(doc);
  const has = LEGAL_LANGS.filter((l) => langState(draft, l) === "complete");
  const [pick, setPick] = useState<LegalLang>("uz");
  const lang = has.includes(pick) ? pick : (has[0] ?? "uz");
  return (
    <Modal open={!!doc} onClose={onClose} title={doc ? `${name} · v${doc.version}` : ""}>
      {doc ? (
        <div className="legaldoc">
          <p className="advmuted">
            {fmt(doc.createdAt, locale)} · {doc.active ? t("active") : t("archivedReadOnly")}
          </p>
          <LangTabs value={lang} onChange={setPick} states={Object.fromEntries(LEGAL_LANGS.map((l) => [l, has.includes(l) ? "complete" : "empty"])) as Record<LegalLang, LangTabState>} disabledEmpty />
          <h3 className="legaldoc__t" lang={lang}>{draft[lang].title}</h3>
          <pre className="legaldoc__body" lang={lang}>{draft[lang].body}</pre>
        </div>
      ) : null}
    </Modal>
  );
}

type LangTabState = "complete" | "partial" | "empty" | "error";

// Uzbek / Russian / English, each with whether it is filled in.
function LangTabs({ value, onChange, states, disabledEmpty = false }: { value: LegalLang; onChange: (l: LegalLang) => void; states: Record<LegalLang, LangTabState>; disabledEmpty?: boolean }) {
  const t = useTranslations("admin.legal");
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const move = (dir: 1 | -1) => {
    const list = LEGAL_LANGS.filter((l) => !(disabledEmpty && states[l] === "empty"));
    const next = list[(list.indexOf(value) + dir + list.length) % list.length];
    if (next) {
      onChange(next);
      refs.current[next]?.focus();
    }
  };
  return (
    <div className="lgtabs" role="tablist" aria-label={t("langTabsAria")} onKeyDown={(e) => { if (e.key === "ArrowRight") move(1); else if (e.key === "ArrowLeft") move(-1); }}>
      {LEGAL_LANGS.map((l) => {
        const Flag = LANG_FLAG[l];
        const st = states[l];
        const off = disabledEmpty && st === "empty";
        return (
          <button
            key={l}
            ref={(el) => { refs.current[l] = el; }}
            type="button"
            role="tab"
            id={`lgtab-${l}`}
            aria-selected={value === l}
            tabIndex={value === l ? 0 : -1}
            disabled={off}
            className="lgtabs__t"
            data-state={st}
            onClick={() => onChange(l)}
          >
            <Flag />
            <span>{t(`lang.${l}`)}</span>
            {l === "uz" && !disabledEmpty ? <small>{t("required")}</small> : null}
            <i className="lgtabs__dot" aria-label={t(`langState.${st}`)} />
          </button>
        );
      })}
    </div>
  );
}

type EditTarget = { base: ConsentDoc | null; slug: string };

function EditModal({ target, name, onClose, onSaved, onForbidden }: { target: EditTarget | null; name: string; onClose: () => void; onSaved: () => void; onForbidden: () => void }) {
  const t = useTranslations("admin.legal");
  const base = target?.base ?? null;
  const fresh = !base;
  const [form, setForm] = useState<{ slug: string; version: string; draft: LegalDraft; active: boolean; major: boolean; key: string }>({ slug: "", version: "1.0", draft: emptyDraft(), active: true, major: true, key: "" });
  const [lang, setLang] = useState<LegalLang>("uz");
  const [errors, setErrors] = useState<LegalDraftErrors>({});
  const [tried, setTried] = useState(false);
  // Re-seed the form when a different document opens (compared during render).
  const key = target ? `${target.slug}|${base?.id ?? "new"}` : "";
  if (target && form.key !== key) {
    // A new version starts from the active one's translations.
    setForm({ slug: target.slug, version: base ? base.version : "1.0", draft: draftOf(base), active: true, major: true, key });
    setLang("uz");
    setErrors({});
    setTried(false);
  }
  const [busy, setBusy] = useState(false);
  const local = validateDraft(form.draft);
  const shown: LegalDraftErrors = tried ? { ...local, ...errors } : errors;
  const states = Object.fromEntries(
    LEGAL_LANGS.map((l) => [l, shown[`${l}.title`] || shown[`${l}.body`] ? "error" : langState(form.draft, l)]),
  ) as Record<LegalLang, LangTabState>;
  const missing = missingLangs(form.draft, base?.availableLanguages ?? []);
  const setText = (part: LegalPart, v: string) => {
    setForm((f) => ({ ...f, draft: { ...f.draft, [lang]: { ...f.draft[lang], [part]: v } } }));
    setErrors((e) => {
      const k = `${lang}.${part}` as const;
      if (!e[k]) return e;
      const n = { ...e };
      delete n[k];
      return n;
    });
  };
  const errText = (k: `${LegalLang}.${LegalPart}`) => {
    const why = shown[k];
    if (!why) return "";
    const [l, part] = k.split(".") as [LegalLang, LegalPart];
    return why === "required" ? t(`err.uzRequired.${part}`) : t(`err.pair.${part}`, { language: t(`lang.${l}`) });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setTried(true);
    if (Object.keys(local).length) {
      setLang(firstErrorLang(local) ?? lang);
      return;
    }
    setBusy(true);
    const head = `${name || form.slug} · ${fresh ? `v${form.version.trim()}` : t(form.major ? "levelMajor" : "levelMinor")}`;
    try {
      const i18n = i18nPayload(form.draft);
      if (base) await createConsentVersion(base.id, { ...i18n, major: form.major, active: form.active });
      else await createConsentDoc({ ...i18n, slug: form.slug.trim(), version: form.version.trim(), active: form.active, major: form.major });
      notify.success(t("saved"), { id: "legal-save", body: head });
      onSaved();
    } catch (err) {
      const mapped = serverDraftErrors(err, form.draft);
      if (mapped) {
        setErrors(mapped);
        setLang(firstErrorLang(mapped) ?? lang);
        notify.error(t("saveFailed"), { id: "legal-save", body: t("fixTabs") });
      } else {
        const soon = t("noWriteApiShort");
        notify.error(t("saveFailed"), { id: "legal-save", error: err, map: { 403: t("forbidden"), 404: soon, 405: soon, 501: soon } });
        if (isForbidden(err)) onForbidden();
      }
    } finally {
      setBusy(false);
    }
  }
  const levelOpts = [{ value: "major", label: t("levelMajor") }, { value: "minor", label: t("levelMinor") }];
  const text = form.draft[lang];
  const tErr = errText(`${lang}.title`);
  const bErr = errText(`${lang}.body`);

  return (
    <Modal open={!!target} onClose={onClose} title={fresh ? t("newDocTitle") : t("newVersionOf", { doc: name, version: base?.version ?? "" })}>
      <form className="cform lgform" style={{ maxWidth: "none" }} onSubmit={submit} noValidate>
        {fresh ? (
          <div className="cform__row2">
            <div>
              <label htmlFor="lg-slug">{t("slug")}</label>
              <input id="lg-slug" value={form.slug} onChange={(ev) => setForm((f) => ({ ...f, slug: ev.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))} placeholder="user_offer" readOnly={!!target?.slug} className={target?.slug ? "rf__ro" : undefined} />
            </div>
            <div>
              <label htmlFor="lg-version">{t("version")}</label>
              <input id="lg-version" value={form.version} onChange={(ev) => setForm((f) => ({ ...f, version: ev.target.value }))} placeholder="1.0" />
            </div>
          </div>
        ) : null}

        <LangTabs value={lang} onChange={setLang} states={states} />
        <div className="lgform__pane" role="tabpanel" aria-labelledby={`lgtab-${lang}`}>
          <p className="rf__hint">{lang === "uz" ? t("uzHint") : t("optionalHint", { language: t(`lang.${lang}`) })}</p>
          <div>
            <label htmlFor="lg-title">{t("docTitle")}{lang === "uz" ? " *" : ""}</label>
            <input id="lg-title" lang={lang} value={text.title} onChange={(ev) => setText("title", ev.target.value)} aria-invalid={!!tErr || undefined} aria-describedby={tErr ? "lg-title-err" : undefined} />
            {tErr ? <p className="lgform__err" id="lg-title-err">{tErr}</p> : null}
          </div>
          <div>
            <label htmlFor="lg-body">{t("body")}{lang === "uz" ? " *" : ""}</label>
            <textarea id="lg-body" lang={lang} rows={12} value={text.body} onChange={(ev) => setText("body", ev.target.value)} placeholder={t("bodyPh")} aria-invalid={!!bErr || undefined} aria-describedby={bErr ? "lg-body-err" : undefined} />
            {bErr ? <p className="lgform__err" id="lg-body-err">{bErr}</p> : null}
            <p className="rf__hint">{t("bodyHint", { n: text.body.length })}</p>
          </div>
        </div>

        {missing.length ? (
          <div className="lgform__warn" role="note">
            <IconAlert aria-hidden="true" />
            <div>
              {missing.map((m) => (
                <p key={m.lang}>
                  {fresh
                    ? t("warn.notPublished", { language: t(`lang.${m.lang}`) })
                    : m.had
                      ? t("warn.removed", { language: t(`lang.${m.lang}`) })
                      : t("warn.notInVersion", { language: t(`lang.${m.lang}`) })}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        <div className="cform__row2">
          <div>
            <label>{t("level")}</label>
            <Select value={form.major ? "major" : "minor"} onChange={(v) => setForm((f) => ({ ...f, major: v === "major" }))} options={levelOpts} ariaLabel={t("level")} />
            <p className="rf__hint">{form.major ? t("levelMajorHint") : t("levelMinorHint")}</p>
          </div>
          <div>
            <div style={{ marginTop: 26 }}>
              <CheckBox checked={form.active} onChange={(on) => setForm((f) => ({ ...f, active: on }))}>
                {t("activeNow")}
              </CheckBox>
            </div>
          </div>
        </div>
        <button type="submit" className="btn btn--pri btn--full" disabled={busy || !form.slug || (fresh && !form.version.trim())}>
          {busy ? t("saving") : t("publish")}
        </button>
        <p className="rf__hint">{fresh ? t("publishHint") : t("versionHint")}</p>
      </form>
    </Modal>
  );
}

function Journal() {
  const locale = useLocale();
  const t = useTranslations("admin.legal");
  const [userSel, setUserSel] = useState<string[]>([]);
  const userId = userSel[0] ?? "";
  const [names, setNames] = useState<Record<string, string>>({});
  const [slug, setSlug] = useState("all");
  const rows = useResource(() => listUserConsents(userId), [userId]);
  const slugOpts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows.data) if (r.slug) counts.set(r.slug, (counts.get(r.slug) ?? 0) + 1);
    if (slug !== "all" && !counts.has(slug)) counts.set(slug, 0);
    const name = (x: string) => (t.has(`slugs.${x}`) ? t(`slugs.${x}`) : x);
    return [
      { value: "all", label: `${t("allDocs")} (${rows.data.length})` },
      ...[...counts.keys()].sort().map((x) => ({ value: x, label: `${name(x)} (${counts.get(x) ?? 0})` })),
    ];
  }, [rows.data, slug, t]);
  const list: UserConsentRow[] = slug === "all" ? rows.data : rows.data.filter((r) => r.slug === slug);
  const wrapRef = useRef<HTMLDivElement>(null);
  useScrollEdges(wrapRef, { silent: true });
  const findUsers = (q: string) =>
    searchUsers(q).then((found) => {
      const opts: SearchOption[] = found.map((u) => ({ value: u.id, label: u.name || u.lexgoId || u.id, sub: u.phone }));
      setNames((cur) => {
        const next = { ...cur };
        for (const o of opts) next[o.value] = o.label;
        return next;
      });
      return opts;
    });

  return (
    <div className="ppanel" data-ai-target="legal:journal">
      <div className="ppanel__h">
        <b>{t("journalTitle")}</b>
        <span className="advmuted">{rows.status === "ready" ? t("rows", { n: list.length }) : ""}</span>
      </div>
      <p className="ppanel__note">{t("journalLead")}</p>
      <FilterBar
        className="uf--tray legalf"
        fields={[
          {
            key: "user",
            label: t("userId"),
            icon: IconUser,
            wide: true,
            active: Boolean(userId),
            chip: userId ? `${t("userId")}: ${names[userId] || userId}` : null,
            clear: () => setUserSel([]),
            node: (
              <SearchSelect
                value={userSel}
                onChange={setUserSel}
                options={userId ? [{ value: userId, label: names[userId] || userId }] : []}
                onSearch={findUsers}
                placeholder={t("userIdPh")}
                searchPlaceholder={t("userIdPh")}
                emptyText={t("noUsers")}
                ariaLabel={t("userId")}
                removeLabel={t("clear")}
                single
              />
            ),
          },
          { key: "doc", label: t("doc"), icon: IconFileText, value: slug, empty: "all", onChange: setSlug, options: slugOpts },
        ]}
        count={rows.status === "ready" ? list.length : undefined}
      />
      {rows.status === "loading" ? (
        <Skeleton rows={5} />
      ) : rows.status === "error" ? (
        <ErrorState title={t("loadError")} error={rows.error} onRetry={rows.refresh} />
      ) : !list.length ? (
        <EmptyState icon={<IconShieldCheck />} title={t("journalEmpty")} text={t("journalEmptyText")} />
      ) : (
        <div ref={wrapRef} className="scue-x" style={{ overflowX: "auto" }}>
          <table className="ptable">
            <thead>
              <tr><th>{t("when")}</th><th>{t("user")}</th><th>{t("doc")}</th><th>{t("version")}</th><th>IP</th></tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>{fmt(r.acceptedAt, locale)}</td>
                  <td><PersonName id={r.userId} withPhone /></td>
                  <td>{t.has(`slugs.${r.slug}`) ? t(`slugs.${r.slug}`) : r.slug || "—"}</td>
                  <td>v{r.version}</td>
                  <td>{r.ip || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
