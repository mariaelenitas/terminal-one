from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.main import app
from app.models.category import Category
from app.models.product import Product
from app.models.review import Review
from app.models.user import User
from app.models.bundle import Bundle
from app.models.bundle_item import BundleItem
from app.security import hash_password


client = TestClient(app)


def setup_module():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    admin = User(name="Admin", email="admin@terminalone.test", password=hash_password("secret1"), is_admin=True, is_active=True)
    buyer = User(name="Buyer", email="buyer@terminalone.test", password=hash_password("secret1"), is_admin=False, is_active=True)
    category = Category(name="Travel Tech")
    db.add_all([admin, buyer, category])
    db.flush()
    db.add(Product(name="Universal Adapter", description="Worldwide adapter", price=30, stock=10, category_id=category.id))
    db.commit()
    db.close()


def token(email):
    response = client.post("/users/login", data={"username": email, "password": "secret1"})
    assert response.status_code == 200
    return response.json()["access_token"]


def headers(email):
    return {"Authorization": f"Bearer {token(email)}"}


def test_profile_address_and_wishlist():
    buyer_headers = headers("buyer@terminalone.test")
    assert client.put("/profile", headers=buyer_headers, json={
        "name": "Buyer Updated", "phone": "123", "country": "Portugal", "address": "Lisbon"
    }).status_code == 200
    assert client.post("/addresses", headers=buyer_headers, json={
        "label": "Home", "recipient_name": "Buyer Updated", "phone": "123", "address_line": "Street 1",
        "city": "Lisbon", "postal_code": "1000-001", "country": "Portugal", "is_default": True
    }).status_code == 200
    assert client.post("/wishlist", headers=buyer_headers, json={"product_id": 1}).status_code == 200
    assert len(client.get("/wishlist", headers=buyer_headers).json()) == 1


def test_coupon_checkout_and_cancellation_restore_stock():
    admin_headers = headers("admin@terminalone.test")
    buyer_headers = headers("buyer@terminalone.test")
    assert client.post("/admin/coupons", headers=admin_headers, json={
        "code": "JOURNEY10", "discount_type": "percentage", "discount_value": 10,
        "minimum_order": 0, "usage_limit": 10, "valid_until": None, "is_active": True
    }).status_code == 200
    assert client.post("/cart/items?product_id=1&quantity=2", headers=buyer_headers).status_code == 200
    response = client.post("/orders/checkout", headers=buyer_headers, json={
        "coupon_code": "JOURNEY10", "shipping_address": "Lisbon", "payment_method": "card"
    })
    assert response.status_code == 200
    assert response.json()["order"]["total"] == 54
    order_id = response.json()["order"]["id"]
    assert client.patch(f"/orders/{order_id}/cancel", headers=buyer_headers).status_code == 200
    assert client.delete("/admin/coupons/1", headers=admin_headers).status_code == 200
    inactive = client.post("/coupons/validate", headers=buyer_headers, json={"code": "JOURNEY10", "subtotal": 60})
    assert inactive.status_code == 400


def test_review_requires_delivered_order_and_is_unique():
    admin_headers = headers("admin@terminalone.test")
    buyer_headers = headers("buyer@terminalone.test")
    assert client.post("/cart/items?product_id=1&quantity=1", headers=buyer_headers).status_code == 200
    checkout = client.post("/orders/checkout", headers=buyer_headers, json={
        "shipping_address": "Lisbon", "payment_method": "card"
    })
    assert checkout.status_code == 200
    order_id = checkout.json()["order"]["id"]

    early_review = client.post("/products/1/reviews", headers=buyer_headers, json={
        "rating": 5, "comment": "Too early"
    })
    assert early_review.status_code == 403

    delivered = client.patch(f"/orders/{order_id}/status", headers=admin_headers, json={"status": "delivered"})
    assert delivered.status_code == 200
    first_review = client.post("/products/1/reviews", headers=buyer_headers, json={
        "rating": 5, "comment": "Excellent"
    })
    assert first_review.status_code == 200
    assert first_review.json()["order_item_id"] is not None
    updated_review = client.post("/products/1/reviews", headers=buyer_headers, json={
        "rating": 4, "comment": "Very good"
    })
    assert updated_review.status_code == 200

    db = SessionLocal()
    assert db.query(Review).count() == 1
    db.close()


def test_bundle_airport_pickup_rewards_and_analytics():
    admin_headers = headers("admin@terminalone.test")
    buyer_headers = headers("buyer@terminalone.test")
    db = SessionLocal()
    product = db.query(Product).first()
    bundle = Bundle(name="TEST TRAVEL KIT", description="Test kit", bundle_price=20, is_active=True)
    db.add(bundle); db.flush(); db.add(BundleItem(bundle_id=bundle.id, product_id=product.id, quantity=1)); db.commit(); bundle_id = bundle.id; db.close()

    add_kit = client.post(f"/bundles/{bundle_id}/add-to-cart", headers=buyer_headers)
    assert add_kit.status_code == 200
    checkout = client.post("/orders/checkout", headers=buyer_headers, json={
        "payment_method": "card", "delivery_type": "airport_pickup",
        "pickup_details": "Lisbon (LIS) · Terminal 1 · TP123 · 2026-09-03 12:00"
    })
    assert checkout.status_code == 200
    assert checkout.json()["order"]["bundle_discount"] > 0
    order_id = checkout.json()["order"]["id"]
    assert client.patch(f"/orders/{order_id}/status", headers=admin_headers, json={"status": "delivered"}).status_code == 200
    rewards = client.get("/rewards/me", headers=buyer_headers)
    assert rewards.status_code == 200 and rewards.json()["miles"] > 0
    assert client.get("/admin/analytics", headers=admin_headers).status_code == 200


def test_password_reset_and_admin_dashboard():
    forgot = client.post("/password/forgot", json={"email": "buyer@terminalone.test"})
    assert forgot.status_code == 200
    reset = client.post("/password/reset", json={
        "token": forgot.json()["demo_token"], "new_password": "newsecret1"
    })
    assert reset.status_code == 200
    admin_headers = headers("admin@terminalone.test")
    dashboard = client.get("/admin/dashboard", headers=admin_headers)
    assert dashboard.status_code == 200
    assert "total_revenue" in dashboard.json()
