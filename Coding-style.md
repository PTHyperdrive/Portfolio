# Coding Style Guide — NRSP Cloud (Notrespond.com)

## Anti-Slop Directive (Taste Gate)

### Banned Language Patterns
AI-generated responses and commit messages for this project must **never** use the following overused filler phrases. If any of these appear, the output is rejected:

| Banned Pattern | Why |
|---|---|
| "Let's dive in" / "Let's dive deeper" | Filler, adds nothing |
| "It's worth noting that" | Stalling — just state the fact |
| "In today's digital landscape" | Corporate padding |
| "Robust" / "Robust solution" | Vague, overused |
| "Seamless" / "Seamlessly" | Almost never true |
| "Leverage" (as a verb) | Use "use" |
| "Utilize" | Use "use" |
| "Harness the power of" | Marketing fluff |
| "Game-changer" / "Revolutionary" | Hyperbole |
| "Cutting-edge" / "State-of-the-art" | Empty superlatives |
| "Elevate" / "Elevate your experience" | SaaS landing page energy |
| "Unlock" / "Unlock the potential" | Same as above |
| "Streamline" | Vague, say what it actually does |
| "Empower" / "Empowering" | Corporate-speak |
| "Delve into" | Academic filler |
| "Tapestry" / "Landscape" / "Realm" | Forced metaphors |
| "Moreover" / "Furthermore" (overused) | Just use "also" or restructure |
| "It's important to note" | If it's important, just say it |
| "In conclusion" | The reader can see it's the end |

### Preferred Voice
- **Direct.** Say what it does. Skip the preamble.
- **Technical.** Use precise terms. "Proxmox API endpoint" not "the management interface".
- **Terse commit messages.** `fix: resolve VLAN 50 queue race` not `fix: streamline the robust network queueing pipeline for enhanced throughput`.
- **No hedging.** Don't say "you might want to consider" — say "do this" or "this is optional because X".

---

## Visual Identity

### Theme System
The project supports three themes managed via `data-theme` on `<html>`:
| Theme Key      | Background     | Font Family | Description             |
|----------------|----------------|-------------|-------------------------|
| *(default)*    | `#0a0a0f`      | Inter       | Materialist dark — neon accents, glassmorphism |
| `mono-dark`    | **`#000000`**  | Roboto      | OLED pure black, GCP-inspired flat UI          |
| `mono-light`   | `#ffffff`      | Roboto      | Google Cloud light, Material elevation         |

### OLED Pure Black (`#000000`)
The `mono-dark` theme MUST use `#000000` as `--bg-primary`. This is non-negotiable for OLED power savings and visual consistency with Google Cloud Platform aesthetics.

### No Unicode Emojis
**All iconography uses vector icons only** (Lucide React). Unicode emojis (e.g. 🔥, ✅, ⚡) are **strictly prohibited** in UI code. Use `<Icon />` components from `lucide-react` instead.

---

## Aesthetic Framework

### Design Influences
The site draws from **three sources** — combine them, don't pick one:

| Source | What to Take | Reference |
|---|---|---|
| **Google Cloud Platform** | Dense data tables, flat cards, `Roboto` typography, muted accent palette, clean Material elevation | `mono-dark` / `mono-light` themes |
| **CMC Cloud (cmccloud.vn)** | Service catalog layout, documentation structure, VPC/ECS/RDS terminology mapping, Vietnamese cloud UX conventions | Internship reference — use their doc structure for your Elastic Compute / VPS pages |
| **Vercel / Linear** | Micro-interactions, smooth page transitions, command palette UX, monochrome-first with sparse color accents | Default dark theme polish |

### Micro-Interaction Standards
Every interactive element must have feedback. Dead clicks kill perceived quality.

| Element | Required Interaction |
|---|---|
| **Buttons** | `transform: translateY(-1px)` on hover, `scale(0.98)` on active |
| **Cards** | Subtle border-color shift + `box-shadow` elevation on hover |
| **Navigation links** | Underline slide-in or opacity transition, never instant color swap |
| **Modals / Drawers** | `fadeIn` + `translateY` entrance, `fadeOut` exit — never instant appear/disappear |
| **Loading states** | Skeleton shimmer (`.animate-shimmer`), never a bare spinner |
| **Toast / Notifications** | Slide in from edge, auto-dismiss with progress bar |
| **Data tables** | Row highlight on hover, column sort with icon rotation |

### Animation Budget
- **Page transitions:** `300ms` max — user should never wait for an animation.
- **Hover effects:** `150ms` — must feel instant.
- **Skeleton loaders:** Use `shimmer` keyframe, `1.5s` cycle.
- **No animation on first paint.** Critical content renders immediately; decorative animations start after `DOMContentLoaded`.

