# Salfanet Radius — Design System Guide

> **Goal**: One unified theme across all roles (admin, agent, technician, collector, customer).
> All colors use **semantic CSS variables** that respond to dark/light mode automatically.

---

## 1. Color Token Mapping (Old → New)

### Primary Colors

| Old (Hardcoded)         | New (Semantic Token)                              | Usage                        |
|-------------------------|---------------------------------------------------|------------------------------|
| `#00f7ff`               | `text-brand-500 dark:text-brand-400`              | Primary text / accent text   |
| `text-[#00f7ff]`        | `text-brand-500 dark:text-brand-400`              | Primary text                 |
| `text-[#00bcd4]`        | `text-brand-600 dark:text-brand-300`              | Primary text (darker)        |
| `bg-[#00f7ff]`          | `bg-brand-500`                                    | Primary background           |
| `border-[#00f7ff]`      | `border-brand-500 dark:border-brand-400`          | Primary border               |
| `from-[#00f7ff]`        | `from-brand-500`                                  | Gradient start               |
| `to-[#00f7ff]`          | `to-brand-400`                                    | Gradient end                 |
| `shadow-[0_0_15px_rgba(0,247,255,0.4)]` | `shadow-md shadow-brand-500/20`     | Glow effect                  |

### Accent / Secondary Colors

| Old (Hardcoded)         | New (Semantic Token)                              | Usage                        |
|-------------------------|---------------------------------------------------|------------------------------|
| `#bc13fe`               | `text-accent dark:text-accent`                    | Accent text (violet)         |
| `text-[#bc13fe]`        | `text-violet-600 dark:text-violet-400`            | Accent text                  |
| `bg-[#bc13fe]`          | `bg-violet-500`                                   | Accent background            |
| `border-[#bc13fe]`      | `border-violet-500 dark:border-violet-400`        | Accent border                |
| `from-[#bc13fe]`        | `from-violet-500`                                 | Gradient start               |
| `to-[#bc13fe]`          | `to-violet-400`                                   | Gradient end                 |

### Background Colors

| Old (Hardcoded)         | New (Semantic Token)                              | Usage                        |
|-------------------------|---------------------------------------------------|------------------------------|
| `#0a0520`               | `bg-background`                                   | Page background              |
| `#1a0f35`               | `bg-card`                                         | Card background              |
| `#0f0a1e`               | `bg-muted`                                        | Muted background             |
| `#1e1b2e`               | `bg-card`                                         | Card / modal background      |
| `#0d0a1a`               | `bg-background`                                   | Page background              |
| `#0B141A`               | `bg-background`                                   | Page background              |
| `#1a1135`               | `bg-input`                                        | Input background             |
| `#0a0e1a`               | `bg-background`                                   | Page background              |
| `#1e1e1e`               | `bg-muted`                                        | Muted background             |
| `#1a1525`               | `bg-card`                                         | Card background              |

### Text Colors

| Old (Hardcoded)         | New (Semantic Token)                              | Usage                        |
|-------------------------|---------------------------------------------------|------------------------------|
| `#e0d0ff`               | `text-muted-foreground`                           | Muted text                   |
| `text-white`            | `text-foreground` (in content area)               | Foreground text              |
| `text-white` (sidebar)  | `text-sidebar-foreground`                         | Sidebar text                 |
| `text-gray-500`         | `text-muted-foreground`                           | Muted text                   |
| `text-gray-400`         | `text-muted-foreground`                           | Muted text (dark)            |

### Border Colors

| Old (Hardcoded)         | New (Semantic Token)                              | Usage                        |
|-------------------------|---------------------------------------------------|------------------------------|
| `border-white/10`       | `border-border`                                   | Standard border              |
| `border-white/5`        | `border-border`                                   | Subtle border                |
| `border-[#bc13fe]`      | `border-violet-500 dark:border-violet-400`        | Accent border                |
| `border-[#00f7ff]`      | `border-brand-500 dark:border-brand-400`          | Primary border               |

### Status Colors (already semantic, keep as-is)

| Token                   | Usage                        |
|-------------------------|------------------------------|
| `text-success` / `bg-success`               | Success states  |
| `text-warning` / `bg-warning`               | Warning states  |
| `text-destructive` / `bg-destructive`       | Error states    |
| `text-info` / `bg-info`                     | Info states     |

### Tailwind Named Color Equivalents

When you need specific color shades (charts, badges, stats), use Tailwind's built-in palette mapped to brand:

