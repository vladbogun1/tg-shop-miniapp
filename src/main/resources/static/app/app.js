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
    cart: new Map(), // id -> {product, qty}
    mainBtnBound: false,
    sort: "default",

    thumbTimer: null,
    thumbIndex: new Map(), // productId -> index

    refreshTimer: null, // auto refresh timer
};

function loadCart() {
    try {
        const raw = localStorage.getItem("tgshop_cart");
        if (!raw) return;
        const obj = JSON.parse(raw);
        for (const [id, qty] of Object.entries(obj)) {
            state.cart.set(id, {product: null, qty: Number(qty) || 0});
        }
    } catch {
    }
}

function saveCart() {
    const obj = {};
    for (const [id, item] of state.cart.entries()) obj[id] = item.qty;
    localStorage.setItem("tgshop_cart", JSON.stringify(obj));
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


function productsEndpoint() {
    return "/api/products";
}

function ensureThumbIndex(p) {
    const pid = String(p.id);
    if (!state.thumbIndex.has(pid)) state.thumbIndex.set(pid, 0);
}

function bindCartProducts() {
    const byId = new Map(state.products.map(p => [String(p.id), p]));
    for (const [id, item] of state.cart.entries()) {
        item.product = byId.get(String(id)) || null;
        if (!item.product) state.cart.delete(id);
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
    return list;
}

function syncProductCards() {
    const grid = qs("grid");
    const existing = grid.querySelectorAll(".card.product");
    const keepIds = new Set(state.products.map(p => String(p.id)));
    for (const card of existing) {
        const pid = card.getAttribute("data-product-id");
        if (!keepIds.has(String(pid))) card.remove();
    }

    const fragment = document.createDocumentFragment();
    for (const p of state.products) {
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

    for (const p of state.products) {
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
}

function openSortModal() {
    const modal = qs("sortModal");
    modal.classList.remove("hidden");
    setSortOptionState();
}

function closeSortModal() {
    qs("sortModal").classList.add("hidden");
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
    state.products = sortedProducts(state.products);
    syncProductCards();
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

function addToCart(productId, delta) {
    const pid = String(productId);
    const p = state.products.find(x => String(x.id) === pid);
    if (!p) return;
    if (!p.active) return toast("Товар скрыт");
    if (p.stock <= 0) return toast("Нет в наличии");

    const cur = state.cart.get(pid) || {product: p, qty: 0};
    const next = cur.qty + delta;

    if (next <= 0) {
        state.cart.delete(pid);
    } else {
        cur.qty = Math.min(next, p.stock);
        cur.product = p;
        state.cart.set(pid, cur);
    }

    saveCart();
    updateCartBadge();
    toast(delta > 0 ? "Добавлено в корзину" : "Обновлено");
}

function updateCartBadge() {
    qs("cartCount").textContent = String(cartCount());
}

function openProduct(p) {
    const gallery = createGallery(p.imageUrls || [], p.title);

    const addBtn = el("button", {
        class: "primary pill",
        onclick: () => addToCart(p.id, 1)
    }, [document.createTextNode("В корзину")]);
    addBtn.disabled = !p.active || !(p.stock > 0);

    const node = el("div", {}, [
        el("h2", {}, [document.createTextNode(p.title)]),
        el("div", {class: "row-column"}, [
            el("div", {class: "column"}, [
                el("div", {class: "small"}, [document.createTextNode(money(p))]),
                el("div", {class: "small"}, [document.createTextNode(p.stock > 0 ? `В наличии: ${p.stock}` : "Нет в наличии")]),
            ]),
            el("div", {class: "column"}, [
                addBtn,
            ]),
        ]),
        el("div", {class: "hr"}),
        el("div", {}, [document.createTextNode(p.description || "Без описания")]),
        el("div", {class: "hr"}),
        gallery,
        el("div", {class: "hr"}),

    ]);

    openModal(node);
}

function openCart() {
    const lines = [];
    for (const [id, it] of state.cart.entries()) {
        if (!it.product) continue;
        const p = it.product;

        lines.push(el("div", {class: "cart-line"}, [
            el("div", {}, [
                el("div", {style: "font-weight:700"}, [document.createTextNode(p.title)]),
                el("div", {class: "small"}, [document.createTextNode(money(p))]),
            ]),
            el("div", {class: "qty"}, [
                el("button", {
                    onclick: () => {
                        addToCart(id, -1);
                        openCart();
                    }
                }, [document.createTextNode("−")]),
                el("div", {}, [document.createTextNode(String(it.qty))]),
                el("button", {
                    onclick: () => {
                        addToCart(id, +1);
                        openCart();
                    }
                }, [document.createTextNode("+")]),
            ]),
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

    const {sum, cur} = cartTotal();

    const form = el("form", {class: "card"});
    form.append(
        el("h2", {}, [document.createTextNode("🧾 Оформление заказа")]),
        el("div", {class: "small"}, [document.createTextNode(`К оплате/итого: ${sum} ${cur}`)]),

        el("label", {}, [document.createTextNode("Имя"), el("input", {
            name: "customerName",
            required: "true",
            autocomplete: "name"
        })]),
        el("label", {}, [document.createTextNode("Телефон"), el("input", {
            name: "phone",
            required: "true",
            autocomplete: "tel"
        })]),
        el("label", {}, [document.createTextNode("Адрес доставки"), el("textarea", {
            name: "address",
            required: "true",
            rows: "3",
            autocomplete: "street-address"
        })]),
        el("label", {}, [document.createTextNode("Комментарий (опционально)"), el("textarea", {
            name: "comment",
            rows: "2"
        })]),
        el("div", {class: "hr"}),
        el("div", {class: "row"}, [
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

        if (!state.initData) return toast("initData отсутствует (открой через Telegram)");
        if (!customerName || !phone || !address) return toast("Заполни имя/телефон/адрес");

        const items = [];
        for (const [id, it] of state.cart.entries()) {
            if (!it.product) continue;
            items.push({productId: it.product.id, quantity: it.qty});
        }

        try {
            const res = await apiPost("/api/orders", {
                initData: state.initData,
                customerName,
                phone,
                address,
                comment: comment || null,
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
            toast("Ошибка оформления заказа");
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
    syncProductCards();

    // 4) clamp cart quantities if stock decreased
    let changed = false;
    for (const [id, it] of state.cart.entries()) {
        const p = freshById.get(String(id));
        if (!p) continue;

        if (!p.active) {
            state.cart.delete(String(id));
            changed = true;
            toast(`Товар скрыт: "${p.title}" удален из корзины`);
            continue;
        }

        if (it.qty > p.stock) {
            it.qty = Math.max(0, p.stock);
            if (it.qty === 0) state.cart.delete(String(id));
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
    state.products = sortedProducts(fresh);
    bindCartProducts();
    renderProducts();
    startThumbRotator();
    startProductsAutoRefresh();
}

async function boot() {
    loadCart();

    if (tg) {
        tg.ready();
        tg.expand();
        state.initData = tg.initData || "";
    } else {
        const u = new URL(window.location.href);
        state.initData = u.searchParams.get("initData") || "";
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

    state.thumbTimer = setInterval(() => {
        for (const p of state.products) {
            const urls = (p.imageUrls || []).filter(Boolean);
            if (urls.length <= 1) continue;

            const pid = String(p.id);
            const imgEl = document.querySelector(`img[data-thumb-id="${pid}"]`);
            if (!imgEl) continue;

            const cur = state.thumbIndex.get(pid) || 0;
            const next = (cur + 1) % urls.length;
            state.thumbIndex.set(pid, next);
            imgEl.src = urls[next];
        }
    }, 5000);
}

function createGallery(urls, altText = "") {
    const clean = (urls || []).filter(Boolean);
    if (clean.length === 0) {
        return el("div", {class: "gallery gallery-fallback"}, [document.createTextNode("Нет фото")]);
    }

    let index = 0;

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

    const leftBtn = el("button", {class: "gallery-arrow left", type: "button"}, [
        el("i", {class: "fa-solid fa-angle-left"})
    ]);
    const rightBtn = el("button", {class: "gallery-arrow right", type: "button"}, [
        el("i", {class: "fa-solid fa-angle-right"})
    ]);

    const dotsWrap = el("div", {class: "gallery-dots"});
    const dots = clean.map((_, i) =>
        el("button", {class: "gallery-dot", type: "button", "aria-label": `Фото ${i + 1}`})
    );
    dots.forEach(d => dotsWrap.append(d));

    root.append(leftBtn, rightBtn, dotsWrap);

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
