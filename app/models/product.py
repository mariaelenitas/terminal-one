from sqlalchemy import Column, Integer, String, Float, ForeignKey

from app.database import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String)
    price = Column(Float, nullable=False)
    stock = Column(Integer, default=0)

    category_id = Column(
        Integer,
        ForeignKey("categories.id"),
        nullable=True
    )