/* bas-ems — Bulk/Specialty Gas & Exhaust / Abatement
 * Classic script -> registers module 'gas-exhaust' (group BAS)
 * Bulk gas yard (N2/O2/Ar/H2/CO2/He), specialty-gas cabinets, segregated
 * exhaust headers (general/heat/acid/solvent), wet scrubbers + thermal
 * oxidizers. Acid exhaust + abatement track Etch/Wet; solvent tracks Thin Film;
 * N2 demand tracks Diffusion via frame.load.n2Flow. All shimmer is jitter off
 * frame.tick -> deterministic and loop-identical.
 *
 * Visual upgrade: hero = abatement status wall (.status-card per scrubber/
 *   oxidizer with E10 state badge, inlet CFM, destruction eff) + big-read
 *   total exhaust CFM with acid/solvent/heat/general split KPI strip. Gas yard
 *   schematic gets a HUD frame. Bulk gas usage shown as glow-dot heat tiles.
 *   Balance tables (bulk yard, exhaust headers, cabinets) preserved.
 *
 * Determinism: cabinet/abatement states derive from frame.areaStates +
 *   P.rand(channel, frame.tick). No Math.random, no wall-clock. Loop-identical.
 */
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el, M = BAS.master, P = BAS.prng;
  var T = (BAS.i18n && BAS.i18n.t) ? BAS.i18n.t : function (s) { return s; };

  // ---- hero refs (filled at mount; mutated, never reallocated) -----------
  var heroRead, heroSub, hk = {};            // big-read CFM + sub + KPI value spans
  // abatement status-wall card refs
  var abateCards = [];
  // bulk gas heat tiles
  var gasTiles = [];
  // tables
  var bulkTbl, exHdrTbl, cabTbl;
  // trend chips + sparklines
  var spAcid, spAbate, spN2, chips = {};
  // gas yard schematic
  var gasYardSch;
  var fc = 0;

  // ---- static per-asset character (deterministic, doesn't shimmer) -------
  var GASES = {
    N2:  { name: 'Bulk Nitrogen', hdr: 8.0, purity: 99.9995, dew: -78, flowFrac: 1.00, tank: 86 },
    O2:  { name: 'Bulk Oxygen',   hdr: 7.2, purity: 99.999,  dew: -76, flowFrac: 0.085, tank: 71 },
    Ar:  { name: 'Bulk Argon',    hdr: 9.0, purity: 99.9995, dew: -80, flowFrac: 0.13, tank: 64 },
    H2:  { name: 'Bulk Hydrogen', hdr: 5.0, purity: 99.9999, dew: -74, flowFrac: 0.045, tank: 58 },
    CO2: { name: 'Bulk CO2',      hdr: 6.5, purity: 99.995,  dew: -72, flowFrac: 0.022, tank: 49 },
    He:  { name: 'Bulk Helium',   hdr: 10.0, purity: 99.999, dew: -82, flowFrac: 0.018, tank: 41 }
  };
  var GAS_ORDER = ['N2', 'O2', 'Ar', 'H2', 'CO2', 'He'];

  // Specialty gases assigned to the 10 cabinets (fab-realistic process gases).
  var CABINET_GAS = ['SiH4', 'NH3', 'WF6', 'BCl3', 'Cl2', 'HBr', 'NF3', 'SiH4', 'Cl2', 'NF3'];
  var CAB_HAZ = { SiH4: 'pyro', NH3: 'tox', WF6: 'tox', BCl3: 'corr', Cl2: 'tox', HBr: 'corr', NF3: 'tox' };

  // Exhaust header definitions -> which frame.load channel feeds flow.
  var EX_HEADERS = [
    { key: 'General',  chan: 'exGenCFM',  dp: 360, seg: 'general' },
    { key: 'Heat',     chan: 'exHeatCFM', dp: 410, seg: 'heat' },
    { key: 'Acid',     chan: 'exAcidCFM', dp: 480, seg: 'acid' },
    { key: 'Solvent',  chan: 'exSolCFM',  dp: 520, seg: 'solvent' }
  ];

  // Map each cabinet index (0-9) to its process area (for production coupling).
  var CABINET_AREA = ['ETCH', 'DIFF', 'THIN', 'ETCH', 'ETCH', 'ETCH', 'ETCH', 'ETCH', 'ETCH', 'ETCH'];

  // Deterministic production-coupled cabinet state. Returns Online|Purge|Standby.
  function cabinetState(cabId, areaId, frame) {
    var as = frame.areaStates[areaId];
    var prodFrac = (as && as.total > 0) ? (as.Productive / as.total) : 0.5;
    var rv = P.rand('gh:cabst:' + cabId, frame.tick);
    var onlineThr = 0.55 + prodFrac * 0.40;
    var purgeThr  = onlineThr + 0.08;
    if (rv < onlineThr)  return 'Online';
    if (rv < purgeThr)   return 'Purge';
    return 'Standby';
  }

  // Gas yard schematic layout (viewBox 520 x 230). Bulk tanks are identity boxes;
  // live distribution flow is shown on the header node (n2Flow).
  var GY_NODES = [
    { id: 'n2',    label: T('N2 Bulk'),  x: 60,  y: 40,  channel: false },
    { id: 'o2',    label: T('O2 Bulk'),  x: 60,  y: 90,  channel: false },
    { id: 'ar',    label: T('Ar Bulk'),  x: 60,  y: 140, channel: false },
    { id: 'h2',    label: T('H2 Bulk'),  x: 60,  y: 190, channel: false },
    { id: 'hdr',   label: T('Gas Hdr'), x: 220, y: 100, channel: 'n2Flow' },
    { id: 'scrb',  label: T('Scrubber'), x: 380, y: 70,  channel: 'exAcidCFM' },
    { id: 'tox',   label: T('Oxidizer'), x: 380, y: 155, channel: 'exAcidCFM' }
  ];
  var GY_PIPES = [
    { from: 'n2',  to: 'hdr', channel: 'n2Flow' },
    { from: 'o2',  to: 'hdr', channel: 'n2Flow' },
    { from: 'ar',  to: 'hdr', channel: 'n2Flow' },
    { from: 'h2',  to: 'hdr', channel: 'n2Flow' },
    { from: 'hdr', to: 'scrb', channel: 'exAcidCFM' },
    { from: 'hdr', to: 'tox',  channel: 'exAcidCFM' }
  ];

  BAS.registerModule({
    id: 'gas-exhaust', title: 'Gas & Exhaust', group: 'BAS', order: 4, icon: 'gas',
    mount: function (root) {
      var head = el('div', 'view-head');
      head.innerHTML = '<h1>' + T('Bulk Gas & Exhaust / Abatement') + '</h1>' +
        '<span class="crumb">FAB-1 · N2/H2/Ar · ' + T('Scrubbers · Thermal Oxidizers') + '</span>' +
        '<span class="right">' + T('acid exhaust & abatement track Etch / Wet') + ' &#8595;</span>';
      root.appendChild(head);

      var grid = el('div', 'grid');

      // ====================================================================
      // (1) HERO — total exhaust big-read + acid/solvent/heat/general split
      // ====================================================================
      var heroP = U.panel('Exhaust & Abatement', { cls: 'col-12 hud', pill: 'LIVE' });
      var hero = el('div', 'pg-hero');

      var sig = el('div', 'pg-hero-sig');
      sig.appendChild(el('div', 'pg-hero-label', T('TOTAL EXHAUST')));
      heroRead = el('div', 'pg-hero-read');
      var rn = el('span'); heroRead.appendChild(rn);
      heroRead.appendChild(el('span', 'u', 'kCFM'));
      heroRead._num = rn;
      sig.appendChild(heroRead);
      heroSub = el('div', 'pg-hero-sub'); heroSub.textContent = '—';
      sig.appendChild(heroSub);
      hero.appendChild(sig);

      var kpis = el('div', 'pg-hero-kpis');
      // acid/solvent/heat/general split + abatement load + avg destruction eff
      [['acid', 'Acid', 'kCFM', 'warn'], ['solvent', 'Solvent', 'kCFM', ''],
       ['heat', 'Heat', 'kCFM', ''], ['general', 'General', 'kCFM', ''],
       ['abate', 'Abatement', 'kW', 'accent'], ['eff', 'Destruction', '%', 'good']
      ].forEach(function (k) {
        var box = el('div', 'pg-hk' + (k[3] ? ' ' + k[3] : ''));
        box.appendChild(el('div', 'lab', T(k[1])));
        var v = el('div', 'v');
        var vn = el('span'); v.appendChild(vn);
        v.appendChild(el('span', 'u', k[2]));
        v._num = vn;
        box.appendChild(v);
        kpis.appendChild(box);
        hk[k[0]] = v;
      });
      hero.appendChild(kpis);
      heroP._body.appendChild(hero);
      grid.appendChild(heroP);

      // ====================================================================
      // (2) ABATEMENT STATUS WALL — .status-card per scrubber + oxidizer
      // ====================================================================
      var wallP = U.panel('Abatement Status Wall — Wet Scrubbers + Thermal Oxidizers',
        { cls: 'col-12', meta: 'EXHAUST · ' + T('destruction') + ' eff %', metaId: 'gx-wallmeta' });
      var wall = el('div', 'gx-wall');
      // 4 scrubbers then 2 oxidizers
      M.facility.scrubbers.forEach(function (s, i) { wall.appendChild(buildAbateCard('scrub', s, i)); });
      M.facility.oxidizers.forEach(function (o, i) { wall.appendChild(buildAbateCard('ox', o, i)); });
      wallP._body.appendChild(wall);
      grid.appendChild(wallP);

      // ====================================================================
      // (3) GAS YARD SCHEMATIC (HUD frame)
      // ====================================================================
      var schP = U.panel('Gas Yard — Bulk Storage → Distribution → Exhaust Treatment',
        { cls: 'col-7 hud', bodyCls: 'flush', meta: 'GAS \xb7 BACnet', metaId: 'gh-schmeta' });
      gasYardSch = U.Schematic(schP._body, {
        nodes: GY_NODES, pipes: GY_PIPES, width: 520, height: 230, fontScale: 0.8
      });
      grid.appendChild(schP);

      // ====================================================================
      // (4) BULK GAS USAGE — glow-dot heat tiles (one per bulk gas)
      // ====================================================================
      var usageP = U.panel('Bulk Gas Distribution — Live Flow', { cls: 'col-5', meta: 'Nm³/h · ' + T('header pressure'), metaId: 'gx-usemeta' });
      var hg = el('div', 'heat-grid');
      GAS_ORDER.forEach(function (sym) {
        var g = GASES[sym];
        var tile = el('div', 'heat-tile ok');
        var glow = el('i', 'glow');
        tile.appendChild(glow);
        tile.appendChild(el('div', 'lab', sym));
        var v = el('div', 'v'); v.textContent = '—';
        tile.appendChild(v);
        var sub = el('div', 'gx-tile-sub'); sub.textContent = g.hdr.toFixed(1) + ' bar';
        tile.appendChild(sub);
        hg.appendChild(tile);
        gasTiles.push({ sym: sym, g: g, glow: glow, v: v, sub: sub, lastV: -1 });
      });
      usageP._body.appendChild(hg);
      grid.appendChild(usageP);

      // ====================================================================
      // (5) BULK GAS YARD TABLE
      // ====================================================================
      var bulkP = U.panel('Bulk Gas Yard — Headers & Storage', { cls: 'col-6', bodyCls: 'flush', meta: 'GAS · BACnet', metaId: 'gh-bulkmeta' });
      bulkTbl = U.table([
        { label: 'Gas', key: 'gas', tdCls: 'name' },
        { label: 'Header bar', key: 'hdr', tdCls: 'num' },
        { label: 'Flow Nm3/h', key: 'flow', tdCls: 'num' },
        { label: 'Tank %', render: function (r) { return meterCell(r.tank, r.tankCls, r.tank.toFixed(0) + '%'); } },
        { label: 'Purity %', key: 'purity', tdCls: 'num' },
        { label: 'Dewpt °C', render: function (r) { return '<span class="num">' + r.dew + '</span>'; }, tdCls: 'num' }
      ], { maxH: '252px' });
      bulkP._body.appendChild(bulkTbl.node);
      grid.appendChild(bulkP);

      // ====================================================================
      // (6) EXHAUST HEADERS — segregated balance table
      // ====================================================================
      var exP = U.panel('Segregated Exhaust Headers — Flow Balance', { cls: 'col-6', meta: T('General').toLowerCase() + ' / ' + T('Heat').toLowerCase() + ' / ' + T('Acid').toLowerCase() + ' / ' + T('Solvent').toLowerCase(), metaId: 'gh-exmeta' });
      exHdrTbl = U.table([
        { label: 'Header', key: 'hdr', tdCls: 'name' },
        { label: 'Flow CFM', key: 'flow', tdCls: 'num' },
        { label: 'Share', render: function (r) { return '<span class="td-meter ' + r.shareCls + '"><i style="width:' + r.sharePct + '%"></i></span>'; } },
        { label: 'dP Pa', key: 'dp', tdCls: 'num' },
        { label: 'Status', render: function (r) { return U.stateBadge(r.state).outerHTML; } }
      ]);
      exP._body.appendChild(exHdrTbl.node);
      grid.appendChild(exP);

      // ====================================================================
      // (7) SPECIALTY GAS CABINETS
      // ====================================================================
      var cabP = U.panel('Specialty Gas Cabinets — Process Gas Distribution', { cls: 'col-12', bodyCls: 'flush', meta: '', metaId: 'gh-cabmeta' });
      cabTbl = U.table([
        { label: 'Cabinet', key: 'name', tdCls: 'name' },
        { label: 'Gas', render: function (r) { return '<span class="mono">' + r.gas + '</span>'; } },
        { label: 'Hazard', render: function (r) { return r.haz; } },
        { label: 'Status', render: function (r) { return U.stateBadge(r.state).outerHTML; } },
        { label: 'Header mTorr', key: 'mtorr', tdCls: 'num' },
        { label: 'Cylinder %', render: function (r) { return meterCell(r.cyl, r.cylCls, r.cyl.toFixed(0) + '%'); } },
        { label: 'Purge N2 sccm', key: 'purge', tdCls: 'num' }
      ], { maxH: '320px' });
      cabP._body.appendChild(cabTbl.node);
      grid.appendChild(cabP);

      // ====================================================================
      // (8) TRENDS — chip headers + sparklines
      // ====================================================================
      spAcid = makeSpark(grid, 'Acid Exhaust Header', 'CFM', U.cssVar('--warn'), 'acid');
      spAbate = makeSpark(grid, 'Abatement Load', 'kW', U.cssVar('--accent'), 'abate');
      spN2 = makeSpark(grid, 'N2 Bulk Demand', 'Nm3/h', U.cssVar('--accent-2'), 'n2');

      root.appendChild(grid);
    },

    update: function (frame) {
      fc++;
      var L = frame.load, tk = frame.tick;

      // ---- sensor-shimmered facility channels ---------------------------
      var n2 = L.n2Flow + U.jitter('gh:n2', tk, 90);
      var exGen = L.exGenCFM + U.jitter('gh:exg', tk, 1400);
      var exHeat = L.exHeatCFM + U.jitter('gh:exh', tk, 700);
      var exAcid = L.exAcidCFM + U.jitter('gh:exa', tk, 900);
      var exSol = L.exSolCFM + U.jitter('gh:exs', tk, 650);
      var totalCFM = exGen + exHeat + exAcid + exSol;
      var abate = L.abateKW + U.jitter('gh:abk', tk, 4);

      // Destruction efficiency: ~99.3% baseline, eases down as acid load climbs.
      var acidLoadFrac = clamp((exAcid - 86000) / 18000, 0, 1);
      var avgEff = 99.35 - acidLoadFrac * 0.22 + U.jitter('gh:eff', tk, 0.04);

      // ---- Gas yard schematic (Schematic throttles internally) ----------
      gasYardSch.update(frame);

      // ---- HERO (every frame — cheap text writes, change-gated by widget-free guards)
      heroRead._num.textContent = (totalCFM / 1000).toFixed(1);
      heroSub.textContent = Math.round(totalCFM / 1000) + ' kCFM ' + T('moved') + ' · ' + avgEff.toFixed(2) + '% ' + T('avg destruction');
      hk.acid._num.textContent = (exAcid / 1000).toFixed(1);
      hk.solvent._num.textContent = (exSol / 1000).toFixed(1);
      hk.heat._num.textContent = (exHeat / 1000).toFixed(1);
      hk.general._num.textContent = (exGen / 1000).toFixed(1);
      hk.abate._num.textContent = Math.round(abate);
      hk.eff._num.textContent = avgEff.toFixed(2);

      // ---- sparklines: push + render every frame ------------------------
      spAcid.push(exAcid); spAcid.render();
      spAbate.push(abate); spAbate.render();
      spN2.push(n2); spN2.render();

      // ---- abatement status wall (throttle every 8) ---------------------
      if (fc % 8 === 0) {
        // scrubbers: destruction eff + blower kW couple to acid load
        for (var si = 0; si < abateCards.length; si++) {
          var c = abateCards[si];
          if (c.kind === 'scrub') {
            var eff = 99.4 - acidLoadFrac * 0.25 + U.jitter('gh:scef:' + c.id, tk, 0.05) - c.idx * 0.03;
            var kw = 95 + acidLoadFrac * 30 + c.idx * 8 + U.jitter('gh:sckw:' + c.id, tk, 1.5);
            var ph = 7.0 + U.jitter('gh:scph:' + c.id, tk, 0.18);
            var recirc = 420 + c.idx * 25 + U.jitter('gh:scrc:' + c.id, tk, 6);
            var inlet = (exAcid * (0.27 + c.idx * 0.01)) + U.jitter('gh:scin:' + c.id, tk, 400);
            // health: pH drifting acidic or eff sagging -> warn/bad
            var st = (ph < 6.4 || eff < 99.0) ? 'bad' : (ph < 6.8 || eff < 99.15) ? 'warn' : 'ok';
            setAbateCard(c, st, eff.toFixed(2), [
              [T('Inlet'), U.group(Math.round(inlet)) + ' CFM'],
              [T('Blower'), Math.round(kw) + ' kW'],
              [T('Liquor pH'), ph.toFixed(2)],
              [T('Recirc'), Math.round(recirc) + ' L/m']
            ]);
          } else {
            var oeff = 99.6 - acidLoadFrac * 0.12 + U.jitter('gh:oxef:' + c.id, tk, 0.03) - c.idx * 0.04;
            var stack = 760 + U.jitter('gh:oxst:' + c.id, tk, 6) + c.idx * 4;
            var fuel = 38 + acidLoadFrac * 10 + c.idx * 3 + U.jitter('gh:oxfu:' + c.id, tk, 0.8);
            var oin = (exSol * (0.5 + c.idx * 0.02)) + U.jitter('gh:oxin:' + c.id, tk, 350);
            var ost = (stack < 740 || oeff < 99.3) ? 'warn' : 'ok';
            setAbateCard(c, ost, oeff.toFixed(2), [
              [T('Inlet'), U.group(Math.round(oin)) + ' CFM'],
              [T('Stack'), Math.round(stack) + ' °C'],
              [T('Fuel'), fuel.toFixed(1) + ' Nm³/h'],
              [T('Type'), T('VOC / pyro')]
            ]);
          }
        }

        // ---- bulk gas usage heat tiles --------------------------------
        for (var gi = 0; gi < gasTiles.length; gi++) {
          var gt = gasTiles[gi];
          var flow = gt.sym === 'N2' ? n2 : (n2 * gt.g.flowFrac + U.jitter('gh:bf:' + gt.sym, tk, n2 * gt.g.flowFrac * 0.012));
          var hdr = gt.g.hdr + U.jitter('gh:bh:' + gt.sym, tk, 0.06);
          var rf = Math.round(flow);
          if (rf !== gt.lastV) {
            gt.lastV = rf;
            gt.v.textContent = U.group(rf);
            gt.sub.textContent = hdr.toFixed(1) + ' bar';
            // glow intensity from share of N2 (the dominant flow); cap 0.55
            var inten = clamp(0.10 + (flow / n2) * 0.5, 0.10, 0.55);
            gt.glow.style.opacity = inten.toFixed(2);
          }
        }

        // ---- bulk gas yard table --------------------------------------
        bulkTbl.set(GAS_ORDER.map(function (sym) {
          var g = GASES[sym];
          var flow = sym === 'N2' ? n2 : (n2 * g.flowFrac + U.jitter('gh:bf:' + sym, tk, n2 * g.flowFrac * 0.012));
          var hdr = g.hdr + U.jitter('gh:bh:' + sym, tk, 0.06);
          var tank = g.tank + U.jitter('gh:bt:' + sym, tk, 0.4);
          var dew = (g.dew + U.jitter('gh:bd:' + sym, tk, 0.6)).toFixed(1);
          return {
            gas: T(g.name) + ' (' + sym + ')',
            hdr: hdr.toFixed(2),
            flow: U.group(Math.round(flow)),
            tank: tank, tankCls: U.band(tank, 35, 25, true),
            purity: g.purity.toFixed(g.purity >= 99.9999 ? 4 : 3),
            dew: dew
          };
        }));

        // ---- exhaust headers (with share meter) -----------------------
        var hdrFlows = EX_HEADERS.map(function (h) { return (frame.load[h.chan] || 0) + U.jitter('gh:ehf:' + h.key, tk, 600); });
        var maxF = Math.max.apply(null, hdrFlows);
        exHdrTbl.set(EX_HEADERS.map(function (h, hi) {
          var f = hdrFlows[hi];
          var dp = h.dp + U.jitter('gh:ehd:' + h.key, tk, 6);
          var st = dp > h.dp + 90 ? 'Standby' : 'Productive';
          var sharePct = clamp(f / maxF * 100, 2, 100);
          var shareCls = h.seg === 'acid' ? 'warn' : h.seg === 'solvent' ? 'bad' : 'good';
          return {
            hdr: T(h.key) + ' (' + T(h.seg) + ')', flow: U.group(Math.round(f)),
            sharePct: sharePct.toFixed(0), shareCls: shareCls,
            dp: Math.round(dp), state: st
          };
        }));

        // ---- specialty gas cabinets -----------------------------------
        cabTbl.set(M.facility.gasCabinets.map(function (cc, i) {
          var gas = CABINET_GAS[i % CABINET_GAS.length];
          var area = CABINET_AREA[i % CABINET_AREA.length];
          var state = cabinetState(cc.id, area, frame);
          var cyl = clamp(20 + P.rand('gh:cyl:' + cc.id, 0) * 70 + U.jitter('gh:cylj:' + cc.id, tk, 0.3), 4, 99);
          var mtorr = state === 'Online' ? Math.round(760 + U.jitter('gh:cmt:' + cc.id, tk, 8)) : 0;
          var purge = state === 'Purge' ? Math.round(2000 + U.jitter('gh:cpg:' + cc.id, tk, 40))
            : Math.round(120 + U.jitter('gh:cpgi:' + cc.id, tk, 8));
          return {
            name: T('Gas Cabinet') + ' ' + (i + 1),
            gas: gas,
            haz: hazTag(CAB_HAZ[gas]),
            state: stateBadgeName(state),
            mtorr: mtorr ? U.group(mtorr) : '—',
            cyl: cyl, cylCls: U.band(cyl, 25, 15, true),
            purge: U.group(purge)
          };
        }));
      }

      // ---- trend chips (throttle every 16) ------------------------------
      if (fc % 16 === 0) {
        setChip(chips.acid, exAcid / 1000, 1);
        setChip(chips.abate, abate, 0);
        setChip(chips.n2, n2 / 1000, 2);
      }
    }
  });

  // ---- abatement status-card builder ------------------------------------
  function buildAbateCard(kind, asset, idx) {
    var card = el('div', 'status-card ok');
    var headRow = el('div', 'sc-head');
    headRow.appendChild(el('div', 'sc-name', T(asset.name)));
    var badgeSlot = el('span', 'gx-badge-slot');
    badgeSlot.appendChild(U.stateBadge('Productive'));
    headRow.appendChild(badgeSlot);
    card.appendChild(headRow);

    // destruction-efficiency big read
    var effRow = el('div', 'gx-eff');
    var en = el('span', 'gx-eff-v', '—');
    effRow.appendChild(en);
    effRow.appendChild(el('span', 'gx-eff-u', T('% destruction')));
    card.appendChild(effRow);

    var stats = el('div', 'sc-stats');
    var statRefs = [];
    for (var i = 0; i < 4; i++) {
      var sline = el('div', 'sc-stat');
      var k = el('span', 'k', '');
      var val = el('span', 'val', '—');
      sline.appendChild(k); sline.appendChild(val);
      stats.appendChild(sline);
      statRefs.push({ k: k, val: val });
    }
    card.appendChild(stats);

    var ref = {
      kind: kind, id: asset.id, idx: idx, card: card,
      badgeSlot: badgeSlot, effV: en, stats: statRefs,
      lastState: 'ok', lastEff: ''
    };
    abateCards.push(ref);
    return card;
  }

  // ---- abatement card writer (change-gated) -----------------------------
  function setAbateCard(c, healthState, effTxt, rows) {
    if (healthState !== c.lastState) {
      c.lastState = healthState;
      c.card.className = 'status-card ' + healthState;
      // refresh state badge: ok -> Productive, warn -> Engineering, bad -> Unscheduled Down
      var badgeName = healthState === 'ok' ? 'Productive' : healthState === 'warn' ? 'Engineering' : 'Unscheduled Down';
      U.clear(c.badgeSlot);
      c.badgeSlot.appendChild(U.stateBadge(badgeName));
    }
    if (effTxt !== c.lastEff) { c.lastEff = effTxt; c.effV.textContent = effTxt; }
    for (var i = 0; i < rows.length && i < c.stats.length; i++) {
      var s = c.stats[i];
      if (s.k.textContent !== rows[i][0]) s.k.textContent = rows[i][0];
      if (s.val.textContent !== rows[i][1]) s.val.textContent = rows[i][1];
    }
  }

  // ---- helpers -----------------------------------------------------------
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function meterCell(pct, cls, label) {
    pct = clamp(pct, 0, 100);
    return '<div style="display:flex;align-items:center;gap:7px">' +
      '<div class="meter ' + (cls || 'good') + '" style="flex:1;min-width:46px"><i style="width:' + pct.toFixed(0) + '%"></i></div>' +
      '<span class="num" style="min-width:34px;text-align:right">' + label + '</span></div>';
  }

  function hazTag(h) {
    var map = { pyro: ['PYRO', 'crit'], tox: ['TOXIC', 'bad'], corr: ['CORR', 'warn'] };
    var m = map[h] || ['INERT', 'text-mut'];
    return '<span class="mono" style="font-size:var(--fs-0);color:var(--' + m[1] + ')">' + m[0] + '</span>';
  }

  // Map cabinet status words to E10-flavored badge classes already in the CSS.
  function stateBadgeName(state) {
    if (state === 'Online') return 'Productive';
    if (state === 'Purge') return 'Engineering';
    return 'Standby';
  }

  // min/avg/max readout chips for a trend header.
  function setChip(c, v, dp) {
    if (v < c.min) c.min = v;
    if (v > c.max) c.max = v;
    c.minEl.textContent = c.min.toFixed(dp);
    c.maxEl.textContent = c.max.toFixed(dp);
    c.nowEl.textContent = v.toFixed(dp);
  }

  function makeSpark(grid, title, unit, color, chipKey) {
    var p = U.panel(title, { cls: 'col-4', meta: unit, metaId: '' });
    var row = el('div', 'chip-row gx-chip-row');
    var nowChip = el('div', 'chip accent'); nowChip.innerHTML = '<span class="k">NOW</span><span class="v">—</span>';
    var minChip = el('div', 'chip'); minChip.innerHTML = '<span class="k">MIN</span><span class="v">—</span>';
    var maxChip = el('div', 'chip'); maxChip.innerHTML = '<span class="k">MAX</span><span class="v">—</span>';
    row.appendChild(nowChip); row.appendChild(minChip); row.appendChild(maxChip);
    p._body.appendChild(row);
    var c = el('canvas', 'spark'); c.style.height = '78px'; c.style.width = '100%';
    p._body.appendChild(c);
    grid.appendChild(p);
    chips[chipKey] = {
      min: Infinity, max: -Infinity,
      nowEl: nowChip.querySelector('.v'), minEl: minChip.querySelector('.v'), maxEl: maxChip.querySelector('.v')
    };
    return U.Sparkline(c, { height: 78, color: color, fill: true });
  }
})(window.BAS);
