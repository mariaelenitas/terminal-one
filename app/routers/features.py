import csv
import hashlib
import io
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.address import Address
from app.models.audit_log import AuditLog
from app.models.coupon import Coupon
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.password_reset_token import PasswordResetToken
from app.models.product import Product
from app.models.review import Review
from app.models.user import User
from app.models.wishlist_item import WishlistItem
from app.security import hash_password, verify_token
from app.services.audit import add_audit_log
from app.services.email_service import send_email


router = APIRouter(tags=["Extended Features"])


class ProfileUpdate(BaseModel):
    name: str
    phone: Optional[str] = None
    country: Optional[str] = None
    address: Optional[str] = None


class AddressData(BaseModel):
    label: str = "Home"
    recipient_name: str
    phone: Optional[str] = None
    address_line: str
    city: str
    postal_code: str
    country: str
    is_default: bool = False


class ProductReference(BaseModel):
    product_id: int


class CouponData(BaseModel):
    code: str
    discount_type: str
    discount_value: float
    minimum_order: float = 0
    usage_limit: Optional[int] = None
    valid_until: Optional[datetime] = None
    is_active: bool = True


class CouponValidation(BaseModel):
    code: str
    subtotal: float


class ReviewData(BaseModel):
    rating: int
    comment: Optional[str] = None


class ForgotPasswordData(BaseModel):
    email: str


class ResetPasswordData(BaseModel):
    token: str
    new_password: str


def current_user(user_id: str, db: Session):
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive")
    return user


def admin_user(user_id: str, db: Session):
    user = current_user(user_id, db)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def serialize_address(address):
    return {
        "id": address.id,
        "label": address.label,
        "recipient_name": address.recipient_name,
        "phone": address.phone,
        "address_line": address.address_line,
        "city": address.city,
        "postal_code": address.postal_code,
        "country": address.country,
        "is_default": address.is_default,
        "created_at": address.created_at
    }


def coupon_discount(coupon, subtotal):
    now = datetime.utcnow()
    if not coupon or not coupon.is_active:
        raise HTTPException(status_code=400, detail="Coupon is invalid or inactive")
    if coupon.valid_from and coupon.valid_from > now:
        raise HTTPException(status_code=400, detail="Coupon is not valid yet")
    if coupon.valid_until and coupon.valid_until < now:
        raise HTTPException(status_code=400, detail="Coupon has expired")
    if coupon.usage_limit is not None and coupon.times_used >= coupon.usage_limit:
        raise HTTPException(status_code=400, detail="Coupon usage limit reached")
    if subtotal < coupon.minimum_order:
        raise HTTPException(status_code=400, detail=f"Minimum order is €{coupon.minimum_order:.2f}")
    if coupon.discount_type == "percentage":
        discount = subtotal * coupon.discount_value / 100
    elif coupon.discount_type == "fixed":
        discount = coupon.discount_value
    else:
        raise HTTPException(status_code=400, detail="Invalid coupon type")
    return round(min(discount, subtotal), 2)


