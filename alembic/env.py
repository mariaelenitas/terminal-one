from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.database import Base, DATABASE_URL
from app.models.address import Address
from app.models.audit_log import AuditLog
from app.models.cart import Cart
from app.models.cart_item import CartItem
from app.models.category import Category
from app.models.coupon import Coupon
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.password_reset_token import PasswordResetToken
from app.models.product import Product
from app.models.review import Review
from app.models.user import User
from app.models.wishlist_item import WishlistItem

config = context.config
config.set_main_option("sqlalchemy.url", DATABASE_URL)
if config.config_file_name is not None:
    fileConfig(config.config_file_name)
target_metadata = Base.metadata


def run_migrations_offline():
    context.configure(url=DATABASE_URL, target_metadata=target_metadata, literal_binds=True, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connectable = engine_from_config(config.get_section(config.config_ini_section), prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
