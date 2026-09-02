
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

    subtotal = Column(Float, nullable=False, default=0)
    discount_total = Column(Float, nullable=False, default=0)
    coupon_code = Column(String)
    shipping_address = Column(String)
    payment_method = Column(String, nullable=False, default="demo_card")
    payment_status = Column(String, nullable=False, default="paid")
    tracking_code = Column(String)
    cancelled_at = Column(DateTime)
    delivery_type = Column(String, nullable=False, default="home_delivery")
    pickup_details = Column(String)
    bundle_name = Column(String)
    bundle_discount = Column(Float, nullable=False, default=0)

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
