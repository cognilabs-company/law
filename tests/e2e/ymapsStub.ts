// A stand-in for the Yandex Maps v3 global (window.ymaps3) for browser
// tests: the real script can't load against the mocked backend. It keeps
// the parts the page uses: a map with center/zoom/bounds, HTML markers
// placed by Web Mercator, update(), and a listener with onUpdate/onClick.
// The "tiles" are a plain pattern; nothing is fetched.
export function installYmapsStub(): void {
  type LngLat = [number, number];
  type Listener = { props: { onUpdate?: () => void; onClick?: (o: unknown, e: { coordinates: LngLat }) => void } };
  const TILE = 256;
  const world = (z: number) => TILE * 2 ** z;
  const project = (ll: LngLat, z: number): [number, number] => {
    const s = Math.sin((ll[1] * Math.PI) / 180);
    return [((ll[0] + 180) / 360) * world(z), (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * world(z)];
  };
  const unproject = (x: number, y: number, z: number): LngLat => {
    const lon = (x / world(z)) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * y) / world(z);
    return [lon, (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))];
  };
  class Marker {
    coordinates: LngLat;
    el: HTMLElement;
    wrap: HTMLDivElement;
    constructor(props: { coordinates: LngLat; zIndex?: number }, el: HTMLElement) {
      this.coordinates = props.coordinates;
      this.el = el;
      this.wrap = document.createElement("div");
      this.wrap.style.cssText = `position:absolute;width:0;height:0;z-index:${props.zIndex ?? 1}`;
      this.wrap.appendChild(el);
    }
  }
  class YMap {
    root: HTMLElement;
    layer: HTMLDivElement;
    center: LngLat;
    zoom: number;
    markers: Marker[] = [];
    listeners: Listener[] = [];
    constructor(root: HTMLElement, props: { location: { center: LngLat; zoom: number }; theme?: string }) {
      this.root = root;
      this.center = props.location.center;
      this.zoom = props.location.zoom;
      this.layer = document.createElement("div");
      this.layer.className = "ymaps-stub";
      this.layer.style.cssText = "position:absolute;inset:0;overflow:hidden";
      this.paint(props.theme);
      root.appendChild(this.layer);
      this.layer.addEventListener("click", (e) => {
        const r = this.layer.getBoundingClientRect();
        const [cx, cy] = project(this.center, this.zoom);
        const coordinates = unproject(cx + e.clientX - r.left - r.width / 2, cy + e.clientY - r.top - r.height / 2, this.zoom);
        for (const l of this.listeners) l.props.onClick?.(undefined, { coordinates });
      });
    }
    paint(theme?: string) {
      const dark = theme === "dark";
      const base = dark ? "#1d2533" : "#eef0ea";
      const road = dark ? "#2b3546" : "#ffffff";
      const park = dark ? "#1f3a2e" : "#d7ebd2";
      const water = dark ? "#1a2f4a" : "#cfe2f3";
      this.layer.style.background = [
        `radial-gradient(circle at 72% 30%, ${water} 0 9%, transparent 9.2%)`,
        `radial-gradient(ellipse at 22% 70%, ${park} 0 12%, transparent 12.3%)`,
        `repeating-linear-gradient(90deg, transparent 0 118px, ${road} 118px 124px)`,
        `repeating-linear-gradient(0deg, transparent 0 96px, ${road} 96px 101px)`,
        `linear-gradient(28deg, transparent 49.4%, ${road} 49.5% 50.6%, transparent 50.7%)`,
        base,
      ].join(",");
    }
    get bounds(): [LngLat, LngLat] {
      const w = this.root.clientWidth || 800;
      const h = this.root.clientHeight || 500;
      const [cx, cy] = project(this.center, this.zoom);
      return [unproject(cx - w / 2, cy + h / 2, this.zoom), unproject(cx + w / 2, cy - h / 2, this.zoom)];
    }
    addChild(c: unknown) {
      if (c instanceof Marker) {
        this.markers.push(c);
        this.layer.appendChild(c.wrap);
        this.place(c);
      } else if (c && typeof c === "object" && "props" in c && (c as Listener).props && ("onUpdate" in (c as Listener).props || "onClick" in (c as Listener).props)) {
        this.listeners.push(c as Listener);
      }
      return this;
    }
    removeChild(c: unknown) {
      if (c instanceof Marker) {
        this.markers = this.markers.filter((m) => m !== c);
        c.wrap.remove();
      }
      return this;
    }
    place(m: Marker) {
      const [cx, cy] = project(this.center, this.zoom);
      const [x, y] = project(m.coordinates, this.zoom);
      m.wrap.style.left = `${x - cx + (this.root.clientWidth || 800) / 2}px`;
      m.wrap.style.top = `${y - cy + (this.root.clientHeight || 500) / 2}px`;
    }
    update(p: { location?: { center?: LngLat; zoom?: number }; theme?: string }) {
      if (p.theme) this.paint(p.theme);
      if (!p.location) return;
      if (p.location.center) this.center = p.location.center;
      if (typeof p.location.zoom === "number") this.zoom = p.location.zoom;
      for (const m of this.markers) this.place(m);
      for (const l of this.listeners) l.props.onUpdate?.();
    }
    destroy() {
      this.layer.remove();
    }
  }
  class Plain {
    props: unknown;
    constructor(props?: unknown) {
      this.props = props ?? {};
    }
    update() {}
  }
  (window as unknown as { ymaps3: unknown }).ymaps3 = {
    ready: Promise.resolve(),
    YMap,
    YMapDefaultSchemeLayer: Plain,
    YMapDefaultFeaturesLayer: Plain,
    YMapMarker: Marker,
    YMapListener: Plain,
  };
}
