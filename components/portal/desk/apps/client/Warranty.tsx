"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createWarrantyClaim, listWarrantyClaims, type WarrantyClaim } from "@/lib/services/backend";
import { dateOnly } from "@/lib/date";
import { IconCheck, IconPlus, IconShieldCheck } from "@/components/icons";
import { Banner, Btn, Dialog, Field, Group, Input, SettingRow, Spinner, Tag, TextArea } from "../../kit/kit";
import { toneOf } from "./bits";

// The LexGo guarantee as a settings group: what it promises, the client's
// claims with their status, and "New claim" — which case and why — in a
// sheet that answers with the claim's status. The rules are ClientWarranty's.

export default function Warranty({ say }: { say: (m: string, tone?: "err") => void }) {
  const t = useTranslations("portal.client.warranty");
  const tc = useTranslations("common");
  const d = useTranslations("portal.desk.client");
  const locale = useLocale();
  const [claims, setClaims] = useState<WarrantyClaim[] | null>(null);
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [caseTitle, setCaseTitle] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WarrantyClaim | null>(null);
  useEffect(() => {
    let alive = true;
    listWarrantyClaims()
      .then((l) => alive && setClaims(l))
      .catch(() => alive && setClaims([]));
    return () => {
      alive = false;
    };
  }, [tick]);
  const status = (s: string) => (t.has(`status.${s}`) ? t(`status.${s}`) : s);
  async function send() {
    if (busy) return;
    if (!reason.trim()) return setErr(tc("required"));
    setBusy(true);
    try {
      const c = await createWarrantyClaim({ reason: `${caseTitle ? caseTitle + ": " : ""}${reason.trim()}` });
      setResult(c);
      setCaseTitle("");
      setReason("");
      setTick((n) => n + 1);
    } catch {
      say(t("sendFailed"), "err");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Group
        title={t("title")}
        end={
          <Btn small icon={<IconPlus />} onClick={() => (setErr(""), setResult(null), setOpen(true))}>
            {t("requestTitle")}
          </Btn>
        }
        footer={t("subtitle")}
      >
        {(["p1", "p2", "p3"] as const).map((p) => (
          <SettingRow key={p} icon={<IconCheck />} title={t(p)} />
        ))}
      </Group>
      <Group title={t("claimsTitle")}>
        {claims === null ? (
          <Spinner small />
        ) : !claims.length ? (
          <SettingRow icon={<IconShieldCheck />} title={t("noClaims")} />
        ) : (
          claims.map((c) => (
            <SettingRow key={c.id} icon={<IconShieldCheck />} title={c.caseTitle || t("claim")} desc={[c.reason, c.createdAt ? dateOnly(c.createdAt, locale) : ""].filter(Boolean).join(" · ")}>
              <Tag tone={toneOf(c.status)}>{status(c.status)}</Tag>
            </SettingRow>
          ))
        )}
      </Group>
      {open ? (
        <Dialog
          open
          title={result ? t("resultTitle") : t("requestTitle")}
          onClose={() => setOpen(false)}
          onSubmit={result ? undefined : () => void send()}
          actions={
            result ? (
              <Btn kind="primary" onClick={() => setOpen(false)}>
                {t("resultClose")}
              </Btn>
            ) : (
              <>
                <Btn onClick={() => setOpen(false)}>{d("cancel")}</Btn>
                <Btn kind="primary" type="submit" busy={busy}>
                  {t("submit")}
                </Btn>
              </>
            )
          }
        >
          {result ? (
            <Banner tone="ok" title={t("resultSentTitle")}>
              {`${t("resultStatus", { status: status(result.status) })} ${t("resultNote")}`}
            </Banner>
          ) : (
            <>
              <p className="dx-dlg__text">{t("requestLead")}</p>
              <Field label={t("caseLabel")}>
                <Input value={caseTitle} onChange={setCaseTitle} placeholder={t("casePh")} />
              </Field>
              <Field label={t("reasonLabel")} error={err || undefined}>
                <TextArea value={reason} onChange={(v) => (setReason(v), setErr(""))} placeholder={t("reasonPh")} rows={4} />
              </Field>
            </>
          )}
        </Dialog>
      ) : null}
    </>
  );
}
