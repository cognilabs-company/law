"use client";

import "../sx-core.css";
import "../sx-form.css";
import { useId, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { aiId } from "@/lib/ai/ids";
import { SxButton } from "../Button";
import { ArrowCounterClockwiseIcon, CheckCircleIcon, MagnifyingGlassIcon, PLACEMENT_ICON, STATUS_ICON, ctorIcon } from "../icons";
import type { SxErrors, SxOption, SxRule, SxStatusKey } from "../types";
import { useStudioLabels, type StudioLabels } from "../useStudioLabels";
import { ChoiceCards, type ChoiceCard } from "../form/ChoiceCards";
import { DateField } from "../form/DateField";
import { Field, FormGrid } from "../form/Field";
import { useSxFormPolicy } from "../form/formPolicy";
import { KeyValue } from "../form/KeyValue";
import { MoneyInput } from "../form/MoneyInput";
import { NumberInput } from "../form/NumberInput";
import { Picker } from "../form/Picker";
import { Repeater } from "../form/Repeater";
import { Switch } from "../form/Switch";
import { TextArea, TextCount } from "../form/TextArea";
import { TextInput } from "../form/TextInput";
import { useReferenceOptions } from "../form/useReferenceOptions";

const AI = "admin.studio.lab.form";
const PROMO = "K12-PROMO";
const PACKAGE = "K03-M";
const BADGE_MAX = 40;
const STATUS_KEYS: readonly SxStatusKey[] = ["draft", "submitted", "in_review", "approved", "published", "returned", "archived"];
const PLACEMENTS = ["banner", "profile_boost", "service_boost"] as const;
const PLACEMENT_RULE: Readonly<Record<string, string>> = {
  banner: "sx.placementRule.bannerAsset",
  profile_boost: "sx.placementRule.none",
  service_boost: "sx.placementRule.service",
};
const CTOR_SAMPLE: readonly (readonly [string, string])[] = [
  ["K01", "services_packages"],
  ["K02", "services_packages"],
  ["K29", "services_packages"],
  ["K03-M", "services_packages"],
  ["K30", "services_packages"],
  ["K07", "documents_texts"],
  ["K06", "documents_texts"],
  ["K05", "documents_texts"],
  ["K26", "documents_texts"],
  ["K11", "documents_texts"],
  ["K17", "finance_tariffs"],
  ["K04", "finance_tariffs"],
  ["K18", "finance_tariffs"],
  ["K25", "finance_tariffs"],
  ["MP02", "finance_tariffs"],
  ["SEC01", "security_access"],
  ["K20", "security_access"],
  ["MP04", "advertising"],
  ["K12-PROMO", "advertising"],
  ["MP09", "advertising"],
];
const TIER_CODES = ["BASIC", "STANDARD", "PREMIUM"] as const;

type Tier = { tier: string; title: string; price: number | undefined; included: string[] };

function seedTiers(): Tier[] {
  return [
    { tier: "BASIC", title: "Maslahat", price: 300000, included: ["Huquqiy maslahat", "Hujjatlarni ko'rib chiqish"] },
    { tier: "STANDARD", title: "Maslahat va hujjatlar", price: 900000, included: ["Da'vo arizasini tayyorlash"] },
    { tier: "PREMIUM", title: "", price: undefined, included: [] },
  ];
}

const SETTINGS_SEED: Readonly<Record<string, unknown>> = {
  enabled: true,
  timeout: 10,
  provider: "eskiz",
  sender_name: "LexGo",
  retry_policy: { attempts: 3, backoff: "exponential" },
};
const KNOWN_SETTINGS: ReadonlySet<string> = new Set(["enabled", "timeout", "provider"]);

function Section({ title, lead, actions, children }: { title: string; lead?: string; actions?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section className="sx-lab-form__sec" aria-labelledby={id}>
      <div className="sx-lab-form__head">
        <h3 id={id}>{title}</h3>
        {actions ? <div className="sx-lab-form__acts">{actions}</div> : null}
      </div>
      {lead ? <p className="sx-lab-form__lead">{lead}</p> : null}
      {children}
    </section>
  );
}

function placementOptions(labels: StudioLabels): SxOption[] {
  return PLACEMENTS.map((key) => ({ value: key, label: labels.placement(key), description: labels.placementWhat(key), icon: PLACEMENT_ICON[key] }));
}

function FieldStates() {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const policy = useSxFormPolicy();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("profile-7");
  const [placement, setPlacement] = useState("");
  const [days, setDays] = useState<number | undefined>(7);
  const [daysBad, setDaysBad] = useState(false);
  const [price, setPrice] = useState<number | undefined>(undefined);
  const [boost, setBoost] = useState<number | undefined>(1.5);
  const [needsService, setNeedsService] = useState(false);
  const [badge, setBadge] = useState("");

  const rules: Readonly<Record<string, SxRule>> = {
    title: { type: "text", key: "title", ctor: PROMO },
    placement: { type: "select", key: "placement", ctor: PROMO, source: "promotion-placements" },
    days: { type: "number", key: "days", ctor: PROMO, min: 1, max: 90 },
    price: { type: "money", key: "price", ctor: PROMO, min: 0 },
  };
  const raw: Record<string, string> = {};
  if (!title.trim()) raw.title = "@required";
  if (!placement) raw.placement = "@required";
  if (daysBad) raw.days = "@number";
  else if (days === undefined) raw.days = "@required";
  else if (days < 1) raw.days = "@min";
  else if (days > 90) raw.days = "@max";
  if (price === undefined) raw.price = "@required";
  const errors: SxErrors = raw;
  const err = (path: string): string => {
    const token = policy.visible(path, errors);
    return token ? labels.error(token, rules[path]) : "";
  };
  const id = (part: string) => `${uid}-${part}`;
  const scope = { ctor: PROMO };

  const reset = () => {
    policy.reset();
    setTitle("");
    setCode("profile-7");
    setPlacement("");
    setDays(7);
    setDaysBad(false);
    setPrice(undefined);
    setBoost(1.5);
    setNeedsService(false);
    setBadge("");
  };

  return (
    <Section
      title={t("sx.form.lab.fields")}
      lead={t("sx.form.lab.note")}
      actions={
        <>
          <SxButton size="sm" variant="ghost" icon={ArrowCounterClockwiseIcon} onClick={reset} aiId={aiId(AI, "reset")}>
            {t("sx.form.lab.reset")}
          </SxButton>
          <SxButton size="sm" variant="secondary" icon={CheckCircleIcon} onClick={policy.markSubmitted} aiId={aiId(AI, "check")}>
            {t("sx.form.lab.check")}
          </SxButton>
        </>
      }
    >
      <FormGrid>
        <Field id={id("title")} label={labels.field("title", scope)} required error={err("title")}>
          {(a) => (
            <TextInput
              {...a}
              value={title}
              onChange={setTitle}
              onBlur={() => policy.touch("title")}
              placeholder={labels.placeholder("title", scope)}
              aiId={aiId(AI, "title")}
              aiLabel={labels.field("title", scope)}
            />
          )}
        </Field>
        <Field id={id("code")} span={1} label={labels.field("code", scope)} help={labels.help("code", scope)}>
          {(a) => (
            <TextInput {...a} mono value={code} onChange={setCode} placeholder={labels.placeholder("code", scope)} aiId={aiId(AI, "code")} aiLabel={labels.field("code", scope)} />
          )}
        </Field>
        <Field id={id("placement")} span={1} label={labels.field("placement", scope)} required error={err("placement")}>
          {(a) => (
            <Picker
              id={a.id}
              aria-labelledby={a["aria-labelledby"]}
              aria-describedby={a["aria-describedby"]}
              invalid={!!a["aria-invalid"]}
              required
              label={labels.field("placement", scope)}
              options={placementOptions(labels)}
              value={placement}
              onChange={setPlacement}
              onBlur={() => policy.touch("placement")}
              aiId={aiId(AI, "placement")}
            />
          )}
        </Field>
        <Field id={id("days")} span={1} label={labels.field("days", scope)} hint={labels.hint(rules.days)} required error={err("days")}>
          {(a) => (
            <NumberInput
              {...a}
              value={days}
              onChange={setDays}
              onDraftInvalid={setDaysBad}
              onBlur={() => policy.touch("days")}
              min={1}
              max={90}
              aiId={aiId(AI, "days")}
              aiLabel={labels.field("days", scope)}
            />
          )}
        </Field>
        <Field id={id("price")} span={1} label={labels.field("price", scope)} required error={err("price")}>
          {(a) => (
            <MoneyInput {...a} value={price} onChange={setPrice} onBlur={() => policy.touch("price")} aiId={aiId(AI, "price")} aiLabel={labels.field("price", scope)} />
          )}
        </Field>
        <Field id={id("boost")} span={1} label={labels.field("boost_score", scope)} help={labels.help("boost_score", scope)}>
          {(a) => <NumberInput {...a} value={boost} onChange={setBoost} aiId={aiId(AI, "boost")} aiLabel={labels.field("boost_score", scope)} />}
        </Field>
        <Field id={id("currency")} span={1} label={labels.field("currency")} readOnly value={labels.currency("UZS")} />
        <Field id={id("needs")} layout="inline" label={labels.field("requires_service", scope)}>
          {(a) => (
            <Switch
              id={a.id}
              aria-describedby={a["aria-describedby"]}
              checked={needsService}
              onChange={(v) => {
                setNeedsService(v);
                policy.touch("requires_service");
              }}
              aiId={aiId(AI, "requires-service")}
              aiLabel={labels.field("requires_service", scope)}
            />
          )}
        </Field>
        <Field
          id={id("badge")}
          label={labels.field("label", { ctor: PROMO, path: "preview.label" })}
          help={labels.help("label", { ctor: PROMO, path: "preview.label" })}
          labelAside={<TextCount value={badge} max={BADGE_MAX} />}
        >
          {(a) => (
            <TextArea
              {...a}
              value={badge}
              onChange={setBadge}
              maxLength={BADGE_MAX}
              minRows={2}
              maxRows={4}
              placeholder={labels.placeholder("label", { ctor: PROMO, path: "preview.label" })}
              aiId={aiId(AI, "badge")}
              aiLabel={labels.field("label", { ctor: PROMO, path: "preview.label" })}
            />
          )}
        </Field>
      </FormGrid>
    </Section>
  );
}

function TextStates() {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [query, setQuery] = useState("");
  const [percent, setPercent] = useState<number | undefined>(15);
  const [amount, setAmount] = useState<number | undefined>(1250000.5);
  const [note, setNote] = useState("");
  const id = (part: string) => `${uid}-${part}`;
  return (
    <Section title={t("sx.form.lab.text")}>
      <div className="sx-lab-form__row">
        <TextInput
          type="search"
          size="sm"
          leading={MagnifyingGlassIcon}
          value={query}
          onChange={setQuery}
          placeholder={t("sx.form.search")}
          aria-label={t("sx.form.search")}
          aiId={aiId(AI, "search")}
        />
      </div>
      <FormGrid>
        <Field id={id("value")} span={1} label={labels.field("value", { ctor: "K29", path: "sections.0.options.0.value" })} help={labels.help("value", { ctor: "K29", path: "sections.0.options.0.value" })}>
          {(a) => <NumberInput {...a} value={percent} onChange={setPercent} suffix="%" aiId={aiId(AI, "percent")} />}
        </Field>
        <Field id={id("amount")} span={1} label={labels.field("client_price")}>
          {(a) => <MoneyInput {...a} value={amount} onChange={setAmount} aiId={aiId(AI, "amount")} />}
        </Field>
        <Field id={id("locked")} span={1} label={labels.field("code", { ctor: PACKAGE, path: "package_code" })}>
          {(a) => <TextInput {...a} mono readOnly value="ajrashish-toliq" onChange={() => undefined} />}
        </Field>
        <Field id={id("off")} span={1} label={labels.field("duration", { ctor: PACKAGE })}>
          {(a) => <TextInput {...a} disabled value="" onChange={() => undefined} placeholder={labels.placeholder("duration", { ctor: PACKAGE })} />}
        </Field>
        <Field id={id("note")} label={labels.field("description")}>
          {(a) => <TextArea {...a} value={note} onChange={setNote} counter maxLength={600} aiId={aiId(AI, "note")} />}
        </Field>
      </FormGrid>
    </Section>
  );
}

function Pickers() {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const roles = useReferenceOptions("roles");
  const services = useReferenceOptions("services");
  const plans = useReferenceOptions("subscription-plans");
  const broken = useReferenceOptions("sx-lab-missing");
  const [status, setStatus] = useState("in_review");
  const [filter, setFilter] = useState("");
  const [ctor, setCtor] = useState(PROMO);
  const [roleList, setRoleList] = useState<string[]>([]);
  const [service, setService] = useState("");
  const [planList, setPlanList] = useState<string[]>([]);
  const [missing, setMissing] = useState("");
  const id = (part: string) => `${uid}-${part}`;
  const statusOptions: SxOption[] = STATUS_KEYS.map((k) => ({ value: k, label: labels.status(k), icon: STATUS_ICON[k] }));
  const ctorOptions: SxOption[] = CTOR_SAMPLE.map(([code, group]) => ({
    value: code,
    label: labels.ctorName(code),
    code,
    icon: ctorIcon(code, group),
    group: labels.groupName(group),
  }));
  const statusLabel = labels.field("status");
  return (
    <Section title={t("sx.form.lab.pickers")}>
      <div className="sx-lab-form__row">
        <Picker size="sm" label={statusLabel} options={statusOptions} value={filter} onChange={setFilter} aiId={aiId(AI, "filter")} />
      </div>
      <FormGrid>
        <Field id={id("status")} span={1} label={statusLabel}>
          {(a) => (
            <Picker id={a.id} aria-labelledby={a["aria-labelledby"]} label={statusLabel} options={statusOptions} value={status} onChange={setStatus} aiId={aiId(AI, "status")} />
          )}
        </Field>
        <Field id={id("ctor")} span={1} label={labels.field("constructor_code")}>
          {(a) => (
            <Picker
              id={a.id}
              aria-labelledby={a["aria-labelledby"]}
              label={labels.field("constructor_code")}
              options={ctorOptions}
              value={ctor}
              onChange={setCtor}
              aiId={aiId(AI, "ctor")}
            />
          )}
        </Field>
        <Field id={id("roles")} span={1} label={labels.field("roles")}>
          {(a) => (
            <Picker
              multiple
              max={3}
              id={a.id}
              aria-labelledby={a["aria-labelledby"]}
              label={labels.field("roles")}
              loadOptions={roles.loadOptions}
              resolveOptions={roles.resolveOptions}
              leadingIcon={roles.leadingIcon}
              value={roleList}
              onChange={setRoleList}
              aiId={aiId(AI, "roles")}
            />
          )}
        </Field>
        <Field id={id("service")} span={1} label={labels.field("service_id")}>
          {(a) => (
            <Picker
              id={a.id}
              aria-labelledby={a["aria-labelledby"]}
              label={labels.field("service_id")}
              loadOptions={services.loadOptions}
              resolveOptions={services.resolveOptions}
              leadingIcon={services.leadingIcon}
              value={service}
              onChange={setService}
              aiId={aiId(AI, "service")}
            />
          )}
        </Field>
        <Field id={id("plans")} span={1} label={labels.field("plans")}>
          {(a) => (
            <Picker
              multiple
              id={a.id}
              aria-labelledby={a["aria-labelledby"]}
              label={labels.field("plans")}
              loadOptions={plans.loadOptions}
              resolveOptions={plans.resolveOptions}
              leadingIcon={plans.leadingIcon}
              value={planList}
              onChange={setPlanList}
              aiId={aiId(AI, "plans")}
            />
          )}
        </Field>
        <Field id={id("missing")} span={1} label={t("sx.form.lab.broken")}>
          {(a) => (
            <Picker
              id={a.id}
              aria-labelledby={a["aria-labelledby"]}
              label={t("sx.form.lab.broken")}
              loadOptions={broken.loadOptions}
              resolveOptions={broken.resolveOptions}
              value={missing}
              onChange={setMissing}
            />
          )}
        </Field>
        <Field id={id("ro")} span={1} label={labels.field("placement", { ctor: PROMO })}>
          {(a) => (
            <Picker
              readOnly
              id={a.id}
              aria-labelledby={a["aria-labelledby"]}
              label={labels.field("placement", { ctor: PROMO })}
              options={placementOptions(labels)}
              value="banner"
              onChange={() => undefined}
            />
          )}
        </Field>
        <Field id={id("off")} span={1} label={labels.field("target_type", { ctor: "K29" })}>
          {(a) => (
            <Picker
              disabled
              id={a.id}
              aria-labelledby={a["aria-labelledby"]}
              label={labels.field("target_type", { ctor: "K29" })}
              options={[{ value: "service", label: labels.option("service", { ctor: "K29", field: "target_type" }) }]}
              value="service"
              onChange={() => undefined}
            />
          )}
        </Field>
      </FormGrid>
    </Section>
  );
}

function Dates() {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [from, setFrom] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const id = (part: string) => `${uid}-${part}`;
  return (
    <Section title={t("sx.form.lab.dates")}>
      <FormGrid>
        <Field id={id("from")} span={1} label={labels.field("effective_from")}>
          {(a) => (
            <DateField
              id={a.id}
              aria-describedby={a["aria-describedby"]}
              label={labels.field("effective_from")}
              value={from}
              onChange={(v) => setFrom(v ?? "")}
              aiId={aiId(AI, "from")}
            />
          )}
        </Field>
        <Field id={id("starts")} span={1} label={labels.field("starts_at")}>
          {(a) => (
            <DateField
              withTime
              id={a.id}
              aria-describedby={a["aria-describedby"]}
              label={labels.field("starts_at")}
              value={startsAt}
              onChange={(v) => setStartsAt(v ?? "")}
              aiId={aiId(AI, "starts")}
            />
          )}
        </Field>
        <Field id={id("ends")} span={1} label={labels.field("ends_at")}>
          {(a) => <DateField readOnly withTime id={a.id} label={labels.field("ends_at")} value="2026-10-31T18:00:00+05:00" onChange={() => undefined} />}
        </Field>
      </FormGrid>
    </Section>
  );
}

function Rows() {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [tiers, setTiers] = useState<Tier[]>(seedTiers);
  const [settings, setSettings] = useState<Record<string, unknown>>({ ...SETTINGS_SEED });
  const tierOptions: SxOption[] = TIER_CODES.map((c) => ({ value: c, label: labels.tier(c) }));
  const tiersLabel = labels.field("tiers", { ctor: PACKAGE });
  const nameOf = (key: string): string | null => {
    if (!KNOWN_SETTINGS.has(key)) return null;
    const name = labels.field(key);
    return name && name !== key ? name : null;
  };
  return (
    <Section title={t("sx.form.lab.lists")}>
      <Field as="fieldset" id={`${uid}-tiers`} label={tiersLabel} help={labels.help("tiers", { ctor: PACKAGE })}>
        <Repeater<Tier>
          id={`${uid}-tiers-list`}
          label={tiersLabel}
          itemName={labels.field("tier")}
          items={tiers}
          onChange={setTiers}
          maxItems={3}
          newItem={() => ({ tier: "", title: "", price: undefined, included: [] })}
          summary={(item) => [item.tier ? labels.tier(item.tier) : "", item.title].filter(Boolean).join(" · ")}
          meta={(item) => (item.price !== undefined ? labels.money(item.price) : null)}
          rowErrors={(i) => (tiers[i] && !tiers[i].title.trim() ? 1 : 0)}
          aiId={aiId(AI, "tiers")}
          renderItem={(item, index, set) => {
            const base = `${uid}-t${index}`;
            const path = `tiers.${index}`;
            return (
              <FormGrid>
                <Field id={`${base}-tier`} span={1} label={labels.field("tier")}>
                  {(a) => (
                    <Picker
                      id={a.id}
                      aria-labelledby={a["aria-labelledby"]}
                      label={labels.field("tier")}
                      options={tierOptions}
                      value={item.tier}
                      onChange={(v) => set({ ...item, tier: v })}
                    />
                  )}
                </Field>
                <Field id={`${base}-price`} span={1} label={labels.field("price", { ctor: PACKAGE, path: `${path}.price` })}>
                  {(a) => <MoneyInput {...a} value={item.price} onChange={(v) => set({ ...item, price: v })} />}
                </Field>
                <Field
                  id={`${base}-title`}
                  label={labels.field("title", { ctor: PACKAGE, path: `${path}.title` })}
                  required
                  error={item.title.trim() ? "" : labels.error("@required", { type: "text" })}
                >
                  {(a) => (
                    <TextInput
                      {...a}
                      value={item.title}
                      onChange={(v) => set({ ...item, title: v })}
                      placeholder={labels.placeholder("title", { ctor: PACKAGE, path: `${path}.title` })}
                    />
                  )}
                </Field>
                <Field as="fieldset" id={`${base}-inc`} label={labels.field("included", { ctor: PACKAGE, path: `${path}.included` })}>
                  <Repeater<string>
                    inline
                    defaultExpanded="all"
                    id={`${base}-inc-list`}
                    label={labels.field("included", { ctor: PACKAGE, path: `${path}.included` })}
                    itemName={labels.field("included", { ctor: PACKAGE, path: `${path}.included` })}
                    addLabel={t("sx.rep.add")}
                    items={item.included}
                    onChange={(next) => set({ ...item, included: next })}
                    newItem={() => ""}
                    summary={(v) => v}
                    renderItem={(v, i, setItem) => (
                      <TextInput
                        size="sm"
                        value={v}
                        onChange={setItem}
                        aria-label={`${labels.field("included", { ctor: PACKAGE, path: `${path}.included` })} ${i + 1}`}
                        placeholder={labels.placeholder("value", { ctor: PACKAGE, path: `${path}.included.${i}.value` })}
                      />
                    )}
                  />
                </Field>
              </FormGrid>
            );
          }}
        />
      </Field>
      <Field as="fieldset" id={`${uid}-kv`} label={labels.field("settings")}>
        <KeyValue id={`${uid}-kv-list`} label={labels.field("settings")} value={settings} onChange={setSettings} nameOf={nameOf} aiId={aiId(AI, "settings")} />
      </Field>
    </Section>
  );
}

function Cards() {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [placement, setPlacement] = useState("profile_boost");
  const cards: ChoiceCard[] = PLACEMENTS.map((key) => ({
    value: key,
    title: labels.placement(key),
    description: labels.placementWhat(key),
    icon: PLACEMENT_ICON[key],
    meta: t(PLACEMENT_RULE[key]),
  }));
  const label = labels.field("placement", { ctor: PROMO });
  return (
    <Section title={t("sx.form.lab.cards")}>
      <Field as="fieldset" id={`${uid}-pl`} label={label} required>
        {(a) => (
          <ChoiceCards
            id={a.id}
            aria-labelledby={a["aria-labelledby"]}
            aria-describedby={a["aria-describedby"]}
            required
            value={placement}
            onChange={setPlacement}
            options={cards}
            aiId={aiId(AI, "placement-cards")}
          />
        )}
      </Field>
      <Field as="fieldset" id={`${uid}-plro`} label={label}>
        {(a) => <ChoiceCards id={a.id} aria-labelledby={a["aria-labelledby"]} readOnly value="banner" onChange={() => undefined} options={cards} />}
      </Field>
    </Section>
  );
}

export function FormLab() {
  return (
    <div className="sx-lab-form">
      <FieldStates />
      <TextStates />
      <Pickers />
      <Dates />
      <Rows />
      <Cards />
    </div>
  );
}
