const productsContainer = document.getElementById("products-container");
const categoriesContainer = document.getElementById("categories-container");
const productsTitle = document.getElementById("products-title");
const viewAllProductsLink = document.getElementById("view-all-products");
const searchInput = document.getElementById("product-search");
const locationElement = document.getElementById("location");
const weatherElement = document.getElementById("weather");
const localTimeElement = document.getElementById("local-time");
const accountText = document.getElementById("account-user-text");
const cartButton = document.getElementById("cart-button");
const cartCount = document.getElementById("cart-count");
const mainNav = document.querySelector(".main-nav");
const bestDealsLink = document.getElementById("nav-best-deals");
const myOrdersLink = document.getElementById("nav-my-orders");
const wishlistLink = document.getElementById("nav-wishlist");
const contactForm = document.getElementById("contact-form");
const catalogSort = document.getElementById("catalog-sort");
const catalogMinPrice = document.getElementById("catalog-min-price");
const catalogMaxPrice = document.getElementById("catalog-max-price");
const trendingContainer = document.getElementById("trending-container");

let currentUser = null;
let currentTimeZone = undefined;
let allProducts = [];
let allCategories = [];
let activeCategoryId = null;
let activeSearchTerm = "";
let wishlistProductIds = new Set();
let catalogInsights = new Map();

function getToken() {
    return localStorage.getItem("terminal_one_token");
}

function saveToken(token) {
    localStorage.setItem("terminal_one_token", token);
}

function clearToken() {
    localStorage.removeItem("terminal_one_token");
    currentUser = null;
    wishlistProductIds = new Set();
}

async function loadWishlistState() {
    if (!currentUser || !getToken()) {
        wishlistProductIds = new Set();
        return;
    }

    try {
        const items = await apiRequest("/wishlist");
        wishlistProductIds = new Set(items.map((item) => Number(item.product_id)));
    } catch (error) {
        wishlistProductIds = new Set();
    }
}

async function toggleWishlist(productId) {
    if (!requireLogin()) return null;
    const id = Number(productId);

    if (wishlistProductIds.has(id)) {
        await apiRequest(`/wishlist/${id}`, { method: "DELETE" });
        wishlistProductIds.delete(id);
        showToast("Removed from wishlist.", "success");
    } else {
        await apiRequest("/wishlist", {
            method: "POST",
            body: JSON.stringify({ product_id: id })
        });
        wishlistProductIds.add(id);
        showToast("Saved to wishlist.", "success");
    }

    renderProducts();
    return wishlistProductIds.has(id);
}

