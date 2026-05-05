"""
Transactional email via Resend.
If RESEND_API_KEY is not configured, invite links are printed to stdout instead
so development works without an email provider.
"""
import httpx
from app.core.config import settings


def _send(to: str, subject: str, html: str) -> bool:
    if not settings.RESEND_API_KEY:
        print(f"[email] (no RESEND_API_KEY) To: {to} | Subject: {subject}")
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
            timeout=10,
        )
        resp.raise_for_status()
        return True
    except Exception as e:
        print(f"[email] send error: {e}")
        return False


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
