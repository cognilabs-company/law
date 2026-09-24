"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { VoiceRecorder, canRecordVoice, voiceDuration } from "@/lib/voiceRecorder";
import { IconUpload, IconMic, IconTrash, IconFileText } from "@/components/icons";

// Files and voice notes attached to a lawyer request, shared by the
// service-scoped "Advokat bilan tayyorlash" form and the two from-scratch
// flows. lexgo_frontend_doc_chat_update.md: whatever is attached here turns
// into chat messages the moment an advocate claims the work, so the client
// never has to send any of it twice.
export type VoiceNoteItem = { blob: Blob; ms: number };

export default function AttachmentPicker({
  files,
  voices,
  onFiles,
  onVoices,
  onError,
  maxFileMb = 25,
  maxFiles = 10,
}: {
  files: File[];
  voices: VoiceNoteItem[];
  onFiles: (next: File[]) => void;
  onVoices: (next: VoiceNoteItem[]) => void;
  onError: (msg: string) => void;
  maxFileMb?: number;
  maxFiles?: number;
}) {
  const t = useTranslations("portal.client.newDoc");
  const inputRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<VoiceRecorder | null>(null);
  // stop() can take up to 2.5s (the Safari fallback), and the list may have
  // changed in the meantime — append to the current value, not the captured one.
  const voicesRef = useRef(voices);
  useEffect(() => {
    voicesRef.current = voices;
  }, [voices]);
  const [recOn, setRecOn] = useState(false);
  const [recSec, setRecSec] = useState(0);

  useEffect(() => {
    if (!recOn) return;
    const iv = setInterval(() => setRecSec((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [recOn]);
  // Leaving with the mic open would keep the browser's recording indicator on.
  useEffect(() => () => recRef.current?.cancel(), []);

  function add(list: FileList | null) {
    const picked = Array.from(list || []);
    if (inputRef.current) inputRef.current.value = "";
    if (!picked.length) return;
    if (picked.some((f) => f.size > maxFileMb * 1024 * 1024)) {
      onError(t("fileTooBig", { mb: maxFileMb }));
      return;
    }
    onError("");
    onFiles([...files, ...picked].slice(0, maxFiles));
  }

  async function toggleVoice() {
    const rec = recRef.current;
    if (rec?.active) {
      setRecOn(false);
      const note = await rec.stop();
      recRef.current = null;
      if (note) onVoices([...voicesRef.current, { blob: note.blob, ms: note.durationMs }]);
      return;
    }
    onError("");
    const next = new VoiceRecorder();
    // Stored before the await: the permission prompt is modal, and an unmount
    // behind it must be able to cancel a recorder that has not started yet.
    recRef.current = next;
    try {
      // Inside the click: iOS only grants the microphone from a gesture.
      await next.start();
    } catch {
      recRef.current = null;
      onError(t("micDenied"));
      return;
    }
    if (!next.active) return;
    setRecSec(0);
    setRecOn(true);
  }

  return (
    <>
      <div className="docpick__row">
        <input ref={inputRef} type="file" hidden multiple onChange={(e) => add(e.target.files)} />
        <button type="button" className="btn btn--line btn--sm" onClick={() => inputRef.current?.click()} disabled={files.length >= maxFiles}>
          <IconUpload />
          {t("addFiles")}
        </button>
        {canRecordVoice() ? (
          <button type="button" className={`btn btn--sm ${recOn ? "btn--pri" : "btn--line"}`} onClick={() => void toggleVoice()}>
            <IconMic />
            {recOn ? t("voiceStop", { time: voiceDuration(recSec * 1000) }) : t("voiceStart")}
          </button>
        ) : null}
      </div>

      {files.length || voices.length ? (
        <ul className="doclist">
          {files.map((f, i) => (
            <li key={`f-${f.name}-${i}`}>
              <IconFileText />
              <span>{f.name}</span>
              <button type="button" onClick={() => onFiles(files.filter((_, j) => j !== i))} aria-label={t("remove")}>
                <IconTrash />
              </button>
            </li>
          ))}
          {voices.map((v, i) => (
            <li key={`v-${i}`}>
              <IconMic />
              <span>{t("voiceItem", { time: voiceDuration(v.ms) })}</span>
              <button type="button" onClick={() => onVoices(voices.filter((_, j) => j !== i))} aria-label={t("remove")}>
                <IconTrash />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
