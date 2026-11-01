# LexGo Legal Document Languages Final Frontend Contract

Date: 2026-11-01  
Backend commit: `eecebb9`  
Environment: Production

## Delivery result

The backend issues reported in `LexGo_Legal_Docs_Languages_Backend_2026_11_01.docx` have been resolved.

- The Privacy Policy now has complete Uzbek, Russian, and English content.
- The English Privacy Policy contains the full policy rather than the former 47-character placeholder.
- A missing translation is no longer represented as if it existed.
- The response now reports the requested language and the actual content language separately.
- Admin legal endpoints accept and return multilingual content.
- Footer aliases have a canonical backend mapping.

## Public endpoints

### List legal documents

```http
GET /legal/consents?include_body=true&lang=uz
GET /legal/consents?include_body=true&lang=ru
GET /legal/consents?include_body=true&lang=en
```

### Get a legal document by ID

```http
GET /legal/consents/{consent_id}?lang=uz|ru|en
```

### Get a legal document by canonical slug or footer alias

```http
GET /legal/consents/by-slug/{slug}?lang=uz|ru|en
```

Supported footer mappings:

| Footer link | Accepted slug | Canonical document |
|---|---|---|
| Terms | `terms` | `user_offer` |
| Disclaimer | `disclaimer` or `legal_disclaimer` | `platform_rules` |

The backend response always contains the canonical `slug` and lists accepted aliases in `aliases`.

### Authenticated user's consent state

```http
GET /legal/consents/me?lang=uz|ru|en
Authorization: Bearer <access_token>
```

## Language response contract

```json
{
  "slug": "privacy",
  "title": "Privacy Policy",
  "body": "PRIVACY POLICY\nPersonal Data Processing Policy ...",
  "language": "en",
  "requested_language": "en",
  "translation_fallback": false,
  "available_languages": ["uz", "ru", "en"],
  "title_i18n": {
    "uz": "Maxfiylik siyosati",
    "ru": "ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ",
    "en": "Privacy Policy"
  },
  "body_i18n": {
    "uz": "...",
    "ru": "...",
    "en": "..."
  }
}
```

Field meanings:

| Field | Meaning |
|---|---|
| `requested_language` | Canonical language requested by the frontend |
| `language` | Actual language of `title` and `body` |
| `translation_fallback` | `true` when requested content is unavailable and Uzbek is returned |
| `available_languages` | Languages that have both a real title and a real body |
| `title_i18n` | Only genuine available title translations |
| `body_i18n` | Only genuine available body translations |

## Honest fallback behavior

If English or Russian content does not exist, the backend no longer copies Uzbek content into that language key.

Example for an English request when only Uzbek and Russian exist:

```json
{
  "title": "Foydalanuvchi ofertasi",
  "body": "...Uzbek content...",
  "requested_language": "en",
  "language": "uz",
  "translation_fallback": true,
  "available_languages": ["uz", "ru"],
  "title_i18n": {
    "uz": "Foydalanuvchi ofertasi",
    "ru": "..."
  },
  "body_i18n": {
    "uz": "...",
    "ru": "..."
  }
}
```

Frontend rules:

1. Send the UI language in `lang`.
2. Render plain `title` and `body` exactly as returned.
3. Set the document container language from `response.language`, not from the UI locale and not from `requested_language`.
4. When `translation_fallback` is `true`, the content is a real Uzbek fallback. Do not label it as English or Russian.
5. Do not read a missing `title_i18n.en`, `body_i18n.en`, `title_i18n.ru`, or `body_i18n.ru` as an empty translation error. Its absence means the translation is not published.
6. The frontend may show a small localized message that this document is currently displayed in Uzbek because the requested translation is unavailable.
7. Never translate legal content in the browser.

## Current production language state

### Privacy Policy

`privacy` is complete in all three languages:

- Uzbek: complete;
- Russian: complete;
- English: complete, 13,070 characters;
- `available_languages`: `["uz", "ru", "en"]`.

