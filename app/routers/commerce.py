from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.bundle import Bundle
from app.models.bundle_item import BundleItem
from app.models.cart import Cart
from app.models.cart_item import CartItem
from app.models.category import Category
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.product import Product
from app.models.review import Review
from app.models.reward_transaction import RewardTransaction
from app.models.user import User
from app.security import verify_token


router = APIRouter(tags=["Commerce Experience"])


class JourneyRequest(BaseModel):
    trip_type: str = "leisure"
    flight: str = "long_haul"
    climate: str = "mild"
    duration: str = "one_week"
    query: str = ""


def serialize_product(product, reason=None, badge=None):
    return {"id": product.id, "name": product.name, "description": product.description,
            "price": product.price, "stock": product.stock, "category_id": product.category_id,
            "image_url": product.image_url, "reason": reason, "badge": badge}


def require_admin(user_id, db):
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@router.get("/catalog/insights")
def catalog_insights(db: Session = Depends(get_db)):
    sales = dict(db.query(OrderItem.product_id, func.coalesce(func.sum(OrderItem.quantity), 0))
                 .join(Order, Order.id == OrderItem.order_id)
                 .filter(Order.status != "cancelled").group_by(OrderItem.product_id).all())
    ratings = dict(db.query(Review.product_id, func.avg(Review.rating)).group_by(Review.product_id).all())
    products = db.query(Product).filter(Product.is_active.is_(True)).all()
    ranked = sorted(products, key=lambda p: (sales.get(p.id, 0), ratings.get(p.id, 0)), reverse=True)
    result = []
    for product in ranked:
        badge = None
        if product.stock <= 0: badge = "OUT OF STOCK"
        elif product.stock <= product.low_stock_threshold: badge = "LOW STOCK"
        elif sales.get(product.id, 0) >= 3: badge = "BEST SELLER"
        elif product.id >= 24: badge = "NEW"
        result.append({**serialize_product(product, badge=badge), "units_sold": sales.get(product.id, 0),
                       "average_rating": round(float(ratings.get(product.id, 0)), 1)})
    return {"products": result, "trending": result[:8]}


@router.get("/products/{product_id}/frequently-bought")
def frequently_bought(product_id: int, db: Session = Depends(get_db)):
    order_ids = [row[0] for row in db.query(OrderItem.order_id).filter(OrderItem.product_id == product_id).all()]
    pairs = db.query(OrderItem.product_id, func.sum(OrderItem.quantity).label("qty")).filter(
        OrderItem.order_id.in_(order_ids), OrderItem.product_id != product_id
    ).group_by(OrderItem.product_id).order_by(func.sum(OrderItem.quantity).desc()).limit(3).all() if order_ids else []
    ids = [row[0] for row in pairs]
    if len(ids) < 3:
        ids += [p.id for p in db.query(Product).filter(Product.id != product_id, Product.stock > 0).order_by(Product.id).limit(6).all() if p.id not in ids][:3-len(ids)]
    return [serialize_product(db.query(Product).filter(Product.id == item_id).first()) for item_id in ids]


@router.get("/bundles")
def list_bundles(db: Session = Depends(get_db)):
    output = []
    for bundle in db.query(Bundle).filter(Bundle.is_active.is_(True)).all():
        rows = db.query(BundleItem, Product).join(Product, Product.id == BundleItem.product_id).filter(BundleItem.bundle_id == bundle.id).all()
        original = round(sum(product.price * item.quantity for item, product in rows), 2)
        available = all(product.stock >= item.quantity for item, product in rows)
        output.append({"id": bundle.id, "name": bundle.name, "description": bundle.description,
                       "image_url": bundle.image_url, "bundle_price": bundle.bundle_price,
                       "original_price": original, "you_save": round(original - bundle.bundle_price, 2),
                       "available": available, "products": [{**serialize_product(p), "quantity": i.quantity} for i, p in rows]})
    return output


