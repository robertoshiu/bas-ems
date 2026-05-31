/* bas-ems — Master Data & Asset Registry
 * Classic script -> registers module 'masterdata'
 * Asset hierarchy tree (Site > Building > Floor/System > Equipment) wired to a
 * live Point/Tag registry, plus a full Equipment registry table. All data from
 * BAS.master + frame; live values shimmer deterministically off frame.tick.
 */
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el, M = BAS.master;

  // ---- closure refs ----------------------------------------------------
  var kProcTools, kFacAssets, kAreas, kPoints;
  var ptTbl, ptMeta, equipTbl, treeWrap;
  var selectedId = null, selPoints = null, selLabel = '';
  var rowById = {};            // data-id -> tree row element (for active highlight)
  var fc = 0;

  // counts computed once at mount (master data is static across the loop)
  var nTools = M.tools.length;
  var nAssets = facilityAssetCount();
  var nAreas = M.areas.length;
  var estPoints = nTools * 45 + nAssets * 40;

  function facilityAssetCount() {
    var sum = 0, f = M.facility;
    for (var k in f) { if (f.hasOwnProperty(k) && f[k] && f[k].length != null) sum += f[k].length; }
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

      // ---- (2) top KPIs --------------------------------------------------
      kProcTools = U.kpi({ label: 'Process Tools', unit: 'eqp', showDelta: false });
      kFacAssets = U.kpi({ label: 'Facility Assets', unit: 'eqp', showDelta: false });
      kAreas = U.kpi({ label: 'Process Areas', unit: 'bays', showDelta: false });
      kPoints = U.kpi({ label: 'Est. Points', unit: 'tags', accent: true, showDelta: false });
      [
        ['Process Tools', kProcTools], ['Facility Assets', kFacAssets],
        ['Process Areas', kAreas], ['Est. Points', kPoints]
      ].forEach(function (pair, i) {
        var p = U.panel(pair[0], { cls: 'col-3' });
        p._body.appendChild(pair[1].node);
        grid.appendChild(p);
      });
      kProcTools.set(U.group(nTools));
      kFacAssets.set(U.group(nAssets));
      kAreas.set(U.group(nAreas));
      kPoints.set(U.group(estPoints));

      // ---- (3) asset hierarchy tree -------------------------------------
      var treeP = U.panel('Asset Hierarchy', { cls: 'col-5', bodyCls: 'flush', meta: 'Site ▸ Building ▸ System ▸ Equipment' });
      treeWrap = el('div', 'mdtree');
      treeWrap.style.maxHeight = '560px';
      treeWrap.style.overflow = 'auto';
      treeWrap.style.padding = '6px 0';
      buildTree(treeWrap, M.hierarchy, 0);
      treeP._body.appendChild(treeWrap);
      grid.appendChild(treeP);

      // delegated click — works for every Equipment leaf row built at mount
      treeWrap.addEventListener('click', function (ev) {
        var row = ev.target.closest ? ev.target.closest('.mdrow[data-id]') : null;
        if (!row) return;
        select(row.getAttribute('data-id'), row.getAttribute('data-label') || row.getAttribute('data-id'));
      });

      // ---- (4) point / tag registry -------------------------------------
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

      // ---- (5) equipment registry ---------------------------------------
      var eqP = U.panel('Equipment Registry — Process Tools', { cls: 'col-12', bodyCls: 'flush', meta: nTools + ' tools · SEMI E10' });
      equipTbl = U.table([
        { label: 'ID', key: 'id', tdCls: 'name' },
        { label: 'Name', key: 'name' },
        { label: 'Kind', key: 'kind' },
        { label: 'Area', key: 'area' },
        { label: 'E10 State', render: function (r) { return r.badge; } },
        { label: 'Base kW', render: function (r) { return r.kw; }, tdCls: 'num' }
      ], { maxH: '320px' });
      eqP._body.appendChild(equipTbl.node);
      grid.appendChild(eqP);

      root.appendChild(grid);

      // default selection: first process tool
      select(M.tools[0].id, M.tools[0].name);
    },

    update: function (frame) {
      fc++;

      // (4) refresh live point values every 8 frames against the current selection
      if (selPoints && fc % 8 === 0) {
        ptTbl.set(selPoints.map(function (pt) {
          return {
            tag: pt.tag, desc: pt.desc, unit: pt.unit || '', bus: pt.bus, addr: pt.addr,
            value: liveValue(pt, frame)
          };
        }));
      }

      // (5) equipment registry — E10 badges track the sim; throttle every 12 frames
      if (fc % 12 === 1) {
        equipTbl.set(M.tools.map(function (t) {
          var st = frame.toolStates[t.id] || 'Non-Scheduled';
          return {
            id: t.id, name: t.name, kind: t.kind, area: t.areaName,
            badge: U.stateBadge(st).outerHTML, kw: t.baseKW
          };
        }));
      }
    }
  });

  // ---- tree builder ----------------------------------------------------
  function buildTree(container, node, depth) {
    var isLeaf = !node.children || node.children.length === 0;
    var selectable = node.type === 'Equipment' || isLeaf; // equipment leaves are clickable
    var row = el('div', 'mdrow' + (selectable ? ' leaf' : ' branch') + ' t-' + node.type);
    row.style.paddingLeft = (10 + depth * 16) + 'px';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '7px';
    row.style.padding = '3px 8px 3px ' + (10 + depth * 16) + 'px';
    row.style.fontSize = 'var(--fs-2)';
    row.style.borderLeft = '2px solid transparent';

    var marker = el('span', 'mk');
    marker.style.fontFamily = 'var(--mono)';
    marker.style.width = '10px';
    marker.style.textAlign = 'center';
    marker.style.flex = '0 0 10px';
    if (selectable) {
      marker.textContent = '·';
      marker.style.color = 'var(--accent)';
    } else {
      marker.textContent = '▸';
      marker.style.color = 'var(--text-faint)';
      marker.style.fontSize = '8px';
    }
    row.appendChild(marker);

    var name = el('span');
    name.textContent = node.name;
    name.style.color = selectable ? 'var(--text-dim)' : 'var(--text)';
    if (!selectable) { name.style.fontWeight = '600'; }
    row.appendChild(name);

    var tag = el('span', 'dim');
    tag.style.marginLeft = 'auto';
    tag.style.fontFamily = 'var(--mono)';
    tag.style.fontSize = 'var(--fs-0)';
    tag.style.letterSpacing = '.04em';
    tag.textContent = selectable ? node.id : node.type.toUpperCase();
    row.appendChild(tag);

    if (selectable) {
      row.setAttribute('data-id', node.id);
      row.setAttribute('data-label', node.name);
      row.style.cursor = 'pointer';
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
    // highlight active row
    if (selectedId && rowById[selectedId]) deHighlight(rowById[selectedId]);
    selectedId = id;
    selLabel = label || id;
    if (rowById[selectedId]) highlight(rowById[selectedId]);

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

  function highlight(row) {
    row.style.background = 'linear-gradient(90deg, rgba(37,224,207,.12), transparent)';
    row.style.borderLeftColor = 'var(--accent)';
    row.firstChild.style.color = 'var(--accent)';
    row.firstChild.textContent = '◆';
  }
  function deHighlight(row) {
    row.style.background = '';
    row.style.borderLeftColor = 'transparent';
    row.firstChild.style.color = 'var(--accent)';
    row.firstChild.textContent = '·';
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
