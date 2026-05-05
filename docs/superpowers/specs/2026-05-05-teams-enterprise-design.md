# Neurativo Teams — Design Spec
**Date:** 2026-05-05
**Branch:** feat/teams-enterprise
**Status:** Approved

---

## Overview

Add a team/organization plan to Neurativo targeting corporate L&D teams. An org admin purchases a block of seats (student or pro tier per seat), invites members via email, invite link, or email domain allowlist, and manages their team from `teams.neurativo.com/<slug>`. Members get full plan features (student or pro) without paying individually.

---

## 1. Data Model (Supabase)

### `organizations` table
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
slug            text UNIQUE NOT NULL,           -- e.g. "acme-corp"
name            text NOT NULL,
logo_url        text,
owner_id        text NOT NULL,                  -- Clerk user ID
stripe_customer_id      text,
stripe_subscription_id  text,
seat_limit      int NOT NULL DEFAULT 0,         -- total purchased seats (student + pro)
status          text NOT NULL DEFAULT 'active', -- active | past_due | cancelled
allowed_domains text[],                         -- e.g. ["acmecorp.com"]
created_at      timestamptz DEFAULT now()
```

### `org_members` table
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
org_id      uuid REFERENCES organizations(id) ON DELETE CASCADE,
user_id     text,                               -- Clerk user ID (null until accepted)
email       text NOT NULL,
role        text NOT NULL DEFAULT 'member',     -- admin | member
seat_tier   text NOT NULL DEFAULT 'student',    -- student | pro (set per seat by admin)
status      text NOT NULL DEFAULT 'pending',    -- pending | active | removed
invited_at  timestamptz DEFAULT now(),
joined_at   timestamptz
```

### `org_invites` table
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
org_id      uuid REFERENCES organizations(id) ON DELETE CASCADE,
token       text UNIQUE NOT NULL,               -- random 32-char token
email       text,                               -- null = open/shareable link
max_uses    int,                                -- null = unlimited
uses        int NOT NULL DEFAULT 0,
expires_at  timestamptz,
created_by  text NOT NULL,                      -- Clerk user ID
created_at  timestamptz DEFAULT now()
```

### Changes to existing tables
- `user_subscriptions`: add `org_id uuid REFERENCES organizations(id)` (nullable) to track org-granted seats
- When a member activates: upsert `user_subscriptions` with `plan_tier = seat_tier, org_id = org.id`
- When a member is removed: revert `user_subscriptions` to `plan_tier = 'free'`, clear `org_id` (unless user has their own active subscription)

---

## 2. Billing (Stripe)

### Seat pricing

| Seat type     | Monthly       | Annual (billed yearly) |
|---------------|---------------|------------------------|
| Student seat  | $15/seat/mo   | $12/seat/mo            |
| Pro seat      | $22/seat/mo   | $18/seat/mo            |

Volume discount vs individual plans ($19/mo student, $39/mo pro).

### Stripe setup
- One Stripe Subscription per org with two line items: `neurativo_team_student` and `neurativo_team_pro` (metered by quantity)
- Admin manages seat count and payment via Stripe Customer Portal
- Adding seats → immediate proration; removing seats → effective end of billing period
- `seat_limit` = sum of student + pro quantities on the subscription
- Stripe webhooks (`customer.subscription.updated`, `invoice.payment_failed`, `customer.subscription.deleted`) sync `organizations.status` and `seat_limit`

### Enterprise (50+ seats)
- Pricing page shows "Contact us" CTA → email or Tally form
- You manually create the org record via Neurativo admin panel and set up Stripe subscription out-of-band

---

## 3. Join Flows

### A — Email invite
1. Admin enters email addresses in dashboard and assigns seat_tier per email
2. Backend creates `org_invites` rows (email set, token generated) and sends invite emails via existing email provider
3. Email contains link: `teams.neurativo.com/[slug]/join?token=xyz`
4. User clicks → logs in via Clerk → token consumed → `org_members` row activates → `user_subscriptions` updated

### B — Invite link
1. Admin generates a link (optional expiry, optional max-uses) — no email required
2. Link: `teams.neurativo.com/[slug]/join?token=xyz`
3. Anyone with the link claims a seat (up to `seat_limit`)
4. Admin assigns seat_tier when generating the link; can change per member post-join

### C — Email domain allowlist
1. Admin sets `allowed_domains` on the org (e.g. `["acmecorp.com"]`)
2. On every `get_active_user` call, backend checks if the user's Clerk email domain matches any org's `allowed_domains`
3. If match found and user not already a member: auto-create `org_members` row (role=member, seat_tier=student by default) and activate
4. Admin can promote domain-joined members to pro tier from the dashboard

### Seat assignment per invite
- Admin sets `seat_tier` (student|pro) per invite or per member post-join
- Admin can change any member's tier anytime: updates `org_members.seat_tier` and `user_subscriptions.plan_tier`
- Tier changes are instant — no Stripe proration needed on the user side (Stripe subscription quantity stays same; the mix of student/pro seats is tracked in `org_members`)
- Note: if more pro seats are consumed than purchased pro seat quantities, backend raises an error — admin must upgrade their Stripe subscription

---

## 4. Backend — New API Routes

All routes prefixed `/api/v1/teams/`. Org admin routes require `is_org_admin` dependency (checks `org_members.role = 'admin'` or `organizations.owner_id`).

```
POST   /teams/checkout                    Create Stripe Checkout session (new org)
POST   /teams/                            Create org record (called after Stripe success)
GET    /teams/{slug}                      Public: org name, logo (for portal landing page)
GET    /teams/{slug}/dashboard            Admin: full org data + members + seat counts
POST   /teams/{slug}/invites              Admin: create invite (email or open link)
GET    /teams/{slug}/invites              Admin: list active invites
DELETE /teams/{slug}/invites/{invite_id}  Admin: revoke invite
POST   /teams/join                        Redeem token (any authed user)
PATCH  /teams/{slug}/members/{member_id}  Admin: change seat_tier or status (remove)
GET    /teams/{slug}/billing              Admin: Stripe Customer Portal session URL
POST   /webhooks/stripe                   Stripe webhook handler
```

### Auth dependency additions
In `get_active_user`: after Clerk JWT verification, run domain-allowlist check asynchronously — if user's email domain matches an org's `allowed_domains` and user has no active org seat, auto-activate. This is a background fire-and-forget, not blocking.

---

## 5. Frontend — `teams.neurativo.com`

### Subdomain detection

```js
// In App.jsx
const isTeamsDomain = window.location.hostname === 'teams.neurativo.com'
  || window.location.hostname.startsWith('teams.');

