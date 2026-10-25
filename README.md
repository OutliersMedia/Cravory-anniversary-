# Cravery 1st Anniversary "Spin the Wheel"

Cravery turns 1 on 1 November. Customers scan a QR code on their phone (95%+ mobile) and land directly on a frictionless spin-the-wheel page.
**No login, no signup, no OTP, no name or phone fields.** They just tap **SPIN**.

One device gets one game, only once. All state and outcomes are strictly decided on the server.

---

## 1. Project Structure

```
cravery-spin-the-wheel/
├── .env.example              # Environment variables template
├── schema.sql                # Supabase PostgreSQL tables, RLS, indexes & atomic perform_spin()
├── seed.sql                  # Seed data with default 4 offers and settings
├── vercel.json               # Hardened security headers, CSP, and routing rewrites
├── package.json              # React 18, Vite, TypeScript, Vitest, Jose, Zod
├── tsconfig.json             # TypeScript configuration
├── vite.config.ts            # Vite & Vitest configuration
├── index.html                # Mobile-first viewport & font preloads
├── public/
│   ├── favicon.svg           # Scalable favicon
│   └── logo.png              # Cravery logo (drop your file here)
├── api/                      # Vercel Serverless Functions
│   ├── _lib/
│   │   ├── auth.ts           # Jose JWT signing/verification, cookies
│   │   ├── crypto.ts         # SHA-256 fingerprinting, coupon CRV-XXXX-XXXX, Node crypto
│   │   ├── db.ts             # Supabase client with Service Role Key
│   │   ├── rate-limit.ts     # Postgres table-backed rate limiter
│   │   └── types.ts          # Zod validation schemas & TypeScript types
│   ├── admin/
│   │   └── [action].ts       # Single catch-all admin function (stays under 12-function limit)
│   ├── session.ts            # POST /api/session (identify/create player, anti-cheat sync)
│   ├── spin.ts               # POST /api/spin (server-enforced atomic spin)
│   └── coupon.ts             # GET /api/coupon (retrieves active coupon for re-saving)
├── src/                      # Frontend Source Code
│   ├── components/
│   │   ├── Header.tsx        # Centered logo / Fredoka wordmark & anniversary title
│   │   ├── Wheel.tsx         # Crisp SVG wheel (7 slices, 7s easeOutQuart, pointer tick)
│   │   ├── SpinButton.tsx    # Big pink button with exact progressive helper copy
│   │   ├── ResultPanel.tsx   # Slide-up modal (350ms), win/miss copies, Save as Image
│   │   ├── BlockedScreen.tsx # Anti-cheat block with 6-char dispute reference code
│   │   └── TestModeBadge.tsx # Visual indicator when admin test mode is active
│   ├── pages/
│   │   ├── GamePage.tsx      # Main customer spin page
│   │   └── AdminPage.tsx     # Lazy-loaded administration dashboard
│   ├── utils/
│   │   ├── anti-cheat.ts     # FingerprintJS + canvas/hardware signals & triple-store sync
│   │   ├── canvas-card.ts    # 1080x1350 PNG generator (Web Share API -> Download -> New Tab)
│   │   ├── idb.ts            # Zero-dependency IndexedDB persistence
│   │   └── wheel-math.ts     # Landing math, slice degree geometry, easeOutQuart
│   ├── styles/
│   │   └── main.css          # Plain CSS with CSS variables, flat colors, no banned AI styles
│   ├── App.tsx               # Root app with lazy-loaded admin route
│   ├── main.tsx              # Application entrypoint with self-hosted Fredoka & Nunito
│   └── test/
│       ├── wheel-math.test.ts# Vitest tests for wheel landing angles and boundaries
│       └── picker.test.ts    # Vitest tests for weighted outcome math and stock exhaustion
└── README.md
```

---

## 2. Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com).
2. In your Supabase dashboard, navigate to the **SQL Editor**.
3. Copy the full contents of `schema.sql` and run it. This creates:
   - Tables: `settings`, `offers`, `players`, `spins`, `coupons`, `blocked_attempts`, `events`, `rate_limits`
   - Hard database constraints: `unique(player_id, spin_no)`, `unique(player_id, request_id)`, `check(spin_no in (1,2))`, `check(spins_used <= 2)`
   - RLS enabled on all tables with zero public policies
   - The atomic Postgres function `perform_spin(p_player_id, p_request_id, p_rand, p_miss_segment, p_coupon_code)`
4. Copy the full contents of `seed.sql` and run it. This seeds:
   - Default settings (start time `2026-10-31T18:30:00Z` = 1 Nov 2026 00:00 IST, 7-day validity, 60 better luck weight)
   - 4 initial offers (slots 1 to 4, weight 10 each, stock 50 each)
5. Copy your **Project URL** and **Service Role Secret Key** from **Project Settings > API**.

