const state = {
    products: [],
    orders: [],
    archivedProducts: [],
    tags: [],
    promoCodes: [],
    paymentTemplate: "",
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

async function apiPut(url, body) {
    const r = await fetch(url, {
        method: "PUT",
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

function handleAdminError(err, fallback = "Ошибка") {
    const msg = String(err?.message || "").trim();
    if (msg.includes("Not admin") || msg.includes("Bad initData") || msg.includes("Bad password")) {
        showLogin(true);
        return;
    }
    alert(msg || fallback);
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
    qs("promoList").innerHTML = "";
    qs("promoMeta").textContent = "Промокоды магазина";
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
        renderTagPicker(qs("productTagPicker"), new Set(getSelectedTagIds(qs("productTagPicker"))));
    } catch (err) {
        console.error(err);
        showLogin(true);
    }
}

async function loadPromoCodes() {
    try {
        state.promoCodes = await apiGet("/api/admin/promocodes");
        renderPromoCodes();
    } catch (err) {
        console.error(err);
        showLogin(true);
    }
}

async function loadPaymentTemplate() {
    try {
        const data = await apiGet("/api/admin/settings/payment-template");
        state.paymentTemplate = data.html || "";
        const editor = qs("paymentTemplateEditor");
        if (editor) {
            editor.innerHTML = state.paymentTemplate;
            updatePaymentPreview();
        }
    } catch (err) {
        console.error(err);
        handleAdminError(err, "Не удалось загрузить шаблон оплаты");
    }
}

function updatePaymentPreview() {
    const editor = qs("paymentTemplateEditor");
    const preview = qs("paymentTemplatePreview");
    if (!editor || !preview) return;
    preview.innerHTML = editor.innerHTML;
}

function applyPaymentCommand(command) {
    const editor = qs("paymentTemplateEditor");
    if (!editor) return;
    editor.focus();

    if (command === "blockquote") {
        document.execCommand("formatBlock", false, "blockquote");
        return updatePaymentPreview();
    }
    if (command === "code") {
        document.execCommand("insertHTML", false, "<code>Код</code>");
        return updatePaymentPreview();
    }
    if (command === "pre") {
        document.execCommand("insertHTML", false, "<pre>Кодовый блок</pre>");
        return updatePaymentPreview();
    }
    if (command === "link") {
        const url = prompt("Введите ссылку");
        if (url) document.execCommand("createLink", false, url);
        return updatePaymentPreview();
    }
    if (command === "line") {
        document.execCommand("insertHTML", false, "<div>────────────</div>");
        return updatePaymentPreview();
    }
    document.execCommand(command, false, null);
    updatePaymentPreview();
}

async function savePaymentTemplate() {
    const editor = qs("paymentTemplateEditor");
    const status = qs("paymentTemplateStatus");
    if (!editor) return;
    const html = editor.innerHTML.trim();
    if (!html) return;
    try {
        const data = await apiPut("/api/admin/settings/payment-template", {html});
        state.paymentTemplate = data.html || "";
        if (status) {
            status.textContent = "Шаблон сохранён";
        }
    } catch (err) {
        console.error(err);
        handleAdminError(err, "Не удалось сохранить шаблон");
    }
}

function getSelectedTagIds(container) {
    if (!container) return [];
    try {
        const raw = container.dataset.selected || "[]";
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

function getSelectedVariants(container) {
    if (!container) return [];
    try {
        const raw = container.dataset.variants || "[]";
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

function renderVariantPicker(container, variants, onChange) {
    if (!container) return;
    container.innerHTML = "";
    const selected = Array.isArray(variants) ? variants : [];
    container.dataset.variants = JSON.stringify(selected);

    if (!selected.length) {
        container.append(el("div", {class: "hint"}, [document.createTextNode("Варианты не добавлены.")]));
    }

    selected.forEach((variant, index) => {
        const chip = el("span", {class: "variant-chip"}, [
            document.createTextNode(`${variant.name} · ${variant.stock}`),
            el("button", {
                type: "button",
                title: "Удалить",
                "aria-label": "Удалить",
                onclick: () => {
                    const next = selected.filter((_, i) => i !== index);
                    renderVariantPicker(container, next, onChange);
                    onChange?.(next);
                }
            }, [document.createTextNode("×")]),
        ]);
        container.append(chip);
    });

    container.append(el("button", {
        type: "button",
        class: "variant-add",
        title: "Добавить вариант",
        "aria-label": "Добавить вариант",
        onclick: () => openVariantModal((variant) => {
            const next = [...selected, variant];
            renderVariantPicker(container, next, onChange);
            onChange?.(next);
        })
    }, [el("i", {class: "fa-solid fa-plus"})]));
}

function openVariantModal(onSave) {
    const overlay = el("div", {class: "modal modal-secondary"});
    const card = el("div", {class: "modal-card"});
    const closeBtn = el("button", {class: "icon", type: "button"}, [el("i", {class: "fa-solid fa-xmark"})]);
    const form = el("form", {class: "stack"});
    form.append(
        el("h2", {}, [document.createTextNode("Новый вариант")]),
        el("label", {}, [
            document.createTextNode("Название"),
            el("input", {name: "name", required: "true"}),
        ]),
        el("label", {}, [
            document.createTextNode("Остаток"),
            el("input", {name: "stock", type: "number", min: "0", value: "0"}),
        ]),
        el("div", {class: "row"}, [
            el("button", {type: "button", class: "ghost", onclick: () => overlay.remove()}, [document.createTextNode("Отмена")]),
            el("button", {type: "submit", class: "primary"}, [document.createTextNode("Добавить")]),
        ]),
    );

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const name = String(fd.get("name") || "").trim();
        const stock = Math.max(0, Number(fd.get("stock") || 0));
        if (!name) return;
        onSave?.({name, stock});
        overlay.remove();
    });

    closeBtn.addEventListener("click", () => overlay.remove());
    card.append(closeBtn, form);
    overlay.append(card);
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.remove();
    });
    document.body.append(overlay);
}

function updateStockInput(stockInput, variants) {
    if (!stockInput) return;
    if (variants.length) {
        const total = variants.reduce((sum, v) => sum + Number(v.stock || 0), 0);
        stockInput.value = String(total);
        stockInput.disabled = true;
        stockInput.parentElement?.classList.add("disabled");
    } else {
        stockInput.disabled = false;
        stockInput.parentElement?.classList.remove("disabled");
    }
}

function closeAllTagDropdowns() {
    document.querySelectorAll(".tag-dropdown").forEach((node) => node.classList.add("hidden"));
}

function positionDropdown(dropdown, anchor) {
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(320, rect.width);
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    dropdown.style.width = `${width}px`;
    dropdown.style.left = `${left}px`;
    dropdown.style.top = `${rect.bottom + 8}px`;
}

function renderTagPicker(container, selectedIds) {
    if (!container) return;
    container.innerHTML = "";
    const selected = new Set(selectedIds || []);
    container.dataset.selected = JSON.stringify([...selected]);

    if (!state.tags.length) {
        container.append(el("div", {class: "hint"}, [document.createTextNode("Сначала добавь теги во вкладке «Теги».")]));
        return;
    }

    [...selected].forEach((id) => {
        const tag = state.tags.find((item) => String(item.id) === String(id));
        if (!tag) return;
        const chip = el("span", {class: "tag-chip"}, [
            document.createTextNode(tag.name),
            el("button", {
                type: "button",
                title: "Удалить тег",
                "aria-label": "Удалить тег",
                onclick: () => {
                    selected.delete(id);
                    renderTagPicker(container, selected);
                }
            }, [el("i", {class: "fa-solid fa-xmark"})]),
        ]);
        container.append(chip);
    });

    const dropdown = el("div", {class: "tag-dropdown hidden"});
    state.tags.forEach((tag) => {
        const id = String(tag.id);
        if (selected.has(id)) return;
        dropdown.append(el("button", {
            type: "button",
            class: "tag-option",
            onclick: () => {
                selected.add(id);
                renderTagPicker(container, selected);
            },
        }, [document.createTextNode(tag.name)]));
    });

    container.append(
        el("button", {
            type: "button",
            class: "tag-add",
            title: "Добавить тег",
            "aria-label": "Добавить тег",
            onclick: (e) => {
                e.stopPropagation();
                const shouldOpen = dropdown.classList.contains("hidden");
                closeAllTagDropdowns();
                if (shouldOpen) {
                    positionDropdown(dropdown, container);
                }
                dropdown.classList.toggle("hidden", !shouldOpen);
            },
        }, [el("i", {class: "fa-solid fa-plus"})]),
        dropdown
    );
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
            const variantLabel = item.variantNameSnapshot ? ` (${item.variantNameSnapshot})` : "";
            itemsWrap.append(
                el("div", {class: "order-item"}, [
                    document.createTextNode(`${item.titleSnapshot}${variantLabel} × ${item.quantity}`),
                    el("span", {}, [document.createTextNode(formatMoney(item.priceMinorSnapshot, order.currency))]),
                ])
            );
        });
        if (order.discountMinor > 0) {
            itemsWrap.append(
                el("div", {class: "order-item"}, [
                    document.createTextNode(order.promoCode ? `Промокод: ${order.promoCode}` : "Скидка"),
                    el("span", {}, [document.createTextNode(`-${order.discountMinor} ${order.currency}`)]),
                ])
            );
        }

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
    qs("tabPromos").classList.toggle("active", tab === "promos");
    qs("tabPaymentTemplate").classList.toggle("active", tab === "payment-template");
    qs("catalogSection").classList.toggle("hidden", tab !== "catalog");
    qs("ordersSection").classList.toggle("hidden", tab !== "orders");
    qs("archiveSection").classList.toggle("hidden", tab !== "archive");
    qs("tagsSection").classList.toggle("hidden", tab !== "tags");
    qs("promosSection").classList.toggle("hidden", tab !== "promos");
    qs("paymentTemplateSection").classList.toggle("hidden", tab !== "payment-template");
    if (tab === "orders") {
        qs("catalogMeta").textContent = "История покупок";
        loadOrders();
    } else if (tab === "archive") {
        qs("catalogMeta").textContent = "Архив товаров";
        loadArchived();
    } else if (tab === "tags") {
        qs("catalogMeta").textContent = "Теги товаров";
        loadTags();
    } else if (tab === "promos") {
        qs("catalogMeta").textContent = "Промокоды магазина";
        loadPromoCodes();
    } else if (tab === "payment-template") {
        qs("catalogMeta").textContent = "Шаблон оплаты";
        loadPaymentTemplate();
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
    const tagPicker = el("div", {class: "tag-picker"});
    renderTagPicker(tagPicker, selectedTags);
    const variantPicker = el("div", {class: "variant-picker"});
    const existingVariants = (p.variants || []).map((v) => ({name: v.name, stock: v.stock ?? 0}));
    const stockInput = el("input", {name: "stock", type: "number", min: "0", value: String(p.stock)});
    renderVariantPicker(variantPicker, existingVariants, (next) => updateStockInput(stockInput, next));
    updateStockInput(stockInput, existingVariants);
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
            stockInput,
        ]),
        el("label", {}, [
            document.createTextNode("URL картинок (перезапишет старые)"),
            el("textarea", {name: "imageUrls", rows: "3"}, [(p.imageUrls || []).join("\n")]),
        ]),
        el("div", {class: "tag-select"}, [
            el("div", {class: "tag-select-title"}, [document.createTextNode("Варианты и остатки")]),
            variantPicker,
        ]),
        el("div", {class: "tag-select"}, [
            el("div", {class: "tag-select-title"}, [document.createTextNode("Теги")]),
            tagPicker,
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
        const selectedVariants = getSelectedVariants(variantPicker);
        const totalVariantStock = selectedVariants.reduce((sum, v) => sum + Number(v.stock || 0), 0);
        const payload = {
            title: String(fd.get("title") || "").trim(),
            description: String(fd.get("description") || "").trim() || null,
            priceMinor: Number(fd.get("priceMinor") || 0),
            currency: String(fd.get("currency") || "UAH").trim(),
            stock: selectedVariants.length ? totalVariantStock : Number(fd.get("stock") || 0),
            imageUrls: parseImageUrls(String(fd.get("imageUrls") || "")),
            variants: selectedVariants,
            tagIds: getSelectedTagIds(tagPicker),
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
            handleAdminError(err, "Не удалось сохранить товар");
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
        const variantPicker = qs("productVariantPicker");
        const selectedVariants = getSelectedVariants(variantPicker);
        const totalVariantStock = selectedVariants.reduce((sum, v) => sum + Number(v.stock || 0), 0);
        const stockInput = qs("productForm").querySelector('input[name="stock"]');
        const payload = {
            title: String(fd.get("title") || "").trim(),
            description: String(fd.get("description") || "").trim() || null,
            priceMinor: Number(fd.get("priceMinor") || 0),
            currency: String(fd.get("currency") || "UAH").trim(),
            stock: selectedVariants.length ? totalVariantStock : Number(fd.get("stock") || 0),
            imageUrls: parseImageUrls(String(fd.get("imageUrls") || "")),
            variants: selectedVariants,
            tagIds: getSelectedTagIds(qs("productTagPicker")),
            active: Boolean(fd.get("active")),
        };
        if (!payload.title) return;
        try {
            await apiPost("/api/admin/products", payload);
            qs("productForm").reset();
            renderVariantPicker(variantPicker, [], (next) => updateStockInput(stockInput, next));
            updateStockInput(stockInput, []);
            await loadProducts();
        } catch (err) {
            console.error(err);
            handleAdminError(err, "Не удалось добавить товар");
        }
    });
}

function renderTags() {
    const list = qs("tagsList");
    list.innerHTML = "";
    state.tags.forEach((tag) => {
        const row = el("div", {class: "tag-item"}, [
            el("span", {class: "tag-pill"}, [document.createTextNode(tag.name)]),
            el("div", {class: "actions"}, [
                el("button", {
                    class: "pill icon-action",
                    title: "Переименовать",
                    "aria-label": "Переименовать",
                    onclick: async () => {
                        const nextName = prompt("Новое название тега", tag.name);
                        if (!nextName || !nextName.trim()) return;
                        try {
                            const updated = await apiPatch(`/api/admin/tags/${tag.id}`, {name: nextName.trim()});
                            state.tags = state.tags.map((t) => String(t.id) === String(tag.id) ? updated : t)
                                .sort((a, b) => a.name.localeCompare(b.name));
                            renderTags();
                            renderTagPicker(qs("productTagPicker"), new Set(getSelectedTagIds(qs("productTagPicker"))));
                        } catch (err) {
                            console.error(err);
                            showLogin(true);
                        }
                    }
                }, [el("i", {class: "fa-solid fa-pen"})]),
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
                            renderTagPicker(qs("productTagPicker"), new Set(getSelectedTagIds(qs("productTagPicker"))));
                        } catch (err) {
                            console.error(err);
                            showLogin(true);
                        }
                    }
                }, [el("i", {class: "fa-solid fa-trash"})]),
            ]),
        ]);
        list.append(row);
    });
    qs("tagsEmpty").classList.toggle("hidden", state.tags.length > 0);
    qs("tagsMeta").textContent = `Всего тегов: ${state.tags.length}`;
}

