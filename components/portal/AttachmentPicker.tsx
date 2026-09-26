"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { canRecordVoice, voiceDuration } from "@/lib/voiceRecorder";
import { IconUpload, IconMic, IconTrash, IconFileText } from "@/components/icons";
import VoicePill from "@/components/VoicePill";

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
  // stop() can take up to 2.5s (the Safari fallback), and the list may have
  // changed in the meantime — append to the current value, not the captured one.
  const voicesRef = useRef(voices);
  useEffect(() => {
    voicesRef.current = voices;
  }, [voices]);

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

  return (
    <>
      {/* wp-vpill: the row is packed to its right edge so the mic stays put
          while the pill opens leftward past the "Fayl qo'shish" button. */}
      <div className="docpick__row docpick__row--vp">
        <input ref={inputRef} type="file" hidden multiple onChange={(e) => add(e.target.files)} />
        <button type="button" className="btn btn--line btn--sm" onClick={() => inputRef.current?.click()} disabled={files.length >= maxFiles}>
          <IconUpload />
          {t("addFiles")}
        </button>
        {canRecordVoice() ? (
          <VoicePill
            onRecorded={(note) => onVoices([...voicesRef.current, { blob: note.blob, ms: note.durationMs }])}
            onError={onError}
          />
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