### Other legal documents

Ten documents do not yet have a reviewed English translation. For `lang=en`, they currently return an honest Uzbek fallback with:

```json
{
  "requested_language": "en",
  "language": "uz",
  "translation_fallback": true
}
```

`remote_assistance_consent` does not yet have a reviewed Russian translation. For `lang=ru`, it returns the same honest Uzbek fallback contract.

No frontend workaround is required when those translations are later published. They will automatically appear in `available_languages`, and `language` will match `requested_language`.

## Admin legal endpoints

### List all versions

```http
GET /admin/legal/consents?lang=uz|ru|en
Authorization: Bearer <access_token>
```

The endpoint returns active and archived versions. Every row contains `title_i18n`, `body_i18n`, `available_languages`, `requested_language`, `language`, and `translation_fallback`.

### Create a multilingual document

```http
POST /admin/legal/consents
Authorization: Bearer <access_token>
Content-Type: application/json
```

Recommended request:

```json
{
  "slug": "privacy",
  "version": "2.0",
  "title_i18n": {
    "uz": "Maxfiylik siyosati",
    "ru": "Политика конфиденциальности",
    "en": "Privacy Policy"
  },
  "body_i18n": {
    "uz": "...",
    "ru": "...",
    "en": "..."
  },
  "audience": ["client", "advokat", "yurist"],
  "acceptance_required": true,
  "requires_reaccept": true,
  "is_active": true
}
```

Backward-compatible `title_json` and `body_json` are still accepted. New frontend code should send `title_i18n` and `body_i18n`.

### Create a new version

```http
PATCH /admin/legal/consents/{consent_id}
Authorization: Bearer <access_token>
Content-Type: application/json
```

Send the complete set of translations that should be valid for the new version:

```json
{
  "version_bump": "minor",
  "title_i18n": {
    "uz": "...",
    "ru": "...",
    "en": "..."
  },
  "body_i18n": {
    "uz": "...",
    "ru": "...",
    "en": "..."
  }
}
```

Versioning rules:

- Plain `title` and `body` are treated as Uzbek.
- Uzbek title and body are mandatory.
- A translation is valid only when both title and body are supplied for that language.
- If a new version is published with Uzbek only, old Russian and English text is not copied into the new version because it may be legally stale.
- Previous document versions remain archived and unchanged.
- Updating legal content creates an immutable new version and deactivates the previous active version.
- Metadata-only activation changes do not rewrite legal text.

Validation errors:

```json
{
  "detail": {
    "code": "legal_uz_translation_required",
    "fields": ["title_i18n.uz", "body_i18n.uz"]
  }
}
```

```json
{
  "detail": {
    "code": "legal_translation_pair_required",
    "languages": ["en"]
  }
}
```

Unsupported request language:

```json
{
  "detail": {
    "code": "legal_language_not_supported",
    "allowed": ["uz", "ru", "en"]
  }
}
```

## Admin editor UI requirements

1. Show separate Uzbek, Russian, and English tabs.
2. Uzbek title and body must be required.
3. Russian and English are optional, but each language requires both title and body when enabled.
4. Load values from `title_i18n` and `body_i18n`.
5. Submit all currently valid translations in one request.
6. Show `available_languages` in the version list.
7. Warn that omitting a translation from a new legal version removes it from that version until a reviewed translation is supplied.
8. Keep version history selectable and never overwrite an archived version in the UI.

## Production verification

Completed on the production server:

- 11 active legal documents audited through the live HTTPS API;
- full English Privacy Policy returned correctly;
- Uzbek, Russian, and English Privacy Policy maps verified;
- ten missing English translations return honest Uzbek fallback;
- missing Russian remote-assistance translation returns honest Uzbek fallback;
- footer aliases resolve to canonical documents;
- authenticated admin response returns multilingual maps;
- unsupported language returns the typed 422 error;
- 80 backend legal and Studio regression tests passed.
