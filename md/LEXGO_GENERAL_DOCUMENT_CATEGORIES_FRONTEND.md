# LexGo Frontend Update: General Document Categories and Template Fields

## Summary

Backend now imports and serves document templates from `/home/akhmad/Desktop/Docs`.

The document catalog is grouped into 4 general categories:

- `Jinoiy`
- `Ma’muriy`
- `Iqtisodiy`
- `Fuqarolik`

Production currently has:

- `987` active document services
- `987` active document templates
- `4` active general categories

Old `civil-court-*` document services/templates were deactivated.

## Categories API

Use:

```http
GET /service-categories
```

Response contains the 4 general categories:

```json
[
  {
    "slug": "legal-doc-civil",
    "title": "Fuqarolik"
  },
  {
    "slug": "legal-doc-economic",
    "title": "Iqtisodiy"
  },
  {
    "slug": "legal-doc-criminal",
    "title": "Jinoiy"
  },
  {
    "slug": "legal-doc-administrative",
    "title": "Ma’muriy"
  }
]
```

## Services API

Use selected category id:

```http
GET /services?category_id={category_id}&catalog_only=true
```

Each service has:

- `id`
- `title`
- `category_id`
- `document_template_id`
- `catalog_code`
- `is_active`

Only active real services should be shown.

## Template Fields API

When client selects a service, fetch its fields:

```http
GET /services/{service_id}/document-fields
```

Important response fields:

```json
{
  "service_id": "...",
  "template_id": "...",
  "title": "...",
  "fields": [
    {
      "name": "shartnoma_tuzilgan_vaqt",
      "key": "shartnoma_tuzilgan_vaqt",
      "label": "Шартнома тузилган вақт",
      "type": "text",
      "required": true,
      "placeholder": "{Шартнома тузилган вақт}"
    }
  ],
  "field_count": 52,
  "required_count": 52,
  "source_file_name": "original-file.docx",
  "source_file_url": "/services/{service_id}/document-template/source-file",
  "clean_source_file_url": "/services/{service_id}/document-template/clean-source-file"
}
```

Frontend should render form inputs from `fields`.

Use `key` as the answer object key.

## Field Quality

The new files already contain explicit placeholders like:

```text
{Шартнома тузилган вақт}
{Аризачининг Ф.И.О. си}
{Аризачининг телефон рақами}
```

Backend now extracts those exact placeholders, not guessed fields.

Phone/number marker `+998900000000` is also detected as a phone field.

Field types are inferred as:

- `phone`
- `email`
- `date`
- `number`
- `textarea`
- `text`

This is much more reliable than the previous civil-court import.

## Generate Document

After user fills all required fields:

```http
POST /services/{service_id}/document-generate
Authorization: Bearer {token}
Content-Type: application/json
```

Payload:

```json
{
  "title": "Document title",
  "answers": {
    "shartnoma_tuzilgan_vaqt": "2026-09-23",
    "arizachining_f_i_o_si": "Ali Valiyev",
    "arizachining_telefon_raqami": "+998901234567"
  }
}
```

Backend returns ready DOCX file:

```json
{
  "document_request": {
    "status": "file_ready",
    "paid": true,
    "requires_payment": false
  },
  "file": {
    "download_url": "/document-requests/{id}/docx",
    "format": "docx"
  }
}
```

## Important Behavior

Backend does not create a new generic document layout.

It copies the original DOCX template and only replaces placeholders inside that same file.

So formatting, tables, spacing, fonts and layout should stay like the original file.

## Frontend Flow

1. Load categories with `GET /service-categories`.
2. User selects one category.
3. Load services with `GET /services?category_id={category_id}&catalog_only=true`.
4. User selects one service.
5. Load fields with `GET /services/{service_id}/document-fields`.
6. Render dynamic form from `fields`.
7. Send answers to `POST /services/{service_id}/document-generate`.
8. Show returned DOCX download/open link.

## Validation

If required fields are missing, backend returns `422`:

```json
{
  "detail": {
    "message": "Required fieldlar to'ldirilmagan",
    "missing_required_fields": [
      {
        "name": "...",
        "key": "...",
        "label": "..."
      }
    ]
  }
}
```

Frontend should show missing labels to the user.

## Production Test Result

Backend tested on production:

- `GET /service-categories` returns 4 categories.
- `GET /services/{service_id}/document-fields` returns exact fields from DOCX.
- `POST /services/{service_id}/document-generate` returns ready DOCX.
- Generated DOCX contains user answers.
- Old placeholder was removed after generation.
- Payment is auto-confirmed for this test flow.

