import json
import os
import smtplib
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path


OUTBOX = Path("app/static/outbox")


def send_email(to_email: str, subject: str, body: str):
    smtp_host = os.getenv("SMTP_HOST")
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))

    if smtp_host and smtp_user and smtp_password:
        message = EmailMessage()
        message["From"] = os.getenv("SMTP_FROM", smtp_user)
        message["To"] = to_email
        message["Subject"] = subject
        message.set_content(body)

        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.send_message(message)
        return {"delivery": "smtp"}

    OUTBOX.mkdir(parents=True, exist_ok=True)
    filename = OUTBOX / f"{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}.json"
    filename.write_text(json.dumps({
        "to": to_email,
        "subject": subject,
        "body": body,
        "created_at": datetime.utcnow().isoformat()
    }, indent=2), encoding="utf-8")
    return {"delivery": "local_outbox", "file": str(filename)}
