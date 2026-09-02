import os
import uuid

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    Query
)
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.product import Product
from app.models.user import User
from app.schemas.product import ProductCreate
from app.security import verify_token
from app.services.audit import add_audit_log


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
    search: str = Query(default=""),
    category_id: int = Query(default=None),
    min_price: float = Query(default=None),
    max_price: float = Query(default=None),
    sort: str = Query(default="name"),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db)
):
    query = db.query(Product).filter(Product.is_active.is_(True))
    if search.strip():
        query = query.filter(Product.name.ilike(f"%{search.strip()}%"))
    if category_id is not None:
        query = query.filter(Product.category_id == category_id)
    if min_price is not None:
        query = query.filter(Product.price >= min_price)
    if max_price is not None:
        query = query.filter(Product.price <= max_price)
    if sort == "price_asc":
        query = query.order_by(Product.price.asc())
    elif sort == "price_desc":
        query = query.order_by(Product.price.desc())
    elif sort == "newest":
        query = query.order_by(Product.id.desc())
    else:
        query = query.order_by(Product.name.asc())
    products = query.offset(offset).limit(limit).all()

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
    admin = require_admin(
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
    admin = require_admin(
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
    db.flush()
    add_audit_log(db, admin.id, "create", "product", new_product.id, {"name": new_product.name})
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
    admin = require_admin(
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
    add_audit_log(db, admin.id, "update", "product", product.id, {"name": product.name})

    db.commit()
    db.refresh(product)

    return product


@router.delete("/products/{product_id}")
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(verify_token)
):
    admin = require_admin(
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

    product.is_active = False
    add_audit_log(db, admin.id, "deactivate", "product", product.id, {"name": product.name})
    db.commit()

    return {
        "message": "Product deactivated successfully"
    }
