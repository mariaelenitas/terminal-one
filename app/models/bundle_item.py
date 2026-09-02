from sqlalchemy import Column, ForeignKey, Integer, UniqueConstraint
from app.database import Base


class BundleItem(Base):
    __tablename__ = "bundle_items"
    __table_args__ = (UniqueConstraint("bundle_id", "product_id", name="uq_bundle_product"),)
    id = Column(Integer, primary_key=True, index=True)
    bundle_id = Column(Integer, ForeignKey("bundles.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    quantity = Column(Integer, nullable=False, default=1)
