const STORAGE_KEY = "alexsmeta.estimates.v2";

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function clampToNumber(value) {
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(n) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(clampToNumber(n));
}

function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.toLocaleDateString("ru-RU")} ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function migrateLegacyIfNeeded() {
  const legacy = localStorage.getItem("alexsmeta.estimates.v1");
  if (!legacy) return;
  try {
    const s1 = JSON.parse(legacy);
    if (!s1 || !Array.isArray(s1.estimates)) return;
    const now = Date.now();
    const v2 = {
      estimates: s1.estimates.map((e) => ({
        id: e.id ?? uid(),
        name: e.name ?? "Без названия",
        customer: "",
        executor: "",
        currency: e.currency ?? "$",
        updatedAt: now,
        items: Array.isArray(e.items)
          ? e.items.map((it) => ({
              id: it.id ?? uid(),
              name: it.name ?? "",
              unit: it.unit ?? "М.пог",
              price: clampToNumber(it.price),
              qty: clampToNumber(it.qty),
            }))
          : [],
      })),
      selectedId: typeof s1.selectedId === "string" ? s1.selectedId : null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v2));
    localStorage.removeItem("alexsmeta.estimates.v1");
  } catch {
    // ignore
  }
}

function makeEmptyEstimate(name) {
  const now = Date.now();
  return {
    id: uid(),
    name,
    customer: "",
    executor: "",
    currency: "$",
    updatedAt: now,
    items: [{ id: uid(), name: "", unit: "М.пог", price: 0, qty: 0 }],
  };
}

function ensureState(state) {
  if (state && Array.isArray(state.estimates) && state.estimates.length > 0) {
    const selectedId =
      typeof state.selectedId === "string" && state.estimates.some((e) => e.id === state.selectedId)
        ? state.selectedId
        : state.estimates[0].id;
    return { ...state, selectedId };
  }
  const first = makeEmptyEstimate("Смета #1");
  return { estimates: [first], selectedId: first.id };
}

function computeRowSum(item) {
  return clampToNumber(item.price) * clampToNumber(item.qty);
}

function computeTotal(estimate) {
  return estimate.items.reduce((acc, it) => acc + computeRowSum(it), 0);
}

function qs(sel, root = document) {
  const node = root.querySelector(sel);
  if (!node) throw new Error(`Не найден элемент: ${sel}`);
  return node;
}

function openSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.classList.add("open");
}

function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.classList.remove("open");
}

function getSelectedEstimate(state) {
  return state.estimates.find((e) => e.id === state.selectedId) ?? null;
}

function updateTotalsInDom(state) {
  const est = getSelectedEstimate(state);
  if (!est) return;
  const footer = document.querySelector('[data-slot="editor-footer"]');
  if (!footer) return;
  const total = computeTotal(est);
  footer.innerHTML = `
    <span class="label">Итого:</span>
    <span class="amount">${est.currency}${formatMoney(total)}</span>
  `;
}

function updateRowSumInDom(state, itemId) {
  const est = getSelectedEstimate(state);
  if (!est) return;
  const item = est.items.find((it) => it.id === itemId);
  if (!item) return;
  const tr = document.querySelector(`[data-rowid="${CSS.escape(itemId)}"]`);
  if (!tr) return;
  const sumCell = tr.querySelector("td.sum");
  if (!sumCell) return;
  sumCell.textContent = `${est.currency}${formatMoney(computeRowSum(item))}`;
}

function updateTopbarTitleInDom(state) {
  const est = getSelectedEstimate(state);
  const el = document.querySelector('[data-slot="topbar-title"]');
  if (el) el.textContent = est?.name || "Смета";
}

function updateSelectedListItemNameInDom(state) {
  const est = getSelectedEstimate(state);
  if (!est) return;
  const el = document.querySelector(`.estimate-item.active .name`);
  if (el) el.textContent = est.name;
}

