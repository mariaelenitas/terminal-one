from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String

from app.database import Base


class Coupon(Base):
    __tablename__ = "coupons"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, nullable=False, index=True)
    discount_type = Column(String, nullable=False, default="percentage")
    discount_value = Column(Float, nullable=False)
    minimum_order = Column(Float, nullable=False, default=0)
    usage_limit = Column(Integer)
    times_used = Column(Integer, nullable=False, default=0)
    valid_from = Column(DateTime, nullable=False, default=datetime.utcnow)
    valid_until = Column(DateTime)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
