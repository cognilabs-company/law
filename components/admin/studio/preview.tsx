"use client";

import { useState, type ReactNode } from "react";
import { MASK, type StudioPreviewItem, type StudioVisualPreview } from "@/lib/services/studio";
import { IconCheck, IconClose, IconLock } from "@/components/icons";
import { useStudioHuman } from "./human";

// The live preview: what the form holds, drawn the way the page will show
// it — a title as a title, a text as its paragraphs, a picture as a
// picture, a list as its rows. Nothing is folded into "5 settings": what is
// nested is opened as a block of its own. A masked value is the mask and
// nothing else (no tooltip, no copy, never logged).

type Dict = Record<string, unknown>;
type Item = StudioPreviewItem & { label: string };

const isDict = (v: unknown): v is Dict => !!v && typeof v === "object" && !Array.isArray(v);
const isUuid = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i.test(v);
const isScalar = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);
// A link to another record or a system name: the page never shows these.
const SYSTEM_KEY = /(^|_)(id|ids|key|slug|uuid|hash)$/;
const MONEY_KEY = /price|amount|budget|fee|payout|salary|monthly|yearly|six_month/;
const LANG_KEYS = ["uz_latn", "uz-latn", "uz", "uz_cyrl", "uz-cyrl", "ru", "en", "kaa"];
const BY_LOCALE: Record<string, string[]> = { uz: ["uz_latn", "uz-latn", "uz"], ru: ["ru"], en: ["en"] };
const isUrl = (v: unknown): v is string => typeof v === "string" && /^(https?:\/\/|\/)\S+$/.test(v.trim());

// Rich text as the reader sees it: the tags are gone, the paragraphs stay.
function plain(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// A picture the admin gave by its address — any host, so a plain img. An
// address that does not load leaves the empty frame, not a broken icon.
function Picture({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="stu-pv__thumb" aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="stu-pv__img" src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

export function PreviewView({ visual }: { visual: StudioVisualPreview }) {
  const hm = useStudioHuman();
  const { t, h, locale } = hm;

  // A text kept in several languages reads in the reader's own.
  const local = (v: unknown): unknown => {
    if (!isDict(v)) return v;
    const keys = Object.keys(v);
    if (!keys.length || !keys.every((k) => LANG_KEYS.includes(k))) return v;
    for (const k of BY_LOCALE[locale] ?? []) if (v[k] !== undefined && v[k] !== "" && v[k] !== null) return v[k];
    return keys.map((k) => v[k]).find((x) => x !== undefined && x !== "" && x !== null) ?? "";
  };
  const str = (v: unknown): string => {
    const x = local(v);
    return typeof x === "string" ? x.trim() : typeof x === "number" ? String(x) : "";
  };
  const say = (k: string, v: unknown): string => {
    if (v === MASK) return MASK;
    if (typeof v === "number" && MONEY_KEY.test(k)) return h("pv.sum", { n: hm.num(v) });
    return hm.value(v, k);
  };
  const empty = (v: unknown): boolean => v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length) || (isDict(v) && !Object.keys(v).length);
  // What the page never shows: nothing, a link to another record, a system name.
  const hidden = (k: string, v: unknown): boolean => {
    if (v === MASK) return false;
    if (empty(v) || isUuid(v)) return true;
    if (Array.isArray(v)) return v.every((x) => isUuid(x));
    return isScalar(v) && typeof v !== "boolean" && SYSTEM_KEY.test(k);
  };
  const nameOf = (d: Dict, n: number): string => {
    for (const k of ["title", "label", "name", "question"]) if (str(d[k])) return str(d[k]);
    return h("listItem", { n });
  };

  const chips = (k: string, list: unknown[]) => (
    <span className="stu-pv__chips">
      {list.slice(0, 12).map((x, i) => (
        <span key={i}>{say(k, x)}</span>
      ))}
      {list.length > 12 ? <span>{h("count.more", { n: list.length - 12 })}</span> : null}
    </span>
  );

  // A block of named values. A value that holds values of its own opens as
  // a block inside; a list of things, as a card for each.
  const rows = (entries: [string, unknown, string?][], depth = 0): ReactNode => {
    const shown = entries.map(([k, v, l]) => [k, local(v), l] as [string, unknown, string?]).filter(([k, v]) => !hidden(k, v));
    if (!shown.length) return null;
    const flat = shown.filter(([, v]) => isScalar(v) || v === MASK || (Array.isArray(v) && v.every(isScalar)));
    const deep = shown.filter((e) => !flat.includes(e));
    return (
      <>
        {flat.length ? (
          <dl className="stu-pv__kv">
            {flat.map(([k, v, l]) => (
              <div key={k}>
                <dt>{l ?? hm.fieldLabel(k)}</dt>
                <dd>
                  {v === MASK ? (
                    <span className="stu-pv__mask">
                      <IconLock aria-hidden />
                      {MASK}
                    </span>
                  ) : Array.isArray(v) ? (
                    chips(k, v)
                  ) : (
                    say(k, v)
                  )}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {deep.map(([k, v, l]) => (
          <div key={k} className="stu-pv__grp">
            <b>{l ?? hm.fieldLabel(k)}</b>
            {depth >= 2 ? (
              <span className="stu-pv__muted">{hm.value(v, k)}</span>
            ) : Array.isArray(v) ? (
              <ul className="stu-pv__cards">
                {v.slice(0, 6).map((x, i) =>
                  isDict(x) ? (
                    <li key={i}>
                      <b>{nameOf(x, i + 1)}</b>
                      {rows(Object.entries(x).filter(([kk]) => !["title", "label", "name", "question", "order", "sort_order"].includes(kk)), depth + 1)}
                    </li>
                  ) : (
                    <li key={i}>{say(k, x)}</li>
                  ),
                )}
                {v.length > 6 ? <li className="stu-pv__muted">{h("count.more", { n: v.length - 6 })}</li> : null}
              </ul>
            ) : (
              rows(Object.entries(v as Dict), depth + 1)
            )}
          </div>
        ))}
      </>
    );
  };

  const items: Item[] = visual.items.map((i) => ({ ...i, label: hm.fieldLabel(i.key, i.label) }));
  const used = new Set<string>();
  const take = (rx: RegExp, ok: (v: unknown) => boolean = (v) => !empty(v)): Item | undefined => {
    const i = items.find((x) => !used.has(x.key) && !x.masked && rx.test(x.key) && ok(local(x.value)));
    if (i) used.add(i.key);
    return i;
  };
  const rest = () => rows(items.filter((i) => !used.has(i.key)).map((i) => [i.key, i.masked ? MASK : i.value, i.label]));
  const text = (i?: Item) => (i ? str(i.value) : "");
  const listOf = (i?: Item): unknown[] => (i && Array.isArray(i.value) ? i.value : []);
  const dictOf = (i?: Item): Dict => (i && isDict(i.value) ? i.value : {});
  const isText = (v: unknown) => typeof v === "string" && !!v.trim();
  const isDicts = (v: unknown) => Array.isArray(v) && v.length > 0 && v.every(isDict);

  // A long text with its paragraphs; a {placeholder} shows by the name of
  // the field that fills it.
  const paragraphs = (body: string, names: Record<string, string> = {}) =>
    plain(body)
      .split(/\n{2,}/)
      .map((p, i) => (
        <p key={i}>
          {p.split(/(\{\{?\s*[\w.]+\s*\}?\})/).map((part, j) => {
            const m = /^\{\{?\s*([\w.]+)\s*\}?\}$/.exec(part);
            return m ? <mark key={j}>{names[m[1]] ?? hm.fieldLabel(m[1])}</mark> : part;
          })}
        </p>
      ));
  // The fields a person will fill in, drawn as the empty form they will meet.
  const formFields = (list: unknown[]) => (
    <div className="stu-pv__form">
      {list.filter(isDict).slice(0, 8).map((f, i) => (
        <label key={i}>
          <span>
            {nameOf(f, i + 1)}
            {f.required === true ? <i aria-hidden> *</i> : null}
          </span>
          <span className="stu-pv__input">{str(f.placeholder)}</span>
        </label>
      ))}
    </div>
  );

  switch (visual.type) {
    case "document": {
      const title = take(/^(title|name)(_i18n)?$/, isText);
      const body = take(/^(template_text|body|content|text)$/, isText) ?? take(/^(body|content|text)_i18n$/, (v) => isText(v));
      take(/^(title|body|content|text)_i18n$/);
      const lead = take(/^(description|summary)$/, isText);
      const meta = [take(/^category$/, isText), take(/^document_type$/, isText), take(/^language$/, isText), take(/^version$/)].filter((x): x is Item => !!x);
      const fields = take(/^fields$/, isDicts);
      const sections = take(/^sections$/, isDicts);
      const names: Record<string, string> = {};
      for (const f of listOf(fields)) if (isDict(f) && str(f.name)) names[str(f.name)] = nameOf(f, 0);
      return (
        <div className="stu-pv stu-pv--doc">
          <div className="stu-pv__paper">
            <span className="stu-pv__fold" aria-hidden />
            <h4>{text(title) || h("pv.untitled")}</h4>
            {meta.length ? (
              <span className="stu-pv__chips">
                {meta.map((m) => (
                  <span key={m.key} title={m.label}>{say(m.key, m.value)}</span>
                ))}
              </span>
            ) : null}
            {lead ? <p className="stu-pv__lead">{text(lead)}</p> : null}
            {body ? <div className="stu-pv__text">{paragraphs(text(body), names)}</div> : null}
            {listOf(sections).filter(isDict).slice(0, 6).map((s, i) => (
              <div key={i} className="stu-pv__docsec">
                <b>{nameOf(s, i + 1)}</b>
                {str(s.description) ? <small>{str(s.description)}</small> : null}
                {Array.isArray(s.fields) ? formFields(s.fields) : null}
              </div>
            ))}
            {fields ? (
              <div className="stu-pv__docsec">
                <b>{fields.label}</b>
                {formFields(listOf(fields))}
              </div>
            ) : null}
          </div>
          {rest()}
        </div>
      );
    }
    case "communication": {
      const channels = take(/^channels?$/);
      const messages = take(/^messages?$/, (v) => isDict(v) || isText(v));
      const bodyItem = messages ? undefined : take(/^(body|text|template|content)$/, isText);
      const msg = messages ? local(messages.value) : undefined;
      const vars: Record<string, string> = {};
      const variables = items.find((i) => i.key === "variables");
      for (const v of listOf(variables)) if (isDict(v) && str(v.key)) vars[str(v.key)] = str(v.example) || nameOf(v, 0);
      const title = isDict(msg) ? str(msg.title) : "";
      const body = isDict(msg) ? str(msg.body) || str(msg.text) : str(msg) || text(bodyItem);
      const list = channels ? (Array.isArray(channels.value) ? channels.value : [channels.value]) : [];
      return (
        <div className="stu-pv stu-pv--comm">
          {list.length ? <span className="stu-pv__chips is-chan">{list.map((c, i) => <span key={i}>{say("channels", c)}</span>)}</span> : null}
          {title || body ? (
            <div className="stu-pv__bubble">
              {title ? <b>{title}</b> : null}
              {body ? paragraphs(body, vars) : null}
            </div>
          ) : null}
          {rest()}
        </div>
      );
    }
    case "marketplace_card": {
      const hero = dictOf(take(/^hero$/, isDict));
      const cta = dictOf(take(/^cta$/, isDict));
      const image = take(/(image|photo|cover|banner|thumbnail|logo)(_url)?$/, isText);
      const src = [text(image), str(hero.image_url), str(hero.image)].find(isUrl);
      const title = take(/^(title|name)$/, isText);
      const desc = take(/^(description|summary|subtitle)$/, isText);
      const value = take(/^client_value$/, isText);
      const price = take(/^(price|base_price|min_price)$/, (v) => typeof v === "number");
      const max = take(/^max_price$/, (v) => typeof v === "number");
      const included = take(/^included$/, Array.isArray);
      const excluded = take(/^excluded$/, Array.isArray);
      const faq = take(/^faq$/, isDicts);
      const blocks = take(/^blocks$/, isDicts);
      const button = str(hero.cta_label) || str(cta.label);
      const name = text(title) || str(hero.title);
      const sub = text(desc) || str(hero.subtitle);
      return (
        <div className="stu-pv stu-pv--card">
          <div className="stu-pv__mcard">
            <Picture key={src ?? ""} src={src} />
            <b>{name || h("pv.untitled")}</b>
            {sub ? <p>{sub}</p> : null}
            {value ? <p className="stu-pv__value">{text(value)}</p> : null}
            {price ? (
              <span className="stu-pv__price">
                {say("price", price.value)}
                {max && max.value !== price.value ? ` – ${say("price", max.value)}` : ""}
              </span>
            ) : null}
            {included || excluded ? (
              <ul className="stu-pv__incl">
                {listOf(included).slice(0, 8).map((x, i) => (
                  <li key={`i${i}`}><IconCheck aria-hidden />{say("included", x)}</li>
                ))}
                {listOf(excluded).slice(0, 6).map((x, i) => (
                  <li key={`e${i}`} className="is-out"><IconClose aria-hidden />{say("excluded", x)}</li>
                ))}
              </ul>
            ) : null}
            {button ? <span className="stu-pv__btn">{button}</span> : null}
          </div>
          {listOf(blocks).filter(isDict).slice(0, 6).map((b, i) => (
            <div key={i} className="stu-pv__block">
              <b>{nameOf(b, i + 1)}</b>
              {str(b.content) || str(b.text) ? <div className="stu-pv__text">{paragraphs(str(b.content) || str(b.text))}</div> : null}
            </div>
          ))}
          {faq ? (
            <div className="stu-pv__grp">
              <b>{faq.label}</b>
              <ul className="stu-pv__faq">
                {listOf(faq).filter(isDict).slice(0, 6).map((q, i) => (
                  <li key={i}>
                    <b>{str(q.question) || nameOf(q, i + 1)}</b>
                    {str(q.answer) ? <p>{plain(str(q.answer))}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {rest()}
        </div>
      );
    }
    case "pricing": {
      const title = take(/^(title|name)$/, isText);
      const lead = take(/^description$/, isText);
      return (
        <div className="stu-pv stu-pv--pricing">
          {title ? <b className="stu-pv__h">{text(title)}</b> : null}
          {lead ? <p className="stu-pv__lead">{text(lead)}</p> : null}
          {rest()}
          <p className="stu-pv__note">{t("ux.pricingNote")}</p>
        </div>
      );
    }
    case "kanban":
    case "workflow": {
      const title = take(/^(title|name)$/, isText);
      const cols = take(/^(steps|columns|stages|items|tasks)$/, isDicts) ?? take(/./, isDicts);
      const list = listOf(cols).filter(isDict);
      return (
        <div className={`stu-pv stu-pv--${visual.type}`}>
          {title ? <b className="stu-pv__h">{text(title)}</b> : null}
          {list.length ? (
            visual.type === "kanban" ? (
              <div className="stu-pv__cols">
                {list.slice(0, 8).map((c, i) => (
                  <div key={i} className="stu-pv__col">
                    <b>{nameOf(c, i + 1)}</b>
                    <span className="stu-pv__ghost" />
                    <span className="stu-pv__ghost is-short" />
                  </div>
                ))}
              </div>
            ) : (
              <ol className="stu-pv__steps">
                {list.slice(0, 10).map((c, i) => (
                  <li key={i}>
                    <span>{i + 1}</span>
                    <b>{nameOf(c, i + 1)}</b>
                    {c.required === true ? <i aria-hidden>*</i> : null}
                  </li>
                ))}
              </ol>
            )
          ) : null}
          {rest()}
        </div>
      );
    }
    case "dashboard": {
      const title = take(/^(title|name)$/, isText);
      const widgets = take(/^widgets$/, isDicts) ?? take(/^metrics$/, isDicts);
      return (
        <div className="stu-pv stu-pv--dash">
          {title ? <b className="stu-pv__h">{text(title)}</b> : null}
          {widgets ? (
            <div className="stu-pv__widgets">
              {listOf(widgets).filter(isDict).slice(0, 6).map((w, i) => (
                <div key={i} className="stu-pv__widget">
                  <small>{nameOf(w, i + 1)}</small>
                  <b>—</b>
                  <span className="stu-pv__spark" aria-hidden />
                </div>
              ))}
            </div>
          ) : null}
          {rest()}
        </div>
      );
    }
    case "table": {
      const table = take(/^(items|rows|columns)$/, isDicts) ?? take(/./, isDicts);
      const list = listOf(table).filter(isDict).slice(0, 8);
      const cols = list.length ? Object.keys(list[0]).filter((k) => list.some((r) => isScalar(r[k]) && !hidden(k, r[k]))).slice(0, 4) : [];
      return (
        <div className="stu-pv stu-pv--table">
          {table && cols.length ? (
            <div className="stu-pv__scroll">
              <table className="stu-pv__table">
                <thead>
                  <tr>{cols.map((c) => <th key={c}>{hm.fieldLabel(c)}</th>)}</tr>
                </thead>
                <tbody>
                  {list.map((r, i) => (
                    <tr key={i}>{cols.map((c) => <td key={c}>{say(c, local(r[c]))}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {rest()}
        </div>
      );
    }
    case "security_matrix": {
      const role = take(/^role$/, isText);
      const perms = take(/^permissions$/, Array.isArray);
      return (
        <div className="stu-pv stu-pv--sec">
          {role ? <b className="stu-pv__h">{hm.role(text(role))}</b> : null}
          {perms ? (
            <ul className="stu-pv__incl">
              {listOf(perms).slice(0, 14).map((p, i) => (
                <li key={i}><IconCheck aria-hidden />{say("permissions", p)}</li>
              ))}
            </ul>
          ) : null}
          {rest()}
        </div>
      );
    }
    case "integration":
      return (
        <div className="stu-pv stu-pv--int">
          {rest()}
          <p className="stu-pv__note"><IconLock aria-hidden />{t("ux.secretsNote")}</p>
        </div>
      );
    default: {
      const title = take(/^(title|name)$/, isText);
      return (
        <div className="stu-pv stu-pv--summary">
          {title ? <b className="stu-pv__h">{text(title)}</b> : null}
          {rest()}
        </div>
      );
    }
  }
}
