// A stand-in for the Yandex Maps JS API 2.1 (the global `ymaps`) for browser
// tests: the real script can't load against the mocked backend, so the
// specs serve this one from the config's maps_loader_url instead. It keeps
// the 2.1 calls the page makes, with their semantics: ymaps.ready, a Map with
// [latitude, longitude] coordinates (meta.coordinatesOrder "latlong", the
// default the deployed loader uses), getBounds/getZoom/getCenter,
// setCenter/setZoom/setBounds firing "boundschange", map and geo-object
// "click" events, Placemarks drawn from templateLayoutFactory templates
// ({{ properties.x }}, escaped), interactivityModel "default#transparent",
// a Clusterer that groups placemarks closer than gridSize pixels through its
// (overridable) createCluster, and panes.get("ground") for the tiles. As in
// 2.1, an events pane lies over the markers' HTML: a click reaches a
// placemark only through its iconShape (clusterIconShape for a cluster), so
// tests click at a marker's position, and a marker without a shape is not
// clickable. Tiles are a plain light pattern; nothing is fetched.
export function installYmapsStub(): void {
  type LatLng = [number, number];
  type Props = Record<string, unknown>;
  type Handler = (e: { get: (k: string) => unknown }) => void;
  const TILE = 256;
  const world = (z: number) => TILE * 2 ** z;
  const project = (ll: LatLng, z: number): [number, number] => {
    const s = Math.sin((ll[0] * Math.PI) / 180);
    return [((ll[1] + 180) / 360) * world(z), (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * world(z)];
  };
  const unproject = (x: number, y: number, z: number): LatLng => {
    const lon = (x / world(z)) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * y) / world(z);
    return [(180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lon];
  };
  const esc = (v: unknown) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  class EventManager {
    list = new Map<string, Handler[]>();
    add(type: string, cb: Handler) {
      this.list.set(type, [...(this.list.get(type) ?? []), cb]);
      return this;
    }
    fire(type: string, data: Props = {}) {
      for (const cb of this.list.get(type) ?? []) cb({ get: (k: string) => data[k] });
    }
  }
  class DataManager {
    data: Props;
    changed: () => void = () => undefined;
    constructor(d?: Props) {
      this.data = { ...(d ?? {}) };
    }
    set(k: string | Props, v?: unknown) {
      if (typeof k === "string") this.data[k] = v;
      else Object.assign(this.data, k);
      this.changed();
      return this;
    }
    get(k: string, fallback?: unknown) {
      return k in this.data ? this.data[k] : fallback;
    }
  }
  type LayoutClass = { template: string };
  const templateLayoutFactory = {
    createClass(template: string): LayoutClass {
      return class {
        static template = template;
      };
    },
  };
  const render = (layout: unknown, props: DataManager) =>
    String((layout as LayoutClass | undefined)?.template ?? "").replace(/\{\{\s*properties\.([A-Za-z_]+)\s*\}\}/g, (_m, k: string) => esc(props.get(k)));

  // The map on the page (a Clusterer redraws it when its pins change).
  const live: { map: StubMap | null } = { map: null };
  class Placemark {
    coords: LatLng;
    properties: DataManager;
    options: DataManager;
    events = new EventManager();
    wrap: HTMLDivElement;
    constructor(coords: LatLng, props?: Props, options?: Props) {
      this.coords = coords;
      this.properties = new DataManager(props);
      this.options = new DataManager(options);
      this.wrap = document.createElement("div");
      this.properties.changed = () => this.paint();
      this.paint();
    }
    layoutKey() {
      return "iconLayout";
    }
    paint() {
      this.wrap.innerHTML = render(this.options.get(this.layoutKey()), this.properties);
    }
    geometry = { getCoordinates: () => this.coords };
  }
  class Cluster extends Placemark {
    objects: Placemark[];
    constructor(center: LatLng, objects: Placemark[], options: DataManager) {
      super(center, { geoObjects: objects }, { clusterIconLayout: options.get("clusterIconLayout"), iconShape: options.get("clusterIconShape"), zIndex: 30 });
      this.objects = objects;
    }
    layoutKey() {
      return "clusterIconLayout";
    }
    getGeoObjects() {
      return this.objects;
    }
    getBounds(): [LatLng, LatLng] {
      const lat = this.objects.map((o) => o.coords[0]);
      const lon = this.objects.map((o) => o.coords[1]);
      return [
        [Math.min(...lat), Math.min(...lon)],
        [Math.max(...lat), Math.max(...lon)],
      ];
    }
  }
  class Clusterer {
    options: DataManager;
    events = new EventManager();
    objects: Placemark[] = [];
    shown: Placemark[] = [];
    constructor(options?: Props) {
      this.options = new DataManager(options);
    }
    add(o: Placemark | Placemark[]) {
      this.objects.push(...(Array.isArray(o) ? o : [o]));
      live.map?.redraw();
      return this;
    }
    remove(o: Placemark) {
      this.objects = this.objects.filter((x) => x !== o);
      live.map?.redraw();
      return this;
    }
    createCluster(center: LatLng, geoObjects: Placemark[]): Cluster {
      return new Cluster(center, geoObjects, this.options);
    }
    // What the map draws for this clusterer at the current view.
    layout(map: StubMap): Placemark[] {
      const grid = Number(this.options.get("gridSize", 64));
      const maxZoom = Number(this.options.get("maxZoom", Infinity));
      if (map.zoom > maxZoom) return [...this.objects];
      const cells = new Map<string, Placemark[]>();
      for (const o of this.objects) {
        const [x, y] = project(o.coords, map.zoom);
        const k = `${Math.floor(x / grid)}:${Math.floor(y / grid)}`;
        cells.set(k, [...(cells.get(k) ?? []), o]);
      }
      const out: Placemark[] = [];
      for (const list of cells.values()) {
        if (list.length < 2) {
          out.push(list[0]);
          continue;
        }
        const center: LatLng = [list.reduce((s, o) => s + o.coords[0], 0) / list.length, list.reduce((s, o) => s + o.coords[1], 0) / list.length];
        const c = this.createCluster(center, list);
        c.events.add("click", () => this.events.fire("click", { target: c }));
        out.push(c);
      }
      return out;
    }
  }
  class Collection {
    items: (Placemark | Clusterer)[] = [];
    constructor(private map: StubMap) {}
    add(o: Placemark | Clusterer) {
      this.items.push(o);
      this.map.redraw();
      return this;
    }
    remove(o: Placemark | Clusterer) {
      this.items = this.items.filter((x) => x !== o);
      this.map.redraw();
      return this;
    }
  }
  class StubMap {
    root: HTMLElement;
    ground: HTMLDivElement;
    places: HTMLDivElement;
    hits: HTMLDivElement;
    center: LatLng;
    zoom: number;
    events = new EventManager();
    geoObjects: Collection;
    drawn: { geo: Placemark; x: number; y: number }[] = [];
    panes = { get: (k: string) => (k === "ground" ? { getElement: () => this.ground } : k === "places" ? { getElement: () => this.places } : null) };
    constructor(root: HTMLElement, state: { center: LatLng; zoom: number }) {
      this.root = root;
      this.center = state.center;
      this.zoom = state.zoom;
      this.geoObjects = new Collection(this);
      // Each pane is its own stacking layer, the events pane on top.
      const layer = (cls: string, z: number) => {
        const el = document.createElement("div");
        el.className = cls;
        el.style.cssText = `position:absolute;inset:0;overflow:hidden;z-index:${z}`;
        root.appendChild(el);
        return el;
      };
      this.ground = layer("ymaps-stub-ground", 1);
      this.places = layer("ymaps-stub-places", 2);
      this.hits = layer("ymaps-stub-events", 3);
      this.paint();
      live.map = this;
      this.hits.addEventListener("click", (e) => {
        const r = root.getBoundingClientRect();
        const px = e.clientX - r.left;
        const py = e.clientY - r.top;
        // The topmost placemark whose shape holds the point.
        const hit = [...this.drawn]
          .sort((a, b) => Number(b.geo.options.get("zIndex", 1)) - Number(a.geo.options.get("zIndex", 1)))
          .find(({ geo, x, y }) => {
            const shape = geo.options.get("iconShape") as { type?: string; coordinates?: number[]; radius?: number } | undefined;
            if (!shape || shape.type !== "Circle" || geo.options.get("interactivityModel") === "default#transparent") return false;
            const [ox, oy] = shape.coordinates ?? [0, 0];
            return Math.hypot(px - (x + ox), py - (y + oy)) <= Number(shape.radius ?? 0);
          });
        if (hit) {
          hit.geo.events.fire("click", { target: hit.geo });
          return;
        }
        const [cx, cy] = project(this.center, this.zoom);
        this.events.fire("click", { coords: unproject(cx + px - r.width / 2, cy + py - r.height / 2, this.zoom) });
      });
    }
    paint() {
      const road = "#ffffff";
      this.ground.style.background = [
        "radial-gradient(circle at 72% 30%, #cfe2f3 0 9%, transparent 9.2%)",
        "radial-gradient(ellipse at 22% 70%, #d7ebd2 0 12%, transparent 12.3%)",
        `repeating-linear-gradient(90deg, transparent 0 118px, ${road} 118px 124px)`,
        `repeating-linear-gradient(0deg, transparent 0 96px, ${road} 96px 101px)`,
        `linear-gradient(28deg, transparent 49.4%, ${road} 49.5% 50.6%, transparent 50.7%)`,
        "#eef0ea",
      ].join(",");
    }
    size(): [number, number] {
      return [this.root.clientWidth || 800, this.root.clientHeight || 500];
    }
    getBounds(): [LatLng, LatLng] {
      const [w, h] = this.size();
      const [cx, cy] = project(this.center, this.zoom);
      return [unproject(cx - w / 2, cy + h / 2, this.zoom), unproject(cx + w / 2, cy - h / 2, this.zoom)];
    }
    getZoom() {
      return this.zoom;
    }
    getCenter() {
      return this.center;
    }
    setCenter(center: LatLng, zoom?: number) {
      this.center = center;
      if (typeof zoom === "number") this.zoom = Math.max(0, Math.min(19, zoom));
      this.moved();
    }
    setZoom(zoom: number) {
      this.zoom = Math.max(0, Math.min(19, zoom));
      this.moved();
    }
    setBounds(b: [LatLng, LatLng], opts?: { zoomMargin?: number }) {
      const m = Number(opts?.zoomMargin ?? 0) * 2;
      const [w, h] = this.size();
      let z = 19;
      while (z > 0) {
        const [x1, y1] = project([b[1][0], b[0][1]], z);
        const [x2, y2] = project([b[0][0], b[1][1]], z);
        if (x2 - x1 <= w - m && y2 - y1 <= h - m) break;
        z -= 1;
      }
      this.center = [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2];
      this.zoom = z;
      this.moved();
    }
    moved() {
      this.redraw();
      this.events.fire("boundschange", {});
    }
    redraw() {
      this.places.replaceChildren();
      this.drawn = [];
      const [w, h] = this.size();
      const [cx, cy] = project(this.center, this.zoom);
      const put = (p: Placemark) => {
        const [px, py] = project(p.coords, this.zoom);
        const x = px - cx + w / 2;
        const y = py - cy + h / 2;
        p.wrap.style.cssText = `position:absolute;width:0;height:0;left:${x}px;top:${y}px;z-index:${Number(p.options.get("zIndex", 1))}`;
        this.drawn.push({ geo: p, x, y });
        this.places.appendChild(p.wrap);
      };
      for (const o of this.geoObjects.items) {
        if (o instanceof Clusterer) o.layout(this).forEach(put);
        else put(o);
      }
    }
    destroy() {
      this.ground.remove();
      this.places.remove();
      this.hits.remove();
      if (live.map === this) live.map = null;
    }
  }
  (window as unknown as { ymaps: unknown }).ymaps = {
    ready(ok?: () => void) {
      return new Promise<void>((resolve) =>
        setTimeout(() => {
          ok?.();
          resolve();
        }, 0),
      );
    },
    meta: { coordinatesOrder: "latlong" },
    Map: StubMap,
    Placemark,
    Clusterer,
    templateLayoutFactory,
  };
}
