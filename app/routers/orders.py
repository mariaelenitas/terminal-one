import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.cart import Cart
from app.models.cart_item import CartItem
from app.models.bundle import Bundle
from app.models.bundle_item import BundleItem
from app.models.coupon import Coupon
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.product import Product
from app.models.user import User
from app.models.reward_transaction import RewardTransaction
from app.security import verify_token
from app.routers.features import coupon_discount
from app.services.audit import add_audit_log
from app.services.email_service import send_email


router = APIRouter(
    prefix="/orders",
    tags=["Orders"]
)


class OrderStatusUpdate(BaseModel):
    status: str


class CheckoutRequest(BaseModel):
    coupon_code: Optional[str] = None
    shipping_address: Optional[str] = None
    payment_method: str = "demo_card"
    delivery_type: str = "home_delivery"
    pickup_details: Optional[str] = None


def require_admin(
    user_id: str,
    db: Session
):
    user_id = int(user_id)

    current_user = db.query(User).filter(
        User.id == user_id
    ).first()

    if not current_user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    if not current_user.is_admin:
        raise HTTPException(
            status_code=403,
            detail="Admin access required"
        )

    return current_user


@router.post("/checkout")
def checkout(
    checkout_data: Optional[CheckoutRequest] = None,
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    user_id = int(user_id)

    cart = db.query(Cart).filter(
        Cart.user_id == user_id
    ).first()

    if not cart:
        raise HTTPException(
            status_code=404,
            detail="Cart not found"
        )

    cart_items = db.query(CartItem).filter(
        CartItem.cart_id == cart.id
    ).all()

    if not cart_items:
        raise HTTPException(
            status_code=400,
            detail="Cart is empty"
        )

    order_items_data = []
    total = 0

    for cart_item in cart_items:
        product = db.query(Product).filter(
            Product.id == cart_item.product_id
        ).first()

        if not product:
            raise HTTPException(
                status_code=404,
                detail=f"Product {cart_item.product_id} not found"
            )

        if cart_item.quantity > product.stock:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Not enough stock for {product.name}. "
                    f"Only {product.stock} units available"
                )
            )

        subtotal = round(
            float(product.price) * cart_item.quantity,
            2
        )

        total += subtotal

        order_items_data.append({
            "product_id": product.id,
            "product_name": product.name,
            "price": float(product.price),
            "quantity": cart_item.quantity,
            "subtotal": subtotal,
            "product": product
        })

    subtotal = round(total, 2)
    checkout_data = checkout_data or CheckoutRequest()
    discount_total = 0
    coupon = None
    bundle = db.query(Bundle).filter(Bundle.id == cart.applied_bundle_id, Bundle.is_active.is_(True)).first() if cart.applied_bundle_id else None
    bundle_discount = 0
    if bundle:
        bundle_items = db.query(BundleItem).filter(BundleItem.bundle_id == bundle.id).all()
        quantities = {item["product_id"]: item["quantity"] for item in order_items_data}
        if bundle_items and all(quantities.get(item.product_id, 0) >= item.quantity for item in bundle_items):
            regular_bundle_price = sum(next(row["price"] for row in order_items_data if row["product_id"] == item.product_id) * item.quantity for item in bundle_items)
            bundle_discount = round(max(0, regular_bundle_price - bundle.bundle_price), 2)
        else:
            bundle = None

    if checkout_data.coupon_code:
        coupon = db.query(Coupon).filter(
            Coupon.code == checkout_data.coupon_code.strip().upper()
        ).first()
        discount_total = coupon_discount(coupon, subtotal - bundle_discount)

    discount_total = round(discount_total + bundle_discount, 2)
    total = round(subtotal - discount_total, 2)

    if checkout_data.delivery_type not in ("home_delivery", "airport_pickup"):
        raise HTTPException(status_code=400, detail="Invalid delivery type")
    if checkout_data.delivery_type == "airport_pickup" and not (checkout_data.pickup_details or "").strip():
        raise HTTPException(status_code=400, detail="Airport, terminal, flight and pickup time are required")

    new_order = Order(
        user_id=user_id,
        subtotal=subtotal,
        discount_total=discount_total,
        coupon_code=coupon.code if coupon else None,
        shipping_address=checkout_data.shipping_address,
        payment_method=checkout_data.payment_method,
        payment_status="paid",
        delivery_type=checkout_data.delivery_type,
        pickup_details=checkout_data.pickup_details,
        bundle_name=bundle.name if bundle else None,
        bundle_discount=bundle_discount,
        total=total,
        status="paid"
    )

    db.add(new_order)
    db.flush()

    for item_data in order_items_data:
        order_item = OrderItem(
            order_id=new_order.id,
            product_id=item_data["product_id"],
            product_name=item_data["product_name"],
            price=item_data["price"],
            quantity=item_data["quantity"],
            subtotal=item_data["subtotal"]
        )

        db.add(order_item)

        product = item_data["product"]
        product.stock -= item_data["quantity"]

    for cart_item in cart_items:
        db.delete(cart_item)
    cart.applied_bundle_id = None

    if coupon:
        coupon.times_used += 1

    db.commit()
    db.refresh(new_order)

    customer = db.query(User).filter(User.id == user_id).first()
    if customer:
        send_email(
            customer.email,
            f"Terminal One order #{new_order.id}",
            f"Your order #{new_order.id} was confirmed. Total: €{new_order.total:.2f}. Status: PAID."
        )

    created_items = db.query(OrderItem).filter(
        OrderItem.order_id == new_order.id
    ).all()

    return {
        "message": "Order created successfully",
        "order": {
            "id": new_order.id,
            "user_id": new_order.user_id,
            "status": new_order.status,
            "subtotal": new_order.subtotal,
            "discount_total": new_order.discount_total,
            "coupon_code": new_order.coupon_code,
            "payment_method": new_order.payment_method,
            "payment_status": new_order.payment_status,
            "delivery_type": new_order.delivery_type,
            "pickup_details": new_order.pickup_details,
            "bundle_name": new_order.bundle_name,
            "bundle_discount": new_order.bundle_discount,
            "total": new_order.total,
            "created_at": new_order.created_at
        },
        "items": [
            {
                "id": item.id,
                "product_id": item.product_id,
                "product_name": item.product_name,
                "price": item.price,
                "quantity": item.quantity,
                "subtotal": item.subtotal
            }
            for item in created_items
        ]
    }


