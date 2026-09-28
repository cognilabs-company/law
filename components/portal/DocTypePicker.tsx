"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getRequestedDocumentTypes,
  docTypeApplies,
  type RequestedDocTypes,
  type DocTypeFlow,
} from "@/lib/services/backend";
import Select from "@/components/Select";

// LEXGO_FRONTEND_REQUESTED_DOCUMENT_TYPE_2026-09-28.md — "Hujjat turi
// tanlash". One optional line of metadata on a request headed for an
// advocate: what KIND of document is wanted. The advocate reads it before
// opening anything, so they know what they are being asked for.
//
// Which flows offer it is the backend's call, not ours: the options endpoint
// answers with `applies_to` / `not_applies_to`, and this renders nothing at
// all for a flow it excludes (document analysis, existing-document review).
// It also renders nothing while the list is loading or if the endpoint is
// missing — the field is optional, so an older deployment simply has no
// picker rather than a broken one.
//
// `value` is the string that goes on the wire, whether it came from the list
// or from the client's own keyboard. The parent never has to know which.

const CUSTOM = "__custom__";

export default function DocTypePicker({
  flow,
  value,
  onChange,
}: {
  flow: DocTypeFlow;
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useTranslations("portal.client.docType");
  const [opts, setOpts] = useState<RequestedDocTypes | null>(null);
  // "" = nothing chosen, CUSTOM = writing their own, else one of the items.
  const [pick, setPick] = useState("");
  const [own, setOwn] = useState("");

  useEffect(() => {
    let alive = true;
    getRequestedDocumentTypes()
      .then((o) => alive && setOpts(o))
      // Optional field, optional endpoint: no picker is a correct outcome.
      .catch(() => alive && setOpts(null));
    return () => {
      alive = false;
    };
  }, []);

  // A value set from outside (a resumed draft) selects the matching option,
  // or drops into the free-text box when it is not one of them.
  const [seeded, setSeeded] = useState(false);
  if (opts && !seeded) {
    setSeeded(true);
    if (value) {
      const known = opts.items.includes(value);
      setPick(known ? value : CUSTOM);
      if (!known) setOwn(value);
    }
  }

  if (!opts || !docTypeApplies(opts, flow) || !opts.items.length) return null;

  function choose(v: string) {
    setPick(v);
    // Switching to free text keeps whatever was typed before; switching to a
    // listed option sends that option, and clearing sends nothing at all.
    onChange(v === CUSTOM ? own.trim() : v);
  }

  function write(v: string) {
    setOwn(v);
    onChange(v.trim());
  }

  return (
    <div className="dtype">
      <label htmlFor="dtype-sel">{t("label")}</label>
      <p className="dtype__hint">{opts.optional ? t("hintOptional") : t("hint")}</p>
      <Select
        value={pick}
        onChange={choose}
        ariaLabel={t("label")}
        placeholder={t("none")}
        options={[
          { value: "", label: t("none") },
          ...opts.items.map((x) => ({ value: x, label: x })),
          ...(opts.customAllowed ? [{ value: CUSTOM, label: t("custom") }] : []),
        ]}
      />
      {pick === CUSTOM ? (
        <input
          className="dtype__own"
          value={own}
          onChange={(e) => write(e.target.value)}
          placeholder={t("customPh")}
          aria-label={t("custom")}
          maxLength={120}
        />
      ) : null}
    </div>
  );
}
