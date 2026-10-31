# LexGo Marketplace Yandex Maps — Frontend Integration Contract

## Delivery status

Backend commit: `b448ab3`

Production API: `https://lexgo.api.cognilabs.org`

The backend is deployed and verified. This contract covers the web marketplace map, client location consent, nearby seller search, seller office location, Yandex navigation, privacy rules, filters, and realtime updates.

**Updated 2026-10-31** with the backend answers (`LEXGO_BACKEND_ANSWERS_ALL_TASKS_2026_10_31.md` §7): the map is Yandex Maps JS API **2.1** (not v3), loaded only from the config's `maps_loader_url`; the geocoder item shape, `service_action`, the office-location fields and its delete flow, the error envelope and the realtime privacy rule are now documented below. The production Geocoder key is refused by Yandex (HTTP 403) until a valid key is installed, so address search shows a safe fallback and the point is picked on the map.

## Required user experience

1. Load `GET /marketplace/map/config` before initializing the map.
2. Load the Yandex script only from `maps_loader_url` and pick the renderer by `api_version`. The backend runs `2.1`: `ymaps.ready`, `ymaps.Map`, `ymaps.Placemark`, `ymaps.Clusterer`. Never hard-code a loader URL, never log the key, never put it in an error message.
3. Render public markers from `GET /marketplace/sellers/map`.
4. Ask for browser geolocation only after an explicit user action such as “Show specialists near me”.
5. Record the permission result through `POST /marketplace/me/location-consent`.
6. Send the current coordinate to `POST /marketplace/nearby-sellers/search` only after consent is granted.
7. If browser permission is denied, allow the client to select a point manually on the map and record consent with `source: manual`.
8. Use the backend navigation endpoint instead of constructing Yandex URLs in the frontend.
9. Subscribe to marketplace map realtime events while the map page is open.

## Map configuration

`GET /marketplace/map/config`

No authentication is required.

Important response fields:

- `provider`: `yandex`
- `api_version`: `2.1` (any `2.1.x` is the same renderer)
- `maps_loader_url`: the 2.1 loader with the key and language, e.g. `https://api-maps.yandex.ru/2.1/?apikey=<key>&lang=uz_UZ`
- `maps_api_key`: browser map key (the frontend doesn't read it; the key travels only inside `maps_loader_url`)
- `configured`: Yandex key availability
- `geocoder_configured`: whether address search is set up
- `coordinate_order`: `longitude_latitude` for every coordinate array the backend sends
- `default_location.center`: `[longitude, latitude]`
- `default_location.zoom`
- `seller_map_url`
- `nearby_search_url`
- `location_consent_url`
- `seller_office_location_url`
- `navigation_url_template`
- `geocoder_search_url`
- `geocoder_reverse_url`
- `viewport_debounce_ms`: use this value when requesting new viewport markers
- `realtime`: websocket events and resource URLs
- `privacy`: backend-enforced location privacy contract

If `configured` is false, `maps_loader_url` is missing or not an https Yandex Maps host, `api_version` is a version the page can't draw, or the script fails to load (15 s timeout), show the seller list and filters without the map. Do not expose a broken map state.

### Frontend implementation (2.1)

- `components/marketplace/map/ymaps.ts` loads the script from `maps_loader_url` once per page, waits for `ymaps.ready`, and gives the two map components (`SellersYandexMap`, `PointPickerMap`) one small handle; the components never touch Yandex objects.
- The deployed loader uses 2.1's default `[latitude, longitude]` order (`ymaps.meta.coordinatesOrder`); the handle converts to and from the backend's `[longitude, latitude]`.
- Markers are `ymaps.Placemark`s drawn from `templateLayoutFactory` templates (values escaped) with a circular `iconShape` for taps. Seller pins go into a `ymaps.Clusterer` (48 px grid, never above zoom 17) whose counts zoom in on a tap or Enter; the backend's own clusters (zoom < 13) are separate placemarks that zoom in and refetch the viewport.
- Every focusable marker has `tabindex="0"`; Enter or Space does what a tap does. Zoom buttons, the locate button, the seller list under the map and the card (Escape closes it) are ordinary buttons.
- 2.1 has no dark scheme: in dark mode only the tile pane (`map.panes.get("ground")`) is inverted and re-tinted, so the pins keep their colours. `autoFitToViewport: "always"` keeps the map filling its box.
- Browser tests serve a 2.1 stand-in (`tests/e2e/ymapsStub.ts`) from the config's loader URL; it implements the same calls with 2.1's semantics, including the events pane that lets a tap reach a marker only through its shape.

## Public viewport map

`GET /marketplace/sellers/map`

Query parameters:

- `bbox`: required, `min_longitude,min_latitude,max_longitude,max_latitude`
- `zoom`: `0..21`
- `service_id`: optional
- `category_id`: optional; includes every active descendant category
- `subcategory_id`: optional
- `seller_type`: `advokat | yurist | advokat_tashkiloti`
- `minimum_rating`: `0..5`
- `verified_only`: boolean
- `limit`: `1..500`

Response contains `markers`, `clusters`, `count`, `total_in_bbox`, `truncated`, `filters`, and the normalized `bbox`.

Coordinates in marker arrays use `[longitude, latitude]`. Public markers are deliberately approximate (about 500 m, `privacy.public_marker_precision`). Never label them as an exact current address: the frontend labels every pin "… area (approximate)" (region centre for `profile_region`) and the seller card says "Approximate area, ≈500 m — not an exact address".

### `service_action`

Map markers and nearby results may carry a compact service action:

```json
{
  "id": "service-id",
  "title": "Service title",
  "price": 100000,
  "currency": "UZS",
  "can_purchase": true,
  "purchase_url": "/..."
}
```

`id` is the service ID (there is no `service_id`). With `can_purchase: true` the card and the nearby row link to the seller's profile with `?buy=<id>`, which opens the profile's purchase dialog for that service; otherwise they link to the profile's services. The price is shown in its currency.

### Seller avatar

Markers and nearby results have no `avatar_url` (backend gap). Pins, cards and rows show a generated initials avatar; no photo is read or faked.

When `zoom < 13`, render `clusters`. Clicking a cluster must zoom and refetch the viewport. When `zoom >= 13`, render individual markers.

## Client location consent

`GET /marketplace/me/location-consent`

Returns the current consent state. A new user receives `granted: false` and `permission_state: prompt`.

`POST /marketplace/me/location-consent`

Browser permission granted:

```json
{
  "granted": true,
  "permission_state": "granted",
  "source": "web",
  "duration_hours": 24
}
```

Manual map selection after browser denial:

```json
{
  "granted": true,
  "permission_state": "granted",
  "source": "manual",
  "duration_hours": 24
}
```

Permission denied or consent revoked:

```json
{
  "granted": false,
  "permission_state": "denied",
  "source": "web"
}
```

Allowed durations are `1`, `24`, `168`, `720`, or `null`. `null` remains valid until explicitly revoked.

The backend stores the consent audit but never stores the client coordinates submitted to search or navigation.

## Nearby seller search

`POST /marketplace/nearby-sellers/search`

Authentication and active location consent are required.

```json
{
  "latitude": 41.2995,
  "longitude": 69.2401,
  "accuracy_meters": 25,
  "radius_km": 10,
  "service_id": null,
  "category_id": null,
  "subcategory_id": null,
  "seller_type": null,
  "minimum_rating": 0,
  "verified_only": true,
  "sort": "nearest",
  "limit": 50
}
```

Allowed radii: `5`, `10`, `25`, `50` km.

Allowed sorting: `nearest`, `rating`, `recommended`.

Each result contains seller identity, distance, approximate location, source, rating, verification, profile URL, and a `navigation` contract.

If nobody is inside the selected radius, `fallback_nearest: true` and the nearest available specialists are returned. Explain this state in the UI instead of showing an empty error.

If `accuracy_warning: true`, show a small non-blocking notice that the detected location is not very accurate and offer manual point selection.

Errors:

- `401`: login required
- `403 / client_location_consent_required`: open the consent UI
- `404 / service_not_found | category_not_found | subcategory_not_found`
- `422 / radius_invalid | seller_type_invalid | subcategory_category_mismatch`

## Yandex navigation

`POST /marketplace/sellers/{seller_user_id}/navigation`

```json
{
  "latitude": 41.2995,
  "longitude": 69.2401,
  "mode": "driving",
  "paid_order_id": null
}
```

Modes: `driving`, `walking`, `transit`, `bicycle`.

Use `paid_order_id` only when opening navigation from an active paid order assigned to that seller.

Response includes:

- `app_url`: try this first on devices with Yandex Maps installed
- `web_url`: browser route
- `fallback_url`: open this if the app scheme fails
- `destination_source`: `public_office` or `paid_order_live_location`
- `destination`: the authorized destination coordinate

Do not build route URLs or derive exact coordinates in the frontend.

Security rules enforced by backend:

- Public navigation works only when the seller explicitly enabled public office navigation.
- Exact live seller location works only for an active paid order assigned to this seller.
- Completed, cancelled, refunded, unrelated, or unpaid orders cannot unlock live location.

Errors:

- `403 / client_location_consent_required`
- `403 / navigation_destination_unavailable`
- `404 / seller_not_found | paid_order_not_found`
- `409 / active_paid_order_required`

## Seller office location settings

Seller roles use:

- `GET /marketplace/me/office-location`
- `PUT /marketplace/me/office-location`
- `DELETE /marketplace/me/office-location` — "Remove office"; the answer reports `configured: false`

```json
{
  "latitude": 41.2995,
  "longitude": 69.2401,
  "formatted_address": "Toshkent shahri",
  "public_navigation_enabled": true
}
```

The settings page must clearly explain that enabling `public_navigation_enabled` lets clients receive a route to this office. Saving a private office with the switch off does not expose an exact navigation destination.

`GET`/`PUT` answer `{configured, office}`; `office` contains `latitude`, `longitude`, `formatted_address`, `source`, `public_navigation_enabled`, `confirmed_at` / `geocoded_at` and `record_id`.

The settings card shows the address, whether clients may get a route, how the point was set (`source` in words: marked on the map, found by address, from the device, set by the LexGo team; an unknown value is not shown) and when it was confirmed / its address checked (local date and time). `record_id` is never read or shown. "Remove office" asks in the app's own confirm dialog, sends `DELETE`, and then shows the "not on the map yet" state with "Add office".

The office point can be picked on the map, by address search, or from the device. When the geocoder is down, the address search and the reverse lookup say so in words; the map point is still saved and the seller types the address.

## Geocoder

`GET /marketplace/geocoder/search?q=&lang=&limit=` and `GET /marketplace/geocoder/reverse?latitude=&longitude=&lang=` (signed in).

Answer metadata: `count`, `found`, `provider`, `cached`, `rate_limit_remaining`, `coordinate_order` (`longitude_latitude`). Each item:

```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "formatted_address": "string",
  "latitude": 41.0,
  "longitude": 69.0,
  "precision": "string",
  "kind": "string",
  "country_code": "string",
  "components": {}
}
```

The frontend reads `latitude`/`longitude` first (a `coordinates` array follows `coordinate_order`), shows `name` with `formatted_address` (or `description`) under it, and never shows coordinates, `kind` or `precision` codes.

Errors `yandex_geocoder_key_invalid`, `yandex_geocoder_not_configured`, `yandex_geocoder_unavailable`, `seller_type_invalid` (and a provider 403/502/503/504 without a code) show "Address search is unavailable right now — pick the point on the map" (without a map: "… try again a little later"); `geocoder_rate_limit_exceeded` asks to wait a minute. With `geocoder_configured: false` nothing is asked and the same message shows. The production key returns 403 today, so this fallback is the usual path until a valid key is installed.

## Error envelope

Map and geocoder errors use `{"detail": {"code": "machine_readable_code"}}`; general authentication/framework errors may use a plain string `detail`. The frontend reads the code from both (the shared `errorCode()` in `lib/http`), shows each listed code in words, and words an unknown code by its HTTP status. A raw code is never shown.

## Realtime map updates

Connect to `/ws/users/me` with the normal authenticated websocket flow.

After connection send:

```json
{"event":"marketplace.map.subscribe"}
```

Wait for `marketplace.map.subscribed`.

Listen for `marketplace.seller_location_updated`. Debounce marker refreshes and refetch the current viewport from `/marketplace/sellers/map`. The event may contain a marker or `marker: null` when sharing is disabled. Public updates carry only an approximate (≈500 m) marker; the frontend never reads coordinates from the event at all — it only refetches.

When leaving the map page send:

```json
{"event":"marketplace.map.unsubscribe"}
```

## Required UI states

- Loading skeleton for config and markers
- Map unavailable fallback list
- Location permission prompt
- Permission denied with manual map-point fallback
- Low-accuracy notice
- No specialists in radius with nearest fallback message
- Marker and cluster states
- Seller card with distance, rating, verification, and service/profile actions
- Navigation mode selector
- Yandex app open attempt with web fallback
- Realtime reconnect and viewport resync
- Accessible keyboard controls and translated labels
- Address search unavailable (geocoder down) with map point picking
- Office configured / not configured, and the "Remove office" confirm

## Privacy requirements

- Never save client coordinates in local persistent storage unless the user explicitly chooses an app-level saved location feature later.
- Never show a public marker as an exact current seller location.
- Never bypass the navigation endpoint using marker coordinates.
- Never display the raw Yandex geocoder key in logs or error messages. The same holds for the maps key inside `maps_loader_url`.
- Treat `location_precision`, `navigation.available`, and backend action/error fields as the source of truth.

