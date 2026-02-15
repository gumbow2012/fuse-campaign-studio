

# FUSE — One-Click Creative Engine for Clothing Brands

## Vision
FUSE is a premium SaaS platform where clothing brands upload a product photo and logo, select a template, click RUN, and receive full campaign-ready assets — no workflow complexity exposed.

---

## Phase 1: Homepage & Design System

**Design System**
- Deep navy background with electric blue/cyan gradient accents
- Glassmorphism cards with subtle blur and borders
- No red anywhere — electric blue gradient as primary action color
- Subtle grain texture overlay, soft vignette for depth
- Professional micro-animations: button glow on hover, card lift, slow gradient movement

**Homepage Structure**
- **Nav bar**: Translucent dark glass, FUSE logo (left), nav links center (Features, Templates, Pricing, Enterprise), Login + Get Started pills (right)
- **Hero left**: "Create Full Campaign Content. One Click." headline, subheadline in muted gray, Start Creating + View Templates buttons
- **Hero right**: Clean upload card (Product + Logo drag-and-drop zones + RUN button only — no credits, no runs counter) alongside a single 9:16 example output preview with play button overlay
- **Template carousel**: "Select Your Template" section with horizontal scroll, true-color vertical thumbnails using the uploaded sample images, hover glow + lift effect, no image cropping

---

## Phase 2: Marketing Pages

**Features Page**
- Hero explaining the one-click concept
- "What It Generates" section with visual examples
- Before vs After workflow comparison (complex AI tools vs one RUN button)
- Security and CTA sections

**Templates Page**
- Grid of vertical template previews with filter categories: Street, Studio, Editorial, Product Closeup, Drop Announcement
- Each template shows preview, short description, and select button

**Pricing Page**
- Three clean tiers: Starter, Growth, Scale
- Monthly subscription model — no credit/per-run costs shown publicly
- Included renders per month + add-on pricing
- CTA to get started

---

## Phase 3: Authentication & Backend

**Lovable Cloud Setup**
- User authentication with email/password
- Email verification and password reset flows
- User profiles and secure session management
- Database tables for users, campaigns, templates, and generated assets
- Storage buckets for uploaded products, logos, and generated outputs

**Auth Pages**
- Login page (clean, minimal, matching brand)
- Sign up page
- Password reset flow

---

## Phase 4: Dashboard & Campaign Creation

**Dashboard**
- Left sidebar: Dashboard, Create Campaign, Templates, Assets, Billing, Settings
- Campaign history list showing product thumbnail, date, status, and view assets button
- Loading skeletons while data loads

**Create Campaign Page**
- Expanded version of the homepage upload UI
- Step flow: Upload product → Upload logo → Choose template → Click RUN
- All workflow complexity hidden — user just sees progress and final results
- Results view: 6–12 generated assets (images + vertical video), download all button, regenerate option

---

## Phase 5: Stripe Payments & Billing

**Stripe Integration**
- Subscription billing for Starter/Growth/Scale tiers
- Card storage and management
- Upgrade/downgrade plans
- Billing history with downloadable invoices
- Webhook validation for payment events
- Cancel anytime functionality

**Billing Settings Page**
- Current plan display
- Payment method management
- Invoice history and downloads
- Usage tracking (internal, not exposed as credits)

---

## Phase 6: Polish & Mobile

**Mobile Optimization**
- Stacked layout: hero text → buttons → upload card → example output → templates
- Large tap targets, responsive spacing
- Mobile-friendly sidebar (hamburger menu)

**Performance**
- Lazy loading for template thumbnails
- Optimized video previews
- Loading skeletons throughout
- Smooth gradient animations that don't impact performance

**Final Polish**
- Consistent electric blue theme across all pages
- No image cropping anywhere (contain scaling)
- Premium whitespace and visual hierarchy throughout

