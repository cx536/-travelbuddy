/* 附加功能：出发地选择 + 订单记录（不改动原有界面结构） */
(() => {
  const ORIGIN_KEY = "tb_origin";
  const ORDER_KEY = "tb_orders";
  const CITIES = ["上海", "北京", "成都", "西安", "杭州", "厦门"];

  const readOrigin = () => {
    const value = localStorage.getItem(ORIGIN_KEY);
    return CITIES.includes(value) ? value : "上海";
  };
  const writeOrigin = (value) => localStorage.setItem(ORIGIN_KEY, value);

  const readOrders = () => {
    try {
      const list = JSON.parse(localStorage.getItem(ORDER_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  };
  const writeOrders = (list) => localStorage.setItem(ORDER_KEY, JSON.stringify(list.slice(0, 30)));

  const BOOKING_KEY = "tb_web_bookings";
  const readBookings = () => {
    try {
      const list = JSON.parse(localStorage.getItem(BOOKING_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  };
  const writeBookings = (list) => localStorage.setItem(BOOKING_KEY, JSON.stringify(list.slice(0, 50)));
  let pickedPlatform = "";

  /* ---------------- 出发地表单 ---------------- */
  function originHtml() {
    const origin = readOrigin();
    return `
      <div class="field" id="originField">
        <div class="field__label">从哪儿出发 <small>用于计算到达日交通</small></div>
        <div class="chip-line" id="originLine">
          ${CITIES.map((name) => `<button class="chip origin-chip ${name === origin ? "is-active" : ""}" data-origin="${name}">${name}</button>`).join("")}
        </div>
      </div>`;
  }

  function injectOrigin() {
    const stage = document.getElementById("plannerStage");
    const card = stage && stage.querySelector(".form-card");
    if (!card || card.querySelector("#originField")) return;
    card.insertAdjacentHTML("afterbegin", originHtml());
  }

  function watchPlanner() {
    const stage = document.getElementById("plannerStage");
    if (!stage) return;
    new MutationObserver(() => injectOrigin()).observe(stage, { childList: true, subtree: false });
    injectOrigin();
  }

  function toast(message) {
    const node = document.getElementById("toast");
    if (!node) return;
    node.textContent = message;
    node.classList.add("is-show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("is-show"), 1800);
  }

  /* ---------------- 订单 ---------------- */
  function refreshOrderCount() {
    const btn = document.getElementById("orderBtn");
    if (!btn) return;
    const count = readOrders().length + readBookings().length;
    const badge = btn.querySelector(".order-count");
    if (badge) badge.textContent = count ? String(count) : "";
  }

  function recordOrder(plan) {
    const orders = readOrders();
    orders.unshift({
      origin: plan.origin || readOrigin(),
      city: plan.city.name,
      emoji: plan.city.emoji,
      days: plan.days,
      travelers: plan.travelers,
      total: plan.budget.total,
      at: new Date().toLocaleString("zh-CN", { hour12: false }),
      status: "待接入",
    });
    writeOrders(orders);
    refreshOrderCount();
  }

  function openOrders() {
    const modal = document.getElementById("modal");
    const panel = document.getElementById("modalPanel");
    const orders = readOrders();
    const bookings = readBookings();
    const orderHtml = orders.length ? orders.map((order) => `
        <div class="trip-card" style="cursor:default">
          <div class="trip-card__emoji">${order.emoji || "🧭"}</div>
          <div style="min-width:0;flex:1">
            <h4>${order.origin} → ${order.city} · ${order.days} 天</h4>
            <p>${order.travelers} 人同行 · 预算约 ¥${Number(order.total).toLocaleString("zh-CN")}</p>
            <div class="trip-card__meta">
              <span class="badge badge--accent">${order.status}</span>
              <span class="badge">${order.at}</span>
            </div>
          </div>
        </div>`).join("") : `
        <div class="empty">
          <b>🧾</b>
          <h3>还没有订单</h3>
          <p>去「智能规划」选好出发地和目的地，生成一趟行程后再回来看看。</p>
        </div>`;
    const bookingHtml = bookings.length ? bookings.map((item) => `
        <div class="order-row">
          <span class="rt">${item.kind} · ${item.platform}</span>
          <span class="rs">${item.route}</span>
          <span class="badge">已预订</span>
        </div>
        <div class="order-sub">${item.at} · 外部平台完成，仅作记录</div>`).join("") : `
        <div class="empty">
          <b>🏨</b>
          <h3>还没有预订记录</h3>
          <p>从「出行工具」跳转到平台完成预订后，回来记一笔。</p>
        </div>`;
    panel.innerHTML = `
      <div class="modal__head">
        <h3>订单</h3>
        <button class="modal__close" data-close-modal>✕</button>
      </div>
      <p style="font-size:12px;color:#7b8a9c;line-height:1.7;margin-bottom:6px">
        生成的行程与外部平台预订都会记在这里，支付与真实出票等能力后续接入。
      </p>
      <div class="sec-label">行程</div>
      ${orderHtml}
      <div class="sec-label">预订</div>
      ${bookingHtml}
    `;
    modal.classList.add("is-open");
  }

  /* ---------------- 出行工具 ---------------- */
  const TOOL_NAMES = { map: "地图导航", transit: "交通出行", hotel: "酒店住宿", food: "吃喝玩乐" };

  function platformList(links) {
    const list = links || [];
    if (!pickedPlatform && list.length) pickedPlatform = list[0].platform;
    return `<div class="plat-list">${list.map((link) => `
      <a class="plat-item${link.platform === pickedPlatform ? " is-picked" : ""}" data-platform="${link.platform}"
         href="${link.url}" target="_blank" rel="noopener">
        <b>${link.name}</b><small>${link.note || ""}</small><span>打开 →</span>
      </a>`).join("")}</div>`;
  }

  function bookingButton(kind, route) {
    return `<button class="book-btn" id="bookBtn" data-kind="${kind}" data-route="${route}">
        我已在平台完成预订，记入订单
      </button>
      <p class="tool-note">跳转后请在第三方平台完成下单与支付，本应用只做记录。</p>`;
  }

  function toolHtml(key, data) {
    const route = data.route;
    const head = `<div class="tool-route"><b>${route.from} → ${route.to}</b>
      <span>约 ${route.distance_km} km · ${route.to_tagline}</span></div>`;

    if (key === "map") {
      return head + `<div class="sec-label">高德地图</div><div class="plat-list">
        <a class="plat-item" href="${data.navigation.amap_car}" target="_blank" rel="noopener"><b>驾车导航</b><small>唤起高德 App 规划路线</small><span>打开 →</span></a>
        <a class="plat-item" href="${data.navigation.amap_transit}" target="_blank" rel="noopener"><b>公交 / 地铁</b><small>公共交通换乘方案</small><span>打开 →</span></a>
        <a class="plat-item" href="${data.navigation.amap_search}" target="_blank" rel="noopener"><b>高德搜地点</b><small>搜索目的地周边</small><span>打开 →</span></a>
      </div><p class="tool-note">手机上点按会优先唤起高德地图 App，未安装则打开网页版。</p>`;
    }

    if (key === "transit") {
      const options = (data.transport.options || []).map((item) => `
        <div class="order-row"><span class="rt">${item.label}</span><span class="rs">${item.duration}</span></div>
        <div class="order-sub">${item.note}</div>`).join("");
      return head + `<div class="sec-label">可选出行方式</div>${options}
        <div class="sec-label">去平台订票</div>${platformList(data.transport.links)}
        ${bookingButton("交通", `${route.from} → ${route.to}`)}`;
    }

    if (key === "hotel") {
      return head + `<div class="sec-label">住宿区域建议</div>
        <div class="order-row"><span class="rt">${data.hotel.area}</span><span class="badge">推荐</span></div>
        <div class="sec-label">去平台订酒店</div>${platformList(data.hotel.links)}
        ${bookingButton("住宿", `${route.to} · ${data.hotel.area}`)}`;
    }

    return head + `<div class="sec-label">本地吃喝玩乐</div>${platformList(data.fun.links)}
      <p class="tool-note">点开平台后搜索目的地，团购与排队信息以平台为准。</p>`;
  }

  async function openTool(key) {
    const from = readOrigin();
    const latest = readOrders()[0];
    const to = (latest && latest.city) || "杭州";
    pickedPlatform = "";
    const panel = document.getElementById("modalPanel");
    panel.innerHTML = `<div class="modal__head"><h3>${TOOL_NAMES[key] || "出行工具"}</h3>
      <button class="modal__close" data-close-modal>✕</button></div>
      <p style="font-size:12px;color:#7b8a9c">正在准备可用平台…</p>`;
    document.getElementById("modal").classList.add("is-open");
    if (from === to) {
      panel.innerHTML = `<div class="modal__head"><h3>${TOOL_NAMES[key]}</h3>
        <button class="modal__close" data-close-modal>✕</button></div>
        <p style="font-size:12px;color:#7b8a9c">出发地和目的地相同，先在「智能规划」选好目的地再回来。</p>`;
      return;
    }
    try {
      const response = await fetch(`/api/tools?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      const data = await response.json();
      panel.innerHTML = `<div class="modal__head"><h3>${TOOL_NAMES[key]} · ${from} → ${to}</h3>
        <button class="modal__close" data-close-modal>✕</button></div>${toolHtml(key, data)}`;
    } catch (error) {
      panel.innerHTML = `<div class="modal__head"><h3>${TOOL_NAMES[key]}</h3>
        <button class="modal__close" data-close-modal>✕</button></div>
        <p style="font-size:12px;color:#7b8a9c">加载失败：${error.message}</p>`;
    }
  }

  function closeOrders() {
    document.getElementById("modal").classList.remove("is-open");
  }

  function addOrderButton() {
    const actions = document.querySelector(".topbar__actions");
    if (!actions || document.getElementById("orderBtn")) return;
    const btn = document.createElement("button");
    btn.id = "orderBtn";
    btn.className = "btn btn--sm";
    btn.title = "订单";
    btn.innerHTML = '<span>🧾</span><span class="btn__label">订单</span><span class="order-count"></span>';
    actions.insertBefore(btn, actions.firstChild);
  }

  /* ---------------- 请求拦截：补出发地 + 记录订单 ---------------- */
  function patchFetch() {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      let nextInit = init;
      if (/\/api\/plan$/i.test(url) && init && typeof init.body === "string") {
        try {
          const body = JSON.parse(init.body);
          if (!body.origin) body.origin = readOrigin();
          nextInit = { ...init, body: JSON.stringify(body) };
        } catch { /* 保持原样 */ }
      }
      return nativeFetch(input, nextInit).then((response) => {
        if (/\/api\/plan$/i.test(url) && response.ok) {
          response.clone().json().then((data) => {
            if (data && data.plan) recordOrder(data.plan);
          }).catch(() => {});
        }
        return response;
      });
    };
  }

  /* ---------------- 事件 ---------------- */
  document.addEventListener("click", (event) => {
    const originChip = event.target.closest("[data-origin]");
    if (originChip) {
      writeOrigin(originChip.dataset.origin);
      document.querySelectorAll(".origin-chip").forEach((chip) => {
        chip.classList.toggle("is-active", chip.dataset.origin === originChip.dataset.origin);
      });
      return;
    }
    if (event.target.closest("#orderBtn")) {
      openOrders();
      return;
    }

    const toolCard = event.target.closest("[data-tool]");
    if (toolCard) {
      openTool(toolCard.dataset.tool);
      return;
    }

    const platform = event.target.closest(".plat-item[data-platform]");
    if (platform) {
      pickedPlatform = platform.dataset.platform;
      document.querySelectorAll(".plat-item").forEach((item) => {
        item.classList.toggle("is-picked", item === platform);
      });
      return;
    }

    const bookBtn = event.target.closest("#bookBtn");
    if (bookBtn) {
      const bookings = readBookings();
      const route = bookBtn.dataset.route || "";
      bookings.unshift({
        kind: bookBtn.dataset.kind || "预订",
        platform: pickedPlatform || "外部平台",
        route,
        at: new Date().toLocaleString("zh-CN", { hour12: false }),
      });
      writeBookings(bookings);
      refreshOrderCount();
      toast(`已记入订单：${pickedPlatform || "外部平台"}`);
      closeOrders();
      return;
    }

    if (event.target.closest("[data-close-modal]") || event.target.id === "modal") {
      closeOrders();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeOrders();
  });

  function injectStyle() {
    if (document.getElementById("tb-extra-style")) return;
    const style = document.createElement("style");
    style.id = "tb-extra-style";
    style.textContent = ".order-count{display:inline-block;min-width:16px;padding:0 5px;border-radius:999px;background:#0e9f95;color:#fff;font-size:10px;font-weight:700;line-height:16px;text-align:center}.order-count:empty{display:none}";
    document.head.appendChild(style);
  }

  injectStyle();
  addOrderButton();
  refreshOrderCount();
  patchFetch();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watchPlanner);
  } else {
    watchPlanner();
  }
})();
