/* Minimal Telegram Mini App frontend (no build step). */

const tg = window.Telegram?.WebApp || null;

function qs(id) {
    return document.getElementById(id);
}

function el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") n.className = v;
        else if (k === "html") n.innerHTML = v;
        else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.substring(2), v);
        else n.setAttribute(k, v);
    }
    for (const c of children) n.append(c);
    return n;
}

const state = {
    initData: "",
    me: null,
    products: [],
    filteredProducts: [],
    tags: [],
    activeTagId: "all",
    searchQuery: "",
    cart: new Map(), // key -> {product, variantId, variant, qty}
    appInfo: null,
    pendingProductId: null,
    mainBtnBound: false,
    sort: "default",
    checkoutOpen: false,

    thumbTimer: null,
    thumbIndex: new Map(), // productId -> index

    refreshTimer: null, // auto refresh timer
};

const viewportContentLocked = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
const viewportContentZoom = "width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover";
const CART_STORAGE_KEY = "tgshop_cart";

function cartKey(productId, variantId) {
    const pid = String(productId);
    const vid = variantId ? String(variantId) : "base";
    return `${pid}::${vid}`;
}

function parseCartKey(key) {
    const raw = String(key);
    if (!raw.includes("::")) {
        return {productId: raw, variantId: null};
    }
    const [productId, variantPart] = raw.split("::");
    return {productId, variantId: variantPart && variantPart !== "base" ? variantPart : null};
}

function loadCart() {
    try {
        const raw = localStorage.getItem(CART_STORAGE_KEY);
        if (!raw) return;
        const obj = JSON.parse(raw);
        for (const [key, stored] of Object.entries(obj)) {
            const parsed = parseCartKey(key);
            const qty = typeof stored === "number" ? stored : Number(stored?.qty || 0);
            const variantId = stored?.variantId ? String(stored.variantId) : parsed.variantId;
            const normalizedKey = cartKey(parsed.productId, variantId);
            state.cart.set(normalizedKey, {product: null, variantId, variant: null, qty: Number(qty) || 0});
        }
    } catch {
    }
}

function saveCart() {
    const obj = {};
    for (const [key, item] of state.cart.entries()) obj[key] = item.qty;
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(obj));
}

function money(p) {
    // Здесь priceMinor — "целое число". Если хочешь копейки — поменяй формат.
    return `${p.priceMinor} ${p.currency || "UAH"}`;
}

function toast(text) {
    const t = el("div", {class: "toast"}, [document.createTextNode(text)]);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
}

function apiHeaders(extra = {}) {
    return {
        "Accept": "application/json",
        "ngrok-skip-browser-warning": "true",
        ...extra,
    };
}

async function apiGet(url) {
    const r = await fetch(url, {headers: apiHeaders()});
    const ct = r.headers.get("content-type") || "";
    const text = await r.text();

    if (!r.ok) throw new Error(text);

    // если ngrok снова подсунул HTML — покажем понятную ошибку
    if (!ct.includes("application/json")) {
        throw new Error(`Expected JSON, got ${ct}. Head: ${text.slice(0, 160)}`);
    }
    return JSON.parse(text);
}

async function apiPost(url, body) {
    const r = await fetch(url, {
        method: "POST",
        headers: apiHeaders({"Content-Type": "application/json"}),
        body: JSON.stringify(body),
    });

    const ct = r.headers.get("content-type") || "";
    const text = await r.text();

    if (!r.ok) throw new Error(text);
    if (!ct.includes("application/json")) {
        throw new Error(`Expected JSON, got ${ct}. Head: ${text.slice(0, 160)}`);
    }
    return JSON.parse(text);
}

async function loadAppInfo() {
    try {
        state.appInfo = await apiGet("/api/app-info");
    } catch (e) {
        console.warn("app info load failed", e);
        state.appInfo = null;
    }
}

function normalizeText(text) {
    return String(text || "").toLowerCase().trim();
}

function normalizeBotUsername(value) {
    if (!value) return "";
    const clean = String(value).trim();
    return clean.startsWith("@") ? clean.slice(1) : clean;
}

function parseProductIdFromStartParam(value) {
    if (!value) return null;
    const clean = String(value).trim();
    if (!clean) return null;
    const match = clean.match(/^product[_-](.+)$/);
    if (match) return match[1];
    return clean;
}

function buildProductStartParam(productId) {
    return `product_${productId}`;
}

function productsEndpoint() {
    return "/api/products";
}

