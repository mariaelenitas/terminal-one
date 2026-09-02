from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    admin_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action = Column(String, nullable=False)
    entity_type = Column(String, nullable=False)
    entity_id = Column(String)
    details = Column(String)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