### Typography Scale
| Role | Size | Weight | Font |
|---|---|---|---|
| Page title (h1) | `1.75rem` | 700 | Theme font |
| Section header (h2) | `1.25rem` | 600 | Theme font |
| Card title (h3) | `1rem` | 600 | Theme font |
| Body text | `0.875rem` | 400 | Theme font |
| Caption / muted | `0.75rem` | 400 | Theme font |
| Code / mono | `0.8rem` | 400 | JetBrains Mono |

### Color Discipline
- **Default theme (Materialist Dark):** Maximum 3 accent colors per page. `--accent-cyan` is primary, `--accent-purple` is secondary. `--accent-magenta` is reserved for destructive actions only.
- **Mono themes:** Single accent color (`--accent-primary`). Everything else is grayscale. No gradients, no glows.
- **Never use raw hex in components.** Always reference CSS variables (`var(--accent-cyan)`).

---

## Component Conventions

### Styling
- Theme tokens are consumed via `useThemeTokens()` hook in client components.
- CSS variables from `globals.css` for shared class-based styles (`.glass-card`, `.btn`, `.input-field`).
- Inline `style` objects for component-specific layout.
- No Tailwind utility classes in component JSX (Tailwind is imported only for resets).

### Auth Routing
- Post-login redirect: **always `/dashboard`** (Console Hub).
- Authenticated users visiting `/`: middleware redirects to `/dashboard`.
- Unauthenticated users hitting protected routes (`/dashboard/*`, `/admin/*`, `/console-window/*`): middleware redirects to `/auth/login?callbackUrl=<path>`.
- Login page respects `callbackUrl` search param, defaults to `/dashboard`.

### Context-Aware Layouts
The application uses **context-aware sidebar navigation**:

| Route | Layout | Sidebar |
|-------|--------|---------|
| `/dashboard` | Full-width, no sidebar | None (Console Hub — GCP Welcome) |
| `/dashboard/*` | Dashboard layout | Cloud infrastructure sidebar (no MMO) |
| `/dashboard/settings` | Dashboard layout | Cloud sidebar — **context-aware settings** (fused) |
| `/account-settings` | Standalone layout | None — **context-aware settings** (standalone) |
| `/mmo/*` | MMO layout | MMO filter sidebar (categories, price, sort) |
| `/adminsystemnrsp/*` | Admin layout | Admin-specific sidebar |

- **Console Hub** (`/dashboard`): Full-width GCP-style service launcher with service cards, stats, and quick actions.
- **Cloud Sidebar**: Shown for all `/dashboard/*` sub-routes. Does NOT contain MMO Market links.
- **MMO Sidebar**: Completely isolated layout at `/mmo` with its own filter sidebar.
- **Account Settings (Context-Aware)**: Both `/dashboard/settings` and `/account-settings` render the shared `AccountSettingsView` component. Sidebar navigation routes to `/dashboard/settings` (sidebar stays). Console Hub dropdown routes to `/account-settings` (standalone).
- The Sidebar brand logo links back to `/dashboard` (Console Hub).

### File Naming
- Pages: `page.tsx` (Next.js App Router convention)
- Components: PascalCase (`Navbar.tsx`, `ThemeToggle.tsx`)
- Utilities / libs: camelCase (`useThemeTokens.ts`, `security.ts`)

---

## CMC Cloud Reference Integration

### Service Terminology Mapping
When building cloud service pages, align naming with CMC Cloud conventions where applicable:

| NRSP Cloud Feature | CMC Cloud Equivalent | Notes |
|---|---|---|
| VPS / Virtual Machines | Elastic Compute (ECS) | Same provisioning concept — use Cloud-Init templates |
| Block Storage | Elastic Volume | Attached to VMs |
| Snapshots | Cloud Backup | Point-in-time recovery |
| VPN / WireGuard | VPC + Security Group | Network isolation model |
| Load Balancer | Elastic Load Balancer | Future feature |
| MariaDB (managed) | RDS | Database-as-a-service pattern |
| Container Registry | Container Registry | If K8s features are added |
| Monitoring | Cloud Monitoring | Integrate with Wazuh SIEM (VLAN 30) |
| Audit Logs | Cloud Trace Service | User activity tracking |
| Billing | Cloud Billing | Usage-based metering |

### Documentation Page Structure
Follow CMC Cloud's doc layout for service pages:
1. **Overview** — what the service does, one paragraph
2. **Getting Started** — minimal steps to deploy
3. **Configuration** — all options with defaults
4. **API Reference** — endpoint table with curl examples
5. **FAQ** — common issues with direct answers

---

## Code Quality
- TypeScript strict mode.
- Explicit return types on exported functions where non-trivial.
- Avoid `any`; use `Record<string, unknown>` or proper interfaces.
- All interactive elements must have unique IDs for testing.

## Execution Constraints
- This codebase runs on a remote Proxmox server. Do NOT execute commands locally.
- Provide exact, copy-pasteable shell commands instead.

## Project Tracking
- Every completed task must generate a `Checkpoint-xxx.md` file.
- Include git summary and description in each checkpoint.
