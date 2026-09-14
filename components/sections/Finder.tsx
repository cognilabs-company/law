"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { initials, humanizeSlug, AREA_KEYS, REGION_KEYS } from "@/lib/lawyers";
import { listLawyers, type BackendLawyer } from "@/lib/services/backend";
import { fmtUzs } from "@/lib/money";
import Select, { type Option } from "@/components/Select";
import {
  IconUser,
  IconFileText,
  IconSparkle,
  IconSearch,
  IconArrowRight,
} from "@/components/icons";

type Tab = "lawyer" | "doc" | "ai";

const STAGES = [
  "unknown",
  "preInvestigation",
  "investigation",
  "firstInstance",
  "appeal",
  "cassation",
];
const DOC_TYPES = ["contract", "application", "complaint", "claim", "poa", "corporate"];

export default function Finder() {
  const tf = useTranslations("finder");
  const te = useTranslations("enums");
  const router = useRouter();
  const { session } = useAuth();

  const [tab, setTab] = useState<Tab>("lawyer");
  const [area, setArea] = useState("criminal");
  const [region, setRegion] = useState("");
  const [stage, setStage] = useState("unknown");
  const [doc, setDoc] = useState("contract");
  const [who, setWho] = useState("individual");
  const [by, setBy] = useState("ai");
  const [ask, setAsk] = useState("");
  const [res, setRes] = useState<{ area: string; region: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<BackendLawyer[]>([]);

  const cur = te("currency");

  const areaOpts: Option[] = AREA_KEYS.map((a) => ({ value: a, label: te(`areas.${a}`) }));
  const regionOpts: Option[] = [
    { value: "", label: te("regions.all") },
    ...REGION_KEYS.map((r) => ({ value: r, label: te(`regions.${r}`) })),
  ];
  const stageOpts: Option[] = STAGES.map((s) => ({ value: s, label: te(`stages.${s}.name`) }));
  const docOpts: Option[] = DOC_TYPES.map((d) => ({ value: d, label: tf(`docTypes.${d}`) }));
  const whoOpts: Option[] = [
    { value: "individual", label: tf("forWhom.individual") },
    { value: "soleTrader", label: tf("forWhom.soleTrader") },
    { value: "legalEntity", label: tf("forWhom.legalEntity") },
  ];
  const byOpts: Option[] = [
    { value: "ai", label: tf("preparedBy.ai") },
    { value: "lawyer", label: tf("preparedBy.lawyer") },
  ];

  // Hand a message off to the AI chat, which auto-sends it. Logged-in users
  // get their own portal chat; anonymous visitors get the public one.
  function goChat(text: string) {
    const t = text.trim();
    if (!t) return;
    const base = session ? `/portal/${session.role}/ai` : "/chat";
    router.push(`${base}?q=${encodeURIComponent(t)}`);
  }
  function prepareDoc(docKey: string) {
    goChat(
      tf("docSeed", { doc: tf(`docTypes.${docKey}`), who: tf(`forWhom.${who}`) }),
    );
  }

  function searchLawyers(a: string, r: string) {
    setRes({ area: a, region: r });
    setLoading(true);
    setRows([]);
    listLawyers({ specialization: a, region: r })
      .then((data) => setRows(data))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }

  function areaLabel(b: BackendLawyer): string {
    const key = b.specializations.find((s) => AREA_KEYS.includes(s));
    return key ? te(`areas.${key}`) : b.specializations[0] || "";
  }

  function lawyerRow(b: BackendLawyer) {
    return (
      <button className="resrow" type="button" key={b.id || b.name}>
        <div className="resrow__i">{initials(b.name || "?")}</div>
        <div>
          <div className="resrow__n">
            {b.name}
            {b.verified ? (
              <span className="pill" style={{ fontSize: ".66rem" }}>
                Super
              </span>
            ) : null}
          </div>
          <div className="resrow__m">
            {areaLabel(b)} · {b.region} · {b.experienceYears}
          </div>
        </div>
        <div className="resrow__r">
          <b>{b.basePrice ? fmtUzs(b.basePrice) : "—"}</b>
          <span>
            {tf("result.fromSom")} {cur} · {tf("result.ratingSuffix")}{" "}
            {b.rating.toFixed(1)}
          </span>
        </div>
      </button>
    );
  }

  const list = res ? rows : [];

  return (
    <div className="finder">
      <div className="finder__c">
        <div className="segs" role="tablist">
          <button
            className="seg"
            role="tab"
            aria-selected={tab === "lawyer"}
            onClick={() => {
              setTab("lawyer");
              setRes(null);
            }}
          >
            <IconUser />
            {tf("tabs.lawyer")}
          </button>
          <button
            className="seg"
            role="tab"
            aria-selected={tab === "doc"}
            onClick={() => {
              setTab("doc");
              setRes(null);
            }}
          >
            <IconFileText />
            {tf("tabs.doc")}
          </button>
          <button
            className="seg"
            role="tab"
            aria-selected={tab === "ai"}
            onClick={() => {
              setTab("ai");
              setRes(null);
            }}
          >
            <IconSparkle />
            {tf("tabs.ai")}
          </button>
        </div>

        {tab === "lawyer" ? (
          <div className="fform on">
            <div className="frow">
              <div className="fld">
                <label>{tf("labels.area")}</label>
                <Select value={area} onChange={setArea} options={areaOpts} ariaLabel={tf("labels.area")} />
              </div>
              <div className="fld">
                <label>{tf("labels.region")}</label>
                <Select value={region} onChange={setRegion} options={regionOpts} ariaLabel={tf("labels.region")} />
              </div>
              <div className="fld">
                <label>{tf("labels.stage")}</label>
                <Select value={stage} onChange={setStage} options={stageOpts} ariaLabel={tf("labels.stage")} />
              </div>
              <button className="fgo" type="button" onClick={() => searchLawyers(area, region)}>
                <IconSearch />
                {tf("buttons.search")}
              </button>
            </div>
            <div className="fhint">
              <b>{tf("hints.popular")}</b>
              {(tf.raw("quickLawyer") as { label: string; area: string }[]).map((q, i) => (
                <button
                  key={i}
                  className="qc"
                  type="button"
                  onClick={() => {
                    setArea(q.area);
                    searchLawyers(q.area, region);
                  }}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "doc" ? (
          <div className="fform on">
            <div className="frow">
              <div className="fld">
                <label>{tf("labels.docType")}</label>
                <Select value={doc} onChange={setDoc} options={docOpts} ariaLabel={tf("labels.docType")} />
              </div>
              <div className="fld">
                <label>{tf("labels.forWhom")}</label>
                <Select value={who} onChange={setWho} options={whoOpts} ariaLabel={tf("labels.forWhom")} />
              </div>
              <div className="fld">
                <label>{tf("labels.preparedBy")}</label>
                <Select value={by} onChange={setBy} options={byOpts} ariaLabel={tf("labels.preparedBy")} />
              </div>
              <button className="fgo" type="button" onClick={() => prepareDoc(doc)}>
                <IconArrowRight />
                {tf("buttons.openTemplate")}
              </button>
            </div>
            <div className="fhint">
              <b>{tf("hints.templates")}</b>
              {(tf.raw("quickDoc") as { label: string; doc: string }[]).map((q, i) => (
                <button
                  key={i}
                  className="qc"
                  type="button"
                  onClick={() => {
                    setDoc(q.doc);
                    prepareDoc(q.doc);
                  }}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "ai" ? (
          <div className="fform on">
            <div className="frow" style={{ gridTemplateColumns: "1fr auto" }}>
              <div className="fld fld--txt">
                <label>{tf("labels.yourProblem")}</label>
                <textarea
                  rows={2}
                  value={ask}
                  onChange={(e) => setAsk(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && ask.trim()) {
                      e.preventDefault();
                      goChat(ask.trim());
                    }
                  }}
                  placeholder={tf("askPlaceholder")}
                />
              </div>
              <button
                className="fgo"
                type="button"
                onClick={() => goChat(ask)}
              >
                <IconSparkle />
                {tf("buttons.analyze")}
              </button>
            </div>
            <div className="fhint">
              <b>{tf("hints.examples")}</b>
              {(tf.raw("quickAsk") as { label: string; text: string }[]).map((q, i) => (
                <button key={i} className="qc" type="button" onClick={() => goChat(q.text)}>
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {res ? (
          <div className="sheetres on" aria-live="polite">
            <div className="sheetres__t">
              <b>{tf("result.lawyersFound", { count: list.length })}</b>
              <span className="pill pill--ok">{te.has(`areas.${res.area}`) ? te(`areas.${res.area}`) : humanizeSlug(res.area)}</span>
            </div>
            <div>
              {loading ? (
                <div className="skel">
                  <div className="skel__r" />
                  <div className="skel__r" />
                  <div className="skel__r" />
                </div>
              ) : list.length ? (
                <>
                  <div className="reslist">{list.map(lawyerRow)}</div>
                  <p className="disc">{tf("result.lawyerDisc")}</p>
                </>
              ) : (
                <div className="aibox">
                  <div className="aibox__h">
                    <span className="dot" />
                    {tf("result.noLawyerTitle")}
                  </div>
                  <p style={{ margin: "0 0 14px", fontSize: ".9rem", color: "var(--gray)" }}>
                    {tf("result.noLawyerText")}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