@router.post("/bundles/{bundle_id}/add-to-cart")
def add_bundle(bundle_id: int, db: Session = Depends(get_db), user_id: str = Depends(verify_token)):
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id, Bundle.is_active.is_(True)).first()
    if not bundle: raise HTTPException(status_code=404, detail="Bundle not found")
    rows = db.query(BundleItem, Product).join(Product, Product.id == BundleItem.product_id).filter(BundleItem.bundle_id == bundle.id).all()
    if not rows or any(product.stock < item.quantity for item, product in rows):
        raise HTTPException(status_code=400, detail="One or more bundle products are out of stock")
    cart = db.query(Cart).filter(Cart.user_id == int(user_id)).first()
    if not cart: cart = Cart(user_id=int(user_id)); db.add(cart); db.flush()
    for bundle_item, product in rows:
        item = db.query(CartItem).filter(CartItem.cart_id == cart.id, CartItem.product_id == product.id).first()
        wanted = bundle_item.quantity + (item.quantity if item else 0)
        if wanted > product.stock: raise HTTPException(status_code=400, detail=f"Only {product.stock} units available for {product.name}")
        if item: item.quantity = wanted
        else: db.add(CartItem(cart_id=cart.id, product_id=product.id, quantity=bundle_item.quantity))
    cart.applied_bundle_id = bundle.id
    db.commit()
    return {"message": "Travel Kit added to cart", "bundle": bundle.name}


@router.post("/journey/recommendations")
def journey_recommendations(data: JourneyRequest, db: Session = Depends(get_db)):
    text = " ".join([data.trip_type, data.flight, data.climate, data.duration, data.query]).lower()
    terms = []
    if any(x in text for x in ["long", "10-hour", "sleep", "comfort"]): terms += ["pillow", "mask", "blanket", "footrest", "noise"]
    if any(x in text for x in ["business", "work"]): terms += ["laptop", "hub", "adapter", "charger"]
    if any(x in text for x in ["cold", "iceland"]): terms += ["thermal", "socks", "blanket"]
    if any(x in text for x in ["weekend", "3-day"]): terms += ["duffel", "packing", "toiletry"]
    if not terms: terms = ["adapter", "tracker", "packing", "charger"]
    products = db.query(Product).filter(Product.is_active.is_(True), Product.stock > 0).all()
    scored = []
    for p in products:
        haystack = f"{p.name} {p.description}".lower()
        score = sum(1 for term in terms if term in haystack)
        if score: scored.append((score, p))
    scored.sort(key=lambda row: (-row[0], row[1].price))
    return [serialize_product(p, reason="Recommended for your journey profile") for _, p in scored[:6]]


@router.get("/rewards/me")
def rewards(db: Session = Depends(get_db), user_id: str = Depends(verify_token)):
    miles = int(db.query(func.coalesce(func.sum(RewardTransaction.miles), 0)).filter(RewardTransaction.user_id == int(user_id)).scalar() or 0)
    tier = "FIRST CLASS" if miles >= 1500 else "VOYAGER" if miles >= 500 else "EXPLORER"
    next_at = 1500 if miles < 1500 and miles >= 500 else 500 if miles < 500 else miles
    return {"miles": miles, "tier": tier, "next_tier_at": next_at, "miles_to_next_tier": max(0, next_at - miles)}


@router.get("/admin/analytics")
def analytics(db: Session = Depends(get_db), user_id: str = Depends(verify_token)):
    require_admin(user_id, db)
    orders = db.query(Order).filter(Order.status != "cancelled").all()
    revenue = sum(o.total for o in orders)
    by_status = dict(db.query(Order.status, func.count(Order.id)).group_by(Order.status).all())
    monthly = defaultdict(float)
    for order in orders: monthly[order.created_at.strftime("%Y-%m")] += order.total
    return {"average_order_value": round(revenue / len(orders), 2) if orders else 0,
            "orders_by_status": by_status, "revenue_over_time": [{"month": k, "revenue": round(v, 2)} for k, v in sorted(monthly.items())]}