if (isTeamsDomain) {
  return <TeamsApp />;  // separate router
}
// else render normal Neurativo app
```

### Vercel config (`vercel.json` addition)
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```
Domain `teams.neurativo.com` is already added in Vercel dashboard. Same build, hostname-switched routing.

### Local dev
Add to hosts file: `127.0.0.1 teams.localhost`
Run Vite on `teams.localhost:5173` to test Teams routes.

### Routes (`<TeamsApp />`)
```
/                          Teams marketing + pricing page (public)
/new                       Create org / Stripe Checkout
/[slug]                    Portal: join CTA for non-members, member status for members
/[slug]/join?token=        Token redemption page
/[slug]/dashboard          Admin dashboard (members, seats, billing)
/[slug]/settings           Admin settings (allowed domains, org name/logo)
```

### Org admin dashboard
- Member list table: email, name, role, seat_tier (student/pro inline dropdown), status, joined date
- Seat usage summary: `12 / 20 seats used · 8 student · 4 pro`
- Invite section: generate link (set expiry, max-uses, default tier), paste emails, list active invites with revoke button
- Email domain allowlist: add/remove domains
- Billing: "Manage billing" button → opens Stripe Customer Portal in new tab
- Danger zone: remove member (reverts them to free)

### Pricing page addition on `neurativo.com`
Add "Teams" card to the existing pricing section with:
- "From $15/seat/month" headline
- Student seats ($15/mo) and Pro seats ($22/mo) breakdown
- Key features: full pro features, org dashboard, invite management, domain allowlist, Stripe billing
- CTA button → `teams.neurativo.com/new`
- Enterprise row below: "50+ seats? Contact us →"

---

## 6. Neurativo Admin Panel Addition

New tab `/admin/teams`:
- Table of all organizations: name, slug, owner email, seat_limit, member count, status, created_at
- Click → org detail: full member list, seat tiers, ability to manually set seat_limit, suspend/reactivate org
- "Create org" button for manually setting up Enterprise deals (bypasses Stripe checkout)

---

## 7. Seat Limit Enforcement

On `POST /teams/join` and domain auto-activate:
- Count `org_members WHERE org_id = X AND status = 'active'`
- If count >= `organizations.seat_limit` → reject with 402 "No seats available"
- Admin sees seat count in dashboard and can purchase more via Stripe Customer Portal

On seat tier change (student → pro):
- Count active pro seats for org
- Compare against pro seat quantity on Stripe subscription
- If over limit → return error "You have X pro seats purchased. Upgrade your plan to assign more."

---

## 8. Email Notifications (minimal)

Sent via existing email provider (or Resend/SendGrid if not yet set up):
- Invite email: org name, inviter name, CTA button → join link
- Welcome email on seat activation: "You've joined [Org Name] on Neurativo"
- Seat removed notification: "Your [Org Name] seat has been removed"
- Payment failed notice to org owner (supplementary to Stripe's own emails)

---

## 9. Out of Scope (this spec)

- SSO / SAML integration (Enterprise add-on, future)
- Per-org data isolation / private workspaces (all members use standard Neurativo app)
- Org-level lecture sharing or shared lecture libraries
- White-labeling / custom branding on the portal beyond org name + logo
- Usage analytics per org member (can add later)
