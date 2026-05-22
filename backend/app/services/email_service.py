"""
Transactional email via Resend.
If RESEND_API_KEY is not configured, sends are skipped with a stdout log.

Existing functions (team invites) use _send() synchronously.
New transactional emails use _fire() which is fire-and-forget (daemon thread).
"""
import threading
import httpx
from app.core.config import settings


def _get_user_email(user_id: str) -> str | None:
    """Fetch primary email for a Clerk user_id via the Clerk REST API."""
    if not settings.CLERK_SECRET_KEY or not user_id:
        return None
    try:
        r = httpx.get(
            f"https://api.clerk.com/v1/users/{user_id}",
            headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
            timeout=8,
        )
        if not r.is_success:
            return None
        data = r.json()
        addrs = data.get("email_addresses") or []
        primary_id = data.get("primary_email_address_id")
        for a in addrs:
            if a.get("id") == primary_id:
                return a.get("email_address") or None
        return addrs[0].get("email_address") if addrs else None
    except Exception as e:
        print(f"[email] clerk email fetch error: {e}")
    return None


def _send(to: str, subject: str, html: str) -> bool:
    if not settings.RESEND_API_KEY:
        print(f"[email] (no RESEND_API_KEY) To: {to} | Subject: {subject}")
        return False
    if not to or "@" not in to:
        return False
    try:
        resp = httpx.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "from": settings.RESEND_FROM_EMAIL,
                "to": [to],
                "subject": subject,
                "html": html,
            },
            timeout=15,
        )
        if resp.is_success:
            print(f"[email] sent '{subject}' → {to}")
            return True
        print(f"[email] Resend error {resp.status_code}: {resp.text[:200]}")
        return False
    except Exception as e:
        print(f"[email] send error: {e}")
        return False


def _fire(to: str, subject: str, html: str) -> None:
    """Fire-and-forget: spawn daemon thread so the caller never blocks."""
    threading.Thread(target=_send, args=(to, subject, html), daemon=True).start()


def send_invite_email(to: str, org_name: str, inviter_name: str, join_url: str, seat_tier: str) -> bool:
    tier_label = "Pro" if seat_tier == "pro" else "Student"
    html = f"""
    <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">
      <div style="font-size:22px;font-weight:600;margin-bottom:8px;">You're invited to join {org_name}</div>
      <p style="color:#6b6b6b;font-size:14px;margin-bottom:24px;">
        {inviter_name} has invited you to join their team on Neurativo with a <strong>{tier_label}</strong> seat.
      </p>
      <a href="{join_url}"
         style="display:inline-block;background:#1a1a1a;color:#fafaf9;font-size:14px;font-weight:500;
                padding:12px 24px;border-radius:10px;text-decoration:none;">
        Accept invitation
      </a>
      <p style="color:#a3a3a3;font-size:12px;margin-top:32px;">
        If you didn't expect this invite, you can ignore this email.
      </p>
    </div>
    """
    return _send(to, f"You're invited to {org_name} on Neurativo", html)


def send_seat_activated_email(to: str, org_name: str) -> bool:
    html = f"""
    <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">
      <div style="font-size:22px;font-weight:600;margin-bottom:8px;">Welcome to {org_name}</div>
      <p style="color:#6b6b6b;font-size:14px;margin-bottom:24px;">
        Your seat is now active. Head to Neurativo and start recording.
      </p>
      <a href="https://neurativo.com/app"
         style="display:inline-block;background:#1a1a1a;color:#fafaf9;font-size:14px;font-weight:500;
                padding:12px 24px;border-radius:10px;text-decoration:none;">
        Open Neurativo
      </a>
    </div>
    """
    return _send(to, f"Your {org_name} seat is active", html)


def send_seat_removed_email(to: str, org_name: str) -> bool:
    html = f"""
    <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">
      <div style="font-size:22px;font-weight:600;margin-bottom:8px;">Seat removed</div>
      <p style="color:#6b6b6b;font-size:14px;">
        Your <strong>{org_name}</strong> team seat on Neurativo has been removed.
        You can still use Neurativo on the free plan.
      </p>
    </div>
    """
    return _send(to, f"Your {org_name} seat has been removed", html)


