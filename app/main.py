from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.database import engine, Base

from app.models.product import Product
from app.models.category import Category
from app.models.user import User
from app.models.cart import Cart
from app.models.cart_item import CartItem
from app.models.order import Order
from app.models.order_item import OrderItem

from app.routers.products import router as products_router
from app.routers import categories
from app.routers import users
from app.routers import cart
from app.routers import orders


Base.metadata.create_all(bind=engine)


app = FastAPI(
    title="Terminal One",
    description="Your journey starts here.",
    version="1.0.0"
)


app.mount(
    "/static",
    StaticFiles(directory="app/static"),
    name="static"
)


app.include_router(products_router)
app.include_router(categories.router)
app.include_router(users.router)
app.include_router(cart.router)
app.include_router(orders.router)


@app.get("/")
def home():
    return FileResponse(
        "app/templates/index.html"
    )