---

## 3. Environment Variables

Create a `.env` file in the project root (or configure in Vercel Project Settings > Environment Variables):

| Variable | Description | Example |
| :--- | :--- | :--- |
| `SUPABASE_URL` | Supabase project API URL | `https://xyzproject.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (bypasses RLS on server only) | `eyJh...service-role-secret` |
| `TOKEN_SECRET` | Secret key for signing Jose device JWTs (min 32 chars) | `32+characters-random-secret-key-for-cravery` |
| `FP_SALT` | Secret salt for SHA-256 fingerprint hashing | `random-salt-for-device-fingerprint-hashes` |
| `ADMIN_PASSWORD` | Single password for accessing `/admin` | `CraveryAnniversary2026!Admin` |
| `TURNSTILE_SECRET` | *(Optional)* Cloudflare Turnstile bot check secret | `0x4AAAAAA...` (leave blank to disable) |

---

## 4. Vercel Deployment

1. Install Vercel CLI or import repository from GitHub:
   ```bash
   npm i -g vercel
   vercel
   ```
2. In the Vercel dashboard:
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. Add the environment variables from Section 3.
4. Deploy:
   ```bash
   vercel --prod
   ```
5. All backend functions (`/api/session`, `/api/spin`, `/api/coupon`, `/api/admin/[action]`) are automatically detected and deployed as serverless functions. Notice that all admin routes live in a single catch-all function, comfortably keeping the project under Vercel Hobby's 12-function limit.

---

## 5. Where to Put `logo.png`

Drop your logo image file directly at:
```
public/logo.png
```
- Recommended size: transparent PNG, ~400px wide.
- If the file is missing or fails to load, the application will automatically fall back to a clean, crisp "Cravery" wordmark in bold pink Fredoka font.

---

## 6. Known Limits

While the multi-layer anti-cheat system securely combines:
1. `httpOnly` signed cookies (1-year life)
2. `localStorage` mirrored JWT tokens
3. `IndexedDB` mirrored JWT tokens
4. Hardware & browser composite fingerprinting (SHA-256 salted)
5. Database row locking (`FOR UPDATE`) and atomic Postgres execution

**A person with a physically different phone can still play once more.**
This is intentional to preserve the zero-friction experience (no OTP, no phone number fields).
This edge case is completely closed at the store counter by:
- The **one-coupon-per-bill** policy.
- The single-use redemption system in `/admin` (each coupon can only be marked as redeemed once; duplicate redemption attempts are rejected with the exact redemption timestamp).

---

## 7. Generating the QR Code for Production

To generate the physical QR code that customers scan at the Cravery store counter:

### Option A: Using the built-in terminal CLI
You can generate a crisp SVG or PNG QR code using `npx qrcode`:
```bash
npx qrcode -o public/qr-cravery.png "https://your-domain.vercel.app" -w 1000 --color.dark="#FF4FA3" --color.light="#FFFFFF"
```

### Option B: Online High-Resolution Vector Generator
1. Visit [qr-code-generator.com](https://www.qr-code-generator.com/) or [qrcode-monkey.com](https://www.qrcode-monkey.com/).
2. Enter your production URL: `https://your-domain.vercel.app`.
3. Choose the Cravery brand colors:
   - Primary: `#FF4FA3` (Pink) or `#2B1B2E` (Ink)
   - Background: `#FFFFFF` (White)
4. Download as high-resolution SVG or PDF for printing onto table stands, tent cards, and counter displays.

---

## 8. Admin Operations & Test Mode

Access the administration dashboard at:
```
https://your-domain.vercel.app/admin
```

- **Login**: Authenticate with `ADMIN_PASSWORD`. Sessions remain valid for 12 hours via an httpOnly signed cookie.
- **Dashboard**: Live counts for total players, total spins, coupons redeemed, blocked attempts, and real-time audit log of recent events.
- **Offers & Live Odds**: Edit titles, descriptions, stock, active status, and weights for all 4 offers and Better Luck. Live percentage odds update in real time.
- **Settings**: Change event start/end datetime (IST), coupon validity duration (in days), and toggle Strict Device Mode.
- **Redeem Coupon**: Enter customer coupon `CRV-XXXX-XXXX` -> view offer details, issuance time, and expiry -> click "Mark as redeemed". Second redemption attempts will display "Already redeemed on [timestamp]".
- **Approve Device**: If a legitimate customer with the same phone model collides and sees the Blocked screen, enter their 6-character reference code here. Once approved, the customer simply refreshes their browser to spin.
- **Test Mode**: Whenever an admin is logged into `/admin` on their browser, visiting the home page (`/`) displays a subtle "Test mode" badge. In test mode, spins are dry runs: dates and limits are ignored, no database records are written, and offer stock is never decremented.
