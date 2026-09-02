from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.user import User
from app.security import (
    create_access_token,
    hash_password,
    verify_password,
    verify_token
)
from app.services.audit import add_audit_log


router = APIRouter(prefix="/users", tags=["Users"])


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    phone: Optional[str] = None
    country: Optional[str] = None
    address: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class AdminUserUpdate(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    country: Optional[str] = None
    address: Optional[str] = None
    is_admin: bool


class UserActivationUpdate(BaseModel):
    is_active: bool


def get_user_or_404(user_id: int, db: Session):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def require_admin(user_id: str, db: Session):
    current_user = get_user_or_404(int(user_id), db)
    if not current_user.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive")
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def serialize_user(user: User, db: Session, include_stats: bool = False):
    result = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "country": user.country,
        "address": user.address,
        "is_admin": user.is_admin,
        "is_active": user.is_active,
        "created_at": user.created_at
    }

    if include_stats:
        orders = db.query(Order).filter(Order.user_id == user.id).all()
        valid_orders = [order for order in orders if order.status != "cancelled"]
        result["total_orders"] = len(orders)
        result["total_spent"] = round(
            sum(float(order.total) for order in valid_orders),
            2
        )

    return result


@router.post("/")
def create_user(user: UserCreate, db: Session = Depends(get_db)):
    email = user.email.strip().lower()
    existing_user = db.query(User).filter(User.email == email).first()

    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(user.name.strip()) < 2:
        raise HTTPException(status_code=400, detail="Name must contain at least 2 characters")
    if len(user.password) < 6:
        raise HTTPException(status_code=400, detail="Password must contain at least 6 characters")

    new_user = User(
        name=user.name.strip(),
        email=email,
        password=hash_password(user.password),
        phone=user.phone.strip() if user.phone else None,
        country=user.country.strip() if user.country else None,
        address=user.address.strip() if user.address else None,
        is_admin=False,
        is_active=True
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return serialize_user(new_user, db)


@router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    email = form_data.username.strip().lower()
    user = db.query(User).filter(User.email == email).first()

    if not user or not verify_password(form_data.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account has been deactivated")

    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me")
def get_current_user(db: Session = Depends(get_db), user_id: str = Depends(verify_token)):
    current_user = get_user_or_404(int(user_id), db)
    if not current_user.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive")
    return serialize_user(current_user, db)


@router.get("/")
def get_users(db: Session = Depends(get_db), user_id: str = Depends(verify_token)):
    require_admin(user_id, db)
    users = db.query(User).order_by(User.created_at.desc(), User.id.desc()).all()
    return [serialize_user(user, db, include_stats=True) for user in users]


@router.get("/admin/{target_user_id}")
def get_user_admin(
    target_user_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    require_admin(user_id, db)
    target_user = get_user_or_404(target_user_id, db)
    return serialize_user(target_user, db, include_stats=True)


@router.put("/admin/{target_user_id}")
def update_user_admin(
    target_user_id: int,
    data: AdminUserUpdate,
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    current_admin = require_admin(user_id, db)
    target_user = get_user_or_404(target_user_id, db)
    email = data.email.strip().lower()

    duplicate = db.query(User).filter(
        User.email == email,
        User.id != target_user.id
    ).first()
    if duplicate:
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(data.name.strip()) < 2:
        raise HTTPException(status_code=400, detail="Name must contain at least 2 characters")
    if target_user.id == current_admin.id and not data.is_admin:
        raise HTTPException(status_code=400, detail="You cannot remove your own admin access")

    target_user.name = data.name.strip()
    target_user.email = email
    target_user.phone = data.phone.strip() if data.phone else None
    target_user.country = data.country.strip() if data.country else None
    target_user.address = data.address.strip() if data.address else None
    target_user.is_admin = data.is_admin

    add_audit_log(db, current_admin.id, "update", "user", target_user.id, {
        "email": target_user.email,
        "is_admin": target_user.is_admin
    })

    db.commit()
    db.refresh(target_user)
    return serialize_user(target_user, db, include_stats=True)


@router.patch("/admin/{target_user_id}/activation")
def update_user_activation(
    target_user_id: int,
    data: UserActivationUpdate,
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    current_admin = require_admin(user_id, db)
    target_user = get_user_or_404(target_user_id, db)

    if target_user.id == current_admin.id and not data.is_active:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")

    target_user.is_active = data.is_active
    add_audit_log(db, current_admin.id, "activation", "user", target_user.id, {
        "is_active": target_user.is_active
    })
    db.commit()
    db.refresh(target_user)
    return serialize_user(target_user, db, include_stats=True)


@router.get("/admin/{target_user_id}/orders")
def get_user_orders_admin(
    target_user_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    require_admin(user_id, db)
    target_user = get_user_or_404(target_user_id, db)
    orders = db.query(Order).filter(
        Order.user_id == target_user.id
    ).order_by(Order.created_at.desc()).all()

    result = []
    for order in orders:
        items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
        result.append({
            "id": order.id,
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

    return {
        "customer": serialize_user(target_user, db, include_stats=True),
        "orders": result
    }


@router.put("/change-password")
def change_password(
    data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    current_user = get_user_or_404(int(user_id), db)

    if not current_user.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive")
    if not verify_password(data.current_password, current_user.password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if data.current_password == data.new_password:
        raise HTTPException(status_code=400, detail="New password must be different from current password")
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must contain at least 6 characters")

    current_user.password = hash_password(data.new_password)
    db.commit()
    return {"message": "Password changed successfully"}