function openPromoEdit(promo) {
    const form = el("form", {class: "stack"});
    form.append(
        el("h2", {}, [document.createTextNode("Редактирование промокода")]),
        el("label", {}, [
            document.createTextNode("Код"),
            el("input", {name: "code", value: promo.code, required: "true"}),
        ]),
        el("label", {}, [
            document.createTextNode("Скидка (%)"),
            el("input", {name: "discountPercent", type: "number", min: "0", max: "100", value: String(promo.discountPercent)}),
        ]),
        el("label", {}, [
            document.createTextNode("Скидка суммой"),
            el("input", {
                name: "discountAmountMinor",
                type: "number",
                min: "0",
                value: promo.discountAmountMinor ? String(promo.discountAmountMinor) : ""
            }),
        ]),
        el("label", {}, [
            document.createTextNode("Лимит использований (пусто = бесконечно)"),
            el("input", {name: "maxUses", type: "number", min: "1", value: promo.maxUses ? String(promo.maxUses) : ""}),
        ]),
        el("label", {class: "checkbox"}, [
            el("input", {type: "checkbox", name: "active", ...(promo.active ? {checked: "true"} : {})}),
            el("span", {}, [document.createTextNode("Активен")]),
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
            code: String(fd.get("code") || "").trim(),
            discountPercent: Number(fd.get("discountPercent") || 0),
            discountAmountMinor: Number(fd.get("discountAmountMinor") || 0),
            maxUses: fd.get("maxUses") ? Number(fd.get("maxUses")) : null,
            active: Boolean(fd.get("active")),
        };
        if (!payload.code) return;
        try {
            const updated = await apiPatch(`/api/admin/promocodes/${promo.id}`, payload);
            state.promoCodes = state.promoCodes.map((item) => String(item.id) === String(updated.id) ? updated : item);
            renderPromoCodes();
            closeModal();
        } catch (err) {
            console.error(err);
            handleAdminError(err, "Не удалось обновить промокод");
        }
    });

    openModal(form);
}

