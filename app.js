(function () {
  "use strict";
  var KEY = (window.GOSLOW && window.GOSLOW.TOMTOM_KEY) || "";
  var HAS_KEY = KEY && KEY.indexOf("PASTE") === -1;
  var CACHE_MS = 5 * 60 * 1000;

  /* Routes: each point is a spot on the road. The traffic service snaps it to the nearest road. */
  var ROUTES = [
    { id: "ikorodu-ojota", name: "Ikorodu to Ojota", pts: [
      { n: "Ikorodu", p: [6.6194, 3.5105] }, { n: "Ikorodu Road, Ketu side", p: [6.6120, 3.4650] },
      { n: "Ikorodu Road, Mile 12 side", p: [6.6010, 3.4230] }, { n: "Ojota", p: [6.5870, 3.3790] }] },
    { id: "ojota-yaba", name: "Ojota to Yaba", pts: [
      { n: "Ojota", p: [6.5870, 3.3790] }, { n: "Anthony", p: [6.5600, 3.3700] },
      { n: "Fadeyi side", p: [6.5300, 3.3700] }, { n: "Yaba", p: [6.5095, 3.3711] }] },
    { id: "third-mainland", name: "Third Mainland Bridge", pts: [
      { n: "Oworonshoki end", p: [6.5350, 3.3990] }, { n: "Bridge north", p: [6.5150, 3.4000] },
      { n: "Bridge middle", p: [6.4850, 3.3950] }, { n: "Lagos Island end", p: [6.4600, 3.3900] }] },
    { id: "ikeja-maryland", name: "Ikeja to Maryland", pts: [
      { n: "Ikeja", p: [6.6018, 3.3515] }, { n: "Ikeja, Ikorodu Rd side", p: [6.5850, 3.3600] },
      { n: "Maryland", p: [6.5670, 3.3630] }] },
    { id: "vi-ajah", name: "Victoria Island to Ajah", pts: [
      { n: "Victoria Island", p: [6.4281, 3.4219] }, { n: "Lekki Phase 1", p: [6.4474, 3.4700] },
      { n: "Lekki, Chevron side", p: [6.4410, 3.5300] }, { n: "Ajah", p: [6.4680, 3.5710] }] },
    { id: "apapa-surulere", name: "Apapa to Surulere", pts: [
      { n: "Apapa", p: [6.4489, 3.3590] }, { n: "Costain side", p: [6.4700, 3.3600] },
      { n: "Surulere", p: [6.5000, 3.3580] }] }
  ];
  var CATEGORY = { 1: "Accident", 6: "Traffic jam", 7: "Lane closed", 8: "Road closed", 9: "Roadworks",
    11: "Flooding", 14: "Broken-down vehicle", 10: "Strong wind", 2: "Fog", 3: "Dangerous conditions", 4: "Rain", 5: "Ice" };
  var COLOR = { clear: "#2E9E5B", slow: "#D98200", heavy: "#D63B2B", na: "#6B7A73" };
  var LABEL = { clear: "Clear", slow: "Slow", heavy: "Heavy", na: "No data" };

  var state = { tab: "routes", results: {}, loading: {}, incidents: null, incLoading: false, incError: "", lines: {}, incLayer: null, user: null };
  var panel = document.getElementById("panel");

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ago(t) { var m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : Math.round(m / 60) + " hr ago"; }

  /* ---------- map ---------- */
  var map = L.map("map", { zoomControl: false }).setView([6.5244, 3.3792], 11);
  L.control.zoom({ position: "topright" }).addTo(map);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
  if (HAS_KEY) {
    L.tileLayer("https://api.tomtom.com/traffic/map/4/tile/flow/relative/{z}/{x}/{y}.png?key=" + KEY + "&tileSize=256",
      { maxZoom: 18, opacity: 0.9, attribution: "Traffic &copy; TomTom" }).addTo(map);
  } else {
    var b = document.getElementById("banner");
    b.hidden = false;
    b.textContent = "Live traffic is off. Open config.js, paste your TomTom key, and reload.";
  }

  document.getElementById("locate").addEventListener("click", function () {
    if (!navigator.geolocation) { return; }
    navigator.geolocation.getCurrentPosition(function (pos) {
      var ll = [pos.coords.latitude, pos.coords.longitude];
      if (state.user) { map.removeLayer(state.user); }
      state.user = L.circleMarker(ll, { radius: 8, color: "#fff", weight: 3, fillColor: "#1A78B5", fillOpacity: 1 }).addTo(map);
      map.setView(ll, 14);
    }, function () { toast("Could not get your location. Check that location is allowed for this site."); }, { enableHighAccuracy: true, timeout: 10000 });
  });

  /* ---------- traffic service ---------- */
  function flowAt(lat, lon) {
    var u = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?key=" + KEY + "&point=" + lat + "," + lon;
    return fetch(u).then(function (r) {
      if (!r.ok) { throw new Error("HTTP " + r.status); }
      return r.json();
    }).then(function (j) {
      var d = j.flowSegmentData;
      return { cur: d.currentSpeed, free: d.freeFlowSpeed, closed: !!d.roadClosure };
    });
  }
  function ratioStatus(r) { return r >= 0.75 ? "clear" : r >= 0.5 ? "slow" : "heavy"; }

  function checkRoute(route, force) {
    var ck = "gs_route_" + route.id, cached = null;
    try { cached = JSON.parse(localStorage.getItem(ck)); } catch (e) {}
    if (!force && cached && Date.now() - cached.at < CACHE_MS) { state.results[route.id] = cached; paintRoute(route); return Promise.resolve(); }
    state.loading[route.id] = true; render();
    return Promise.all(route.pts.map(function (pt) {
      return flowAt(pt.p[0], pt.p[1]).then(function (f) { return { n: pt.n, cur: f.cur, free: f.free, closed: f.closed }; }, function (e) { return { n: pt.n, err: String(e.message || e) }; });
    })).then(function (rows) {
      var ok = rows.filter(function (r) { return !r.err && r.free > 0; });
      var res;
      if (!ok.length) { res = { at: Date.now(), status: "na", rows: rows, error: rows[0] && rows[0].err }; }
      else {
        var ratios = ok.map(function (r) { return r.closed ? 0 : r.cur / r.free; });
        var avg = ratios.reduce(function (a, b) { return a + b; }, 0) / ratios.length;
        var worst = ok[ratios.indexOf(Math.min.apply(null, ratios))];
        res = { at: Date.now(), status: ratioStatus(avg), rows: rows, worst: worst, avg: avg };
      }
      state.results[route.id] = res; state.loading[route.id] = false;
      try { localStorage.setItem(ck, JSON.stringify(res)); } catch (e) {}
      paintRoute(route); render();
    });
  }
  function paintRoute(route) {
    var res = state.results[route.id]; if (!res) { return; }
    if (state.lines[route.id]) { map.removeLayer(state.lines[route.id]); }
    state.lines[route.id] = L.polyline(route.pts.map(function (p) { return p.p; }), { color: COLOR[res.status], weight: 5, opacity: 0.55, dashArray: "2 8" }).addTo(map);
  }
  function checkAll(force) { return Promise.all(ROUTES.map(function (r) { return checkRoute(r, force); })); }

  /* spot check: tap anywhere on the map */
  map.on("click", function (e) {
    if (!HAS_KEY) { return; }
    var pop = L.popup().setLatLng(e.latlng).setContent("Checking traffic here...").openOn(map);
    flowAt(e.latlng.lat, e.latlng.lng).then(function (f) {
      var st = f.closed ? "heavy" : ratioStatus(f.cur / f.free);
      pop.setContent('<div class="pop"><b>' + LABEL[st] + (f.closed ? " (road closed)" : "") + '</b>Moving at ' + Math.round(f.cur) + ' km/h. Normal is ' + Math.round(f.free) + ' km/h.</div>');
    }, function () { pop.setContent("No traffic data for this spot."); });
  });

  /* incidents in the visible map area */
  function loadIncidents() {
    if (!HAS_KEY) { return; }
    state.incLoading = true; state.incError = ""; render();
    var bd = map.getBounds(), bbox = [bd.getWest(), bd.getSouth(), bd.getEast(), bd.getNorth()].map(function (n) { return n.toFixed(5); }).join(",");
    var fields = "{incidents{type,geometry{type,coordinates},properties{iconCategory,events{description},from,to,delay}}}";
    var u = "https://api.tomtom.com/traffic/services/5/incidentDetails?key=" + KEY + "&bbox=" + bbox + "&fields=" + encodeURIComponent(fields) + "&language=en-GB&timeValidityFilter=present";
    fetch(u).then(function (r) { if (!r.ok) { throw new Error("HTTP " + r.status); } return r.json(); }).then(function (j) {
      var list = (j.incidents || []).map(function (i) {
        var c = i.geometry && i.geometry.coordinates, pt = null;
        if (i.geometry && i.geometry.type === "Point") { pt = c; } else if (c && c.length) { pt = c[Math.floor(c.length / 2)]; }
        var p = i.properties || {}, ev = p.events && p.events[0];
        return pt ? { lat: pt[1], lon: pt[0], cat: p.iconCategory, text: (ev && ev.description) || CATEGORY[p.iconCategory] || "Incident", from: p.from, to: p.to, delay: p.delay } : null;
      }).filter(Boolean);
      state.incidents = list; state.incLoading = false;
      if (state.incLayer) { map.removeLayer(state.incLayer); }
      state.incLayer = L.layerGroup(list.map(function (i) {
        return L.circleMarker([i.lat, i.lon], { radius: 8, color: "#fff", weight: 2, fillColor: i.cat === 1 ? "#8A3FA0" : i.cat === 11 ? "#1A78B5" : "#D63B2B", fillOpacity: 1 })
          .bindPopup("<b>" + esc(CATEGORY[i.cat] || "Incident") + "</b>" + esc(i.text) + (i.from ? "<br>" + esc(i.from) + (i.to ? " to " + esc(i.to) : "") : ""));
      })).addTo(map);
      render();
    }).catch(function (e) { state.incLoading = false; state.incError = String(e.message || e); render(); });
  }

  /* ---------- panel ---------- */
  function toast(m) { var b = document.getElementById("banner"); b.hidden = false; b.textContent = m; setTimeout(function () { if (HAS_KEY) { b.hidden = true; } }, 4000); }
  function render() {
    document.querySelectorAll(".tab").forEach(function (t) { t.setAttribute("aria-selected", String(t.dataset.tab === state.tab)); });
    if (state.tab === "routes") { renderRoutes(); } else { renderIncidents(); }
  }
  function renderRoutes() {
    var h = "";
    if (!HAS_KEY) { h += '<p class="note">Add your TomTom key in config.js to see route status.</p>'; }
    ROUTES.forEach(function (r) {
      var res = state.results[r.id], st = state.loading[r.id] ? null : res && res.status;
      var detail = state.loading[r.id] ? "Checking..." : !res ? "Not checked yet" :
        res.status === "na" ? "No traffic data for this route" + (res.error ? " (" + esc(res.error) + ")" : "") :
        "Average " + Math.round(res.avg * 100) + "% of normal speed. Slowest: " + esc(res.worst.n) + " at " + Math.round(res.worst.cur) + " km/h. " + ago(res.at);
      h += '<button class="item" data-route="' + r.id + '"><span><span class="t">' + esc(r.name) + '</span><span class="m">' + detail + '</span></span>' +
        (st ? '<span class="sp ' + st + '">' + LABEL[st] + '</span>' : "") + '</button>';
    });
    h += '<div class="row"><button class="btn primary" id="refresh"' + (HAS_KEY ? "" : " disabled") + '>Refresh routes</button><span class="m">Tap the map anywhere to check that spot.</span></div>';
    panel.innerHTML = h;
  }
  function renderIncidents() {
    var h = '<div class="row"><button class="btn primary" id="loadInc"' + (HAS_KEY ? "" : " disabled") + '>Find incidents in this map view</button></div>';
    if (state.incLoading) { h += '<p class="note">Looking...</p>'; }
    else if (state.incError) { h += '<p class="note">Could not load incidents (' + esc(state.incError) + ').</p>'; }
    else if (state.incidents) {
      h += state.incidents.length ? state.incidents.map(function (i, k) {
        return '<button class="item" data-inc="' + k + '"><span><span class="t">' + esc(CATEGORY[i.cat] || "Incident") + '</span><span class="m">' + esc(i.text) + (i.from ? " · " + esc(i.from) : "") + '</span></span></button>';
      }).join("") : '<p class="note">No reported incidents in this map view right now.</p>';
    } else { h += '<p class="note">Zoom to the area you care about, then tap the button.</p>'; }
    panel.innerHTML = h;
  }
  document.querySelector(".tabs").addEventListener("click", function (e) { var t = e.target.closest(".tab"); if (t) { state.tab = t.dataset.tab; render(); } });
  panel.addEventListener("click", function (e) {
    if (e.target.closest("#refresh")) { checkAll(true); return; }
    if (e.target.closest("#loadInc")) { loadIncidents(); return; }
    var r = e.target.closest("[data-route]");
    if (r) { var route = ROUTES.filter(function (x) { return x.id === r.dataset.route; })[0]; map.fitBounds(L.latLngBounds(route.pts.map(function (p) { return p.p; })).pad(0.3)); return; }
    var i = e.target.closest("[data-inc]");
    if (i) { var inc = state.incidents[+i.dataset.inc]; map.setView([inc.lat, inc.lon], 15); }
  });

  render();
  if (HAS_KEY) { checkAll(false); }
  if ("serviceWorker" in navigator) { navigator.serviceWorker.register("sw.js").catch(function () {}); }
})();
