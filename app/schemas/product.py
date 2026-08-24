from pydantic import BaseModel


class ProductCreate(BaseModel):
    name: str
    description: str
    price: float
    stock: int
    category_id: int


class ProductResponse(BaseModel):
    id: int
    name: str
    description: str
    price: float
    stock: int