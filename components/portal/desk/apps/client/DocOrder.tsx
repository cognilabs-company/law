"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { docTypeApplies, getRequestedDocumentTypes, requestCustomDraft, requestExistingDocumentReviewGated, type DocLawyerSubmitResult, type RequestedDocTypes } from "@/lib/services/backend";
import { ApiError, errDetail, isPaymentRequired, logApiError } from "@/lib/http";
import { VoiceRecorder, canRecordVoice, voiceDuration } from "@/lib/voiceRecorder";
import { defaultDocLang, docLangOptions } from "@/components/portal/NewDocumentOrder";
import { IconArrowRight, IconChevronLeft, IconClipboardCheck, IconClose, IconEdit, IconFileText, IconMic, IconPaperclip, IconRecord } from "@/components/icons";
import { Banner, Btn, Dialog, Field, Input, Select, TextArea } from "../../kit/kit";
import type { NativeProps } from "../../native";

// Asking an advocate for a document, as a desktop sheet: write one from
// scratch or check one the client has; the document (for a check) or its
// type (for a new one), what is needed, files and voice notes, the
// language. Sent, it says where the request went — My documents follows
// it from there, payment included. The rules are NewDocumentOrder's.

type Flow = "" | "scratch" | "review";
type Voice = { blob: Blob; ms: number };
const MAX_FILE_MB = 25;
const MAX_FILES = 10;
const TITLE_MAX = 120;
const CUSTOM = "__custom__";