function renderPromoCodes() {
    const list = qs("promoList");
    list.innerHTML = "";
    state.promoCodes.forEach((promo) => {
        const usesLabel = promo.maxUses ? `${promo.usesCount} / ${promo.maxUses}` : `${promo.usesCount} / ∞`;
        const discountLabel = promo.discountAmountMinor > 0
            ? `-${promo.discountAmountMinor}`
            : `${promo.discountPercent}%`;
        const row = el("div", {class: "promo-card"}, [
            el("div", {class: "promo-main"}, [
                el("div", {class: "promo-code"}, [document.createTextNode(promo.code)]),
                el("div", {class: "promo-meta"}, [
                    document.createTextNode(`Скидка: ${discountLabel} • Использования: ${usesLabel}`)
                ]),
                promo.active
                    ? el("span", {class: "status-tag"}, [document.createTextNode("Активен")])
                    : el("span", {class: "status-tag danger"}, [document.createTextNode("Выключен")]),
            ]),
            el("div", {class: "actions"}, [
                el("button", {
                    class: "pill icon-action",
                    title: "Редактировать",
                    "aria-label": "Редактировать",
                    onclick: () => openPromoEdit(promo),
                }, [el("i", {class: "fa-solid fa-pen"})]),
                el("button", {
                    class: "pill danger icon-action",
                    title: "Удалить",
                    "aria-label": "Удалить",
                    onclick: async () => {
                        if (!confirm(`Удалить промокод "${promo.code}"?`)) return;
                        try {
                            await apiDelete(`/api/admin/promocodes/${promo.id}`);
                            state.promoCodes = state.promoCodes.filter((item) => String(item.id) !== String(promo.id));
                            renderPromoCodes();
                        } catch (err) {
                            console.error(err);
                            handleAdminError(err, "Не удалось удалить промокод");
                        }
                    }
                }, [el("i", {class: "fa-solid fa-trash"})]),
            ]),
        ]);
        list.append(row);
    });

    qs("promoEmpty").classList.toggle("hidden", state.promoCodes.length > 0);
    qs("promoMeta").textContent = `Всего промокодов: ${state.promoCodes.length}`;
}

