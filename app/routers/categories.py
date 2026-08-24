from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.category import Category
from app.models.user import User
from app.schemas.category import CategoryCreate
from app.security import verify_token


router = APIRouter()


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


@router.get("/categories")
def get_categories(
    db: Session = Depends(get_db)
):
    categories = db.query(Category).all()

    return categories


@router.post("/categories")
def create_category(
    category: CategoryCreate,
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    require_admin(
        user_id=user_id,
        db=db
    )

    new_category = Category(
        name=category.name
    )

    db.add(new_category)
    db.commit()
    db.refresh(new_category)

    return new_category


@router.delete("/categories/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    require_admin(
        user_id=user_id,
        db=db
    )

    category = db.query(Category).filter(
        Category.id == category_id
    ).first()

    if not category:
        raise HTTPException(
            status_code=404,
            detail="Category not found"
        )

    db.delete(category)
    db.commit()

    return {
        "message": "Category deleted successfully"
    }