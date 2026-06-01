/* bas-ems — Bulk/Specialty Gas & Exhaust / Abatement
 * Classic script -> registers module 'gas-exhaust' (group BAS)
 * Bulk gas yard (N2/O2/Ar/H2/CO2/He), specialty-gas cabinets, segregated
 * exhaust headers (general/heat/acid/solvent), wet scrubbers + thermal
 * oxidizers. Acid exhaust + abatement track Etch/Wet; solvent tracks Thin Film;
 * N2 demand tracks Diffusion via frame.load.n2Flow. All shimmer is jitter off
 * frame.tick -> deterministic and loop-identical.
 *
 * Part A: Gas yard SVG schematic (bulk tanks -> headers -> scrubbers/oxidizers).
 * Part B: Production-coupled cabinet states — state derives deterministically
 *   from frame.areaStates[area].Productive/total + P.rand(channel, frame.tick).
 *   No Math.random, no wall-clock. Loop-identical at every t.
 */
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el, M = BAS.master, P = BAS.prng;

  // KPI tiles
  var kN2, kEx, kAbate, kEff;
  // tables
  var bulkTbl, exHdrTbl, scrubTbl, oxTbl, cabTbl;
  // sparklines + their canvases
  var spAcid, spAbate, spN2;
  // gas yard schematic
  var gasYardSch;
  var fc = 0;

  // ---- static per-asset character (deterministic, doesn't shimmer) -------
  // Bulk gas yard config: header setpoint (bar), purity grade, dewpoint base,
  // and a fraction of N2 flow used to derive each gas's flow plausibly.
  var GASES = {
    N2:  { name: 'Bulk Nitrogen', hdr: 8.0, purity: 99.9995, dew: -78, flowFrac: 1.00, tank: 86 },
    O2:  { name: 'Bulk Oxygen',   hdr: 7.2, purity: 99.999,  dew: -76, flowFrac: 0.085, tank: 71 },
    Ar:  { name: 'Bulk Argon',    hdr: 9.0, purity: 99.9995, dew: -80, flowFrac: 0.13, tank: 64 },
    H2:  { name: 'Bulk Hydrogen', hdr: 5.0, purity: 99.9999, dew: -74, flowFrac: 0.045, tank: 58 },
    CO2: { name: 'Bulk CO2',      hdr: 6.5, purity: 99.995,  dew: -72, flowFrac: 0.022, tank: 49 },
    He:  { name: 'Bulk Helium',   hdr: 10.0, purity: 99.999, dew: -82, flowFrac: 0.018, tank: 41 }
  };

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
  // SiH4/BCl3/Cl2/HBr/NF3 are Etch gases; NH3 is Diffusion; WF6 is Thin Film.
  var CABINET_AREA = ['ETCH', 'DIFF', 'THIN', 'ETCH', 'ETCH', 'ETCH', 'ETCH', 'ETCH', 'ETCH', 'ETCH'];

  // Deterministic production-coupled cabinet state.
  // Derives state from area's productive fraction + per-cabinet hash of frame.tick.
  // High productive fraction -> higher probability of Online; no randomness.
  // Returns 'Online' | 'Purge' | 'Standby'.
  function cabinetState(cabId, areaId, frame) {
    var as = frame.areaStates[areaId];
    var prodFrac = (as && as.total > 0) ? (as.Productive / as.total) : 0.5;
    // Per-cabinet, per-tick deterministic value [0,1)
    var rv = P.rand('gh:cabst:' + cabId, frame.tick);
    // Online threshold scales from ~55% at 0% productive to ~95% at 100% productive
    var onlineThr = 0.55 + prodFrac * 0.40;
    // Purge band is a narrow slice just above the Online threshold
    var purgeThr  = onlineThr + 0.08;
    if (rv < onlineThr)  return 'Online';
    if (rv < purgeThr)   return 'Purge';
    return 'Standby';
  }

  // Gas yard schematic layout: bulk tanks -> main N2 header -> scrubbers/oxidizers.
  // Coordinates (viewBox 520 x 230). Bulk tanks are identity boxes (no per-gas flow
  // telemetry exists); live flow is aggregated on the header node (n2Flow).
  var GY_NODES = [
    // Bulk tanks (left column) — identity boxes (channel:false → no value); no per-gas
    // flow telemetry exists, so the aggregate distribution flow is shown on the header only.
    { id: 'n2',    label: 'N2 Bulk',  x: 60,  y: 40,  channel: false },
    { id: 'o2',    label: 'O2 Bulk',  x: 60,  y: 90,  channel: false },
    { id: 'ar',    label: 'Ar Bulk',  x: 60,  y: 140, channel: false },
    { id: 'h2',    label: 'H2 Bulk',  x: 60,  y: 190, channel: false },
    // Main distribution header (centre)
    { id: 'hdr',   label: 'Gas Hdr',  x: 220, y: 100, channel: 'n2Flow' },
    // Exhaust treatment (right column)
    { id: 'scrb',  label: 'Scrubber', x: 380, y: 70,  channel: 'exAcidCFM' },
    { id: 'tox',   label: 'Oxidizer', x: 380, y: 155, channel: 'exAcidCFM' }
  ];
  var GY_PIPES = [
    // Bulk tanks -> main header (flow proportional to n2Flow)
    { from: 'n2',  to: 'hdr', channel: 'n2Flow' },
    { from: 'o2',  to: 'hdr', channel: 'n2Flow' },
    { from: 'ar',  to: 'hdr', channel: 'n2Flow' },
    { from: 'h2',  to: 'hdr', channel: 'n2Flow' },
    // Header -> exhaust treatment (flow proportional to exAcidCFM)
    { from: 'hdr', to: 'scrb', channel: 'exAcidCFM' },
    { from: 'hdr', to: 'tox',  channel: 'exAcidCFM' }
  ];

  BAS.registerModule({
    id: 'gas-exhaust', title: 'Gas & Exhaust', group: 'BAS', order: 4, icon: 'gas',
    mount: function (root) {
      var head = el('div', 'view-head');
      head.innerHTML = '<h1>Bulk Gas &amp; Exhaust / Abatement</h1>' +
        '<span class="crumb">FAB-1 · N2/H2/Ar · Scrubbers · Thermal Oxidizers</span>' +
        '<span class="right">acid exhaust &amp; abatement track Etch / Wet &#8595;</span>';
      root.appendChild(head);

      var grid = el('div', 'grid');

      // ---- (1) Gas Yard Schematic ----------------------------------------
      // Bulk storage -> Distribution Headers -> Exhaust Treatment
      var schP = U.panel('Gas Yard — Bulk Storage → Distribution → Exhaust Treatment',
        { cls: 'col-12', bodyCls: 'flush', meta: 'GAS \xb7 BACnet', metaId: 'gh-schmeta' });
      gasYardSch = U.Schematic(schP._body, {
        nodes: GY_NODES,
        pipes: GY_PIPES,
        width: 520, height: 230
      });
      grid.appendChild(schP);

      // ---- (2) Top KPI strip --------------------------------------------
      var kpiP = U.panel('Gas & Abatement Overview', { cls: 'col-12', bodyCls: 'tight' });
      var krow = el('div', 'kpi-row');
      kN2 = U.kpi({ label: 'N2 Demand', unit: 'Nm3/h', accent: true });
      kEx = U.kpi({ label: 'Total Exhaust', unit: 'kCFM' });
      kAbate = U.kpi({ label: 'Abatement Load', unit: 'kW' });
      kEff = U.kpi({ label: 'Avg Destruction Eff', unit: '%' });
      [kN2, kEx, kAbate, kEff].forEach(function (k) { krow.appendChild(k.node); });
      kpiP._body.appendChild(krow);
      grid.appendChild(kpiP);

      // ---- (3) Bulk Gas Yard --------------------------------------------
      var bulkP = U.panel('Bulk Gas Yard — Headers & Storage', { cls: 'col-6', bodyCls: 'flush', meta: 'GAS · BACnet', metaId: 'gh-bulkmeta' });
      bulkTbl = U.table([
        { label: 'Gas', key: 'gas', tdCls: 'name' },
        { label: 'Header bar', key: 'hdr', tdCls: 'num' },
        { label: 'Flow Nm3/h', key: 'flow', tdCls: 'num' },
        { label: 'Tank %', render: function (r) { return meter(r.tank, r.tankCls, r.tank.toFixed(0) + '%'); } },
        { label: 'Purity %', key: 'purity', tdCls: 'num' },
        { label: 'Dewpt °C', render: function (r) { return '<span class="num">' + r.dew + '</span>'; }, tdCls: 'num' }
      ], { maxH: '252px' });
      bulkP._body.appendChild(bulkTbl.node);
      grid.appendChild(bulkP);

      // ---- (4) Exhaust & Abatement --------------------------------------
      var exP = U.panel('Exhaust & Abatement — Segregated Headers', { cls: 'col-6', bodyCls: 'tight', meta: '', metaId: 'gh-exmeta' });

      var lblHdr = el('div', 'dim'); lblHdr.style.cssText = 'font-size:var(--fs-1);text-transform:uppercase;letter-spacing:.06em;margin:0 0 4px';
      lblHdr.textContent = 'Exhaust Headers (general / heat / acid / solvent)';
      exP._body.appendChild(lblHdr);
      exHdrTbl = U.table([
        { label: 'Header', key: 'hdr', tdCls: 'name' },
        { label: 'Flow CFM', key: 'flow', tdCls: 'num' },
        { label: 'dP Pa', key: 'dp', tdCls: 'num' },
        { label: 'Status', render: function (r) { return U.stateBadge(r.state).outerHTML; } }
      ]);
      exP._body.appendChild(exHdrTbl.node);

      var lblScr = el('div', 'dim'); lblScr.style.cssText = 'font-size:var(--fs-1);text-transform:uppercase;letter-spacing:.06em;margin:12px 0 4px';
      lblScr.textContent = 'Wet Scrubbers — acid/corrosive abatement';
      exP._body.appendChild(lblScr);
      scrubTbl = U.table([
        { label: 'Scrubber', key: 'name', tdCls: 'name' },
        { label: 'Destr %', render: function (r) { return '<span class="num">' + r.eff + '</span>'; }, tdCls: 'num' },
        { label: 'Blower kW', key: 'kw', tdCls: 'num' },
        { label: 'pH', render: function (r) { return phCell(r.ph); }, tdCls: 'num' },
        { label: 'Recirc L/m', key: 'recirc', tdCls: 'num' }
      ]);
      exP._body.appendChild(scrubTbl.node);

      var lblOx = el('div', 'dim'); lblOx.style.cssText = 'font-size:var(--fs-1);text-transform:uppercase;letter-spacing:.06em;margin:12px 0 4px';
      lblOx.textContent = 'Thermal Oxidizers — pyrophoric/VOC destruction';
      exP._body.appendChild(lblOx);
      oxTbl = U.table([
        { label: 'Oxidizer', key: 'name', tdCls: 'name' },
        { label: 'Stack °C', key: 'stack', tdCls: 'num' },
        { label: 'Destr %', render: function (r) { return '<span class="num">' + r.eff + '</span>'; }, tdCls: 'num' },
        { label: 'Fuel Nm3/h', key: 'fuel', tdCls: 'num' }
      ]);
      exP._body.appendChild(oxTbl.node);
      grid.appendChild(exP);

      // ---- (5) Specialty Gas Cabinets -----------------------------------
      var cabP = U.panel('Specialty Gas Cabinets — Process Gas Distribution', { cls: 'col-12', bodyCls: 'flush', meta: '', metaId: 'gh-cabmeta' });
      cabTbl = U.table([
        { label: 'Cabinet', key: 'name', tdCls: 'name' },
        { label: 'Gas', render: function (r) { return '<span class="mono">' + r.gas + '</span>'; } },
        { label: 'Hazard', render: function (r) { return r.haz; } },
        { label: 'Status', render: function (r) { return U.stateBadge(r.state).outerHTML; } },
        { label: 'Header mTorr', key: 'mtorr', tdCls: 'num' },
        { label: 'Cylinder %', render: function (r) { return meter(r.cyl, r.cylCls, r.cyl.toFixed(0) + '%'); } },
        { label: 'Purge N2 sccm', key: 'purge', tdCls: 'num' }
      ], { maxH: '320px' });
      cabP._body.appendChild(cabTbl.node);
      grid.appendChild(cabP);

      // ---- (6) Trends ---------------------------------------------------
      spAcid = makeSpark(grid, 'Acid Exhaust Header', 'CFM', U.cssVar('--warn'));
      spAbate = makeSpark(grid, 'Abatement Load', 'kW', U.cssVar('--accent'));
      spN2 = makeSpark(grid, 'N2 Bulk Demand', 'Nm3/h', U.cssVar('--accent-2'));

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

      // Destruction efficiency: ~99.2% baseline, eases down slightly as acid
      // load climbs (more challenging gas to abate), shimmered.
      var acidLoadFrac = clamp((exAcid - 86000) / 18000, 0, 1);   // 0..1 over the loop band
      var avgEff = 99.35 - acidLoadFrac * 0.22 + U.jitter('gh:eff', tk, 0.04);

      // ---- Gas yard schematic (every frame — Schematic throttles internally) -
      gasYardSch.update(frame);

      // ---- KPIs ----------------------------------------------------------
      kN2.set(U.group(Math.round(n2)), { delta: U.fmt.delta((n2 - 14000) / 140, 1, '%'), dir: n2 >= 14000 ? 'up' : 'down' });
      kEx.set((totalCFM / 1000).toFixed(1), { delta: U.fmt.delta((totalCFM - 415000) / 4150, 1, '%'), dir: totalCFM >= 415000 ? 'up' : 'down' });
      kAbate.set(Math.round(abate), { delta: U.fmt.delta(abate - 1800, 0, ' kW'), dir: abate >= 1800 ? 'up' : 'down', state: U.band(abate, 2100, 2400) });
      kEff.set(avgEff.toFixed(2), { state: U.band(avgEff, 99.0, 98.7, true) });

      // ---- sparklines: push + render every frame ------------------------
      spAcid.push(exAcid); spAcid.render();
      spAbate.push(abate); spAbate.render();
      spN2.push(n2); spN2.render();

      // ---- throttled table / innerHTML rebuilds -------------------------
      if (fc % 8 === 0) {
        // (3) Bulk gas yard
        bulkTbl.set(Object.keys(GASES).map(function (sym) {
          var g = GASES[sym];
          var flow = sym === 'N2' ? n2 : (n2 * g.flowFrac + U.jitter('gh:bf:' + sym, tk, n2 * g.flowFrac * 0.012));
          var hdr = g.hdr + U.jitter('gh:bh:' + sym, tk, 0.06);
          var tank = g.tank + U.jitter('gh:bt:' + sym, tk, 0.4);
          var dew = (g.dew + U.jitter('gh:bd:' + sym, tk, 0.6)).toFixed(1);
          return {
            gas: g.name + ' (' + sym + ')',
            hdr: hdr.toFixed(2),
            flow: U.group(Math.round(flow)),
            tank: tank, tankCls: U.band(tank, 35, 25, true) === 'good' ? 'good' : U.band(tank, 35, 25, true),
            purity: g.purity.toFixed(g.purity >= 99.9999 ? 4 : g.purity >= 99.999 ? 3 : 3),
            dew: dew
          };
        }));

        // (4a) Exhaust headers
        exHdrTbl.set(EX_HEADERS.map(function (h) {
          var f = (frame.load[h.chan] || 0) + U.jitter('gh:ehf:' + h.key, tk, 600);
          var dp = h.dp + U.jitter('gh:ehd:' + h.key, tk, 6);
          // dP out of band -> filter loading / damper fault; here always nominal.
          var st = dp > h.dp + 90 ? 'Standby' : 'Productive';
          return { hdr: h.key + ' (' + h.seg + ')', flow: U.group(Math.round(f)), dp: Math.round(dp), state: st };
        }));

        // (4b) Wet scrubbers — couple destruction eff + blower to acid load
        scrubTbl.set(M.facility.scrubbers.map(function (s, i) {
          var eff = 99.4 - acidLoadFrac * 0.25 + U.jitter('gh:scef:' + s.id, tk, 0.05) - i * 0.03;
          var kw = 95 + acidLoadFrac * 30 + i * 8 + U.jitter('gh:sckw:' + s.id, tk, 1.5);
          var ph = 7.0 + U.jitter('gh:scph:' + s.id, tk, 0.18);
          var recirc = 420 + i * 25 + U.jitter('gh:scrc:' + s.id, tk, 6);
          return {
            name: 'Wet Scrubber ' + (i + 1),
            eff: eff.toFixed(2), kw: Math.round(kw),
            ph: ph, recirc: Math.round(recirc)
          };
        }));

        // (4c) Thermal oxidizers
        oxTbl.set(M.facility.oxidizers.map(function (o, i) {
          var stack = 760 + U.jitter('gh:oxst:' + o.id, tk, 6) + i * 4;
          var eff = 99.6 - acidLoadFrac * 0.12 + U.jitter('gh:oxef:' + o.id, tk, 0.03) - i * 0.04;
          var fuel = 38 + acidLoadFrac * 10 + i * 3 + U.jitter('gh:oxfu:' + o.id, tk, 0.8);
          return {
            name: 'Thermal Oxidizer ' + (i + 1),
            stack: Math.round(stack), eff: eff.toFixed(2), fuel: fuel.toFixed(1)
          };
        }));

        // (5) Specialty gas cabinets — production-coupled, deterministic states.
        // State derives from frame.areaStates[area].Productive/total + P.rand(id, tick).
        // No Math.random. Identical for same frame.tick on every loop pass.
        cabTbl.set(M.facility.gasCabinets.map(function (c, i) {
          var gas = CABINET_GAS[i % CABINET_GAS.length];
          var area = CABINET_AREA[i % CABINET_AREA.length];
          var state = cabinetState(c.id, area, frame);
          // Cylinder % is stable (changes slowly via jitter off tick, not per-second)
          var cyl = clamp(20 + P.rand('gh:cyl:' + c.id, 0) * 70 + U.jitter('gh:cylj:' + c.id, tk, 0.3), 4, 99);
          var mtorr = state === 'Online' ? Math.round(760 + U.jitter('gh:cmt:' + c.id, tk, 8)) : 0;
          var purge = state === 'Purge' ? Math.round(2000 + U.jitter('gh:cpg:' + c.id, tk, 40))
            : Math.round(120 + U.jitter('gh:cpgi:' + c.id, tk, 8));
          return {
            name: 'Gas Cabinet ' + (i + 1),
            gas: gas,
            haz: hazTag(CAB_HAZ[gas]),
            state: stateBadgeName(state),
            mtorr: mtorr ? U.group(mtorr) : '—',
            cyl: cyl, cylCls: U.band(cyl, 25, 15, true),
            purge: U.group(purge)
          };
        }));
      }
    }
  });

  // ---- helpers -----------------------------------------------------------
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function meter(pct, cls, label) {
    pct = clamp(pct, 0, 100);
    return '<div style="display:flex;align-items:center;gap:7px">' +
      '<div class="meter ' + (cls || 'good') + '" style="flex:1;min-width:46px"><i style="width:' + pct.toFixed(0) + '%"></i></div>' +
      '<span class="num" style="min-width:34px;text-align:right">' + label + '</span></div>';
  }

  function phCell(ph) {
    // Scrubber liquor should be near-neutral (~7.0 with caustic dosing);
    // drifting acidic (<6.4) means dosing is falling behind the acid load.
    var st = ph < 6.4 ? 'bad' : ph < 6.8 ? 'warn' : 'good';
    return '<span class="num" style="color:var(--' + st + ')">' + ph.toFixed(2) + '</span>';
  }

  function hazTag(h) {
    var map = { pyro: ['PYRO', 'crit'], tox: ['TOXIC', 'bad'], corr: ['CORR', 'warn'] };
    var m = map[h] || ['INERT', 'text-mut'];
    return '<span class="mono" style="font-size:var(--fs-0);color:var(--' + m[1] + ')">' + m[0] + '</span>';
  }

  // Map cabinet status words to E10-flavored badge classes already in the CSS.
  function stateBadgeName(state) {
    // 'Online' -> Productive (green), 'Purge' -> Engineering (purple), 'Standby' -> Standby (blue)
    if (state === 'Online') return 'Productive';
    if (state === 'Purge') return 'Engineering';
    return 'Standby';
  }

  function makeSpark(grid, title, unit, color) {
    var p = U.panel(title, { cls: 'col-4', bodyCls: 'flush', meta: unit, metaId: '' });
    var c = el('canvas', 'spark'); c.style.height = '88px'; c.style.width = '100%';
    p._body.appendChild(c);
    grid.appendChild(p);
    return U.Sparkline(c, { height: 88, color: color, fill: true });
  }
})(window.BAS);