function buildTags(products) {
    const tagMap = new Map();
    products.forEach((p) => {
        (p.tags || []).forEach((tag) => {
            if (!tag || !tag.id) return;
            tagMap.set(String(tag.id), tag.name);
        });
    });
    return [...tagMap.entries()]
        .map(([id, name]) => ({id, name}))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function renderTagFilters() {
    const container = qs("tagFilters");
    if (!container) return;
    container.innerHTML = "";

    if (state.activeTagId !== "all" && !state.tags.some((tag) => String(tag.id) === String(state.activeTagId))) {
        state.activeTagId = "all";
    }

    const allBtn = el("button", {
        class: `tag-filter${state.activeTagId === "all" ? " active" : ""}`,
        onclick: () => setActiveTag("all"),
    }, [document.createTextNode("Все")]);
    container.append(allBtn);

    state.tags.forEach((tag) => {
        container.append(el("button", {
            class: `tag-filter${state.activeTagId === String(tag.id) ? " active" : ""}`,
            onclick: () => setActiveTag(String(tag.id)),
        }, [document.createTextNode(tag.name)]));
    });
}

function setActiveTag(tagId) {
    state.activeTagId = tagId;
    applyFilters();
    renderTagFilters();
}

function applyFilters() {
    updateFilteredProducts();
    renderProducts();
}

function updateFilteredProducts() {
    const query = normalizeText(state.searchQuery);
    let filtered = [...state.products];

    if (state.activeTagId !== "all") {
        filtered = filtered.filter((p) =>
            (p.tags || []).some((tag) => String(tag.id) === String(state.activeTagId))
        );
    }

    if (query) {
        filtered = filtered.filter((p) => normalizeText(p.title).includes(query));
    }

    state.filteredProducts = sortedProducts(filtered);
}

function createTagList(tags) {
    const list = el("div", {class: "tag-list"});
    (tags || []).forEach((tag) => {
        list.append(el("span", {class: "tag-badge"}, [document.createTextNode(tag.name)]));
    });
    return list;
}

function ensureThumbIndex(p) {
    const pid = String(p.id);
    if (!state.thumbIndex.has(pid)) state.thumbIndex.set(pid, 0);
}

function bindCartProducts() {
    const byId = new Map(state.products.map(p => [String(p.id), p]));
    for (const [key, item] of state.cart.entries()) {
        const parsed = parseCartKey(key);
        const product = byId.get(String(parsed.productId)) || null;
        if (!product) {
            state.cart.delete(key);
            continue;
        }
        item.product = product;
        item.variantId = item.variantId || parsed.variantId;
        if (item.variantId) {
            const variant = (product.variants || []).find(v => String(v.id) === String(item.variantId));
            if (!variant) {
                state.cart.delete(key);
                continue;
            }
            item.variant = variant;
        } else {
            item.variant = null;
            if ((product.variants || []).length) {
                state.cart.delete(key);
                continue;
            }
        }
    }
    saveCart();
    updateCartBadge();
}

function cartCount() {
    let c = 0;
    for (const it of state.cart.values()) c += it.qty;
    return c;
}

function cartTotal() {
    let sum = 0;
    let cur = "UAH";
    for (const it of state.cart.values()) {
        if (!it.product) continue;
        sum += (it.product.priceMinor * it.qty);
        cur = it.product.currency || cur;
    }
    return {sum, cur};
}

/** Disable/enable add-to-cart on card based on stock (no re-render). */
function updateCardAvailability(card, p) {
    const addBtn = card.querySelector(".js-add");
    if (!addBtn) return;
    const out = !(p.stock > 0) || !p.active;
    addBtn.disabled = out;
    addBtn.style.opacity = out ? "0.6" : "";
    addBtn.style.pointerEvents = out ? "none" : "";
}

function updateCardActiveState(card, p) {
    card.classList.toggle("inactive", !p.active);
    const statusEl = card.querySelector('[data-field="status"]');
    if (statusEl) {
        statusEl.textContent = p.active ? "" : "Скрыт";
        statusEl.classList.toggle("hidden", p.active);
    }
}

function getProductById(productId) {
    return state.products.find(x => String(x.id) === String(productId)) || null;
}

function getProductVariants(p) {
    return Array.isArray(p?.variants) ? p.variants : [];
}

function cartQtyForProduct(productId) {
    let total = 0;
    for (const item of state.cart.values()) {
        if (item.product && String(item.product.id) === String(productId)) {
            total += item.qty;
        }
    }
    return total;
}

function cartQtyForVariant(productId, variantId) {
    if (!variantId) return 0;
    const key = cartKey(productId, variantId);
    const item = state.cart.get(key);
    return item ? item.qty : 0;
}

function buildProductShareLink(productId) {
    const botUsername = normalizeBotUsername(state.appInfo?.botUsername);
    if (botUsername) {
        const startParam = buildProductStartParam(productId);
        return `https://t.me/${botUsername}?startapp=${encodeURIComponent(startParam)}`;
    }
    const baseUrl = state.appInfo?.webappBaseUrl || window.location.origin;
    const url = new URL(baseUrl);
    url.searchParams.set("productId", productId);
    return url.toString();
}

function shareProduct(product) {
    const link = buildProductShareLink(product.id);
    const botUsername = normalizeBotUsername(state.appInfo?.botUsername);
    const botLabel = botUsername ? `@${botUsername}` : "нашем боте";
    const text = `🔥 ${product.title}\n\nЛучшие товары в боте ${botLabel} от Максольчика\n\n🛒 Открыть товар: ${link}`;

    if (tg) {
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent("⠀⠀")}&text=${encodeURIComponent(text)}`;
        tg.openTelegramLink(shareUrl);
        return;
    }

    if (navigator.share) {
        navigator.share({title: product.title, text})
            .catch(() => {
            });
        return;
    }

    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(link)
            .then(() => toast("Ссылка скопирована"))
            .catch(() => toast("Не удалось скопировать ссылку"));
    } else {
        toast("Скопируй ссылку: " + link);
    }
}

function setViewportZoomEnabled(enabled) {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    meta.setAttribute("content", enabled ? viewportContentZoom : viewportContentLocked);
}

function setShareButton(product) {
    const shareBtn = qs("shareProductBtn");
    if (!shareBtn) return;
    if (!product) {
        shareBtn.classList.add("hidden");
        shareBtn.onclick = null;
        return;
    }
    shareBtn.classList.remove("hidden");
    shareBtn.onclick = (e) => {
        e.stopPropagation();
        shareProduct(product);
    };
}

function createProductCard(p) {
    const pid = String(p.id);
    const img = (p.imageUrls && p.imageUrls.length > 0) ? p.imageUrls[0] : null;

    const card = el("div", {class: "card product", "data-product-id": pid});

    const thumbImg = img
        ? el("img", {src: img, alt: p.title, "data-thumb-id": pid})
        : null;

    const thumb = el("div", {class: "thumb"},
        thumbImg ? [thumbImg] : [el("div", {class: "small", html: "Нет фото"})]
    );

    const name = el("div", {class: "name", "data-field": "title"}, [p.title]);
    const statusBadge = el("span", {
        class: `status-tag${p.active ? " hidden" : ""}`,
        "data-field": "status"
    }, [p.active ? "" : "Скрыт"]);
    const nameRow = el("div", {class: "name-row"}, [name, statusBadge]);

    const priceEl = el("b", {class: "js-price"}, [String(p.priceMinor)]);
    const stockEl = el("b", {class: "js-stock"}, [p.stock ? String(p.stock) : "Нет в наличии"]);

    const meta = el("div", {class: "meta"}, [
        el("div", {class: "block"}, [
            el("i", {class: "fa-regular fa-hryvnia-sign"}, []),
            priceEl
        ]),
        el("div", {class: "block js-stock-wrap"}, [
            p.stock
                ? el("i", {class: "fa-regular fa-cubes"}, [])
                : el("span", {}, []),
            stockEl
        ])
    ]);

    const btnRow = el("div", {class: "actions"}, [
        el("button", {
            class: "pill", onclick: (e) => {
                e.stopPropagation();
                const current = getProductById(pid);
                if (current) openProduct(current);
            }
        }, [document.createTextNode("Подробнее")]),
    ]);

    card.append(thumb, nameRow, meta, btnRow);
    card.addEventListener("click", () => {
        const current = getProductById(pid);
        if (current) openProduct(current);
    });

    updateCardAvailability(card, p);
    updateCardActiveState(card, p);
    ensureThumbIndex(p);

    return card;
}

function updateCardData(card, p, old) {
    if (!old || old.title !== p.title) {
        const t = card.querySelector('[data-field="title"]');
        if (t) t.textContent = p.title;
    }

    if (!old || old.priceMinor !== p.priceMinor) {
        const pr = card.querySelector(".js-price");
        if (pr) pr.textContent = String(p.priceMinor);
    }

    if (!old || old.active !== p.active) {
        updateCardActiveState(card, p);
    }

    if (!old || old.stock !== p.stock) {
        const st = card.querySelector(".js-stock");
        if (st) st.textContent = p.stock ? String(p.stock) : "Нет в наличии";
        updateCardAvailability(card, p);
    }

    const oldImg = (old?.imageUrls && old.imageUrls[0]) ? old.imageUrls[0] : null;
    const newImg = (p.imageUrls && p.imageUrls[0]) ? p.imageUrls[0] : null;
    if (oldImg !== newImg) {
        const imgEl = card.querySelector(`img[data-thumb-id="${String(p.id)}"]`);
        if (imgEl && newImg) imgEl.src = newImg;
    }
}

function sortedProducts(list) {
    if (state.sort === "price-asc") {
        return [...list].sort((a, b) => (a.priceMinor || 0) - (b.priceMinor || 0));
    }
    if (state.sort === "price-desc") {
        return [...list].sort((a, b) => (b.priceMinor || 0) - (a.priceMinor || 0));
    }
    if (state.sort === "sold") {
        return [...list].sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0));
    }
    const withIndex = list.map((item, index) => ({
        item,
        index,
        out: !(item.stock > 0),
    }));
    return withIndex
        .sort((a, b) => (a.out === b.out ? a.index - b.index : a.out - b.out))
        .map(({item}) => item);
}

function syncProductCards() {
    const grid = qs("grid");
    const existing = grid.querySelectorAll(".card.product");
    const keepIds = new Set(state.filteredProducts.map(p => String(p.id)));
    for (const card of existing) {
        const pid = card.getAttribute("data-product-id");
        if (!keepIds.has(String(pid))) card.remove();
    }

    const fragment = document.createDocumentFragment();
    for (const p of state.filteredProducts) {
        let card = grid.querySelector(`.card.product[data-product-id="${String(p.id)}"]`);
        if (!card) {
            card = createProductCard(p);
        }
        fragment.append(card);
    }
    grid.append(fragment);
}

/** FULL render (first load or hard rebuild). */
function renderProducts() {
    const grid = qs("grid");
    grid.innerHTML = "";

    for (const p of state.filteredProducts) {
        grid.append(createProductCard(p));
    }
}

function openModal(node) {
    qs("modalBody").innerHTML = "";
    qs("modalBody").append(node);
    qs("modal").classList.remove("hidden");
}

function closeModal() {
    qs("modal").classList.add("hidden");
    setShareButton(null);
    if (state.checkoutOpen) {
        state.checkoutOpen = false;
        updateCartBadge();
    }
}

function openSortModal() {
    const modal = qs("sortModal");
    modal.classList.remove("hidden");
    setSortOptionState();
}

function closeSortModal() {
    qs("sortModal").classList.add("hidden");
}

function openSearchModal() {
    const modal = qs("searchModal");
    modal.classList.remove("hidden");
    const input = qs("searchInput");
    if (input) {
        input.value = state.searchQuery || "";
        input.focus();
    }
}

function closeSearchModal() {
    qs("searchModal").classList.add("hidden");
}

function setSortOptionState() {
    const options = document.querySelectorAll(".sort-option");
    for (const opt of options) {
        const isActive = opt.getAttribute("data-sort") === state.sort;
        opt.classList.toggle("active", isActive);
    }
}

function applySort(nextSort) {
    state.sort = nextSort;
    applyFilters();
    setSortOptionState();
}

qs("closeModal").addEventListener("click", closeModal);
qs("modal").addEventListener("click", (e) => {
    if (e.target === qs("modal")) closeModal();
});

qs("sortBtn").addEventListener("click", openSortModal);
qs("sortModalClose").addEventListener("click", closeSortModal);
qs("sortModal").addEventListener("click", (e) => {
    if (e.target === qs("sortModal")) closeSortModal();
});
document.querySelectorAll(".sort-option").forEach((btn) => {
    btn.addEventListener("click", () => {
        const nextSort = btn.getAttribute("data-sort") || "default";
        applySort(nextSort);
        closeSortModal();
    });
});

qs("searchBtn").addEventListener("click", openSearchModal);
qs("searchModalClose").addEventListener("click", closeSearchModal);
qs("searchModal").addEventListener("click", (e) => {
    if (e.target === qs("searchModal")) closeSearchModal();
});
qs("searchInput").addEventListener("input", (e) => {
    state.searchQuery = String(e.target.value || "");
    applyFilters();
});
qs("searchClear").addEventListener("click", () => {
    state.searchQuery = "";
    qs("searchInput").value = "";
    applyFilters();
});

function addToCart(productId, variantId, delta) {
    const pid = String(productId);
    const p = state.products.find(x => String(x.id) === pid);
    if (!p) return;
    if (!p.active) return toast("Товар скрыт");
    if (p.stock <= 0) return toast("Нет в наличии");

    const variants = getProductVariants(p);
    const hasVariants = variants.length > 0;
    const resolvedVariantId = variantId ? String(variantId) : null;
    if (hasVariants && !resolvedVariantId) return toast("Выберите вариант");
    if (resolvedVariantId && !variants.some(v => String(v.id) === resolvedVariantId)) {
        return toast("Вариант недоступен");
    }

    const key = cartKey(pid, resolvedVariantId);
    const cur = state.cart.get(key) || {product: p, variantId: resolvedVariantId, variant: null, qty: 0};
    const next = cur.qty + delta;
    const variant = resolvedVariantId ? variants.find(v => String(v.id) === resolvedVariantId) || null : null;
    const variantStock = variant ? Number(variant.stock || 0) : p.stock;
    const availableForVariant = variantStock - cur.qty;

    if (delta > 0 && availableForVariant <= 0) return toast("Нет в наличии");

    if (next <= 0) {
        state.cart.delete(key);
    } else {
        cur.qty = Math.min(next, availableForVariant);
        cur.product = p;
        cur.variantId = resolvedVariantId;
        cur.variant = variant;
        state.cart.set(key, cur);
    }

    saveCart();
    updateCartBadge();
    toast(delta > 0 ? "Добавлено в корзину" : "Обновлено");
}

function updateCartBadge() {
    qs("cartCount").textContent = String(cartCount());

    if (tg) {
        const cnt = cartCount();
        if (cnt > 0 && !state.checkoutOpen) {
            const {sum, cur} = cartTotal();
            tg.MainButton.setText(`Оформить заказ • ${sum} ${cur}`);
            tg.MainButton.show();
            if (!state.mainBtnBound) {
                tg.MainButton.onClick(openCheckout);
                state.mainBtnBound = true;
            }
        } else {
            tg.MainButton.hide();
        }
    }
}

function openProduct(p) {
    const gallery = createGallery(p.imageUrls || [], p.title);
    const actionWrap = el("div", {class: "action-wrap"});
    const variants = getProductVariants(p);
    let selectedVariantId = null;

    const variantWrap = variants.length ? el("div", {class: "variant-list"}) : null;
    if (variantWrap) {
        variants.forEach((variant, index) => {
            const radioId = `variant-${p.id}-${index}`;
            const input = el("input", {
                type: "radio",
                id: radioId,
                name: `variant-${p.id}`,
                value: String(variant.id),
                ...(Number(variant.stock || 0) <= 0 ? {disabled: "true"} : {}),
            });
            input.addEventListener("change", () => {
                selectedVariantId = String(variant.id);
                renderAction();
            });
            const label = el("label", {
                class: `variant-option${Number(variant.stock || 0) <= 0 ? " disabled" : ""}`,
                for: radioId
            }, [
                input,
                el("span", {}, [document.createTextNode(variant.name)]),
                el("span", {class: "variant-stock"}, [
                    document.createTextNode(`Остаток: ${Number(variant.stock || 0)}`)
                ]),
            ]);
            variantWrap.append(label);
        });
    }

    const renderAction = () => {
        const pid = String(p.id);
        const key = cartKey(pid, selectedVariantId);
        const cartItem = state.cart.get(key);
        const qty = cartItem ? cartItem.qty : 0;
        const variant = selectedVariantId
            ? variants.find((v) => String(v.id) === String(selectedVariantId))
            : null;
        const variantStock = variant ? Number(variant.stock || 0) : p.stock;

        actionWrap.replaceChildren();

        if (variants.length && !selectedVariantId) {
            const chooseBtn = el("button", {
                class: "pill",
                disabled: "true",
            }, [document.createTextNode("Выберите вариант")]);
            actionWrap.append(chooseBtn);
            return;
        }

        if (qty > 0) {
            const minusBtn = el("button", {
                onclick: () => {
                    addToCart(pid, selectedVariantId, -1);
                    renderAction();
                }
            }, [document.createTextNode("−")]);

            const plusBtn = el("button", {
                onclick: () => {
                    addToCart(pid, selectedVariantId, +1);
                    renderAction();
                }
            }, [document.createTextNode("+")]);
            plusBtn.disabled = variantStock <= 0 || qty >= variantStock;

            actionWrap.append(el("div", {class: "qty"}, [
                minusBtn,
                el("div", {}, [document.createTextNode(String(qty))]),
                plusBtn,
            ]));
        } else {
            if (!p.active || p.stock <= 0) {
                const unavailableBtn = el("button", {
                    class: "danger pill",
                    disabled: "true",
                }, [document.createTextNode("Нет в наличии")]);
                actionWrap.append(unavailableBtn);
                return;
            }
            const addBtn = el("button", {
                class: "primary pill",
                onclick: () => {
                    addToCart(pid, selectedVariantId, 1);
                    renderAction();
                }
            }, [document.createTextNode("В корзину")]);
            addBtn.disabled = !p.active || !(p.stock > 0);
            actionWrap.append(addBtn);
        }
    };
    renderAction();

    const node = el("div", {}, [
        el("h2", {}, [document.createTextNode(p.title)]),
        p.tags && p.tags.length ? createTagList(p.tags) : el("div"),
        variants.length ? el("div", {class: "variant-title"}, [document.createTextNode("Варианты")]) : el("div"),
        variants.length ? variantWrap : el("div"),
        el("div", {class: "row-column"}, [
            el("div", {class: "column"}, [
                el("div", {class: "small"}, [document.createTextNode(money(p))]),
                el("div", {class: "small"}, [document.createTextNode(p.stock > 0 ? `В наличии: ${p.stock}` : "Нет в наличии")]),
            ]),
            el("div", {class: "column"}, [
                actionWrap,
            ]),
        ]),
        el("div", {class: "hr"}),
        el("div", {class: "product-description"}, [document.createTextNode(p.description || "Без описания")]),
        el("div", {class: "hr"}),
        gallery,
        el("div", {class: "hr"}),

    ]);

    setShareButton(p);
    openModal(node);
}

function openCart() {
    setShareButton(null);
    state.checkoutOpen = true;
    updateCartBadge();
    const lines = [];
    for (const [id, it] of state.cart.entries()) {
        if (!it.product) continue;
        const p = it.product;
        const variantLabel = it.variant ? ` • ${it.variant.name}` : "";

        lines.push(el("div", {class: "cart-line"}, [
            el("div", {}, [
                el("div", {style: "font-weight:700"}, [document.createTextNode(`${p.title}${variantLabel}`)]),
                el("div", {class: "small"}, [document.createTextNode(money(p))]),
            ]),
            (() => {
                const minusBtn = el("button", {
                    onclick: () => {
                        addToCart(p.id, it.variantId, -1);
                        openCart();
                    }
                }, [document.createTextNode("−")]);
                const plusBtn = el("button", {
                    onclick: () => {
                        addToCart(p.id, it.variantId, +1);
                        openCart();
                    }
                }, [document.createTextNode("+")]);
                const variantStock = it.variant ? Number(it.variant.stock || 0) : p.stock;
                plusBtn.disabled = variantStock <= 0 || it.qty >= variantStock;
                return el("div", {class: "qty"}, [
                    minusBtn,
                    el("div", {}, [document.createTextNode(String(it.qty))]),
                    plusBtn,
                ]);
            })(),
        ]));
    }

    const {sum, cur} = cartTotal();
    const node = el("div", {class: "cart-modal"}, [
        el("h2", {}, [document.createTextNode("🧺 Корзина")]),
        lines.length ? el("div", {}, lines) : el("div", {class: "small"}, [document.createTextNode("Корзина пустая")]),
        el("div", {class: "hr"}),
        el("div", {class: "row summary"}, [
            el("div", {style: "font-weight:700"}, [document.createTextNode(`Итого: ${sum} ${cur}`)]),
            el("button", {
                class: "danger pill", onclick: () => {
                    state.cart.clear();
                    saveCart();
                    updateCartBadge();
                    openCart();
                }
            }, [document.createTextNode("Очистить")]),
        ]),
        el("div", {class: "hr"}),
        el("div", {class: "row"}, [
            el("button", {class: "pill", onclick: closeModal}, [document.createTextNode("Продолжить покупки")]),
            el("button", {class: "primary pill", onclick: openCheckout}, [document.createTextNode("Оформить заказ")]),
        ]),
    ]);
    openModal(node);
}

function openCheckout() {
    if (cartCount() === 0) {
        toast("Корзина пустая");
        return;
    }

    setShareButton(null);

    const {sum, cur} = cartTotal();

    state.checkoutOpen = true;
    updateCartBadge();

    const form = el("form", {class: "checkout-form"});
    form.append(
        el("h2", {}, [document.createTextNode("🧾 Оформление заказа")]),
        el("div", {class: "small"}, [document.createTextNode(`К оплате/итого: ${sum} ${cur}`)]),

        el("label", {}, [document.createTextNode("ФИО"), el("input", {
            name: "customerName",
            required: "true",
            autocomplete: "name"
        })]),
        el("label", {}, [document.createTextNode("Телефон"), el("input", {
            name: "phone",
            required: "true",
            autocomplete: "tel"
        })]),
        el("label", {}, [document.createTextNode("Адрес доставки (Город и номер Новой Почты)"), el("textarea", {
            name: "address",
            required: "true",
            rows: "3",
            autocomplete: "street-address"
        })]),
        el("label", {}, [document.createTextNode("Промокод (опционально)"), el("input", {
            name: "promoCode",
            autocomplete: "off"
        })]),
        el("div", {class: "small"}, [document.createTextNode("Скидка по промокоду применяется после проверки.")]),
        el("label", {}, [document.createTextNode("Комментарий (опционально)"), el("textarea", {
            name: "comment",
            rows: "2"
        })]),
        el("div", {class: "hr"}),
        el("div", {class: "row-gapped"}, [
            el("button", {class: "pill", type: "button", onclick: openCart}, [document.createTextNode("← Корзина")]),
            el("button", {class: "primary pill", type: "submit"}, [document.createTextNode("✅ Отправить заказ")]),
        ])
    );

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const fd = new FormData(form);
        const customerName = String(fd.get("customerName") || "").trim();
        const phone = String(fd.get("phone") || "").trim();
        const address = String(fd.get("address") || "").trim();
        const comment = String(fd.get("comment") || "").trim();
        const promoCode = String(fd.get("promoCode") || "").trim();

        if (!state.initData) return toast("initData отсутствует (открой через Telegram)");
        if (!customerName || !phone || !address) return toast("Заполни ФИО/телефон/адрес");

        const items = [];
        for (const [id, it] of state.cart.entries()) {
            if (!it.product) continue;
            items.push({productId: it.product.id, variantId: it.variantId || null, quantity: it.qty});
        }

        try {
            const res = await apiPost("/api/orders", {
                initData: state.initData,
                customerName,
                phone,
                address,
                comment: comment || null,
                promoCode: promoCode || null,
                items,
            });

            state.cart.clear();
            saveCart();

            // сразу подтянем свежие остатки/цены без перерендера и без прыжков
            await refreshProductsSoft();

            openModal(el("div", {}, [
                el("h2", {}, [document.createTextNode("✅ Заказ отправлен")]),
                el("div", {class: "small"}, [document.createTextNode(`Номер: ${res.orderId}`)]),
                el("div", {class: "hr"}),
                el("button", {class: "primary pill", onclick: closeModal}, [document.createTextNode("Ок")])
            ]));

            if (tg) tg.HapticFeedback.notificationOccurred("success");
        } catch (err) {
            console.error(err);
            const msg = err?.message || "";
            if (msg.toLowerCase().includes("promo")) {
                toast("Промокод не принят");
            } else if (msg.toLowerCase().includes("variant")) {
                toast("Выберите вариант товара");
            } else {
                toast("Ошибка оформления заказа");
            }
            if (tg) tg.HapticFeedback.notificationOccurred("error");
        }
    });

    openModal(form);
}

function openCartBtn() {
    openCart();
}

/**
 * Soft refresh:
 * - fetch /api/products
 * - update state.products
 * - update only changed DOM nodes (no full re-render => no scroll jump)
 * - clamp cart quantities if stock decreased
 */
async function refreshProductsSoft() {
    let fresh;
    try {
        fresh = await apiGet(productsEndpoint());
    } catch (e) {
        console.warn("refresh failed", e);
        return;
    }

    const freshById = new Map(fresh.map(p => [String(p.id), p]));
    const oldById = new Map(state.products.map(p => [String(p.id), p]));

    let nextProducts = [];
    if (state.sort === "default") {
        for (const old of state.products) {
            const pid = String(old.id);
            const fp = freshById.get(pid);
            if (fp) nextProducts.push(fp);
        }
        for (const fp of fresh) {
            const pid = String(fp.id);
            if (!oldById.has(pid)) nextProducts.push(fp);
        }
    } else {
        nextProducts = sortedProducts(fresh);
    }
    state.products = nextProducts;
    const nextTags = buildTags(state.products);
    const tagsChanged = JSON.stringify(nextTags) !== JSON.stringify(state.tags);
    state.tags = nextTags;

    // 2) rebind cart products to new objects (cart.product references)
    bindCartProducts();

    // 3) patch existing DOM cards + create missing
    for (const fp of fresh) {
        const pid = String(fp.id);
        let card = document.querySelector(`.card.product[data-product-id="${pid}"]`);
        const old = oldById.get(pid);
        if (!card) {
            card = createProductCard(fp);
        } else {
            updateCardData(card, fp, old);
        }
    }
    updateFilteredProducts();
    if (tagsChanged) renderTagFilters();
    syncProductCards();

    // 4) clamp cart quantities if stock decreased
    let changed = false;
    for (const [key, it] of state.cart.entries()) {
        const parsed = parseCartKey(key);
        const p = freshById.get(String(parsed.productId));
        if (!p) continue;

        if (!p.active) {
            state.cart.delete(key);
            changed = true;
            toast(`Товар скрыт: "${p.title}" удален из корзины`);
            continue;
        }

        const variants = getProductVariants(p);
        if (variants.length) {
            const variant = variants.find((v) => String(v.id) === String(it.variantId));
            if (!variant) {
                state.cart.delete(key);
                changed = true;
                continue;
            }
            const variantStock = Number(variant.stock || 0);
            if (it.qty > variantStock) {
                it.qty = Math.max(0, variantStock);
                if (it.qty === 0) state.cart.delete(key);
                changed = true;
                toast(`Корзина обновлена: "${p.title}" • ${variant.name} доступно ${variantStock}`);
            }
        } else if (it.qty > p.stock) {
            it.qty = Math.max(0, p.stock);
            if (it.qty === 0) state.cart.delete(key);
            changed = true;
            toast(`Корзина обновлена: "${p.title}" доступно ${p.stock}`);
        }
    }
    if (changed) {
        saveCart();
        updateCartBadge();
    }
}

function startProductsAutoRefresh() {
    if (state.refreshTimer) clearInterval(state.refreshTimer);

    const intervalMs = 15000; // 15 сек
    state.refreshTimer = setInterval(async () => {
        if (document.hidden) return;
        await refreshProductsSoft();
    }, intervalMs);

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) refreshProductsSoft();
    });
}

async function loadProducts() {
    const fresh = await apiGet(productsEndpoint());
    state.products = fresh;
    state.tags = buildTags(state.products);
    renderTagFilters();
    bindCartProducts();
    applyFilters();
    startThumbRotator();
    startProductsAutoRefresh();
}

function openProductFromStartParam() {
    if (!state.pendingProductId) return;
    const target = getProductById(state.pendingProductId);
    if (target) {
        openProduct(target);
    } else {
        toast("Товар не найден");
    }
    state.pendingProductId = null;
}

async function boot() {
    loadCart();

    const currentUrl = new URL(window.location.href);

    if (tg) {
        tg.ready();
        tg.expand();
        state.initData = tg.initData || "";
    } else {
        state.initData = currentUrl.searchParams.get("initData") || "";
    }

    const startParam = tg?.initDataUnsafe?.start_param
        || currentUrl.searchParams.get("startapp")
        || currentUrl.searchParams.get("start_param")
        || currentUrl.searchParams.get("productId");
    state.pendingProductId = parseProductIdFromStartParam(startParam);

    await loadAppInfo();

    if (!tg || !tg.initDataUnsafe?.user) {
        showBrowserGate();
        return;
    }

    try {
        state.me = await apiGet(`/api/me?initData=${encodeURIComponent(state.initData)}`);
        const name = state.me.firstName || state.me.username || `id:${state.me.userId}`;
        qs("subtitle").textContent = `Привет, ${name}`;

    } catch (err) {
        console.error(err);
        qs("subtitle").textContent = "Открой через Telegram (невалидный initData)";
    }

    await loadProducts();
    openProductFromStartParam();
    updateCartBadge();

    qs("cartBtn").addEventListener("click", openCartBtn);
    setSortOptionState();
}

boot();

function startThumbRotator() {
    if (state.thumbTimer) clearInterval(state.thumbTimer);

    // инициализация индексов
    for (const p of state.products) {
        const pid = String(p.id);
        if (!state.thumbIndex.has(pid)) state.thumbIndex.set(pid, 0);
    }

    const intervalMs = 5200;
    const staggerMs = 280;
    state.thumbTimer = setInterval(() => {
        const items = [...state.products];
        items.forEach((p, index) => {
            const urls = (p.imageUrls || []).filter(Boolean);
            if (urls.length <= 1) return;

            const pid = String(p.id);
            const imgEl = document.querySelector(`img[data-thumb-id="${pid}"]`);
            if (!imgEl) return;

            const delay = (index % 10) * staggerMs + Math.floor(Math.random() * 120);
            window.setTimeout(() => {
                const cur = state.thumbIndex.get(pid) || 0;
                const next = (cur + 1) % urls.length;
                state.thumbIndex.set(pid, next);
                if (imgEl._fadeTimer) window.clearTimeout(imgEl._fadeTimer);
                imgEl.classList.add("thumb-fade");
                imgEl._fadeTimer = window.setTimeout(() => {
                    imgEl.src = urls[next];
                    requestAnimationFrame(() => imgEl.classList.remove("thumb-fade"));
                }, 240);
            }, delay);
        });
    }, intervalMs);
}

function openGalleryFullscreen(urls, altText, startIndex) {
    const gallery = createGallery(urls, altText, {initialIndex: startIndex, showFullscreenButton: false, fullscreen: true});
    const overlay = el("div", {class: "gallery-fullscreen"});
    const content = el("div", {class: "gallery-fullscreen-content"}, [gallery]);

    const prevOverflow = document.body.style.overflow;
    const close = () => {
        document.body.style.overflow = prevOverflow;
        overlay.remove();
        setViewportZoomEnabled(false);
    };

    const closeBtn = el("button", {
        class: "icon",
        type: "button",
        onclick: () => close(),
    }, [el("i", {class: "fa-solid fa-xmark"})]);
    content.append(closeBtn);
    overlay.append(content);

    document.body.style.overflow = "hidden";
    setViewportZoomEnabled(true);
    document.body.append(overlay);

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
    });
}

function showBrowserGate() {
    const gate = qs("browserGate");
    if (!gate) return;
    const link = qs("browserGateLink");
    const botUsername = normalizeBotUsername(state.appInfo?.botUsername);
    if (botUsername) {
        const href = `https://t.me/${botUsername}`;
        link.href = href;
        link.textContent = `Открыть @${botUsername}`;
    } else {
        link.textContent = "Открыть бота";
        link.href = "#";
    }
    gate.classList.remove("hidden");
}