| Old Cyberpunk           | Tailwind Equivalent                               |
|-------------------------|---------------------------------------------------|
| cyan-400/500            | `brand-400` / `brand-500`                         |
| purple-400/500          | `violet-400` / `violet-500`                       |
| pink-400/500            | `pink-400` / `pink-500` (keep for charts)         |
| emerald-400/500         | `emerald-500` / `emerald-600` (keep for success)  |
| red-400/500             | `red-500` / `red-600` (keep for error)            |
| amber-400/500           | `amber-500` / `amber-600` (keep for warning)      |

---

## 2. Typography

### Font Families (defined in root layout)

| Font      | CSS Variable         | Usage                        |
|-----------|----------------------|------------------------------|
| Geist Sans| `--font-geist-sans`  | Body text (default)          |
| Geist Mono| `--font-geist-mono`  | Code, numbers, mono content  |
| Outfit    | `--font-outfit`      | Headings, display text       |

### Type Scale (TailAdmin tokens in globals.css)

| Token              | Size  | Line Height | Usage              |
|--------------------|-------|-------------|--------------------|
| `text-title-2xl`   | 72px  | 90px        | Hero display       |
| `text-title-xl`    | 60px  | 72px        | Page titles        |
| `text-title-lg`    | 48px  | 60px        | Section titles     |
| `text-title-md`    | 36px  | 44px        | Card titles        |
| `text-title-sm`    | 30px  | 38px        | Subsection titles  |
| `text-theme-xl`    | 20px  | 30px        | Large body         |
| `text-theme-sm`    | 14px  | 20px        | Body (default)     |
| `text-theme-xs`    | 12px  | 18px        | Small text / labels|

### Rules
- **Always** use `text-foreground` for primary text, `text-muted-foreground` for secondary
- **Never** hardcode text colors with hex values
- Use `text-theme-sm` for body, `text-theme-xs` for labels/captions
- Font weights: `font-medium` (500), `font-bold` (700), `font-black` (900)

---

## 3. Component Usage Rules

### Shared Components (all roles)

| Component         | Import Path                    | Usage                        |
|-------------------|--------------------------------|------------------------------|
| `CyberButton`     | `@/components/cyberpunk`       | Buttons (all variants)       |
| `CyberCard`       | `@/components/cyberpunk`       | Cards (customer pages)       |
| `SimpleModal`     | `@/components/cyberpunk`       | Modals/dialogs               |
| `CyberToast`      | `@/components/cyberpunk`       | Toast notifications          |
| `Pagination`      | `@/components/Pagination`      | Table pagination             |
| shadcn/ui         | `@/components/ui/*`            | Admin-specific dialogs/forms |

### Button Variants (CyberButton)

| Variant      | Color              | When to use                  |
|--------------|--------------------|------------------------------|
| `default`    | Blue-600           | Primary action               |
| `cyan`       | Blue-500           | Secondary primary            |
| `magenta`    | Violet-500         | Accent action                |
| `destructive`| Red-600            | Delete / dangerous           |
| `success`    | Emerald-600        | Confirm / approve            |
| `warning`    | Amber-500          | Caution action               |
| `outline`    | Blue border        | Secondary action             |
| `ghost`      | Transparent        | Tertiary action              |

### Card Guidelines

- **Admin**: Use shadcn `Card` from `@/components/ui/card` OR raw `bg-card border border-border rounded-xl`
- **Customer**: Use `CyberCard` (already in use)
- **Technician/Agent/Collector**: Use raw `bg-card border border-border rounded-xl p-4`
- **Never** use hardcoded dark hex backgrounds — always `bg-card` or `bg-background`

---

## 4. Layout Patterns

### Portal Layout (Admin, Agent, Technician, Collector)

```
┌─────────────────────────────────────────┐
│  Sidebar (bg-sidebar)                   │
│  ┌───────────────────────────────────┐  │
│  │  Logo + Company Name              │  │
│  ├───────────────────────────────────┤  │
│  │  Nav Items (menu-item utility)    │  │
│  ├───────────────────────────────────┤  │
│  │  User Info + Theme Toggle         │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  Content Area (bg-background)     │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │  Page Header                │  │  │
│  │  ├─────────────────────────────┤  │  │
│  │  │  Cards / Tables / Forms     │  │  │
│  │  └─────────────────────────────┘  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Customer Layout (Mobile-First)

```
┌─────────────────────────┐
│  Top Bar (bg-card)      │
│  Logo + Notif + Theme   │
├─────────────────────────┤
│                         │
│  Content (bg-background)│
│  CyberCard components   │
│                         │
├─────────────────────────┤
│  Bottom Nav (fixed)     │
│  Home | Bills | WiFi    │
│  Help | Account         │
└─────────────────────────┘
```

### Sidebar Rules
- Background: `bg-sidebar` (dark navy in dark mode, white in light mode)
- Nav items: use `menu-item` utility class from globals.css
- Active item: `menu-item-active` (brand-50 bg in light, brand-500/12 in dark)
- Inactive item: `menu-item-inactive`
- Icons: `menu-item-icon` / `menu-item-icon-active`

### Content Area Rules
- Background: `bg-background`
- Cards: `bg-card border border-border rounded-xl`
- Inputs: `bg-input border border-border rounded-xl text-foreground`
- Tables: `bg-card` with `border-border` row separators

---

## 5. Dark/Light Mode Rules

### How It Works
1. `useTheme()` hook toggles `.dark` class on `<html>`
2. CSS variables in `globals.css` change based on `:root` vs `.dark`
3. Tailwind's `dark:` variant applies dark-specific styles

### Rules
- **Always** use semantic tokens (`bg-card`, `text-foreground`, etc.) — they auto-switch
- **Never** hardcode dark-only colors (`#0a0520`, etc.) — use `bg-background` instead
- For Tailwind color classes, always provide both: `text-brand-600 dark:text-brand-400`
- Gradients: `from-brand-500 to-brand-400` (works in both modes)
- Shadows: Use `shadow-sm`, `shadow-md`, `shadow-lg` — avoid hardcoded rgba shadows

