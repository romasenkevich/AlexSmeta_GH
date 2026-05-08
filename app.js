const STORAGE_KEY = "alexsmeta.estimates.v1";

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function clampToNumber(value) {
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(n) {
  const v = clampToNumber(n);
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function formatQty(n) {
  const v = clampToNumber(n);
  const isInt = Math.abs(v - Math.round(v)) < 1e-9;
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: isInt ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(v);
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

function makeEmptyEstimate(name = "Новая смета") {
  return {
    id: uid(),
    name,
    currency: "$",
    items: [
      {
        id: uid(),
        name: "",
        unit: "М.пог",
        price: 0,
        qty: 0,
      },
    ],
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
  const el = root.querySelector(sel);
  if (!el) throw new Error(`Не найден элемент: ${sel}`);
  return el;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "dataset") {
      for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = String(dv);
    } else if (k === "text") node.textContent = String(v);
    else if (k === "html") node.innerHTML = String(v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, "");
    else if (v === false || v == null) continue;
    else node.setAttribute(k, String(v));
  }
  for (const ch of children) node.append(ch);
  return node;
}

function renderEstimateList(state) {
  const list = qs('[data-slot="estimate-list"]');
  list.innerHTML = "";

  for (const estimate of state.estimates) {
    const isActive = estimate.id === state.selectedId;
    const button = el(
      "button",
      {
        class: `estimateBtn ${isActive ? "isActive" : ""}`,
        type: "button",
        dataset: { action: "select-estimate", id: estimate.id },
      },
      [
        el("span", { class: "estimateBtnName", text: estimate.name }),
        el("span", { class: "estimateBtnMeta", text: `${formatMoney(computeTotal(estimate))} ${estimate.currency}` }),
      ],
    );
    list.append(button);
  }
}

function renderEditor(state) {
  const estimate = state.estimates.find((e) => e.id === state.selectedId);
  const header = qs('[data-slot="editor-header"]');
  const table = qs('[data-slot="items-table"]');
  const footer = qs('[data-slot="editor-footer"]');

  if (!estimate) {
    header.textContent = "Смета не выбрана";
    table.innerHTML = "";
    footer.innerHTML = "";
    return;
  }

  header.innerHTML = "";
  header.append(
    el("div", { class: "editorTitleRow" }, [
      el("div", { class: "field" }, [
        el("label", { class: "label", for: "estimate-name", text: "Название сметы" }),
        el("input", {
          class: "input",
          id: "estimate-name",
          value: estimate.name,
          placeholder: "Например: Откосы",
          dataset: { action: "edit-estimate-name" },
        }),
      ]),
      el("div", { class: "editorTitleActions" }, [
        el("button", { class: "btn", type: "button", dataset: { action: "add-row" }, text: "Добавить строку" }),
        el("button", {
          class: "btn btnDanger",
          type: "button",
          dataset: { action: "delete-estimate" },
          text: "Удалить смету",
        }),
      ]),
    ]),
  );

  const thead = el("thead", {}, [
    el("tr", {}, [
      el("th", { class: "colNum", text: "№" }),
      el("th", { text: "Наименование" }),
      el("th", { class: "colUnit", text: "Ед. изм" }),
      el("th", { class: "colPrice", text: "Цена" }),
      el("th", { class: "colQty", text: "Кол-во" }),
      el("th", { class: "colSum", text: "Сумма" }),
      el("th", { class: "colActions", text: "" }),
    ]),
  ]);

  const tbody = el("tbody");
  estimate.items.forEach((item, idx) => {
    const sum = computeRowSum(item);
    tbody.append(
      el("tr", { dataset: { rowid: item.id } }, [
        el("td", { class: "colNum" }, [el("span", { class: "numPill", text: String(idx + 1) })]),
        el("td", {}, [
          el("input", {
            class: "input inputTable",
            value: item.name ?? "",
            placeholder: "Например: Приклейка откосов",
            dataset: { action: "edit-item", id: item.id, field: "name" },
          }),
        ]),
        el("td", { class: "colUnit" }, [
          el("input", {
            class: "input inputTable",
            value: item.unit ?? "",
            placeholder: "М.пог",
            dataset: { action: "edit-item", id: item.id, field: "unit" },
          }),
        ]),
        el("td", { class: "colPrice" }, [
          el("input", {
            class: "input inputTable inputNum",
            inputmode: "decimal",
            value: String(item.price ?? 0),
            dataset: { action: "edit-item-num", id: item.id, field: "price" },
          }),
        ]),
        el("td", { class: "colQty" }, [
          el("input", {
            class: "input inputTable inputNum",
            inputmode: "decimal",
            value: String(item.qty ?? 0),
            dataset: { action: "edit-item-num", id: item.id, field: "qty" },
          }),
        ]),
        el("td", { class: "colSum" }, [el("span", { class: "sumCell", text: `${formatMoney(sum)} ${estimate.currency}` })]),
        el("td", { class: "colActions" }, [
          el("button", {
            class: "iconBtn",
            type: "button",
            title: "Удалить строку",
            dataset: { action: "delete-row", id: item.id },
            text: "✕",
          }),
        ]),
      ]),
    );
  });

  table.innerHTML = "";
  table.append(thead, tbody);

  const total = computeTotal(estimate);
  footer.innerHTML = "";
  footer.append(
    el("div", { class: "totalBar" }, [
      el("div", { class: "totalLeft" }, [
        el("span", { class: "totalLabel", text: "Итого:" }),
        el("span", { class: "totalValue", text: `${formatMoney(total)} ${estimate.currency}` }),
      ]),
      el("div", { class: "totalRight" }, [
        el("button", { class: "btn btnGhost", type: "button", dataset: { action: "add-row" }, text: "+ Строка" }),
      ]),
    ]),
  );
}

function mutate(state, fn) {
  const next = structuredClone(state);
  fn(next);
  return next;
}

function main() {
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  let state = ensureState(loadState());
  saveState(state);

  function rerender() {
    renderEstimateList(state);
    renderEditor(state);
    saveState(state);
  }

  rerender();

  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const action = t.dataset.action;
    if (!action) return;

    if (action === "new-estimate") {
      state = mutate(state, (s) => {
        const n = s.estimates.length + 1;
        const est = makeEmptyEstimate(`Смета #${n}`);
        s.estimates.unshift(est);
        s.selectedId = est.id;
      });
      rerender();
      return;
    }

    if (action === "select-estimate") {
      const id = t.dataset.id;
      if (!id) return;
      state = mutate(state, (s) => {
        s.selectedId = id;
      });
      rerender();
      return;
    }

    if (action === "add-row") {
      state = mutate(state, (s) => {
        const est = s.estimates.find((x) => x.id === s.selectedId);
        if (!est) return;
        est.items.push({ id: uid(), name: "", unit: "М.пог", price: 0, qty: 0 });
      });
      rerender();
      return;
    }

    if (action === "delete-row") {
      const id = t.dataset.id;
      if (!id) return;
      state = mutate(state, (s) => {
        const est = s.estimates.find((x) => x.id === s.selectedId);
        if (!est) return;
        est.items = est.items.filter((it) => it.id !== id);
        if (est.items.length === 0) est.items = [{ id: uid(), name: "", unit: "М.пог", price: 0, qty: 0 }];
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
      return;
    }
  });

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
      rerender();
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
        item[field] = t.value;
      });
      rerender();
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
        item[field] = value;
      });
      rerender();
    }
  });
}

main();