def send_payment_failed_email(to: str, org_name: str) -> bool:
    html = f"""
    <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">
      <div style="font-size:22px;font-weight:600;margin-bottom:8px;">Payment failed — {org_name}</div>
      <p style="color:#6b6b6b;font-size:14px;margin-bottom:24px;">
        We couldn't process your Neurativo Teams payment. Please update your payment method to keep your team's access.
      </p>
      <a href="https://teams.neurativo.com/{org_name}/dashboard"
         style="display:inline-block;background:#1a1a1a;color:#fafaf9;font-size:14px;font-weight:500;
                padding:12px 24px;border-radius:10px;text-decoration:none;">
        Update billing
      </a>
    </div>
    """
    return _send(to, f"Action required: payment failed for {org_name}", html)


# ═══════════════════════════════════════════════════════════════════════════════
#  Transactional emails — individual billing / lifecycle events
#  All _for_user variants resolve email from Clerk and are fire-and-forget.
# ═══════════════════════════════════════════════════════════════════════════════

def _base_template(header_sub: str, body_html: str) -> str:
    # Logo: nested 2-cell table — N icon (dark square) + Neurativo wordmark
    # All table-based, no divs, no floats — works in Gmail/Outlook/Apple Mail
    logo = """
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="36" height="36" style="width:36px;height:36px;background:#1a1a1a;
              border-radius:8px;text-align:center;vertical-align:middle;
              font-size:18px;font-weight:800;color:#ffffff;
              font-family:Georgia,'Times New Roman',serif;line-height:36px;">
            N
          </td>
          <td style="padding-left:11px;vertical-align:middle;">
            <span style="font-size:18px;font-weight:700;color:#1a1a1a;
                         letter-spacing:-0.5px;line-height:1;
                         font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              Neurativo
            </span>
            <br>
            <span style="font-size:11px;color:#a3a3a3;letter-spacing:0.02em;
                         font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              {header_sub}
            </span>
          </td>
        </tr>
      </table>"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>Neurativo</title>
</head>
<body style="margin:0;padding:0;background:#f5f4f1;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

<!--[if mso]>
<center>
<table width="600" cellpadding="0" cellspacing="0" border="0"><tr><td>
<![endif]-->

<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:#f5f4f1;min-width:100%;">
  <tr>
    <td align="center" style="padding:48px 16px 48px;">

      <!-- Card -->
      <table width="600" cellpadding="0" cellspacing="0" border="0"
             style="max-width:600px;width:100%;background:#ffffff;
                    border:1.5px solid #e8e5e0;border-radius:16px;
                    border-collapse:separate;">

        <!-- Header -->
        <tr>
          <td style="padding:26px 36px 24px;border-bottom:1px solid #f0ede8;
                     background:#ffffff;border-radius:16px 16px 0 0;">
            {logo}
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 36px 28px;background:#ffffff;
                     font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;
                     word-break:break-word;">
            {body_html}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 36px 24px;border-top:1px solid #f0ede8;
                     background:#fafaf9;border-radius:0 0 16px 16px;">
            <p style="margin:0;font-size:11px;color:#b0aba5;line-height:1.7;
                      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              You're receiving this because you have a Neurativo account.
              Questions? Just reply to this email.<br>
              <a href="https://www.neurativo.com" style="color:#b0aba5;text-decoration:underline;">neurativo.com</a>
            </p>
          </td>
        </tr>

      </table>
      <!-- /Card -->

    </td>
  </tr>
</table>

<!--[if mso]>
</td></tr></table>
</center>
<![endif]-->

</body>
</html>"""


def _btn(text: str, url: str, bg: str = "#1a1a1a") -> str:
    # Table-based button — renders correctly in Outlook, Gmail, Apple Mail
    return (
        f'<table cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">'
        f'<tr><td style="background:{bg};border-radius:9px;padding:0;">'
        f'<a href="{url}" style="display:block;padding:13px 26px;color:#ffffff;'
        f'font-size:14px;font-weight:600;text-decoration:none;letter-spacing:-0.1px;'
        f'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;">'
        f'{text} &rarr;</a>'
        f'</td></tr></table>'
    )


