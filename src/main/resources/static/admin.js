const state = {
    products: [],
    orders: [],
    archivedProducts: [],
    tags: [],
    viewAsCustomer: false,
    activeTab: "catalog",
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
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return text;
    return JSON.parse(text);
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

async function apiDelete(url) {
    const r = await fetch(url, {
        method: "DELETE",
        headers: apiHeaders(),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(text);
    return text;
}

function money(p) {
    return `${p.priceMinor} ${p.currency || "UAH"}`;
}

function formatMoney(value, currency) {
    return `${value} ${currency || "UAH"}`;
}

function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString("ru-RU", {dateStyle: "medium", timeStyle: "short"});
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
        setActiveTab(state.activeTab);
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
    qs("ordersBody").innerHTML = "";
    qs("ordersCount").textContent = "0";
    qs("ordersRevenue").textContent = "0";
    qs("archiveGrid").innerHTML = "";
    qs("archiveMeta").textContent = "Удаленные товары";
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

async function loadOrders() {
    try {
        state.orders = await apiGet("/api/admin/orders");
        renderOrders();
    } catch (err) {
        console.error(err);
        showLogin(true);
    }
}

async function loadArchived() {
    try {
        state.archivedProducts = await apiGet("/api/admin/products/archived");
        renderArchived();
    } catch (err) {
        console.error(err);
        showLogin(true);
    }
}

async function loadTags() {
    try {
        state.tags = await apiGet("/api/admin/tags");
        renderTags();
        renderTagOptions(qs("productTagOptions"), new Set());
    } catch (err) {
        console.error(err);
        showLogin(true);
    }
}

function renderTagOptions(container, selectedIds) {
    if (!container) return;
    container.innerHTML = "";

    if (!state.tags.length) {
        container.append(el("div", {class: "hint"}, [document.createTextNode("Сначала добавь теги во вкладке «Теги».")]));
        return;
    }

    state.tags.forEach((tag) => {
        const id = String(tag.id);
        const label = el("label", {class: "tag-option"}, [
            el("input", {
                type: "checkbox",
                name: "tagIds",
                value: id,
                ...(selectedIds.has(id) ? {checked: "true"} : {}),
            }),
            el("span", {}, [document.createTextNode(tag.name)]),
        ]);
        container.append(label);
    });
}

function renderTagPills(tags) {
    if (!tags || !tags.length) return el("div", {class: "tag-row hidden"}, []);
    const row = el("div", {class: "tag-row"});
    tags.forEach((tag) => {
        row.append(el("span", {class: "tag-pill"}, [document.createTextNode(tag.name)]));
    });
    return row;
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
        const tags = renderTagPills(p.tags);
        const meta = el("div", {class: "meta"}, [
            el("div", {}, [document.createTextNode(`Цена: ${money(p)}`)]),
            el("div", {}, [document.createTextNode(p.stock > 0 ? `Остаток: ${p.stock}` : "Нет в наличии")]),
        ]);
        card.append(imgEl, title, tags, meta);

        if (!state.viewAsCustomer) {
            const actions = el("div", {class: "actions"}, [
                el("button", {
                    class: "pill icon-action",
                    title: "Редактировать",
                    "aria-label": "Редактировать",
                    onclick: (e) => {
                        e.stopPropagation();
                        openEditModal(p);
                    }
                }, [el("i", {class: "fa-solid fa-pen-to-square"})]),
                el("button", {
                    class: `pill icon-action ${p.active ? "ghost" : "danger"}`,
                    title: p.active ? "Спрятать" : "Показать",
                    "aria-label": p.active ? "Спрятать" : "Показать",
                    onclick: async (e) => {
                        e.stopPropagation();
                        await toggleActive(p);
                    }
                }, [el("i", {class: p.active ? "fa-solid fa-eye-slash" : "fa-solid fa-eye"})]),
                el("button", {
                    class: "pill danger icon-action",
                    title: "Удалить",
                    "aria-label": "Удалить",
                    onclick: async (e) => {
                        e.stopPropagation();
                        await archiveProduct(p, true);
                    }
                }, [el("i", {class: "fa-solid fa-trash"})]),
            ]);
            card.append(actions);
            card.addEventListener("click", () => openEditModal(p));
        } else {
            card.addEventListener("click", () => openPreviewModal(p));
        }

        grid.append(card);
    }
}

function renderOrders() {
    const tbody = qs("ordersBody");
    tbody.innerHTML = "";

    const totalOrders = state.orders.length;
    let revenue = 0;
    let currency = "UAH";
    const successStatuses = new Set(["APPROVED", "SHIPPED"]);

    for (const order of state.orders) {
        if (successStatuses.has(order.status)) {
            revenue += order.totalMinor || 0;
        }
        currency = order.currency || currency;
        const itemsWrap = el("div", {class: "order-items"});

        (order.items || []).forEach((item) => {
            itemsWrap.append(
                el("div", {class: "order-item"}, [
                    document.createTextNode(`${item.titleSnapshot} × ${item.quantity}`),
                    el("span", {}, [document.createTextNode(formatMoney(item.priceMinorSnapshot, order.currency))]),
                ])
            );
        });

        const row = el("tr", {}, [
            el("td", {}, [document.createTextNode(formatDate(order.createdAt))]),
            el("td", {}, [document.createTextNode(order.id)]),
            el("td", {}, [
                document.createTextNode(order.customerName || ""),
                order.tgUsername ? el("div", {class: "hint"}, [document.createTextNode(`@${order.tgUsername}`)]) : el("div", {}),
            ]),
            el("td", {}, [document.createTextNode(order.phone || "")]),
            el("td", {}, [document.createTextNode(order.address || "")]),
            el("td", {}, [itemsWrap]),
            el("td", {}, [document.createTextNode(formatMoney(order.totalMinor, order.currency))]),
            el("td", {}, [document.createTextNode(order.status || "")]),
            el("td", {}, [
                el("button", {
                    class: "pill danger icon-action",
                    title: "Удалить",
                    "aria-label": "Удалить",
                    onclick: async (e) => {
                        e.stopPropagation();
                        if (!confirm("Удалить заказ навсегда?")) return;
                        try {
                            await apiDelete(`/api/admin/orders/${order.id}`);
                            state.orders = state.orders.filter((item) => item.id !== order.id);
                            renderOrders();
                        } catch (err) {
                            console.error(err);
                            showLogin(true);
                        }
                    }
                }, [el("i", {class: "fa-solid fa-trash"})]),
            ]),
        ]);
        tbody.append(row);
    }

    qs("ordersCount").textContent = String(totalOrders);
    qs("ordersRevenue").textContent = formatMoney(revenue, currency);
    qs("ordersEmpty").classList.toggle("hidden", totalOrders > 0);
}

function renderArchived() {
    const grid = qs("archiveGrid");
    grid.innerHTML = "";
    const total = state.archivedProducts.length;
    qs("archiveMeta").textContent = `Архив: ${total}`;

    for (const p of state.archivedProducts) {
        const img = (p.imageUrls && p.imageUrls.length > 0) ? p.imageUrls[0] : null;
        const card = el("div", {class: "card", "data-product-id": String(p.id)});
        const imgEl = img
            ? el("img", {src: img, alt: p.title})
            : el("div", {class: "img-fallback"}, [document.createTextNode("Нет фото")]);
        const title = el("div", {class: "card-title"}, [
            document.createTextNode(p.title),
            el("span", {class: "status-tag"}, [document.createTextNode("Архив")]),
        ]);
        const tags = renderTagPills(p.tags);
        const meta = el("div", {class: "meta"}, [
            el("div", {}, [document.createTextNode(`Цена: ${money(p)}`)]),
            el("div", {}, [document.createTextNode(p.stock > 0 ? `Остаток: ${p.stock}` : "Нет в наличии")]),
        ]);
        const actions = el("div", {class: "actions"}, [
            el("button", {
                class: "pill icon-action",
                title: "Вернуть",
                "aria-label": "Вернуть",
                onclick: async (e) => {
                    e.stopPropagation();
                    await archiveProduct(p, false);
                }
            }, [el("i", {class: "fa-solid fa-rotate-left"})]),
        ]);

        card.append(imgEl, title, tags, meta, actions);
        grid.append(card);
    }

    qs("archiveEmpty").classList.toggle("hidden", total > 0);
}

function setActiveTab(tab) {
    state.activeTab = tab;
    qs("tabCatalog").classList.toggle("active", tab === "catalog");
    qs("tabOrders").classList.toggle("active", tab === "orders");
    qs("tabArchive").classList.toggle("active", tab === "archive");
    qs("tabTags").classList.toggle("active", tab === "tags");
    qs("catalogSection").classList.toggle("hidden", tab !== "catalog");
    qs("ordersSection").classList.toggle("hidden", tab !== "orders");
    qs("archiveSection").classList.toggle("hidden", tab !== "archive");
    qs("tagsSection").classList.toggle("hidden", tab !== "tags");
    if (tab === "orders") {
        qs("catalogMeta").textContent = "История покупок";
        loadOrders();
    } else if (tab === "archive") {
        qs("catalogMeta").textContent = "Архив товаров";
        loadArchived();
    } else if (tab === "tags") {
        qs("catalogMeta").textContent = "Теги товаров";
        loadTags();
    } else {
        loadProducts();
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

async function archiveProduct(p, archived) {
    try {
        const updated = await apiPatch(`/api/admin/products/${p.id}/archived`, {archived});
        if (archived) {
            state.products = state.products.filter((item) => String(item.id) !== String(updated.id));
            state.archivedProducts = [updated, ...state.archivedProducts];
        } else {
            state.archivedProducts = state.archivedProducts.filter((item) => String(item.id) !== String(updated.id));
            state.products = [updated, ...state.products];
        }
        if (state.activeTab === "archive") {
            renderArchived();
        } else {
            renderProducts();
        }
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
    const selectedTags = new Set((p.tags || []).map((tag) => String(tag.id)));
    const tagOptions = el("div", {class: "tag-options"});
    renderTagOptions(tagOptions, selectedTags);
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
        el("div", {class: "tag-select"}, [
            el("div", {class: "tag-select-title"}, [document.createTextNode("Теги")]),
            tagOptions,
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
            tagIds: (fd.getAll("tagIds") || []).map((id) => String(id)),
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
            tagIds: (fd.getAll("tagIds") || []).map((id) => String(id)),
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

function renderTags() {
    const list = qs("tagsList");
    list.innerHTML = "";
    state.tags.forEach((tag) => {
        const row = el("div", {class: "tag-item"}, [
            el("span", {class: "tag-pill"}, [document.createTextNode(tag.name)]),
            el("button", {
                class: "pill danger icon-action",
                title: "Удалить",
                "aria-label": "Удалить",
                onclick: async () => {
                    if (!confirm(`Удалить тег "${tag.name}"?`)) return;
                    try {
                        await apiDelete(`/api/admin/tags/${tag.id}`);
                        state.tags = state.tags.filter((t) => String(t.id) !== String(tag.id));
                        renderTags();
                        renderTagOptions(qs("productTagOptions"), new Set());
                    } catch (err) {
                        console.error(err);
                        showLogin(true);
                    }
                }
            }, [el("i", {class: "fa-solid fa-trash"})]),
        ]);
        list.append(row);
    });
    qs("tagsEmpty").classList.toggle("hidden", state.tags.length > 0);
    qs("tagsMeta").textContent = `Всего тегов: ${state.tags.length}`;
}

function boot() {
    qs("loginForm").addEventListener("submit", handleLogin);
    qs("logoutBtn").addEventListener("click", logout);
    qs("refreshBtn").addEventListener("click", () => setActiveTab(state.activeTab));
    qs("customerToggle").addEventListener("change", (e) => {
        state.viewAsCustomer = e.target.checked;
        qs("adminPanel").classList.toggle("hidden", state.viewAsCustomer);
        document.querySelector(".layout")?.classList.toggle("single-column", state.viewAsCustomer);
        qs("tabOrders").classList.toggle("hidden", state.viewAsCustomer);
        qs("tabArchive").classList.toggle("hidden", state.viewAsCustomer);
        qs("tabTags").classList.toggle("hidden", state.viewAsCustomer);
        if (state.viewAsCustomer && state.activeTab === "orders") {
            setActiveTab("catalog");
        } else if (state.viewAsCustomer && state.activeTab === "archive") {
            setActiveTab("catalog");
        } else if (state.viewAsCustomer && state.activeTab === "tags") {
            setActiveTab("catalog");
        } else {
            setActiveTab(state.activeTab);
        }
    });
    qs("tabCatalog").addEventListener("click", () => setActiveTab("catalog"));
    qs("tabOrders").addEventListener("click", () => setActiveTab("orders"));
    qs("tabArchive").addEventListener("click", () => setActiveTab("archive"));
    qs("tabTags").addEventListener("click", () => setActiveTab("tags"));
    qs("closeModal").addEventListener("click", closeModal);
    bindForm();
    qs("tagForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(qs("tagForm"));
        const name = String(fd.get("name") || "").trim();
        if (!name) return;
        try {
            const tag = await apiPost("/api/admin/tags", {name});
            if (!state.tags.some((t) => String(t.id) === String(tag.id))) {
                state.tags = [...state.tags, tag].sort((a, b) => a.name.localeCompare(b.name));
            }
            qs("tagForm").reset();
            renderTags();
            renderTagOptions(qs("productTagOptions"), new Set());
        } catch (err) {
            console.error(err);
            showLogin(true);
        }
    });

    if (state.password) {
        showLogin(false);
        loadTags();
        setActiveTab("catalog");
    } else {
        showLogin(true);
    }
}

boot();
