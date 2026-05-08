# Checkpoint-001 — Global Pricing Management & Shkeeper Crypto Gateway

**Date:** 2026-05-08  
**Status:** All tasks complete — ready for remote deployment

---

## Changes Summary

### Task 1: Admin Sidebar Refactor
| File | Change |
|---|---|
| `src/app/adminsystemnrsp/layout.tsx` | `API Keys` → `Pricing` with `DollarSign` icon |
| `src/app/adminsystemnrsp/page.tsx` | Dashboard quick-access card updated |

### Task 2: Admin Pricing Dashboard
| File | Status | Description |
|---|---|---|
| `src/lib/pricing-config.ts` | **NEW** | Server-side pricing resolver — merges static `PLAN_CONFIGS` with `SystemConfig` DB overrides |
| `src/app/api/admin/pricing/route.ts` | **NEW** | Admin pricing API (GET public, PUT admin-only) — handles plan overrides, exchange rate, confirmation settings |
| `src/app/adminsystemnrsp/pricing/page.tsx` | **REWRITE** | Full pricing dashboard with editable tier table, USDT exchange rate editor, per-chain confirmation settings |

### Task 3: Public Pricing Sync
| File | Change |
|---|---|
| `src/app/services/vps/page.tsx` | Now fetches dynamic prices from `/api/admin/pricing` on mount |
| `src/app/payment/page.tsx` | Complete rewrite — dynamic pricing, USDT crypto flow, anti-clipjack |

### Task 4: Shkeeper.io Crypto Gateway
| File | Status | Description |
|---|---|---|
| `prisma/schema.prisma` | **MODIFIED** | Added `CryptoTopup` model, `cryptoTopups` relation on `User`, `CRYPTO_TOPUP_INITIATED`/`CRYPTO_TOPUP_COMPLETED` audit actions |
| `src/lib/shkeeper.ts` | **NEW** | Shkeeper REST API client — HD wallet address generation, payment status, HMAC webhook verification |
| `src/app/api/payment/crypto/topup/route.ts` | **NEW** | POST: initiate USDT top-up, GET: poll status |
| `src/app/api/payment/crypto/webhook/route.ts` | **NEW** | Shkeeper webhook receiver — HMAC validation, atomic credit minting |

### Anti-Clipjack Feature
- Integrated into `payment/page.tsx`
- Reads `navigator.clipboard.readText()` after user copies deposit address
- **Match** → green `ShieldCheck` badge
- **Mismatch** → red `CLIPBOARD COMPROMISED` warning with malware scan advisory

---

## Required Environment Variables (Remote Server)
```env
SHKEEPER_BASE_URL=https://your-shkeeper-instance.example.com
SHKEEPER_API_KEY=your-api-key
SHKEEPER_WEBHOOK_SECRET=a-strong-random-secret
```

## Deployment Commands (Remote Server)
```bash
# 1. Push Prisma schema changes
cd /path/to/Portfolio
npx prisma db push

# 2. Regenerate Prisma client
npx prisma generate

# 3. Build to verify TypeScript
npm run build

# 4. Restart application
pm2 restart portfolio
```

## Key Defaults
| Setting | Default Value | Configurable In |
|---|---|---|
| USDT Exchange Rate | 1 USDT = 26,305 Credits | Admin Pricing Dashboard |
| TRC-20 Confirmations | 1 | Admin Pricing Dashboard |
| ERC-20 Confirmations | 3 | Admin Pricing Dashboard |
| Deposit Address TTL | 30 minutes | Code (`topup/route.ts`) |
