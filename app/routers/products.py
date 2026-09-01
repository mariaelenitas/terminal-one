import os
import uuid

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile
)
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.product import Product
from app.models.user import User
from app.schemas.product import ProductCreate
from app.security import verify_token


router = APIRouter()


PRODUCT_UPLOAD_DIRECTORY = "app/static/uploads/products"

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp"
}


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


@router.get("/products")
def get_products(
    db: Session = Depends(get_db)
):
    products = db.query(Product).all()

    return products


@router.get("/products/{product_id}")
def get_product(
    product_id: int,
    db: Session = Depends(get_db)
):
    product = db.query(Product).filter(
        Product.id == product_id
    ).first()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    return product


@router.post("/products/upload-image")
async def upload_product_image(
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    require_admin(
        user_id=user_id,
        db=db
    )

    if image.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Invalid image format. Use JPG, PNG or WEBP"
        )

    os.makedirs(
        PRODUCT_UPLOAD_DIRECTORY,
        exist_ok=True
    )

    extension_map = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp"
    }

    extension = extension_map[image.content_type]

    filename = f"{uuid.uuid4().hex}{extension}"

    file_path = os.path.join(
        PRODUCT_UPLOAD_DIRECTORY,
        filename
    )

    contents = await image.read()

    max_size = 5 * 1024 * 1024

    if len(contents) > max_size:
        raise HTTPException(
            status_code=400,
            detail="Image must be smaller than 5 MB"
        )

    with open(file_path, "wb") as destination:
        destination.write(contents)

    return {
        "message": "Image uploaded successfully",
        "image_url": f"/static/uploads/products/{filename}"
    }


@router.post("/products")
def create_product(
    product: ProductCreate,
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    require_admin(
        user_id=user_id,
        db=db
    )

    new_product = Product(
        name=product.name,
        description=product.description,
        price=product.price,
        stock=product.stock,
        category_id=product.category_id,
        image_url=product.image_url
    )

    db.add(new_product)
    db.commit()
    db.refresh(new_product)

    return new_product


@router.put("/products/{product_id}")
def update_product(
    product_id: int,
    product_data: ProductCreate,
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    require_admin(
        user_id=user_id,
        db=db
    )

    product = db.query(Product).filter(
        Product.id == product_id
    ).first()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    product.name = product_data.name
    product.description = product_data.description
    product.price = product_data.price
    product.stock = product_data.stock
    product.category_id = product_data.category_id
    product.image_url = product_data.image_url

    db.commit()
    db.refresh(product)

    return product


@router.delete("/products/{product_id}")
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    require_admin(
        user_id=user_id,
        db=db
    )

    product = db.query(Product).filter(
        Product.id == product_id
    ).first()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    db.delete(product)
    db.commit()

    return {
        "message": "Product deleted successfully"
    }