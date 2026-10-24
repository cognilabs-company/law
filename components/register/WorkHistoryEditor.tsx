"use client";

import { useId, useState } from "react";
import { findContacts } from "@/lib/contactGuard";
import ContactGuardNote, { useContactStrip } from "@/components/ui/ContactGuardNote";
import { useTranslations } from "next-intl";
import type { WorkEntry } from "@/lib/types";
import MonthPicker from "../MonthPicker";
import { IconPlus, IconBriefcase, IconClose } from "../icons";

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "w_" + Math.random().toString(36).slice(2, 9);
}

const emptyForm = { org: "", position: "", start: "", end: "", current: false, achievements: "" };

export default function WorkHistoryEditor({
  value,
  onChange,
}: {
  value: WorkEntry[];
  onChange: (next: WorkEntry[]) => void;
}) {
  const t = useTranslations("register.advocate.work");
  const ta = useTranslations("common.a11y");
  const [form, setForm] = useState(emptyForm);
  const ids = useId();
  // Achievements are public profile text: no phone, username or link.
  const hits = findContacts(form.achievements);
  const strip = useContactStrip((achievements) => setForm((f) => ({ ...f, achievements })));

  function add() {
    if (!form.org.trim() || !form.position.trim()) return;
    if (hits.length) {
      document.getElementById(`${ids}-ach`)?.focus();
      return;
    }
    const entry: WorkEntry = {
      id: uid(),
      org: form.org.trim(),
      position: form.position.trim(),
      start: form.start,
      end: form.current ? null : form.end,
      current: form.current,
      achievements: form.achievements.trim() || undefined,
    };
    onChange([entry, ...value]);
    setForm(emptyForm);
    strip.reset();
  }

  return (
    <div className="wh">
      {value.length ? (
        <div className="wh__timeline">
          {value.map((e) => (
            <div className="wh__item" key={e.id}>
              <span className="wh__dot" />
              <div className="wh__card">
                <button
                  type="button"
                  className="wh__x"
                  aria-label={ta("remove")}
                  onClick={() => onChange(value.filter((x) => x.id !== e.id))}
                >
                  <IconClose />
                </button>
                <b>{e.position}</b>
                <span className="wh__org">{e.org}</span>
                <span className="wh__dates">
                  {e.start || "—"} — {e.current ? t("current") : e.end || "—"}
                  {e.current ? <em className="wh__now">{t("currentTag")}</em> : null}
                </span>
                {e.achievements ? <p>{e.achievements}</p> : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="wh__empty">
          <IconBriefcase />
          <p>{t("empty")}</p>
        </div>
      )}

      <div className="wh__form">
        <div className="cform" style={{ maxWidth: "none" }}>
          <div className="cform__row2">
            <div>
              <label>{t("org")}</label>
              <input value={form.org} onChange={(e) => setForm({ ...form, org: e.target.value })} placeholder={t("orgPh")} />
            </div>
            <div>
              <label>{t("position")}</label>
              <input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder={t("positionPh")} />
            </div>
          </div>
          <div className="cform__row2">
            <div>
              <label>{t("start")}</label>
              <MonthPicker
                value={form.start}
                onChange={(v) => setForm({ ...form, start: v })}
                placeholder={t("pickPh")}
                ariaLabel={t("start")}
                clearLabel={t("clear")}
              />
            </div>
            <div>
              <label>{t("end")}</label>
              <MonthPicker
                value={form.end}
                onChange={(v) => setForm({ ...form, end: v })}
                placeholder={form.current ? t("current") : t("pickPh")}
                ariaLabel={t("end")}
                disabled={form.current}
                clearLabel={t("clear")}
              />
            </div>
          </div>
          <label className="wh__check">
            <input
              type="checkbox"
              checked={form.current}
              onChange={(e) => setForm({ ...form, current: e.target.checked })}
            />
            {t("currentLabel")}
          </label>
          <div>
            <label>{t("achievements")}</label>
            <textarea
              id={`${ids}-ach`}
              rows={2}
              value={form.achievements}
              onChange={(e) => strip.change(e.target.value, e)}
              onBlur={() => strip.blur(form.achievements)}
              placeholder={t("achievementsPh")}
              aria-describedby={`${ids}-ach-g`}
              aria-invalid={hits.length > 0 || undefined}
            />
            <ContactGuardNote id={`${ids}-ach-g`} hits={hits} removed={strip.removed} />
          </div>
          <button type="button" className="btn btn--soft" onClick={add}>
            <IconPlus />
            {t("add")}
          </button>
        </div>
      </div>
    </div>
  );
}