function render(state) {
  const list = qs('[data-slot="estimate-list"]');
  const empty = qs('[data-slot="empty-state"]');
  const doc = qs('[data-slot="doc"]');
  const topbarTitle = qs('[data-slot="topbar-title"]');
  const table = qs('[data-slot="items-table"]');
  const footer = qs('[data-slot="editor-footer"]');

  list.innerHTML = "";
  const estimatesSorted = [...state.estimates].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  for (const est of estimatesSorted) {
    const active = est.id === state.selectedId;
    const item = document.createElement("div");
    item.className = `estimate-item ${active ? "active" : ""}`;
    item.dataset.action = "select-estimate";
    item.dataset.id = est.id;
    item.innerHTML = `
      <div class="name">${escapeHtml(est.name)}</div>
      <div class="date">${escapeHtml(fmtDate(est.updatedAt ?? Date.now()))}</div>
    `;
    list.append(item);
  }

  const estimate = state.estimates.find((e) => e.id === state.selectedId);
  if (!estimate) {
    empty.style.display = "flex";
    doc.style.display = "none";
    topbarTitle.textContent = "Смета";
    table.innerHTML = "";
    footer.innerHTML = "";
    return;
  }

  empty.style.display = "none";
  doc.style.display = "block";
  topbarTitle.textContent = estimate.name || "Смета";

  const titleInput = doc.querySelector('[data-action="edit-estimate-name"]');
  if (titleInput instanceof HTMLInputElement) titleInput.value = estimate.name ?? "";

  const customerInput = doc.querySelector('[data-action="edit-estimate-meta"][data-field="customer"]');
  if (customerInput instanceof HTMLInputElement) customerInput.value = estimate.customer ?? "";

  const executorInput = doc.querySelector('[data-action="edit-estimate-meta"][data-field="executor"]');
  if (executorInput instanceof HTMLInputElement) executorInput.value = estimate.executor ?? "";

  table.innerHTML = `
    <thead>
      <tr>
        <th style="width:50px">№</th>
        <th>Наименование</th>
        <th style="width:110px">Ед. изм</th>
        <th style="width:100px">Цена</th>
        <th style="width:100px">Кол-во</th>
        <th style="width:100px">Сумма</th>
        <th style="width:40px"></th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");
  if (!tbody) return;
  estimate.items.forEach((it, idx) => {
    const sum = computeRowSum(it);
    const tr = document.createElement("tr");
    tr.dataset.rowid = it.id;
    tr.innerHTML = `
      <td class="num">${idx + 1}</td>
      <td><input type="text" data-action="edit-item" data-id="${it.id}" data-field="name" value="${escapeAttr(it.name ?? "")}"></td>
      <td class="unit"><input type="text" data-action="edit-item" data-id="${it.id}" data-field="unit" value="${escapeAttr(it.unit ?? "")}"></td>
      <td class="price"><input type="number" step="0.01" min="0" inputmode="decimal" data-action="edit-item-num" data-id="${it.id}" data-field="price" value="${escapeAttr(String(it.price ?? 0))}"></td>
      <td class="qty"><input type="number" step="0.01" min="0" inputmode="decimal" data-action="edit-item-num" data-id="${it.id}" data-field="qty" value="${escapeAttr(String(it.qty ?? 0))}"></td>
      <td class="sum">${estimate.currency}${formatMoney(sum)}</td>
      <td class="actions"><button class="row-del" type="button" data-action="delete-row" data-id="${it.id}" title="Удалить строку">×</button></td>
    `;
    tbody.append(tr);
  });

  const total = computeTotal(estimate);
  footer.innerHTML = `
    <span class="label">Итого:</span>
    <span class="amount">${estimate.currency}${formatMoney(total)}</span>
  `;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/`/g, "&#96;");
}

function mutate(state, fn) {
  const next = structuredClone(state);
  fn(next);
  return next;
}

