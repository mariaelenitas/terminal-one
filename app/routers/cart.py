from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.cart import Cart
from app.models.cart_item import CartItem
from app.models.product import Product
from app.security import verify_token


router = APIRouter(
    prefix="/cart",
    tags=["Cart"]
)


@router.post("/")
def create_cart(
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    existing_cart = db.query(Cart).filter(
        Cart.user_id == int(user_id)
    ).first()

    if existing_cart:
        return existing_cart

    new_cart = Cart(
        user_id=int(user_id)
    )

    db.add(new_cart)
    db.commit()
    db.refresh(new_cart)

    return new_cart


@router.get("/")
def get_cart(
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    cart = db.query(Cart).filter(
        Cart.user_id == int(user_id)
    ).first()

    if not cart:
        return {
            "message": "Cart not found"
        }

    items = db.query(CartItem).filter(
        CartItem.cart_id == cart.id
    ).all()

    cart_items = []
    total = 0

    for item in items:
        product = db.query(Product).filter(
            Product.id == item.product_id
        ).first()

        if not product:
            continue

        subtotal = product.price * item.quantity
        total += subtotal

        cart_items.append({
            "item_id": item.id,
            "product_id": product.id,
            "product_name": product.name,
            "price": product.price,
            "quantity": item.quantity,
            "subtotal": round(subtotal, 2)
        })

    return {
        "cart_id": cart.id,
        "user_id": cart.user_id,
        "applied_bundle_id": cart.applied_bundle_id,
        "items": cart_items,
        "total": round(total, 2)
    }


@router.post("/items")
def add_cart_item(
    product_id: int,
    quantity: int = 1,
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    if quantity <= 0:
        raise HTTPException(
            status_code=400,
            detail="Quantity must be greater than 0"
        )

    product = db.query(Product).filter(
        Product.id == product_id
    ).first()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    if product.stock <= 0:
        raise HTTPException(
            status_code=400,
            detail="Product is out of stock"
        )

    cart = db.query(Cart).filter(
        Cart.user_id == int(user_id)
    ).first()

    if not cart:
        cart = Cart(
            user_id=int(user_id)
        )

        db.add(cart)
        db.commit()
        db.refresh(cart)

    existing_item = db.query(CartItem).filter(
        CartItem.cart_id == cart.id,
        CartItem.product_id == product_id
    ).first()

    if existing_item:
        new_quantity = existing_item.quantity + quantity

        if new_quantity > product.stock:
            raise HTTPException(
                status_code=400,
                detail=f"Only {product.stock} units available in stock"
            )

        existing_item.quantity = new_quantity

        db.commit()
        db.refresh(existing_item)

        return existing_item

    if quantity > product.stock:
        raise HTTPException(
            status_code=400,
            detail=f"Only {product.stock} units available in stock"
        )

    new_item = CartItem(
        cart_id=cart.id,
        product_id=product_id,
        quantity=quantity
    )

    db.add(new_item)
    db.commit()
    db.refresh(new_item)

    return new_item


@router.put("/items/{item_id}")
def update_cart_item(
    item_id: int,
    quantity: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    if quantity <= 0:
        raise HTTPException(
            status_code=400,
            detail="Quantity must be greater than 0"
        )

    cart = db.query(Cart).filter(
        Cart.user_id == int(user_id)
    ).first()

    if not cart:
        raise HTTPException(
            status_code=404,
            detail="Cart not found"
        )

    item = db.query(CartItem).filter(
        CartItem.id == item_id,
        CartItem.cart_id == cart.id
    ).first()

    if not item:
        raise HTTPException(
            status_code=404,
            detail="Cart item not found"
        )

    product = db.query(Product).filter(
        Product.id == item.product_id
    ).first()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    if quantity > product.stock:
        raise HTTPException(
            status_code=400,
            detail=f"Only {product.stock} units available in stock"
        )

    item.quantity = quantity

    db.commit()
    db.refresh(item)

    return item


@router.patch("/items/{item_id}/increase")
def increase_cart_item(
    item_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    cart = db.query(Cart).filter(
        Cart.user_id == int(user_id)
    ).first()

    if not cart:
        raise HTTPException(
            status_code=404,
            detail="Cart not found"
        )

    item = db.query(CartItem).filter(
        CartItem.id == item_id,
        CartItem.cart_id == cart.id
    ).first()

    if not item:
        raise HTTPException(
            status_code=404,
            detail="Cart item not found"
        )

    product = db.query(Product).filter(
        Product.id == item.product_id
    ).first()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    if item.quantity >= product.stock:
        raise HTTPException(
            status_code=400,
            detail="Cannot increase quantity beyond available stock"
        )

    item.quantity += 1

    db.commit()
    db.refresh(item)

    return item


@router.patch("/items/{item_id}/decrease")
def decrease_cart_item(
    item_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    cart = db.query(Cart).filter(
        Cart.user_id == int(user_id)
    ).first()

    if not cart:
        raise HTTPException(
            status_code=404,
            detail="Cart not found"
        )

    item = db.query(CartItem).filter(
        CartItem.id == item_id,
        CartItem.cart_id == cart.id
    ).first()

    if not item:
        raise HTTPException(
            status_code=404,
            detail="Cart item not found"
        )

    if item.quantity > 1:
        item.quantity -= 1

        db.commit()
        db.refresh(item)

        return item

    db.delete(item)
    db.commit()

    return {
        "message": "Cart item removed because quantity reached zero"
    }


@router.delete("/items/{item_id}")
def delete_cart_item(
    item_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    cart = db.query(Cart).filter(
        Cart.user_id == int(user_id)
    ).first()

    if not cart:
        raise HTTPException(
            status_code=404,
            detail="Cart not found"
        )

    item = db.query(CartItem).filter(
        CartItem.id == item_id,
        CartItem.cart_id == cart.id
    ).first()

    if not item:
        raise HTTPException(
            status_code=404,
            detail="Cart item not found"
        )

    db.delete(item)
    db.commit()

    return {
        "message": "Cart item deleted successfully"
    }
