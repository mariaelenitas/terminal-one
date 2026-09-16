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

    if not (smtp_host and smtp_user and smtp_password):
        raise RuntimeError("SMTP is not configured")

    message = EmailMessage()
    message["From"] = os.getenv("SMTP_FROM", smtp_user)
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)

    with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.send_message(message)

    return {"delivery": "smtp"}