function draftTitle(docType: string, need: string): string {
  const firstLine = need.split("\n").find((l) => l.trim()) || "";
  const s = [docType.trim(), firstLine.trim()].filter(Boolean).join(" — ").replace(/\s+/g, " ");
  if (s.length <= TITLE_MAX) return s;
  const cut = s.slice(0, TITLE_MAX - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > TITLE_MAX / 2 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

export default function DocOrderDialog({ onClose, openLink }: { onClose: () => void; openLink: NativeProps["openLink"] }) {
  const t = useTranslations("portal.client.newDoc");
  const td = useTranslations("portal.client.documents");
  const tt = useTranslations("portal.client.docType");
  const d = useTranslations("portal.desk.client");
  const tu = useTranslations("portal.client.urgent");
  const locale = useLocale();
  const [flow, setFlow] = useState<Flow>("");
  const [need, setNeed] = useState("");
  const [lang, setLang] = useState<string>(() => defaultDocLang(locale));
  const [types, setTypes] = useState<RequestedDocTypes | null>(null);
  const [typePick, setTypePick] = useState("");
  const [typeOwn, setTypeOwn] = useState("");
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [missing, setMissing] = useState<"" | "main" | "need">("");
  const [result, setResult] = useState<DocLawyerSubmitResult | null>(null);
  const [plan, setPlan] = useState("");
  const mainPick = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    getRequestedDocumentTypes()
      .then((o) => alive && setTypes(o))
      .catch(() => alive && setTypes(null));
    return () => {
      alive = false;
    };
  }, []);

  const docType = typePick === CUSTOM ? typeOwn.trim() : typePick;
  const showTypes = flow === "scratch" && !!types && docTypeApplies(types, "custom_from_scratch") && types.items.length > 0;
  const described = !!need.trim() || files.length > 0 || voices.length > 0 || flow === "review";


  async function submit() {
    if (busy) return;
    if (flow === "review" && !mainFile) return setMissing("main");
    if (!described) return setMissing("need");
    setMissing("");
    setBusy(true);
    const payload = { need: need.trim(), language: lang, files, voiceFiles: voices.map((v) => v.blob) };
    try {
      const r =
        flow === "review" && mainFile
          ? await requestExistingDocumentReviewGated({ ...payload, mainFile })
          : { request: await requestCustomDraft({ ...payload, title: draftTitle(docType, need) || undefined, requestedDocumentType: docType || undefined }), paymentRequired: false, gate: null, alreadyExists: false, canSendLawyerRequest: true, message: "", constructorAction: null };
      setResult(r);
    } catch (e) {
      if (isPaymentRequired(e)) setPlan(errDetail(e) || td("planRequired"));
      else if (e instanceof ApiError && e.status === 422) setMissing("need");
      else {
        logApiError(`document-services ${flow}`, e);
        setErr(t("sendFailed"));
      }
    } finally {
      setBusy(false);
    }
  }

  const go = (route: string) => (onClose(), openLink({ appId: "", route }));
  const title = flow === "review" ? t("reviewTitle") : flow === "scratch" ? t("scratchTitle") : tu("docs.title");

  if (result || plan)
    return (
      <Dialog
        open
        title={title}
        onClose={onClose}
        actions={
          <>
            <Btn onClick={onClose}>{d("close")}</Btn>
            {plan ? (
              <Btn kind="primary" onClick={() => go("/portal/client/subscription")}>
                {td("choosePlan")}
              </Btn>
            ) : (
              <Btn kind="primary" icon={<IconArrowRight />} onClick={() => go("/portal/client/documents")}>
                {d("documents", { n: 1 })}
              </Btn>
            )}
          </>
        }
      >
        {plan ? (
          <Banner tone="warn" title={td("planGateTitle")}>
            {plan}
          </Banner>
        ) : result && (result.paymentRequired || result.alreadyExists || !result.canSendLawyerRequest) ? (
          <Banner tone="warn">{result.message || td("lawyerPendingLead")}</Banner>
        ) : (
          <Banner tone="ok" title={t("submitted")}>
            {result?.request.title || ""}
          </Banner>
        )}
      </Dialog>
    );

  return (
    <Dialog
      open
      title={title}
      width={560}
      onClose={onClose}
      onSubmit={flow ? () => void submit() : undefined}
      actions={
        flow ? (
          <>
            <Btn icon={<IconChevronLeft />} onClick={() => setFlow("")}>
              {td("backToChoices")}
            </Btn>
            <Btn kind="primary" type="submit" busy={busy} icon={<IconArrowRight />}>
              {t("submit")}
            </Btn>
          </>
        ) : (
          <Btn onClick={onClose}>{d("close")}</Btn>
        )
      }
    >
      {!flow ? (
        <>
          <p className="dx-dlg__text">{t("lead")}</p>
          <div className="dxcu-flows">
            <button type="button" onClick={() => setFlow("scratch")}>
              <IconEdit aria-hidden />
              <b>{t("scratchTitle")}</b>
              <small>{t("scratchSub")}</small>
            </button>
            <button type="button" onClick={() => setFlow("review")}>
              <IconClipboardCheck aria-hidden />
              <b>{t("reviewTitle")}</b>
              <small>{t("reviewSub")}</small>
            </button>
          </div>
        </>
      ) : (
        <>
          {flow === "review" ? (
            <div className="dx-field">
              <span className="dx-field__l">{t("mainFileLabel")}</span>
              <button type="button" className={`dxca-drop is-file dxcu-main${missing === "main" ? " is-bad" : ""}`} onClick={() => mainPick.current?.click()}>
                <IconFileText aria-hidden />
                <span>
                  <b>{mainFile ? mainFile.name : t("mainFilePick")}</b>
                  <small>{mainFile ? t("mainFileChange") : t("mainFileHint", { mb: MAX_FILE_MB })}</small>
                </span>
              </button>
              <input
                ref={mainPick}
                type="file"
                hidden
                accept=".doc,.docx,.pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  if (f.size > MAX_FILE_MB * 1024 * 1024) return setErr(t("fileTooBig", { mb: MAX_FILE_MB }));
                  setErr("");
                  setMainFile(f);
                  setMissing("");
                }}
              />
              {missing === "main" ? <small className="dx-field__e">{t("mainFileRequired")}</small> : null}
            </div>
          ) : null}
          {showTypes && types ? (
            <Field label={tt("label")} hint={types.optional ? tt("hintOptional") : tt("hint")}>
              <Select
                value={typePick}
                onChange={setTypePick}
                ariaLabel={tt("label")}
                options={[{ value: "", label: tt("none") }, ...types.items.map((x) => ({ value: x, label: x })), ...(types.customAllowed ? [{ value: CUSTOM, label: tt("custom") }] : [])]}
              />
            </Field>
          ) : null}
          {showTypes && typePick === CUSTOM ? <Input value={typeOwn} onChange={setTypeOwn} placeholder={tt("customPh")} maxLength={120} ariaLabel={tt("custom")} /> : null}
          <Field label={t("needLabel")} error={missing === "need" ? t("needRequired") : undefined}>
            <TextArea value={need} onChange={(v) => (setNeed(v), v.trim() && setMissing(""))} placeholder={t("needPlaceholder")} rows={5} />
          </Field>
          <Attach files={files} voices={voices} onFiles={setFiles} onVoices={setVoices} onError={setErr} />
          <Field label={t("langHint")}>
            <Select value={lang} onChange={setLang} ariaLabel={t("langHint")} options={docLangOptions(lang).map((o) => ({ value: o.value, label: o.key ? td(o.key) : o.value }))} />
          </Field>
          {err ? <Banner tone="err">{err}</Banner> : null}
        </>
      )}
    </Dialog>
  );
}

