"use client";

import { useEffect, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import type { BackendService } from "@/lib/services/backend";
import {
  NOTE_MAX,
  SERVICE_STATUSES,
  addManagedService,
  priceBandFor,
  serviceErrorOf,
  updateManagedService,
  type ManagedService,
  type PriceBand,
  type ServiceError,
  type ServiceScope,
  type ServiceStatus,
} from "@/lib/services/sellerServices";
import { IconAlert, IconCheck, IconCoins, IconEdit, IconLayers, IconPause, IconPlay, IconPower } from "@/components/icons";
import { InBody, som } from "./bits";
import ServicePicker from "./ServicePicker";
import PriceField, { digitsOf, priceOutOfBand } from "./PriceField";

const POLICY_KEY = (uid: string) => `lexgo_price_policy_${uid}`;
const STATUS_ICON = { active: IconPlay, paused: IconPause, inactive: IconPower } as const;

function readPolicy(uid: string): boolean {
  try {
    return localStorage.getItem(POLICY_KEY(uid)) === "1";
  } catch {
    return false;
  }
}

function rememberPolicy(uid: string): void {
  try {
    localStorage.setItem(POLICY_KEY(uid), "1");
  } catch {
    return;
  }
}

type BandLoad = { key: string; band: PriceBand | null; failed: boolean; advocate: boolean };

export default function ServiceFormModal({
  item,
  scope,
  uid,
  sellerId,
  region,
  lawyer,
  owner,
  taken,
  onClose,
  onSaved,
  aiId,
}: {
  item: ManagedService | null;
  scope: ServiceScope;
  uid: string;
  sellerId: string;
  region: string;
  lawyer: boolean;
  owner: boolean;
  taken: Set<string>;
  onClose: () => void;
  onSaved: (saved: ManagedService, created: boolean) => void;
  aiId?: string;
}) {
  const t = useTranslations("sellerServices");
  const locale = useLocale();
  const ids = useId();
  const editing = Boolean(item);
  const [service, setService] = useState<BackendService | null>(item?.service ?? null);
  const [price, setPrice] = useState(item?.selectedPrice ? String(item.selectedPrice) : "");
  const [note, setNote] = useState(item?.experienceNote ?? "");
  const [status, setStatus] = useState<ServiceStatus>(item?.status ?? "active");
  const [agreed, setAgreed] = useState(() => readPolicy(uid));
  const [askPolicy] = useState(() => !readPolicy(uid));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ServiceError | null>(null);
  const [policyErr, setPolicyErr] = useState(false);
  const [bandLoad, setBandLoad] = useState<BandLoad | null>(null);

  const serviceId = service?.id ?? "";
  const bandKey = `${serviceId}|${sellerId}|${region}`;

  useEffect(() => {
    if (!serviceId) return;
    let alive = true;
    priceBandFor(serviceId, sellerId, region)
      .then((band) => {
        if (alive) setBandLoad({ key: bandKey, band, failed: !band, advocate: false });
      })
      .catch((e: unknown) => {
        if (alive) setBandLoad({ key: bandKey, band: null, failed: true, advocate: serviceErrorOf(e).kind === "advocateOnly" });
      });
    return () => {
      alive = false;
    };
  }, [serviceId, sellerId, region, bandKey]);

  const loaded = bandLoad && bandLoad.key === bandKey ? bandLoad : null;
  const serverBand = err?.kind === "range" ? { recommended: err.max, min: err.min, max: err.max } : null;
  const band = serverBand ?? loaded?.band ?? null;
  const bandState = !serviceId ? "idle" : serverBand || loaded?.band ? "ready" : loaded ? "failed" : "loading";
  const n = Number(price || "0");
  const off = priceOutOfBand(n, band);
  const advocateBlocked = Boolean(loaded?.advocate) || err?.kind === "advocateOnly";

  const errText = (e: ServiceError) => {
    if (e.kind === "range") return t("errors.range", { min: som(e.min), max: som(e.max) });
    if (e.kind === "forbidden" && owner) return t("errors.forbiddenOwner");
    return t(`errors.${e.kind}`);
  };

  const save = async () => {
    if (busy || !service) return;
    if (askPolicy && !agreed) {
      setPolicyErr(true);
      return;
    }
    if (off || advocateBlocked) return;
    setBusy(true);
    setErr(null);
    try {
      const input = { serviceId: service.id, selectedPrice: n, experienceNote: note, status };
      const saved = editing ? await updateManagedService(scope, input, locale) : await addManagedService(scope, input, locale);
      rememberPolicy(uid);
      onSaved(saved, !editing);
    } catch (e) {
      setErr(serviceErrorOf(e));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (!busy) onClose();
  };
  const priceErr = err?.kind === "range" ? errText(err) : "";
  const formErr = err && err.kind !== "range" && err.kind !== "advocateOnly" ? errText(err) : "";

  return (
    <InBody>
      <Modal open onClose={close} title={editing ? t("form.editTitle") : t("form.addTitle")}>
        <form
          className="svform"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          noValidate
          data-ai-id={aiId}
          data-ai-type={aiId ? "modal" : undefined}
          data-ai-label={aiId ? (editing ? t("form.editTitle") : t("form.addTitle")) : undefined}
        >
          <section className="svform__sec">
            <label className="svform__lbl" htmlFor={`${ids}-svc`}>
              <span className="svform__n" aria-hidden="true">
                <IconLayers />
              </span>
              {t("form.service")}
            </label>
            {editing && item ? (
              <div className="svpick__sel svpick__sel--fixed">
                <span className="svpick__ic" aria-hidden="true">
                  <IconEdit />
                </span>
                <span className="svpick__selm">
                  <b>{item.service.name}</b>
                  <small>{[item.service.categoryTitle, item.service.subcategory].filter(Boolean).join(" · ")}</small>
                </span>
              </div>
            ) : (
              <ServicePicker
                inputId={`${ids}-svc`}
                value={service}
                onChange={(s) => {
                  setService(s);
                  setErr(null);
                }}
                taken={taken}
                lawyer={lawyer}
                invalid={advocateBlocked ? t("errors.advocateOnly") : undefined}
              />
            )}
            {advocateBlocked ? (
              <p className="svform__bad" role="alert">
                <IconAlert aria-hidden="true" />
                {t("errors.advocateOnly")}
              </p>
            ) : null}
          </section>

          <section className={`svform__sec${service ? "" : " is-dim"}`}>
            <label className="svform__lbl" htmlFor={`${ids}-price`}>
              <span className="svform__n" aria-hidden="true">
                <IconCoins />
              </span>
              {t("form.price")}
            </label>
            <PriceField
              id={`${ids}-price`}
              value={price}
              onChange={(v) => {
                setPrice(digitsOf(v));
                if (err?.kind === "range") setErr(null);
              }}
              band={band}
              bandState={bandState}
              basePrice={service?.price ?? 0}
              error={priceErr}
            />
          </section>

          <section className="svform__sec">
            <label className="svform__lbl" htmlFor={`${ids}-note`}>
              <span className="svform__n" aria-hidden="true">
                <IconEdit />
              </span>
              {t("form.note")}
              <span className="svform__cnt">
                {note.length}/{NOTE_MAX}
              </span>
            </label>
            <textarea
              id={`${ids}-note`}
              className="svform__ta"
              value={note}
              maxLength={NOTE_MAX}
              rows={4}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("form.notePh")}
              aria-describedby={`${ids}-note-h`}
            />
            <p id={`${ids}-note-h`} className="svform__hint">
              {t("form.noteHint")}
            </p>
          </section>

          <section className="svform__sec">
            <span className="svform__lbl" id={`${ids}-st`}>
              <span className="svform__n" aria-hidden="true">
                <IconPlay />
              </span>
              {t("form.status")}
            </span>
            <div className="svform__st" role="radiogroup" aria-labelledby={`${ids}-st`}>
              {SERVICE_STATUSES.map((s) => {
                const Icon = STATUS_ICON[s];
                const on = status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={`svform__sto svform__sto--${s}${on ? " is-on" : ""}`}
                    onClick={() => setStatus(s)}
                  >
                    <span className="svform__stic" aria-hidden="true">
                      <Icon />
                    </span>
                    <b>{t(`status.${s}`)}</b>
                    <small>{t(`statusHint.${s}`)}</small>
                  </button>
                );
              })}
            </div>
          </section>

          {askPolicy ? (
            <label className={`svform__policy${agreed ? " is-on" : ""}${policyErr && !agreed ? " is-bad" : ""}`}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => {
                  setAgreed(e.target.checked);
                  setPolicyErr(false);
                }}
              />
              <span className="svform__box" aria-hidden="true">
                <IconCheck />
              </span>
              <span>{t("form.policy")}</span>
            </label>
          ) : null}
          {policyErr && !agreed ? (
            <p className="svform__bad" role="alert">
              <IconAlert aria-hidden="true" />
              {t("form.policyRequired")}
            </p>
          ) : null}
          {formErr ? (
            <p className="svm__err" role="alert">
              {formErr}
            </p>
          ) : null}

          <div className="svform__acts">
            <button type="button" className="btn btn--line" onClick={close} disabled={busy}>
              {t("form.cancel")}
            </button>
            <button type="submit" className="btn btn--pri" disabled={busy || !service || off || advocateBlocked}>
              {busy ? t("form.saving") : t("form.save")}
              {busy ? null : <IconCheck aria-hidden="true" />}
            </button>
          </div>
        </form>
      </Modal>
    </InBody>
  );
}
