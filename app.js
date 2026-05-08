const STORAGE_KEY = "alexsmeta.estimates.v2";
const SITE_VERSION = "0.0.6";

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

function autosizeTextarea(node) {
  if (!(node instanceof HTMLTextAreaElement)) return;
  node.style.height = "auto";
  node.style.height = `${node.scrollHeight}px`;
}

function autosizeAllTextareas(root = document) {
  root.querySelectorAll("textarea").forEach((t) => autosizeTextarea(t));
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/`/g, "&#96;");
}

function render(state, ui) {
  const list = qs('[data-slot="estimate-list"]');
  const empty = qs('[data-slot="empty-state"]');
  const doc = qs('[data-slot="doc"]');
  const topbarTitle = qs('[data-slot="topbar-title"]');
  const table = qs('[data-slot="items-table"]');
  const footer = qs('[data-slot="editor-footer"]');
  const sign = qs('[data-slot="sign"]');
  const titleEl = qs('[data-slot="doc-title"]');
  const editEnterBtn = qs('[data-action="edit-enter"]', doc);
  const editSaveBtn = qs('[data-action="edit-save"]', doc);
  const editCancelBtn = qs('[data-action="edit-cancel"]', doc);
  const editOnlyActions = qs('[data-slot="edit-only-actions"]', doc);

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
    doc.dataset.editing = "false";
    topbarTitle.textContent = "Смета";
    table.innerHTML = "";
    footer.innerHTML = "";
    sign.innerHTML = "";
    return;
  }

  empty.style.display = "none";
  doc.style.display = "block";
  doc.dataset.editing = ui.editing ? "true" : "false";
  const current = ui.editing ? ui.draft : estimate;
  topbarTitle.textContent = current.name || "Смета";

  editEnterBtn.style.display = ui.editing ? "none" : "inline-flex";
  editSaveBtn.style.display = ui.editing ? "inline-flex" : "none";
  editCancelBtn.style.display = ui.editing ? "inline-flex" : "none";
  editOnlyActions.style.display = ui.editing ? "block" : "none";

  titleEl.innerHTML = ui.editing
    ? `<input class="docTitleInput" type="text" data-action="draft-edit" data-field="name" value="${escapeAttr(current.name ?? "")}" />`
    : escapeHtml(current.name ?? "");

  table.innerHTML = `
    <thead>
      <tr>
        <th class="h-num">№</th>
        <th>Наименование</th>
        <th class="h-unit">Ед. изм</th>
        <th class="h-price">Цена</th>
        <th class="h-qty">Кол-во</th>
        <th class="h-sum">Сумма</th>
        ${ui.editing ? `<th style="width:40px"></th>` : ``}
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");
  if (!tbody) return;

  current.items.forEach((it, idx) => {
    const sum = computeRowSum(it);
    const tr = document.createElement("tr");
    tr.dataset.rowid = it.id;
    tr.innerHTML = `
      <td class="num">${idx + 1}</td>
      <td class="c-name">
        ${
          ui.editing
            ? `<textarea rows="1" data-action="draft-item" data-id="${it.id}" data-field="name">${escapeHtml(it.name ?? "")}</textarea>`
            : `<div class="cellText">${escapeHtml(it.name ?? "")}</div>`
        }
      </td>
      <td class="unit">
        ${
          ui.editing
            ? `<input type="text" data-action="draft-item" data-id="${it.id}" data-field="unit" value="${escapeAttr(it.unit ?? "")}">`
            : `<div class="cellText cellCenter">${escapeHtml(it.unit ?? "")}</div>`
        }
      </td>
      <td class="price">
        ${
          ui.editing
            ? `<input type="number" step="0.01" min="0" inputmode="decimal" data-action="draft-item-num" data-id="${it.id}" data-field="price" value="${escapeAttr(String(it.price ?? 0))}">`
            : `<div class="cellText cellRight">${formatMoney(it.price ?? 0)}</div>`
        }
      </td>
      <td class="qty">
        ${
          ui.editing
            ? `<input type="number" step="0.01" min="0" inputmode="decimal" data-action="draft-item-num" data-id="${it.id}" data-field="qty" value="${escapeAttr(String(it.qty ?? 0))}">`
            : `<div class="cellText cellRight">${escapeHtml(String(it.qty ?? 0))}</div>`
        }
      </td>
      <td class="sum"><div class="cellText cellRight" data-sum="${it.id}">${current.currency}${formatMoney(sum)}</div></td>
      ${
        ui.editing
          ? `<td class="actions"><button class="row-del" type="button" data-action="draft-delete-row" data-id="${it.id}" title="Удалить">×</button></td>`
          : ``
      }
    `;
    tbody.append(tr);
  });

  const total = computeTotal(current);
  footer.innerHTML = `
    <span class="label">Итого:</span>
    <span class="amount">${current.currency}${formatMoney(total)}</span>
  `;

  sign.innerHTML = `
    <div>
      ${
        ui.editing
          ? `<input type="text" data-action="draft-edit" data-field="customer" value="${escapeAttr(current.customer ?? "")}" />`
          : `<div class="val">${escapeHtml(current.customer ?? "")}</div>`
      }
      <div class="sline"></div>
      <div class="lbl">Заказчик</div>
    </div>
    <div>
      ${
        ui.editing
          ? `<input type="text" data-action="draft-edit" data-field="executor" value="${escapeAttr(current.executor ?? "")}" />`
          : `<div class="val">${escapeHtml(current.executor ?? "")}</div>`
      }
      <div class="sline"></div>
      <div class="lbl">Исполнитель</div>
    </div>
  `;

  autosizeAllTextareas(doc);
}