function escapeHtml(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatMoney(value) {
    return `€${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
    if (!value) {
        return "—";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString([], {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}

async function readResponseData(response) {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
        return await response.json();
    }

    const text = await response.text();
    return text ? { detail: text } : {};
}

function getErrorMessage(data, fallback) {
    if (!data) {
        return fallback;
    }

    if (typeof data.detail === "string") {
        return data.detail;
    }

    if (Array.isArray(data.detail)) {
        return data.detail
            .map((item) => item.msg || JSON.stringify(item))
            .join(" · ");
    }

    if (typeof data.message === "string") {
        return data.message;
    }

    return fallback;
}

function requireLogin() {
    if (getToken()) {
        return true;
    }

    openLoginModal();
    return false;
}

function getProductImageHtml(product, extraClass = "") {
    if (product.image_url) {
        return `
            <div class="product-image-wrapper ${extraClass}">
                <img
                    class="product-image"
                    src="${escapeHtml(product.image_url)}"
                    alt="${escapeHtml(product.name)}"
                >
            </div>
        `;
    }

    return `
        <div class="product-placeholder ${extraClass}">
            ✈
        </div>
    `;
}

function getCategoryIcon(categoryName) {
    const name = String(categoryName || "").toLowerCase();

    if (name.includes("luggage")) return "▣";
    if (name.includes("accessor")) return "✈";
    if (name.includes("tech")) return "◉";
    if (name.includes("comfort")) return "◡";
    if (name.includes("business")) return "▤";
    if (name.includes("document")) return "▤";
    if (name.includes("gift")) return "♢";
    return "◇";
}

function getFilteredProducts() {
    let products = [...allProducts];

    if (activeCategoryId !== null) {
        products = products.filter(
            (product) => Number(product.category_id) === Number(activeCategoryId)
        );
    }

    if (activeSearchTerm) {
        const query = activeSearchTerm.toLowerCase();
        products = products.filter((product) => {
            const name = String(product.name || "").toLowerCase();
            const description = String(product.description || "").toLowerCase();
            return name.includes(query) || description.includes(query);
        });
    }

    const minimum = catalogMinPrice?.value === "" ? null : Number(catalogMinPrice.value);
    const maximum = catalogMaxPrice?.value === "" ? null : Number(catalogMaxPrice.value);
    if (minimum !== null) products = products.filter((product) => Number(product.price) >= minimum);
    if (maximum !== null) products = products.filter((product) => Number(product.price) <= maximum);
    const sort = catalogSort?.value || "name";
    products.sort((a, b) => sort === "price_asc" ? Number(a.price) - Number(b.price)
        : sort === "price_desc" ? Number(b.price) - Number(a.price)
        : sort === "newest" ? Number(b.id) - Number(a.id)
        : String(a.name).localeCompare(String(b.name)));

    return products;
}

function updateProductsHeading() {
    if (activeSearchTerm) {
        productsTitle.textContent = "SEARCH RESULTS";
        return;
    }

    if (activeCategoryId !== null) {
        const category = allCategories.find(
            (item) => Number(item.id) === Number(activeCategoryId)
        );
        productsTitle.textContent = category
            ? category.name.toUpperCase()
            : "TRAVEL ESSENTIALS";
        return;
    }

    productsTitle.textContent = "TRAVEL ESSENTIALS";
}

function renderProducts() {
    if (!productsContainer) {
        return;
    }

    const products = getFilteredProducts();
    updateProductsHeading();
    productsContainer.innerHTML = "";

    if (products.length === 0) {
        productsContainer.innerHTML = `
            <div class="loading-products">
                No products found.
            </div>
        `;
        return;
    }

    products.forEach((product) => {
        const card = document.createElement("article");
        card.className = "product-card terminal-product-card";
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", `View ${product.name}`);

        const stock = Number(product.stock || 0);
        const isOutOfStock = stock <= 0;
        const isFavorite = wishlistProductIds.has(Number(product.id));
        const insight = catalogInsights.get(Number(product.id)) || {};

        card.innerHTML = `
            ${insight.badge ? `<span class="product-badge">${escapeHtml(insight.badge)}</span>` : ""}
            <button class="terminal-wishlist-heart ${isFavorite ? "active" : ""}" type="button"
                aria-label="${isFavorite ? "Remove from" : "Add to"} wishlist"
                title="${isFavorite ? "Remove from wishlist" : "Add to wishlist"}">
                ${isFavorite ? "♥" : "♡"}
            </button>
            ${getProductImageHtml(product)}
            <h4>${escapeHtml(product.name)}</h4>
            <p class="description">${escapeHtml(product.description)}</p>
            <div class="product-bottom">
                <span class="product-price">${formatMoney(product.price)}</span>
                <span class="stock">${stock} in stock</span>
            </div>
            ${Number(insight.average_rating || 0) > 0 ? `<div class="product-rating">★ ${Number(insight.average_rating).toFixed(1)} · ${Number(insight.units_sold || 0)} sold</div>` : ""}
            <button
                class="terminal-card-cart-button"
                type="button"
                ${isOutOfStock ? "disabled" : ""}
            >
                ${isOutOfStock ? "OUT OF STOCK" : "ADD TO CART"}
            </button>
        `;

        const addButton = card.querySelector(".terminal-card-cart-button");
        const wishlistButton = card.querySelector(".terminal-wishlist-heart");

        wishlistButton.addEventListener("click", async (event) => {
            event.stopPropagation();
            if (!requireLogin()) return;
            wishlistButton.disabled = true;
            try {
                await toggleWishlist(product.id);
            } catch (error) {
                showToast(error.message, "error");
            } finally {
                if (wishlistButton.isConnected) wishlistButton.disabled = false;
            }
        });

        addButton.addEventListener("click", async (event) => {
            event.stopPropagation();
            if (isOutOfStock) return;

            addButton.disabled = true;
            const originalText = addButton.textContent;
            addButton.textContent = "ADDING...";

            try {
                await addToCart(product.id, 1);
                showToast(`${product.name} added to cart.`, "success");
            } catch (error) {
                showToast(error.message, "error");
            } finally {
                addButton.disabled = false;
                addButton.textContent = originalText;
            }
        });

        card.addEventListener("click", () => openProductModal(product));
        card.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openProductModal(product);
            }
        });

        productsContainer.appendChild(card);
    });
}

async function loadProducts() {
    try {
        const response = await fetch("/products");
        if (!response.ok) {
            throw new Error("Could not load products");
        }

        allProducts = await response.json();
        renderProducts();
    } catch (error) {
        console.error("Products error:", error);
        if (productsContainer) {
            productsContainer.innerHTML = `
                <div class="loading-products">
                    Unable to load products.
                </div>
            `;
        }
    }
}

async function loadCatalogInsights() {
    try {
        const data = await apiRequest("/catalog/insights");
        catalogInsights = new Map((data.products || []).map((item) => [Number(item.id), item]));
        renderProducts();
        if (trendingContainer) {
            trendingContainer.innerHTML = (data.trending || []).slice(0, 4).map((product) => `
                <article class="product-card terminal-product-card trending-card" data-product-id="${product.id}">
                    ${product.badge ? `<span class="product-badge">${escapeHtml(product.badge)}</span>` : ""}
                    ${getProductImageHtml(product)}<h4>${escapeHtml(product.name)}</h4>
                    <p class="description">${escapeHtml(product.description)}</p>
                    <div class="product-bottom"><span class="product-price">${formatMoney(product.price)}</span><span class="stock">★ ${Number(product.average_rating || 0).toFixed(1)}</span></div>
                </article>`).join("") || `<div class="loading-products">No trending products yet.</div>`;
            trendingContainer.querySelectorAll(".trending-card").forEach((card) => card.onclick = () => {
                const product = allProducts.find((item) => Number(item.id) === Number(card.dataset.productId));
                if (product) openProductModal(product);
            });
        }
    } catch (error) { console.error("Catalog insights error:", error); }
}

async function loadCategories() {
    if (!categoriesContainer) {
        return;
    }

    try {
        const response = await fetch("/categories");
        if (!response.ok) {
            throw new Error("Could not load categories");
        }

        allCategories = await response.json();
        renderCategories();
    } catch (error) {
        console.error("Categories error:", error);
        categoriesContainer.innerHTML = `
            <div class="loading-products">Unable to load categories.</div>
        `;
    }
}

function renderCategories() {
    categoriesContainer.innerHTML = "";

    const allCard = document.createElement("article");
    allCard.className = "category-card terminal-category-card active-category-card";
    allCard.dataset.categoryId = "all";
    allCard.innerHTML = `
        <div class="category-icon">✦</div>
        <p>ALL PRODUCTS</p>
    `;
    allCard.addEventListener("click", () => selectCategory(null));
    categoriesContainer.appendChild(allCard);

    allCategories.forEach((category) => {
        const card = document.createElement("article");
        card.className = "category-card terminal-category-card";
        card.dataset.categoryId = String(category.id);
        card.innerHTML = `
            <div class="category-icon">${getCategoryIcon(category.name)}</div>
            <p>${escapeHtml(String(category.name).toUpperCase())}</p>
        `;
        card.addEventListener("click", () => selectCategory(category.id));
        categoriesContainer.appendChild(card);
    });
}

function selectCategory(categoryId) {
    activeCategoryId = categoryId;
    activeSearchTerm = "";
    if (searchInput) searchInput.value = "";

    document.querySelectorAll(".terminal-category-card").forEach((card) => {
        const id = card.dataset.categoryId;
        const isActive = categoryId === null
            ? id === "all"
            : Number(id) === Number(categoryId);
        card.classList.toggle("active-category-card", isActive);
    });

    renderProducts();
    document.getElementById("products")?.scrollIntoView({ behavior: "smooth" });
}

async function openProductModal(product) {
    const stock = Number(product.stock || 0);
    const isOutOfStock = stock <= 0;
    let reviews = [];
    try { reviews = await apiRequest(`/products/${product.id}/reviews`); } catch (error) { reviews = []; }
    let pairedProducts = [];
    try { pairedProducts = await apiRequest(`/products/${product.id}/frequently-bought`); } catch (error) { pairedProducts = []; }
    const averageRating = reviews.length
        ? reviews.reduce((total, review) => total + Number(review.rating || 0), 0) / reviews.length
        : 0;

    const overlay = createModal(
        product.name,
        "TERMINAL ONE PRODUCT",
        `
            <div class="product-detail-layout">
                <div>${getProductImageHtml(product, "product-detail-image")}</div>
                <div class="product-detail-copy">
                    <p>${escapeHtml(product.description)}</p>
                    <div class="product-detail-meta">
                        <strong>${formatMoney(product.price)}</strong>
                        <span>${stock} in stock</span>
                    </div>
                    <div class="terminal-form-group product-quantity-group">
                        <label for="product-detail-quantity">QUANTITY</label>
                        <input
                            id="product-detail-quantity"
                            type="number"
                            min="1"
                            max="${Math.max(stock, 1)}"
                            value="1"
                            ${isOutOfStock ? "disabled" : ""}
                        >
                    </div>
                    <div id="product-detail-message" class="terminal-message"></div>
                    <button
                        id="product-detail-add"
                        class="terminal-gold-button"
                        type="button"
                        ${isOutOfStock ? "disabled" : ""}
                    >
                        ${isOutOfStock ? "OUT OF STOCK" : "ADD TO CART"}
                    </button>
                    <button id="product-detail-wishlist" class="terminal-secondary-button" type="button" style="width:100%; margin-top:10px;">
                        ${wishlistProductIds.has(Number(product.id)) ? "♥ REMOVE FROM WISHLIST" : "♡ ADD TO WISHLIST"}
                    </button>
                </div>
            </div>
            <div class="checkout-review-block" style="margin-top:18px;">
                <strong>VERIFIED CUSTOMER REVIEWS</strong>
                ${reviews.length ? `<p><strong>${averageRating.toFixed(1)} / 5</strong> · ${reviews.length} ${reviews.length === 1 ? "review" : "reviews"}</p>` : ""}
                ${reviews.map((review) => `<p>${"★".repeat(Number(review.rating))}${"☆".repeat(5 - Number(review.rating))} · ${escapeHtml(review.customer_name)} · <strong>VERIFIED PURCHASE</strong><br>${escapeHtml(review.comment || "")}</p>`).join("") || "<p>No reviews yet.</p>"}
            </div>
            <div class="checkout-review-block" style="margin-top:18px;">
                <strong>FREQUENTLY BOUGHT TOGETHER</strong>
                <div class="frequent-grid">${pairedProducts.map((item) => `<button class="frequent-product" data-product-id="${item.id}" type="button">${getProductImageHtml(item)}<span>${escapeHtml(item.name)}</span><strong>${formatMoney(item.price)}</strong></button>`).join("") || "<p>More combinations coming soon.</p>"}</div>
            </div>
        `
    );

    const addButton = overlay.querySelector("#product-detail-add");
    const quantityInput = overlay.querySelector("#product-detail-quantity");
    const message = overlay.querySelector("#product-detail-message");

    addButton?.addEventListener("click", async () => {
        const quantity = Math.max(1, Number(quantityInput.value || 1));
        addButton.disabled = true;
        addButton.textContent = "ADDING...";

        try {
            await addToCart(product.id, quantity);
            message.textContent = "Product added to your cart.";
            message.className = "terminal-message success";
        } catch (error) {
            message.textContent = error.message;
            message.className = "terminal-message error";
        } finally {
            addButton.disabled = false;
            addButton.textContent = "ADD TO CART";
        }
    });

    overlay.querySelector("#product-detail-wishlist")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
            const active = await toggleWishlist(product.id);
            if (active !== null) button.textContent = active ? "♥ REMOVE FROM WISHLIST" : "♡ ADD TO WISHLIST";
        } catch (error) {
            showToast(error.message, "error");
        } finally {
            button.disabled = false;
        }
    });
    overlay.querySelectorAll(".frequent-product").forEach((button) => button.onclick = async () => {
        button.disabled = true;
        try { await addToCart(Number(button.dataset.productId), 1); showToast("Added to cart.", "success"); }
        catch (error) { showToast(error.message, "error"); }
        finally { button.disabled = false; }
    });
}

function updateClock() {
    if (!localTimeElement) return;

    const now = new Date();
    const options = {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    };

    if (currentTimeZone) {
        options.timeZone = currentTimeZone;
    }

    localTimeElement.textContent = now.toLocaleTimeString([], options);
}

function getWeatherDescription(code) {
    const weatherCodes = {
        0: "Clear",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Cloudy",
        45: "Fog",
        48: "Fog",
        51: "Light drizzle",
        53: "Drizzle",
        55: "Heavy drizzle",
        61: "Light rain",
        63: "Rain",
        65: "Heavy rain",
        71: "Light snow",
        73: "Snow",
        75: "Heavy snow",
        80: "Rain showers",
        81: "Rain showers",
        82: "Heavy showers",
        95: "Thunderstorm"
    };

    return weatherCodes[code] || "Current weather";
}

async function loadWeather(latitude, longitude) {
    if (!weatherElement) return;

    try {
        const url =
            "https://api.open-meteo.com/v1/forecast" +
            `?latitude=${latitude}` +
            `&longitude=${longitude}` +
            "&current=temperature_2m,weather_code" +
            "&timezone=auto";

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error("Weather request failed");
        }

        const data = await response.json();
        const temperature = Math.round(data.current.temperature_2m);
        const description = getWeatherDescription(data.current.weather_code);
        weatherElement.textContent = `${temperature}°C · ${description}`;

        if (data.timezone) {
            currentTimeZone = data.timezone;
            updateClock();
        }
    } catch (error) {
        console.error("Weather error:", error);
        weatherElement.textContent = "Weather unavailable";
    }
}

async function loadLocationName(latitude, longitude) {
    if (!locationElement) return;

    try {
        const url =
            "https://nominatim.openstreetmap.org/reverse" +
            "?format=jsonv2" +
            `&lat=${latitude}` +
            `&lon=${longitude}` +
            "&accept-language=en";

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error("Location request failed");
        }

        const data = await response.json();
        const address = data.address || {};
        const city =
            address.city ||
            address.town ||
            address.village ||
            address.municipality ||
            address.county;
        const country = address.country;

        if (city && country) {
            locationElement.textContent = `${city}, ${country}`;
        } else if (country) {
            locationElement.textContent = country;
        } else {
            locationElement.textContent = "Current location";
        }
    } catch (error) {
        console.error("Location name error:", error);
        locationElement.textContent = "Current location";
    }
}

function loadLocationAndWeather() {
    updateClock();

    if (!navigator.geolocation) {
        if (locationElement) locationElement.textContent = "Location unavailable";
        if (weatherElement) weatherElement.textContent = "Weather unavailable";
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;

            if (locationElement) locationElement.textContent = "Current location";

            await Promise.all([
                loadWeather(latitude, longitude),
                loadLocationName(latitude, longitude)
            ]);
        },
        (error) => {
            console.error("Geolocation error:", error.code, error.message);
            if (locationElement) locationElement.textContent = "Location unavailable";
            if (weatherElement) weatherElement.textContent = "Weather unavailable";
        },
        {
            enableHighAccuracy: false,
            timeout: 15000,
            maximumAge: 300000
        }
    );
}

function injectFrontendStyles() {
    if (document.getElementById("terminal-one-extra-styles")) {
        return;
    }

    const style = document.createElement("style");
    style.id = "terminal-one-extra-styles";
    style.textContent = `
        html {
            scroll-behavior: smooth;
        }

        .product-image-wrapper {
            height: 170px;
            margin-bottom: 12px;
            overflow: hidden;
            border-radius: 5px;
            background: #111315;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .product-image {
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: block;
        }

        .product-placeholder {
            height: 170px;
            margin-bottom: 12px;
            border-radius: 5px;
            background: #111315;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #e8ad34;
            font-size: 34px;
        }

        .terminal-product-card {
            position: relative;
            cursor: pointer;
            transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .terminal-wishlist-heart {
            position: absolute;
            z-index: 3;
            top: 12px;
            right: 12px;
            width: 42px;
            height: 42px;
            border: 1px solid rgba(232, 173, 52, 0.75);
            border-radius: 50%;
            background: rgba(5, 6, 7, 0.88);
            color: #f3c35a;
            font-size: 25px;
            line-height: 1;
            cursor: pointer;
            box-shadow: 0 5px 18px rgba(0, 0, 0, 0.42);
        }

        .terminal-wishlist-heart:hover,
        .terminal-wishlist-heart.active {
            background: #e8ad34;
            color: #090a0b;
        }

        .terminal-product-card:hover,
        .terminal-product-card:focus {
            transform: translateY(-3px);
            border-color: #b67c1e;
            box-shadow: 0 12px 26px rgba(0, 0, 0, 0.28);
            outline: none;
        }

        .terminal-card-cart-button {
            width: 100%;
            margin-top: 14px;
            border: 1px solid #b67c1e;
            border-radius: 4px;
            padding: 10px 12px;
            cursor: pointer;
            background: transparent;
            color: #e8ad34;
            font-weight: 800;
            font-size: 10px;
            letter-spacing: 0.8px;
        }

        .terminal-card-cart-button:hover {
            background: rgba(232, 173, 52, 0.1);
        }

        .terminal-card-cart-button:disabled {
            opacity: 0.45;
            cursor: not-allowed;
        }

        .terminal-category-card {
            cursor: pointer;
            transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
        }

        .terminal-category-card:hover,
        .active-category-card {
            transform: translateY(-2px);
            border-color: #d69d31 !important;
            background: rgba(232, 173, 52, 0.07) !important;
        }

        .cart-button {
            border: none;
            background: transparent;
            color: inherit;
            font: inherit;
            display: inline-flex;
            align-items: center;
            gap: 7px;
            cursor: pointer;
            padding: 0;
        }

        .terminal-modal-overlay {
            position: fixed;
            inset: 0;
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 25px;
            background: rgba(0, 0, 0, 0.82);
            backdrop-filter: blur(7px);
        }

        .terminal-modal {
            width: min(820px, 100%);
            max-height: 90vh;
            overflow-y: auto;
            background: linear-gradient(145deg, #111315, #070809);
            border: 1px solid #3a3d40;
            border-radius: 8px;
            box-shadow: 0 24px 70px rgba(0, 0, 0, 0.7);
        }

        .terminal-modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 22px 24px;
            border-bottom: 1px solid #292d31;
        }

        .terminal-modal-header h2 {
            margin: 0;
            color: #f4f4f4;
            font-size: 18px;
            letter-spacing: 1px;
        }

        .terminal-modal-header p {
            margin: 4px 0 0;
            color: #e8ad34;
            font-size: 9px;
            letter-spacing: 1.5px;
        }

        .terminal-modal-close {
            border: none;
            background: transparent;
            color: #9da2a7;
            font-size: 27px;
            cursor: pointer;
        }

        .terminal-modal-body {
            padding: 24px;
        }

        .terminal-modal-back-row {
            position: sticky;
            top: 0;
            z-index: 5;
            margin: -24px -24px 20px;
            padding: 12px 24px;
            background: rgba(10, 12, 14, 0.96);
            border-bottom: 1px solid #292d31;
        }

        .terminal-form-group {
            margin-bottom: 17px;
        }

        .terminal-form-group label {
            display: block;
            margin-bottom: 7px;
            color: #c5c8cb;
            font-size: 10px;
            letter-spacing: 0.8px;
        }

        .terminal-form-group input,
        .terminal-form-group textarea,
        .terminal-form-group select {
            width: 100%;
            border: 1px solid #34383c;
            border-radius: 5px;
            outline: none;
            background: #0b0d0f;
            color: #f4f4f4;
            padding: 12px 13px;
            font-family: inherit;
            box-sizing: border-box;
        }

        .terminal-form-group textarea {
            min-height: 110px;
            resize: vertical;
        }

        .terminal-form-row {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
        }

        .terminal-gold-button {
            width: 100%;
            border: none;
            border-radius: 5px;
            padding: 13px 18px;
            cursor: pointer;
            background: linear-gradient(135deg, #f3c35a, #ca8e21);
            color: #080808;
            font-weight: 800;
            font-size: 11px;
            letter-spacing: 0.7px;
        }

        .terminal-gold-button:disabled {
            opacity: 0.55;
            cursor: not-allowed;
        }

        .terminal-secondary-button {
            border: 1px solid #4a4f54;
            border-radius: 5px;
            padding: 9px 12px;
            cursor: pointer;
            background: #15181b;
            color: #f2f2f2;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.5px;
        }

        .terminal-danger-button {
            border: 1px solid rgba(230, 83, 72, 0.45);
            border-radius: 5px;
            padding: 9px 12px;
            cursor: pointer;
            background: rgba(230, 83, 72, 0.09);
            color: #ff8179;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.5px;
        }

        .terminal-message {
            margin-bottom: 15px;
            padding: 10px 12px;
            border-radius: 4px;
            font-size: 11px;
            display: none;
        }

        .terminal-message.success {
            display: block;
            color: #9ee176;
            background: rgba(117, 207, 69, 0.08);
            border: 1px solid rgba(117, 207, 69, 0.25);
        }

        .terminal-message.error {
            display: block;
            color: #ff8179;
            background: rgba(227, 77, 67, 0.08);
            border: 1px solid rgba(227, 77, 67, 0.25);
        }

        .admin-nav-link {
            color: #e8ad34 !important;
        }

        .account-user-button {
            cursor: pointer;
        }

        .admin-image-preview {
            width: 100%;
            max-height: 220px;
            object-fit: contain;
            margin-top: 10px;
            display: none;
            background: #090b0c;
            border: 1px solid #292d31;
            border-radius: 5px;
        }

        .admin-toolbar {
            display: flex;
            justify-content: flex-end;
            flex-wrap: wrap;
            gap: 10px;
            margin-bottom: 18px;
        }

        .admin-toolbar .terminal-gold-button {
            width: auto;
        }

        .admin-products-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .admin-product-row {
            display: grid;
            grid-template-columns: 70px minmax(0, 1fr) auto;
            gap: 14px;
            align-items: center;
            padding: 12px;
            border: 1px solid #292d31;
            border-radius: 6px;
            background: #0b0d0f;
        }

        .admin-product-thumb {
            width: 70px;
            height: 70px;
            border-radius: 5px;
            overflow: hidden;
            background: #111315;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #e8ad34;
            font-size: 22px;
        }

        .admin-product-thumb img {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }

        .admin-product-info h3 {
            margin: 0 0 6px;
            color: #f3f3f3;
            font-size: 13px;
        }

        .admin-product-meta {
            color: #aeb3b7;
            font-size: 10px;
            line-height: 1.7;
        }

        .admin-product-actions {
            display: flex;
            gap: 8px;
        }

        .admin-customers-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .admin-customer-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 16px;
            align-items: center;
            padding: 15px;
            border: 1px solid #292d31;
            border-radius: 6px;
            background: #0b0d0f;
        }

        .admin-customer-row.inactive {
            opacity: 0.65;
        }

        .admin-customer-info h3 {
            margin: 0 0 6px;
            color: #f3f3f3;
            font-size: 13px;
        }

        .admin-customer-meta {
            color: #aeb3b7;
            font-size: 10px;
            line-height: 1.7;
        }

        .admin-customer-actions {
            display: flex;
            flex-wrap: wrap;
            justify-content: flex-end;
            gap: 7px;
        }

        .admin-customer-badges {
            display: flex;
            flex-wrap: wrap;
            gap: 7px;
            margin-top: 9px;
        }

        .admin-customer-badge {
            padding: 4px 7px;
            border: 1px solid #34383c;
            border-radius: 20px;
            color: #c5c8cb;
            font-size: 8px;
            font-weight: 800;
            letter-spacing: 0.4px;
        }

        .admin-customer-badge.admin {
            border-color: rgba(232, 173, 52, 0.4);
            color: #e8ad34;
        }

        .admin-customer-badge.active {
            border-color: rgba(117, 207, 69, 0.35);
            color: #9ee176;
        }

        .admin-customer-badge.inactive {
            border-color: rgba(227, 77, 67, 0.35);
            color: #ff8179;
        }

        .admin-customer-search {
            flex: 1;
            min-width: 220px;
            border: 1px solid #34383c;
            border-radius: 5px;
            background: #111315;
            color: #f3f3f3;
            padding: 11px 12px;
        }

        .admin-empty-state {
            padding: 26px;
            text-align: center;
            color: #aeb3b7;
            border: 1px dashed #34383c;
            border-radius: 6px;
        }

        .product-detail-layout {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            gap: 24px;
        }

        .product-detail-image {
            height: 320px;
            margin: 0;
        }

        .product-detail-copy {
            display: flex;
            flex-direction: column;
            justify-content: center;
        }

        .product-detail-copy > p {
            color: #c5c8cb;
            line-height: 1.7;
            font-size: 13px;
        }

        .product-detail-meta {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            margin: 18px 0;
            padding: 14px 0;
            border-top: 1px solid #292d31;
            border-bottom: 1px solid #292d31;
        }

        .product-detail-meta strong {
            color: #e8ad34;
            font-size: 23px;
        }

        .product-detail-meta span {
            color: #9da2a7;
            font-size: 11px;
        }

        .product-quantity-group input {
            max-width: 120px;
        }

        .cart-items-list,
        .orders-list,
        .deals-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .cart-item-row,
        .order-card,
        .deal-row {
            border: 1px solid #292d31;
            border-radius: 6px;
            background: #0b0d0f;
            padding: 14px;
        }

        .cart-item-row {
            display: grid;
            grid-template-columns: 70px minmax(0, 1fr) auto;
            gap: 14px;
            align-items: center;
        }

        .cart-item-thumb {
            width: 70px;
            height: 70px;
            border-radius: 5px;
            overflow: hidden;
            background: #111315;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #e8ad34;
            font-size: 22px;
        }

        .cart-item-thumb img {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }

        .cart-item-info h3,
        .order-card h3,
        .deal-row h3 {
            margin: 0 0 6px;
            color: #f3f3f3;
            font-size: 13px;
        }

        .cart-item-info p,
        .order-card p,
        .deal-row p {
            margin: 3px 0;
            color: #aeb3b7;
            font-size: 10px;
        }

        .cart-item-actions {
            display: flex;
            align-items: center;
            gap: 7px;
        }

        .cart-quantity-button {
            width: 32px;
            height: 32px;
            border: 1px solid #3d4247;
            border-radius: 4px;
            background: #15181b;
            color: #f3f3f3;
            cursor: pointer;
        }

        .cart-quantity {
            min-width: 28px;
            text-align: center;
            color: #f3f3f3;
            font-weight: 700;
        }

        .cart-summary {
            margin-top: 20px;
            padding-top: 18px;
            border-top: 1px solid #292d31;
        }

        .cart-total-line {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 14px;
            color: #f3f3f3;
        }

        .cart-total-line strong {
            color: #e8ad34;
            font-size: 22px;
        }

        .order-card-header,
        .deal-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
        }

        .order-status {
            display: inline-flex;
            padding: 5px 8px;
            border-radius: 999px;
            background: rgba(232, 173, 52, 0.1);
            color: #e8ad34;
            font-size: 9px;
            font-weight: 800;
            text-transform: uppercase;
        }

        .order-items-detail {
            margin-top: 14px;
            border-top: 1px solid #292d31;
            padding-top: 12px;
        }

        .order-item-line {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            color: #c5c8cb;
            font-size: 11px;
            padding: 6px 0;
        }

        .terminal-content-section {
            padding: 70px 6%;
            background: #0b0d0f;
            border-top: 1px solid #22272b;
        }

        .about-layout,
        .contact-layout {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            gap: 40px;
            max-width: 1180px;
            margin: 0 auto;
        }

        .about-copy h2,
        .contact-copy h2 {
            color: #f3f3f3;
            font-size: clamp(30px, 5vw, 54px);
            line-height: 1;
            margin: 12px 0 22px;
        }

        .about-copy > p:not(.eyebrow),
        .contact-copy > p:not(.eyebrow) {
            color: #aeb3b7;
            line-height: 1.8;
            font-size: 13px;
        }

        .about-values {
            display: grid;
            gap: 12px;
        }

        .about-values article {
            padding: 20px;
            border: 1px solid #292d31;
            border-radius: 6px;
            background: #111315;
        }

        .about-values strong {
            color: #e8ad34;
            font-size: 11px;
        }

        .about-values h4 {
            color: #f3f3f3;
            margin: 8px 0;
            font-size: 13px;
        }

        .about-values p,
        .contact-note span {
            color: #9da2a7;
            font-size: 11px;
            line-height: 1.6;
        }

        .contact-form {
            padding: 24px;
            border: 1px solid #292d31;
            border-radius: 7px;
            background: #111315;
        }

        .contact-note {
            display: flex;
            flex-direction: column;
            gap: 5px;
            margin-top: 24px;
        }

        .contact-note strong {
            color: #e8ad34;
            font-size: 10px;
            letter-spacing: 1px;
        }

        .terminal-toast {
            position: fixed;
            right: 24px;
            bottom: 24px;
            z-index: 10050;
            max-width: min(360px, calc(100vw - 48px));
            padding: 13px 15px;
            border-radius: 6px;
            background: #111315;
            border: 1px solid #34383c;
            color: #f3f3f3;
            font-size: 11px;
            box-shadow: 0 15px 40px rgba(0, 0, 0, 0.4);
        }

        .terminal-toast.success {
            border-color: rgba(117, 207, 69, 0.4);
        }

        .terminal-toast.error {
            border-color: rgba(227, 77, 67, 0.55);
        }


        .admin-toolbar { gap: 10px; flex-wrap: wrap; }
        .admin-orders-list { display: flex; flex-direction: column; gap: 12px; }
        .admin-order-row { padding: 16px; border: 1px solid #292d31; border-radius: 6px; background: #0b0d0f; }
        .admin-order-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
        .admin-order-customer h3 { margin: 0 0 6px; color: #f3f3f3; font-size: 13px; }
        .admin-order-customer p, .admin-order-meta { margin: 3px 0; color: #aeb3b7; font-size: 10px; line-height: 1.6; }
        .admin-order-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        .admin-order-status-select { min-width: 125px; border: 1px solid #3d4247; border-radius: 5px; background: #111315; color: #f3f3f3; padding: 9px 10px; font-family: inherit; font-size: 10px; font-weight: 700; text-transform: uppercase; }
        .admin-order-items { margin-top: 13px; padding-top: 11px; border-top: 1px solid #292d31; }
        .admin-order-item-line { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; color: #c5c8cb; font-size: 10px; }
        .admin-summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 18px; }
        .admin-summary-card { padding: 13px; border: 1px solid #292d31; border-radius: 6px; background: #0b0d0f; }
        .admin-summary-card span { display: block; color: #9da2a7; font-size: 9px; letter-spacing: 0.7px; text-transform: uppercase; }
        .admin-summary-card strong { display: block; margin-top: 6px; color: #e8ad34; font-size: 18px; }


        .checkout-shell {
            display: grid;
            grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.8fr);
            gap: 22px;
        }

        .checkout-progress {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            margin-bottom: 20px;
        }

        .checkout-step-pill {
            padding: 10px 8px;
            border: 1px solid #2c3135;
            border-radius: 5px;
            background: #0b0d0f;
            color: #71777d;
            font-size: 9px;
            font-weight: 800;
            letter-spacing: 0.7px;
            text-align: center;
        }

        .checkout-step-pill.active {
            border-color: #d69d31;
            color: #e8ad34;
            background: rgba(232, 173, 52, 0.07);
        }

        .checkout-step-pill.done {
            border-color: rgba(117, 207, 69, 0.35);
            color: #9ee176;
        }

        .checkout-panel,
        .checkout-summary-card {
            border: 1px solid #292d31;
            border-radius: 7px;
            background: #0b0d0f;
            padding: 18px;
        }

        .checkout-panel h3,
        .checkout-summary-card h3 {
            margin: 0 0 15px;
            color: #f3f3f3;
            font-size: 13px;
            letter-spacing: 0.5px;
        }

        .checkout-summary-card {
            position: sticky;
            top: 12px;
            height: fit-content;
        }

        .checkout-summary-line {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 7px 0;
            color: #aeb3b7;
            font-size: 10px;
        }

        .checkout-summary-line.total {
            margin-top: 10px;
            padding-top: 13px;
            border-top: 1px solid #292d31;
            color: #f3f3f3;
            font-size: 12px;
        }

        .checkout-summary-line.total strong {
            color: #e8ad34;
            font-size: 20px;
        }

        .checkout-order-item {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            padding: 8px 0;
            border-bottom: 1px solid #202428;
            color: #c5c8cb;
            font-size: 10px;
        }

        .checkout-order-item:last-child {
            border-bottom: none;
        }

        .checkout-choice-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
        }

        .checkout-choice {
            border: 1px solid #34383c;
            border-radius: 6px;
            background: #111315;
            color: #f3f3f3;
            padding: 14px;
            cursor: pointer;
            text-align: left;
        }

        .checkout-choice.active {
            border-color: #d69d31;
            background: rgba(232, 173, 52, 0.08);
        }

        .checkout-choice strong {
            display: block;
            color: #f3f3f3;
            font-size: 11px;
            margin-bottom: 5px;
        }

        .checkout-choice span {
            color: #9da2a7;
            font-size: 9px;
            line-height: 1.5;
        }

        .checkout-payment-icon {
            display: inline-flex;
            width: 30px;
            height: 22px;
            align-items: center;
            justify-content: center;
            margin-bottom: 8px;
            border: 1px solid #3a3f43;
            border-radius: 4px;
            color: #e8ad34;
            font-size: 9px;
            font-weight: 800;
        }

        .payment-brand {
            min-width: 76px;
            min-height: 34px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 7px;
            padding: 5px 9px;
            background: #f7f7f7;
            color: #090909;
            font-size: 14px;
            font-weight: 900;
            letter-spacing: -0.3px;
        }

        .payment-brand.mbway { color: #111; }
        .payment-brand.mbway .mb { color: #e52335; }
        .payment-brand.mbway .way { color: #111; }
        .payment-brand.card { letter-spacing: 1px; color: #bd7e12; }

        .checkout-actions {
            display: flex;
            gap: 10px;
            margin-top: 18px;
        }

        .checkout-actions .terminal-secondary-button,
        .checkout-actions .terminal-gold-button {
            flex: 1;
        }

        .checkout-security-note {
            margin-top: 12px;
            padding: 11px 12px;
            border: 1px solid #292d31;
            border-radius: 5px;
            background: #0a0c0e;
            color: #8f969c;
            font-size: 9px;
            line-height: 1.6;
        }

        .checkout-security-note strong {
            color: #e8ad34;
        }

        .checkout-review-block {
            margin-bottom: 14px;
            padding: 13px;
            border: 1px solid #292d31;
            border-radius: 6px;
            background: #111315;
        }

        .checkout-review-block strong {
            display: block;
            margin-bottom: 6px;
            color: #e8ad34;
            font-size: 10px;
            letter-spacing: 0.5px;
        }

        .checkout-review-block p {
            margin: 2px 0;
            color: #c5c8cb;
            font-size: 10px;
            line-height: 1.5;
        }

        .checkout-card-minirow {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }

        .catalog-controls { display:flex; gap:10px; flex-wrap:wrap; margin:0 0 22px; }
        .catalog-controls input,.catalog-controls select,.catalog-controls button { min-height:40px; padding:9px 12px; border:1px solid #34383c; border-radius:5px; background:#0b0d0f; color:#f4f4f4; }
        .catalog-controls button { color:#e8ad34; cursor:pointer; }
        .product-badge { position:absolute; z-index:2; top:14px; left:12px; padding:5px 8px; background:#e8ad34; color:#080808; border-radius:3px; font-size:8px; font-weight:900; letter-spacing:.7px; }
        .product-rating { margin-top:8px; color:#d7b45b; font-size:9px; }
        .experience-section,.journey-banner { width:min(1180px,calc(100% - 40px)); margin:30px auto; }
        .journey-banner { display:grid; grid-template-columns:1fr auto; align-items:center; gap:30px; padding:34px; border:1px solid #40341c; background:linear-gradient(120deg,#0d0f10,#17130c); border-radius:8px; }
        .journey-banner h2 { margin:4px 0 8px; color:white; letter-spacing:1px; }
        .journey-banner p { color:#aeb3b7; }
        .journey-banner .primary-button { border:0; cursor:pointer; }
        .ask-terminal-button { position:fixed; z-index:100; right:22px; bottom:22px; padding:13px 17px; border:1px solid #e8ad34; border-radius:30px; background:#0b0d0f; color:#e8ad34; font-weight:800; box-shadow:0 8px 30px #000; cursor:pointer; }
        .frequent-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-top:12px; }
        .frequent-product { border:1px solid #30343a; background:#0b0d0f; color:#eee; padding:10px; border-radius:5px; cursor:pointer; }
        .frequent-product .product-image-wrapper { height:90px; }
        .frequent-product span,.frequent-product strong { display:block; margin-top:5px; }
        .bundle-row img { width:150px; height:110px; object-fit:cover; border-radius:5px; }
        .tracking-timeline { display:grid; grid-template-columns:repeat(3,1fr); margin-bottom:22px; }
        .tracking-step { text-align:center; color:#777; border-top:2px solid #333; padding-top:12px; }
        .tracking-step span { display:block; margin:-25px auto 8px; width:24px; line-height:24px; border-radius:50%; background:#333; }
        .tracking-step.complete { color:#e8ad34; border-color:#e8ad34; }.tracking-step.complete span { background:#e8ad34;color:#111; }
        .rewards-card { padding:30px; background:linear-gradient(135deg,#19140b,#08090a); border:1px solid #684d1e; border-radius:9px; }
        .rewards-card strong { display:block; color:#e8ad34; font-size:32px; margin:14px 0; }.rewards-progress { height:9px;background:#272727;border-radius:9px;overflow:hidden}.rewards-progress i { display:block;height:100%;background:#e8ad34; }
        .analytics-bars div { display:grid;grid-template-columns:90px 1fr 30px;gap:8px;align-items:center;margin:8px 0}.analytics-bars i{height:7px;background:#e8ad34;border-radius:8px}

        @media (max-width: 760px) {

            .checkout-shell,
            .checkout-choice-grid,
            .checkout-card-minirow {
                grid-template-columns: 1fr;
            }

            .checkout-summary-card {
                position: static;
            }

            .checkout-progress {
                grid-template-columns: repeat(2, 1fr);
            }


            .terminal-form-row,
            .product-detail-layout,
            .about-layout,
            .contact-layout {
                grid-template-columns: 1fr;
            }

            .admin-product-row,
            .cart-item-row {
                grid-template-columns: 55px 1fr;
            }

            .admin-product-actions,
            .cart-item-actions {
                grid-column: 1 / -1;
            }

            .admin-product-thumb,
            .cart-item-thumb {
                width: 55px;
                height: 55px;
            }

            .product-detail-image {
                height: 240px;
            }

            .order-card-header,
            .deal-row {
                align-items: flex-start;
                flex-direction: column;
            }
            .journey-banner { grid-template-columns:1fr; }.frequent-grid { grid-template-columns:1fr; }.ask-terminal-button { right:12px;bottom:12px; }
        }
    `;

    document.head.appendChild(style);
}

function createModal(title, subtitle, bodyHtml) {
    const overlay = document.createElement("div");
    overlay.className = "terminal-modal-overlay";
    overlay.innerHTML = `
        <div class="terminal-modal">
            <div class="terminal-modal-header">
                <div>
                    <h2>${escapeHtml(title)}</h2>
                    <p>${escapeHtml(subtitle)}</p>
                </div>
                <button class="terminal-modal-close" type="button">×</button>
            </div>
            <div class="terminal-modal-body">
                ${bodyHtml}
            </div>
        </div>
    `;

    overlay.querySelector(".terminal-modal-close").addEventListener("click", () => {
        overlay.remove();
    });

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
            overlay.remove();
        }
    });

    document.body.appendChild(overlay);
    return overlay;
}

function addModalBack(overlay, onBack, label = "BACK") {
    const body = overlay.querySelector(".terminal-modal-body");
    if (!body || typeof onBack !== "function") return;
    const row = document.createElement("div");
    row.className = "terminal-modal-back-row";
    row.innerHTML = `<button class="terminal-secondary-button terminal-modal-back" type="button">← ${escapeHtml(label)}</button>`;
    row.querySelector(".terminal-modal-back").addEventListener("click", () => {
        overlay.remove();
        onBack();
    });
    body.prepend(row);
}

document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const overlays = document.querySelectorAll(".terminal-modal-overlay");
    const latest = overlays[overlays.length - 1];
    if (latest) latest.remove();
});

function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `terminal-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 2800);
}

async function loginUser(email, password) {
    const body = new URLSearchParams();
    body.append("username", email);
    body.append("password", password);

    const response = await fetch("/users/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: body.toString()
    });

    const data = await readResponseData(response);

    if (!response.ok) {
        throw new Error(getErrorMessage(data, "Login failed"));
    }

    saveToken(data.access_token);
    await loadCurrentUser();
    await loadWishlistState();
    renderProducts();
    await updateCartCount();
}

async function registerUser(userData) {
    const response = await fetch("/users/", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(userData)
    });

    const data = await readResponseData(response);

    if (!response.ok) {
        throw new Error(getErrorMessage(data, "Account creation failed"));
    }

    return data;
}

function openLoginModal() {
    const existing = document.querySelector(".terminal-modal-overlay");
    if (existing) {
        existing.remove();
    }

    const overlay = createModal(
        "SIGN IN",
        "TERMINAL ONE ACCOUNT",
        `
            <div id="login-message" class="terminal-message"></div>
            <form id="login-form">
                <div class="terminal-form-group">
                    <label>EMAIL</label>
                    <input id="login-email" type="email" autocomplete="username" required>
                </div>
                <div class="terminal-form-group">
                    <label>PASSWORD</label>
                    <input id="login-password" type="password" autocomplete="current-password" required>
                </div>
                <button class="terminal-gold-button" type="submit">SIGN IN</button>
                <button id="open-register-button" class="terminal-secondary-button" type="button" style="width:100%; margin-top:10px;">
                    CREATE A NEW ACCOUNT
                </button>
                <button id="forgot-password-button" class="terminal-secondary-button" type="button" style="width:100%; margin-top:10px;">
                    FORGOT PASSWORD?
                </button>
            </form>
        `
    );

    const form = overlay.querySelector("#login-form");
    const message = overlay.querySelector("#login-message");
    const registerButton = overlay.querySelector("#open-register-button");
    const forgotButton = overlay.querySelector("#forgot-password-button");

    registerButton.addEventListener("click", () => {
        overlay.remove();
        openRegisterModal();
    });

    forgotButton.addEventListener("click", () => {
        overlay.remove();
        openForgotPasswordModal();
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        message.className = "terminal-message";

        const email = overlay.querySelector("#login-email").value.trim();
        const password = overlay.querySelector("#login-password").value;
        const button = form.querySelector("button[type='submit']");

        button.disabled = true;
        button.textContent = "SIGNING IN...";

        try {
            await loginUser(email, password);
            overlay.remove();
            showToast("Signed in successfully.", "success");
        } catch (error) {
            message.textContent = error.message;
            message.className = "terminal-message error";
        } finally {
            button.disabled = false;
            button.textContent = "SIGN IN";
        }
    });
}

function openRegisterModal() {
    const existing = document.querySelector(".terminal-modal-overlay");
    if (existing) {
        existing.remove();
    }

    const overlay = createModal(
        "CREATE ACCOUNT",
        "JOIN TERMINAL ONE",
        `
            <div id="register-message" class="terminal-message"></div>
            <form id="register-form">
                <div class="terminal-form-group">
                    <label>FULL NAME</label>
                    <input id="register-name" type="text" autocomplete="name" minlength="2" required>
                </div>

                <div class="terminal-form-group">
                    <label>EMAIL</label>
                    <input id="register-email" type="email" autocomplete="email" required>
                </div>

                <div class="terminal-form-row">
                    <div class="terminal-form-group">
                        <label>PASSWORD</label>
                        <input id="register-password" type="password" autocomplete="new-password" minlength="6" required>
                    </div>
                    <div class="terminal-form-group">
                        <label>CONFIRM PASSWORD</label>
                        <input id="register-password-confirm" type="password" autocomplete="new-password" minlength="6" required>
                    </div>
                </div>

                <div class="terminal-form-row">
                    <div class="terminal-form-group">
                        <label>PHONE</label>
                        <input id="register-phone" type="tel" autocomplete="tel">
                    </div>
                    <div class="terminal-form-group">
                        <label>COUNTRY</label>
                        <input id="register-country" type="text" autocomplete="country-name">
                    </div>
                </div>

                <div class="terminal-form-group">
                    <label>ADDRESS</label>
                    <input id="register-address" type="text" autocomplete="street-address">
                </div>

                <button class="terminal-gold-button" type="submit">CREATE ACCOUNT</button>
                <button id="back-to-login-button" class="terminal-secondary-button" type="button" style="width:100%; margin-top:10px;">
                    BACK TO SIGN IN
                </button>
            </form>
        `
    );

    const form = overlay.querySelector("#register-form");
    const message = overlay.querySelector("#register-message");
    const backButton = overlay.querySelector("#back-to-login-button");

    backButton.addEventListener("click", () => {
        overlay.remove();
        openLoginModal();
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        message.textContent = "";
        message.className = "terminal-message";

        const name = overlay.querySelector("#register-name").value.trim();
        const email = overlay.querySelector("#register-email").value.trim().toLowerCase();
        const password = overlay.querySelector("#register-password").value;
        const passwordConfirm = overlay.querySelector("#register-password-confirm").value;
        const phone = overlay.querySelector("#register-phone").value.trim();
        const country = overlay.querySelector("#register-country").value.trim();
        const address = overlay.querySelector("#register-address").value.trim();

        if (name.length < 2) {
            message.textContent = "Please enter your full name.";
            message.className = "terminal-message error";
            return;
        }

        if (password.length < 6) {
            message.textContent = "Password must contain at least 6 characters.";
            message.className = "terminal-message error";
            return;
        }

        if (password !== passwordConfirm) {
            message.textContent = "Passwords do not match.";
            message.className = "terminal-message error";
            return;
        }

        const button = form.querySelector("button[type='submit']");
        button.disabled = true;
        button.textContent = "CREATING ACCOUNT...";

        try {
            await registerUser({
                name,
                email,
                password,
                phone: phone || null,
                country: country || null,
                address: address || null
            });

            await loginUser(email, password);
            overlay.remove();
            showToast("Account created successfully. Welcome to Terminal One!", "success");
        } catch (error) {
            message.textContent = error.message;
            message.className = "terminal-message error";
        } finally {
            button.disabled = false;
            button.textContent = "CREATE ACCOUNT";
        }
    });
}

async function loadCurrentUser() {
    const token = getToken();

    if (!token) {
        currentUser = null;
        updateAccountInterface();
        return;
    }

    try {
        const response = await fetch("/users/me", {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error("Session expired");
        }

        currentUser = await response.json();
        updateAccountInterface();
    } catch (error) {
        clearToken();
        updateAccountInterface();
        if (cartCount) cartCount.textContent = "0";
    }
}

function logoutUser() {
    clearToken();
    updateAccountInterface();
    renderProducts();
    if (cartCount) cartCount.textContent = "0";
    showToast("Signed out.", "success");
}

function updateAccountInterface() {
    if (accountText) {
        accountText.classList.add("account-user-button");

        if (currentUser) {
            accountText.textContent = currentUser.name;
            accountText.onclick = openAccountModal;
        } else {
            accountText.textContent = "Sign In / Register";
            accountText.onclick = openLoginModal;
        }
    }

    const existingAdminLink = document.getElementById("admin-nav-link");

    if (currentUser && currentUser.is_admin) {
        if (!existingAdminLink) {
            const adminLink = document.createElement("a");
            adminLink.href = "#";
            adminLink.id = "admin-nav-link";
            adminLink.className = "admin-nav-link";
            adminLink.textContent = "ADMIN";
            adminLink.addEventListener("click", (event) => {
                event.preventDefault();
                openAdminManagementModal();
            });
            mainNav.appendChild(adminLink);
        }
    } else if (existingAdminLink) {
        existingAdminLink.remove();
    }
}

async function getCart() {
    const token = getToken();
    if (!token) {
        throw new Error("Please sign in to view your cart.");
    }

    const response = await fetch("/cart/", {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const data = await readResponseData(response);

    if (response.status === 401) {
        clearToken();
        updateAccountInterface();
        throw new Error("Your session has expired. Please sign in again.");
    }

    if (!response.ok) {
        throw new Error(getErrorMessage(data, "Could not load cart"));
    }

    if (!data.items) {
        return {
            items: [],
            total: 0
        };
    }

    return data;
}

async function addToCart(productId, quantity = 1) {
    if (!requireLogin()) {
        throw new Error("Please sign in before adding products to your cart.");
    }

    const token = getToken();
    const url = `/cart/items?product_id=${encodeURIComponent(productId)}&quantity=${encodeURIComponent(quantity)}`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const data = await readResponseData(response);

    if (response.status === 401) {
        clearToken();
        updateAccountInterface();
        openLoginModal();
        throw new Error("Your session has expired. Please sign in again.");
    }

    if (!response.ok) {
        throw new Error(getErrorMessage(data, "Could not add product to cart"));
    }

    await updateCartCount();
    return data;
}

async function increaseCartItem(itemId) {
    return mutateCart(`/cart/items/${itemId}/increase`, "PATCH");
}

async function decreaseCartItem(itemId) {
    return mutateCart(`/cart/items/${itemId}/decrease`, "PATCH");
}

async function deleteCartItem(itemId) {
    return mutateCart(`/cart/items/${itemId}`, "DELETE");
}

async function mutateCart(url, method) {
    const token = getToken();
    if (!token) {
        throw new Error("Please sign in again.");
    }

    const response = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const data = await readResponseData(response);

    if (response.status === 401) {
        clearToken();
        updateAccountInterface();
        throw new Error("Your session has expired. Please sign in again.");
    }

    if (!response.ok) {
        throw new Error(getErrorMessage(data, "Could not update cart"));
    }

    await updateCartCount();
    return data;
}

async function updateCartCount() {
    if (!cartCount) return;

    if (!getToken()) {
        cartCount.textContent = "0";
        return;
    }

    try {
        const cart = await getCart();
        const totalQuantity = (cart.items || []).reduce(
            (sum, item) => sum + Number(item.quantity || 0),
            0
        );
        cartCount.textContent = String(totalQuantity);
    } catch (error) {
        console.error("Cart count error:", error);
        cartCount.textContent = "0";
    }
}

function getCartItemThumbnail(productId, productName) {
    const product = allProducts.find(
        (item) => Number(item.id) === Number(productId)
    );

    if (product && product.image_url) {
        return `
            <div class="cart-item-thumb">
                <img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(productName)}">
            </div>
        `;
    }

    return `<div class="cart-item-thumb">✈</div>`;
}

async function openCartModal() {
    if (!requireLogin()) return;

    let cart;
    try {
        cart = await getCart();
    } catch (error) {
        showToast(error.message, "error");
        return;
    }

    const items = cart.items || [];
    const bodyHtml = items.length === 0
        ? `<div class="admin-empty-state">Your cart is empty.</div>`
        : `
            <div id="cart-message" class="terminal-message"></div>
            <div class="cart-items-list">
                ${items.map((item) => `
                    <div class="cart-item-row" data-item-id="${item.item_id}">
                        ${getCartItemThumbnail(item.product_id, item.product_name)}
                        <div class="cart-item-info">
                            <h3>${escapeHtml(item.product_name)}</h3>
                            <p>${formatMoney(item.price)} each</p>
                            <p>Subtotal: ${formatMoney(item.subtotal)}</p>
                        </div>
                        <div class="cart-item-actions">
                            <button class="cart-quantity-button cart-decrease" type="button">−</button>
                            <span class="cart-quantity">${Number(item.quantity)}</span>
                            <button class="cart-quantity-button cart-increase" type="button">+</button>
                            <button class="terminal-danger-button cart-remove" type="button">REMOVE</button>
                        </div>
                    </div>
                `).join("")}
            </div>
            <div class="cart-summary">
                <div class="cart-total-line">
                    <span>TOTAL</span>
                    <strong>${formatMoney(cart.total)}</strong>
                </div>
                <button id="checkout-button" class="terminal-gold-button" type="button">
                    CHECKOUT
                </button>
            </div>
        `;

    const overlay = createModal("YOUR CART", "TERMINAL ONE CHECKOUT", bodyHtml);
    const message = overlay.querySelector("#cart-message");

    overlay.querySelectorAll(".cart-item-row").forEach((row) => {
        const itemId = Number(row.dataset.itemId);
        const decreaseButton = row.querySelector(".cart-decrease");
        const increaseButton = row.querySelector(".cart-increase");
        const removeButton = row.querySelector(".cart-remove");

        decreaseButton.addEventListener("click", async () => {
            await handleCartAction(
                decreaseButton,
                () => decreaseCartItem(itemId),
                overlay,
                message
            );
        });

        increaseButton.addEventListener("click", async () => {
            await handleCartAction(
                increaseButton,
                () => increaseCartItem(itemId),
                overlay,
                message
            );
        });

        removeButton.addEventListener("click", async () => {
            await handleCartAction(
                removeButton,
                () => deleteCartItem(itemId),
                overlay,
                message
            );
        });
    });

    const checkoutButton = overlay.querySelector("#checkout-button");
    checkoutButton?.addEventListener("click", async () => {
        checkoutButton.disabled = true;
        checkoutButton.textContent = "OPENING CHECKOUT...";

        try {
            overlay.remove();
            await openCheckoutFlow(cart);
        } catch (error) {
            showToast(error.message, "error");
        }
    });
}

async function handleCartAction(button, action, overlay, message) {
    button.disabled = true;

    try {
        await action();
        overlay.remove();
        await openCartModal();
    } catch (error) {
        button.disabled = false;
        if (message) {
            message.textContent = error.message;
            message.className = "terminal-message error";
        }
    }
}


function getCheckoutInitialState(cart) {
    const user = currentUser || {};

    return {
        step: 1,
        cart,
        couponCode: "",
        couponDiscount: 0,
        couponApplied: false,
        shipping: {
            fullName: user.name || "",
            email: user.email || "",
            phone: user.phone || "",
            address: user.address || "",
            city: "",
            postalCode: "",
            country: user.country || "Portugal"
        },
        delivery: {
            method: "standard",
            label: "Standard Delivery",
            detail: "3–5 business days",
            fee: 0,
            airport: "",
            terminal: "",
            flight: "",
            pickupTime: ""
        },
        payment: {
            method: "card",
            label: "Credit / Debit Card",
            cardholder: user.name || "",
            cardNumber: "",
            expiry: "",
            cvv: ""
        }
    };
}

function getCheckoutSummaryHtml(state) {
    const items = state.cart.items || [];
    const shippingFee = Number(state.delivery.fee || 0);
    const discount = Number(state.couponDiscount || 0);
    const grandTotal = Math.max(0, Number(state.cart.total || 0) - discount + shippingFee);

    return `
        <div class="checkout-summary-card">
            <h3>ORDER SUMMARY</h3>
            <div>
                ${items.map((item) => `
                    <div class="checkout-order-item">
                        <span>${escapeHtml(item.product_name)} × ${Number(item.quantity)}</span>
                        <strong>${formatMoney(item.subtotal)}</strong>
                    </div>
                `).join("")}
            </div>
            <div class="checkout-summary-line">
                <span>Subtotal</span>
                <strong>${formatMoney(state.cart.total)}</strong>
            </div>
            <div class="checkout-summary-line">
                <span>Delivery</span>
                <strong>${shippingFee === 0 ? "FREE" : formatMoney(shippingFee)}</strong>
            </div>
            ${discount > 0 ? `<div class="checkout-summary-line"><span>Discount (${escapeHtml(state.couponCode)})</span><strong>-${formatMoney(discount)}</strong></div>` : ""}
            <div class="checkout-summary-line total">
                <span>Total</span>
                <strong>${formatMoney(grandTotal)}</strong>
            </div>
            <div class="checkout-security-note">
                <strong>DEMO CHECKOUT</strong><br>
                Payment details are only used for this project interface and are not charged or stored.
            </div>
        </div>
    `;
}

function getCheckoutProgressHtml(step) {
    const labels = ["SHIPPING", "DELIVERY", "PAYMENT", "REVIEW"];

    return `
        <div class="checkout-progress">
            ${labels.map((label, index) => {
                const number = index + 1;
                const className = number < step ? "done" : number === step ? "active" : "";
                return `<div class="checkout-step-pill ${className}">${number}. ${label}</div>`;
            }).join("")}
        </div>
    `;
}

function checkoutShippingStepHtml(state) {
    const s = state.shipping;

    return `
        <div class="checkout-panel">
            <h3>SHIPPING DETAILS</h3>
            <div class="terminal-form-row">
                <div class="terminal-form-group">
                    <label>FULL NAME</label>
                    <input id="checkout-full-name" type="text" value="${escapeHtml(s.fullName)}" required>
                </div>
                <div class="terminal-form-group">
                    <label>EMAIL</label>
                    <input id="checkout-email" type="email" value="${escapeHtml(s.email)}" required>
                </div>
            </div>

            <div class="terminal-form-group">
                <label>PHONE</label>
                <input id="checkout-phone" type="tel" value="${escapeHtml(s.phone)}" placeholder="+351 ...">
            </div>

            <div class="terminal-form-group">
                <label>ADDRESS</label>
                <input id="checkout-address" type="text" value="${escapeHtml(s.address)}" placeholder="Street, number, apartment" required>
            </div>

            <div class="terminal-form-row">
                <div class="terminal-form-group">
                    <label>CITY</label>
                    <input id="checkout-city" type="text" value="${escapeHtml(s.city)}" required>
                </div>
                <div class="terminal-form-group">
                    <label>POSTAL CODE</label>
                    <input id="checkout-postal-code" type="text" value="${escapeHtml(s.postalCode)}" placeholder="0000-000" required>
                </div>
            </div>

            <div class="terminal-form-group">
                <label>COUNTRY</label>
                <input id="checkout-country" type="text" value="${escapeHtml(s.country)}" required>
            </div>

            <div id="checkout-step-message" class="terminal-message"></div>

            <div class="checkout-actions">
                <button id="checkout-back-cart" class="terminal-secondary-button" type="button">BACK TO CART</button>
                <button id="checkout-next" class="terminal-gold-button" type="button">CONTINUE TO DELIVERY</button>
            </div>
        </div>
    `;
}

function checkoutDeliveryStepHtml(state) {
    const method = state.delivery.method;

    return `
        <div class="checkout-panel">
            <h3>DELIVERY METHOD</h3>
            <div class="checkout-choice-grid">
                <button class="checkout-choice ${method === "standard" ? "active" : ""}" data-delivery="standard" type="button">
                    <strong>STANDARD DELIVERY</strong>
                    <span>3–5 business days<br>Free</span>
                </button>
                <button class="checkout-choice ${method === "express" ? "active" : ""}" data-delivery="express" type="button">
                    <strong>EXPRESS DELIVERY</strong>
                    <span>1–2 business days<br>€9.90</span>
                </button>
                <button class="checkout-choice ${method === "airport_pickup" ? "active" : ""}" data-delivery="airport_pickup" type="button">
                    <strong>AIRPORT PICKUP</strong><span>Meet us at your terminal<br>Free · Demo service</span>
                </button>
            </div>
            ${method === "airport_pickup" ? `<div class="checkout-review-block"><div class="terminal-form-row"><div class="terminal-form-group"><label>AIRPORT</label><input id="pickup-airport" value="${escapeHtml(state.delivery.airport)}" placeholder="Lisbon (LIS)"></div><div class="terminal-form-group"><label>TERMINAL</label><input id="pickup-terminal" value="${escapeHtml(state.delivery.terminal)}" placeholder="Terminal 1"></div></div><div class="terminal-form-row"><div class="terminal-form-group"><label>FLIGHT</label><input id="pickup-flight" value="${escapeHtml(state.delivery.flight)}" placeholder="TP1234"></div><div class="terminal-form-group"><label>PICKUP TIME</label><input id="pickup-time" type="datetime-local" value="${escapeHtml(state.delivery.pickupTime)}"></div></div></div>` : ""}

            <div class="checkout-security-note">
                Delivery dates are simulated for the Terminal One project checkout.
            </div>

            <div class="checkout-actions">
                <button id="checkout-prev" class="terminal-secondary-button" type="button">BACK</button>
                <button id="checkout-next" class="terminal-gold-button" type="button">CONTINUE TO PAYMENT</button>
            </div>
        </div>
    `;
}

function checkoutPaymentFieldsHtml(state) {
    const payment = state.payment;

    if (payment.method === "card") {
        return `
            <div style="margin-top:16px;">
                <div class="terminal-form-group">
                    <label>CARDHOLDER NAME</label>
                    <input id="checkout-cardholder" type="text" value="${escapeHtml(payment.cardholder)}" required>
                </div>

                <div class="terminal-form-group">
                    <label>CARD NUMBER</label>
                    <input id="checkout-card-number" type="text" inputmode="numeric" maxlength="19" placeholder="4242 4242 4242 4242" value="${escapeHtml(payment.cardNumber)}">
                </div>

                <div class="checkout-card-minirow">
                    <div class="terminal-form-group">
                        <label>EXPIRY</label>
                        <input id="checkout-expiry" type="text" maxlength="5" placeholder="MM/YY" value="${escapeHtml(payment.expiry)}">
                    </div>
                    <div class="terminal-form-group">
                        <label>CVV</label>
                        <input id="checkout-cvv" type="password" inputmode="numeric" maxlength="4" placeholder="123" value="${escapeHtml(payment.cvv)}">
                    </div>
                </div>
            </div>
        `;
    }

    if (payment.method === "paypal") {
        return `
            <div class="checkout-security-note">
                You would be redirected to PayPal to authorize the payment. No real PayPal transaction is performed.
            </div>
        `;
    }

    if (payment.method === "mbway") {
        return `
            <div class="terminal-form-group" style="margin-top:16px;">
                <label>MB WAY PHONE NUMBER</label>
                <input id="checkout-mbway-phone" type="tel" placeholder="+351 9xx xxx xxx" value="${escapeHtml(state.shipping.phone)}">
            </div>
        `;
    }

    return `
        <div class="checkout-security-note">
            Apple Pay confirmation is simulated in this project checkout.
        </div>
    `;
}

function checkoutPaymentStepHtml(state) {
    const method = state.payment.method;

    return `
        <div class="checkout-panel">
            <h3>PROMO CODE</h3>
            <div class="checkout-review-block">
                <div class="terminal-form-row" style="align-items:end;">
                    <div class="terminal-form-group" style="margin-bottom:0;">
                        <label>COUPON CODE</label>
                        <input id="checkout-coupon-code" type="text" value="${escapeHtml(state.couponCode || "")}" placeholder="Example: JOURNEY10" ${state.couponApplied ? "disabled" : ""}>
                    </div>
                    <button id="${state.couponApplied ? "checkout-remove-coupon" : "checkout-apply-coupon"}" class="${state.couponApplied ? "terminal-danger-button" : "terminal-secondary-button"}" type="button" style="height:42px;">
                        ${state.couponApplied ? "REMOVE" : "APPLY"}
                    </button>
                </div>
                ${state.couponApplied ? `<p style="margin-top:10px;"><strong>${escapeHtml(state.couponCode)}</strong> applied · You save ${formatMoney(state.couponDiscount)}</p>` : ""}
            </div>

            <h3>PAYMENT METHOD</h3>

            <div class="checkout-choice-grid">
                <button class="checkout-choice ${method === "card" ? "active" : ""}" data-payment="card" type="button">
                    <strong>CREDIT / DEBIT CARD</strong>
                    <span>Visa, Mastercard and compatible cards</span>
                </button>

                <button class="checkout-choice ${method === "paypal" ? "active" : ""}" data-payment="paypal" type="button">
                    <strong>PAYPAL</strong>
                    <span>Simulated PayPal authorization</span>
                </button>

                <button class="checkout-choice ${method === "mbway" ? "active" : ""}" data-payment="mbway" type="button">
                    <strong>MB WAY</strong>
                    <span>Mobile payment simulation</span>
                </button>

                <button class="checkout-choice ${method === "applepay" ? "active" : ""}" data-payment="applepay" type="button">
                    <strong>APPLE PAY</strong>
                    <span>Simulated wallet checkout</span>
                </button>
            </div>

            <div id="checkout-payment-fields">
                ${checkoutPaymentFieldsHtml(state)}
            </div>

            <div id="checkout-step-message" class="terminal-message"></div>

            <div class="checkout-security-note">
                <strong>NO REAL PAYMENT</strong><br>
                This is a portfolio/demo checkout. No payment request is sent and no card data is stored.
            </div>

            <div class="checkout-actions">
                <button id="checkout-prev" class="terminal-secondary-button" type="button">BACK</button>
                <button id="checkout-next" class="terminal-gold-button" type="button">REVIEW ORDER</button>
            </div>
        </div>
    `;
}

function checkoutReviewStepHtml(state) {
    const paymentLabel = {
        card: "Credit / Debit Card",
        paypal: "PayPal",
        mbway: "MB WAY",
        applepay: "Apple Pay"
    }[state.payment.method] || state.payment.label;

    return `
        <div class="checkout-panel">
            <h3>REVIEW YOUR ORDER</h3>

            <div class="checkout-review-block">
                <strong>SHIP TO</strong>
                <p>${escapeHtml(state.shipping.fullName)}</p>
                <p>${escapeHtml(state.shipping.address)}</p>
                <p>${escapeHtml(state.shipping.postalCode)} ${escapeHtml(state.shipping.city)}</p>
                <p>${escapeHtml(state.shipping.country)}</p>
            </div>

            <div class="checkout-review-block">
                <strong>DELIVERY</strong>
                <p>${escapeHtml(state.delivery.label)}</p>
                <p>${escapeHtml(state.delivery.detail)}</p>
            </div>

            <div class="checkout-review-block">
                <strong>PAYMENT</strong>
                <p>${escapeHtml(paymentLabel)}</p>
                <p>Demo authorization only — no real charge.</p>
            </div>

            ${state.couponApplied ? `<div class="checkout-review-block"><strong>PROMO CODE</strong><p>${escapeHtml(state.couponCode)} · -${formatMoney(state.couponDiscount)}</p></div>` : ""}

            <div id="checkout-step-message" class="terminal-message"></div>

            <div class="checkout-actions">
                <button id="checkout-prev" class="terminal-secondary-button" type="button">BACK</button>
                <button id="checkout-place-order" class="terminal-gold-button" type="button">PLACE ORDER</button>
            </div>
        </div>
    `;
}

function collectShippingStep(state, overlay) {
    const fullName = overlay.querySelector("#checkout-full-name")?.value.trim() || "";
    const email = overlay.querySelector("#checkout-email")?.value.trim() || "";
    const phone = overlay.querySelector("#checkout-phone")?.value.trim() || "";
    const address = overlay.querySelector("#checkout-address")?.value.trim() || "";
    const city = overlay.querySelector("#checkout-city")?.value.trim() || "";
    const postalCode = overlay.querySelector("#checkout-postal-code")?.value.trim() || "";
    const country = overlay.querySelector("#checkout-country")?.value.trim() || "";

    if (!fullName || !email || !address || !city || !postalCode || !country) {
        throw new Error("Please complete all required shipping fields.");
    }

    state.shipping = { fullName, email, phone, address, city, postalCode, country };
}

function collectPaymentStep(state, overlay) {
    if (state.payment.method !== "card") return;

    const cardholder = overlay.querySelector("#checkout-cardholder")?.value.trim() || "";
    const cardNumber = overlay.querySelector("#checkout-card-number")?.value.replace(/\s+/g, "") || "";
    const expiry = overlay.querySelector("#checkout-expiry")?.value.trim() || "";
    const cvv = overlay.querySelector("#checkout-cvv")?.value.trim() || "";

    if (!cardholder || cardNumber.length < 12 || !/^\d+$/.test(cardNumber)) {
        throw new Error("Please enter a valid demo card number.");
    }

    if (!/^\d{2}\/\d{2}$/.test(expiry)) {
        throw new Error("Please use MM/YY for the expiry date.");
    }

    if (!/^\d{3,4}$/.test(cvv)) {
        throw new Error("Please enter a 3 or 4 digit CVV.");
    }

    state.payment.cardholder = cardholder;
    state.payment.cardNumber = cardNumber;
    state.payment.expiry = expiry;
    state.payment.cvv = cvv;
}

function wireCheckoutStep(state, overlay) {
    const message = overlay.querySelector("#checkout-step-message");

    overlay.querySelector("#checkout-back-cart")?.addEventListener("click", async () => {
        overlay.remove();
        await openCartModal();
    });

    overlay.querySelector("#checkout-prev")?.addEventListener("click", async () => {
        state.step = Math.max(1, state.step - 1);
        overlay.remove();
        await renderCheckoutStep(state);
    });

    overlay.querySelectorAll("[data-delivery]").forEach((button) => {
        button.addEventListener("click", () => {
            const method = button.dataset.delivery;
            state.delivery = method === "airport_pickup" ? {
                    ...state.delivery, method: "airport_pickup", label: "Airport Pickup", detail: "Meet at the selected terminal", fee: 0
                } : method === "express"
                ? {
                    method: "express",
                    label: "Express Delivery",
                    detail: "1–2 business days",
                    fee: 9.90
                }
                : {
                    method: "standard",
                    label: "Standard Delivery",
                    detail: "3–5 business days",
                    fee: 0
                };

            overlay.remove();
            renderCheckoutStep(state);
        });
    });

    overlay.querySelectorAll("[data-payment]").forEach((button) => {
        button.addEventListener("click", () => {
            state.payment.method = button.dataset.payment;
            overlay.remove();
            renderCheckoutStep(state);
        });
    });

    overlay.querySelector("#checkout-apply-coupon")?.addEventListener("click", async () => {
        const input = overlay.querySelector("#checkout-coupon-code");
        const code = input?.value.trim().toUpperCase() || "";
        if (!code) {
            message.textContent = "Enter a coupon code.";
            message.className = "terminal-message error";
            return;
        }
        try {
            const validation = await apiRequest("/coupons/validate", {
                method: "POST",
                body: JSON.stringify({ code, subtotal: Number(state.cart.total || 0) })
            });
            state.couponCode = validation.code;
            state.couponDiscount = Number(validation.discount || 0);
            state.couponApplied = true;
            overlay.remove();
            await renderCheckoutStep(state);
            showToast("Coupon applied.", "success");
        } catch (error) {
            message.textContent = error.message;
            message.className = "terminal-message error";
        }
    });

    overlay.querySelector("#checkout-remove-coupon")?.addEventListener("click", async () => {
        state.couponCode = "";
        state.couponDiscount = 0;
        state.couponApplied = false;
        overlay.remove();
        await renderCheckoutStep(state);
        showToast("Coupon removed.", "success");
    });

    overlay.querySelector("#checkout-next")?.addEventListener("click", async () => {
        try {
            if (state.step === 1) {
                collectShippingStep(state, overlay);
            }
            if (state.step === 2 && state.delivery.method === "airport_pickup") {
                state.delivery.airport = overlay.querySelector("#pickup-airport")?.value.trim() || "";
                state.delivery.terminal = overlay.querySelector("#pickup-terminal")?.value.trim() || "";
                state.delivery.flight = overlay.querySelector("#pickup-flight")?.value.trim() || "";
                state.delivery.pickupTime = overlay.querySelector("#pickup-time")?.value || "";
                if (!state.delivery.airport || !state.delivery.terminal || !state.delivery.flight || !state.delivery.pickupTime) throw new Error("Please complete all airport pickup details.");
                state.delivery.detail = `${state.delivery.airport} · ${state.delivery.terminal} · ${state.delivery.flight} · ${state.delivery.pickupTime}`;
            }

            if (state.step === 3) {
                collectPaymentStep(state, overlay);
            }

            state.step = Math.min(4, state.step + 1);
            overlay.remove();
            await renderCheckoutStep(state);
        } catch (error) {
            if (message) {
                message.textContent = error.message;
                message.className = "terminal-message error";
            } else {
                showToast(error.message, "error");
            }
        }
    });

    overlay.querySelector("#checkout-place-order")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = "PROCESSING ORDER...";

        try {
            const result = await checkoutCart(state);
            overlay.remove();
            await loadProducts();
            await updateCartCount();

            if (result.order) {
                result.order.demo_payment_method = state.payment.method;
                result.order.demo_delivery_method = state.delivery.method;
            }

            openCheckoutSuccessModal(result);
        } catch (error) {
            button.disabled = false;
            button.textContent = "PLACE ORDER";
            if (message) {
                message.textContent = error.message;
                message.className = "terminal-message error";
            } else {
                showToast(error.message, "error");
            }
        }
    });
}

async function renderCheckoutStep(state) {
    const stepBody = state.step === 1
        ? checkoutShippingStepHtml(state)
        : state.step === 2
            ? checkoutDeliveryStepHtml(state)
            : state.step === 3
                ? checkoutPaymentStepHtml(state)
                : checkoutReviewStepHtml(state);

    const overlay = createModal(
        "SECURE CHECKOUT",
        "TERMINAL ONE · DEMO PAYMENT",
        `
            ${getCheckoutProgressHtml(state.step)}
            <div class="checkout-shell">
                <div>${stepBody}</div>
                <div>${getCheckoutSummaryHtml(state)}</div>
            </div>
        `
    );

    wireCheckoutStep(state, overlay);
    return overlay;
}

async function openCheckoutFlow(cart) {
    if (!cart || !(cart.items || []).length) {
        throw new Error("Your cart is empty.");
    }

    const state = getCheckoutInitialState(cart);
    await renderCheckoutStep(state);
}

async function checkoutCart(state = null) {
    const token = getToken();
    if (!token) {
        throw new Error("Please sign in again.");
    }

    const response = await fetch("/orders/checkout", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            coupon_code: state?.couponCode || null,
            shipping_address: state ? `${state.shipping.fullName}, ${state.shipping.address}, ${state.shipping.postalCode} ${state.shipping.city}, ${state.shipping.country}` : null,
            payment_method: state?.payment?.method || "demo_card",
            delivery_type: state?.delivery?.method === "airport_pickup" ? "airport_pickup" : "home_delivery",
            pickup_details: state?.delivery?.method === "airport_pickup" ? state.delivery.detail : null
        })
    });

    const data = await readResponseData(response);

    if (response.status === 401) {
        clearToken();
        updateAccountInterface();
        throw new Error("Your session has expired. Please sign in again.");
    }

    if (!response.ok) {
        throw new Error(getErrorMessage(data, "Checkout failed"));
    }

    return data;
}

function openCheckoutSuccessModal(result) {
    const order = result.order || {};
    const items = result.items || [];

    createModal(
        "ORDER CONFIRMED",
        "YOUR JOURNEY CONTINUES",
        `
            <div class="terminal-message success" style="display:block;">
                ${escapeHtml(result.message || "Order created successfully")}
            </div>
            <div class="order-card">
                <div class="order-card-header">
                    <div>
                        <h3>ORDER #${escapeHtml(order.id)}</h3>
                        <p>${formatDate(order.created_at)}</p>
                    </div>
                    <span class="order-status">${escapeHtml(order.status || "pending")}</span>
                </div>
                <div class="order-items-detail">
                    ${items.map((item) => `
                        <div class="order-item-line">
                            <span>${escapeHtml(item.product_name)} × ${Number(item.quantity)}</span>
                            <strong>${formatMoney(item.subtotal)}</strong>
                        </div>
                    `).join("")}
                </div>
                <div class="cart-total-line" style="margin-top:16px; margin-bottom:0;">
                    <span>TOTAL</span>
                    <strong>${formatMoney(order.total)}</strong>
                </div>
            </div>
        `
    );
}

async function getOrders() {
    const token = getToken();
    if (!token) {
        throw new Error("Please sign in to view your orders.");
    }

    const response = await fetch("/orders/", {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const data = await readResponseData(response);

    if (response.status === 401) {
        clearToken();
        updateAccountInterface();
        throw new Error("Your session has expired. Please sign in again.");
    }

    if (!response.ok) {
        throw new Error(getErrorMessage(data, "Could not load orders"));
    }

    return data;
}

async function getOrderDetails(orderId) {
    const token = getToken();
    const response = await fetch(`/orders/${orderId}`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const data = await readResponseData(response);

    if (!response.ok) {
        throw new Error(getErrorMessage(data, "Could not load order details"));
    }

    return data;
}

async function openMyOrdersModal() {
    if (!requireLogin()) return;

    let orders;
    try {
        orders = await getOrders();
    } catch (error) {
        showToast(error.message, "error");
        return;
    }

    const overlay = createModal(
        "MY ORDERS",
        "TERMINAL ONE ACCOUNT",
        orders.length === 0
            ? `<div class="admin-empty-state">You have no orders yet.</div>`
            : `
                <div class="orders-list">
                    ${orders.map((order) => `
                        <div class="order-card" data-order-id="${order.id}">
                            <div class="order-card-header">
                                <div>
                                    <h3>ORDER #${order.id}</h3>
                                    <p>${formatDate(order.created_at)}</p>
                                    <p>Total: ${formatMoney(order.total)}</p>
                                </div>
                                <div>
                                    <span class="order-status">${escapeHtml(order.status)}</span>
                                    <button class="terminal-secondary-button order-details-button" type="button" style="margin-left:8px;">
                                        VIEW DETAILS
                                    </button>
                                    ${["pending", "paid"].includes(String(order.status).toLowerCase()) ? `
                                        <button class="terminal-danger-button order-cancel-button" type="button" style="margin-left:8px;">CANCEL</button>
                                    ` : ""}
                                </div>
                            </div>
                        </div>
                    `).join("")}
                </div>
            `
    );
    addModalBack(overlay, openAccountModal, "MY ACCOUNT");

    overlay.querySelectorAll(".order-details-button").forEach((button) => {
        button.addEventListener("click", async () => {
            const card = button.closest(".order-card");
            const orderId = Number(card.dataset.orderId);
            button.disabled = true;
            button.textContent = "LOADING...";

            try {
                const order = await getOrderDetails(orderId);
                overlay.remove();
                openOrderDetailsModal(order);
            } catch (error) {
                button.disabled = false;
                button.textContent = "VIEW DETAILS";
                showToast(error.message, "error");
            }
        });
    });

    overlay.querySelectorAll(".order-cancel-button").forEach((button) => {
        button.addEventListener("click", async () => {
            const card = button.closest(".order-card");
            const orderId = Number(card.dataset.orderId);
            if (!window.confirm(`Cancel order #${orderId}? Stock will be restored.`)) return;
            button.disabled = true;
            try {
                await apiRequest(`/orders/${orderId}/cancel`, { method: "PATCH" });
                overlay.remove();
                await loadProducts();
                showToast(`Order #${orderId} cancelled.`, "success");
                openMyOrdersModal();
            } catch (error) {
                button.disabled = false;
                showToast(error.message, "error");
            }
        });
    });
}

function openOrderDetailsModal(order) {
    const canReview = String(order.status || "").toLowerCase() === "delivered";
    const statuses = ["paid", "shipped", "delivered"];
    const currentStatusIndex = statuses.indexOf(String(order.status || "").toLowerCase());
    const overlay = createModal(
        `ORDER #${order.id}`,
        "ORDER DETAILS",
        `
            <div class="order-card">
                <div class="tracking-timeline">${statuses.map((status, index) => `<div class="tracking-step ${index <= currentStatusIndex ? "complete" : ""}"><span>${index + 1}</span><strong>${status.toUpperCase()}</strong></div>`).join("")}</div>
                <div class="order-card-header">
                    <div>
                        <h3>ORDER #${order.id}</h3>
                        <p>${formatDate(order.created_at)}</p>
                        <p>Total: ${formatMoney(order.total)}</p>
                        ${order.discount_total ? `<p>Discount: -${formatMoney(order.discount_total)}</p>` : ""}
                        ${order.tracking_code ? `<p>Tracking: ${escapeHtml(order.tracking_code)}</p>` : ""}
                        ${order.delivery_type === "airport_pickup" ? `<p>Airport pickup: ${escapeHtml(order.pickup_details)}</p>` : ""}
                        ${order.bundle_name ? `<p>Travel Kit: ${escapeHtml(order.bundle_name)} · saved ${formatMoney(order.bundle_discount)}</p>` : ""}
                    </div>
                    <span class="order-status">${escapeHtml(order.status)}</span>
                </div>
                <div class="order-items-detail">
                    ${(order.items || []).map((item) => `
                        <div class="order-item-line">
                            <span>${escapeHtml(item.product_name)} × ${Number(item.quantity)}</span>
                            <strong>${formatMoney(item.subtotal)}</strong>
                        </div>
                        ${canReview ? `
                            <form class="delivered-review-form checkout-review-block" data-product-id="${Number(item.product_id)}" style="margin-top:12px;">
                                <strong>REVIEW ${escapeHtml(item.product_name)}</strong>
                                <div class="terminal-form-group" style="margin-top:10px;">
                                    <label>RATING</label>
                                    <select class="delivered-review-rating">
                                        <option value="5">5 - Excellent</option><option value="4">4 - Very good</option>
                                        <option value="3">3 - Good</option><option value="2">2 - Fair</option><option value="1">1 - Poor</option>
                                    </select>
                                </div>
                                <div class="terminal-form-group"><label>COMMENT</label><textarea class="delivered-review-comment" required></textarea></div>
                                <button class="terminal-gold-button" type="submit">REVIEW PRODUCT</button>
                            </form>
                        ` : ""}
                    `).join("")}
                </div>
            </div>
            <button id="back-to-orders" class="terminal-secondary-button" type="button" style="margin-top:16px;">
                BACK TO MY ORDERS
            </button>
        `
    );

    overlay.querySelector("#back-to-orders")?.addEventListener("click", () => {
        overlay.remove();
        openMyOrdersModal();
    });

    overlay.querySelectorAll(".delivered-review-form").forEach((form) => {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const button = form.querySelector("button[type='submit']");
            button.disabled = true;
            button.textContent = "SAVING REVIEW...";
            try {
                await apiRequest(`/products/${Number(form.dataset.productId)}/reviews`, {
                    method: "POST",
                    body: JSON.stringify({
                        rating: Number(form.querySelector(".delivered-review-rating").value),
                        comment: form.querySelector(".delivered-review-comment").value.trim()
                    })
                });
                form.innerHTML = `<div class="terminal-message success" style="display:block;">Review saved · VERIFIED PURCHASE</div>`;
                showToast("Review saved.", "success");
            } catch (error) {
                button.disabled = false;
                button.textContent = "REVIEW PRODUCT";
                showToast(error.message, "error");
            }
        });
    });
}

async function openBestDealsModal() {
    let deals = [];
    try { deals = await apiRequest("/bundles"); } catch (error) { showToast(error.message, "error"); return; }

    const overlay = createModal(
        "BEST DEALS",
        "SMART PICKS FOR YOUR NEXT JOURNEY",
        deals.length === 0
            ? `<div class="admin-empty-state">No products available right now.</div>`
            : `
                <div class="deals-list">
                    ${deals.map((product) => `
                        <div class="deal-row bundle-row" data-bundle-id="${product.id}">
                            <img src="${escapeHtml(product.image_url || "")}" alt="${escapeHtml(product.name)}">
                            <div>
                                <h3>${escapeHtml(product.name)}</h3>
                                <p>${escapeHtml(product.description)}</p>
                                <p>${product.products.map((item) => escapeHtml(item.name)).join(" · ")}</p>
                            </div>
                            <div style="text-align:right; min-width:130px;">
                                <del>${formatMoney(product.original_price)}</del>
                                <strong style="display:block; color:#e8ad34; margin-bottom:8px;">
                                    ${formatMoney(product.bundle_price)}
                                </strong>
                                <small>SAVE ${formatMoney(product.you_save)}</small>
                                <button class="terminal-secondary-button deal-add-button" type="button" ${product.available ? "" : "disabled"}>
                                    ${product.available ? "ADD KIT TO CART" : "UNAVAILABLE"}
                                </button>
                            </div>
                        </div>
                    `).join("")}
                </div>
            `
    );

    overlay.querySelectorAll(".deal-add-button").forEach((button) => {
        button.addEventListener("click", async () => {
            const row = button.closest(".deal-row");
            const bundleId = Number(row.dataset.bundleId);
            button.disabled = true;
            const originalText = button.textContent;
            button.textContent = "ADDING...";

            try {
                if (!requireLogin()) return;
                await apiRequest(`/bundles/${bundleId}/add-to-cart`, { method: "POST" });
                await updateCartCount();
                button.textContent = "ADDED";
            } catch (error) {
                button.disabled = false;
                button.textContent = originalText;
                showToast(error.message, "error");
            }
        });
    });
}

function openJourneyBuilder() {
    const overlay = createModal("BUILD YOUR JOURNEY", "PERSONAL TRAVEL CURATION", `<form id="journey-form"><div class="terminal-form-row"><div class="terminal-form-group"><label>TRIP TYPE</label><select id="journey-type"><option value="leisure">Leisure</option><option value="business">Business</option></select></div><div class="terminal-form-group"><label>FLIGHT</label><select id="journey-flight"><option value="long_haul">Long-haul</option><option value="short_haul">Short-haul</option></select></div></div><div class="terminal-form-row"><div class="terminal-form-group"><label>CLIMATE</label><select id="journey-climate"><option value="mild">Mild</option><option value="cold">Cold</option><option value="warm">Warm</option></select></div><div class="terminal-form-group"><label>DURATION</label><select id="journey-duration"><option value="weekend">Weekend</option><option value="one_week">One week</option><option value="extended">Extended</option></select></div></div><div class="terminal-form-group"><label>ANYTHING ELSE?</label><input id="journey-query" placeholder="Example: I need to sleep and work on the flight"></div><button class="terminal-gold-button" type="submit">BUILD MY RECOMMENDATIONS</button></form><div id="journey-results"></div>`);
    overlay.querySelector("#journey-form").onsubmit = async (event) => {
        event.preventDefault();
        const products = await apiRequest("/journey/recommendations", { method: "POST", body: JSON.stringify({ trip_type: overlay.querySelector("#journey-type").value, flight: overlay.querySelector("#journey-flight").value, climate: overlay.querySelector("#journey-climate").value, duration: overlay.querySelector("#journey-duration").value, query: overlay.querySelector("#journey-query").value }) });
        overlay.querySelector("#journey-results").innerHTML = `<div class="journey-results">${products.map((item) => `<div class="order-card"><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.reason)}</p><strong>${formatMoney(item.price)}</strong><button class="terminal-secondary-button journey-add" data-id="${item.id}" type="button">ADD TO CART</button></div>`).join("")}</div>`;
        overlay.querySelectorAll(".journey-add").forEach((button) => button.onclick = async () => { await addToCart(Number(button.dataset.id), 1); button.textContent = "ADDED"; });
    };
}

function openTerminalAssistant() {
    const overlay = createModal("ASK TERMINAL ONE", "YOUR TRAVEL SHOPPING ASSISTANT", `<div class="checkout-review-block"><strong>TRY ASKING</strong><p>“What should I pack for a long flight?”</p><p>“I need technology for a business trip.”</p><p>“Show me a compact weekend setup.”</p></div><form id="assistant-form"><div class="terminal-form-group"><label>YOUR JOURNEY</label><input id="assistant-query" required placeholder="How can we help you travel better?"></div><button class="terminal-gold-button">GET RECOMMENDATIONS</button></form><div id="assistant-results"></div>`);
    overlay.querySelector("#assistant-form").onsubmit = async (event) => { event.preventDefault(); const items = await apiRequest("/journey/recommendations", { method: "POST", body: JSON.stringify({ query: overlay.querySelector("#assistant-query").value }) }); overlay.querySelector("#assistant-results").innerHTML = `<div class="checkout-review-block"><strong>TERMINAL ONE RECOMMENDS</strong>${items.map((item) => `<p><button class="assistant-product terminal-secondary-button" data-id="${item.id}">${escapeHtml(item.name)} · ${formatMoney(item.price)}</button></p>`).join("") || "<p>Try adding details about flight length, climate or trip type.</p>"}</div>`; overlay.querySelectorAll(".assistant-product").forEach((button) => button.onclick = () => { const p = allProducts.find((x) => Number(x.id) === Number(button.dataset.id)); if (p) { overlay.remove(); openProductModal(p); } }); };
}

async function loadCategoriesForAdmin(selectElement) {
    const response = await fetch("/categories");
    if (!response.ok) {
        throw new Error("Could not load categories");
    }

    const categories = await response.json();
    selectElement.innerHTML = `<option value="">Select a category</option>`;

    categories.forEach((category) => {
        const option = document.createElement("option");
        option.value = category.id;
        option.textContent = category.name;
        selectElement.appendChild(option);
    });
}

async function uploadProductImage(file) {
    const token = getToken();
    const formData = new FormData();
    formData.append("image", file);

    const response = await fetch("/products/upload-image", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`
        },
        body: formData
    });

    const data = await readResponseData(response);

    if (response.status === 401) {
        clearToken();
        updateAccountInterface();
        throw new Error("Your session has expired. Please sign in again.");
    }

    if (!response.ok) {
        throw new Error(getErrorMessage(data, "Image upload failed"));
    }

    return data.image_url;
}

async function createProduct(productData) {
    const token = getToken();
    const response = await fetch("/products", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(productData)
    });

    const data = await readResponseData(response);

    if (!response.ok) {
        throw new Error(getErrorMessage(data, "Could not create product"));
    }

    return data;
}

async function updateProduct(productId, productData) {
    const token = getToken();
    const response = await fetch(`/products/${productId}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(productData)
    });

    const data = await readResponseData(response);

    if (!response.ok) {
        throw new Error(getErrorMessage(data, "Could not update product"));
    }

    return data;
}

async function deleteProduct(productId) {
    const token = getToken();
    const response = await fetch(`/products/${productId}`, {
        method: "DELETE",
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    if (!response.ok) {
        const data = await readResponseData(response);
        throw new Error(getErrorMessage(data, "Could not delete product"));
    }
}

async function getProductsForAdmin() {
    const response = await fetch("/products");
    if (!response.ok) {
        throw new Error("Could not load products");
    }
    return await response.json();
}

function getAdminProductThumbnail(product) {
    if (product.image_url) {
        return `
            <div class="admin-product-thumb">
                <img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}">
            </div>
        `;
    }

    return `<div class="admin-product-thumb">✈</div>`;
}


async function getAdminOrders() {
    const token = getToken();
    if (!token) throw new Error("Please sign in again.");

    const response = await fetch("/orders/admin/all", {
        headers: { Authorization: `Bearer ${token}` }
    });
    const data = await readResponseData(response);

    if (response.status === 401) {
        clearToken();
        updateAccountInterface();
        throw new Error("Your session has expired. Please sign in again.");
    }
    if (response.status === 403) throw new Error("Admin access required.");
    if (!response.ok) throw new Error(getErrorMessage(data, "Could not load admin orders"));
    return data;
}

async function getAdminOrderSummary() {
    const token = getToken();
    if (!token) throw new Error("Please sign in again.");

    const response = await fetch("/orders/admin/summary", {
        headers: { Authorization: `Bearer ${token}` }
    });
    const data = await readResponseData(response);
    if (!response.ok) throw new Error(getErrorMessage(data, "Could not load order summary"));
    return data;
}

async function updateAdminOrderStatus(orderId, status) {
    const token = getToken();
    if (!token) throw new Error("Please sign in again.");

    const response = await fetch(`/orders/${orderId}/status`, {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ status })
    });
    const data = await readResponseData(response);

    if (response.status === 401) {
        clearToken();
        updateAccountInterface();
        throw new Error("Your session has expired. Please sign in again.");
    }
    if (!response.ok) throw new Error(getErrorMessage(data, "Could not update order status"));
    return data;
}

function getAdminOrderItemsHtml(order) {
    const items = order.items || [];
    if (!items.length) return `<div class="admin-order-meta">No item details available.</div>`;

    return `
        <div class="admin-order-items">
            ${items.map((item) => `
                <div class="admin-order-item-line">
                    <span>${escapeHtml(item.product_name)} × ${Number(item.quantity)}</span>
                    <strong>${formatMoney(item.subtotal)}</strong>
                </div>
            `).join("")}
        </div>
    `;
}

function renderAdminOrderSummary(summary) {
    return `
        <div class="admin-summary-grid">
            <div class="admin-summary-card"><span>Total orders</span><strong>${Number(summary.total_orders || 0)}</strong></div>
            <div class="admin-summary-card"><span>Revenue</span><strong>${formatMoney(summary.total_revenue)}</strong></div>
            <div class="admin-summary-card"><span>Pending</span><strong>${Number(summary.pending_orders || 0)}</strong></div>
            <div class="admin-summary-card"><span>Paid</span><strong>${Number(summary.paid_orders || 0)}</strong></div>
            <div class="admin-summary-card"><span>Shipped</span><strong>${Number(summary.shipped_orders || 0)}</strong></div>
            <div class="admin-summary-card"><span>Delivered</span><strong>${Number(summary.delivered_orders || 0)}</strong></div>
        </div>
    `;
}

async function openAdminOrdersModal() {
    if (!currentUser || !currentUser.is_admin) {
        openLoginModal();
        return;
    }

    const overlay = createModal(
        "ORDER MANAGEMENT",
        "TERMINAL ONE ADMIN",
        `
            <div id="admin-orders-message" class="terminal-message"></div>
            <div class="admin-toolbar">
                <button id="admin-back-products-button" class="terminal-secondary-button" type="button">PRODUCT MANAGEMENT</button>
                <button id="admin-refresh-orders-button" class="terminal-gold-button" type="button">REFRESH ORDERS</button>
            </div>
            <div id="admin-order-summary"></div>
            <div id="admin-orders-list" class="admin-orders-list">
                <div class="admin-empty-state">Loading orders...</div>
            </div>
        `
    );
    addModalBack(overlay, openAdminManagementModal, "BACK TO ADMIN");

    const message = overlay.querySelector("#admin-orders-message");
    const ordersList = overlay.querySelector("#admin-orders-list");
    const summaryContainer = overlay.querySelector("#admin-order-summary");
    const backButton = overlay.querySelector("#admin-back-products-button");
    const refreshButton = overlay.querySelector("#admin-refresh-orders-button");

    backButton.addEventListener("click", () => {
        overlay.remove();
        openAdminManagementModal();
    });

    async function loadAdminOrdersView() {
        message.className = "terminal-message";
        ordersList.innerHTML = `<div class="admin-empty-state">Loading orders...</div>`;
        refreshButton.disabled = true;
        refreshButton.textContent = "LOADING...";

        try {
            const [orders, summary] = await Promise.all([getAdminOrders(), getAdminOrderSummary()]);
            summaryContainer.innerHTML = renderAdminOrderSummary(summary);
            ordersList.innerHTML = "";

            if (!orders.length) {
                ordersList.innerHTML = `<div class="admin-empty-state">No orders found.</div>`;
                return;
            }

            orders.forEach((order) => {
                const row = document.createElement("div");
                row.className = "admin-order-row";
                const customerName = order.customer_name || `User #${order.user_id}`;
                const customerEmail = order.customer_email || "Email unavailable";
                const status = String(order.status || "pending").toLowerCase();

                row.innerHTML = `
                    <div class="admin-order-top">
                        <div class="admin-order-customer">
                            <h3>ORDER #${Number(order.id)} · ${escapeHtml(customerName)}</h3>
                            <p>${escapeHtml(customerEmail)}</p>
                            <div class="admin-order-meta">${formatDate(order.created_at)} · ${formatMoney(order.total)}</div>
                        </div>
                        <div class="admin-order-actions">
                            <select class="admin-order-status-select" aria-label="Order status">
                                ${["pending", "paid", "shipped", "delivered", "cancelled"].map((option) => `
                                    <option value="${option}" ${option === status ? "selected" : ""}>${option.toUpperCase()}</option>
                                `).join("")}
                            </select>
                            <button class="terminal-gold-button admin-save-order-status" type="button" style="width:auto;">SAVE STATUS</button>
                        </div>
                    </div>
                    ${getAdminOrderItemsHtml(order)}
                `;

                const select = row.querySelector(".admin-order-status-select");
                const saveButton = row.querySelector(".admin-save-order-status");

                saveButton.addEventListener("click", async () => {
                    saveButton.disabled = true;
                    saveButton.textContent = "SAVING...";
                    try {
                        await updateAdminOrderStatus(order.id, select.value);
                        message.textContent = `Order #${order.id} updated to ${select.value.toUpperCase()}.`;
                        message.className = "terminal-message success";
                        showToast(`Order #${order.id} status updated.`, "success");
                        const freshSummary = await getAdminOrderSummary();
                        summaryContainer.innerHTML = renderAdminOrderSummary(freshSummary);
                    } catch (error) {
                        message.textContent = error.message;
                        message.className = "terminal-message error";
                    } finally {
                        saveButton.disabled = false;
                        saveButton.textContent = "SAVE STATUS";
                    }
                });

                ordersList.appendChild(row);
            });
        } catch (error) {
            ordersList.innerHTML = "";
            message.textContent = error.message;
            message.className = "terminal-message error";
        } finally {
            refreshButton.disabled = false;
            refreshButton.textContent = "REFRESH ORDERS";
        }
    }

    refreshButton.addEventListener("click", loadAdminOrdersView);
    await loadAdminOrdersView();
}

async function getAdminCustomers() {
    const token = getToken();
    if (!token) throw new Error("Please sign in again.");

    const response = await fetch("/users/", {
        headers: { Authorization: `Bearer ${token}` }
    });
    const data = await readResponseData(response);

    if (response.status === 401) {
        clearToken();
        updateAccountInterface();
        throw new Error("Your session has expired. Please sign in again.");
    }
    if (response.status === 403) throw new Error("Admin access required.");
    if (!response.ok) throw new Error(getErrorMessage(data, "Could not load customers"));
    return data;
}

async function updateAdminCustomer(customerId, customerData) {
    const token = getToken();
    if (!token) throw new Error("Please sign in again.");

    const response = await fetch(`/users/admin/${customerId}`, {
        method: "PUT",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(customerData)
    });
    const data = await readResponseData(response);
    if (!response.ok) throw new Error(getErrorMessage(data, "Could not update customer"));
    return data;
}

async function updateAdminCustomerActivation(customerId, isActive) {
    const token = getToken();
    if (!token) throw new Error("Please sign in again.");

    const response = await fetch(`/users/admin/${customerId}/activation`, {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ is_active: isActive })
    });
    const data = await readResponseData(response);
    if (!response.ok) throw new Error(getErrorMessage(data, "Could not update account status"));
    return data;
}

async function getAdminCustomerOrders(customerId) {
    const token = getToken();
    if (!token) throw new Error("Please sign in again.");

    const response = await fetch(`/users/admin/${customerId}/orders`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const data = await readResponseData(response);
    if (!response.ok) throw new Error(getErrorMessage(data, "Could not load customer orders"));
    return data;
}

function openAdminCustomerEditModal(customer) {
    const overlay = createModal(
        "EDIT CUSTOMER",
        "TERMINAL ONE ADMIN",
        `
            <div id="admin-customer-edit-message" class="terminal-message"></div>
            <form id="admin-customer-edit-form">
                <div class="terminal-form-group">
                    <label>FULL NAME</label>
                    <input id="admin-customer-name" type="text" value="${escapeHtml(customer.name)}" required>
                </div>
                <div class="terminal-form-group">
                    <label>EMAIL</label>
                    <input id="admin-customer-email" type="email" value="${escapeHtml(customer.email)}" required>
                </div>
                <div class="terminal-form-row">
                    <div class="terminal-form-group">
                        <label>PHONE</label>
                        <input id="admin-customer-phone" type="text" value="${escapeHtml(customer.phone || "")}">
                    </div>
                    <div class="terminal-form-group">
                        <label>COUNTRY</label>
                        <input id="admin-customer-country" type="text" value="${escapeHtml(customer.country || "")}">
                    </div>
                </div>
                <div class="terminal-form-group">
                    <label>ADDRESS</label>
                    <input id="admin-customer-address" type="text" value="${escapeHtml(customer.address || "")}">
                </div>
                <div class="terminal-form-group">
                    <label>ACCOUNT ROLE</label>
                    <select id="admin-customer-role">
                        <option value="customer" ${customer.is_admin ? "" : "selected"}>CUSTOMER</option>
                        <option value="admin" ${customer.is_admin ? "selected" : ""}>ADMIN</option>
                    </select>
                </div>
                <button class="terminal-gold-button" type="submit">SAVE CUSTOMER</button>
                <button id="admin-customer-edit-back" class="terminal-secondary-button" type="button" style="width:100%; margin-top:10px;">BACK TO CUSTOMERS</button>
            </form>
        `
    );

    const form = overlay.querySelector("#admin-customer-edit-form");
    const message = overlay.querySelector("#admin-customer-edit-message");

    overlay.querySelector("#admin-customer-edit-back").addEventListener("click", () => {
        overlay.remove();
        openAdminCustomersModal();
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = form.querySelector("button[type='submit']");
        button.disabled = true;
        button.textContent = "SAVING...";
        message.className = "terminal-message";

        try {
            const updated = await updateAdminCustomer(customer.id, {
                name: overlay.querySelector("#admin-customer-name").value.trim(),
                email: overlay.querySelector("#admin-customer-email").value.trim(),
                phone: overlay.querySelector("#admin-customer-phone").value.trim() || null,
                country: overlay.querySelector("#admin-customer-country").value.trim() || null,
                address: overlay.querySelector("#admin-customer-address").value.trim() || null,
                is_admin: overlay.querySelector("#admin-customer-role").value === "admin"
            });

            if (currentUser && updated.id === currentUser.id) {
                currentUser = { ...currentUser, ...updated };
                updateAccountInterface();
            }

            overlay.remove();
            showToast("Customer updated successfully.", "success");
            openAdminCustomersModal();
        } catch (error) {
            message.textContent = error.message;
            message.className = "terminal-message error";
        } finally {
            button.disabled = false;
            button.textContent = "SAVE CUSTOMER";
        }
    });
}

async function openAdminCustomerOrdersModal(customer) {
    const overlay = createModal(
        `CUSTOMER ORDERS`,
        `${customer.name} · TERMINAL ONE ADMIN`,
        `
            <div id="admin-customer-orders-message" class="terminal-message"></div>
            <div class="admin-toolbar">
                <button id="admin-customer-orders-back" class="terminal-secondary-button" type="button">BACK TO CUSTOMERS</button>
            </div>
            <div id="admin-customer-orders-list" class="admin-orders-list">
                <div class="admin-empty-state">Loading customer orders...</div>
            </div>
        `
    );

    overlay.querySelector("#admin-customer-orders-back").addEventListener("click", () => {
        overlay.remove();
        openAdminCustomersModal();
    });

    const list = overlay.querySelector("#admin-customer-orders-list");
    const message = overlay.querySelector("#admin-customer-orders-message");

    try {
        const data = await getAdminCustomerOrders(customer.id);
        list.innerHTML = "";

        if (!data.orders.length) {
            list.innerHTML = `<div class="admin-empty-state">This customer has no orders.</div>`;
            return;
        }

        data.orders.forEach((order) => {
            const row = document.createElement("div");
            row.className = "admin-order-row";
            row.innerHTML = `
                <div class="admin-order-top">
                    <div class="admin-order-customer">
                        <h3>ORDER #${Number(order.id)}</h3>
                        <div class="admin-order-meta">${formatDate(order.created_at)} · ${formatMoney(order.total)} · ${escapeHtml(String(order.status).toUpperCase())}</div>
                    </div>
                </div>
                ${getAdminOrderItemsHtml(order)}
            `;
            list.appendChild(row);
        });
    } catch (error) {
        list.innerHTML = "";
        message.textContent = error.message;
        message.className = "terminal-message error";
    }
}

async function openAdminCustomersModal() {
    if (!currentUser || !currentUser.is_admin) {
        openLoginModal();
        return;
    }

    const overlay = createModal(
        "CUSTOMER MANAGEMENT",
        "TERMINAL ONE ADMIN",
        `
            <div id="admin-customers-message" class="terminal-message"></div>
            <div class="admin-toolbar">
                <input id="admin-customer-search" class="admin-customer-search" type="search" placeholder="Search by name or email...">
                <button id="admin-customers-back" class="terminal-secondary-button" type="button">BACK TO ADMIN</button>
                <button id="admin-customers-refresh" class="terminal-gold-button" type="button">REFRESH CUSTOMERS</button>
            </div>
            <div id="admin-customers-list" class="admin-customers-list">
                <div class="admin-empty-state">Loading customers...</div>
            </div>
        `
    );
    addModalBack(overlay, openAdminManagementModal, "BACK TO ADMIN");

    const list = overlay.querySelector("#admin-customers-list");
    const message = overlay.querySelector("#admin-customers-message");
    const search = overlay.querySelector("#admin-customer-search");
    const refresh = overlay.querySelector("#admin-customers-refresh");
    let customers = [];

    overlay.querySelector("#admin-customers-back").addEventListener("click", () => {
        overlay.remove();
        openAdminManagementModal();
    });

    function renderCustomers() {
        const term = search.value.trim().toLowerCase();
        const filtered = customers.filter((customer) => {
            return String(customer.name || "").toLowerCase().includes(term) ||
                String(customer.email || "").toLowerCase().includes(term);
        });

        list.innerHTML = "";

        if (!filtered.length) {
            list.innerHTML = `<div class="admin-empty-state">No customers found.</div>`;
            return;
        }

        filtered.forEach((customer) => {
            const isActive = customer.is_active !== false;
            const row = document.createElement("div");
            row.className = `admin-customer-row ${isActive ? "" : "inactive"}`;
            row.innerHTML = `
                <div class="admin-customer-info">
                    <h3>${escapeHtml(customer.name)} · #${Number(customer.id)}</h3>
                    <div class="admin-customer-meta">
                        ${escapeHtml(customer.email)}<br>
                        ${escapeHtml(customer.phone || "No phone")} · ${escapeHtml(customer.country || "No country")}<br>
                        ${escapeHtml(customer.address || "No address")}<br>
                        Registered: ${formatDate(customer.created_at)} · Orders: ${Number(customer.total_orders || 0)} · Spent: ${formatMoney(customer.total_spent)}
                    </div>
                    <div class="admin-customer-badges">
                        <span class="admin-customer-badge ${customer.is_admin ? "admin" : ""}">${customer.is_admin ? "ADMIN" : "CUSTOMER"}</span>
                        <span class="admin-customer-badge ${isActive ? "active" : "inactive"}">${isActive ? "ACTIVE" : "INACTIVE"}</span>
                    </div>
                </div>
                <div class="admin-customer-actions">
                    <button class="terminal-secondary-button customer-orders-button" type="button">ORDERS</button>
                    <button class="terminal-secondary-button customer-edit-button" type="button">EDIT</button>
                    <button class="${isActive ? "terminal-danger-button" : "terminal-gold-button"} customer-status-button" type="button" style="width:auto;">${isActive ? "DEACTIVATE" : "ACTIVATE"}</button>
                </div>
            `;

            row.querySelector(".customer-orders-button").addEventListener("click", () => {
                overlay.remove();
                openAdminCustomerOrdersModal(customer);
            });

            row.querySelector(".customer-edit-button").addEventListener("click", () => {
                overlay.remove();
                openAdminCustomerEditModal(customer);
            });

            const statusButton = row.querySelector(".customer-status-button");
            statusButton.addEventListener("click", async () => {
                const action = isActive ? "deactivate" : "activate";
                const confirmed = window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${customer.name}?`);
                if (!confirmed) return;

                statusButton.disabled = true;
                statusButton.textContent = "SAVING...";

                try {
                    await updateAdminCustomerActivation(customer.id, !isActive);
                    showToast(`Customer ${action}d successfully.`, "success");
                    await loadCustomers();
                } catch (error) {
                    message.textContent = error.message;
                    message.className = "terminal-message error";
                    statusButton.disabled = false;
                    statusButton.textContent = isActive ? "DEACTIVATE" : "ACTIVATE";
                }
            });

            list.appendChild(row);
        });
    }

    async function loadCustomers() {
        message.className = "terminal-message";
        list.innerHTML = `<div class="admin-empty-state">Loading customers...</div>`;
        refresh.disabled = true;
        refresh.textContent = "LOADING...";

        try {
            customers = await getAdminCustomers();
            renderCustomers();
        } catch (error) {
            list.innerHTML = "";
            message.textContent = error.message;
            message.className = "terminal-message error";
        } finally {
            refresh.disabled = false;
            refresh.textContent = "REFRESH CUSTOMERS";
        }
    }

    search.addEventListener("input", renderCustomers);
    refresh.addEventListener("click", loadCustomers);
    await loadCustomers();
}

async function openAdminManagementModal() {
    if (!currentUser || !currentUser.is_admin) {
        openLoginModal();
        return;
    }

    const overlay = createModal(
        "PRODUCT MANAGEMENT",
        "TERMINAL ONE ADMIN",
        `
            <div id="admin-management-message" class="terminal-message"></div>
            <div class="admin-toolbar">
                <button id="admin-dashboard-button" class="terminal-secondary-button" type="button">
                    DASHBOARD
                </button>
                <button id="admin-manage-customers-button" class="terminal-secondary-button" type="button">
                    MANAGE CUSTOMERS
                </button>
                <button id="admin-manage-orders-button" class="terminal-secondary-button" type="button">
                    MANAGE ORDERS
                </button>
                <button id="admin-add-product-button" class="terminal-gold-button" type="button">
                    + ADD PRODUCT
                </button>
            </div>
            <div id="admin-products-list" class="admin-products-list">
                <div class="admin-empty-state">Loading products...</div>
            </div>
        `
    );
    addModalBack(overlay, () => document.getElementById("products")?.scrollIntoView({ behavior: "smooth" }), "STORE");

    const message = overlay.querySelector("#admin-management-message");
    const productsList = overlay.querySelector("#admin-products-list");
    const addButton = overlay.querySelector("#admin-add-product-button");
    const ordersButton = overlay.querySelector("#admin-manage-orders-button");
    const customersButton = overlay.querySelector("#admin-manage-customers-button");
    const dashboardButton = overlay.querySelector("#admin-dashboard-button");

    dashboardButton.addEventListener("click", () => {
        overlay.remove();
        openAdminDashboardModal();
    });

    customersButton.addEventListener("click", () => {
        overlay.remove();
        openAdminCustomersModal();
    });

    ordersButton.addEventListener("click", () => {
        overlay.remove();
        openAdminOrdersModal();
    });

    addButton.addEventListener("click", () => {
        overlay.remove();
        openAdminProductModal();
    });

    try {
        const products = await getProductsForAdmin();
        productsList.innerHTML = "";

        if (products.length === 0) {
            productsList.innerHTML = `<div class="admin-empty-state">No products found.</div>`;
            return;
        }

        products.forEach((product) => {
            const row = document.createElement("div");
            row.className = "admin-product-row";
            row.innerHTML = `
                ${getAdminProductThumbnail(product)}
                <div class="admin-product-info">
                    <h3>${escapeHtml(product.name)}</h3>
                    <div class="admin-product-meta">
                        ${formatMoney(product.price)} · ${Number(product.stock)} in stock<br>
                        Product ID: ${product.id}
                    </div>
                </div>
                <div class="admin-product-actions">
                    <button class="terminal-secondary-button admin-edit-product" type="button">EDIT</button>
                    <button class="terminal-danger-button admin-delete-product" type="button">DELETE</button>
                </div>
            `;

            row.querySelector(".admin-edit-product").addEventListener("click", () => {
                overlay.remove();
                openAdminEditProductModal(product);
            });

            const deleteButton = row.querySelector(".admin-delete-product");
            deleteButton.addEventListener("click", async () => {
                const confirmed = window.confirm(`Delete "${product.name}"?`);
                if (!confirmed) return;

                deleteButton.disabled = true;
                deleteButton.textContent = "DELETING...";

                try {
                    await deleteProduct(product.id);
                    row.remove();
                    await loadProducts();
                    message.textContent = "Product deleted successfully.";
                    message.className = "terminal-message success";
                } catch (error) {
                    message.textContent = error.message;
                    message.className = "terminal-message error";
                    deleteButton.disabled = false;
                    deleteButton.textContent = "DELETE";
                }
            });

            productsList.appendChild(row);
        });
    } catch (error) {
        productsList.innerHTML = "";
        message.textContent = error.message;
        message.className = "terminal-message error";
    }
}

function openAdminProductModal() {
    if (!currentUser || !currentUser.is_admin) {
        openLoginModal();
        return;
    }

    const overlay = createModal(
        "ADD PRODUCT",
        "TERMINAL ONE ADMIN",
        `
            <div id="admin-message" class="terminal-message"></div>
            <form id="admin-product-form">
                <div class="terminal-form-group">
                    <label>PRODUCT NAME</label>
                    <input id="admin-product-name" type="text" required>
                </div>
                <div class="terminal-form-group">
                    <label>DESCRIPTION</label>
                    <textarea id="admin-product-description" required></textarea>
                </div>
                <div class="terminal-form-row">
                    <div class="terminal-form-group">
                        <label>PRICE (€)</label>
                        <input id="admin-product-price" type="number" min="0" step="0.01" required>
                    </div>
                    <div class="terminal-form-group">
                        <label>STOCK</label>
                        <input id="admin-product-stock" type="number" min="0" step="1" required>
                    </div>
                </div>
                <div class="terminal-form-group">
                    <label>CATEGORY</label>
                    <select id="admin-product-category" required>
                        <option value="">Loading categories...</option>
                    </select>
                </div>
                <div class="terminal-form-group">
                    <label>PRODUCT IMAGE</label>
                    <input id="admin-product-image" type="file" accept="image/jpeg,image/png,image/webp" required>
                    <img id="admin-image-preview" class="admin-image-preview" alt="Product preview">
                </div>
                <button class="terminal-gold-button" type="submit">ADD PRODUCT</button>
            </form>
        `
    );
    addModalBack(overlay, openAdminManagementModal, "ADMIN");

    const form = overlay.querySelector("#admin-product-form");
    const message = overlay.querySelector("#admin-message");
    const categorySelect = overlay.querySelector("#admin-product-category");
    const imageInput = overlay.querySelector("#admin-product-image");
    const imagePreview = overlay.querySelector("#admin-image-preview");

    loadCategoriesForAdmin(categorySelect).catch((error) => {
        message.textContent = error.message;
        message.className = "terminal-message error";
    });

    imageInput.addEventListener("change", () => {
        const file = imageInput.files[0];
        if (!file) {
            imagePreview.style.display = "none";
            imagePreview.removeAttribute("src");
            return;
        }

        imagePreview.src = URL.createObjectURL(file);
        imagePreview.style.display = "block";
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        message.className = "terminal-message";

        const button = form.querySelector("button[type='submit']");
        const imageFile = imageInput.files[0];

        if (!imageFile) {
            message.textContent = "Please select a product image.";
            message.className = "terminal-message error";
            return;
        }

        button.disabled = true;
        button.textContent = "CREATING PRODUCT...";

        try {
            const imageUrl = await uploadProductImage(imageFile);
            const productData = {
                name: overlay.querySelector("#admin-product-name").value.trim(),
                description: overlay.querySelector("#admin-product-description").value.trim(),
                price: Number(overlay.querySelector("#admin-product-price").value),
                stock: Number(overlay.querySelector("#admin-product-stock").value),
                category_id: Number(categorySelect.value),
                image_url: imageUrl
            };

            await createProduct(productData);
            message.textContent = "Product created successfully.";
            message.className = "terminal-message success";
            form.reset();
            imagePreview.style.display = "none";
            imagePreview.removeAttribute("src");
            await Promise.all([loadProducts(), loadCategories()]);

            setTimeout(() => {
                overlay.remove();
                openAdminManagementModal();
            }, 700);
        } catch (error) {
            message.textContent = error.message;
            message.className = "terminal-message error";
        } finally {
            button.disabled = false;
            button.textContent = "ADD PRODUCT";
        }
    });
}

function openAdminEditProductModal(product) {
    if (!currentUser || !currentUser.is_admin) {
        openLoginModal();
        return;
    }

    const overlay = createModal(
        "EDIT PRODUCT",
        "TERMINAL ONE ADMIN",
        `
            <div id="admin-edit-message" class="terminal-message"></div>
            <form id="admin-edit-product-form">
                <div class="terminal-form-group">
                    <label>PRODUCT NAME</label>
                    <input id="admin-edit-product-name" type="text" value="${escapeHtml(product.name)}" required>
                </div>
                <div class="terminal-form-group">
                    <label>DESCRIPTION</label>
                    <textarea id="admin-edit-product-description" required>${escapeHtml(product.description)}</textarea>
                </div>
                <div class="terminal-form-row">
                    <div class="terminal-form-group">
                        <label>PRICE (€)</label>
                        <input id="admin-edit-product-price" type="number" min="0" step="0.01" value="${Number(product.price)}" required>
                    </div>
                    <div class="terminal-form-group">
                        <label>STOCK</label>
                        <input id="admin-edit-product-stock" type="number" min="0" step="1" value="${Number(product.stock)}" required>
                    </div>
                </div>
                <div class="terminal-form-group">
                    <label>CATEGORY</label>
                    <select id="admin-edit-product-category" required>
                        <option value="">Loading categories...</option>
                    </select>
                </div>
                <div class="terminal-form-group">
                    <label>PRODUCT IMAGE</label>
                    <input id="admin-edit-product-image" type="file" accept="image/jpeg,image/png,image/webp">
                    <img id="admin-edit-image-preview" class="admin-image-preview" alt="Product preview">
                </div>
                <button class="terminal-gold-button" type="submit">SAVE CHANGES</button>
            </form>
        `
    );
    addModalBack(overlay, openAdminManagementModal, "ADMIN");

    const form = overlay.querySelector("#admin-edit-product-form");
    const message = overlay.querySelector("#admin-edit-message");
    const categorySelect = overlay.querySelector("#admin-edit-product-category");
    const imageInput = overlay.querySelector("#admin-edit-product-image");
    const imagePreview = overlay.querySelector("#admin-edit-image-preview");

    if (product.image_url) {
        imagePreview.src = product.image_url;
        imagePreview.style.display = "block";
    }

    loadCategoriesForAdmin(categorySelect)
        .then(() => {
            if (product.category_id !== null && product.category_id !== undefined) {
                categorySelect.value = String(product.category_id);
            }
        })
        .catch((error) => {
            message.textContent = error.message;
            message.className = "terminal-message error";
        });

    imageInput.addEventListener("change", () => {
        const file = imageInput.files[0];

        if (!file) {
            if (product.image_url) {
                imagePreview.src = product.image_url;
                imagePreview.style.display = "block";
            } else {
                imagePreview.style.display = "none";
                imagePreview.removeAttribute("src");
            }
            return;
        }

        imagePreview.src = URL.createObjectURL(file);
        imagePreview.style.display = "block";
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        message.className = "terminal-message";

        const button = form.querySelector("button[type='submit']");
        button.disabled = true;
        button.textContent = "SAVING...";

        try {
            let imageUrl = product.image_url || null;
            const imageFile = imageInput.files[0];

            if (imageFile) {
                imageUrl = await uploadProductImage(imageFile);
            }

            const productData = {
                name: overlay.querySelector("#admin-edit-product-name").value.trim(),
                description: overlay.querySelector("#admin-edit-product-description").value.trim(),
                price: Number(overlay.querySelector("#admin-edit-product-price").value),
                stock: Number(overlay.querySelector("#admin-edit-product-stock").value),
                category_id: Number(categorySelect.value),
                image_url: imageUrl
            };

            await updateProduct(product.id, productData);
            message.textContent = "Product updated successfully.";
            message.className = "terminal-message success";
            await Promise.all([loadProducts(), loadCategories()]);

            setTimeout(() => {
                overlay.remove();
                openAdminManagementModal();
            }, 700);
        } catch (error) {
            message.textContent = error.message;
            message.className = "terminal-message error";
        } finally {
            button.disabled = false;
            button.textContent = "SAVE CHANGES";
        }
    });
}

async function apiRequest(url, options = {}) {
    const token = getToken();
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
    const response = await fetch(url, { ...options, headers });
    const data = await readResponseData(response);
    if (!response.ok) throw new Error(getErrorMessage(data, "Request failed"));
    return data;
}

function openAccountModal() {
    if (!requireLogin()) return;
    const overlay = createModal(
        "MY ACCOUNT",
        "TERMINAL ONE ACCOUNT",
        `
            <div class="admin-summary-grid">
                <button id="account-profile" class="terminal-secondary-button" type="button">EDIT PROFILE</button>
                <button id="account-orders" class="terminal-secondary-button" type="button">MY ORDERS</button>
                <button id="account-addresses" class="terminal-secondary-button" type="button">MY ADDRESSES</button>
                <button id="account-wishlist" class="terminal-secondary-button" type="button">MY WISHLIST</button>
                <button id="account-rewards" class="terminal-secondary-button" type="button">MY T1 MILES</button>
                <button id="account-password" class="terminal-secondary-button" type="button">CHANGE PASSWORD</button>
            </div>
            <button id="account-sign-out" class="terminal-danger-button" type="button" style="width:100%; margin-top:18px;">SIGN OUT</button>
        `
    );
    addModalBack(overlay, () => document.getElementById("products")?.scrollIntoView({ behavior: "smooth" }), "STORE");
    overlay.querySelector("#account-profile").onclick = () => { overlay.remove(); openProfileModal(); };
    overlay.querySelector("#account-orders").onclick = () => { overlay.remove(); openMyOrdersModal(); };
    overlay.querySelector("#account-addresses").onclick = () => { overlay.remove(); openAddressesModal(); };
    overlay.querySelector("#account-wishlist").onclick = () => { overlay.remove(); openWishlistModal(); };
    overlay.querySelector("#account-rewards").onclick = async () => { overlay.remove(); await openRewardsModal(); };
    overlay.querySelector("#account-password").onclick = () => { overlay.remove(); openChangePasswordModal(); };
    overlay.querySelector("#account-sign-out").onclick = () => { overlay.remove(); logoutUser(); };
}

async function openRewardsModal() {
    try {
        const rewards = await apiRequest("/rewards/me");
        const percentage = rewards.next_tier_at ? Math.min(100, Math.round(Number(rewards.miles) / Number(rewards.next_tier_at) * 100)) : 100;
        const overlay = createModal("MY T1 MILES", "TERMINAL ONE REWARDS", `<div class="rewards-card"><span>${escapeHtml(rewards.tier)}</span><strong>${Number(rewards.miles).toLocaleString()} MILES</strong><p>Earn 1 mile for every €1 after an order is delivered.</p><div class="rewards-progress"><i style="width:${percentage}%"></i></div><p>${rewards.miles_to_next_tier ? `${Number(rewards.miles_to_next_tier)} miles to your next tier.` : "You reached the highest tier."}</p></div>`);
        addModalBack(overlay, openAccountModal, "MY ACCOUNT");
    } catch (error) { showToast(error.message, "error"); openAccountModal(); }
}

function openProfileModal() {
    const overlay = createModal("EDIT PROFILE", "TERMINAL ONE ACCOUNT", `
        <div id="profile-message" class="terminal-message"></div>
        <form id="profile-form">
            <div class="terminal-form-group"><label>FULL NAME</label><input id="profile-name" value="${escapeHtml(currentUser.name || "")}" required></div>
            <div class="terminal-form-group"><label>EMAIL</label><input value="${escapeHtml(currentUser.email || "")}" disabled></div>
            <div class="terminal-form-row">
                <div class="terminal-form-group"><label>PHONE</label><input id="profile-phone" value="${escapeHtml(currentUser.phone || "")}"></div>
                <div class="terminal-form-group"><label>COUNTRY</label><input id="profile-country" value="${escapeHtml(currentUser.country || "")}"></div>
            </div>
            <div class="terminal-form-group"><label>ADDRESS</label><input id="profile-address" value="${escapeHtml(currentUser.address || "")}"></div>
            <button class="terminal-gold-button" type="submit">SAVE PROFILE</button>
        </form>
    `);
    addModalBack(overlay, openAccountModal, "MY ACCOUNT");
    const form = overlay.querySelector("#profile-form");
    form.onsubmit = async (event) => {
        event.preventDefault();
        try {
            currentUser = await apiRequest("/profile", { method: "PUT", body: JSON.stringify({
                name: overlay.querySelector("#profile-name").value.trim(),
                phone: overlay.querySelector("#profile-phone").value.trim() || null,
                country: overlay.querySelector("#profile-country").value.trim() || null,
                address: overlay.querySelector("#profile-address").value.trim() || null
            }) });
            updateAccountInterface(); overlay.remove(); showToast("Profile updated.", "success");
        } catch (error) {
            const message = overlay.querySelector("#profile-message"); message.textContent = error.message; message.className = "terminal-message error";
        }
    };
}

async function openAddressesModal() {
    const addresses = await apiRequest("/addresses");
    const overlay = createModal("MY ADDRESSES", "DELIVERY DETAILS", `
        <div id="address-message" class="terminal-message"></div>
        <div class="orders-list">
            ${addresses.map((address) => `<div class="order-card"><h3>${escapeHtml(address.label)} ${address.is_default ? "· DEFAULT" : ""}</h3><p>${escapeHtml(address.recipient_name)}</p><p>${escapeHtml(address.address_line)}, ${escapeHtml(address.postal_code)} ${escapeHtml(address.city)}, ${escapeHtml(address.country)}</p><button class="terminal-danger-button address-delete" data-id="${address.id}" type="button">DELETE</button></div>`).join("") || `<div class="admin-empty-state">No saved addresses.</div>`}
        </div>
        <form id="address-form" style="margin-top:18px;">
            <div class="terminal-form-row"><div class="terminal-form-group"><label>LABEL</label><input id="address-label" value="Home" required></div><div class="terminal-form-group"><label>RECIPIENT</label><input id="address-recipient" value="${escapeHtml(currentUser.name || "")}" required></div></div>
            <div class="terminal-form-group"><label>ADDRESS</label><input id="address-line" required></div>
            <div class="terminal-form-row"><div class="terminal-form-group"><label>CITY</label><input id="address-city" required></div><div class="terminal-form-group"><label>POSTAL CODE</label><input id="address-postal" required></div></div>
            <div class="terminal-form-group"><label>COUNTRY</label><input id="address-country" value="${escapeHtml(currentUser.country || "Portugal")}" required></div>
            <button class="terminal-gold-button" type="submit">SAVE NEW ADDRESS</button>
        </form>
    `);
    addModalBack(overlay, openAccountModal, "MY ACCOUNT");
    overlay.querySelectorAll(".address-delete").forEach((button) => button.onclick = async () => {
        await apiRequest(`/addresses/${button.dataset.id}`, { method: "DELETE" }); overlay.remove(); openAddressesModal();
    });
    overlay.querySelector("#address-form").onsubmit = async (event) => {
        event.preventDefault();
        await apiRequest("/addresses", { method: "POST", body: JSON.stringify({
            label: overlay.querySelector("#address-label").value, recipient_name: overlay.querySelector("#address-recipient").value,
            phone: currentUser.phone || null, address_line: overlay.querySelector("#address-line").value,
            city: overlay.querySelector("#address-city").value, postal_code: overlay.querySelector("#address-postal").value,
            country: overlay.querySelector("#address-country").value, is_default: addresses.length === 0
        }) });
        overlay.remove(); showToast("Address saved.", "success"); openAddressesModal();
    };
}

async function openWishlistModal() {
    const items = await apiRequest("/wishlist");
    wishlistProductIds = new Set(items.map((item) => Number(item.product_id)));
    const overlay = createModal("MY WISHLIST", "SAVED FOR LATER", `
        <div class="orders-list">${items.map((item) => `<div class="order-card" data-product-id="${item.product_id}"><h3>${escapeHtml(item.name)}</h3><p>${formatMoney(item.price)} · ${Number(item.stock)} in stock</p><button class="terminal-secondary-button wishlist-view" type="button">VIEW PRODUCT</button><button class="terminal-gold-button wishlist-cart" type="button" style="width:auto; margin-left:8px;">ADD TO CART</button><button class="terminal-danger-button wishlist-remove" type="button" style="margin-left:8px;">REMOVE</button></div>`).join("") || `<div class="admin-empty-state">Your wishlist is empty.</div>`}</div>
    `);
    addModalBack(overlay, openAccountModal, "MY ACCOUNT");
    overlay.querySelectorAll(".wishlist-view").forEach((button) => button.onclick = () => {
        const id = Number(button.closest(".order-card").dataset.productId);
        const product = allProducts.find((item) => Number(item.id) === id);
        if (product) { overlay.remove(); openProductModal(product); }
    });
    overlay.querySelectorAll(".wishlist-cart").forEach((button) => button.onclick = async () => {
        const id = Number(button.closest(".order-card").dataset.productId); await addToCart(id, 1); showToast("Added to cart.", "success");
    });
    overlay.querySelectorAll(".wishlist-remove").forEach((button) => button.onclick = async () => {
        const id = Number(button.closest(".order-card").dataset.productId); await apiRequest(`/wishlist/${id}`, { method: "DELETE" }); wishlistProductIds.delete(id); renderProducts(); overlay.remove(); openWishlistModal();
    });
}

function openChangePasswordModal() {
    const overlay = createModal("CHANGE PASSWORD", "ACCOUNT SECURITY", `<div id="password-message" class="terminal-message"></div><form id="password-form"><div class="terminal-form-group"><label>CURRENT PASSWORD</label><input id="password-current" type="password" required></div><div class="terminal-form-group"><label>NEW PASSWORD</label><input id="password-new" type="password" minlength="6" required></div><button class="terminal-gold-button" type="submit">CHANGE PASSWORD</button></form>`);
    addModalBack(overlay, openAccountModal, "MY ACCOUNT");
    overlay.querySelector("#password-form").onsubmit = async (event) => {
        event.preventDefault();
        try { await apiRequest("/users/change-password", { method: "PUT", body: JSON.stringify({ current_password: overlay.querySelector("#password-current").value, new_password: overlay.querySelector("#password-new").value }) }); overlay.remove(); showToast("Password changed.", "success"); }
        catch (error) { const message = overlay.querySelector("#password-message"); message.textContent = error.message; message.className = "terminal-message error"; }
    };
}

function openForgotPasswordModal() {
    const overlay = createModal("RESET PASSWORD", "TERMINAL ONE ACCOUNT", `
        <div id="reset-message" class="terminal-message"></div>
        <form id="forgot-form">
            <div class="terminal-form-group">
                <label>EMAIL</label>
                <input id="forgot-email" type="email" required>
            </div>
            <button class="terminal-gold-button" type="submit">SEND RESET CODE</button>
        </form>
        <form id="reset-form" style="margin-top:18px; display:none;">
            <div class="terminal-form-group">
                <label>CODE RECEIVED BY EMAIL</label>
                <input id="reset-token" autocomplete="one-time-code" required>
            </div>
            <div class="terminal-form-group">
                <label>NEW PASSWORD</label>
                <input id="reset-new-password" type="password" minlength="6" required>
            </div>
            <button class="terminal-secondary-button" type="submit" style="width:100%;">RESET PASSWORD</button>
        </form>`);

    const message = overlay.querySelector("#reset-message");
    const forgotForm = overlay.querySelector("#forgot-form");
    const resetForm = overlay.querySelector("#reset-form");

    forgotForm.onsubmit = async (event) => {
        event.preventDefault();
        try {
            const data = await apiRequest("/password/forgot", {
                method: "POST",
                body: JSON.stringify({ email: overlay.querySelector("#forgot-email").value })
            });
            message.textContent = "If this email is registered, a reset code has been sent. Check your inbox and spam folder.";
            message.className = "terminal-message success";
            resetForm.style.display = "block";
        } catch (error) {
            message.textContent = error.message;
            message.className = "terminal-message error";
        }
    };

    resetForm.onsubmit = async (event) => {
        event.preventDefault();
        try {
            await apiRequest("/password/reset", {
                method: "POST",
                body: JSON.stringify({
                    token: overlay.querySelector("#reset-token").value.trim(),
                    new_password: overlay.querySelector("#reset-new-password").value
                })
            });
            overlay.remove();
            showToast("Password reset. You can sign in now.", "success");
            openLoginModal();
        } catch (error) {
            message.textContent = error.message;
            message.className = "terminal-message error";
        }
    };
}

async function downloadAdminExport(resource) {
    const response = await fetch(`/admin/export/${resource}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!response.ok) throw new Error("Export failed");
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `terminal-one-${resource}.csv`; link.click(); URL.revokeObjectURL(url);
}

async function openAdminDashboardModal() {
    const [dashboard, coupons, logs, analytics] = await Promise.all([apiRequest("/admin/dashboard"), apiRequest("/admin/coupons"), apiRequest("/admin/audit-logs"), apiRequest("/admin/analytics")]);
    const overlay = createModal("ADMIN DASHBOARD", "TERMINAL ONE ANALYTICS", `
        <div class="admin-summary-grid"><div class="admin-summary-card"><span>Customers</span><strong>${dashboard.total_customers}</strong></div><div class="admin-summary-card"><span>Orders</span><strong>${dashboard.total_orders}</strong></div><div class="admin-summary-card"><span>Revenue</span><strong>${formatMoney(dashboard.total_revenue)}</strong></div><div class="admin-summary-card"><span>Low stock</span><strong>${dashboard.low_stock.length}</strong></div></div>
        <div class="checkout-review-block"><strong>STORE PERFORMANCE</strong><p>Average order value: ${formatMoney(analytics.average_order_value)}</p><div class="analytics-bars">${Object.entries(analytics.orders_by_status || {}).map(([status, value]) => `<div><span>${escapeHtml(status.toUpperCase())}</span><i style="width:${Math.min(100, Number(value) * 12)}%"></i><strong>${Number(value)}</strong></div>`).join("") || "<p>No order data yet.</p>"}</div><p>${(analytics.revenue_over_time || []).map((row) => `${escapeHtml(row.month)}: ${formatMoney(row.revenue)}`).join(" · ") || "Revenue history will appear after the first order."}</p></div>
        <div class="checkout-review-block"><strong>LOW STOCK ALERTS</strong>${dashboard.low_stock.map((p) => `<p>${escapeHtml(p.name)}: ${p.stock} remaining</p>`).join("") || "<p>No alerts.</p>"}</div>
        <div class="admin-toolbar"><button data-export="customers" class="terminal-secondary-button">EXPORT CUSTOMERS</button><button data-export="products" class="terminal-secondary-button">EXPORT PRODUCTS</button><button data-export="orders" class="terminal-secondary-button">EXPORT ORDERS</button></div>
        <div class="checkout-review-block"><strong>COUPONS</strong>${coupons.map((c) => `<div class="order-card" data-coupon-id="${c.id}" style="margin-top:12px;"><h3>${escapeHtml(c.code)} · <span style="color:${c.is_active ? "#55c985" : "#df6b6b"};">${c.is_active ? "ACTIVE" : "INACTIVE"}</span></h3><p>${c.discount_value}${c.discount_type === "percentage" ? "%" : "€"} · Minimum ${formatMoney(c.minimum_order)} · Used ${Number(c.times_used || 0)}${c.usage_limit === null ? "" : ` / ${Number(c.usage_limit)}`}</p><button class="terminal-secondary-button coupon-edit" type="button">EDIT</button>${c.is_active ? `<button class="terminal-danger-button coupon-deactivate" type="button" style="margin-left:8px;">DEACTIVATE</button>` : ""}</div>`).join("") || "<p>No coupons.</p>"}</div>
        <form id="coupon-form">
            <div class="terminal-form-row"><div class="terminal-form-group"><label>CODE</label><input id="coupon-code" required></div><div class="terminal-form-group"><label>VALUE</label><input id="coupon-value" type="number" min="0.01" step="0.01" required></div></div>
            <div class="terminal-form-row"><div class="terminal-form-group"><label>TYPE</label><select id="coupon-type"><option value="percentage">PERCENTAGE</option><option value="fixed">FIXED €</option></select></div><div class="terminal-form-group"><label>MINIMUM ORDER (€)</label><input id="coupon-minimum" type="number" min="0" step="0.01" value="0"></div></div>
            <div class="terminal-form-row"><div class="terminal-form-group"><label>MAXIMUM USES</label><input id="coupon-limit" type="number" min="1" placeholder="Unlimited"></div><div class="terminal-form-group"><label>EXPIRATION DATE</label><input id="coupon-expiration" type="datetime-local"></div></div>
            <button class="terminal-gold-button" type="submit">CREATE COUPON</button>
        </form>
        <div class="checkout-review-block" style="margin-top:18px;"><strong>RECENT ADMIN ACTIVITY</strong>${logs.slice(0, 20).map((log) => `<p>${formatDate(log.created_at)} · ${escapeHtml(log.action)} ${escapeHtml(log.entity_type)} #${escapeHtml(log.entity_id || "")}</p>`).join("") || "<p>No activity yet.</p>"}</div>
    `);
    addModalBack(overlay, openAdminManagementModal, "ADMIN");
    overlay.querySelectorAll("[data-export]").forEach((button) => button.onclick = () => downloadAdminExport(button.dataset.export));
    overlay.querySelectorAll(".coupon-edit").forEach((button) => button.onclick = () => {
        const id = Number(button.closest("[data-coupon-id]").dataset.couponId);
        const coupon = coupons.find((item) => Number(item.id) === id);
        overlay.remove();
        openCouponEditModal(coupon);
    });
    overlay.querySelectorAll(".coupon-deactivate").forEach((button) => button.onclick = async () => {
        const card = button.closest("[data-coupon-id]");
        const id = Number(card.dataset.couponId);
        const coupon = coupons.find((item) => Number(item.id) === id);
        if (!window.confirm(`Are you sure you want to deactivate ${coupon.code}?`)) return;
        button.disabled = true;
        try {
            await apiRequest(`/admin/coupons/${id}`, { method: "DELETE" });
            overlay.remove(); showToast(`${coupon.code} deactivated.`, "success"); openAdminDashboardModal();
        } catch (error) { button.disabled = false; showToast(error.message, "error"); }
    });
    overlay.querySelector("#coupon-form").onsubmit = async (event) => {
        event.preventDefault();
        const expiration = overlay.querySelector("#coupon-expiration").value;
        const limit = overlay.querySelector("#coupon-limit").value;
        await apiRequest("/admin/coupons", { method: "POST", body: JSON.stringify({
            code: overlay.querySelector("#coupon-code").value,
            discount_type: overlay.querySelector("#coupon-type").value,
            discount_value: Number(overlay.querySelector("#coupon-value").value),
            minimum_order: Number(overlay.querySelector("#coupon-minimum").value || 0),
            usage_limit: limit ? Number(limit) : null,
            valid_until: expiration ? new Date(expiration).toISOString() : null,
            is_active: true
        }) });
        overlay.remove(); showToast("Coupon created.", "success"); openAdminDashboardModal();
    };
}

function openCouponEditModal(coupon) {
    if (!coupon) return openAdminDashboardModal();
    const validUntil = coupon.valid_until ? new Date(coupon.valid_until).toISOString().slice(0, 16) : "";
    const overlay = createModal("EDIT COUPON", "TERMINAL ONE ADMIN", `
        <div id="coupon-edit-message" class="terminal-message"></div>
        <form id="coupon-edit-form">
            <div class="terminal-form-row"><div class="terminal-form-group"><label>CODE</label><input id="coupon-edit-code" value="${escapeHtml(coupon.code)}" required></div><div class="terminal-form-group"><label>STATUS</label><select id="coupon-edit-status"><option value="true" ${coupon.is_active ? "selected" : ""}>ACTIVE</option><option value="false" ${coupon.is_active ? "" : "selected"}>INACTIVE</option></select></div></div>
            <div class="terminal-form-row"><div class="terminal-form-group"><label>TYPE</label><select id="coupon-edit-type"><option value="percentage" ${coupon.discount_type === "percentage" ? "selected" : ""}>PERCENTAGE</option><option value="fixed" ${coupon.discount_type === "fixed" ? "selected" : ""}>FIXED €</option></select></div><div class="terminal-form-group"><label>VALUE</label><input id="coupon-edit-value" type="number" min="0.01" step="0.01" value="${Number(coupon.discount_value)}" required></div></div>
            <div class="terminal-form-row"><div class="terminal-form-group"><label>MINIMUM ORDER (€)</label><input id="coupon-edit-minimum" type="number" min="0" step="0.01" value="${Number(coupon.minimum_order || 0)}"></div><div class="terminal-form-group"><label>MAXIMUM USES</label><input id="coupon-edit-limit" type="number" min="1" value="${coupon.usage_limit ?? ""}" placeholder="Unlimited"></div></div>
            <div class="terminal-form-group"><label>EXPIRATION DATE</label><input id="coupon-edit-expiration" type="datetime-local" value="${validUntil}"></div>
            <button class="terminal-gold-button" type="submit">SAVE COUPON</button>
        </form>
    `);
    addModalBack(overlay, openAdminDashboardModal, "COUPONS");
    overlay.querySelector("#coupon-edit-form").onsubmit = async (event) => {
        event.preventDefault();
        const expiration = overlay.querySelector("#coupon-edit-expiration").value;
        const limit = overlay.querySelector("#coupon-edit-limit").value;
        try {
            await apiRequest(`/admin/coupons/${coupon.id}`, { method: "PUT", body: JSON.stringify({
                code: overlay.querySelector("#coupon-edit-code").value,
                discount_type: overlay.querySelector("#coupon-edit-type").value,
                discount_value: Number(overlay.querySelector("#coupon-edit-value").value),
                minimum_order: Number(overlay.querySelector("#coupon-edit-minimum").value || 0),
                usage_limit: limit ? Number(limit) : null,
                valid_until: expiration ? new Date(expiration).toISOString() : null,
                is_active: overlay.querySelector("#coupon-edit-status").value === "true"
            }) });
            overlay.remove(); showToast("Coupon updated.", "success"); openAdminDashboardModal();
        } catch (error) {
            const message = overlay.querySelector("#coupon-edit-message"); message.textContent = error.message; message.className = "terminal-message error";
        }
    };
}

function setupNavigation() {
    cartButton?.addEventListener("click", openCartModal);

    bestDealsLink?.addEventListener("click", (event) => {
        event.preventDefault();
        openBestDealsModal();
    });

    myOrdersLink?.addEventListener("click", (event) => {
        event.preventDefault();
        openMyOrdersModal();
    });

    wishlistLink?.addEventListener("click", (event) => {
        event.preventDefault();
        openWishlistModal();
    });

    viewAllProductsLink?.addEventListener("click", (event) => {
        event.preventDefault();
        selectCategory(null);
    });
    [catalogSort, catalogMinPrice, catalogMaxPrice].forEach((control) => control?.addEventListener("input", renderProducts));
    document.getElementById("catalog-clear")?.addEventListener("click", () => { if (catalogSort) catalogSort.value = "name"; if (catalogMinPrice) catalogMinPrice.value = ""; if (catalogMaxPrice) catalogMaxPrice.value = ""; renderProducts(); });
    document.getElementById("build-journey-button")?.addEventListener("click", openJourneyBuilder);
    document.getElementById("ask-terminal-button")?.addEventListener("click", openTerminalAssistant);

    searchInput?.addEventListener("input", () => {
        activeSearchTerm = searchInput.value.trim();
        activeCategoryId = null;

        document.querySelectorAll(".terminal-category-card").forEach((card) => {
            card.classList.toggle("active-category-card", card.dataset.categoryId === "all");
        });

        renderProducts();
    });

    contactForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        const message = document.getElementById("contact-message");
        message.textContent = "Thank you. The contact interface is ready; message delivery can be connected to the backend next.";
        message.className = "terminal-message success";
        contactForm.reset();
    });
}

async function initializeApp() {
    injectFrontendStyles();
    setupNavigation();
    loadLocationAndWeather();

    await Promise.all([loadCategories(), loadCurrentUser()]);
    await loadWishlistState();
    await loadProducts();
    await loadCatalogInsights();

    await updateCartCount();
}

initializeApp();
setInterval(updateClock, 1000);