@router.get("/")
def get_orders(
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    user_id = int(user_id)

    orders = db.query(Order).filter(
        Order.user_id == user_id
    ).order_by(
        Order.created_at.desc()
    ).all()

    return [
        {
            "id": order.id,
            "user_id": order.user_id,
            "status": order.status,
            "payment_status": order.payment_status,
            "tracking_code": order.tracking_code,
            "total": order.total,
            "created_at": order.created_at
        }
        for order in orders
    ]


@router.get("/admin/all")
def get_all_orders_admin(
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    require_admin(user_id, db)

    orders = db.query(Order).order_by(
        Order.created_at.desc()
    ).all()

    result = []

    for order in orders:
        customer = db.query(User).filter(
            User.id == order.user_id
        ).first()

        items = db.query(OrderItem).filter(
            OrderItem.order_id == order.id
        ).all()

        result.append({
            "id": order.id,
            "user_id": order.user_id,
            "customer_name": customer.name if customer else None,
            "customer_email": customer.email if customer else None,
            "status": order.status,
            "payment_status": order.payment_status,
            "tracking_code": order.tracking_code,
            "total": order.total,
            "created_at": order.created_at,
            "items": [
                {
                    "id": item.id,
                    "product_id": item.product_id,
                    "product_name": item.product_name,
                    "price": item.price,
                    "quantity": item.quantity,
                    "subtotal": item.subtotal
                }
                for item in items
            ]
        })

    return result


@router.get("/admin/summary")
def get_admin_summary(
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    require_admin(user_id, db)

    orders = db.query(Order).all()

    total_orders = len(orders)

    total_revenue = round(
        sum(
            float(order.total)
            for order in orders
            if order.status != "cancelled"
        ),
        2
    )

    pending_orders = sum(
        1 for order in orders
        if order.status == "pending"
    )

    paid_orders = sum(
        1 for order in orders
        if order.status == "paid"
    )

    shipped_orders = sum(
        1 for order in orders
        if order.status == "shipped"
    )

    delivered_orders = sum(
        1 for order in orders
        if order.status == "delivered"
    )

    cancelled_orders = sum(
        1 for order in orders
        if order.status == "cancelled"
    )

    return {
        "total_orders": total_orders,
        "total_revenue": total_revenue,
        "pending_orders": pending_orders,
        "paid_orders": paid_orders,
        "shipped_orders": shipped_orders,
        "delivered_orders": delivered_orders,
        "cancelled_orders": cancelled_orders
    }


@router.patch("/{order_id}/cancel")
def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    order = db.query(Order).filter(Order.id == order_id, Order.user_id == int(user_id)).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status not in ("pending", "paid"):
        raise HTTPException(status_code=400, detail="Only pending or paid orders can be cancelled")
    items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
    for item in items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if product:
            product.stock += item.quantity
    order.status = "cancelled"
    order.payment_status = "refunded_demo"
    order.cancelled_at = datetime.utcnow()
    db.commit()
    return {"message": "Order cancelled and stock restored", "order_id": order.id, "status": order.status}


@router.get("/{order_id}")
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    user_id = int(user_id)

    order = db.query(Order).filter(
        Order.id == order_id,
        Order.user_id == user_id
    ).first()

    if not order:
        raise HTTPException(
            status_code=404,
            detail="Order not found"
        )

    items = db.query(OrderItem).filter(
        OrderItem.order_id == order.id
    ).all()

    return {
        "id": order.id,
        "user_id": order.user_id,
        "status": order.status,
        "subtotal": order.subtotal,
        "discount_total": order.discount_total,
        "coupon_code": order.coupon_code,
        "shipping_address": order.shipping_address,
        "payment_method": order.payment_method,
        "payment_status": order.payment_status,
        "tracking_code": order.tracking_code,
        "delivery_type": order.delivery_type,
        "pickup_details": order.pickup_details,
        "bundle_name": order.bundle_name,
        "bundle_discount": order.bundle_discount,
        "total": order.total,
        "created_at": order.created_at,
        "items": [
            {
                "id": item.id,
                "product_id": item.product_id,
                "product_name": item.product_name,
                "price": item.price,
                "quantity": item.quantity,
                "subtotal": item.subtotal
            }
            for item in items
        ]
    }


@router.patch("/{order_id}/status")
def update_order_status(
    order_id: int,
    status_data: OrderStatusUpdate,
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    admin = require_admin(user_id, db)

    allowed_statuses = [
        "pending",
        "paid",
        "shipped",
        "delivered",
        "cancelled"
    ]

    new_status = status_data.status.lower().strip()

    if new_status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid status. Allowed statuses: "
                "pending, paid, shipped, delivered, cancelled"
            )
        )

    order = db.query(Order).filter(
        Order.id == order_id
    ).first()

    if not order:
        raise HTTPException(
            status_code=404,
            detail="Order not found"
        )

    if new_status == "cancelled" and order.status != "cancelled":
        items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
        for item in items:
            product = db.query(Product).filter(Product.id == item.product_id).first()
            if product:
                product.stock += item.quantity
        order.cancelled_at = datetime.utcnow()
        existing_reward = db.query(RewardTransaction).filter(RewardTransaction.order_id == order.id).first()
        if existing_reward:
            db.delete(existing_reward)

    order.status = new_status
    if new_status == "shipped" and not order.tracking_code:
        order.tracking_code = f"T1-{uuid.uuid4().hex[:10].upper()}"
    if new_status in ("paid", "shipped", "delivered"):
        order.payment_status = "paid"
    if new_status == "delivered":
        existing_reward = db.query(RewardTransaction).filter(RewardTransaction.order_id == order.id).first()
        if not existing_reward:
            db.add(RewardTransaction(user_id=order.user_id, order_id=order.id, miles=int(order.total), reason="Delivered order"))
    add_audit_log(db, admin.id, "update_status", "order", order.id, {"status": new_status})

    db.commit()
    db.refresh(order)

    return {
        "message": "Order status updated successfully",
        "order": {
            "id": order.id,
            "user_id": order.user_id,
            "status": order.status,
            "tracking_code": order.tracking_code,
            "total": order.total,
            "created_at": order.created_at
        }
    }