def _row(icon: str, label: str, value: str) -> str:
    # Two-cell nested table row — no float, works everywhere
    return (
        f'<tr>'
        f'<td style="padding:0;border-bottom:1px solid #f5f4f1;">'
        f'<table width="100%" cellpadding="0" cellspacing="0" border="0">'
        f'<tr>'
        f'<td style="padding:10px 16px;font-size:13px;color:#6b6b6b;'
        f'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;'
        f'word-break:break-word;">{icon}&nbsp; {label}</td>'
        f'<td align="right" style="padding:10px 16px;font-size:13px;font-weight:600;'
        f'color:#1a1a1a;white-space:nowrap;'
        f'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;">{value}</td>'
        f'</tr>'
        f'</table>'
        f'</td>'
        f'</tr>'
    )


def _info_table(rows_html: str) -> str:
    return (
        f'<table width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="background:#fafaf9;border:1.5px solid #f0ede8;'
        f'border-radius:10px;border-collapse:separate;'
        f'overflow:hidden;margin:20px 0;">'
        f'<tbody>{rows_html}</tbody>'
        f'</table>'
    )


def _h(text: str) -> str:
    return (
        f'<h2 style="margin:0 0 12px;font-size:23px;font-weight:700;color:#1a1a1a;'
        f'letter-spacing:-0.5px;line-height:1.25;word-break:break-word;'
        f'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;">'
        f'{text}</h2>'
    )


def _p(text: str, muted: bool = False) -> str:
    color = "#9ca3af" if muted else "#4a4a4a"
    return (
        f'<p style="margin:0 0 16px;font-size:14px;color:{color};line-height:1.75;'
        f'word-break:break-word;'
        f'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;">'
        f'{text}</p>'
    )


# ── 1. Welcome ─────────────────────────────────────────────────────────────────

def _html_welcome() -> str:
    body = (
        _h("Welcome to Neurativo")
        + _p("Your account is ready. You've been given <strong>5 free credits</strong> to get started — enough to record or import your first lectures.")
        + _info_table(
            _row("🎙️", "Live recording", "Real-time")
            + _row("📂", "Import audio / video", "Upload files")
            + _row("🧠", "AI notes &amp; flashcards", "Auto-generated")
            + _row("❓", "Q&amp;A", "Ask your lecture anything")
        )
        + _p("1 credit = 30 minutes of audio. Credits never expire.", muted=True)
        + _btn("Open Neurativo", "https://www.neurativo.com/app")
    )
    return _base_template("AI Lecture Assistant", body)


def send_welcome_for_user(user_id: str) -> None:
    def _task():
        email = _get_user_email(user_id)
        if email:
            _send(email, "Welcome to Neurativo — you have 5 free credits", _html_welcome())
    threading.Thread(target=_task, daemon=True).start()


# ── 2. Plan upgraded ───────────────────────────────────────────────────────────

_PLAN_LABELS = {"student": "Student", "pro": "Pro"}
_PLAN_FEATURES = {
    "student": [
        ("📚", "Unlimited live recordings (up to 3 hrs each)"),
        ("🧠", "AI summaries, flashcards, quiz &amp; glossary"),
        ("❓", "Unlimited Q&amp;A over your lectures"),
        ("🧪", "Exam prep &amp; concept maps"),
        ("📤", "Shareable lecture links"),
        ("🎙️", "15 credits added to your balance each month"),
    ],
    "pro": [
        ("🚀", "Everything in Student"),
        ("⏱️", "Lectures up to 4 hours"),
        ("👁️", "Visual capture (screen &amp; board)"),
        ("📄", "High-quality PDF export (no watermark)"),
        ("📊", "Advanced analytics"),
        ("🎙️", "30 credits added to your balance each month"),
    ],
}


