# LexGo Frontend Update

Project: Law Marketplace
Backend URL: https://lexgo.api.cognilabs.org

## New Seller Cabinet Bootstrap API

Use this for advocate/lawyer portal bootstrapping:

- `GET /lawyers/me/cabinet`
- Alias: `GET /seller/me/cabinet`

Auth: Bearer token required.

## Purpose

This endpoint is for `/{locale}/portal/advokat` and yurist portal routes. It prevents the portal from depending on many separate first-load requests and supports pending sellers without a 404/403 blank page.

## Response Keys

- `account_status`
- `role`
- `seller_type`
- `limited_access`
- `limited_reason`
- `available_actions`
- `profile`
- `stats`
- `new_orders`
- `active_cases`
- `secure_chats`
- `services`
- `verification`
- `notifications`

## Pending Seller Behavior

If a yurist/advokat is registered but still pending admin verification:

- response status is `200`
- `limited_access=true`
- profile and verification status are returned
- `available_actions.accept_orders=false`
- `available_actions.secure_chat=false`
- `available_actions.calls=false`

Frontend should render the cabinet shell, profile, and verification state instead of showing 404 or a blank page.

## Active Seller Behavior

If seller account is active and verified:

- `limited_access=false`
- `new_orders` returns open/assigned orders
- `active_cases` returns seller active cases
- `secure_chats` returns active seller rooms
- `stats` includes dashboard data
- `services` includes selected service capabilities

## Verified

Production smoke test passed:

- active advokat: `/lawyers/me/cabinet` returned `200`, `limited_access=false`
- alias `/seller/me/cabinet` returned `200`
- pending yurist: `/lawyers/me/cabinet` returned `200`, `limited_access=true`
- temporary smoke data was cleaned up
