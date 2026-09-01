# Terminal One

> **Your journey starts here.**

Terminal One is a full-stack e-commerce project focused on premium travel essentials. It combines a FastAPI and PostgreSQL backend with a responsive vanilla JavaScript frontend, including authentication, product management, shopping cart, checkout, order history and an admin order-management workflow.

## Features

### Customer experience
- Responsive travel-themed storefront
- Product catalogue with images, price, stock and descriptions
- Product search
- Dynamic category filtering
- Product detail modal
- User registration and sign in
- JWT-based authentication
- Persistent authenticated shopping cart
- Add, increase, decrease and remove cart items
- Stock validation
- Multi-step checkout experience
- Shipping details
- Standard and Express delivery options
- Demo payment methods:
  - Credit / Debit Card
  - PayPal
  - MB WAY
  - Apple Pay
- Order review before confirmation
- Order confirmation
- My Orders area with order details and current status
- Best Deals section
- About Us and Contact sections

> The checkout payment methods are intentionally simulated for demonstration purposes. No real payment is processed and no payment credentials are stored.

### Admin experience
- Admin-only interface
- Product creation
- Product editing
- Product deletion
- Product image upload
- Stock management
- Category assignment
- Order management
- Customer and order information
- Order status updates:
  - Pending
  - Paid
  - Shipped
  - Delivered
  - Cancelled
- Admin order summary and revenue overview

## Tech Stack

### Backend
- Python 3.12
- FastAPI
- SQLAlchemy
- PostgreSQL
- Pydantic
- psycopg2
- JWT authentication with python-jose
- Password hashing with Passlib + bcrypt
- Uvicorn

### Frontend
- HTML5
- CSS3
- Vanilla JavaScript
- Fetch API
- Responsive design

## Project Structure

```text
terminal-one/
├── app/
│   ├── database.py
│   ├── main.py
│   ├── security.py
│   ├── models/
│   │   ├── cart.py
│   │   ├── cart_item.py
│   │   ├── category.py
│   │   ├── order.py
│   │   ├── order_item.py
│   │   ├── product.py
│   │   └── user.py
│   ├── routers/
│   │   ├── cart.py
│   │   ├── categories.py
│   │   ├── orders.py
│   │   ├── products.py
│   │   └── users.py
│   ├── schemas/
│   │   ├── category.py
│   │   ├── product.py
│   │   └── user.py
│   ├── static/
│   │   ├── css/
│   │   ├── images/
│   │   ├── js/
│   │   └── uploads/
│   └── templates/
│       └── index.html
├── .env
├── .gitignore
├── requirements.txt
└── README.md
```

## Database

The application uses PostgreSQL with SQLAlchemy.

Main entities:
- Users
- Categories
- Products
- Carts
- Cart Items
- Orders
- Order Items

The checkout workflow validates stock, creates the order and order items, decreases product stock and clears the cart.

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/mariaelenitas/terminal-one.git
cd terminal-one
```

### 2. Create a virtual environment

```bash
python3 -m venv venv
source venv/bin/activate
```

On Windows:

```bash
venv\Scripts\activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Create the PostgreSQL database

Create a PostgreSQL database named:

```text
terminal_one
```

Example with `psql`:

```sql
CREATE DATABASE terminal_one;
```

### 5. Configure environment variables

Create a `.env` file in the project root.

Example:

```env
DATABASE_URL=postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/terminal_one
SECRET_KEY=replace_with_a_long_random_secret
```

Do not commit `.env` to source control.

### 6. Run the application

```bash
uvicorn app.main:app --reload
```

Open the application at:

```text
http://127.0.0.1:8000
```

## API Documentation

FastAPI automatically provides interactive API documentation.

Swagger UI:

```text
http://127.0.0.1:8000/docs
```

ReDoc:

```text
http://127.0.0.1:8000/redoc
```

## Main API Areas

- `/users` — registration, authentication and user operations
- `/categories` — product categories
- `/products` — catalogue and product management
- `/cart` — cart operations
- `/orders` — checkout, order history and admin order management

Protected endpoints use Bearer JWT authentication.

## Checkout Flow

```text
Product
   ↓
Add to Cart
   ↓
Cart
   ↓
Shipping Details
   ↓
Delivery Method
   ↓
Payment Method (Demo)
   ↓
Review Order
   ↓
Place Order
   ↓
Order Confirmation
   ↓
My Orders
```

## Security Notes

- Passwords are hashed using Passlib and bcrypt.
- Protected routes use JWT Bearer authentication.
- Sensitive environment values are stored outside the repository in `.env`.
- `.env`, virtual environments, cache files and backups are excluded through `.gitignore`.
- Demo checkout payment information is not used for real transactions.

## Testing

The main customer and admin flows have been manually tested, including:

- Authentication required for cart operations
- Empty cart handling
- Stock-limit validation
- Product search and category filtering
- Responsive/mobile layout
- Complete checkout flow
- Order creation
- My Orders
- Admin order management
- Order status synchronization between admin and customer views

## Future Improvements

Possible next steps include:

- Real payment-gateway integration
- Persistent contact-form messages
- Promotion and discount fields
- Automated tests
- Deployment
- Additional catalogue imagery
- Email order confirmations

## Author

**Maria Elenita Susko**

GitHub: [@mariaelenitas](https://github.com/mariaelenitas)

---

**Terminal One** — *Your journey starts here.*