### `data-role` Attribute
- **Agent**: `data-role="agent"` ✅ (already present)
- **Technician**: `data-role="technician"` ✅ (already present)
- **Admin**: needs `data-role="admin"` on layout root
- **Customer**: needs `data-role="customer"` on layout root
- **Collector**: needs `data-role="collector"` on layout root

---

## 6. Spacing & Border Radius

| Token         | Value      | Usage                        |
|---------------|------------|------------------------------|
| `--radius`    | 0.625rem   | Base border radius           |
| `rounded-sm`  | calc(r-4px)| Small elements               |
| `rounded-md`  | calc(r-2px)| Medium elements              |
| `rounded-lg`  | var(--r)   | Cards, inputs                |
| `rounded-xl`  | calc(r+4px)| Large cards, modals          |
| `rounded-2xl` | 1rem       | Stats cards, feature blocks  |
| `rounded-full`| 9999px     | Pills, avatars, dots         |

### Standard Padding
- Page content: `p-4 lg:p-6`
- Card content: `p-4` or `p-5`
- Card with header: `p-5 pb-0` (header) + `p-5` (body)
- Sidebar nav items: `px-3 py-2`
- Button: `px-4 py-2.5` (default), `px-3 py-2` (sm)

---

## 7. Shadows

| Token              | Usage                        |
|--------------------|------------------------------|
| `shadow-theme-xs`  | Subtle elevation             |
| `shadow-theme-sm`  | Cards, inputs                |
| `shadow-theme-md`  | Hovered cards                |
| `shadow-theme-lg`  | Modals, dropdowns            |
| `shadow-theme-xl`  | Overlays, popovers           |
| `shadow-focus-ring`| Focus ring on inputs         |
| `shadow-card`      | Default card shadow          |

**Never** use hardcoded rgba shadows like `shadow-[0_0_20px_rgba(0,255,255,0.1)]`.
Use `shadow-theme-*` tokens or `shadow-md shadow-brand-500/20` for branded glow.

---

## 8. Migration Checklist

### Phase 1: Technician (11 files, ~126 references)
- [ ] `dashboard/page.tsx` — 6 `#00f7ff` + 2 `#bc13fe`
- [ ] `customers/page.tsx` — 2 `#00f7ff` + 12 `#bc13fe`
- [ ] `tickets/page.tsx` — 15 `#00f7ff` + 10 `#bc13fe`
- [ ] `register/page.tsx` — 9 `#00f7ff` + 12 `#bc13fe`
- [ ] `monitor/page.tsx` — 8 `#00f7ff` + 2 `#bc13fe`
- [ ] `genieacs/page.tsx` — 6 `#00f7ff` + 8 `#bc13fe`
- [ ] `profile/page.tsx` — 9 `#00f7ff` + 3 `#bc13fe`
- [ ] `isolated/page.tsx` — 2 `#00f7ff` + 4 `#bc13fe`
- [ ] `offline/page.tsx` — 2 `#00f7ff` + 3 `#bc13fe`
- [ ] `online/page.tsx` — 2 `#00f7ff` + 3 `#bc13fe`
- [ ] `ont-tasks/page.tsx` — 2 `#00f7ff` + 4 `#bc13fe`
- [ ] `TechnicianPortalLayout.tsx` — check for hardcoded colors

