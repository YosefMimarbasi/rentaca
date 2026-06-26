/* Rentaca — building detail */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const money = (n) => (n ? "$" + Number(n).toLocaleString() : "—");
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  const CAT_LABELS = {
    safety: "Safety", location: "Location", communication: "Communication",
    conditions: "Conditions", maintenance: "Maintenance", value: "Value",
  };

  let LB = { imgs: [], i: 0 };

  function stars(n) {
    const full = Math.round(n);
    return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
  }

  async function load() {
    const id = new URLSearchParams(location.search).get("id");
    let data;
    try {
      const res = await fetch("data/site.json", { cache: "no-store" });
      data = await res.json();
    } catch (e) {
      $("#root").innerHTML = '<div class="state"><h3>Couldn’t load data</h3></div>';
      return;
    }
    const b = data.buildings.find((x) => x.id === id);
    if (!b) {
      $("#root").innerHTML = '<div class="state"><h3>Building not found</h3><a href="index.html">← Back to listings</a></div>';
      return;
    }
    document.title = b.address + " — Rentaca";
    render(b, data.buildings);
  }

  function gallery(b) {
    const imgs = b.images || [];
    if (!imgs.length) {
      return `<div class="gallery gallery--single"><div class="ph" style="display:grid;place-items:center;height:340px;background:var(--bg-tint);color:var(--muted-2)">No photos yet</div></div>`;
    }
    LB.imgs = imgs;
    const show = imgs.slice(0, 5);
    const single = show.length === 1 ? " gallery--single" : "";
    return `<div class="gallery${single}">` + show.map((src, i) => {
      const more = (i === 4 && imgs.length > 5)
        ? `<div class="ov">+${imgs.length - 5} photos</div>` : "";
      const cls = `g${i}` + (more ? " gallery__more" : "");
      return `<div class="${i === 0 ? "g0" : ""} ${more ? "gallery__more" : ""}" style="position:relative;${i === 0 ? "grid-row:1/3" : ""}">
        <img class="lb" data-i="${i}" src="${esc(src)}" loading="lazy" alt="" onerror="this.style.opacity=.2">
        ${more}</div>`;
    }).join("") + `</div>`;
  }

  function unitsTable(units) {
    if (!units.length) return "";
    const rows = units.map((u) => {
      const beds = u.beds == null ? "—" : (u.beds === 0 ? "Studio" : u.beds + " bd");
      const baths = u.baths ? u.baths + " ba" : "—";
      const tags = [];
      if (u.furnished) tags.push("Furnished");
      if (u.parking) tags.push(cap(u.parking) + " parking");
      if (u.laundry) tags.push(cap(u.laundry) + " laundry");
      if (u.ac) tags.push("A/C");
      if (u.utilities) tags.push("Utils incl.");
      return `<tr>
        <td><div class="price">${money(u.price)}${u.est ? ' <span class="est" title="Estimated from building median — exact rent not listed">est.</span>' : ""}</div>${u.pp ? `<div class="pp">${money(u.pp)}/person</div>` : ""}</td>
        <td>${esc(beds)}</td>
        <td>${esc(baths)}</td>
        <td>${u.sqft ? u.sqft.toLocaleString() + " ft²" : "—"}</td>
        <td>${u.available ? `<span class="avail">${esc(u.available)}</span>` : "—"}</td>
        <td>${tags.slice(0, 2).map((t) => `<span class="tag">${esc(t)}</span>`).join(" ")}</td>
        <td style="text-align:right">
          <span class="tag tag--src">${esc(u.source)}</span>
          ${u.url ? ` <a href="${esc(u.url)}" target="_blank" rel="noopener" title="Original listing">↗</a>` : ""}
        </td>
      </tr>`;
    }).join("");
    return `<div class="panel">
      <h2>${units.length} unit${units.length > 1 ? "s" : ""} in this building</h2>
      <div style="overflow-x:auto">
      <table class="units">
        <thead><tr><th>Rent</th><th>Beds</th><th>Baths</th><th>Size</th><th>Available</th><th>Features</th><th style="text-align:right">Source</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
  }

  function reviewsPanel(b) {
    if (!b.num_reviews && !b.rating) return "";
    const ca = b.category_averages || {};
    const catBars = Object.keys(CAT_LABELS).filter((k) => ca[k] != null).map((k) => {
      const v = ca[k];
      return `<div class="catbar"><span>${CAT_LABELS[k]}</span>
        <span class="track"><span class="fill" style="width:${(v / 5) * 100}%"></span></span>
        <span class="v">${v.toFixed(1)}</span></div>`;
    }).join("");
    const reviews = (b.reviews || []).map((r) => `
      <div class="review">
        <div class="review__top">
          <span class="review__stars">${stars(r.rating)}</span>
          <span class="review__date">${esc(r.date)}${r.likes ? " · " + r.likes + " 👍" : ""}</span>
        </div>
        <div class="review__text">${esc(r.text)}</div>
      </div>`).join("");
    return `<div class="panel">
      <h2>Resident reviews</h2>
      ${b.rating ? `<div class="rating-big">
        <div class="num">${b.rating}</div>
        <div><div class="stars">${stars(b.rating)}</div>
        <div class="cnt">${b.num_reviews} review${b.num_reviews > 1 ? "s" : ""} · via CUAPTS</div></div>
      </div>` : ""}
      ${catBars ? `<div class="catbars">${catBars}</div>` : ""}
      ${reviews}
    </div>`;
  }

  function floorplansPanel(b) {
    if (!b.floorplans || !b.floorplans.length) return "";
    const off = (b.images || []).length;
    LB.imgs = (b.images || []).concat(b.floorplans);
    const fp = b.floorplans.map((src, i) =>
      `<img class="lb" data-i="${off + i}" src="${esc(src)}" loading="lazy" alt="Floor plan"
        style="border:1px solid var(--line-soft);border-radius:12px;cursor:pointer;background:#fff;object-fit:contain;height:200px;width:auto" onerror="this.style.display='none'">`).join("");
    return `<div class="panel"><h2>Floor plans</h2>
      <div style="display:flex;gap:12px;flex-wrap:wrap">${fp}</div></div>`;
  }

  function sidePanel(b) {
    const facts = [];
    if (b.area) facts.push(["Area", b.area]);
    if (b.dist_cornell != null) facts.push(["To Cornell", b.dist_cornell + " mi"]);
    else if (b.approx_loc) facts.push(["Location", "Ithaca area (approx.)"]);
    if (b.dist_ic != null) facts.push(["To Ithaca College", b.dist_ic + " mi"]);
    if (b.walk_min) facts.push(["Walk to campus", "~" + b.walk_min + " min"]);
    if (b.drive_min) facts.push(["Drive to campus", "~" + b.drive_min + " min"]);
    if (b.beds_min != null) {
      const r = b.beds_min === b.beds_max ? (b.beds_min || "Studio") : `${b.beds_min}–${b.beds_max}`;
      facts.push(["Bedrooms", r]);
    }

    const am = b.amenities || {};
    const amenLabels = { parking: "🅿️ Parking", laundry: "🧺 Laundry", ac: "❄️ A/C", furnished: "🛋️ Furnished", cats: "🐱 Cats OK", dogs: "🐶 Dogs OK" };
    const amens = Object.keys(amenLabels).filter((k) => am[k]).map((k) => `<span class="amen">${amenLabels[k]}</span>`).join("");

    const contact = [];
    if (b.company) contact.push(`<div class="fact"><span class="k">Managed by</span><span class="v">${esc(b.company)}</span></div>`);
    if (b.phone) contact.push(`<div class="fact"><span class="k">Phone</span><span class="v"><a href="tel:${esc(b.phone)}">${esc(b.phone)}</a></span></div>`);

    const firstUrl = ((b.units || []).find((u) => u.url) || {}).url;

    return `<div class="sticky-side">
      <div class="panel">
        ${b.pp_min ? `<div class="bhead__price"><div class="pp">${money(b.pp_min)}<small>/person</small></div>
          ${b.price_min ? `<div class="tot">from ${money(b.price_min)}/mo${b.price_max && b.price_max !== b.price_min ? " – " + money(b.price_max) : ""}</div>` : ""}</div>`
        : (b.price_min ? `<div class="bhead__price"><div class="pp">${money(b.price_min)}<small>/mo</small></div></div>` : "<div style='color:var(--muted)'>Contact for pricing</div>")}
        <div class="facts" style="margin-top:14px">
          ${facts.map(([k, v]) => `<div class="fact"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join("")}
          ${contact.join("")}
        </div>
        ${amens ? `<div style="margin-top:16px"><div class="field" style="margin:0 0 9px"><label style="margin:0">Amenities</label></div><div class="amen-chips">${amens}</div></div>` : ""}
        <div class="side-cta">
          ${b.website ? `<a class="btn btn--primary" href="${esc(b.website)}" target="_blank" rel="noopener">Visit landlord site ↗</a>` : ""}
          ${firstUrl ? `<a class="btn btn--outline" href="${esc(firstUrl)}" target="_blank" rel="noopener">View original listing ↗</a>` : ""}
        </div>
      </div>
      ${b.lat && b.lng ? `<div class="panel"><h2 style="font-size:18px;margin-bottom:12px">Location</h2><div id="bmap"></div></div>` : ""}
      <div class="panel" style="font-size:13px;color:var(--muted)">
        <strong style="color:var(--text-2)">Sources:</strong> <span style="text-transform:lowercase">${b.sources.join(", ")}</span>.
        Rents and availability change frequently — confirm with the landlord.
      </div>
    </div>`;
  }

  function render(b, all) {
    const metaBits = [];
    if (b.area) metaBits.push(esc(b.area));
    if (b.rating) metaBits.push(`<span class="star">★</span> ${b.rating} (${b.num_reviews})`);
    if (b.num_units) metaBits.push(`${b.num_units} unit${b.num_units > 1 ? "s" : ""}`);
    if (b.dist_cornell != null) metaBits.push(`${b.dist_cornell} mi to Cornell`);

    $("#root").innerHTML = `
      <a class="back" href="index.html">‹ All listings</a>
      <div class="bhead">
        <div>
          <h1>${esc(b.address)}</h1>
          <div class="meta">${metaBits.join('<span style="opacity:.4">·</span>')}</div>
        </div>
      </div>
      ${gallery(b)}
      <div class="cols">
        <div>
          ${unitsTable(b.units || [])}
          ${floorplansPanel(b)}
          ${reviewsPanel(b)}
          ${similarPanel(b, all)}
        </div>
        ${sidePanel(b)}
      </div>`;

    if (b.lat && b.lng) initMap(b);
    bindLightbox();
  }

  function similarPanel(b, all) {
    if (!b.area && b.dist_cornell == null) return "";
    const peers = all.filter((x) => x.id !== b.id && x.img &&
      (b.area ? x.area === b.area : Math.abs((x.dist_cornell || 99) - (b.dist_cornell || 0)) < 0.4))
      .slice(0, 3);
    if (!peers.length) return "";
    const cards = peers.map((p) => `
      <a class="card" href="building.html?id=${encodeURIComponent(p.id)}" style="text-decoration:none;color:inherit">
        <div class="card__media"><img src="${esc(p.img)}" loading="lazy" alt="" onerror="this.parentNode.innerHTML='<div class=ph>No photo</div>'">
          ${p.pp_min ? `<div class="card__pp"><b>${money(p.pp_min)}</b> <small>/person</small></div>` : ""}</div>
        <div class="card__body"><div class="card__addr">${esc(p.address)}</div>
          ${p.area ? `<div class="card__area">${esc(p.area)}</div>` : ""}</div>
      </a>`).join("");
    return `<div class="panel"><h2>Nearby in ${esc(b.area || "the area")}</h2>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px">${cards}</div></div>`;
  }

  function initMap(b) {
    const map = L.map("bmap", { scrollWheelZoom: false, zoomControl: true }).setView([b.lat, b.lng], 15);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: "© OSM, © CARTO", maxZoom: 19,
    }).addTo(map);
    L.circleMarker([b.lat, b.lng], { radius: 10, color: "#fff", weight: 2, fillColor: "#B31B1B", fillOpacity: 1 })
      .addTo(map).bindPopup(esc(b.address));
    L.marker([42.4534, -76.4735], {
      icon: L.divIcon({ className: "", html: `<div style="background:#b31b1b;color:#fff;font-size:10px;font-weight:700;padding:3px 7px;border-radius:980px;white-space:nowrap">Cornell</div>`, iconSize: [0, 0], iconAnchor: [20, 10] }),
    }).addTo(map);
    setTimeout(() => map.invalidateSize(), 200);
  }

  /* ---------- lightbox ---------- */
  function bindLightbox() {
    const lb = $("#lightbox"), img = $("#lbImg"), count = $("#lbCount");
    const show = (i) => {
      LB.i = (i + LB.imgs.length) % LB.imgs.length;
      img.src = LB.imgs[LB.i];
      count.textContent = `${LB.i + 1} / ${LB.imgs.length}`;
    };
    $$(".lb").forEach((el) => el.addEventListener("click", () => {
      lb.classList.add("open"); show(+el.dataset.i);
    }));
    // gallery "+N more" overlay opens at the 5th image
    $$(".gallery__more .ov").forEach((el) => el.addEventListener("click", (e) => {
      e.stopPropagation(); lb.classList.add("open"); show(4);
    }));
    $("#lbClose").addEventListener("click", () => lb.classList.remove("open"));
    $("#lbNext").addEventListener("click", () => show(LB.i + 1));
    $("#lbPrev").addEventListener("click", () => show(LB.i - 1));
    lb.addEventListener("click", (e) => { if (e.target === lb) lb.classList.remove("open"); });
    document.addEventListener("keydown", (e) => {
      if (!lb.classList.contains("open")) return;
      if (e.key === "Escape") lb.classList.remove("open");
      if (e.key === "ArrowRight") show(LB.i + 1);
      if (e.key === "ArrowLeft") show(LB.i - 1);
    });
  }

  load();
})();