export type VoiceNote = Voice;

// Files and voice notes to send along: add a file, record a note (with its
// running time), and the list to take things back out of.
export function Attach({ files, voices, onFiles, onVoices, onError }: { files: File[]; voices: Voice[]; onFiles: (f: File[]) => void; onVoices: (v: Voice[]) => void; onError: (m: string) => void }) {
  const t = useTranslations("portal.client.newDoc");
  const pick = useRef<HTMLInputElement>(null);
  const recorder = useRef<VoiceRecorder | null>(null);
  const [rec, setRec] = useState<{ ms: number } | null>(null);
  const recording = !!rec;
  useEffect(() => {
    if (!recording) return;
    const h = setInterval(() => setRec({ ms: recorder.current?.elapsedMs ?? 0 }), 500);
    return () => clearInterval(h);
  }, [recording]);
  useEffect(() => () => recorder.current?.cancel(), []);
  async function startVoice() {
    const r = new VoiceRecorder();
    try {
      await r.start();
      recorder.current = r;
      setRec({ ms: 0 });
    } catch {
      onError(t("micDenied"));
    }
  }
  async function stopVoice() {
    const r = recorder.current;
    if (!r) return;
    recorder.current = null;
    const note = await r.stop();
    setRec(null);
    if (note) onVoices([...voices, { blob: note.blob, ms: note.durationMs }]);
  }
  function addFiles(list: FileList | null) {
    const picked = Array.from(list || []);
    if (!picked.length) return;
    if (picked.some((f) => f.size > MAX_FILE_MB * 1024 * 1024)) return onError(t("fileTooBig", { mb: MAX_FILE_MB }));
    onError("");
    onFiles([...files, ...picked].slice(0, MAX_FILES));
  }
  return (
    <div className="dx-field">
      <span className="dx-field__l">{t("extrasLabel")}</span>
      <span className="dxcp-att__bar">
        <Btn small icon={<IconPaperclip />} disabled={files.length >= MAX_FILES || !!rec} onClick={() => pick.current?.click()}>
          {t("addFiles")}
        </Btn>
        {canRecordVoice() ? (
          rec ? (
            <Btn small kind="danger" icon={<IconRecord />} onClick={() => void stopVoice()}>
              {voiceDuration(rec.ms)}
            </Btn>
          ) : (
            <Btn small icon={<IconMic />} onClick={() => void startVoice()}>
              {t("addVoice")}
            </Btn>
          )
        ) : null}
      </span>
      <input ref={pick} type="file" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
      {files.length || voices.length ? (
        <ul className="dxcp-att__list">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <IconPaperclip aria-hidden />
              <span>{f.name}</span>
              <button type="button" onClick={() => onFiles(files.filter((_, j) => j !== i))} aria-label={t("remove")}>
                <IconClose />
              </button>
            </li>
          ))}
          {voices.map((v, i) => (
            <li key={`v${i}`}>
              <IconMic aria-hidden />
              <span>{t("voiceItem", { time: voiceDuration(v.ms) })}</span>
              <button type="button" onClick={() => onVoices(voices.filter((_, j) => j !== i))} aria-label={t("remove")}>
                <IconClose />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
