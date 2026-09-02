from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Float, ForeignKey

from app.database import Base


class Product(Base):

    __tablename__ = "products"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    name = Column(
        String,
        nullable=False
    )

    description = Column(
        String
    )

    price = Column(
        Float,
        nullable=False
    )

    stock = Column(
        Integer,
        default=0
    )

    category_id = Column(
        Integer,
        ForeignKey("categories.id"),
        nullable=True
    )

    image_url = Column(
        String,
        nullable=True
    )

    low_stock_threshold = Column(Integer, nullable=False, default=5)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
