"""commerce expansion, products, bundles and rewards

Revision ID: 20260902_03
Revises: 20260902_02
Create Date: 2026-09-02
"""

from alembic import op
import sqlalchemy as sa

revision = "20260902_03"
down_revision = "20260902_02"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("products", sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))
    op.create_table("bundles",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("name", sa.String(), nullable=False, unique=True),
        sa.Column("description", sa.String(), nullable=False), sa.Column("bundle_price", sa.Float(), nullable=False),
        sa.Column("image_url", sa.String()), sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))
    op.create_table("bundle_items",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("bundle_id", sa.Integer(), sa.ForeignKey("bundles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"), sa.UniqueConstraint("bundle_id", "product_id", name="uq_bundle_product"))
    op.add_column("carts", sa.Column("applied_bundle_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_carts_applied_bundle", "carts", "bundles", ["applied_bundle_id"], ["id"], ondelete="SET NULL")
    op.add_column("orders", sa.Column("delivery_type", sa.String(), nullable=False, server_default="home_delivery"))
    op.add_column("orders", sa.Column("pickup_details", sa.String()))
    op.add_column("orders", sa.Column("bundle_name", sa.String()))
    op.add_column("orders", sa.Column("bundle_discount", sa.Float(), nullable=False, server_default="0"))
    op.create_table("reward_transactions",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("miles", sa.Integer(), nullable=False), sa.Column("reason", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))

    products = [
        (24,'Thermal Travel Bottle','Double-wall insulated travel bottle that keeps drinks hot or cold throughout long journeys.',39.90,40,5,'catalog-24-thermal-travel-bottle.png'),
        (25,'Portable Espresso Maker','Compact manual espresso maker designed for quality coffee anywhere without electrical power.',79.90,24,3,'catalog-25-portable-espresso-maker.png'),
        (26,'Airplane Footrest','Adjustable foldable foot hammock designed to improve leg support and comfort during flights.',24.90,45,5,'catalog-26-airplane-footrest.png'),
        (27,'Travel Compression Socks','Premium graduated compression socks designed to support circulation during long journeys.',18.90,60,5,'catalog-27-travel-compression-socks.png'),
        (28,'TSA Cable Lock Set','Set of three resettable TSA-approved cable locks for luggage and travel bags.',22.90,50,3,'catalog-28-tsa-cable-lock-set.png'),
        (29,'Mini Garment Steamer','Foldable compact garment steamer for refreshing business and occasion wear while travelling.',49.90,28,1,'catalog-29-mini-garment-steamer.png'),
        (30,'E-reader Travel Sleeve','Padded water-resistant sleeve that protects compact e-readers during travel.',29.90,38,4,'catalog-30-e-reader-travel-sleeve.png'),
        (31,'Foldable Travel Duffel','Expandable lightweight duffel that folds compactly for use as an additional travel bag.',59.90,30,2,'catalog-31-foldable-travel-duffel.png'),
        (32,'Waterproof Document Pouch','Sealed waterproof organizer for passports, boarding passes and essential documents.',21.90,55,3,'catalog-32-waterproof-document-pouch.png'),
        (33,'Portable White Noise Machine','Rechargeable pocket-size sound machine for calmer sleep in aircraft and hotels.',44.90,32,5,'catalog-33-portable-white-noise-machine.png'),
        (34,'Travel First Aid Organizer','Structured compact organizer for keeping essential first-aid supplies accessible while travelling.',34.90,35,3,'catalog-34-travel-first-aid-organizer.png'),
        (35,'Insulated Toiletry Case','Water-resistant premium toiletry case with an easy-clean insulated interior.',39.90,34,3,'catalog-35-insulated-toiletry-case.png'),
        (36,'Digital Translation Device','Pocket translation device for fast multilingual travel communication and offline phrases.',119.90,18,1,'catalog-36-digital-translation-device.png'),
        (37,'Compact Travel Umbrella','Wind-resistant automatic umbrella designed to fold into a compact travel sleeve.',32.90,42,3,'catalog-37-compact-travel-umbrella.png'),
        (38,'Premium Luggage Strap','Adjustable high-strength luggage strap with secure metal buckle and original Terminal One pattern.',27.90,48,3,'catalog-38-premium-luggage-strap.png')]
    for row in products:
        op.execute(sa.text("INSERT INTO products (id,name,description,price,stock,category_id,image_url,low_stock_threshold,is_active,created_at) VALUES (:id,:name,:description,:price,:stock,:category_id,:image_url,5,true,NOW()) ON CONFLICT (id) DO NOTHING").bindparams(id=row[0],name=row[1],description=row[2],price=row[3],stock=row[4],category_id=row[5],image_url=f"/static/uploads/products/{row[6]}"))
    op.execute("SELECT setval(pg_get_serial_sequence('products','id'), GREATEST((SELECT MAX(id) FROM products), 1))")

    bundles = [
        (1,'LONG-HAUL COMFORT KIT','Essential comfort for extended flights.',99.90,'bundle-1-long-haul-comfort.png'),
        (2,'BUSINESS TRAVELER KIT','A focused setup for productive journeys.',159.90,'bundle-2-business-traveler.png'),
        (3,'SMART TRAVEL KIT','Connected essentials for confident travel.',109.90,'bundle-3-smart-travel.png'),
        (4,'WEEKEND ESCAPE KIT','Compact organization for a short break.',99.90,'bundle-4-weekend-escape.png'),
        (5,'SECURE JOURNEY KIT','Practical protection for luggage and documents.',69.90,'bundle-5-secure-journey.png')]
    for bundle in bundles:
        op.execute(sa.text("INSERT INTO bundles (id,name,description,bundle_price,image_url,is_active,created_at) VALUES (:id,:name,:description,:price,:image,true,NOW()) ON CONFLICT (id) DO NOTHING").bindparams(id=bundle[0],name=bundle[1],description=bundle[2],price=bundle[3],image=f"/static/uploads/products/{bundle[4]}"))
    for bundle_id, product_id in [(1,5),(1,18),(1,19),(1,26),(2,15),(2,16),(2,30),(3,3),(3,9),(3,22),(4,11),(4,31),(4,35),(5,1),(5,28),(5,32)]:
        op.execute(sa.text("INSERT INTO bundle_items (bundle_id,product_id,quantity) VALUES (:b,:p,1) ON CONFLICT DO NOTHING").bindparams(b=bundle_id,p=product_id))


def downgrade():
    op.drop_table("reward_transactions")
    for column in ["bundle_discount", "bundle_name", "pickup_details", "delivery_type"]: op.drop_column("orders", column)
    op.drop_constraint("fk_carts_applied_bundle", "carts", type_="foreignkey")
    op.drop_column("carts", "applied_bundle_id")
    op.drop_table("bundle_items")
    op.drop_table("bundles")
    op.drop_column("products", "created_at")