def _html_plan_upgraded(plan: str) -> str:
    label = _PLAN_LABELS.get(plan, plan.title())
    features = _PLAN_FEATURES.get(plan, [])
    feature_rows = "".join(
        f'<tr><td style="padding:10px 16px;border-bottom:1px solid #f5f4f1;'
        f'font-size:13px;color:#4a4a4a;word-break:break-word;'
        f'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;">'
        f'{icon}&nbsp; {text}</td></tr>'
        for icon, text in features
    )
    body = (
        _h(f"You're now on {label}")
        + _p(f"Your subscription is active. Here's everything included in your <strong>{label}</strong> plan:")
        + _info_table(feature_rows)
        + _p("Your monthly credits have been added to your balance.", muted=True)
        + _btn("Go to your dashboard", "https://www.neurativo.com/app")
        + _p('Manage your subscription from <a href="https://www.neurativo.com/profile" style="color:#9ca3af;">your profile</a>.', muted=True)
    )
    return _base_template(f"{label} Plan — Active", body)


def send_plan_upgraded_for_user(user_id: str, plan: str) -> None:
    def _task():
        email = _get_user_email(user_id)
        if email:
            label = _PLAN_LABELS.get(plan, plan.title())
            _send(email, f"You're now on Neurativo {label} — welcome!", _html_plan_upgraded(plan))
    threading.Thread(target=_task, daemon=True).start()


# ── 3. Plan downgraded ─────────────────────────────────────────────────────────

def _html_plan_downgraded() -> str:
    body = (
        _h("Your subscription has ended")
        + _p("Your Neurativo subscription has been cancelled or expired. Your account is now on the <strong>Free plan</strong>.")
        + _info_table(
            _row("✅", "Your lecture library", "Kept forever")
            + _row("📖", "Read-only access", "Always available")
            + _row("🎙️", "Existing credits", "Still in your account")
            + _row("🔒", "Live recording &amp; imports", "Requires active plan")
        )
        + _p("Resubscribe at any time to restore full access instantly.", muted=True)
        + _btn("Resubscribe", "https://www.neurativo.com/app?upgrade=1")
    )
    return _base_template("Subscription Ended", body)


def send_plan_downgraded_for_user(user_id: str) -> None:
    def _task():
        email = _get_user_email(user_id)
        if email:
            _send(email, "Your Neurativo subscription has ended", _html_plan_downgraded())
    threading.Thread(target=_task, daemon=True).start()


# ── 4. Payment failed ──────────────────────────────────────────────────────────

def _html_subscription_payment_failed() -> str:
    body = (
        _h("Payment failed — action needed")
        + _p("We couldn't process your latest subscription payment. Your account has been temporarily moved to the <strong>Free plan</strong> until payment is resolved.")
        + _info_table(
            _row("⚠️", "Account status", "On hold")
            + _row("📖", "Your lecture library", "Still accessible")
            + _row("🔒", "Recording &amp; imports", "Paused until resolved")
        )
        + _p("Update your payment method to restore your plan instantly.", muted=True)
        + _btn("Update payment method", "https://www.neurativo.com/profile?billing=1", bg="#dc2626")
        + _p("If you believe this is an error, just reply to this email.", muted=True)
    )
    return _base_template("Payment Issue", body)


def send_subscription_payment_failed_for_user(user_id: str) -> None:
    def _task():
        email = _get_user_email(user_id)
        if email:
            _send(email, "Action needed — Neurativo payment failed", _html_subscription_payment_failed())
    threading.Thread(target=_task, daemon=True).start()


# ── 5. Credits purchased ───────────────────────────────────────────────────────

def _html_credits_purchased(pack_label: str, credits: int, price_usd: float) -> str:
    body = (
        _h(f"Payment confirmed — {credits} credits added")
        + _p(f"Your <strong>{pack_label}</strong> purchase was successful. Credits have been added to your account.")
        + _info_table(
            _row("🎙️", "Credits added", f"+{credits}")
            + _row("💳", "Amount charged", f"${price_usd:.2f} USD")
            + _row("📦", "Pack", pack_label)
        )
        + _p("1 credit = 30 minutes of audio. Credits never expire.", muted=True)
        + _btn("Start a new lecture", "https://www.neurativo.com/app")
    )
    return _base_template("Purchase Confirmed", body)


