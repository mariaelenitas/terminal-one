
from sqlalchemy import Column, Integer, Float, ForeignKey, String, DateTime
from datetime import datetime

from app.database import Base


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False
    )

    total = Column(
        Float,
        nullable=False
    )

    status = Column(
        String,
        nullable=False,
        default="pending"
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )