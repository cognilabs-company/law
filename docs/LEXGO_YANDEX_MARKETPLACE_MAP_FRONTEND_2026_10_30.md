# LexGo Marketplace Yandex Maps — Frontend Integration Contract

## Delivery status

Backend commit: `b448ab3`

Production API: `https://lexgo.api.cognilabs.org`

The backend is deployed and verified. This contract covers the web marketplace map, client location consent, nearby seller search, seller office location, Yandex navigation, privacy rules, filters, and realtime updates.

## Required user experience

1. Load `GET /marketplace/map/config` before initializing the map.
2. Initialize Yandex Maps v3 with `maps_api_key` from that response.
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
- `api_version`: `v3`
- `maps_api_key`: browser map key
- `configured`: Yandex key availability
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

If `configured` is false, show the seller list and filters without the map. Do not expose a broken map state.

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

Coordinates in marker arrays use `[longitude, latitude]`. Public markers are deliberately approximate. Never label them as an exact current address.

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

```json
{
  "latitude": 41.2995,
  "longitude": 69.2401,
  "formatted_address": "Toshkent shahri",
  "public_navigation_enabled": true
}
```

The settings page must clearly explain that enabling `public_navigation_enabled` lets clients receive a route to this office. Saving a private office with the switch off does not expose an exact navigation destination.

## Realtime map updates

Connect to `/ws/users/me` with the normal authenticated websocket flow.

After connection send:

```json
{"event":"marketplace.map.subscribe"}
```

Wait for `marketplace.map.subscribed`.

Listen for `marketplace.seller_location_updated`. Debounce marker refreshes and refetch the current viewport from `/marketplace/sellers/map`. The event may contain a marker or `marker: null` when sharing is disabled.

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

## Privacy requirements

- Never save client coordinates in local persistent storage unless the user explicitly chooses an app-level saved location feature later.
- Never show a public marker as an exact current seller location.
- Never bypass the navigation endpoint using marker coordinates.
- Never display the raw Yandex geocoder key in logs or error messages.
- Treat `location_precision`, `navigation.available`, and backend action/error fields as the source of truth.

