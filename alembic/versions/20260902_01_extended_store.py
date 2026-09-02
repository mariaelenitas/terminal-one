"""extended Terminal One store features

Revision ID: 20260902_01
Revises:
Create Date: 2026-09-02
"""

from alembic import op
import sqlalchemy as sa

revision = "20260902_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("products", sa.Column("low_stock_threshold", sa.Integer(), nullable=False, server_default="5"))
    op.add_column("products", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("orders", sa.Column("subtotal", sa.Float(), nullable=False, server_default="0"))
    op.add_column("orders", sa.Column("discount_total", sa.Float(), nullable=False, server_default="0"))
    op.add_column("orders", sa.Column("coupon_code", sa.String(), nullable=True))
    op.add_column("orders", sa.Column("shipping_address", sa.String(), nullable=True))
    op.add_column("orders", sa.Column("payment_method", sa.String(), nullable=False, server_default="demo_card"))
    op.add_column("orders", sa.Column("payment_status", sa.String(), nullable=False, server_default="paid"))
    op.add_column("orders", sa.Column("tracking_code", sa.String(), nullable=True))
    op.add_column("orders", sa.Column("cancelled_at", sa.DateTime(), nullable=True))
    op.execute("UPDATE orders SET subtotal = total WHERE subtotal = 0")

    op.create_table("addresses",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(), nullable=False), sa.Column("recipient_name", sa.String(), nullable=False), sa.Column("phone", sa.String()),
        sa.Column("address_line", sa.String(), nullable=False), sa.Column("city", sa.String(), nullable=False), sa.Column("postal_code", sa.String(), nullable=False),
        sa.Column("country", sa.String(), nullable=False), sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))
    op.create_table("wishlist_items",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()), sa.UniqueConstraint("user_id", "product_id", name="uq_wishlist_user_product"))
    op.create_table("coupons",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("code", sa.String(), nullable=False, unique=True),
        sa.Column("discount_type", sa.String(), nullable=False), sa.Column("discount_value", sa.Float(), nullable=False),
        sa.Column("minimum_order", sa.Float(), nullable=False, server_default="0"), sa.Column("usage_limit", sa.Integer()),
        sa.Column("times_used", sa.Integer(), nullable=False, server_default="0"), sa.Column("valid_from", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("valid_until", sa.DateTime()), sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))
    op.create_table("reviews",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False), sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("comment", sa.String()), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()), sa.UniqueConstraint("user_id", "product_id", name="uq_review_user_product"))
    op.create_table("password_reset_tokens",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False, unique=True), sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False, server_default=sa.false()), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))
    op.create_table("audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("admin_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("action", sa.String(), nullable=False), sa.Column("entity_type", sa.String(), nullable=False), sa.Column("entity_id", sa.String()),
        sa.Column("details", sa.String()), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))


def downgrade():
    for table in ["audit_logs", "password_reset_tokens", "reviews", "coupons", "wishlist_items", "addresses"]:
        op.drop_table(table)
    for column in ["cancelled_at", "tracking_code", "payment_status", "payment_method", "shipping_address", "coupon_code", "discount_total", "subtotal"]:
        op.drop_column("orders", column)
    op.drop_column("products", "is_active")
    op.drop_column("products", "low_stock_threshold")
