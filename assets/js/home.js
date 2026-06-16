/* Rentaca — home / search logic */
(() => {
  "use strict";

  const CORNELL = [42.4534, -76.4735];
  const IC = [42.4220, -76.4954];
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const money = (n) => (n ? "$" + Number(n).toLocaleString() : null);

  let DATA = null;
  let ALL = [];
  let map, cluster, markerById = {};

  const state = {
    kw: "", area: "", maxpp: null, minprice: null, maxprice: null,
    beds: "", dist: null, sort: "pp",
    parking: false, laundry: false, ac: false, furnished: false,
    cats: false, dogs: false, photos: false, reviews: false,
  };

  /* ---------- load ---------- */
  async function load() {
    try {
      const res = await fetch("data/site.json", { cache: "no-store" });
      DATA = await res.json();
      ALL = DATA.buildings;
    } catch (e) {
      $("#cards").innerHTML =
        '<div class="state"><h3>Couldn’t load data</h3>Run <code>python scripts/build_site_data.py</code> to generate <code>data/site.json</code>.</div>';
      return;
    }
    hydrateStats();
    initMap();
    bindUI();
    apply();
  }

  function hydrateStats() {
    const s = DATA.stats;
    $("#navStat").textContent = `${s.units.toLocaleString()} listings · ${s.buildings.toLocaleString()} buildings`;
    $("#genDate").textContent = DATA.generated || "—";
    const stats = [
      [s.units.toLocaleString(), "listings"],
      [s.buildings.toLocaleString(), "buildings"],
      [s.with_reviews, "reviewed"],
      [money(s.median_pp), "median / person"],
    ];
    $("#heroStats").innerHTML = stats.map(([n, l]) =>
      `<div class="hero__stat"><div class="n">${esc(n)}</div><div class="l">${esc(l)}</div></div>`).join("");

    // area select + source list
    const areaSel = $("#f_area");
    s.areas.forEach((a) => {
      const o = document.createElement("option");
      o.value = a; o.textContent = a; areaSel.appendChild(o);
    });
    $("#srcList").textContent = s.source_list.join(" · ");
  }

  /* ---------- map ---------- */
  function initMap() {
    map = L.map("map", { scrollWheelZoom: false, zoomControl: true }).setView(CORNELL, 13);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap, © CARTO", maxZoom: 19,
    }).addTo(map);
    const ico = (txt, color) => L.divIcon({
      className: "", html: `<div style="background:${color};color:#fff;font-size:11px;font-weight:700;padding:4px 9px;border-radius:980px;box-shadow:0 2px 8px rgba(0,0,0,.3);white-space:nowrap">${txt}</div>`,
      iconSize: [0, 0], iconAnchor: [22, 12],
    });
    L.marker(CORNELL, { icon: ico("Cornell", "#b31b1b") }).addTo(map);
    L.marker(IC, { icon: ico("Ithaca College", "#1d8a4e") }).addTo(map);
    cluster = L.layerGroup().addTo(map);
  }

  function ppColor(pp) {
    if (!pp) return "#86868b";
    if (pp < 700) return "#1d8a4e";
    if (pp < 1000) return "#0071e3";
    if (pp < 1400) return "#b25000";
    return "#c0392b";
  }

  function drawMarkers(list) {
    cluster.clearLayers();
    markerById = {};
    list.forEach((b) => {
      if (!b.lat || !b.lng) return;
      const pp = b.pp_min;
      const m = L.circleMarker([b.lat, b.lng], {
        radius: 7, color: "#fff", weight: 1.5, fillColor: ppColor(pp), fillOpacity: 0.92,
      }).addTo(cluster);
      const img = b.img ? `<img src="${esc(b.img)}" loading="lazy" onerror="this.style.display='none'">` : "";
      m.bindPopup(
        `<div class="mappop">${img}<div class="a">${esc(b.address)}</div>` +
        `<div class="p">${pp ? money(pp) + "/person · " : ""}${b.num_units} unit${b.num_units > 1 ? "s" : ""}${b.rating ? " · ★" + b.rating : ""}</div>` +
        `<a href="building.html?id=${encodeURIComponent(b.id)}">View building →</a></div>`
      );
      markerById[b.id] = m;
    });
  }

  /* ---------- filtering ---------- */
  function apply() {
    let r = ALL.filter((b) => {
      if (state.area && b.area !== state.area) return false;
      if (state.maxpp && (b.pp_min == null || b.pp_min > state.maxpp)) return false;
      if (state.minprice && (b.price_min == null || b.price_min < state.minprice)) return false;
      if (state.maxprice && (b.price_min == null || b.price_min > state.maxprice)) return false;
      if (state.beds !== "" && (b.beds_max == null || b.beds_max < +state.beds)) return false;
      if (state.dist && (b.dist_cornell == null || b.dist_cornell > state.dist)) return false;
      if (state.parking && !b.amenities.parking) return false;
      if (state.laundry && !b.amenities.laundry) return false;
      if (state.ac && !b.amenities.ac) return false;
      if (state.furnished && !b.amenities.furnished) return false;
      if (state.cats && !b.amenities.cats) return false;
      if (state.dogs && !b.amenities.dogs) return false;
      if (state.photos && !b.img) return false;
      if (state.reviews && !b.num_reviews) return false;
      if (state.kw) {
        const blob = (b.address + " " + b.area + " " + b.company).toLowerCase();
        if (!blob.includes(state.kw)) return false;
      }
      return true;
    });

    const big = 9e9;
    const s = state.sort;
    r.sort((a, b) => {
      if (s === "pp") return (a.pp_min || big) - (b.pp_min || big);
      if (s === "price") return (a.price_min || big) - (b.price_min || big);
      if (s === "cornell") return (a.dist_cornell || big) - (b.dist_cornell || big);
      if (s === "rating") return (b.rating || 0) - (a.rating || 0);
      if (s === "beds") return (b.beds_max || 0) - (a.beds_max || 0);
      if (s === "units") return (b.num_units || 0) - (a.num_units || 0);
      return 0;
    });

    render(r);
  }

  function specChips(b) {
    const c = [];
    if (b.beds_min != null) {
      const bd = b.beds_min === b.beds_max
        ? (b.beds_min === 0 ? "Studio" : b.beds_min + " bd")
        : `${b.beds_min === 0 ? "Studio" : b.beds_min}–${b.beds_max} bd`;
      c.push(bd);
    }
    if (b.baths_max) c.push(b.baths_max + " ba");
    if (b.dist_cornell != null) c.push(b.dist_cornell + " mi → Cornell");
    else if (b.walk_min) c.push(b.walk_min + " min walk");
    else if (b.approx_loc) c.push("Ithaca area");
    return c;
  }

  function card(b) {
    const pp = b.pp_min;
    const tot = b.price_min;
    const img = b.img
      ? `<img src="${esc(b.img)}" loading="lazy" alt="${esc(b.address)}" onerror="this.parentNode.innerHTML='<div class=ph>No photo</div>'">`
      : '<div class="ph">No photo yet</div>';
    const unitsBadge = b.num_units > 1
      ? `<span class="badge badge--units">${b.num_units} units</span>` : "";
    const ratingBadge = b.rating
      ? `<span class="badge badge--rating"><span class="star">★</span>${b.rating}</span>` : "";
    const priceTag = pp
      ? `<div class="card__pp"><b>${money(pp)}</b> <small>/person</small></div>`
      : (tot ? `<div class="card__pp"><b>${money(tot)}</b> <small>/mo</small></div>` : "");
    const foot = [];
    if (pp && tot) foot.push(`${money(tot)}/mo total`);
    if (b.num_reviews) foot.push(`${b.num_reviews} review${b.num_reviews > 1 ? "s" : ""}`);

    return `<a class="card" href="building.html?id=${encodeURIComponent(b.id)}"
        data-id="${esc(b.id)}" style="text-decoration:none;color:inherit">
      <div class="card__media">${img}${unitsBadge}${ratingBadge}${priceTag}</div>
      <div class="card__body">
        <div class="card__addr">${esc(b.address)}</div>
        ${b.area ? `<div class="card__area">${esc(b.area)}</div>` : ""}
        <div class="card__specs">${specChips(b).map((s) => `<span class="spec">${esc(s)}</span>`).join("")}</div>
        ${foot.length ? `<div class="card__foot"><span>${esc(foot.join(" · "))}</span><span>→</span></div>` : ""}
      </div>
    </a>`;
  }

  const PAGE = 48;          // cards per batch
  let shown = 0, current = [], firstRender = true;

  function render(list) {
    current = list;
    shown = 0;
    $("#count").textContent = list.length.toLocaleString() + " buildings";
    drawMarkers(list);
    const cards = $("#cards");
    if (!list.length) {
      cards.innerHTML = '<div class="state"><h3>No matches</h3>Try widening your filters.</div>';
      return;
    }
    cards.innerHTML = "";
    appendBatch();
    // when re-filtering while scrolled into the results, snap back up to the
    // top of the grid so the user sees the new best matches (skip on first paint)
    if (!firstRender) {
      const browse = document.getElementById("browse");
      if (browse && browse.getBoundingClientRect().top < 0) {
        browse.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    firstRender = false;
  }

  function appendBatch() {
    const cards = $("#cards");
    const slice = current.slice(shown, shown + PAGE);
    const sentinel = $("#sentinel");
    if (sentinel) sentinel.remove();           // detach before appending
    const frag = document.createElement("div");
    frag.innerHTML = slice.map(card).join("");
    const newCards = Array.from(frag.children);
    while (frag.firstChild) cards.appendChild(frag.firstChild);
    bindCardHover(newCards);
    shown += slice.length;

    if (shown < current.length) {
      let s = $("#sentinel");
      if (!s) {
        s = document.createElement("div");
        s.id = "sentinel";
        s.style.cssText = "grid-column:1/-1;height:1px";
        io.observe(s);
      }
      cards.appendChild(s);
    }
  }

  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) appendBatch();
  }, { rootMargin: "600px" });

  function bindCardHover(els) {
    els.forEach((el) => {
      const id = el.getAttribute("data-id");
      el.addEventListener("mouseenter", () => {
        const m = markerById[id];
        if (m) m.setStyle({ radius: 11, weight: 3 });
      });
      el.addEventListener("mouseleave", () => {
        const m = markerById[id];
        if (m) m.setStyle({ radius: 7, weight: 1.5 });
      });
    });
  }

  /* ---------- UI bindings ---------- */
  function bindUI() {
    $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; apply(); });

    const doSearch = () => { state.kw = $("#heroSearch").value.trim().toLowerCase(); apply();
      document.getElementById("browse").scrollIntoView({ behavior: "smooth" }); };
    $("#heroSearchBtn").addEventListener("click", doSearch);
    $("#heroSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

    // quick chips
    $$("#quickChips .chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        if (chip.dataset.area != null) {
          const a = chip.dataset.area;
          state.area = state.area === a ? "" : a;
          $$("#quickChips .chip[data-area]").forEach((c) =>
            c.classList.toggle("active", c.dataset.area === state.area));
        } else if (chip.dataset.reviews != null) {
          state.reviews = !state.reviews;
          chip.classList.toggle("active", state.reviews);
          $("#f_reviews").checked = state.reviews;
        }
        apply();
      });
    });

    // sheet open/close
    const openSheet = () => { $("#sheet").classList.add("open"); $("#sheetBackdrop").classList.add("open"); };
    const closeSheet = () => { $("#sheet").classList.remove("open"); $("#sheetBackdrop").classList.remove("open"); };
    $("#openFilters").addEventListener("click", openSheet);
    $("#closeSheet").addEventListener("click", closeSheet);
    $("#sheetBackdrop").addEventListener("click", closeSheet);

    // beds segmented
    $$("#f_beds button").forEach((b) => b.addEventListener("click", () => {
      $$("#f_beds button").forEach((x) => x.classList.remove("on"));
      b.classList.add("on"); state.beds = b.dataset.v;
    }));
    $('#f_beds button[data-v=""]').classList.add("on");

    $("#applyFilters").addEventListener("click", () => {
      state.maxpp = +$("#f_maxpp").value || null;
      state.minprice = +$("#f_minprice").value || null;
      state.maxprice = +$("#f_maxprice").value || null;
      state.area = $("#f_area").value;
      state.dist = +$("#f_dist").value || null;
      ["parking", "laundry", "ac", "furnished", "cats", "dogs", "photos", "reviews"].forEach((k) => {
        state[k] = $("#f_" + k).checked;
      });
      $$("#quickChips .chip[data-area]").forEach((c) =>
        c.classList.toggle("active", c.dataset.area === state.area));
      $('#quickChips .chip[data-reviews]').classList.toggle("active", state.reviews);
      closeSheet(); apply();
    });

    $("#resetFilters").addEventListener("click", () => {
      $$("#sheet input").forEach((i) => { if (i.type === "checkbox") i.checked = false; else i.value = ""; });
      $("#f_area").value = "";
      $$("#f_beds button").forEach((x) => x.classList.remove("on"));
      $('#f_beds button[data-v=""]').classList.add("on");
      Object.assign(state, {
        area: "", maxpp: null, minprice: null, maxprice: null, beds: "", dist: null,
        parking: false, laundry: false, ac: false, furnished: false, cats: false, dogs: false,
        photos: false, reviews: false,
      });
      $$("#quickChips .chip").forEach((c) => c.classList.remove("active"));
      apply();
    });

    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
  }

  load();
})();
