/* bas-ems — Master Data & Asset Registry
 * Classic script -> registers module 'masterdata'
 *
 * Data-dense registry view, visually refined (not decorated): a fleet-stats hero
 * band, an asset-hierarchy tree with CSS connector lines + per-level count chips,
 * a live Point/Tag registry, an Equipment registry with kind-family chips and a
 * per-row power-vs-area-max meter, and an E10 state-time allocation strip using
 * the same SEMI E10 palette as the production view.
 *
 * Constraints honoured: classic IIFE, file://-safe (inline DOM only), zero
 * per-frame allocation (all refs/arrays built at mount; throttled + change-gated
 * writes), all data from `frame` + `BAS.master`, deterministic shimmer via
 * BAS.ui.jitter, seam-free, reduced-motion aware (CSS handles transitions).
 */
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el, M = BAS.master;

  // ---- closure refs ----------------------------------------------------
  var ptTbl, ptMeta, equipTbl, treeWrap;
  var heroKpi = {};            // hero KPI value-number spans
  var selectedId = null, selPoints = null, selLabel = '';
  var rowById = {};            // data-id -> tree row element (for active highlight)
  var fc = 0;

  // E10 state-time allocation strip refs (one row per area)
  var stRows = [];             // [{id, segs:{state->{i, lastPct}}, totalEl, lastSig}]
  // E10 states in fixed stacking order + palette class (matches production view)
  var E10_ORDER = [
    ['Productive', 'md-st-prod'],
    ['Standby', 'md-st-stby'],
    ['Engineering', 'md-st-eng'],
    ['Scheduled Down', 'md-st-sdwn'],
    ['Unscheduled Down', 'md-st-udwn'],
    ['Non-Scheduled', 'md-st-nsch']
  ];

  // ---- kind-family classification (colours the .chip in the registry) --
  // Map each tool 'kind' to a small family so the registry reads at a glance.
  var KIND_FAMILY = {
    SCANNER: 'litho', TRACK: 'litho', COATER: 'litho',
    PLASMA: 'etch', RIE: 'etch', ASH: 'etch',
    FURNACE: 'thermal', LPCVD: 'thermal', OXIDE: 'thermal',
    'HC-IMP': 'implant', 'MC-IMP': 'implant', 'HE-IMP': 'implant',
    POLISH: 'cmp', 'POST-CLEAN': 'cmp',
    BENCH: 'wet', SRD: 'wet', SCRUBBER: 'wet',
    PVD: 'depo', CVD: 'depo', ALD: 'depo',
    'CD-SEM': 'metro', OVERLAY: 'metro', FILM: 'metro'
  };

  // ---- static counts (master data is fixed across the loop) ------------
  var nTools = M.tools.length;
  var nAssets = facilityAssetCount();
  var nAreas = M.areas.length;
  var estPoints = nTools * 45 + nAssets * 40;
  var connectedKW = totalConnectedKW();

  // per-area peak/connected kW envelope used to normalise the per-row meter
  var AREA_MAX = {};
  M.areas.forEach(function (a) { AREA_MAX[a.id] = a.baseKW[1]; });

  function facilityAssetCount() {
    var sum = 0, f = M.facility;
    for (var k in f) { if (f.hasOwnProperty(k) && f[k] && f[k].length != null) sum += f[k].length; }
    return sum;
  }
  function totalConnectedKW() {
    var sum = 0;
    for (var i = 0; i < M.tools.length; i++) sum += M.tools[i].baseKW;
    return sum;
  }

  BAS.registerModule({
    id: 'masterdata', title: 'Master Data', group: 'Master Data', order: 1, icon: 'db',

    mount: function (root) {
      var head = el('div', 'view-head');
      head.innerHTML = '<h1>Master Data &amp; Asset Registry</h1>' +
        '<span class="crumb">FAB-1 · Asset Hierarchy · Point/Tag Registry</span>' +
        '<span class="right">' + U.group(estPoints) + ' engineered points</span>';
      root.appendChild(head);

      var grid = el('div', 'grid');

      // ---- (1) fleet-stats hero band -----------------------------------
      var heroP = U.panel('Fleet Registry', { cls: 'col-12 hud', pill: 'STATIC' });
      var hero = el('div', 'pg-hero');

      var sig = el('div', 'pg-hero-sig center');
      sig.appendChild(el('div', 'pg-hero-label', 'PROCESS TOOLS REGISTERED'));
      var read = el('div', 'pg-hero-read');
      var rn = el('span'); rn.textContent = U.group(nTools); read.appendChild(rn);
      read.appendChild(el('span', 'u', 'eqp'));
      sig.appendChild(read);
      sig.appendChild(el('div', 'pg-hero-sub', U.group(nAssets) + ' facility assets · ' + nAreas + ' process areas'));
      hero.appendChild(sig);

      var kpis = el('div', 'pg-hero-kpis');
      [
        ['areas', 'Process Areas', '', 'accent'],
        ['conn', 'Connected Load', 'kW', ''],
        ['points', 'Point / Tag Count', '', ''],
        ['uptime', 'E10 Fleet Uptime', '%', 'good']
      ].forEach(function (k) {
        var box = el('div', 'pg-hk' + (k[3] ? ' ' + k[3] : ''));
        box.appendChild(el('div', 'lab', k[1]));
        var v = el('div', 'v');
        var vn = el('span'); v.appendChild(vn);
        if (k[2]) v.appendChild(el('span', 'u', k[2]));
        v._num = vn;
        box.appendChild(v);
        kpis.appendChild(box);
        heroKpi[k[0]] = vn;
      });
      hero.appendChild(kpis);
      heroP._body.appendChild(hero);
      grid.appendChild(heroP);

      // static hero values resolved once
      heroKpi.areas.textContent = nAreas;
      heroKpi.conn.textContent = U.group(connectedKW);
      heroKpi.points.textContent = U.group(estPoints);
      heroKpi.uptime.textContent = '—';

      // ---- (2) asset hierarchy tree ------------------------------------
      var treeP = U.panel('Asset Hierarchy', { cls: 'col-5', bodyCls: 'flush', meta: 'Site ▸ Building ▸ System ▸ Equipment' });
      treeWrap = el('div', 'md-tree');
      buildTree(treeWrap, M.hierarchy, 0);
      treeP._body.appendChild(treeWrap);
      grid.appendChild(treeP);

      // delegated click — works for every Equipment leaf row built at mount
      treeWrap.addEventListener('click', function (ev) {
        var row = ev.target.closest ? ev.target.closest('.md-row[data-id]') : null;
        if (!row) return;
        select(row.getAttribute('data-id'), row.getAttribute('data-label') || row.getAttribute('data-id'));
      });

      // ---- (3) point / tag registry ------------------------------------
      var ptP = U.panel('Point / Tag Registry', { cls: 'col-7', bodyCls: 'flush', meta: '—', metaId: 'md-ptmeta' });
      ptMeta = ptP._head.querySelector('.meta');
      ptTbl = U.table([
        { label: 'Tag', key: 'tag', tdCls: 'name' },
        { label: 'Description', key: 'desc' },
        { label: 'Value', render: function (r) { return r.value; }, tdCls: 'num' },
        { label: 'Unit', key: 'unit' },
        { label: 'Bus', render: function (r) { return busTag(r.bus); } },
        { label: 'Address', key: 'addr' }
      ], { maxH: '494px' });
      ptP._body.appendChild(ptTbl.node);
      grid.appendChild(ptP);

      // ---- (4) E10 state-time allocation strip -------------------------
      var stP = U.panel('E10 State-Time Allocation', { cls: 'col-5', bodyCls: 'tight', meta: 'per-area · live' });
      var legend = el('div', 'md-st-legend');
      E10_ORDER.forEach(function (s) {
        var item = el('span', 'md-st-leg');
        item.appendChild(el('i', s[1]));
        item.appendChild(document.createTextNode(s[0]));
        legend.appendChild(item);
      });
      stP._body.appendChild(legend);

      var stWrap = el('div', 'md-st-wrap');
      for (var ai = 0; ai < M.areas.length; ai++) {
        var a = M.areas[ai];
        var row = el('div', 'md-st-row');
        row.appendChild(el('div', 'md-st-name', a.id));
        var track = el('div', 'md-st-track');
        var segs = {};
        E10_ORDER.forEach(function (s) {
          var seg = el('i', s[1]);
          seg.style.width = '0%';
          track.appendChild(seg);
          segs[s[0]] = { el: seg, last: -1 };
        });
        row.appendChild(track);
        var tot = el('div', 'md-st-tot', '0');
        row.appendChild(tot);
        stWrap.appendChild(row);
        stRows.push({ id: a.id, segs: segs, totalEl: tot, lastSig: '' });
      }
      stP._body.appendChild(stWrap);
      grid.appendChild(stP);

      // ---- (5) equipment registry --------------------------------------
      var eqP = U.panel('Equipment Registry — Process Tools', { cls: 'col-12', bodyCls: 'flush', meta: nTools + ' tools · SEMI E10 · base kW vs area max' });
      equipTbl = U.table([
        { label: 'ID', key: 'id', tdCls: 'name' },
        { label: 'Name', key: 'name' },
        { label: 'Kind', render: function (r) { return r.kindChip; } },
        { label: 'Area', key: 'area' },
        { label: 'E10 State', render: function (r) { return r.badge; } },
        { label: 'Base kW', render: function (r) { return r.kw; }, tdCls: 'num' },
        { label: 'Load vs Area Max', render: function (r) { return r.meter; } }
      ], { maxH: '340px' });
      eqP._body.appendChild(equipTbl.node);
      grid.appendChild(eqP);

      root.appendChild(grid);

      // default selection: first process tool
      select(M.tools[0].id, M.tools[0].name);
    },

    update: function (frame) {
      fc++;

      // (3) refresh live point values every 8 frames against the current selection
      if (selPoints && fc % 8 === 0) {
        ptTbl.set(selPoints.map(function (pt) {
          return {
            tag: pt.tag, desc: pt.desc, unit: pt.unit || '', bus: pt.bus, addr: pt.addr,
            value: liveValue(pt, frame)
          };
        }));
      }

      // (1) hero E10 fleet uptime — Productive share across the whole fleet
      if (fc % 16 === 1) {
        var prod = 0, tot = 0, as = frame.areaStates;
        for (var k in as) {
          if (!as.hasOwnProperty(k)) continue;
          prod += as[k].Productive || 0;
          tot += as[k].total || 0;
        }
        var up = tot > 0 ? (prod / tot * 100) : 0;
        var txt = up.toFixed(1);
        if (heroKpi.uptime.textContent !== txt) heroKpi.uptime.textContent = txt;
      }

      // (4) E10 state-time allocation — stacked bars, change-gated per row
      if (fc % 10 === 3) {
        for (var ri = 0; ri < stRows.length; ri++) {
          var sr = stRows[ri];
          var st = frame.areaStates[sr.id];
          if (!st) continue;
          var total = st.total || 0;
          // change-gate the whole row on a cheap signature before touching segments
          var sig = total + ':' + (st.Productive || 0) + ':' + (st.Standby || 0) + ':' +
            (st.Engineering || 0) + ':' + (st['Unscheduled Down'] || 0);
          if (sig === sr.lastSig) continue;
          sr.lastSig = sig;
          for (var si = 0; si < E10_ORDER.length; si++) {
            var name = E10_ORDER[si][0];
            var cnt = st[name] || 0;
            var pct = total > 0 ? (cnt / total * 100) : 0;
            var seg = sr.segs[name];
            var w = Math.round(pct * 10) / 10;
            if (w !== seg.last) { seg.last = w; seg.el.style.width = w + '%'; }
          }
          if (sr.totalEl.textContent !== (total + '')) sr.totalEl.textContent = total;
        }
      }

      // (5) equipment registry — E10 badges + power meter; throttle every 12 frames
      if (fc % 12 === 1) {
        equipTbl.set(M.tools.map(function (t) {
          var stt = frame.toolStates[t.id] || 'Non-Scheduled';
          var max = AREA_MAX[t.area] || t.baseKW;
          var pct = Math.max(0, Math.min(100, t.baseKW / max * 100));
          var mc = pct >= 85 ? ' bad' : pct >= 65 ? ' warn' : '';
          return {
            id: t.id, name: t.name, area: t.areaName,
            kindChip: kindChip(t.kind),
            badge: U.stateBadge(stt).outerHTML,
            kw: t.baseKW,
            meter: '<span class="td-meter' + mc + '"><i style="width:' + pct.toFixed(0) + '%"></i></span>'
          };
        }));
      }
    }
  });

  // ---- tree builder (CSS connector lines + per-level count chips) ------
  function buildTree(container, node, depth) {
    var isLeaf = !node.children || node.children.length === 0;
    var selectable = node.type === 'Equipment' || isLeaf; // equipment leaves are clickable
    var kids = node.children ? node.children.length : 0;

    var row = el('div', 'md-row d-' + Math.min(depth, 4) +
      (selectable ? ' leaf' : ' branch') + ' t-' + node.type);
    row.style.setProperty('--md-depth', depth);

    var marker = el('span', 'md-mk');
    marker.textContent = selectable ? '·' : '▸';
    row.appendChild(marker);

    var name = el('span', 'md-nm');
    name.textContent = node.name;
    row.appendChild(name);

    var tag = el('span', 'md-tag');
    tag.textContent = selectable ? node.id : node.type.toUpperCase();
    row.appendChild(tag);

    // per-level count chip on branch nodes (how many children below it)
    if (!selectable && kids > 0) {
      var chip = el('span', 'md-count');
      chip.textContent = kids;
      row.appendChild(chip);
    }

    if (selectable) {
      row.setAttribute('data-id', node.id);
      row.setAttribute('data-label', node.name);
      rowById[node.id] = row;
    }

    container.appendChild(row);

    if (node.children) {
      for (var i = 0; i < node.children.length; i++) buildTree(container, node.children[i], depth + 1);
    }
  }

  // ---- selection -------------------------------------------------------
  function select(id, label) {
    if (!id) return;
    if (selectedId && rowById[selectedId]) rowById[selectedId].classList.remove('active');
    selectedId = id;
    selLabel = label || id;
    if (rowById[selectedId]) rowById[selectedId].classList.add('active');

    selPoints = M.pointsForEquipment(id);
    var cat = M.categoryFor(id);
    if (ptMeta) ptMeta.textContent = id + ' · ' + cat + ' · ' + selPoints.length + ' points';

    // full rebuild of the point table on selection change (values resolve next update)
    ptTbl.set(selPoints.map(function (pt) {
      return {
        tag: pt.tag, desc: pt.desc, unit: pt.unit || '', bus: pt.bus, addr: pt.addr,
        value: fmtNum(pt.nominal)
      };
    }));
  }

  // ---- kind chip -------------------------------------------------------
  function kindChip(kind) {
    var fam = KIND_FAMILY[kind] || 'other';
    return '<span class="md-chip md-fam-' + fam + '">' + kind + '</span>';
  }

  // ---- live value resolution ------------------------------------------
  function liveValue(pt, frame) {
    var tag = pt.tag;
    if (/STATE$/.test(tag)) {
      var st = frame.toolStates[selectedId];
      return st ? U.stateBadge(st).outerHTML : '<span class="dim">—</span>';
    }
    if (/RECIPE$/.test(tag)) {
      var tool = M.toolById(selectedId);
      var area = tool ? tool.area : null;
      var recs = area ? M.recipes(area) : [];
      if (!recs.length) return '<span class="dim">— idle</span>';
      // deterministic, slowly-rotating recipe selection keyed off the loop tick
      var idx = Math.floor(frame.tick / 90 + BAS.prng.rand('rcp:' + selectedId, 1) * recs.length) % recs.length;
      return '<span class="mono">' + recs[idx] + '</span>';
    }
    var amp = Math.abs(pt.nominal) * 0.02 + 0.05;
    return fmtNum(pt.nominal + U.jitter('pt:' + tag, frame.tick, amp));
  }

  // 1–2 dp depending on magnitude; integers stay clean for big readings
  function fmtNum(v) {
    if (v == null || isNaN(v)) return '<span class="dim">—</span>';
    var a = Math.abs(v);
    if (a >= 1000) return U.group(Math.round(v));
    if (a >= 100) return v.toFixed(1);
    return v.toFixed(2);
  }

  function busTag(bus) {
    var c = bus === 'SECS' ? 'var(--accent)' : bus === 'BACnet' ? 'var(--accent-2)' : 'var(--purple)';
    return '<span class="mono" style="color:' + c + '">' + bus + '</span>';
  }
})(window.BAS);
