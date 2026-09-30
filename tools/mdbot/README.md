# LexGo MD bot

`/start` bosgan har bir odamga tayyor MD hujjatlarni yuboradi — har bir fayl
ostida loyiha nomi va shu hujjat nima haqida ekani yozilgan holda.

Bot: **@notifer_projects_bot**

## Ishga tushirish

```bash
node tools/mdbot/bot.mjs             # doimiy ishlaydi (long polling)
node tools/mdbot/bot.mjs --once      # kutib turgan xabarlarga javob berib chiqadi
node tools/mdbot/bot.mjs --broadcast # /start bosganlarning hammasiga qayta yuboradi
```

Bot ishlab turgandagina `/start` javob oladi. Serverda doimiy ushlab turish uchun
`pm2 start tools/mdbot/bot.mjs --name lexgo-mdbot` yoki systemd/Task Scheduler.

## Token

`tools/mdbot/.env`:

```
TELEGRAM_BOT_TOKEN=…
```

Bu fayl `.gitignore` da — hech qachon commit qilinmaydi. Token parol bilan teng:
ochiq joyda (chat, screenshot, issue) ko'rsatilgan bo'lsa, BotFather'da
`/revoke` qilib yangisini oling va shu faylni yangilang.

## Hujjatlar ro'yxati

`docs.json` — nimani yuborishni shu fayl hal qiladi:

```json
{
  "project": "LexGo",
  "tagline": "…",
  "docs": [
    { "file": "../../md/FAYL.md", "title": "Sarlavha", "description": "Ichida nima bor" }
  ]
}
```

- `file` — shu papkaga nisbatan yo'l.
- `description` — fayl ostidagi izoh. Telegram caption chegarasi 1024 belgi;
  undan uzuni so'z chegarasida qisqartiriladi.
- Yo'q fayl jimgina o'tkazib yuboriladi (konsolda `[skip]` yoziladi).

Yangi hujjat qo'shish: `md/` ga faylni qo'ying, `docs.json` ga bir blok yozing,
botni qayta ishga tushiring. Eskilarga ham yuborish kerak bo'lsa — `--broadcast`.

## Local holat (commit qilinmaydi)

- `subscribers.json` — `/start` bosganlar ro'yxati (broadcast shu bo'yicha ishlaydi).
- `.offset` — oxirgi o'qilgan update id, bir xabarga ikki marta javob bermaslik uchun.
