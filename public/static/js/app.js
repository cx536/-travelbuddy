/* 应用主逻辑：视图切换、表单交互、行程操作、智能体对话、行程收藏 */
(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = TBPlan.esc;
  const money = TBPlan.money;

  const PAGES = {
    explore: { title: "探索目的地", sub: "选中城市，一键生成逐日行程" },
    planner: { title: "智能规划", sub: "算法按地理位置串联，拒绝来回折返" },
    trips: { title: "我的行程", sub: "收藏的路线随时打开继续调整" },
    agent: { title: "旅行助手", sub: "一句话描述需求，直接拿到行程" },
  };

  const todayISO = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 10);
  };

  const state = {
    meta: null,
    cities: [],
    plan: null,
    activeDay: 0,
    view: "explore",
    suggestions: [],
    chat: [],
    chatPlan: null,
    trips: [],
    busy: false,
    ai: null,
    form: {
      city: "北京",
      days: 2,
      travelers: 2,
      preferences: [],
      pace: "normal",
      budget_level: "comfort",
      start_date: todayISO(),
    },
  };

  /* ------------------------------------------------ 基础工具 */
  let toastTimer = null;
  function toast(message) {
    const box = $("#toast");
    box.textContent = message;
    box.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove("is-show"), 2400);
  }

  function saveCache() {
    try {
      localStorage.setItem("tb.plan.v1", JSON.stringify(state.plan));
      localStorage.setItem("tb.form.v1", JSON.stringify(state.form));
    } catch (error) { /* 隐私模式下忽略 */ }
  }

  function loadCache() {
    try {
      const plan = JSON.parse(localStorage.getItem("tb.plan.v1") || "null");
      const form = JSON.parse(localStorage.getItem("tb.form.v1") || "null");
      if (form && typeof form === "object") state.form = { ...state.form, ...form };
      if (plan && Array.isArray(plan.itinerary) && plan.itinerary.length) {
        state.plan = plan;
        syncFormFromPlan(plan);
      }
    } catch (error) { /* ignore */ }
  }

  function syncFormFromPlan(plan) {
    state.form.city = plan.city.name;
    state.form.days = plan.days;
    state.form.travelers = plan.travelers || 1;
    state.form.preferences = [...(plan.preferences || [])];
    state.form.pace = plan.pace.key;
    state.form.budget_level = plan.budget_level.key;
    state.form.start_date = plan.start_date;
  }

  /* ------------------------------------------------ 视图切换 */
  function setView(name) {
    state.view = name;
    $$(".view").forEach((view) => view.classList.toggle("is-active", view.dataset.view === name));
    $$("[data-nav]").forEach((button) => button.classList.toggle("is-active", button.dataset.nav === name));
    const page = PAGES[name] || PAGES.explore;
    $(".topbar__title").childNodes[0].nodeValue = page.title + " ";
    $("#pageSubtitle").textContent = page.sub;
    document.title = `${page.title} · TravelBuddy`;
    if (location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
    $("#mainScroll").scrollTop = 0;
  }

  function updateModePill() {
    const preview = document.body.classList.contains("preview-app");
    const isMobile = window.matchMedia("(max-width: 899px)").matches;
    $("#modeText").textContent = preview ? "App 预览" : isMobile ? "App 版" : "Web 版";
  }

  function setBusy(flag) {
    state.busy = flag;
    const button = $("#planBtn");
    if (button) {
      button.disabled = flag;
      button.innerHTML = flag ? "🧠 正在排布路线…" : "✨ 生成智能行程";
    }
  }

  /* ------------------------------------------------ 探索页 */
  function renderPrefQuick() {
    const preferences = state.meta ? state.meta.preferences : ["自然", "人文", "美食", "亲子", "艺术", "夜景", "购物"];
    $("#prefQuick").innerHTML = preferences.map((pref) => {
      const active = state.form.preferences.includes(pref);
      return `<button class="chip ${active ? "is-active" : ""}" data-pref="${esc(pref)}">${esc(pref)}</button>`;
    }).join("");
  }

  function renderCityGrid(keyword = "") {
    const key = keyword.trim();
    const list = state.cities.filter((city) => {
      if (!key) return true;
      return city.name.includes(key) || city.blurb.includes(key) ||
        city.highlights.some((name) => name.includes(key));
    });
    if (!list.length) {
      $("#cityGrid").innerHTML = `<div class="empty" style="grid-column:1/-1"><b>🔎</b><h3>没有匹配的城市</h3><p>试试「成都」「西湖」或直接找旅行助手</p></div>`;
      return;
    }
    $("#cityGrid").innerHTML = list.map((city) => `
      <button class="city-card" data-city="${esc(city.name)}" data-generate="1">
        <div class="city-card__emoji">${esc(city.emoji)}</div>
        <div style="min-width:0;padding-right:34px">
          <h3>${esc(city.name)} <span>${esc(city.best_season)}</span></h3>
          <p>${esc(city.blurb)}</p>
          <div class="city-card__meta">
            <span class="badge">${city.poi_count} 个点位</span>
            <span class="badge badge--accent">${city.free_pois} 个免费</span>
            <span class="badge">⭐ ${city.avg_rating}</span>
          </div>
        </div>
        <span class="city-card__rating">${esc(city.highlights[0] || "")}</span>
        <span class="city-card__arrow">→</span>
      </button>`).join("");
  }

  /* ------------------------------------------------ 规划表单 */
  function renderPlannerForm() {
    const form = state.form;
    const paceOptions = state.meta ? state.meta.pace : [];
    const budgetOptions = state.meta ? state.meta.budget_levels : [];
    const preferences = state.meta ? state.meta.preferences : [];
    const paceDesc = (paceOptions.find((item) => item.key === form.pace) || {}).desc || "";
    const budgetDesc = (budgetOptions.find((item) => item.key === form.budget_level) || {}).desc || "";

    $("#plannerStage").innerHTML = `
      <div class="form-card">
        <div class="field">
          <div class="field__label">去哪儿 <small>${state.cities.length} 座城市 · ${state.cities.reduce((sum, city) => sum + city.poi_count, 0)} 个点位</small></div>
          <div class="city-picker">
            ${state.cities.map((city) => `
              <button class="city-pick ${city.name === form.city ? "is-active" : ""}" data-city="${esc(city.name)}">
                <b>${esc(city.emoji)}</b>${esc(city.name)}
                <small>${city.poi_count} 点位</small>
              </button>`).join("")}
          </div>
        </div>

        <div class="field field--split">
          <div>
            <div class="field__label">行程天数 <small>1-7 天</small></div>
            <div class="stepper">
              <button class="stepper__btn" data-step="days" data-delta="-1" ${form.days <= 1 ? "disabled" : ""}>−</button>
              <div class="stepper__value">${form.days}<small>天</small></div>
              <button class="stepper__btn" data-step="days" data-delta="1" ${form.days >= 7 ? "disabled" : ""}>+</button>
            </div>
          </div>
          <div>
            <div class="field__label">同行人数 <small>影响预算</small></div>
            <div class="stepper">
              <button class="stepper__btn" data-step="travelers" data-delta="-1" ${form.travelers <= 1 ? "disabled" : ""}>−</button>
              <div class="stepper__value">${form.travelers}<small>人</small></div>
              <button class="stepper__btn" data-step="travelers" data-delta="1" ${form.travelers >= 10 ? "disabled" : ""}>+</button>
            </div>
          </div>
        </div>

        <div class="field">
          <div class="field__label">出发日期 <small>第 2 天起自动顺延</small></div>
          <input id="startDate" type="date" data-field="start_date" value="${esc(form.start_date)}" min="${todayISO()}"
                 style="width:100%;height:42px;padding:0 12px;border-radius:12px;border:1px solid var(--line);background:#f7f9fc">
        </div>

        <div class="field">
          <div class="field__label">旅行偏好 <small>可多选，影响选点权重</small></div>
          <div class="chip-line">
            ${preferences.map((pref) => `<button class="chip ${form.preferences.includes(pref) ? "is-active" : ""}" data-pref="${esc(pref)}">${esc(pref)}</button>`).join("")}
          </div>
        </div>

        <div class="field">
          <div class="field__label">节奏 <small>${esc(paceDesc)}</small></div>
          <div class="segmented" data-group="pace">
            ${paceOptions.map((item) => `<button class="seg ${form.pace === item.key ? "is-active" : ""}" data-group="pace" data-value="${item.key}">${esc(item.label)}</button>`).join("")}
          </div>
        </div>

        <div class="field">
          <div class="field__label">预算档位 <small>${esc(budgetDesc)}</small></div>
          <div class="segmented" data-group="budget_level">
            ${budgetOptions.map((item) => `<button class="seg ${form.budget_level === item.key ? "is-active" : ""}" data-group="budget_level" data-value="${item.key}">${esc(item.label)}</button>`).join("")}
          </div>
        </div>

        <div class="form-actions">
          <button class="btn btn--primary btn--block" id="planBtn">✨ 生成智能行程</button>
        </div>
      </div>

      <div class="section" style="padding-top:16px">
        <div class="section-head">
          <h2>懒得填表？交给助手</h2>
          <p>一句话也能出方案</p>
        </div>
        <div class="chip-line">
          <button class="chip chip--soft" data-suggest="成都 3 天亲子游，预算 2000">🐼 成都 3 天亲子游，预算 2000</button>
          <button class="chip chip--soft" data-suggest="西安 2 天历史人文，节奏紧凑">🏛️ 西安 2 天历史人文</button>
          <button class="chip chip--soft" data-suggest="杭州 3 天轻松自然游">🌿 杭州 3 天轻松自然游</button>
        </div>
      </div>`;
  }

  /* ------------------------------------------------ 行程渲染 */
  function renderPlan() {
    const box = $("#planResult");
    if (!state.plan) {
      box.innerHTML = `
        <div class="card" style="margin:14px 16px 0;padding:30px 18px;text-align:center">
          <div style="font-size:36px;margin-bottom:8px">🗺️</div>
          <h3 style="font-size:15px;margin-bottom:6px">还没有生成行程</h3>
          <p style="font-size:12.5px;color:#7b8a9c">选择城市和偏好，点「生成智能行程」，30 毫秒内给你一版可执行路线。</p>
        </div>`;
      return;
    }
    state.activeDay = Math.min(state.activeDay, state.plan.itinerary.length - 1);
    box.innerHTML = TBPlan.render(state.plan, state.activeDay);
  }

  async function generatePlan(options = {}) {
    if (state.busy) return;
    const form = state.form;
    setBusy(true);
    const silent = options.silent;
    try {
      const result = await API.plan({
        city: form.city,
        days: form.days,
        preferences: form.preferences,
        pace: form.pace,
        budget_level: form.budget_level,
        travelers: form.travelers,
        start_date: form.start_date,
      });
      state.plan = result.plan;
      state.activeDay = 0;
      saveCache();
      renderPlan();
      if (!silent) toast(`${form.city} ${form.days} 天行程已生成`);
    } catch (error) {
      toast(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateDayOrder(dayIndex, poiId, action) {
    const day = state.plan.itinerary[dayIndex];
    const order = [...day.visit_order];
    const index = order.indexOf(poiId);

    if (action === "remove") {
      order.splice(index, 1);
      if (!order.length) {
        toast("这一天没有点位了，可以从「替换」里加回来");
      }
    } else {
      const target = index + (action === "up" ? -1 : 1);
      if (target < 0 || target >= order.length) return;
      [order[index], order[target]] = [order[target], order[index]];
    }

    try {
      const result = await API.reorder(state.plan, { [String(dayIndex)]: order });
      state.plan = result.plan;
      saveCache();
      renderPlan();
      if (action !== "remove") toast("顺序已更新，时间轴重新计算");
    } catch (error) {
      toast(error.message);
    }
  }

  function openReplaceModal(dayIndex, poiId) {
    const day = state.plan.itinerary[dayIndex];
    const current = day.events.find((event) => event.id === poiId);
    const candidates = state.plan.candidates.filter((poi) => poi.id !== poiId);
    if (!candidates.length) {
      toast("暂无候选点位");
      return;
    }
    openModal(`
      <div class="modal__head">
        <h3>替换「${esc(current ? current.name : "点位")}」</h3>
        <button class="modal__close" data-close-modal>✕</button>
      </div>
      <p style="font-size:12px;color:#7b8a9c;margin-bottom:12px">从同城候选中挑选，替换后时间轴与预算会自动重排。</p>
      <div class="opt-list">
        ${candidates.map((poi) => `
          <button class="opt-item" data-replace="${esc(poi.id)}" data-day="${dayIndex}" data-old="${esc(poiId)}">
            <span style="font-size:19px">${poi.category === "food" ? "🍜" : poi.category === "night" ? "🌃" : poi.category === "nature" ? "🌿" : poi.category === "art" ? "🎨" : poi.category === "family" ? "🎡" : poi.category === "shopping" ? "🛍️" : "🏛️"}</span>
            <span style="min-width:0;flex:1">
              <b>${esc(poi.name)}</b>
              <small>${esc(poi.desc)}</small>
            </span>
            <span class="pri">⭐ ${poi.rating}<br>${poi.ticket ? `¥${poi.ticket}` : "免费"}<br>${poi.duration} 分钟</span>
          </button>`).join("")}
      </div>`);
  }

  async function replacePoi(dayIndex, oldId, newId) {
    try {
      const result = await API.replace(state.plan, dayIndex, oldId);
      state.plan = result.plan;
      saveCache();
      renderPlan();
      closeModal();
      toast("已替换点位并重算行程");
    } catch (error) {
      toast(error.message);
    }
  }

  /* ------------------------------------------------ 弹层 */
  function openModal(html) {
    $("#modalPanel").innerHTML = html;
    $("#modal").classList.add("is-open");
  }

  function closeModal() {
    $("#modal").classList.remove("is-open");
  }

  /* ------------------------------------------------ 我的行程 */
  function renderTrips() {
    const list = state.trips || [];
    $("#tripCount").textContent = `${list.length} 条收藏`;
    if (!list.length) {
      $("#tripList").innerHTML = `
        <div class="empty">
          <b>📌</b>
          <h3>还没有收藏行程</h3>
          <p>生成一版行程后点右上角「保存」，就会出现在这里。</p>
          <button class="btn btn--primary" style="margin-top:14px" data-nav="planner">去规划一趟</button>
        </div>`;
      return;
    }
    $("#tripList").innerHTML = list.map((trip) => `
      <div class="trip-card" data-trip-open="${trip.id}" role="button" tabindex="0">
        <div class="trip-card__emoji">${esc((trip.summary && trip.summary.emoji) || "🧭")}</div>
        <div style="min-width:0">
          <h4>${esc(trip.title)}</h4>
          <p>${esc((trip.summary.preferences || []).join(" · ") || "城市精华")} · ${trip.days} 天</p>
          <div class="trip-card__meta">
            <span class="badge badge--accent">${trip.summary.poi_count} 个点位</span>
            <span class="badge">¥${money(trip.summary.total)}</span>
            <span class="badge">${esc(trip.created_at)}</span>
          </div>
        </div>
        <button class="trip-card__del" data-trip-del="${trip.id}" title="删除行程">✕</button>
      </div>`).join("");
  }

  async function loadTrips() {
    try {
      const result = await API.trips();
      state.trips = result.trips || [];
    } catch (error) {
      state.trips = [];
    }
    renderTrips();
  }

  async function openTrip(id) {
    try {
      const result = await API.getTrip(id);
      state.plan = result.trip.payload;
      state.activeDay = 0;
      syncFormFromPlan(state.plan);
      renderPlannerForm();
      renderPlan();
      saveCache();
      setView("planner");
      toast("已打开行程，可继续调整");
    } catch (error) {
      toast(error.message);
    }
  }

  function confirmDeleteTrip(id) {
    const trip = state.trips.find((item) => item.id === id);
    openModal(`
      <div class="modal__head">
        <h3>删除行程</h3>
        <button class="modal__close" data-close-modal>✕</button>
      </div>
      <p style="font-size:12.5px;color:#7b8a9c;line-height:1.6">确定删除「${esc(trip ? trip.title : "该行程")}」吗？删除后无法恢复。</p>
      <div style="display:flex;gap:10px;margin-top:18px">
        <button class="btn btn--ghost btn--block" data-close-modal>再想想</button>
        <button class="btn btn--primary btn--block" data-confirm-del="${id}">确认删除</button>
      </div>`);
  }

  async function removeTrip(id) {
    try {
      await API.deleteTrip(id);
      closeModal();
      await loadTrips();
      toast("行程已删除");
    } catch (error) {
      toast(error.message);
    }
  }

  /* ------------------------------------------------ 智能体 */
  function formatMessage(text) {
    return esc(text)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`(.+?)`/g, "<code>$1</code>");
  }

  function renderChat() {
    const log = $("#chatLog");
    if (!state.chat.length) {
      log.innerHTML = `
        <div class="msg">
          <div class="bubble">你好，我是 TravelBuddy 行程管家 👋
告诉我想去哪、玩几天、和谁一起，我会直接排一版可执行的行程，并附上预算与地图动线。</div>
        </div>`;
    } else {
      log.innerHTML = state.chat.map((message, index) => {
        if (message.role === "user") {
          return `<div class="msg msg--user"><div class="bubble">${formatMessage(message.text)}</div></div>`;
        }
        if (message.typing) {
          const hint = state.ai && state.ai.mode === "ai" ? "正在检索知识库并规划…" : "";
          return `<div class="msg"><div class="bubble"><span class="typing"><i></i><i></i><i></i></span>${
            hint ? `<span class="typing__hint">${hint}</span>` : ""}</div></div>`;
        }
        const planCard = message.plan ? `
          <div class="plan-mini">
            <div class="plan-mini__main">
              <span class="plan-mini__emoji">${esc(message.plan.city.emoji)}</span>
              <div class="plan-mini__body">
                <div class="plan-mini__title">${esc(message.plan.city.name)} · ${message.plan.days} 天</div>
                <div class="plan-mini__meta">${message.plan.stats.poi_count} 个点位 · 预算约 ¥${money(message.plan.budget.total)}</div>
              </div>
            </div>
            <button class="btn btn--sm btn--primary plan-mini__cta" data-open-plan="${index}">查看行程 →</button>
          </div>` : "";
        const aiTag = message.aiSource
          ? `<span class="bubble__tag">${esc(message.aiSource)}</span>` : "";
        return `<div class="msg"><div class="msg__stack">${aiTag}<div class="bubble">${formatMessage(message.text)}</div>${renderRefCards(message.cards)}${planCard}${renderBooking(message.booking)}</div></div>`;
      }).join("");
    }
    renderSuggestions();
    const main = $("#mainScroll");
    main.scrollTop = main.scrollHeight;
  }

  /* 知识库图文卡片：文字与图片都来自检索到的景点 */
  function renderRefCards(cards) {
    if (!cards || !cards.length) return "";
    return `<div class="ref-cards">${cards.map((card) => `
      <div class="ref-card">
        <img class="ref-card__img" src="${esc(card.image)}" alt="${esc(card.name)}" onerror="this.onerror=null;this.src='/img/placeholder.svg'" />
        <div class="ref-card__body">
          <div class="ref-card__title">${esc(card.name)}</div>
          <div class="ref-card__meta">${esc(card.city)} · ${esc(card.category || "景点")} · ${
            card.ticket ? `¥${esc(card.ticket)}` : "免费"}</div>
          <div class="ref-card__desc">${esc(card.desc)}</div>
        </div>
      </div>`).join("")}</div>`;
  }

  function renderBooking(booking) {
    if (!booking) return "";
    const items = (booking.items || []).slice(0, 3).map((item) => `
      <button class="book-item" data-fliggy="${esc(item.url)}">
        <span class="book-item__title">${esc(item.title || "查看详情")}</span>
        <span class="book-item__meta">${item.price !== "" && item.price !== undefined ? `¥${esc(item.price)}` : esc(item.desc || "")}</span>
      </button>`).join("");
    return `
      <div class="book-card">
        <div class="book-card__head">
          <span class="book-card__icon">${esc(booking.icon || "🎫")}</span>
          <div>
            <div class="book-card__title">${esc(booking.title)}</div>
            <div class="book-card__note">${esc(booking.note || "飞猪实时搜索")}</div>
          </div>
        </div>
        ${items}
        <button class="btn btn--sm btn--primary book-card__cta" data-fliggy="${esc(booking.jumpUrl)}">打开飞猪 App 下单 →</button>
      </div>`;
  }

  /* 打开飞猪：手机端先尝试唤起 App，未安装则回落网页 */
  function openFliggy(url) {
    if (!url) return;
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    if (!isMobile) {
      window.open(url, "_blank", "noopener");
      return;
    }
    const fallback = window.setTimeout(() => { window.location.href = url; }, 900);
    document.addEventListener("visibilitychange", function onHide() {
      window.clearTimeout(fallback);
      document.removeEventListener("visibilitychange", onHide);
    }, { once: true });
    window.location.href = "fliggy://webview?url=" + encodeURIComponent(url);
  }

  function renderSuggestions() {
    $("#chatSuggestions").innerHTML = state.suggestions
      .map((text) => `<button class="chip chip--soft" data-suggest="${esc(text)}">${esc(text)}</button>`)
      .join("");
  }

  async function sendChat(rawText) {
    const text = (rawText || "").trim();
    if (!text || state.busy) return;
    const input = $("#chatInput");
    if (input) {
      input.value = "";
      input.style.height = "";  /* 发送后输入框回到单行高度 */
    }
    state.chat.push({ role: "user", text });
    state.chat.push({ role: "bot", typing: true });
    state.busy = true;
    renderChat();
    try {
      const result = await API.chat(text, state.chatPlan);
      state.chat = state.chat.filter((message) => !message.typing);
      state.chat.push({
        role: "bot",
        text: result.reply,
        plan: result.plan || null,
        cards: result.cards || [],
        booking: result.booking || null,
        aiSource: result.source === "ai" ? `AI · ${(state.ai && state.ai.model) || "DeepSeek"}` : "",
      });
      if (result.plan) {
        state.chatPlan = result.plan;
        state.plan = result.plan;
        state.activeDay = 0;
        syncFormFromPlan(result.plan);
        renderPlannerForm();
        renderPlan();
        saveCache();
      }
      state.suggestions = result.suggestions || [];
    } catch (error) {
      state.chat = state.chat.filter((message) => !message.typing);
      state.chat.push({ role: "bot", text: `抱歉，出了点问题：${error.message}` });
      toast(error.message);
    } finally {
      state.busy = false;
      renderChat();
    }
  }

  /* ------------------------------------------------ 初始化 */
  function updateAiPanel(ai) {
    state.ai = ai || null;
    const badge = $("#aiBadge");
    const hero = $("#chatHeroText");
    if (!badge || !hero) return;
    if (ai && ai.mode === "ai") {
      badge.hidden = false;
      hero.textContent = `DeepSeek 已接入 · 知识库 ${ai.index_docs} 条资料，先检索再规划`;
    } else {
      badge.hidden = true;
      hero.textContent = "会解析城市、天数、预算、同行人，直接给出可执行路线";
    }
  }

  async function bootstrap() {
    loadCache();
    updateModePill();
    window.addEventListener("resize", updateModePill);

    API.aiStatus()
      .then((ai) => {
        updateAiPanel(ai);
        renderChat();
      })
      .catch(() => updateAiPanel(null));

    try {
      const [meta, cityResult] = await Promise.all([API.meta(), API.cities()]);
      state.meta = meta;
      state.cities = cityResult.cities || [];
    } catch (error) {
      toast(error.message);
      state.cities = [];
    }

    const totalPois = state.cities.reduce((sum, city) => sum + city.poi_count, 0);
    $("#statCities").textContent = String(state.cities.length || 6);
    $("#statPois").textContent = totalPois ? String(totalPois) : "90+";
    const avg = state.cities.length
      ? (state.cities.reduce((sum, city) => sum + city.avg_rating, 0) / state.cities.length).toFixed(1)
      : "4.6";
    $("#statRating").textContent = avg;
    $("#railCityCount").textContent = `${state.cities.length} 座城市 · ${totalPois} 个精选点位`;

    if (state.cities.length && !state.cities.some((city) => city.name === state.form.city)) {
      state.form.city = state.cities[0].name;
    }

    renderPrefQuick();
    renderCityGrid();
    renderPlannerForm();
    renderPlan();
    renderChat();
    state.suggestions = ["成都 3 天亲子游，预算 2000", "西安 2 天历史人文", "杭州 3 天轻松自然游", "厦门 2 天看海拍照"];
    renderSuggestions();
    await loadTrips();

    /* 支持分享链接：/?city=成都&days=3&pref=亲子,美食&pace=relaxed&auto=1 */
    const params = new URLSearchParams(location.search);
    const queryCity = params.get("city");
    const hasQuery = Boolean(queryCity);
    if (queryCity && state.cities.some((city) => city.name === queryCity)) {
      state.form.city = queryCity;
    }
    if (params.get("days")) state.form.days = Math.max(1, Math.min(7, Number(params.get("days")) || 1));
    if (params.get("travelers")) state.form.travelers = Math.max(1, Math.min(10, Number(params.get("travelers")) || 1));
    if (params.get("pref")) state.form.preferences = params.get("pref").split(/[,，]/).filter(Boolean);
    if (params.get("pace")) state.form.pace = params.get("pace");
    if (params.get("budget")) state.form.budget_level = params.get("budget");
    if (params.get("date")) state.form.start_date = params.get("date");
    if (hasQuery) {
      renderPrefQuick();
      renderPlannerForm();
      setView("planner");
      if (params.get("auto")) {
        await generatePlan({ silent: true });
        toast("已按分享链接生成行程");
      }
    } else {
      const hashView = location.hash.replace("#", "");
      setView(PAGES[hashView] ? hashView : "explore");
    }

    if (state.plan) {
      toast("已恢复上次编辑的行程");
    }

    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("/sw.js").catch(() => null);
    }
  }

  /* ------------------------------------------------ 事件委托 */
  document.addEventListener("click", async (event) => {
    const target = event.target.closest(
      "[data-nav],[data-city],[data-pref],[data-step],[data-group],[data-plan-action],[data-action]," +
      "[data-pin],[data-day],[data-replace],[data-trip-open],[data-trip-del],[data-confirm-del]," +
      "[data-suggest],[data-open-plan],[data-close-modal],[data-fliggy],#planBtn,#deviceToggle,#railExploreBtn,#railAgentBtn"
    );
    if (!target) return;

    if (target.dataset.fliggy) { openFliggy(target.dataset.fliggy); return; }

    if (target.id === "deviceToggle") {
      const active = document.body.classList.toggle("preview-app");
      updateModePill();
      toast(active ? "手机 App 视图预览，再次点击可返回" : "已切回 Web 视图");
      return;
    }
    if (target.id === "railExploreBtn") { setView("explore"); return; }
    if (target.id === "railAgentBtn") { setView("agent"); setTimeout(() => $("#chatInput").focus(), 120); return; }
    if (target.id === "planBtn") { await generatePlan(); return; }

    if (target.dataset.closeModal !== undefined) { closeModal(); return; }
    if (target.dataset.nav) { setView(target.dataset.nav); return; }

    if (target.dataset.city) {
      state.form.city = target.dataset.city;
      renderPlannerForm();
      renderCityGrid($("#exploreSearch") ? $("#exploreSearch").value : "");
      if (target.dataset.generate) {
        setView("planner");
        await generatePlan({ silent: true });
      }
      return;
    }

    if (target.dataset.pref) {
      const pref = target.dataset.pref;
      const index = state.form.preferences.indexOf(pref);
      if (index >= 0) state.form.preferences.splice(index, 1);
      else state.form.preferences.push(pref);
      renderPlannerForm();
      renderPrefQuick();
      if (state.view !== "planner") {
        setView("planner");
        toast(`已带上「${pref}」偏好，点生成即可`);
      }
      return;
    }

    if (target.dataset.step) {
      const key = target.dataset.step;
      const delta = Number(target.dataset.delta);
      const next = state.form[key] + delta;
      const limits = { days: [1, 7], travelers: [1, 10] };
      const [min, max] = limits[key] || [1, 99];
      state.form[key] = Math.max(min, Math.min(max, next));
      renderPlannerForm();
      saveCache();
      return;
    }

    if (target.dataset.group) {
      state.form[target.dataset.group] = target.dataset.value;
      renderPlannerForm();
      saveCache();
      return;
    }

    if (target.dataset.planAction) {
      if (target.dataset.planAction === "save") {
        try {
          await API.saveTrip(state.plan);
          await loadTrips();
          toast("已保存到「我的行程」");
        } catch (error) { toast(error.message); }
      } else if (target.dataset.planAction === "copy") {
        const text = TBPlan.planText(state.plan);
        try {
          await navigator.clipboard.writeText(text);
          toast("行程文本已复制到剪贴板");
        } catch (error) {
          toast("复制失败，可长按文本手动复制");
        }
      } else if (target.dataset.planAction === "refresh") {
        await generatePlan();
      }
      return;
    }

    if (target.dataset.action) {
      const dayIndex = Number(target.dataset.day);
      const poiId = target.dataset.poi;
      const action = target.dataset.action;
      if (action === "replace") openReplaceModal(dayIndex, poiId);
      else await updateDayOrder(dayIndex, poiId, action);
      return;
    }

    if (target.dataset.replace) {
      await replacePoi(Number(target.dataset.day), target.dataset.old, target.dataset.replace);
      return;
    }

    if (target.dataset.pin) {
      state.activeDay = state.activeDay;
      const card = $(`[data-card="${target.dataset.pin}"]`);
      if (card) {
        $$(".event__card").forEach((item) => item.classList.remove("is-focus"));
        card.classList.add("is-focus");
        card.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    if (target.dataset.day !== undefined) {
      state.activeDay = Number(target.dataset.day);
      renderPlan();
      return;
    }

    if (target.dataset.tripOpen) { await openTrip(Number(target.dataset.tripOpen)); return; }
    if (target.dataset.tripDel) { confirmDeleteTrip(Number(target.dataset.tripDel)); return; }
    if (target.dataset.confirmDel) { await removeTrip(Number(target.dataset.confirmDel)); return; }

    if (target.dataset.suggest) {
      setView("agent");
      await sendChat(target.dataset.suggest);
      return;
    }

    if (target.dataset.openPlan !== undefined) {
      const message = state.chat[Number(target.dataset.openPlan)];
      if (message && message.plan) {
        state.plan = message.plan;
        state.activeDay = 0;
        syncFormFromPlan(message.plan);
        renderPlannerForm();
        renderPlan();
        saveCache();
        setView("planner");
      }
      return;
    }
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (target.dataset && target.dataset.field === "start_date") {
      state.form.start_date = target.value || todayISO();
      saveCache();
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.id === "exploreSearch") {
      renderCityGrid(event.target.value);
    }
  });

  /* 输入框随内容自动长高，最高 132px，超出后内部滚动 */
  document.addEventListener("input", (event) => {
    if (event.target.id !== "chatInput") return;
    const el = event.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  });

  document.addEventListener("keydown", (event) => {
    if (event.target.id === "chatInput") {
      /* Enter 发送，Shift+Enter 换行 */
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendChat(event.target.value);
      }
      return;
    }
    if (event.key === "Escape") closeModal();
  });

  $("#modal").addEventListener("click", (event) => {
    if (event.target.id === "modal") closeModal();
  });

  bootstrap();
})();
