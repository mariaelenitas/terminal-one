from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String
from app.database import Base


class Bundle(Base):
    __tablename__ = "bundles"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    description = Column(String, nullable=False)
    bundle_price = Column(Float, nullable=False)
    image_url = Column(String)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
