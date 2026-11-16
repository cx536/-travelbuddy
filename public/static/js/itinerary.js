/* 行程渲染：把后端 plan 数据结构渲染成 HTML（不含事件绑定） */
const TBPlan = (() => {
  const DAY_COLORS = ["#ff7043", "#0e9f95", "#5b7cf7", "#9b6bf2", "#f59e0b", "#ef476f"];

  function esc(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function money(value) {
    const number = Number(value || 0);
    return number >= 1000 ? Math.round(number).toLocaleString("zh-CN") : String(Math.round(number));
  }

  function dateLabel(iso) {
    const parts = (iso || "").split("-");
    return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : iso;
  }

  /* -------------------- 顶部概览 -------------------- */
  function head(plan) {
    const city = plan.city;
    const nights = Math.max(plan.days - 1, 0);
    const chips = [
      plan.preferences.length ? plan.preferences.join(" · ") : "城市精华",
      `${plan.pace.label}节奏`,
      `${plan.budget_level.label}预算`,
      `${plan.travelers} 人同行`,
    ].filter(Boolean);
    return `
      <div class="plan-head">
        <div class="plan-head__top">
          <div class="plan-head__emoji">${esc(city.emoji)}</div>
          <div style="min-width:0">
            <h2>${esc(city.name)} · ${plan.days} 天${nights ? ` ${nights} 晚` : ""}</h2>
            <p>${esc(chips.join(" · "))}</p>
          </div>
          <div class="plan-head__actions">
            <button class="btn btn--sm" data-plan-action="refresh" title="换一版"><span>🔄</span><span class="btn__label">换一版</span></button>
            <button class="btn btn--sm" data-plan-action="save" title="保存行程"><span>💾</span><span class="btn__label">保存</span></button>
            <button class="btn btn--sm" data-plan-action="copy" title="复制文本"><span>📋</span><span class="btn__label">复制</span></button>
          </div>
        </div>
        <div class="plan-head__stats">
          <div><b>${plan.stats.poi_count}</b><span>个点位</span></div>
          <div><b>${plan.stats.distance_km}<small>km</small></b><span>点位间移动</span></div>
          <div><b>${plan.stats.visit_hours}<small>h</small></b><span>纯游玩</span></div>
          <div><b>${money(plan.budget.total)}</b><span>预算（元）</span></div>
        </div>
      </div>`;
  }

  /* -------------------- 天气 -------------------- */
  function weather(plan) {
    return `
      <div class="weather-strip">
        ${plan.itinerary.map((day) => `
          <div class="weather">
            <b>${dateLabel(day.date)} ${esc(day.weekday)}</b>
            <span class="wx-icon">${esc(day.weather.icon)}</span>
            <small>${esc(day.weather.condition)} ${day.weather.low}°~${day.weather.high}°</small>
          </div>`).join("")}
      </div>`;
  }

  /* -------------------- 日期标签 -------------------- */
  function dayTabs(plan, activeDay) {
    return `
      <div class="day-tabs">
        ${plan.itinerary.map((day, index) => `
          <button class="day-tab ${index === activeDay ? "is-active" : ""}" data-day="${index}">
            第 ${day.day} 天
            <small>${dateLabel(day.date)} · ${day.weather.icon} ${day.weather.condition}</small>
          </button>`).join("")}
      </div>`;
  }

  /* -------------------- 时间轴 -------------------- */
  function timeline(day, activeDay) {
    if (!day.events.length) {
      return `<div class="empty"><b>🗺️</b><h3>这一天还没有点位</h3><p>从下方候选点位里添加一个吧</p></div>`;
    }
    let poiIndex = 0;
    const blocks = [];
    day.events.forEach((event) => {
      if (event.type !== "poi") {
        const isMeal = event.type === "meal";
        const icon = isMeal ? "🍜" : event.type === "transfer" ? "🚄" : "⏳";
        const duration = Math.round(
          (new Date(`1970-01-01T${event.leave}:00`) - new Date(`1970-01-01T${event.arrive}:00`)) / 60000
        );
        blocks.push(`
          <div class="event event--${isMeal ? "meal" : event.type === "transfer" ? "transfer" : "free"}">
            <div class="event__rail">
              <div class="event__time">${esc(event.arrive)}</div>
              <div class="event__dot"></div><div class="event__line"></div>
            </div>
            <div class="event__card">
              <div class="event__head"><h4>${icon} ${esc(event.name)}</h4></div>
              <div class="event__meta">
                <span>⏱ ${duration > 0 ? duration : 0} 分钟</span>
                <span>💰 ${event.cost ? `¥${money(event.cost)}` : "无额外支出"}</span>
              </div>
              <div class="event__desc">${esc(event.note || "")}</div>
            </div>
          </div>`);
        return;
      }

      poiIndex += 1;
      const order = day.visit_order.indexOf(event.id);
      const isFood = event.category === "food";
      blocks.push(`
        <div class="event" data-poi="${esc(event.id)}">
          <div class="event__rail">
            <div class="event__time">${esc(event.arrive)}</div>
            <div class="event__dot"></div><div class="event__line"></div>
          </div>
          <div class="event__card" data-card="${esc(event.id)}">
            <div class="event__head">
              <h4>${poiIndex}. ${esc(event.name)}</h4>
              <span class="badge badge--brand">${esc(event.category_label)}</span>
            </div>
            <div class="event__meta">
              <span>⏱ ${event.stay_minutes} 分钟</span>
              <span>${isFood ? "🍽" : "🎫"} ${event.ticket ? `¥${money(event.ticket)}` : "免费"}</span>
              <span>⭐ ${event.rating}</span>
            </div>
            <div class="event__desc">${esc(event.desc)}</div>
            ${event.transport_hint ? `<div class="event__meta"><span>🚏 ${esc(event.transport_hint)}</span></div>` : ""}
            <div class="event__actions">
              <button data-action="up" data-day="${activeDay}" data-poi="${esc(event.id)}" ${order <= 0 ? "disabled" : ""}>↑ 提前</button>
              <button data-action="down" data-day="${activeDay}" data-poi="${esc(event.id)}" ${order >= day.visit_order.length - 1 ? "disabled" : ""}>↓ 延后</button>
              <button data-action="replace" data-day="${activeDay}" data-poi="${esc(event.id)}">替换</button>
              <button class="danger" data-action="remove" data-day="${activeDay}" data-poi="${esc(event.id)}">删除</button>
            </div>
          </div>
        </div>`);

      if (event.travel_to_next) {
        const travel = event.travel_to_next;
        blocks.push(`
          <div class="travel">
            ${travel.mode === "步行" ? "🚶" : travel.mode === "地铁" ? "🚇" : "🚕"}
            <b>${esc(travel.mode)}</b> ${travel.distance_km}km · ${travel.minutes} 分钟
            ${travel.cost ? `· ¥${money(travel.cost)}` : ""} → 下一站
          </div>`);
      }
    });

    return `<div class="timeline">${blocks.join("")}</div>`;
  }

  /* -------------------- 简单动态地图 -------------------- */
  function map(day, activeDay, plan) {
    const pois = day.events.filter((event) => event.type === "poi");
    if (!pois.length) {
      return `<div class="map-wrap" style="display:grid;place-items:center;color:#8b9aab;font-size:12px">当天暂无点位</div>`;
    }

    const W = 320;
    const H = 240;
    const PAD = 38;
    const lats = pois.map((poi) => poi.lat);
    const lngs = pois.map((poi) => poi.lng);
    const cosLat = Math.cos(((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI / 180);
    const xs = lngs.map((lng) => lng * cosLat);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...lats);
    const yMax = Math.max(...lats);
    const xSpan = Math.max(xMax - xMin, 1e-4);
    const ySpan = Math.max(yMax - yMin, 1e-4);
    const scale = Math.min((W - PAD * 2) / xSpan, (H - PAD * 2) / ySpan);
    const offsetX = (W - xSpan * scale) / 2;
    const offsetY = (H - ySpan * scale) / 2;
    const color = DAY_COLORS[activeDay % DAY_COLORS.length];

    const points = pois.map((poi, index) => {
      const x = offsetX + (poi.lng * cosLat - xMin) * scale;
      const y = H - offsetY - (poi.lat - yMin) * scale;
      return { x, y, index: index + 1, poi };
    });

    const path = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    const pins = points.map((point) => `
      <g class="map-pin" data-pin="${esc(point.poi.id)}" transform="translate(${point.x.toFixed(1)}, ${point.y.toFixed(1)})">
        <title>${esc(point.index)}. ${esc(point.poi.name)}</title>
        <circle r="11" fill="${color}" stroke="#fff" stroke-width="2" />
        <text y="4" text-anchor="middle" font-size="10" font-weight="700" fill="#fff">${point.index}</text>
        <text y="26" text-anchor="middle" font-size="8.5" fill="#41556b">${esc(point.poi.name.slice(0, 7))}</text>
      </g>`).join("");

    return `
      <div class="map-wrap">
        <svg class="map-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="当天行程动线">
          <defs>
            <linearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="${color}" stop-opacity="0.85" />
              <stop offset="100%" stop-color="${color}" stop-opacity="0.35" />
            </linearGradient>
          </defs>
          <polyline points="${path}" fill="none" stroke="url(#routeGrad)" stroke-width="2.4"
                    stroke-dasharray="7 5" stroke-linecap="round" />
          ${pins}
        </svg>
      </div>
      <div class="map-legend">
        ${points.map((point) => `<span><i style="background:${color}"></i>${point.index}. ${esc(point.poi.name)}</span>`).join("")}
      </div>`;
  }

  /* -------------------- 预算 -------------------- */
  function budget(plan, day) {
    const b = plan.budget;
    const total = Math.max(b.total, 1);
    const rows = [
      { label: "住宿", value: b.hotel, color: "#ff7043" },
      { label: "门票", value: b.tickets, color: "#ffb45c" },
      { label: "餐饮", value: b.meals, color: "#0e9f95" },
      { label: "交通", value: b.transport, color: "#5b7cf7" },
    ];
    return `
      <div class="card budget">
        <div class="budget__top"><b>¥${money(b.total)}</b><small>预计总花费</small></div>
        <div class="budget__sub">
          <span>人均 <strong>¥${money(b.per_person)}</strong></span>
          <span>日均 <strong>¥${money(b.per_day)}</strong></span>
          <span>${b.rooms} 间房 · ${b.nights} 晚</span>
        </div>
        ${rows.map((row) => `
          <div class="budget-row">
            <span>${row.label}</span>
            <div class="bar"><i style="width:${(row.value / total * 100).toFixed(1)}%;background:${row.color}"></i></div>
            <strong>¥${money(row.value)}</strong>
          </div>`).join("")}
        <div class="budget__sub" style="margin:12px 0 0">
          <span>当天小计 <strong>¥${money(day.ticket_cost + day.meal_cost + day.transport_cost)}</strong></span>
          <span>门票 ¥${money(day.ticket_cost)} · 餐饮 ¥${money(day.meal_cost)}</span>
        </div>
      </div>`;
  }

  /* -------------------- 贴士 -------------------- */
  function tips(plan) {
    return `
      <div class="card tips">
        <h4>🧠 行程管家提示</h4>
        <ul>${plan.tips.map((tip) => `<li>${esc(tip)}</li>`).join("")}</ul>
      </div>`;
  }

  /* -------------------- 某一天 -------------------- */
  function dayPanel(day, activeDay, plan) {
    return `
      <div>
        <div class="day-panel-head">
          <div>
            <h3>第 ${day.day} 天 · ${esc(day.title)}</h3>
            <p>${esc(day.date)} ${esc(day.weekday)} · ${day.distance_km}km · 游玩 ${day.stay_hours}h</p>
          </div>
          <div class="wx">${esc(day.weather.icon)} ${esc(day.weather.condition)}<br>${day.weather.low}°~${day.weather.high}°</div>
        </div>
        <div class="day-panel-head" style="margin-top:0">
          <p style="font-size:11.5px;color:#7b8a9c">💡 ${esc(day.weather.tip)}</p>
        </div>
        ${timeline(day, activeDay)}
      </div>`;
  }

  function side(day, activeDay, plan) {
    return `
      <div class="plan-body__side">
        <div class="card map-card">
          <div class="map-card__head">
            <h4>当天动线</h4>
            <small>${day.visit_order.length} 个点位 · ${day.distance_km}km</small>
          </div>
          ${map(day, activeDay, plan)}
        </div>
        ${budget(plan, day)}
        ${tips(plan)}
      </div>`;
  }

  function render(plan, activeDay) {
    const day = plan.itinerary[activeDay] || plan.itinerary[0];
    return `
      ${head(plan)}
      ${weather(plan)}
      ${dayTabs(plan, activeDay)}
      <div class="plan-body">
        <div id="dayPanel">${dayPanel(day, activeDay, plan)}</div>
        ${side(day, activeDay, plan)}
      </div>`;
  }

  function planText(plan) {
    const lines = [`${plan.city.name} ${plan.days} 天行程 · TravelBuddy`, ""];
    plan.itinerary.forEach((day) => {
      lines.push(`【第 ${day.day} 天】${day.date} ${day.weekday} ${day.title}`);
      day.events.forEach((event) => {
        if (event.type === "meal") {
          lines.push(`  ${event.arrive}-${event.leave} ${event.name}（¥${Math.round(event.cost)}）`);
        } else if (event.type === "free" || event.type === "transfer") {
          lines.push(`  ${event.arrive}-${event.leave} ${event.name}`);
        } else {
          lines.push(`  ${event.arrive}-${event.leave} ${event.name} · ${event.category_label} · 门票 ¥${Math.round(event.ticket)}`);
        }
      });
      lines.push("");
    });
    lines.push(`预算合计约 ¥${Math.round(plan.budget.total)}（人均 ¥${Math.round(plan.budget.per_person)}）`);
    return lines.join("\n");
  }

  return { render, planText, esc, money, DAY_COLORS };
})();