function boot() {
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".tag-picker")) {
            closeAllTagDropdowns();
        }
    });
    qs("loginForm").addEventListener("submit", handleLogin);
    qs("logoutBtn").addEventListener("click", logout);
    qs("refreshBtn").addEventListener("click", () => setActiveTab(state.activeTab));
    const stockInput = qs("productForm").querySelector('input[name="stock"]');
    renderVariantPicker(qs("productVariantPicker"), [], (next) => updateStockInput(stockInput, next));
    updateStockInput(stockInput, []);
    qs("customerToggle").addEventListener("change", (e) => {
        state.viewAsCustomer = e.target.checked;
        qs("adminPanel").classList.toggle("hidden", state.viewAsCustomer);
        document.querySelector(".layout")?.classList.toggle("single-column", state.viewAsCustomer);
        qs("tabOrders").classList.toggle("hidden", state.viewAsCustomer);
        qs("tabArchive").classList.toggle("hidden", state.viewAsCustomer);
        qs("tabTags").classList.toggle("hidden", state.viewAsCustomer);
        qs("tabPromos").classList.toggle("hidden", state.viewAsCustomer);
        qs("tabPaymentTemplate").classList.toggle("hidden", state.viewAsCustomer);
        if (state.viewAsCustomer && state.activeTab === "orders") {
            setActiveTab("catalog");
        } else if (state.viewAsCustomer && state.activeTab === "archive") {
            setActiveTab("catalog");
        } else if (state.viewAsCustomer && state.activeTab === "tags") {
            setActiveTab("catalog");
        } else if (state.viewAsCustomer && state.activeTab === "promos") {
            setActiveTab("catalog");
        } else if (state.viewAsCustomer && state.activeTab === "payment-template") {
            setActiveTab("catalog");
        } else {
            setActiveTab(state.activeTab);
        }
    });
    qs("tabCatalog").addEventListener("click", () => setActiveTab("catalog"));
    qs("tabOrders").addEventListener("click", () => setActiveTab("orders"));
    qs("tabArchive").addEventListener("click", () => setActiveTab("archive"));
    qs("tabTags").addEventListener("click", () => setActiveTab("tags"));
    qs("tabPromos").addEventListener("click", () => setActiveTab("promos"));
    qs("tabPaymentTemplate").addEventListener("click", () => setActiveTab("payment-template"));
    qs("closeModal").addEventListener("click", closeModal);
    bindForm();
    qs("paymentTemplateEditor").addEventListener("input", updatePaymentPreview);
    qs("paymentTemplateSave").addEventListener("click", savePaymentTemplate);
    qs("paymentTemplateSection").querySelectorAll(".editor-toolbar button").forEach((btn) => {
        btn.addEventListener("click", () => applyPaymentCommand(btn.dataset.cmd));
    });
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
            renderTagPicker(qs("productTagPicker"), new Set(getSelectedTagIds(qs("productTagPicker"))));
        } catch (err) {
            console.error(err);
            showLogin(true);
        }
    });

    qs("promoForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(qs("promoForm"));
        const payload = {
            code: String(fd.get("code") || "").trim(),
            discountPercent: Number(fd.get("discountPercent") || 0),
            discountAmountMinor: Number(fd.get("discountAmountMinor") || 0),
            maxUses: fd.get("maxUses") ? Number(fd.get("maxUses")) : null,
            active: Boolean(fd.get("active")),
        };
        if (!payload.code) return;
        try {
            const promo = await apiPost("/api/admin/promocodes", payload);
            state.promoCodes = [promo, ...state.promoCodes];
            qs("promoForm").reset();
            renderPromoCodes();
        } catch (err) {
            console.error(err);
            handleAdminError(err, "Не удалось добавить промокод");
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