def send_credits_purchased_for_user(user_id: str, pack_label: str, credits: int, price_usd: float) -> None:
    def _task():
        email = _get_user_email(user_id)
        if email:
            _send(email, f"Neurativo — {credits} credits added to your account",
                  _html_credits_purchased(pack_label, credits, price_usd))
    threading.Thread(target=_task, daemon=True).start()


# ── 6. Monthly credits refreshed ──────────────────────────────────────────────

def _html_credits_refreshed(plan: str, credits: int) -> str:
    label = _PLAN_LABELS.get(plan, plan.title())
    body = (
        _h(f"Your {credits} monthly credits are ready")
        + _p(f"Your <strong>{label}</strong> subscription has renewed and your monthly credits have been added to your balance.")
        + _info_table(
            _row("🎙️", "Credits added", f"+{credits}")
            + _row("📋", "Plan", label)
            + _row("📅", "Next refresh", "Next billing cycle")
        )
        + _btn("Open Neurativo", "https://www.neurativo.com/app")
    )
    return _base_template(f"{label} Plan — Renewed", body)


def send_credits_refreshed_for_user(user_id: str, plan: str, credits: int) -> None:
    def _task():
        email = _get_user_email(user_id)
        if email:
            label = _PLAN_LABELS.get(plan, plan.title())
            _send(email, f"Neurativo {label} renewed — {credits} credits added",
                  _html_credits_refreshed(plan, credits))
    threading.Thread(target=_task, daemon=True).start()


# ── 7. Lecture import ready ────────────────────────────────────────────────────

def _html_lecture_ready(title: str, lecture_url: str) -> str:
    display = title or "Your lecture"
    body = (
        _h("Your lecture is ready")
        + _p(f"We've finished processing <strong>{display}</strong>. Your study materials are all ready to go.")
        + _info_table(
            _row("📝", "AI summary", "Ready")
            + _row("🃏", "Flashcards", "Generated")
            + _row("🧪", "Quiz", "Ready")
            + _row("📖", "Glossary", "Generated")
        )
        + _btn("View lecture", lecture_url)
    )
    return _base_template("Lecture Processed", body)


def send_lecture_ready_for_job(lecture_id: str, user_id: str) -> None:
    """Fetch lecture title and user email, then send. Fire-and-forget."""
    def _task():
        email = _get_user_email(user_id)
        if not email:
            return
        title = ""
        try:
            from app.services.supabase_service import _fresh_db
            resp = _fresh_db().table("lectures").select("title").eq("id", lecture_id).limit(1).execute()
            if resp.data:
                title = resp.data[0].get("title") or ""
        except Exception as e:
            print(f"[email] lecture title fetch error: {e}")
        lecture_url = f"https://www.neurativo.com/lecture/{lecture_id}"
        subject = f"Neurativo — \"{title or 'Your lecture'}\" is ready"
        _send(email, subject, _html_lecture_ready(title, lecture_url))
    threading.Thread(target=_task, daemon=True).start()


# ── 8. Low credits warning ─────────────────────────────────────────────────────

def _html_low_credits(balance: int) -> str:
    credit_word = "credit" if balance == 1 else "credits"
    body = (
        _h("You're running low on credits")
        + _p(f"You have <strong>{balance} {credit_word} remaining</strong>. Each credit covers 30 minutes of recording or import.")
        + _info_table(
            _row("🎙️", "Credits left", str(balance))
            + _row("⏱️", "Recording time remaining", f"~{balance * 30} min")
        )
        + _p("Top up now to keep recording without interruption. Packs start at $4.99.", muted=True)
        + _btn("Get more credits", "https://www.neurativo.com/credits")
    )
    return _base_template("Low Credits", body)


def send_low_credits_for_user(user_id: str, balance: int) -> None:
    def _task():
        email = _get_user_email(user_id)
        if email:
            credit_word = "credit" if balance == 1 else "credits"
            _send(email, f"Neurativo — only {balance} {credit_word} left",
                  _html_low_credits(balance))
    threading.Thread(target=_task, daemon=True).start()
