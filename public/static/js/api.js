/* 纯前端版接口层：数据与算法全部在浏览器里运行，不再依赖 Flask 后端。
   对外仍暴露 API.method(...)，并拦截 /api/* 的 fetch，保证旧页面逻辑无需改动。 */
const API = (() => {
  const CATEGORY_LABELS = {
    art: "艺术展馆", family: "亲子娱乐", food: "美食餐饮", history: "历史人文",
    landmark: "城市地标", nature: "自然风光", night: "夜游娱乐", shopping: "休闲购物",
  };
  const PREFERENCES = ["自然", "人文", "美食", "亲子", "艺术", "夜景", "购物"];
  const PREF_TO_CATEGORY = {
    自然: ["nature"], 人文: ["history", "landmark"], 美食: ["food"], 亲子: ["family"],
    艺术: ["art"], 夜景: ["night"], 购物: ["shopping"],
  };
  const PACE = {
    relaxed: { key: "relaxed", label: "轻松", slots: 3, start: 9.5, factor: 1.15, desc: "每天 2-3 个点，留足发呆时间" },
    normal: { key: "normal", label: "适中", slots: 4, start: 9.0, factor: 1.0, desc: "每天 3-4 个点，节奏舒适" },
    packed: { key: "packed", label: "紧凑", slots: 5, start: 8.5, factor: 0.88, desc: "每天 4-5 个点，打卡效率优先" },
  };
  const BUDGET = {
    economy: { key: "economy", label: "经济", hotel: 180, lunch: 35, dinner: 55, desc: "青旅 / 连锁酒店 + 本地小店" },
    comfort: { key: "comfort", label: "舒适", hotel: 420, lunch: 60, dinner: 100, desc: "品质连锁酒店 + 特色餐厅" },
    luxury: { key: "luxury", label: "品质", hotel: 900, lunch: 120, dinner: 200, desc: "精品酒店 + 口碑餐厅" },
  };
  const WEATHER = [["☀️", "晴"], ["⛅", "多云"], ["🌤️", "晴间多云"], ["🌦️", "阵雨"], ["⛅", "多云转晴"]];
  const MONTH_TEMP = {
    1: [0, 8], 2: [1, 10], 3: [5, 15], 4: [10, 20], 5: [15, 25], 6: [20, 29],
    7: [23, 32], 8: [23, 31], 9: [19, 27], 10: [13, 22], 11: [7, 16], 12: [2, 10],
  };
  const CITY_CENTER = {
    北京: { lat: 39.9042, lng: 116.4074, hotel_keyword: "北京 王府井 酒店", fun_keyword: "北京 美食 景点" },
    上海: { lat: 31.2304, lng: 121.4737, hotel_keyword: "上海 南京东路 酒店", fun_keyword: "上海 美食 景点" },
    成都: { lat: 30.5728, lng: 104.0665, hotel_keyword: "成都 春熙路 酒店", fun_keyword: "成都 火锅 美食" },
    西安: { lat: 34.3416, lng: 108.9398, hotel_keyword: "西安 钟楼 酒店", fun_keyword: "西安 回民街 美食" },
    杭州: { lat: 30.2741, lng: 120.1551, hotel_keyword: "杭州 西湖 酒店", fun_keyword: "杭州 西湖 美食" },
    厦门: { lat: 24.4798, lng: 118.0894, hotel_keyword: "厦门 中山路 酒店", fun_keyword: "厦门 鼓浪屿 美食" },
    广州: { lat: 23.1291, lng: 113.2644, hotel_keyword: "广州 天河 酒店", fun_keyword: "广州 早茶 美食" },
    重庆: { lat: 29.5630, lng: 106.5516, hotel_keyword: "重庆 解放碑 酒店", fun_keyword: "重庆 火锅 美食" },
    南京: { lat: 32.0603, lng: 118.7969, hotel_keyword: "南京 新街口 酒店", fun_keyword: "南京 夫子庙 美食" },
    青岛: { lat: 36.0671, lng: 120.3826, hotel_keyword: "青岛 五四广场 酒店", fun_keyword: "青岛 海鲜 啤酒" },
    天津: { lat: 39.0842, lng: 117.2009, hotel_keyword: "天津 五大道 酒店", fun_keyword: "天津 煎饼果子 美食" },
    石家庄: { lat: 38.0428, lng: 114.5149, hotel_keyword: "石家庄 中山路 酒店", fun_keyword: "石家庄 正定 美食" },
    太原: { lat: 37.8706, lng: 112.5489, hotel_keyword: "太原 柳巷 酒店", fun_keyword: "太原 刀削面 美食" },
    沈阳: { lat: 41.8057, lng: 123.4315, hotel_keyword: "沈阳 中街 酒店", fun_keyword: "沈阳 烧烤 美食" },
    长春: { lat: 43.8171, lng: 125.3235, hotel_keyword: "长春 人民广场 酒店", fun_keyword: "长春 东北菜 美食" },
    哈尔滨: { lat: 45.8038, lng: 126.5349, hotel_keyword: "哈尔滨 中央大街 酒店", fun_keyword: "哈尔滨 红肠 美食" },
    合肥: { lat: 31.8206, lng: 117.2272, hotel_keyword: "合肥 淮河路 酒店", fun_keyword: "合肥 龙虾 美食" },
    福州: { lat: 26.0745, lng: 119.2965, hotel_keyword: "福州 三坊七巷 酒店", fun_keyword: "福州 鱼丸 美食" },
    南昌: { lat: 28.6820, lng: 115.8579, hotel_keyword: "南昌 八一广场 酒店", fun_keyword: "南昌 瓦罐汤 美食" },
    济南: { lat: 36.6512, lng: 117.1201, hotel_keyword: "济南 泉城路 酒店", fun_keyword: "济南 芙蓉街 美食" },
    郑州: { lat: 34.7466, lng: 113.6254, hotel_keyword: "郑州 二七广场 酒店", fun_keyword: "郑州 烩面 美食" },
    武汉: { lat: 30.5928, lng: 114.3055, hotel_keyword: "武汉 江汉路 酒店", fun_keyword: "武汉 热干面 美食" },
    长沙: { lat: 28.2282, lng: 112.9388, hotel_keyword: "长沙 五一广场 酒店", fun_keyword: "长沙 口味虾 美食" },
    海口: { lat: 20.0444, lng: 110.1999, hotel_keyword: "海口 骑楼老街 酒店", fun_keyword: "海口 清补凉 美食" },
    贵阳: { lat: 26.6470, lng: 106.6302, hotel_keyword: "贵阳 喷水池 酒店", fun_keyword: "贵阳 酸汤鱼 美食" },
    昆明: { lat: 25.0389, lng: 102.7183, hotel_keyword: "昆明 翠湖 酒店", fun_keyword: "昆明 过桥米线 美食" },
    兰州: { lat: 36.0611, lng: 103.8343, hotel_keyword: "兰州 西关 酒店", fun_keyword: "兰州 牛肉面 美食" },
    西宁: { lat: 36.6171, lng: 101.7782, hotel_keyword: "西宁 大十字 酒店", fun_keyword: "西宁 手抓羊肉 美食" },
    呼和浩特: { lat: 40.8426, lng: 111.7492, hotel_keyword: "呼和浩特 新华广场 酒店", fun_keyword: "呼和浩特 烧麦 美食" },
    南宁: { lat: 22.8170, lng: 108.3665, hotel_keyword: "南宁 朝阳广场 酒店", fun_keyword: "南宁 老友粉 美食" },
    拉萨: { lat: 29.6520, lng: 91.1721, hotel_keyword: "拉萨 八廓街 酒店", fun_keyword: "拉萨 藏餐 美食" },
    银川: { lat: 38.4872, lng: 106.2309, hotel_keyword: "银川 鼓楼 酒店", fun_keyword: "银川 羊肉 美食" },
    乌鲁木齐: { lat: 43.8256, lng: 87.6168, hotel_keyword: "乌鲁木齐 大巴扎 酒店", fun_keyword: "乌鲁木齐 烤肉 美食" },
  };

  let DATA = null;
  const DATA_READY = fetch("/data/pois.json")
    .then((response) => response.json())
    .then((data) => {
      DATA = data;
      return data;
    });

  const ready = () => (DATA ? Promise.resolve(DATA) : DATA_READY);

  /* ---------------- 小工具 ---------------- */
  const r1 = (value) => Math.round(value * 10) / 10;

  function distanceKm(a, b) {
    const rad = Math.PI / 180;
    const lat1 = a.lat * rad, lng1 = a.lng * rad, lat2 = b.lat * rad, lng2 = b.lng * rad;
    const dlat = lat2 - lat1, dlng = lng2 - lng1;
    const h = Math.sin(dlat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlng / 2) ** 2;
    return 2 * 6371 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function clock(minutes) {
    const total = Math.max(Math.round(minutes), 0);
    return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  function travelBetween(a, b) {
    const km = distanceKm(a, b);
    let mode, speed, base;
    if (km <= 1.2) { mode = "步行"; speed = 4.5; base = 0; }
    else if (km <= 10) { mode = "地铁"; speed = 26; base = 4; }
    else { mode = "打车"; speed = 32; base = 0; }
    const minutes = Math.round(km / speed * 60) + (mode === "地铁" ? 4 : 0);
    let cost = mode === "打车" ? Math.max(15, r1(km * 2.6)) : base;
    return { mode, distance_km: r1(km), minutes: Math.max(minutes, 2), cost: r1(cost) };
  }

  function hashString(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function makeRng(seedText) {
    let state = hashString(seedText);
    return {
      random() {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      choice(list) { return list[Math.floor(this.random() * list.length)]; },
      randint(min, max) { return min + Math.floor(this.random() * (max - min + 1)); },
    };
  }

  function parseIso(iso) {
    const [y, m, d] = String(iso).split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function formatIso(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }
  function weekdayCn(date) {
    return "周" + "一二三四五六日"[(date.getDay() + 6) % 7];
  }
  function nowText() {
    const d = new Date();
    return `${formatIso(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  const poiView = (poi) => ({ ...poi, category_label: CATEGORY_LABELS[poi.category] || "城市看点" });

  function cityMeta(city, withPois = false) {
    const pois = city.pois;
    const meta = {
      id: city.id, name: city.name, emoji: city.emoji, blurb: city.blurb,
      best_season: city.best_season, hotel_area: city.hotel_area, tips: city.tips,
      poi_count: pois.length,
      free_pois: pois.filter((p) => p.ticket === 0).length,
      avg_rating: r1(pois.reduce((sum, p) => sum + p.rating, 0) / pois.length),
      highlights: [...pois].sort((a, b) => b.rating - a.rating).slice(0, 4).map((p) => p.name),
    };
    if (withPois) meta.pois = pois.map(poiView);
    return meta;
  }

  function weatherFor(city, theDate) {
    const rng = makeRng(`${city.id}-${formatIso(theDate)}`);
    const [icon, condition] = rng.choice(WEATHER);
    const [lowBase, highBase] = MONTH_TEMP[theDate.getMonth() + 1];
    const tips = {
      晴: "阳光不错，注意防晒和补水",
      晴间多云: "光线柔和，适合户外拍照",
      多云: "体感舒服，适合安排步行线路",
      多云转晴: "天气转好，傍晚适合看夜景",
      阵雨: "随身带把折叠伞，户外点位可前后调整",
    };
    return {
      icon, condition,
      low: lowBase + rng.randint(-3, 2),
      high: highBase + rng.randint(-2, 4),
      tip: tips[condition] || "留意天气变化",
    };
  }

  /* ---------------- 行程生成 ---------------- */
  function pickPoiIds(city, days, preferences, pace, startIso) {
    const wanted = new Set();
    preferences.forEach((pref) => (PREF_TO_CATEGORY[pref] || []).forEach((c) => wanted.add(c)));
    const rng = makeRng(`${city.id}-${startIso}-${preferences.join("-")}-${pace.key}`);
    const ranked = [...city.pois]
      .map((poi) => ({ poi, score: (wanted.has(poi.category) ? 3 : 0) + poi.rating + rng.random() * 0.8 }))
      .sort((a, b) => b.score - a.score)
      .map((item) => item.poi);

    const targets = [];
    for (let index = 0; index < days; index += 1) {
      let target = pace.slots;
      if (index === 0) target -= 1;
      if (index === days - 1 && days > 1) target -= 1;
      targets.push(Math.max(target, 2));
    }

    const remaining = [...ranked];
    const planIds = [];
    for (let index = 0; index < days; index += 1) {
      if (!remaining.length) { planIds.push([]); continue; }
      const seed = remaining.shift();
      const chosen = [seed];
      while (chosen.length < targets[index] && remaining.length) {
        const current = chosen[chosen.length - 1];
        let nearIndex = 0;
        remaining.forEach((poi, i) => {
          if (distanceKm(current, poi) < distanceKm(current, remaining[nearIndex])) nearIndex = i;
        });
        chosen.push(remaining[nearIndex]);
        remaining.splice(nearIndex, 1);
      }
      const ordered = [chosen[0]];
      const pool = chosen.slice(1);
      while (pool.length) {
        const current = ordered[ordered.length - 1];
        let nearIndex = 0;
        pool.forEach((poi, i) => {
          if (distanceKm(current, poi) < distanceKm(current, pool[nearIndex])) nearIndex = i;
        });
        ordered.push(pool[nearIndex]);
        pool.splice(nearIndex, 1);
      }
      planIds.push(ordered.map((poi) => poi.id));
    }
    return planIds;
  }

  function buildPlan(cityName, days, preferences, paceKey, budgetKey, travelers, startIso, origin, dayIds) {
    const data = DATA;
    const city = data.cities.find((item) => item.name === cityName) || data.cities[0];
    const pace = PACE[paceKey] || PACE.normal;
    const budget = BUDGET[budgetKey] || BUDGET.comfort;
    preferences = (preferences || []).filter((pref) => PREFERENCES.includes(pref));
    travelers = Math.max(1, Math.min(parseInt(travelers, 10) || 2, 10));
    days = Math.max(1, Math.min(parseInt(days, 10) || 3, 7));
    origin = Object.keys(CITY_CENTER).includes(origin) ? origin : "";
    const poiMap = {};
    city.pois.forEach((poi) => { poiMap[poi.id] = poi; });

    if (!dayIds) dayIds = pickPoiIds(city, days, preferences, pace, startIso);

    const startDate = parseIso(startIso);
    const nights = Math.max(days - 1, 0);
    const rooms = nights ? Math.ceil(travelers / 2) : 0;
    const intercity = origin && origin !== city.name ? Math.round(500 * travelers) : 0;

    const itinerary = [];
    const totals = { distance: 0, stay: 0, tickets: 0, meals: 0, transport: 0 };

    for (let index = 0; index < days; index += 1) {
      const theDate = addDays(startDate, index);
      const pois = (dayIds[index] || []).filter((id) => poiMap[id]).map((id) => poiMap[id]);
      let title;
      if (index === 0 && days > 1) title = "抵达 · 城市初见";
      else if (index === days - 1 && days > 1) title = "收尾 · 返程";
      else if (preferences.length) title = `${preferences.join("、")}深度日`;
      else title = "城市精华日";

      let current = pace.start * 60;
      const events = [];
      let ticketCost = 0, mealCost = 0, transportCost = 0, dayDistance = 0, dayStay = 0;

      if (index === 0 && origin && origin !== city.name) {
        const arrive = 8 * 60 + 30;
        const leave = 12 * 60;
        const transferCost = r1(intercity / 2);
        events.push({
          type: "transfer", name: `${origin} → ${city.name} · 高铁/航班`,
          arrive: clock(arrive), leave: clock(leave), cost: transferCost,
          note: "提前 40 分钟到站，抵达后地铁前往酒店寄存行李",
        });
        transportCost += transferCost;
        current = leave;
        events.push({
          type: "meal", name: "午餐 · 抵达后的第一顿", arrive: clock(12 * 60), leave: clock(13 * 60),
          cost: budget.lunch * travelers, note: `${budget.label}预算：${budget.desc}`,
        });
        mealCost += budget.lunch * travelers;
        current = 13 * 60;
      }

      let lunchDone = index === 0 && Boolean(origin) && origin !== city.name;

      pois.forEach((poi, poiIndex) => {
        if (!lunchDone && current >= 12 * 60 && current < 15 * 60) {
          events.push({
            type: "meal", name: "午餐 · 本地特色小馆", arrive: clock(current), leave: clock(current + 60),
            cost: budget.lunch * travelers, note: `${budget.label}预算：${budget.desc}`,
          });
          mealCost += budget.lunch * travelers;
          current += 60;
          lunchDone = true;
        }

        const stay = Math.round(poi.duration * pace.factor / 5) * 5;
        const nextPoi = poiIndex + 1 < pois.length ? pois[poiIndex + 1] : null;
        const travel = nextPoi ? travelBetween(poi, nextPoi) : null;
        events.push({
          ...poiView(poi),
          type: "poi",
          stay_minutes: stay,
          arrive: clock(current),
          leave: clock(current + stay),
          transport_hint: poi.ticket === 0 ? "" : "建议提前在官方渠道购票",
          travel_to_next: travel,
        });
        ticketCost += poi.ticket * travelers;
        current += stay;
        dayStay += stay;
        if (travel) {
          transportCost += travel.cost;
          dayDistance += travel.distance_km;
          current += travel.minutes;
        }
      });

      if (!lunchDone) {
        events.push({
          type: "meal", name: "午餐 · 本地特色小馆", arrive: clock(12 * 60), leave: clock(13 * 60),
          cost: budget.lunch * travelers, note: `${budget.label}预算：${budget.desc}`,
        });
        mealCost += budget.lunch * travelers;
      }

      const dinnerAt = Math.max(current, 18 * 60 + 30);
      events.push({
        type: "meal", name: "晚餐 · 口碑餐厅", arrive: clock(dinnerAt), leave: clock(dinnerAt + 75),
        cost: budget.dinner * travelers, note: "吃完可以就近散步，或回酒店休息",
      });
      mealCost += budget.dinner * travelers;

      events.sort((a, b) => (a.arrive < b.arrive ? -1 : a.arrive > b.arrive ? 1 : 0));
      itinerary.push({
        day: index + 1,
        date: formatIso(theDate),
        weekday: weekdayCn(theDate),
        title,
        weather: weatherFor(city, theDate),
        distance_km: r1(dayDistance),
        stay_hours: r1(dayStay / 60),
        visit_order: events.filter((e) => e.type === "poi").map((e) => e.id),
        ticket_cost: r1(ticketCost),
        meal_cost: r1(mealCost),
        transport_cost: r1(transportCost),
        events,
      });
      totals.distance += dayDistance;
      totals.stay += dayStay;
      totals.tickets += ticketCost;
      totals.meals += mealCost;
      totals.transport += transportCost;
    }

    const used = new Set(dayIds.flat());
    const candidates = city.pois.filter((poi) => !used.has(poi.id)).map(poiView);
    const total = budget.hotel * nights * rooms + totals.tickets + totals.meals + totals.transport + intercity;

    return {
      city: { id: city.id, name: city.name, emoji: city.emoji, blurb: city.blurb },
      origin,
      days,
      preferences,
      pace,
      budget_level: budget,
      travelers,
      start_date: formatIso(startDate),
      stats: {
        poi_count: dayIds.reduce((sum, ids) => sum + ids.length, 0),
        distance_km: r1(totals.distance),
        visit_hours: r1(totals.stay / 60),
      },
      budget: {
        total: Math.round(total),
        hotel: Math.round(budget.hotel * nights * rooms),
        tickets: Math.round(totals.tickets),
        meals: Math.round(totals.meals),
        transport: Math.round(totals.transport + intercity),
        per_person: Math.round(total / travelers),
        per_day: Math.round(total / days),
        rooms,
        nights,
        intercity,
      },
      itinerary,
      candidates,
      tips: [
        ...city.tips.slice(0, 2),
        `按「${pace.label}」节奏安排，平均每天 ${pace.slots} 个点位，可用「替换」换成别的点。`,
        `${budget.label}预算：${budget.desc}，住宿建议放在${city.hotel_area}。`,
        ...(origin && origin !== city.name ? [`从${origin}出发，建议提前订好往返车票或机票。`] : []),
      ],
    };
  }

  const idsFromPlan = (plan) => plan.itinerary.map((day) => day.events.filter((e) => e.type === "poi").map((e) => e.id));

  function rebuild(plan, dayIds) {
    return buildPlan(plan.city.name, plan.days, plan.preferences, plan.pace.key, plan.budget_level.key,
      plan.travelers, plan.start_date, plan.origin || "", dayIds);
  }

  /* ---------------- 出行工具 ---------------- */
  function durationText(minutes) {
    const hours = Math.floor(Math.max(minutes, 1) / 60);
    const mins = Math.max(minutes, 1) % 60;
    return hours ? `约 ${hours} 小时 ${mins} 分` : `约 ${mins} 分钟`;
  }

  function buildTools(fromName, toName) {
    const fromCity = DATA.cities.find((c) => c.name === fromName);
    const toCity = DATA.cities.find((c) => c.name === toName);
    const origin = CITY_CENTER[fromName];
    const destination = CITY_CENTER[toName];
    const km = distanceKm(origin, destination);
    const options = km >= 1200
      ? [
        { label: "飞机", duration: durationText(130 + Math.round(km / 700 * 60)), note: "含值机与安检，建议提前 2 小时到机场" },
        { label: "自驾", duration: durationText(Math.round(km / 85 * 60)), note: `全程约 ${Math.round(km)} km，注意高速疲劳驾驶` },
      ]
      : [
        { label: "高铁", duration: durationText(40 + Math.round(km / 220 * 60)), note: "含进站安检与候车时间" },
        { label: "自驾", duration: durationText(Math.round(km / 85 * 60)), note: `全程约 ${Math.round(km)} km` },
      ];

    const fromPoint = `${origin.lng},${origin.lat},${encodeURIComponent(fromName)}`;
    const toPoint = `${destination.lng},${destination.lat},${encodeURIComponent(toName)}`;
    return {
      ok: true,
      route: {
        from: fromName, to: toName, distance_km: Math.round(km),
        from_tagline: fromCity.blurb, to_tagline: toCity.blurb,
      },
      navigation: {
        amap_car: `https://uri.amap.com/navigation?from=${fromPoint}&to=${toPoint}&mode=car&policy=1&src=travelbuddy&callnative=1`,
        amap_transit: `https://uri.amap.com/navigation?from=${fromPoint}&to=${toPoint}&mode=transit&policy=1&src=travelbuddy&callnative=1`,
        amap_search: `https://uri.amap.com/search?keyword=${encodeURIComponent(toName)}&city=${encodeURIComponent(toName)}&callnative=1`,
      },
      transport: {
        options,
        links: [
          { platform: "12306", name: "铁路 12306", note: "官方购票，实名制", url: "https://www.12306.cn/index/" },
          { platform: "飞猪", name: "飞猪", note: "机票 / 火车票 / 酒店", url: "https://www.fliggy.com/" },
          { platform: "携程", name: "携程", note: "机票 / 火车票", url: "https://www.ctrip.com/" },
        ],
      },
      hotel: {
        area: toCity.hotel_area,
        links: [
          { platform: "美团", name: "美团酒店", note: "本地酒店与团购", url: "https://i.meituan.com/hotel/" },
          { platform: "抖音", name: "抖音", note: "搜索酒店团购", url: `https://www.douyin.com/search/${encodeURIComponent(destination.hotel_keyword)}` },
          { platform: "携程", name: "携程酒店", note: "酒店比价与预订", url: "https://hotels.ctrip.com/" },
          { platform: "去哪儿", name: "去哪儿", note: "酒店比价", url: "https://hotel.qunar.com/" },
        ],
      },
      fun: {
        links: [
          { platform: "大众点评", name: "大众点评", note: "本地餐厅与评分", url: "https://www.dianping.com/" },
          { platform: "美团", name: "美团", note: "团购与到店套餐", url: "https://www.meituan.com/" },
          { platform: "抖音", name: "抖音", note: "本地吃喝玩乐", url: `https://www.douyin.com/search/${encodeURIComponent(destination.fun_keyword)}` },
        ],
      },
    };
  }

  /* ---------------- 行程收藏（浏览器本地） ---------------- */
  const TRIPS_KEY = "tb_trips";
  const loadTrips = () => {
    try {
      const list = JSON.parse(localStorage.getItem(TRIPS_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  };
  const saveTrips = (list) => localStorage.setItem(TRIPS_KEY, JSON.stringify(list.slice(0, 50)));

  /* ---------------- 路由分发 ---------------- */
  function route(path, method, payload) {
    const [pathname, query = ""] = path.split("?");
    const params = new URLSearchParams(query);

    if (pathname === "/api/meta") {
      return { ok: true, preferences: PREFERENCES, category_labels: CATEGORY_LABELS, pace: Object.values(PACE), budget_levels: Object.values(BUDGET), cities: DATA.cities.map((c) => cityMeta(c)) };
    }
    if (pathname === "/api/cities") {
      return { ok: true, cities: DATA.cities.map((c) => cityMeta(c)) };
    }
    if (pathname.startsWith("/api/cities/")) {
      const city = DATA.cities.find((c) => c.id === pathname.split("/").pop());
      return city ? { ok: true, city: cityMeta(city, true) } : { ok: false, message: "城市不存在" };
    }
    if (pathname === "/api/tools") {
      let fromName = (params.get("from") || "上海").trim();
      let toName = (params.get("to") || "杭州").trim();
      if (!CITY_CENTER[fromName]) fromName = "上海";
      if (!CITY_CENTER[toName]) toName = "杭州";
      if (fromName === toName) return { ok: false, message: "出发地和目的地不能相同" };
      return buildTools(fromName, toName);
    }
    if (pathname === "/api/plan") {
      const cityName = payload.city || DATA.cities[0].name;
      if (!DATA.cities.some((c) => c.name === cityName)) return { ok: false, message: `暂不支持 ${cityName}` };
      return { ok: true, plan: buildPlan(cityName, payload.days, payload.preferences, payload.pace, payload.budget_level, payload.travelers, payload.start_date || formatIso(new Date()), payload.origin) };
    }
    if (pathname === "/api/plan/reorder") {
      if (!payload.plan) return { ok: false, message: "缺少行程数据" };
      const dayIds = idsFromPlan(payload.plan);
      const index = parseInt(payload.day_index || 0, 10);
      const order = payload.order || [];
      const ids = Array.isArray(order) ? order : order[String(index)];
      if (index >= 0 && index < dayIds.length && Array.isArray(ids)) {
        dayIds[index] = ids.filter((id) => dayIds[index].includes(id));
      }
      return { ok: true, plan: rebuild(payload.plan, dayIds) };
    }
    if (pathname === "/api/plan/replace") {
      if (!payload.plan) return { ok: false, message: "缺少行程数据" };
      const dayIds = idsFromPlan(payload.plan);
      const index = parseInt(payload.day_index || 0, 10);
      const used = new Set(dayIds.flat());
      const candidates = (payload.plan.candidates || []).filter((poi) => !used.has(poi.id));
      if (index >= 0 && index < dayIds.length && dayIds[index].includes(payload.poi_id) && candidates.length) {
        dayIds[index][dayIds[index].indexOf(payload.poi_id)] = candidates[0].id;
      }
      return { ok: true, plan: rebuild(payload.plan, dayIds) };
    }
    if (pathname === "/api/trips" && method !== "POST") {
      return { ok: true, trips: loadTrips().map(({ payload: _payload, ...rest }) => rest) };
    }
    if (pathname === "/api/trips" && method === "POST") {
      if (!payload.plan) return { ok: false, message: "缺少行程数据" };
      const plan = payload.plan;
      const trips = loadTrips();
      const trip = {
        id: Math.random().toString(16).slice(2, 14),
        title: payload.title || `${plan.city.name} · ${plan.days} 天行程`,
        days: plan.days,
        created_at: nowText(),
        summary: { emoji: plan.city.emoji, preferences: plan.preferences || [], poi_count: plan.stats.poi_count, total: plan.budget.total },
        payload: plan,
      };
      trips.unshift(trip);
      saveTrips(trips);
      return { ok: true, trip: { ...trip, payload: undefined } };
    }
    if (pathname.startsWith("/api/trips/")) {
      const id = pathname.split("/").pop();
      if (method === "DELETE") {
        saveTrips(loadTrips().filter((trip) => trip.id !== id));
        return { ok: true };
      }
      const trip = loadTrips().find((item) => item.id === id);
      return trip ? { ok: true, trip } : { ok: false, message: "行程不存在" };
    }
    if (pathname === "/api/ai/status") {
      return { ok: true, mode: "mock", model: "rule-engine", index_docs: 0 };
    }
    if (pathname === "/api/agent/chat") {
      return localChat(payload.message, payload.plan);
    }

    return null;
  }

  /* 本地规则引擎：DeepSeek 不可用时的兜底回复与行程参数解析 */
  function localChat(messageInput, planInput) {
    const message = String(messageInput || "").trim();
    if (!message) return { ok: false, message: "请先说一句话" };
    const previous = planInput || {};
    const cityName = DATA.cities.map((c) => c.name).find((name) => message.includes(name)) || "";
    const dayMatch = message.match(/(\d+)\s*天/);
    const days = dayMatch ? parseInt(dayMatch[1], 10) : 3;
    const peopleMatch = message.match(/(\d+)\s*人/);
    const travelers = peopleMatch ? parseInt(peopleMatch[1], 10) : parseInt(previous.travelers || 2, 10);
    const prefs = PREFERENCES.filter((pref) => message.includes(pref));
    if ((message.includes("历史") || message.includes("人文")) && !prefs.includes("人文")) prefs.push("人文");
    const budget = message.includes("经济") || message.includes("省") ? "economy" : message.includes("品质") ? "luxury" : "comfort";
    const pace = message.includes("紧凑") || message.includes("打卡") ? "packed" : message.includes("轻松") || message.includes("慢") ? "relaxed" : "normal";

    if (!cityName) {
      return {
        ok: true, source: "mock",
        reply: "我目前支持北京、上海、成都、西安、杭州、厦门 6 座城市。\n换个说法试试，例如「成都 3 天亲子游，预算 2000」，我会直接排一版行程。",
        plan: null,
        suggestions: ["成都 3 天亲子游，预算 2000", "西安 2 天历史人文，节奏紧凑", "杭州 3 天轻松自然游"],
      };
    }

    const origin = previous.origin || (cityName !== "上海" ? "上海" : "北京");
    const plan = buildPlan(cityName, days, prefs, pace, budget, travelers, formatIso(new Date()), origin);
    const reply = `已按「${cityName} · ${days} 天」排好一版行程：\n`
      + `- ${plan.stats.poi_count} 个点位，点位间移动约 ${plan.stats.distance_km}km\n`
      + `- 纯游玩 ${plan.stats.visit_hours} 小时，预算约 ¥${plan.budget.total}（人均 ¥${plan.budget.per_person}）\n`
      + `- ${plan.pace.label}节奏 / ${plan.budget_level.label}预算 / ${travelers} 人同行\n`
      + "点下方「查看行程」可以继续调整每天的安排。";
    return { ok: true, source: "mock", reply, plan, suggestions: ["换成轻松的节奏", `${cityName} 4 天深度游`, "把预算调低一点"] };
  }

  async function call(path, method = "GET", payload = {}) {
    await ready();
    const result = route(path, method, payload);
    if (!result) throw new Error("接口不存在");
    if (result.ok === false) throw new Error(result.message || "请求失败");
    return result;
  }

  /* ---------------- 兼容旧代码的 fetch 拦截 ---------------- */
  const nativeFetch = window.fetch.bind(window);

  async function remoteChat(message, plan) {
    const context = plan && plan.city
      ? { city: plan.city.name, days: plan.days, travelers: plan.travelers, origin: plan.origin }
      : null;
    try {
      const response = await nativeFetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, plan: context }),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async function chatWithAi(message, plan) {
    const remote = await remoteChat(message, plan);
    await ready();
    if (!remote || !remote.ok || remote.fallback || !remote.reply) {
      const local = await localChat(message, plan);
      /* 即使大模型调用失败，检索到的图文卡片与飞猪入口也照常展示 */
      if (remote && remote.ok) {
        local.cards = remote.cards || [];
        local.booking = remote.booking || null;
      }
      return local;
    }
    let built = null;
    const params = remote.params || {};
    if (params.city && DATA.cities.some((city) => city.name === params.city)) {
      built = buildPlan(
        params.city, params.days, params.preferences, params.pace, params.budget_level,
        params.travelers, formatIso(new Date()), (plan && plan.origin) || "上海",
      );
    }
    const refs = (remote.sources || [])
      .filter((item) => item.score > 0.15)
      .slice(0, 3)
      .map((item) => item.name);
    const reply = refs.length ? `${remote.reply}\n\n参考知识库：${refs.join("、")}` : remote.reply;
    return {
      ok: true,
      source: "ai",
      reply,
      plan: built,
      cards: remote.cards || [],
      booking: remote.booking || null,
      suggestions: remote.suggestions && remote.suggestions.length
        ? remote.suggestions
        : ["换成轻松的节奏", "预算再低一点", "帮我加一天"],
    };
  }

  async function aiStatus() {
    try {
      const response = await nativeFetch("/api/ai/status");
      if (response.ok) {
        const data = await response.json();
        if (data && data.ok) return data;
      }
    } catch {
      /* 本地预览时没有 Functions，走兜底 */
    }
    return { ok: true, mode: "mock", model: "rule-engine", index_docs: 0 };
  }

  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (!url.startsWith("/api/")) return nativeFetch(input, init);
    /* 这两条走 Cloudflare Functions：向量检索 + DeepSeek，key 在服务端 */
    if (url.startsWith("/api/agent/chat") || url.startsWith("/api/ai/status")) {
      return nativeFetch(input, init);
    }
    const method = ((init && init.method) || "GET").toUpperCase();
    let payload = {};
    if (init && typeof init.body === "string") {
      try { payload = JSON.parse(init.body); } catch { payload = {}; }
    }
    await ready();
    const result = route(url, method, payload) || { ok: false, message: "接口不存在" };
    return new Response(JSON.stringify(result), {
      status: result.ok === false ? 400 : 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  };

  return {
    ready,
    meta: () => call("/api/meta"),
    cities: () => call("/api/cities"),
    plan: (body) => call("/api/plan", "POST", body),
    reorder: (plan, order) => call("/api/plan/reorder", "POST", { plan, order }),
    replace: (plan, dayIndex, poiId) => call("/api/plan/replace", "POST", { plan, day_index: dayIndex, poi_id: poiId }),
    chat: (message, plan) => chatWithAi(message, plan),
    aiStatus: () => aiStatus(),
    trips: () => call("/api/trips"),
    saveTrip: (plan, title) => call("/api/trips", "POST", { plan, title }),
    getTrip: (id) => call(`/api/trips/${id}`),
    deleteTrip: (id) => call(`/api/trips/${id}`, "DELETE"),
  };
})();
