from pydantic import BaseModel


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    phone: str
    country: str
    address: str


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    phone: str
    country: str
    address: str
    is_admin: bool