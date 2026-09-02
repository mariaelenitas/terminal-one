from sqlalchemy import Column, Integer, ForeignKey

from app.database import Base


class Cart(Base):
    __tablename__ = "carts"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False
    )
    applied_bundle_id = Column(Integer, ForeignKey("bundles.id", ondelete="SET NULL"), nullable=True)
