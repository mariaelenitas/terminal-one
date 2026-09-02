"""stage one corrections

Revision ID: 20260902_02
Revises: 20260902_01
Create Date: 2026-09-02
"""

from alembic import op
import sqlalchemy as sa


revision = "20260902_02"
down_revision = "20260902_01"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("reviews", sa.Column("order_item_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_reviews_order_item_id", "reviews", "order_items",
        ["order_item_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_reviews_order_item_id", "reviews", ["order_item_id"])
    op.execute(
        """
        UPDATE products
        SET price = 69.90,
            description = 'Premium RFID-blocking passport holder with a rechargeable Bluetooth tracker, separation alerts and compatibility with Apple Find My or Google Find Hub.'
        WHERE id = 13 AND name = 'Smart Passport Holder'
        """
    )


def downgrade():
    op.drop_index("ix_reviews_order_item_id", table_name="reviews")
    op.drop_constraint("fk_reviews_order_item_id", "reviews", type_="foreignkey")
    op.drop_column("reviews", "order_item_id")
