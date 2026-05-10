# Coding Style Guide — NRSP Cloud (Notrespond.com)

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
| `/mmo/*` | MMO layout | MMO filter sidebar (categories, price, sort) |
| `/adminsystemnrsp/*` | Admin layout | Admin-specific sidebar |

- **Console Hub** (`/dashboard`): Full-width GCP-style service launcher with service cards, stats, and quick actions.
- **Cloud Sidebar**: Shown for all `/dashboard/*` sub-routes. Does NOT contain MMO Market links.
- **MMO Sidebar**: Completely isolated layout at `/mmo` with its own filter sidebar.
- The Sidebar brand logo links back to `/dashboard` (Console Hub).

### File Naming
- Pages: `page.tsx` (Next.js App Router convention)
- Components: PascalCase (`Navbar.tsx`, `ThemeToggle.tsx`)
- Utilities / libs: camelCase (`useThemeTokens.ts`, `security.ts`)

## Code Quality
- TypeScript strict mode.
- Explicit return types on exported functions where non-trivial.
- Avoid `any`; use `Record<string, unknown>` or proper interfaces.
- All interactive elements must have unique IDs for testing.