### Phase 2: Customer (5 files, ~106 references + CyberCard internal)
- [ ] `topup-request/page.tsx` — 29 `#00f7ff` + 11 `#bc13fe`
- [ ] `topup-direct/page.tsx` — 20 `#00f7ff` + 10 `#bc13fe`
- [ ] `upgrade/page.tsx` — 16 `#00f7ff` + 7 `#bc13fe`
- [ ] `suspend/page.tsx` — 3 `#00f7ff` + 7 `#bc13fe`
- [ ] `history/page.tsx` — 0 `#00f7ff` + 3 `#bc13fe`
- [ ] `CyberCard.tsx` — update internal neon colors to brand tokens
- [ ] Add `data-role="customer"` to `CustomerClientLayout.tsx`

### Phase 3: Admin (60 files, ~669 references)
- [ ] Largest files first: `vpn-client` (95), `vpn-server` (70), `routers` (69)
- [ ] Then: `pppoe/users` (32), `network/customers` (19), `page.tsx` (17)
- [ ] Remaining 54 files (1-16 references each)
- [ ] Add `data-role="admin"` to `AdminClientLayout.tsx`
- [ ] Remove CSS override blocks in globals.css (lines 453-650+) once all hardcoded colors are replaced

### Phase 4: Cleanup
- [ ] Remove all CSS override blocks for light mode in globals.css
- [ ] Remove `data-role` scoped CSS overrides (no longer needed)
- [ ] Verify dark/light mode works correctly on all roles
- [ ] Test all pages visually

---

## 9. Quick Reference: Search & Replace Patterns

### Global find-and-replace (do in order, per file):

```bash
# Primary neon cyan → brand
text-[#00f7ff]          → text-brand-500 dark:text-brand-400
text-[#00bcd4]          → text-brand-600 dark:text-brand-300
bg-[#00f7ff]            → bg-brand-500
border-[#00f7ff]        → border-brand-500 dark:border-brand-400
from-[#00f7ff]          → from-brand-500
to-[#00f7ff]            → to-brand-400
via-[#00f7ff]           → via-brand-400

# Accent neon purple → violet
text-[#bc13fe]          → text-violet-600 dark:text-violet-400
bg-[#bc13fe]            → bg-violet-500
border-[#bc13fe]        → border-violet-500 dark:border-violet-400
from-[#bc13fe]          → from-violet-500
to-[#bc13fe]            → to-violet-400

# Dark backgrounds → semantic
bg-[#0a0520]            → bg-background
bg-[#1a0f35]            → bg-card
bg-[#0f0a1e]            → bg-muted
bg-[#1e1b2e]            → bg-card
bg-[#0d0a1a]            → bg-background
bg-[#0B141A]            → bg-background
bg-[#1a1135]            → bg-input
bg-[#0a0e1a]            → bg-background
bg-[#1e1e1e]            → bg-muted
bg-[#1a1525]            → bg-card

# Muted text
text-[#e0d0ff]          → text-muted-foreground

# Glow shadows → semantic
shadow-[0_0_15px_rgba(0,247,255,0.4)]  → shadow-md shadow-brand-500/20
shadow-[0_0_20px_rgba(0,255,255,0.1)]  → shadow-sm shadow-brand-500/10
shadow-[0_0_30px_rgba(0,255,255,0.2)]  → shadow-md shadow-brand-500/20
```

### Gradient patterns

```bash
# Old: from-[#00f7ff] to-[#bc13fe]
# New:
from-brand-500 to-violet-500

# Old: from-[#bc13fe] to-[#00f7ff]  
# New:
from-violet-500 to-brand-500

# Old: from-[#00f7ff] to-[#00d4e6]
# New:
from-brand-500 to-brand-400
```

---

## 10. Do's and Don'ts

### ✅ Do
- Use `bg-card`, `bg-background`, `bg-input`, `bg-muted` for surfaces
- Use `text-foreground`, `text-muted-foreground` for text
- Use `border-border` for borders
- Use `text-brand-500 dark:text-brand-400` for primary accent
- Use `text-violet-600 dark:text-violet-400` for secondary accent
- Use `menu-item` / `menu-item-active` / `menu-item-inactive` for sidebar nav
- Use `rounded-xl` or `rounded-2xl` for cards
- Use `shadow-theme-*` tokens for elevation
- Provide both light and dark variants: `text-brand-600 dark:text-brand-400`

### ❌ Don't
- Don't use `#00f7ff`, `#bc13fe`, `#00bcd4`, or any hardcoded hex color
- Don't use `bg-[#0a0520]` or similar hardcoded backgrounds
- Don't use `shadow-[0_0_20px_rgba(...)]` hardcoded shadows
- Don't use `text-white` in content area (use `text-foreground`)
- Don't use `border-white/10` (use `border-border`)
- Don't mix CyberCard with shadcn Card in the same page
- Don't add new CSS override blocks in globals.css — fix the source instead
