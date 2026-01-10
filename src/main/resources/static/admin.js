const state = {
    products: [],
    viewAsCustomer: false,
    password: sessionStorage.getItem("tgshop_admin_password") || "",
};

function qs(id) {
    return document.getElementById(id);
}

function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") node.className = v;
        else if (k === "html") node.innerHTML = v;
        else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.substring(2), v);
        else node.setAttribute(k, v);
    }
    for (const child of children) node.append(child);
    return node;
}

function apiHeaders(extra = {}) {
    const headers = {
        "Accept": "application/json",
        "ngrok-skip-browser-warning": "true",
        ...extra,
    };
    if (state.password) headers["X-Admin-Password"] = state.password;
    return headers;
}

async function apiGet(url) {
    const r = await fetch(url, {headers: apiHeaders()});
    const text = await r.text();
    if (!r.ok) throw new Error(text);
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return text;
    return JSON.parse(text);
}

async function apiPost(url, body) {
    const r = await fetch(url, {
        method: "POST",
        headers: apiHeaders({"Content-Type": "application/json"}),
        body: JSON.stringify(body),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(text);
    return text;
}

async function apiPatch(url, body) {
    const r = await fetch(url, {
        method: "PATCH",
        headers: apiHeaders({"Content-Type": "application/json"}),
        body: JSON.stringify(body),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(text);
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return text;
    return JSON.parse(text);
}

function money(p) {
    return `${p.priceMinor} ${p.currency || "UAH"}`;
}

function showLogin(show) {
    qs("loginOverlay").classList.toggle("hidden", !show);
    if (show) {
        qs("loginError").classList.add("hidden");
        const input = qs("loginForm").querySelector("input[name=password]");
        input.value = "";
        input.focus();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const fd = new FormData(qs("loginForm"));
    const password = String(fd.get("password") || "").trim();
    if (!password) return;
    try {
        await apiPost("/api/admin/login", {password});
        state.password = password;
        sessionStorage.setItem("tgshop_admin_password", password);
        showLogin(false);
        await loadProducts();
    } catch (err) {
        console.error(err);
        qs("loginError").classList.remove("hidden");
    }
}

function logout() {
    state.password = "";
    sessionStorage.removeItem("tgshop_admin_password");
    showLogin(true);
    qs("productGrid").innerHTML = "";
    qs("catalogMeta").textContent = "Нужен вход";
}

async function loadProducts() {
    qs("catalogMeta").textContent = "Загрузка...";
    try {
        state.products = state.viewAsCustomer
            ? await apiGet("/api/products")
            : await apiGet("/api/admin/products");
        renderProducts();
    } catch (err) {
        console.error(err);
        qs("catalogMeta").textContent = "Ошибка загрузки";
        if (!state.viewAsCustomer) showLogin(true);
    }
}

function renderProducts() {
    const grid = qs("productGrid");
    grid.innerHTML = "";
    const total = state.products.length;
    qs("catalogMeta").textContent = state.viewAsCustomer
        ? `Покупательский вид • ${total}`
        : `Всего товаров: ${total}`;

    for (const p of state.products) {
        const img = (p.imageUrls && p.imageUrls.length > 0) ? p.imageUrls[0] : null;
        const card = el("div", {class: "card", "data-product-id": String(p.id)});
        const imgEl = img
            ? el("img", {src: img, alt: p.title})
            : el("div", {class: "img-fallback"}, [document.createTextNode("Нет фото")]);
        const title = el("div", {class: "card-title"}, [
            document.createTextNode(p.title),
            (!p.active && !state.viewAsCustomer)
                ? el("span", {class: "status-tag"}, [document.createTextNode("Скрыт")])
                : el("span", {class: "status-tag hidden"}, [])
        ]);
        const meta = el("div", {class: "meta"}, [
            el("div", {}, [document.createTextNode(`Цена: ${money(p)}`)]),
            el("div", {}, [document.createTextNode(p.stock > 0 ? `Остаток: ${p.stock}` : "Нет в наличии")]),
        ]);
        card.append(imgEl, title, meta);

        if (!state.viewAsCustomer) {
            const actions = el("div", {class: "actions"}, [
                el("button", {
                    class: "pill",
                    onclick: (e) => {
                        e.stopPropagation();
                        openEditModal(p);
                    }
                }, [document.createTextNode("Редактировать")]),
                el("button", {
                    class: `pill ${p.active ? "ghost" : "danger"}`,
                    onclick: async (e) => {
                        e.stopPropagation();
                        await toggleActive(p);
                    }
                }, [document.createTextNode(p.active ? "Спрятать" : "Показать")]),
            ]);
            card.append(actions);
            card.addEventListener("click", () => openEditModal(p));
        } else {
            card.addEventListener("click", () => openPreviewModal(p));
        }

        grid.append(card);
    }
}

async function toggleActive(p) {
    try {
        const updated = await apiPatch(`/api/admin/products/${p.id}/active`, {active: !p.active});
        state.products = state.products.map((item) => String(item.id) === String(updated.id) ? updated : item);
        renderProducts();
    } catch (err) {
        console.error(err);
        showLogin(true);
    }
}

function parseImageUrls(raw) {
    return raw
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function openEditModal(p) {
    const form = el("form", {class: "stack"});
    form.append(
        el("h2", {}, [document.createTextNode("Редактирование товара")]),
        el("label", {}, [
            document.createTextNode("Название"),
            el("input", {name: "title", value: p.title, required: "true"}),
        ]),
        el("label", {}, [
            document.createTextNode("Описание"),
            el("textarea", {name: "description", rows: "4"}, [p.description || ""]),
        ]),
        el("div", {class: "row"}, [
            el("label", {}, [
                document.createTextNode("Цена"),
                el("input", {name: "priceMinor", type: "number", min: "0", value: String(p.priceMinor)}),
            ]),
            el("label", {}, [
                document.createTextNode("Валюта"),
                el("input", {name: "currency", value: p.currency || "UAH"}),
            ]),
        ]),
        el("label", {}, [
            document.createTextNode("Остаток"),
            el("input", {name: "stock", type: "number", min: "0", value: String(p.stock)}),
        ]),
        el("label", {}, [
            document.createTextNode("URL картинок (перезапишет старые)"),
            el("textarea", {name: "imageUrls", rows: "3"}, [(p.imageUrls || []).join("\n")]),
        ]),
        el("label", {class: "checkbox"}, [
            el("input", {type: "checkbox", name: "active", ...(p.active ? {checked: "true"} : {})}),
            el("span", {}, [document.createTextNode("Показывать в каталоге")]),
        ]),
        el("div", {class: "row"}, [
            el("button", {type: "button", class: "ghost", onclick: closeModal}, [document.createTextNode("Отмена")]),
            el("button", {type: "submit", class: "primary"}, [document.createTextNode("Сохранить")]),
        ]),
    );

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const payload = {
            title: String(fd.get("title") || "").trim(),
            description: String(fd.get("description") || "").trim() || null,
            priceMinor: Number(fd.get("priceMinor") || 0),
            currency: String(fd.get("currency") || "UAH").trim(),
            stock: Number(fd.get("stock") || 0),
            imageUrls: parseImageUrls(String(fd.get("imageUrls") || "")),
            active: Boolean(fd.get("active")),
        };

        if (!payload.title) return;
        try {
            const updated = await apiPatch(`/api/admin/products/${p.id}`, payload);
            state.products = state.products.map((item) => String(item.id) === String(updated.id) ? updated : item);
            renderProducts();
            closeModal();
        } catch (err) {
            console.error(err);
            showLogin(true);
        }
    });

    openModal(form);
}

function openPreviewModal(p) {
    const body = el("div", {class: "stack"}, [
        el("h2", {}, [document.createTextNode(p.title)]),
        el("div", {class: "hint"}, [document.createTextNode(money(p))]),
        el("div", {}, [document.createTextNode(p.description || "Без описания")]),
    ]);

    if (p.imageUrls && p.imageUrls.length) {
        const imgWrap = el("div", {class: "preview-images"}, []);
        p.imageUrls.forEach((url) => {
            imgWrap.append(el("img", {src: url, alt: p.title}));
        });
        body.append(imgWrap);
    }

    openModal(body);
}

function openModal(node) {
    qs("modalBody").innerHTML = "";
    qs("modalBody").append(node);
    qs("modal").classList.remove("hidden");
}

function closeModal() {
    qs("modal").classList.add("hidden");
}

function bindForm() {
    qs("productForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(qs("productForm"));
        const payload = {
            title: String(fd.get("title") || "").trim(),
            description: String(fd.get("description") || "").trim() || null,
            priceMinor: Number(fd.get("priceMinor") || 0),
            currency: String(fd.get("currency") || "UAH").trim(),
            stock: Number(fd.get("stock") || 0),
            imageUrls: parseImageUrls(String(fd.get("imageUrls") || "")),
            active: Boolean(fd.get("active")),
        };
        if (!payload.title) return;
        try {
            await apiPost("/api/admin/products", payload);
            qs("productForm").reset();
            await loadProducts();
        } catch (err) {
            console.error(err);
            showLogin(true);
        }
    });
}

function boot() {
    qs("loginForm").addEventListener("submit", handleLogin);
    qs("logoutBtn").addEventListener("click", logout);
    qs("refreshBtn").addEventListener("click", loadProducts);
    qs("customerToggle").addEventListener("change", (e) => {
        state.viewAsCustomer = e.target.checked;
        qs("adminPanel").classList.toggle("hidden", state.viewAsCustomer);
        document.querySelector(".layout")?.classList.toggle("single-column", state.viewAsCustomer);
        loadProducts();
    });
    qs("closeModal").addEventListener("click", closeModal);
    qs("modal").addEventListener("click", (e) => {
        if (e.target === qs("modal")) closeModal();
    });
    bindForm();

    if (state.password) {
        showLogin(false);
        loadProducts();
    } else {
        showLogin(true);
    }
}

boot();
