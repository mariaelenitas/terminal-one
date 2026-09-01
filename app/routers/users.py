from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from fastapi.security import OAuth2PasswordRequestForm

from app.database import get_db
from app.models.user import User
from app.security import (
    hash_password,
    verify_password,
    create_access_token,
    verify_token
)


router = APIRouter(
    prefix="/users",
    tags=["Users"]
)


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    phone: str
    country: str
    address: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/")
def create_user(
    user: UserCreate,
    db: Session = Depends(get_db)
):
    existing_user = db.query(User).filter(
        User.email == user.email
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )

    new_user = User(
        name=user.name,
        email=user.email,
        password=hash_password(user.password),
        phone=user.phone,
        country=user.country,
        address=user.address,
        is_admin=False
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "id": new_user.id,
        "name": new_user.name,
        "email": new_user.email,
        "phone": new_user.phone,
        "country": new_user.country,
        "address": new_user.address,
        "is_admin": new_user.is_admin
    }


@router.post("/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(
        User.email == form_data.username
    ).first()

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    if not verify_password(
        form_data.password,
        user.password
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    token = create_access_token(
        {
            "sub": str(user.id)
        }
    )

    return {
        "access_token": token,
        "token_type": "bearer"
    }


@router.get("/me")
def get_current_user(
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    user_id = int(user_id)

    user = db.query(User).filter(
        User.id == user_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "country": user.country,
        "address": user.address,
        "is_admin": user.is_admin
    }


@router.get("/")
def get_users(
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
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

    users = db.query(User).all()

    return [
        {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "phone": user.phone,
            "country": user.country,
            "address": user.address,
            "is_admin": user.is_admin
        }
        for user in users
    ]


@router.put("/change-password")
def change_password(
    data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
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

    if not verify_password(
        data.current_password,
        current_user.password
    ):
        raise HTTPException(
            status_code=400,
            detail="Current password is incorrect"
        )

    if data.current_password == data.new_password:
        raise HTTPException(
            status_code=400,
            detail="New password must be different from current password"
        )

    current_user.password = hash_password(
        data.new_password
    )

    db.commit()

    return {
        "message": "Password changed successfully"
    }