function buildExportHtml(estimate) {
  const rows = (estimate.items ?? []).map((it, idx) => {
    const price = clampToNumber(it.price);
    const qty = clampToNumber(it.qty);
    const sum = price * qty;
    return `
      <tr>
        <td class="c-num">${idx + 1}</td>
        <td class="c-name">${escapeHtml(it.name ?? "")}</td>
        <td class="c-unit">${escapeHtml(it.unit ?? "")}</td>
        <td class="c-price">${formatMoney(price)}</td>
        <td class="c-qty">${qty % 1 === 0 ? String(qty) : String(qty).replace(".", ",")}</td>
        <td class="c-sum">${formatMoney(sum)}</td>
      </tr>
    `;
  });

  const total = computeTotal(estimate);
  const currency = estimate.currency ?? "$";
  const title = estimate.name ?? "Смета";
  const customer = estimate.customer ?? "";
  const executor = estimate.executor ?? "";

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} — экспорт</title>
    <style>
      :root { --border: #111; --muted: #444; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #111; }
      .page { max-width: 980px; margin: 0 auto; padding: 28px 18px 40px; }
      .toolbar { display: flex; justify-content: flex-end; gap: 10px; margin-bottom: 14px; }
      .btn { padding: 8px 12px; border: 1px solid #bbb; background: #fff; cursor: pointer; border-radius: 8px; }
      .title { font-size: 18px; font-weight: 700; margin: 0 0 10px; text-align: center; }

      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid var(--border); padding: 8px 10px; vertical-align: top; }
      th { background: #f3f3f3; font-size: 13px; text-align: left; }
      td { font-size: 13px; }
      .c-num { width: 44px; text-align: center; }
      td { white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
      .c-unit { width: 90px; text-align: center; }
      .c-price, .c-qty, .c-sum { width: 90px; text-align: right; font-variant-numeric: tabular-nums; }
      .totalRow { margin-top: 14px; display: flex; justify-content: flex-end; gap: 10px; font-weight: 700; }
      .totalRow .val { font-variant-numeric: tabular-nums; }
      .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; margin-top: 26px; }
      .sign .sline { border-bottom: 1px solid #bbb; height: 18px; }
      .sign .lbl { color: var(--muted); font-size: 12px; margin-top: 6px; }
      .sign .val { font-size: 13px; color: #111; min-height: 18px; padding: 0 2px; }

      @media print {
        .toolbar { display: none; }
        .page { padding: 0; margin: 0; max-width: none; }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="toolbar">
        <button class="btn" onclick="window.print()">Печать / PDF</button>
      </div>

      <h1 class="title">${escapeHtml(title)}</h1>

      <table>
        <thead>
          <tr>
            <th class="c-num">№</th>
            <th>Наименование</th>
            <th class="c-unit">Ед. изм</th>
            <th class="c-price">Цена</th>
            <th class="c-qty">Кол-во</th>
            <th class="c-sum">Сумма</th>
          </tr>
        </thead>
        <tbody>
          ${rows.join("") || `<tr><td class="c-num">1</td><td></td><td class="c-unit"></td><td class="c-price">0.00</td><td class="c-qty">0</td><td class="c-sum">0.00</td></tr>`}
        </tbody>
      </table>

      <div class="totalRow">
        <div>Итого:</div>
        <div class="val">${formatMoney(total)} ${escapeHtml(currency)}</div>
      </div>

      <div class="sign">
        <div>
          <div class="val">${escapeHtml(customer)}</div>
          <div class="sline"></div>
          <div class="lbl">Заказчик</div>
        </div>
        <div>
          <div class="val">${escapeHtml(executor)}</div>
          <div class="sline"></div>
          <div class="lbl">Исполнитель</div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function buildExportInnerHtml(estimate) {
  const rows = (estimate.items ?? []).map((it, idx) => {
    const price = clampToNumber(it.price);
    const qty = clampToNumber(it.qty);
    const sum = price * qty;
    return `
      <tr>
        <td class="c-num">${idx + 1}</td>
        <td class="c-name">${escapeHtml(it.name ?? "")}</td>
        <td class="c-unit">${escapeHtml(it.unit ?? "")}</td>
        <td class="c-price">${formatMoney(price)}</td>
        <td class="c-qty">${qty % 1 === 0 ? String(qty) : String(qty).replace(".", ",")}</td>
        <td class="c-sum">${formatMoney(sum)}</td>
      </tr>
    `;
  });

  const total = computeTotal(estimate);
  const currency = estimate.currency ?? "$";
  const title = estimate.name ?? "Смета";
  const customer = estimate.customer ?? "";
  const executor = estimate.executor ?? "";

  return `
    <style>
      :root { --border: #111; --muted: #444; }
      .x-title { font-size: 18px; font-weight: 700; margin: 0 0 10px; text-align: center; }

      .x-table { width: 100%; border-collapse: collapse; }
      .x-table th, .x-table td { border: 1px solid var(--border); padding: 8px 10px; vertical-align: top; }
      .x-table th { background: #f3f3f3; font-size: 13px; text-align: left; }
      .x-table td { font-size: 13px; }
      .x-table td { white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
      .x-table .c-num { width: 44px; text-align: center; }
      .x-table .c-unit { width: 90px; text-align: center; }
      .x-table .c-price, .x-table .c-qty, .x-table .c-sum { width: 90px; text-align: right; font-variant-numeric: tabular-nums; }
      .x-total { margin-top: 14px; display: flex; justify-content: flex-end; gap: 10px; font-weight: 700; }
      .x-total .val { font-variant-numeric: tabular-nums; }
      .x-sign { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; margin-top: 26px; }
      .x-sign .sline { border-bottom: 1px solid #bbb; height: 18px; }
      .x-sign .lbl { color: var(--muted); font-size: 12px; margin-top: 6px; }
      .x-sign .val { font-size: 13px; color: #111; min-height: 18px; padding: 0 2px; }

      @media (max-width: 560px) {
        .x-sign { grid-template-columns: 1fr; gap: 16px; }
      }
    </style>

    <h2 class="x-title">${escapeHtml(title)}</h2>

    <table class="x-table">
      <thead>
        <tr>
          <th class="c-num">№</th>
          <th>Наименование</th>
          <th class="c-unit">Ед. изм</th>
          <th class="c-price">Цена</th>
          <th class="c-qty">Кол-во</th>
          <th class="c-sum">Сумма</th>
        </tr>
      </thead>
      <tbody>
        ${rows.join("") || `<tr><td class="c-num">1</td><td></td><td class="c-unit"></td><td class="c-price">0.00</td><td class="c-qty">0</td><td class="c-sum">0.00</td></tr>`}
      </tbody>
    </table>

    <div class="x-total">
      <div>Итого:</div>
      <div class="val">${formatMoney(total)} ${escapeHtml(currency)}</div>
    </div>

    <div class="x-sign">
      <div><div class="val">${escapeHtml(customer)}</div><div class="sline"></div><div class="lbl">Заказчик</div></div>
      <div><div class="val">${escapeHtml(executor)}</div><div class="sline"></div><div class="lbl">Исполнитель</div></div>
    </div>
  `;
}

function mutate(state, fn) {
  const next = structuredClone(state);
  fn(next);
  return next;
}

function main() {
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  const verEl = document.querySelector('[data-slot="site-version"]');
  if (verEl) verEl.textContent = SITE_VERSION;

  migrateLegacyIfNeeded();
  let state = ensureState(loadState());
  saveState(state);
  let ui = { editing: false, draft: null };

  function rerender() {
    render(state, ui);
    saveState(state);
  }

  rerender();

  function cancelEdit() {
    ui = { editing: false, draft: null };
    rerender();
  }

  function enterEdit() {
    const current = getSelectedEstimate(state);
    if (!current) return;
    ui = { editing: true, draft: structuredClone(current) };
    rerender();
  }

  function saveEdit() {
    if (!ui.editing || !ui.draft) return;
    state = mutate(state, (s) => {
      const idx = s.estimates.findIndex((e) => e.id === ui.draft.id);
      if (idx >= 0) s.estimates[idx] = { ...ui.draft, updatedAt: Date.now() };
    });
    ui = { editing: false, draft: null };
    rerender();
  }

  function updateSumAndTotalInDom(draft, itemId) {
    const item = draft.items.find((it) => it.id === itemId);
    if (!item) return;
    const sumEl = document.querySelector(`[data-sum="${CSS.escape(itemId)}"]`);
    if (sumEl) sumEl.textContent = `${draft.currency}${formatMoney(computeRowSum(item))}`;
    const footer = document.querySelector('[data-slot="editor-footer"]');
    if (footer) {
      footer.innerHTML = `
        <span class="label">Итого:</span>
        <span class="amount">${draft.currency}${formatMoney(computeTotal(draft))}</span>
      `;
    }
  }

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
      if (ui.editing) cancelEdit();
      state = ensureState(loadState());
      rerender();
      return;
    }

    if (action === "edit-enter") {
      enterEdit();
      return;
    }

    if (action === "edit-cancel") {
      cancelEdit();
      return;
    }

    if (action === "edit-save") {
      saveEdit();
      return;
    }

    if (action === "new-estimate") {
      if (ui.editing) cancelEdit();
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
      if (ui.editing) cancelEdit();
      state = mutate(state, (s) => {
        s.selectedId = id;
      });
      rerender();
      closeSidebar();
      return;
    }

    if (action === "add-row") {
      if (!ui.editing || !ui.draft) return;
      ui.draft.items.push({ id: uid(), name: "", unit: "М.пог", price: 0, qty: 0 });
      rerender();
      return;
    }

    if (action === "draft-delete-row") {
      const id = actionEl.dataset.id;
      if (!id) return;
      if (!ui.editing || !ui.draft) return;
      ui.draft.items = ui.draft.items.filter((it) => it.id !== id);
      if (ui.draft.items.length === 0) ui.draft.items = [{ id: uid(), name: "", unit: "М.пог", price: 0, qty: 0 }];
      rerender();
      return;
    }

    if (action === "delete-estimate") {
      const ok = confirm("Удалить эту смету? Это действие нельзя отменить.");
      if (!ok) return;
      if (ui.editing) cancelEdit();
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
    if (!(t instanceof HTMLInputElement) && !(t instanceof HTMLTextAreaElement)) return;
    const action = t.dataset.action;
    if (!action) return;

    if (!ui.editing || !ui.draft) return;

    if (action === "draft-edit") {
      const field = t.dataset.field;
      if (!field) return;
      if (field === "name") ui.draft.name = t.value.trim() || "Без названия";
      if (field === "customer") ui.draft.customer = t.value;
      if (field === "executor") ui.draft.executor = t.value;
      const top = document.querySelector('[data-slot="topbar-title"]');
      if (top && field === "name") top.textContent = ui.draft.name;
      const activeName = document.querySelector(".estimate-item.active .name");
      if (activeName && field === "name") activeName.textContent = ui.draft.name;
      return;
    }

    if (action === "draft-item") {
      const id = t.dataset.id;
      const field = t.dataset.field;
      if (!id || !field) return;
      const item = ui.draft.items.find((it) => it.id === id);
      if (!item) return;
      if (field === "name") item.name = t.value;
      if (field === "unit") item.unit = t.value;
      autosizeTextarea(t);
      return;
    }

    if (action === "draft-item-num") {
      const id = t.dataset.id;
      const field = t.dataset.field;
      if (!id || !field) return;
      const item = ui.draft.items.find((it) => it.id === id);
      if (!item) return;
      const value = clampToNumber(t.value);
      if (field === "price") item.price = value;
      if (field === "qty") item.qty = value;
      updateSumAndTotalInDom(ui.draft, id);
    }
  });
}

main();