function main() {
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  migrateLegacyIfNeeded();
  let state = ensureState(loadState());
  saveState(state);

  function rerender() {
    render(state);
    saveState(state);
  }

  rerender();

  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const actionEl = t.closest("[data-action]");
    if (!(actionEl instanceof HTMLElement)) return;
    const action = actionEl.dataset.action;
    if (!action) return;

    if (action === "toggle-sidebar") {
      openSidebar();
      return;
    }
    if (action === "close-sidebar") {
      closeSidebar();
      return;
    }

    if (action === "refresh") {
      state = ensureState(loadState());
      rerender();
      return;
    }

    if (action === "new-estimate") {
      state = mutate(state, (s) => {
        const n = s.estimates.length + 1;
        const est = makeEmptyEstimate(`Смета #${n}`);
        s.estimates.unshift(est);
        s.selectedId = est.id;
      });
      rerender();
      closeSidebar();
      return;
    }

    if (action === "select-estimate") {
      const id = actionEl.dataset.id;
      if (!id) return;
      state = mutate(state, (s) => {
        s.selectedId = id;
      });
      rerender();
      closeSidebar();
      return;
    }

    if (action === "add-row") {
      state = mutate(state, (s) => {
        const est = s.estimates.find((x) => x.id === s.selectedId);
        if (!est) return;
        est.items.push({ id: uid(), name: "", unit: "М.пог", price: 0, qty: 0 });
        est.updatedAt = Date.now();
      });
      rerender();
      return;
    }

    if (action === "delete-row") {
      const id = actionEl.dataset.id;
      if (!id) return;
      state = mutate(state, (s) => {
        const est = s.estimates.find((x) => x.id === s.selectedId);
        if (!est) return;
        est.items = est.items.filter((it) => it.id !== id);
        if (est.items.length === 0) est.items = [{ id: uid(), name: "", unit: "М.пог", price: 0, qty: 0 }];
        est.updatedAt = Date.now();
      });
      rerender();
      return;
    }

    if (action === "delete-estimate") {
      const ok = confirm("Удалить эту смету? Это действие нельзя отменить.");
      if (!ok) return;
      state = mutate(state, (s) => {
        s.estimates = s.estimates.filter((x) => x.id !== s.selectedId);
        if (s.estimates.length === 0) {
          const est = makeEmptyEstimate("Смета #1");
          s.estimates = [est];
          s.selectedId = est.id;
        } else {
          s.selectedId = s.estimates[0].id;
        }
      });
      rerender();
    }
  });

  const sidebar = document.getElementById("sidebar");
  if (sidebar) {
    sidebar.addEventListener("click", (e) => {
      if (!sidebar.classList.contains("open")) return;
      if (e.target === sidebar) closeSidebar();
    });
  }

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    const action = t.dataset.action;
    if (!action) return;

    if (action === "edit-estimate-name") {
      state = mutate(state, (s) => {
        const est = s.estimates.find((x) => x.id === s.selectedId);
        if (!est) return;
        est.name = t.value.trim() || "Без названия";
      });
      saveState(state);
      updateTopbarTitleInDom(state);
      updateSelectedListItemNameInDom(state);
      return;
    }

    if (action === "edit-estimate-meta") {
      const field = t.dataset.field;
      if (!field) return;
      state = mutate(state, (s) => {
        const est = s.estimates.find((x) => x.id === s.selectedId);
        if (!est) return;
        if (field === "customer") est.customer = t.value;
        if (field === "executor") est.executor = t.value;
      });
      saveState(state);
      return;
    }

    if (action === "edit-item") {
      const id = t.dataset.id;
      const field = t.dataset.field;
      if (!id || !field) return;
      state = mutate(state, (s) => {
        const est = s.estimates.find((x) => x.id === s.selectedId);
        if (!est) return;
        const item = est.items.find((it) => it.id === id);
        if (!item) return;
        if (field === "name") item.name = t.value;
        if (field === "unit") item.unit = t.value;
      });
      saveState(state);
      return;
    }

    if (action === "edit-item-num") {
      const id = t.dataset.id;
      const field = t.dataset.field;
      if (!id || !field) return;
      const value = clampToNumber(t.value);
      state = mutate(state, (s) => {
        const est = s.estimates.find((x) => x.id === s.selectedId);
        if (!est) return;
        const item = est.items.find((it) => it.id === id);
        if (!item) return;
        if (field === "price") item.price = value;
        if (field === "qty") item.qty = value;
      });
      saveState(state);
      updateRowSumInDom(state, id);
      updateTotalsInDom(state);
    }
  });
}

main();

