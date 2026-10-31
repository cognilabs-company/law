"use client";

import { useEffect, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import CheckBox from "@/components/CheckBox";
import { Notice } from "@/components/admin/AdminBits";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { IconBuilding, IconCheck, IconEdit, IconInfo, IconLock, IconMapPin, IconRefresh, IconTarget, IconTrash } from "@/components/icons";
import { Navigation } from "lucide-react";
import { fmtDateTime } from "@/lib/date";
import { geoFailureOf, type GeoFailure } from "@/lib/services/marketDiscovery";
import { readPosition } from "@/lib/services/locationShare";
import {
  geocodeReverse,
  geocoderFailOf,
  getOfficeLocation,
  isAborted,
  mapErrorKey,
  removeOfficeLocation,
  saveOfficeLocation,
  type GeocoderFail,
  type MapErrorKey,
  type OfficeLocation,
  type Place,
  type Point,
} from "@/lib/services/mapLocation";
import { getMapConfig, offlineMapConfig, type MapConfig } from "@/lib/services/sellersMap";
import PlaceSearch from "@/components/marketplace/map/PlaceSearch";
import PointPickerMap from "@/components/marketplace/map/PointPickerMap";
import "@/components/marketplace/map/marketMap.css";

type Draft = { point: Point | null; address: string; auto: boolean; publicNavigation: boolean };
type Load = { office: OfficeLocation | null; fail: MapErrorKey | null };

// Seller settings → "Office location" (GET/PUT/DELETE
// /marketplace/me/office-location, §7.5). The seller marks the office on the
// map (or finds it by address) and decides whether clients may get a Yandex
// route to it. With the switch off the office stays private: no client gets
// its location for a route. "Remove office" takes it off the map entirely.
export default function OfficeLocationCard() {
  const t = useTranslations("marketMap.office");
  const tx = useTranslations("marketMap");
  const locale = useLocale();
  const uid = useId();
  const [cfg, setCfg] = useState<MapConfig | null>(null);
  const [broken, setBroken] = useState(false);
  const [load, setLoad] = useState<Load | null>(null);
  const [tick, setTick] = useState(0);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<Draft>({ point: null, address: "", auto: false, publicNavigation: true });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [geo, setGeo] = useState<{ busy: boolean; fail: GeoFailure | null }>({ busy: false, fail: null });
  // The address could not be filled in from the point (the geocoder is down).
  const [reverseFail, setReverseFail] = useState<GeocoderFail | null>(null);

  useEffect(() => {
    let dead = false;
    getMapConfig().then(
      (c) => {
        if (!dead) setCfg(c);
      },
      () => {
        if (!dead) setCfg(offlineMapConfig());
      },
    );
    return () => {
      dead = true;
    };
  }, []);

  const officeUrl = cfg?.officeUrl;
  useEffect(() => {
    if (!officeUrl) return;
    const c = new AbortController();
    getOfficeLocation(officeUrl, c.signal).then(
      (office) => {
        if (!c.signal.aborted) setLoad({ office, fail: null });
      },
      (e) => {
        if (!c.signal.aborted) setLoad({ office: null, fail: mapErrorKey(e) });
      },
    );
    return () => c.abort();
  }, [officeUrl, tick]);

  const office = load?.office ?? null;
  const has = !!office?.configured && !!office.point;
  const mapOn = !!cfg?.usable && !broken;

  const open = () => {
    setDraft({ point: office?.point ?? null, address: office?.address ?? "", auto: false, publicNavigation: has ? !!office?.publicNavigation : true });
    setNote(null);
    setGeo({ busy: false, fail: null });
    setReverseFail(null);
    setEdit(true);
  };

  // A point from the map or the device: the address follows it (unless the
  // seller typed their own), through the backend geocoder.
  const placePoint = (p: Point) => {
    setDraft((d) => ({ ...d, point: p }));
    if (!cfg?.geocoderOn) {
      setReverseFail("unavailable");
      return;
    }
    geocodeReverse(p, locale, cfg.geocoderReverseUrl).then(
      (place) => {
        setReverseFail(null);
        if (!place) return;
        setDraft((d) => (d.point === p && (!d.address.trim() || d.auto) ? { ...d, address: place.detail || place.title, auto: true } : d));
      },
      (e) => {
        if (!isAborted(e)) setReverseFail(geocoderFailOf(e));
      },
    );
  };

  const choosePlace = (p: Place) => {
    setReverseFail(null);
    setDraft((d) => ({ ...d, point: p.point, address: p.detail || p.title, auto: true }));
  };

  const useDevice = () => {
    if (geo.busy) return;
    setGeo({ busy: true, fail: null });
    readPosition({ maximumAgeMs: 30_000, timeoutMs: 15_000 }).then(
      (fix) => {
        setGeo({ busy: false, fail: null });
        placePoint({ latitude: fix.latitude, longitude: fix.longitude });
      },
      (e) => setGeo({ busy: false, fail: geoFailureOf(e) }),
    );
  };

  const save = async () => {
    if (!cfg || !draft.point || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const saved = await saveOfficeLocation({ point: draft.point, address: draft.address, publicNavigation: draft.publicNavigation }, cfg.officeUrl);
      setLoad({ office: saved.point ? saved : { ...saved, configured: true, point: draft.point, address: draft.address.trim(), publicNavigation: draft.publicNavigation }, fail: null });
      setEdit(false);
      setNote({ ok: true, msg: draft.publicNavigation ? t("savedPublic") : t("savedPrivate") });
    } catch (e) {
      const k = mapErrorKey(e);
      setNote({ ok: false, msg: k === "generic" ? t("saveError") : tx(`errors.${k}`) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!cfg || busy) return;
    setNote(null);
    let failed = "";
    const ok = await confirmDialog({
      tone: "danger",
      title: t("removeTitle"),
      text: t("removeText"),
      confirmLabel: t("removeConfirm"),
      cancelLabel: t("cancel"),
      busyLabel: t("removing"),
      onConfirm: async () => {
        setBusy(true);
        try {
          const gone = await removeOfficeLocation(cfg.officeUrl);
          setLoad({ office: gone, fail: null });
        } catch (e) {
          const k = mapErrorKey(e);
          failed = k === "generic" ? t("removeError") : tx(`errors.${k}`);
        } finally {
          setBusy(false);
        }
        return true;
      },
    });
    if (!ok) return;
    setEdit(false);
    setNote(failed ? { ok: false, msg: failed } : { ok: true, msg: t("removed") });
  };

  // When the backend checked the point: confirmed_at, geocoded_at, else the
  // last update.
  const times: { k: "confirmed" | "geocoded" | "updated"; at: number }[] = [];
  if (office?.confirmedAt) times.push({ k: "confirmed", at: office.confirmedAt });
  if (office?.geocodedAt) times.push({ k: "geocoded", at: office.geocodedAt });
  if (office?.updatedAt && !times.length) times.push({ k: "updated", at: office.updatedAt });

  const head = (
    <div className="ppanel__h">
      <b className="ppanel__t">
        <span className="pico">
          <IconBuilding />
        </span>
        {t("title")}
      </b>
      {edit ? (
        <button className="btn btn--soft btn--sm" type="button" onClick={() => setEdit(false)} disabled={busy}>
          {t("cancel")}
        </button>
      ) : load && !load.fail ? (
        <button className="btn btn--line btn--sm" type="button" onClick={open} data-ai-id="profile.office.edit">
          <IconEdit />
          {has ? t("change") : t("add")}
        </button>
      ) : null}
    </div>
  );

  let content;
  if (!cfg || !load) {
    content = (
      <div className="mmo__ghost" aria-busy="true">
        <span className="sr-only" role="status">
          {t("loading")}
        </span>
      </div>
    );
  } else if (load.fail) {
    content = (
      <div className="mknb-msg" role="alert">
        <p>{load.fail === "generic" || load.fail === "not_found" ? t("loadError") : tx(`errors.${load.fail}`)}</p>
        <div className="mknb-msg__acts">
          <button type="button" className="btn btn--grad btn--sm" onClick={() => setTick((n) => n + 1)}>
            <IconRefresh aria-hidden="true" />
            {t("retry")}
          </button>
        </div>
      </div>
    );
  } else if (!edit) {
    content = has ? (
      <div className="mmo__read" data-ai-id="profile.office.read">
        <div className="pkv pkv--cols">
          <div className={`pkv__i pkv__i--wide${office?.address ? "" : " pkv__i--empty"}`}>
            <label>{t("address")}</label>
            <b>{office?.address || t("noAddress")}</b>
          </div>
          <div className="pkv__i">
            <label>{t("routeLabel")}</label>
            <b>
              <span className={`pstate ${office?.publicNavigation ? "pstate--on" : "pstate--off"}`} data-ai-id="profile.office.state">
                {office?.publicNavigation ? <Navigation aria-hidden="true" /> : <IconLock aria-hidden="true" />}
                {office?.publicNavigation ? t("statePublic") : t("statePrivate")}
              </span>
            </b>
          </div>
          {office?.source ? (
            <div className="pkv__i" data-ai-id="profile.office.source">
              <label>{t("sourceLabel")}</label>
              <b>{t(`source.${office.source}`)}</b>
            </div>
          ) : null}
          {times.map(({ k, at }) => (
            <div key={k} className="pkv__i" data-ai-id={`profile.office.${k}`}>
              <label>{t(k)}</label>
              <b>
                <time dateTime={new Date(at).toISOString()}>{fmtDateTime(at, locale)}</time>
              </b>
            </div>
          ))}
        </div>
        <p className="rf__hint">{office?.publicNavigation ? t("explainOn") : t("explainOff")}</p>
        <div className="mmo__foot">
          <button type="button" className="btn btn--line btn--sm mmo__remove" onClick={() => void remove()} disabled={busy} aria-busy={busy || undefined} data-ai-id="profile.office.remove">
            <IconTrash aria-hidden="true" />
            {busy ? t("removing") : t("remove")}
          </button>
        </div>
      </div>
    ) : (
      <div className="mmo__empty" data-ai-id="profile.office.empty">
        <span className="mml__ic" aria-hidden="true">
          <IconMapPin />
        </span>
        <div>
          <b>{t("emptyTitle")}</b>
          <p>{t("emptyText")}</p>
        </div>
      </div>
    );
  } else {
    content = (
      <div className="mmo__edit" data-ai-id="profile.office.form">
        <p className="mmo__lead">{t("lead")}</p>
        <div className="mmo__grid">
          <div className="mmo__pick">
            <PlaceSearch url={cfg.geocoderSearchUrl} off={!cfg.geocoderOn} mapOn={mapOn} label={t("searchLabel")} placeholder={t("searchPlaceholder")} onSelect={choosePlace} aiId="profile.office.place" />
            {mapOn ? (
              <PointPickerMap
                config={cfg}
                point={draft.point}
                onPick={placePoint}
                onFail={() => setBroken(true)}
                label={t("mapLabel")}
                hint={draft.point ? t("mapMoved") : t("mapHint")}
                pinLabel={t("pin")}
                zoomInLabel={tx("zoomIn")}
                zoomOutLabel={tx("zoomOut")}
              />
            ) : (
              <p className="mmoff" role="status">
                {broken ? t("mapFailed") : t("mapOff")}
              </p>
            )}
            <div className="mmo__row">
              <button type="button" className="btn btn--line btn--sm" onClick={useDevice} disabled={geo.busy} aria-busy={geo.busy || undefined} data-ai-id="profile.office.device">
                <IconTarget aria-hidden="true" />
                {geo.busy ? tx("locate.asking") : t("useDevice")}
              </button>
              <span className={`mmo__point${draft.point ? " is-on" : ""}`} role="status" data-ai-id="profile.office.point">
                {draft.point ? <IconCheck aria-hidden="true" /> : <IconMapPin aria-hidden="true" />}
                {draft.point ? t("pointSet") : t("pointMissing")}
              </span>
            </div>
            {geo.fail ? (
              <p className="mml__err" role="alert">
                {tx(`geoFail.${geo.fail}`)}
              </p>
            ) : null}
            {reverseFail && draft.point ? (
              <p className="mmp__down" role="status" data-ai-id="profile.office.reverse-fail">
                <IconInfo aria-hidden="true" />
                <span>{reverseFail === "offline" ? tx("errors.offline") : t("reverseFail")}</span>
              </p>
            ) : null}
          </div>
          <div className="mmo__side">
            <div className="cform" style={{ maxWidth: "none" }}>
              <div>
                <label htmlFor={`${uid}-a`}>{t("address")}</label>
                <input id={`${uid}-a`} value={draft.address} maxLength={500} onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value, auto: false }))} placeholder={t("addressPlaceholder")} autoComplete="street-address" />
                <p className="rf__hint">{t("addressHint")}</p>
              </div>
            </div>
            <div className={`mmo__nav${draft.publicNavigation ? " is-on" : ""}`} data-ai-id="profile.office.public">
              <CheckBox checked={draft.publicNavigation} onChange={(on) => setDraft((d) => ({ ...d, publicNavigation: on }))} hint={draft.publicNavigation ? t("explainOn") : t("explainOff")}>
                {t("publicLabel")}
              </CheckBox>
            </div>
          </div>
        </div>
        <div className="pverify" style={{ marginTop: 16 }}>
          {note && !note.ok ? <Notice ok={false} msg={note.msg} /> : <span />}
          <span className="pverify__acts">
            <button className="btn btn--line btn--sm" type="button" onClick={() => setEdit(false)} disabled={busy}>
              {t("cancel")}
            </button>
            <button className="btn btn--grad btn--sm" type="button" onClick={save} disabled={busy || !draft.point} aria-busy={busy || undefined} data-ai-id="profile.office.save">
              <IconCheck />
              {busy ? t("saving") : t("save")}
            </button>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="ppanel mmo" data-ai-target="profile:office-location" data-ai-id="profile.office" data-ai-type="section">
      {head}
      {note && !edit ? <Notice ok={note.ok} msg={note.msg} /> : null}
      {content}
    </div>
  );
}