function createGallery(urls, altText = "", opts = {}) {
    const clean = (urls || []).filter(Boolean);
    if (clean.length === 0) {
        return el("div", {class: "gallery gallery-fallback"}, [document.createTextNode("Нет фото")]);
    }

    const {initialIndex = 0, showFullscreenButton = true, fullscreen = false} = opts;
    let index = Math.max(0, Math.min(clean.length - 1, initialIndex));

    const track = el("div", {class: "gallery-track"});
    for (const u of clean) {
        track.append(
            el("div", {class: "gallery-slide"}, [
                el("img", {src: u, alt: altText})
            ])
        );
    }

    const viewport = el("div", {class: "gallery-viewport"}, [track]);
    const root = el("div", {class: "gallery"}, [viewport]);
    if (fullscreen) root.classList.add("fullscreen");

    const leftBtn = el("button", {class: "gallery-arrow left", type: "button"}, [
        el("i", {class: "fa-solid fa-angle-left"})
    ]);
    const rightBtn = el("button", {class: "gallery-arrow right", type: "button"}, [
        el("i", {class: "fa-solid fa-angle-right"})
    ]);
    const expandBtn = el("button", {class: "gallery-expand", type: "button", "aria-label": "Открыть на весь экран"}, [
        el("i", {class: "fa-solid fa-up-right-and-down-left-from-center"})
    ]);

    const dotsWrap = el("div", {class: "gallery-dots"});
    const dots = clean.map((_, i) =>
        el("button", {class: "gallery-dot", type: "button", "aria-label": `Фото ${i + 1}`})
    );
    dots.forEach(d => dotsWrap.append(d));

    root.append(leftBtn, rightBtn, dotsWrap);
    if (showFullscreenButton) root.append(expandBtn);

    function apply() {
        track.style.transform = `translateX(${-index * 100}%)`;
        dots.forEach((d, i) => d.classList.toggle("active", i === index));
        leftBtn.toggleAttribute("disabled", clean.length <= 1 || index === 0);
        rightBtn.toggleAttribute("disabled", clean.length <= 1 || index === clean.length - 1);
        // если фотка 1 — просто скроем UI
        const hideUi = clean.length <= 1;
        leftBtn.classList.toggle("hidden", hideUi);
        rightBtn.classList.toggle("hidden", hideUi);
        dotsWrap.classList.toggle("hidden", hideUi);
    }

    function setIndex(next) {
        const max = clean.length - 1;
        index = Math.max(0, Math.min(max, next));
        apply();
    }

    leftBtn.addEventListener("click", () => setIndex(index - 1));
    rightBtn.addEventListener("click", () => setIndex(index + 1));
    dots.forEach((d, i) => d.addEventListener("click", () => setIndex(i)));
    expandBtn.addEventListener("click", () => openGalleryFullscreen(clean, altText, index));

    // ===== Swipe (pointer events) =====
    let startX = 0;
    let startY = 0;
    let dragging = false;
    let moved = false;

    viewport.addEventListener("pointerdown", (e) => {
        if (clean.length <= 1) return;
        dragging = true;
        moved = false;
        startX = e.clientX;
        startY = e.clientY;
        viewport.setPointerCapture?.(e.pointerId);
    });

    viewport.addEventListener("pointermove", (e) => {
        if (!dragging) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        // если явно горизонтальный жест — блокируем “внутренний” скролл и тянем трек
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
            moved = true;
            e.preventDefault?.();

            const percent = (dx / viewport.clientWidth) * 100;
            track.style.transition = "none";
            track.style.transform = `translateX(${-(index * 100) + percent}%)`;
        }
    }, {passive: false});

    function endSwipe(e) {
        if (!dragging) return;
        dragging = false;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        track.style.transition = ""; // вернуть transition

        if (!moved || Math.abs(dy) > Math.abs(dx)) {
            apply();
            return;
        }

        const threshold = viewport.clientWidth * 0.18; // 18% ширины
        if (dx <= -threshold) setIndex(index + 1);
        else if (dx >= threshold) setIndex(index - 1);
        else apply();
    }

    viewport.addEventListener("pointerup", endSwipe);
    viewport.addEventListener("pointercancel", (e) => {
        dragging = false;
        apply();
    });

    apply();
    return root;
}