@router.put("/profile")
def update_profile(
    data: ProfileUpdate,
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    user = current_user(user_id, db)
    if len(data.name.strip()) < 2:
        raise HTTPException(status_code=400, detail="Name must contain at least 2 characters")
    user.name = data.name.strip()
    user.phone = data.phone.strip() if data.phone else None
    user.country = data.country.strip() if data.country else None
    user.address = data.address.strip() if data.address else None
    db.commit()
    db.refresh(user)
    return {"id": user.id, "name": user.name, "email": user.email, "phone": user.phone,
            "country": user.country, "address": user.address, "is_admin": user.is_admin,
            "is_active": user.is_active, "created_at": user.created_at}


@router.get("/addresses")
def list_addresses(db: Session = Depends(get_db), user_id: str = Depends(verify_token)):
    user = current_user(user_id, db)
    addresses = db.query(Address).filter(Address.user_id == user.id).order_by(Address.is_default.desc(), Address.id.desc()).all()
    return [serialize_address(address) for address in addresses]


@router.post("/addresses")
def create_address(data: AddressData, db: Session = Depends(get_db), user_id: str = Depends(verify_token)):
    user = current_user(user_id, db)
    if data.is_default:
        db.query(Address).filter(Address.user_id == user.id).update({Address.is_default: False})
    address = Address(user_id=user.id, **data.model_dump())
    db.add(address)
    db.commit()
    db.refresh(address)
    return serialize_address(address)


@router.put("/addresses/{address_id}")
def update_address(address_id: int, data: AddressData, db: Session = Depends(get_db), user_id: str = Depends(verify_token)):
    user = current_user(user_id, db)
    address = db.query(Address).filter(Address.id == address_id, Address.user_id == user.id).first()
    if not address:
        raise HTTPException(status_code=404, detail="Address not found")
    if data.is_default:
        db.query(Address).filter(Address.user_id == user.id).update({Address.is_default: False})
    for key, value in data.model_dump().items():
        setattr(address, key, value)
    db.commit()
    db.refresh(address)
    return serialize_address(address)


@router.delete("/addresses/{address_id}")
def delete_address(address_id: int, db: Session = Depends(get_db), user_id: str = Depends(verify_token)):
    user = current_user(user_id, db)
    address = db.query(Address).filter(Address.id == address_id, Address.user_id == user.id).first()
    if not address:
        raise HTTPException(status_code=404, detail="Address not found")
    db.delete(address)
    db.commit()
    return {"message": "Address deleted"}


@router.get("/wishlist")
def get_wishlist(db: Session = Depends(get_db), user_id: str = Depends(verify_token)):
    user = current_user(user_id, db)
    items = db.query(WishlistItem).filter(WishlistItem.user_id == user.id).order_by(WishlistItem.created_at.desc()).all()
    result = []
    for item in items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if product:
            result.append({"id": item.id, "product_id": product.id, "name": product.name,
                           "description": product.description, "price": product.price, "stock": product.stock,
                           "image_url": product.image_url, "created_at": item.created_at})
    return result


@router.post("/wishlist")
def add_wishlist(data: ProductReference, db: Session = Depends(get_db), user_id: str = Depends(verify_token)):
    user = current_user(user_id, db)
    product = db.query(Product).filter(Product.id == data.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    existing = db.query(WishlistItem).filter(WishlistItem.user_id == user.id, WishlistItem.product_id == product.id).first()
    if existing:
        return {"message": "Product is already in wishlist", "id": existing.id}
    item = WishlistItem(user_id=user.id, product_id=product.id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"message": "Added to wishlist", "id": item.id}


@router.delete("/wishlist/{product_id}")
def remove_wishlist(product_id: int, db: Session = Depends(get_db), user_id: str = Depends(verify_token)):
    user = current_user(user_id, db)
    item = db.query(WishlistItem).filter(WishlistItem.user_id == user.id, WishlistItem.product_id == product_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Wishlist item not found")
    db.delete(item)
    db.commit()
    return {"message": "Removed from wishlist"}


@router.post("/coupons/validate")
def validate_coupon(data: CouponValidation, db: Session = Depends(get_db), user_id: str = Depends(verify_token)):
    current_user(user_id, db)
    coupon = db.query(Coupon).filter(Coupon.code == data.code.strip().upper()).first()
    discount = coupon_discount(coupon, data.subtotal)
    return {"code": coupon.code, "discount": discount, "total": round(data.subtotal - discount, 2)}


@router.get("/admin/coupons")
def list_coupons(db: Session = Depends(get_db), user_id: str = Depends(verify_token)):
    admin_user(user_id, db)
    return db.query(Coupon).order_by(Coupon.created_at.desc()).all()


@router.post("/admin/coupons")
def create_coupon(data: CouponData, db: Session = Depends(get_db), user_id: str = Depends(verify_token)):
    admin = admin_user(user_id, db)
    code = data.code.strip().upper()
    if db.query(Coupon).filter(Coupon.code == code).first():
        raise HTTPException(status_code=400, detail="Coupon code already exists")
    if data.discount_type not in ("percentage", "fixed") or data.discount_value <= 0:
        raise HTTPException(status_code=400, detail="Invalid coupon discount")
    if data.discount_type == "percentage" and data.discount_value > 100:
        raise HTTPException(status_code=400, detail="Percentage discount cannot exceed 100%")
    if data.minimum_order < 0 or (data.usage_limit is not None and data.usage_limit < 1):
        raise HTTPException(status_code=400, detail="Invalid coupon limits")
    coupon = Coupon(code=code, **{k: v for k, v in data.model_dump().items() if k != "code"})
    db.add(coupon)
    add_audit_log(db, admin.id, "create", "coupon", code, data.model_dump(mode="json"))
    db.commit()
    db.refresh(coupon)
    return coupon


@router.put("/admin/coupons/{coupon_id}")
def update_coupon(coupon_id: int, data: CouponData, db: Session = Depends(get_db), user_id: str = Depends(verify_token)):
    admin = admin_user(user_id, db)
    coupon = db.query(Coupon).filter(Coupon.id == coupon_id).first()
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found")
    duplicate = db.query(Coupon).filter(Coupon.code == data.code.strip().upper(), Coupon.id != coupon_id).first()
    if duplicate:
        raise HTTPException(status_code=400, detail="Coupon code already exists")
    if data.discount_type not in ("percentage", "fixed") or data.discount_value <= 0:
        raise HTTPException(status_code=400, detail="Invalid coupon discount")
    if data.discount_type == "percentage" and data.discount_value > 100:
        raise HTTPException(status_code=400, detail="Percentage discount cannot exceed 100%")
    if data.minimum_order < 0 or (data.usage_limit is not None and data.usage_limit < 1):
        raise HTTPException(status_code=400, detail="Invalid coupon limits")
    for key, value in data.model_dump().items():
        setattr(coupon, key, value.strip().upper() if key == "code" else value)
    add_audit_log(db, admin.id, "update", "coupon", coupon.id, data.model_dump(mode="json"))
    db.commit()
    db.refresh(coupon)
    return coupon


@router.delete("/admin/coupons/{coupon_id}")
def delete_coupon(coupon_id: int, db: Session = Depends(get_db), user_id: str = Depends(verify_token)):
    admin = admin_user(user_id, db)
    coupon = db.query(Coupon).filter(Coupon.id == coupon_id).first()
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found")
    coupon.is_active = False
    add_audit_log(db, admin.id, "deactivate", "coupon", coupon.id, {"code": coupon.code})
    db.commit()
    return {"message": "Coupon deactivated"}


@router.get("/products/{product_id}/reviews")
def list_reviews(product_id: int, db: Session = Depends(get_db)):
    reviews = db.query(Review).filter(Review.product_id == product_id).order_by(Review.created_at.desc()).all()
    result = []
    for review in reviews:
        user = db.query(User).filter(User.id == review.user_id).first()
        result.append({"id": review.id, "rating": review.rating, "comment": review.comment,
                       "customer_name": user.name if user else "Customer", "created_at": review.created_at,
                       "verified_purchase": True})
    return result


@router.post("/products/{product_id}/reviews")
def create_review(product_id: int, data: ReviewData, db: Session = Depends(get_db), user_id: str = Depends(verify_token)):
    user = current_user(user_id, db)
    if data.rating < 1 or data.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    purchased = db.query(OrderItem).join(Order, Order.id == OrderItem.order_id).filter(
        Order.user_id == user.id,
        OrderItem.product_id == product_id,
        Order.status == "delivered"
    ).first()
    if not purchased:
        raise HTTPException(status_code=403, detail="Reviews are available after the product has been delivered")
    review = db.query(Review).filter(Review.user_id == user.id, Review.product_id == product_id).first()
    if review:
        review.rating = data.rating
        review.comment = data.comment
        review.order_item_id = purchased.id
        review.updated_at = datetime.utcnow()
    else:
        review = Review(user_id=user.id, product_id=product_id, order_item_id=purchased.id,
                        rating=data.rating, comment=data.comment)
        db.add(review)
    db.commit()
    db.refresh(review)
    return review


@router.post("/password/forgot")
def forgot_password(data: ForgotPasswordData, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.strip().lower()).first()
    response = {"message": "If the email exists, reset instructions have been generated."}
    if not user:
        return response
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    db.add(PasswordResetToken(user_id=user.id, token_hash=token_hash, expires_at=datetime.utcnow() + timedelta(minutes=30)))
    db.commit()
    try:
        send_email(
            user.email,
            "Terminal One password reset",
            f"We received a request to reset your Terminal One password.\n\n"
            f"Your verification code is:\n\n{raw_token}\n\n"
            f"This code expires in 30 minutes and can only be used once.\n\n"
            f"If you did not request a password reset, you can ignore this email."
        )
    except Exception:
        db.delete(db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == token_hash).first())
        db.commit()
        raise HTTPException(status_code=503, detail="Password reset email could not be sent. Please try again later.")
    return response


@router.post("/password/reset")
def reset_password(data: ResetPasswordData, db: Session = Depends(get_db)):
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must contain at least 6 characters")
    token_hash = hashlib.sha256(data.token.encode()).hexdigest()
    token = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == token_hash).first()
    if not token or token.used or token.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Reset token is invalid or expired")
    user = db.query(User).filter(User.id == token.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.password = hash_password(data.new_password)
    token.used = True
    db.commit()
    return {"message": "Password reset successfully"}


@router.get("/admin/dashboard")
def dashboard(db: Session = Depends(get_db), user_id: str = Depends(verify_token)):
    admin_user(user_id, db)
    users = db.query(User).all()
    orders = db.query(Order).order_by(Order.created_at.asc()).all()
    products = db.query(Product).all()
    valid_orders = [order for order in orders if order.status != "cancelled"]
    monthly = {}
    for order in valid_orders:
        key = order.created_at.strftime("%Y-%m")
        monthly.setdefault(key, {"month": key, "orders": 0, "revenue": 0})
        monthly[key]["orders"] += 1
        monthly[key]["revenue"] = round(monthly[key]["revenue"] + float(order.total), 2)
    quantities = {}
    for item in db.query(OrderItem).all():
        quantities[item.product_name] = quantities.get(item.product_name, 0) + item.quantity
    top_products = sorted(quantities.items(), key=lambda pair: pair[1], reverse=True)[:5]
    return {
        "total_customers": len([user for user in users if not user.is_admin]),
        "active_customers": len([user for user in users if not user.is_admin and user.is_active]),
        "total_orders": len(orders),
        "total_revenue": round(sum(float(order.total) for order in valid_orders), 2),
        "monthly": list(monthly.values())[-6:],
        "top_products": [{"name": name, "quantity": quantity} for name, quantity in top_products],
        "low_stock": [{"id": p.id, "name": p.name, "stock": p.stock, "threshold": p.low_stock_threshold}
                      for p in products if p.stock <= p.low_stock_threshold]
    }


@router.get("/admin/audit-logs")
def audit_logs(db: Session = Depends(get_db), user_id: str = Depends(verify_token)):
    admin_user(user_id, db)
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(200).all()
    return logs


@router.get("/admin/export/{resource}")
def export_csv(resource: str, db: Session = Depends(get_db), user_id: str = Depends(verify_token)):
    admin_user(user_id, db)
    stream = io.StringIO()
    writer = csv.writer(stream)
    if resource == "customers":
        writer.writerow(["id", "name", "email", "phone", "country", "is_admin", "is_active", "created_at"])
        for user in db.query(User).order_by(User.id).all():
            writer.writerow([user.id, user.name, user.email, user.phone, user.country, user.is_admin, user.is_active, user.created_at])
    elif resource == "products":
        writer.writerow(["id", "name", "price", "stock", "category_id", "low_stock_threshold", "is_active"])
        for product in db.query(Product).order_by(Product.id).all():
            writer.writerow([product.id, product.name, product.price, product.stock, product.category_id, product.low_stock_threshold, product.is_active])
    elif resource == "orders":
        writer.writerow(["id", "user_id", "subtotal", "discount_total", "total", "status", "payment_method", "payment_status", "created_at"])
        for order in db.query(Order).order_by(Order.id).all():
            writer.writerow([order.id, order.user_id, order.subtotal, order.discount_total, order.total, order.status, order.payment_method, order.payment_status, order.created_at])
    else:
        raise HTTPException(status_code=404, detail="Export resource not found")
    stream.seek(0)
    return StreamingResponse(iter([stream.getvalue()]), media_type="text/csv", headers={
        "Content-Disposition": f'attachment; filename="terminal-one-{resource}.csv"'
    })
