from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.cart import Cart
from app.models.cart_item import CartItem
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.product import Product
from app.models.user import User
from app.security import verify_token


router = APIRouter(
    prefix="/orders",
    tags=["Orders"]
)


class OrderStatusUpdate(BaseModel):
    status: str


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

    total = round(total, 2)

    new_order = Order(
        user_id=user_id,
        total=total,
        status="pending"
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

    db.commit()
    db.refresh(new_order)

    created_items = db.query(OrderItem).filter(
        OrderItem.order_id == new_order.id
    ).all()

    return {
        "message": "Order created successfully",
        "order": {
            "id": new_order.id,
            "user_id": new_order.user_id,
            "status": new_order.status,
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
    require_admin(user_id, db)

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

    order.status = new_status

    db.commit()
    db.refresh(order)

    return {
        "message": "Order status updated successfully",
        "order": {
            "id": order.id,
            "user_id": order.user_id,
            "status": order.status,
            "total": order.total,
            "created_at": order.created_at
        }
    }