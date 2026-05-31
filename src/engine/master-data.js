/* bas-ems — master data
 * Classic script -> window.BAS.master
 * Deterministic registry of process areas, production tools (with SEMI E10
 * profiles), facility systems/assets, recipes, the asset hierarchy, and a lazy
 * point/tag generator. Generated once from the seeded PRNG; stable across the
 * loop. Generic 300 mm advanced-logic fab.
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';
  var P = BAS.prng;

  var SITE = 'FAB-1';

  var AREAS = [
    { id: 'LITHO', name: 'Lithography', kinds: ['SCANNER', 'TRACK', 'COATER'], count: 6, baseKW: [120, 240], exhaust: 'general' },
    { id: 'ETCH',  name: 'Etch',         kinds: ['PLASMA', 'RIE', 'ASH'],       count: 10, baseKW: [60, 130], exhaust: 'acid' },
    { id: 'DIFF',  name: 'Diffusion',    kinds: ['FURNACE', 'LPCVD', 'OXIDE'],  count: 8,  baseKW: [150, 320], exhaust: 'heat' },
    { id: 'IMPL',  name: 'Implant',      kinds: ['HC-IMP', 'MC-IMP', 'HE-IMP'], count: 5,  baseKW: [90, 200], exhaust: 'general' },
    { id: 'CMP',   name: 'CMP',          kinds: ['POLISH', 'POST-CLEAN'],       count: 6,  baseKW: [40, 90],  exhaust: 'general' },
    { id: 'WET',   name: 'Wet / Clean',  kinds: ['BENCH', 'SRD', 'SCRUBBER'],   count: 8,  baseKW: [30, 70],  exhaust: 'acid' },
    { id: 'THIN',  name: 'Thin Film',    kinds: ['PVD', 'CVD', 'ALD'],          count: 8,  baseKW: [70, 160], exhaust: 'solvent' },
    { id: 'METRO', name: 'Metrology',    kinds: ['CD-SEM', 'OVERLAY', 'FILM'],  count: 7,  baseKW: [15, 40],  exhaust: 'general' }
  ];

  var RECIPES = {
    LITHO: ['N3-M1-EXP', 'N3-V0-EXP', 'N5-M2-EXP', 'N3-FIN-LITHO', 'N5-CT-EXP'],
    ETCH:  ['N3-FIN-ETCH', 'HARM-CONTACT', 'N5-METAL-RIE', 'POLY-ETCH', 'STI-ETCH'],
    DIFF:  ['GATE-OX-A', 'LPCVD-NIT', 'N3-ANNEAL', 'SAC-OXIDE', 'RTP-SPIKE'],
    IMPL:  ['SD-EXT-HC', 'WELL-MC', 'HALO-HE', 'POLY-DOPE', 'N3-LDD'],
    CMP:   ['STI-CMP', 'CU-BULK-CMP', 'ILD-CMP', 'W-CMP'],
    WET:   ['RCA-CLEAN', 'POST-ETCH-WET', 'SC1-SC2', 'IPA-DRY', 'PIRANHA'],
    THIN:  ['CU-SEED-PVD', 'TIN-CVD', 'HIK-ALD', 'W-CVD', 'TA-BARRIER'],
    METRO: ['CD-MEAS', 'OVL-MEAS', 'FILM-THK', 'DEFECT-SCAN']
  };

  // ---- Production tools -------------------------------------------------
  var tools = [];
  var toolIndex = {};
  AREAS.forEach(function (a, ai) {
    for (var i = 0; i < a.count; i++) {
      var kind = a.kinds[i % a.kinds.length];
      var id = a.id + '-' + String(i + 1).padStart(2, '0');
      var baseKW = Math.round(a.baseKW[0] + P.rand('mk:kw:' + id, ai * 31 + i) * (a.baseKW[1] - a.baseKW[0]));
      var t = {
        id: id,
        name: a.name + ' ' + kind + ' ' + String(i + 1).padStart(2, '0'),
        area: a.id, areaName: a.name, kind: kind,
        baseKW: baseKW,
        exhaust: a.exhaust,
        loadPorts: 2 + (i % 3)
      };
      tools.push(t);
      toolIndex[id] = t;
    }
  });

  function toolsInArea(areaId) {
    return tools.filter(function (t) { return t.area === areaId; });
  }

  // ---- Facility systems / assets ---------------------------------------
  function gen(prefix, n, fields) {
    var out = [];
    for (var i = 0; i < n; i++) {
      var id = prefix + '-' + String(i + 1).padStart(2, '0');
      var rec = { id: id };
      for (var k in fields) {
        if (fields.hasOwnProperty(k)) {
          var f = fields[k];
          rec[k] = (typeof f === 'function') ? f(i, id) : f;
        }
      }
      out.push(rec);
    }
    return out;
  }

  var facility = {
    chillers: gen('CHLR', 6, {
      name: function (i) { return 'Centrifugal Chiller ' + (i + 1); },
      ratingRT: 2500, system: 'CHW', stages: 4
    }),
    coolingTowers: gen('CT', 3, { name: function (i) { return 'Cooling Tower ' + (i + 1); }, system: 'CHW', cells: 2 }),
    chwPumps: gen('CHWP', 4, { name: function (i) { return 'CHW Pump ' + (i + 1); }, system: 'CHW' }),
    pcwLoops: gen('PCW', 2, { name: function (i) { return 'PCW Loop ' + String.fromCharCode(65 + i); }, system: 'PCW', setpointC: 20 }),
    mau: gen('MAU', 6, { name: function (i) { return 'Makeup Air Unit ' + (i + 1); }, system: 'HVAC', cfm: 80000 }),
    ahu: gen('AHU', 8, { name: function (i) { return 'Air Handling Unit ' + (i + 1); }, system: 'HVAC' }),
    upwTrains: gen('UPW', 2, { name: function (i) { return 'UPW Train ' + String.fromCharCode(65 + i); }, system: 'UPW' }),
    bulkGas: [
      { id: 'BULK-N2', name: 'Bulk Nitrogen', gas: 'N2', system: 'GAS', unit: 'Nm3/h' },
      { id: 'BULK-O2', name: 'Bulk Oxygen', gas: 'O2', system: 'GAS', unit: 'Nm3/h' },
      { id: 'BULK-AR', name: 'Bulk Argon', gas: 'Ar', system: 'GAS', unit: 'Nm3/h' },
      { id: 'BULK-H2', name: 'Bulk Hydrogen', gas: 'H2', system: 'GAS', unit: 'Nm3/h' },
      { id: 'BULK-CO2', name: 'Bulk CO2', gas: 'CO2', system: 'GAS', unit: 'Nm3/h' },
      { id: 'BULK-HE', name: 'Bulk Helium', gas: 'He', system: 'GAS', unit: 'Nm3/h' }
    ],
    gasCabinets: gen('GC', 10, { name: function (i) { return 'Gas Cabinet ' + (i + 1); }, system: 'GAS' }),
    scrubbers: gen('SCRB', 4, { name: function (i) { return 'Wet Scrubber ' + (i + 1); }, system: 'EXHAUST' }),
    oxidizers: gen('TOX', 2, { name: function (i) { return 'Thermal Oxidizer ' + (i + 1); }, system: 'EXHAUST' }),
    switchgear: gen('SWGR', 2, { name: function (i) { return 'Main Switchgear ' + String.fromCharCode(65 + i); }, system: 'POWER', kV: 13.8 }),
    ups: gen('UPS', 3, { name: function (i) { return 'UPS Module ' + (i + 1); }, system: 'POWER', kVA: 800 }),
    generators: gen('GEN', 2, { name: function (i) { return 'Standby Generator ' + (i + 1); }, system: 'POWER', kW: 2500 })
  };

  // ---- Cleanroom bays ---------------------------------------------------
  var ISO_TARGET = { LITHO: 3, ETCH: 4, DIFF: 5, IMPL: 5, CMP: 5, WET: 4, THIN: 4, METRO: 4 };
  var bays = AREAS.map(function (a, i) {
    return {
      id: 'BAY-' + String(i + 1).padStart(2, '0'),
      name: a.name + ' Bay',
      area: a.id,
      iso: ISO_TARGET[a.id] || 5,
      ffuCount: 60 + Math.round(P.rand('mk:ffu:' + a.id, i) * 80),
      tempSetC: 21.5, rhSet: 43
    };
  });

  // ---- Asset hierarchy (Site -> Building -> Floor -> System -> Equip) ----
  var hierarchy = {
    id: SITE, name: 'Fab 1 — Advanced Logic (300mm)', type: 'Site',
    children: [
      {
        id: 'B-CR', name: 'Cleanroom', type: 'Building', children: [
          { id: 'FL-FAB', name: 'Fab Floor', type: 'Floor', children: bays.map(function (b) { return { id: b.id, name: b.name, type: 'Zone' }; }) },
          { id: 'FL-INT', name: 'Interstitial', type: 'Floor', children: facility.ahu.map(idNode).concat(facility.mau.map(idNode)) }
        ]
      },
      {
        id: 'B-CUB', name: 'Central Utility Building', type: 'Building', children: [
          { id: 'SYS-CHW', name: 'Chilled Water Plant', type: 'System', children: facility.chillers.map(idNode).concat(facility.coolingTowers.map(idNode)) },
          { id: 'SYS-UPW', name: 'UPW Plant', type: 'System', children: facility.upwTrains.map(idNode) },
          { id: 'SYS-GAS', name: 'Bulk Gas Yard', type: 'System', children: facility.bulkGas.map(idNode) },
          { id: 'SYS-PWR', name: 'Electrical', type: 'System', children: facility.switchgear.map(idNode).concat(facility.ups.map(idNode)).concat(facility.generators.map(idNode)) }
        ]
      },
      {
        id: 'B-SUB', name: 'Sub-Fab', type: 'Building', children: [
          { id: 'SYS-EXH', name: 'Exhaust & Abatement', type: 'System', children: facility.scrubbers.map(idNode).concat(facility.oxidizers.map(idNode)) },
          { id: 'SYS-PCW', name: 'Process Cooling Water', type: 'System', children: facility.pcwLoops.map(idNode) }
        ]
      }
    ]
  };
  function idNode(o) { return { id: o.id, name: o.name, type: 'Equipment' }; }

  // ---- Lazy point/tag generator ----------------------------------------
  var POINT_TEMPLATES = {
    tool: ['STATE', 'RECIPE', 'WAFER_CT', 'CHAMBER_PRES', 'RF_PWR', 'PROC_TEMP', 'FLOW_AR', 'FLOW_O2', 'EXH_FLOW', 'ALARM_CT'],
    CHW: ['CHWS_TEMP', 'CHWR_TEMP', 'TONNAGE', 'FLOW', 'APPROACH', 'KW', 'PCT_LOAD', 'EVAP_PRES', 'COND_PRES'],
    HVAC: ['SUP_TEMP', 'RET_TEMP', 'SUP_RH', 'CFM', 'FILTER_DP', 'VFD_PCT', 'STATIC_PRES'],
    UPW: ['RESISTIVITY', 'TOC', 'FLOW', 'RECLAIM_PCT', 'TANK_LVL', 'PUMP_KW', 'TEMP'],
    GAS: ['HDR_PRES', 'FLOW', 'TANK_LVL', 'PURITY', 'DEWPOINT', 'VALVE_POS'],
    EXHAUST: ['INLET_FLOW', 'DP', 'PH', 'BLOWER_KW', 'STACK_TEMP', 'DESTR_EFF'],
    POWER: ['KW', 'KVAR', 'PF', 'VOLTAGE', 'CURRENT', 'THD', 'FREQ', 'LOAD_PCT']
  };
  var UNITS = {
    STATE: '', RECIPE: '', WAFER_CT: 'wfr', CHAMBER_PRES: 'mTorr', RF_PWR: 'W', PROC_TEMP: '°C',
    FLOW_AR: 'sccm', FLOW_O2: 'sccm', EXH_FLOW: 'CFM', ALARM_CT: '', CHWS_TEMP: '°C', CHWR_TEMP: '°C',
    TONNAGE: 'RT', FLOW: 'm³/h', APPROACH: '°C', KW: 'kW', PCT_LOAD: '%', EVAP_PRES: 'kPa', COND_PRES: 'kPa',
    SUP_TEMP: '°C', RET_TEMP: '°C', SUP_RH: '%', CFM: 'CFM', FILTER_DP: 'Pa', VFD_PCT: '%', STATIC_PRES: 'Pa',
    RESISTIVITY: 'MΩ·cm', TOC: 'ppb', RECLAIM_PCT: '%', TANK_LVL: '%', PUMP_KW: 'kW', TEMP: '°C',
    HDR_PRES: 'bar', PURITY: '%', DEWPOINT: '°C', VALVE_POS: '%', INLET_FLOW: 'CFM', DP: 'Pa', PH: 'pH',
    BLOWER_KW: 'kW', STACK_TEMP: '°C', DESTR_EFF: '%', KVAR: 'kVAR', PF: '', VOLTAGE: 'V', CURRENT: 'A',
    THD: '%', FREQ: 'Hz', LOAD_PCT: '%'
  };

  function categoryFor(id) {
    if (toolIndex[id]) return 'tool';
    if (/^CHLR|^CT-|^CHWP/.test(id)) return 'CHW';
    if (/^MAU|^AHU/.test(id)) return 'HVAC';
    if (/^UPW/.test(id)) return 'UPW';
    if (/^BULK|^GC-/.test(id)) return 'GAS';
    if (/^SCRB|^TOX/.test(id)) return 'EXHAUST';
    if (/^SWGR|^UPS|^GEN/.test(id)) return 'POWER';
    if (/^PCW/.test(id)) return 'CHW';
    return 'tool';
  }

  // Returns a stable list of points for an equipment id. Live values are filled
  // by the caller from the frame; here we provide tag/desc/unit/nominal.
  function pointsForEquipment(id) {
    var cat = categoryFor(id);
    var tmpl = POINT_TEMPLATES[cat] || POINT_TEMPLATES.tool;
    var extra = 3 + P.randInt('pts:' + id, 7, 0, 4); // a few generic analog points
    var pts = [];
    var bus = cat === 'tool' ? 'SECS' : (P.rand('bus:' + id, 1) > 0.5 ? 'BACnet' : 'Modbus');
    tmpl.forEach(function (suffix, i) {
      pts.push({
        tag: id + '.' + suffix,
        desc: humanize(suffix),
        unit: UNITS[suffix] !== undefined ? UNITS[suffix] : '',
        bus: bus,
        addr: bus === 'BACnet' ? ('AV:' + (100 + i)) : bus === 'Modbus' ? ('4' + String(1000 + i)) : ('SV' + (1 + i)),
        nominal: nominalFor(suffix, id, i)
      });
    });
    for (var e = 0; e < extra; e++) {
      pts.push({
        tag: id + '.AUX_' + String(e + 1).padStart(2, '0'),
        desc: 'Auxiliary analog ' + (e + 1),
        unit: P.pick('auxu:' + id, e, ['%', '°C', 'kPa', 'A']),
        bus: bus, addr: bus === 'BACnet' ? ('AI:' + (200 + e)) : ('3' + String(2000 + e)),
        nominal: Math.round(P.randRange('aux:' + id, e, 10, 90))
      });
    }
    return pts;
  }

  function nominalFor(suffix, id, i) {
    switch (suffix) {
      case 'RESISTIVITY': return 18.2;
      case 'TOC': return 0.6;
      case 'PF': return 0.97;
      case 'FREQ': return 60.0;
      case 'VOLTAGE': return 13800;
      case 'CHWS_TEMP': return 6.5;
      case 'CHWR_TEMP': return 13.5;
      case 'PROC_TEMP': return Math.round(P.randRange('nom:' + id, i, 120, 950));
      case 'SUP_TEMP': return 21.5;
      case 'SUP_RH': return 43;
      default: return Math.round(P.randRange('nom:' + id + suffix, i, 5, 95) * 10) / 10;
    }
  }
  function humanize(s) {
    return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  BAS.master = {
    SITE: SITE,
    areas: AREAS,
    recipes: function (areaId) { return RECIPES[areaId] || []; },
    allRecipes: RECIPES,
    tools: tools,
    toolById: function (id) { return toolIndex[id]; },
    toolsInArea: toolsInArea,
    facility: facility,
    bays: bays,
    hierarchy: hierarchy,
    pointsForEquipment: pointsForEquipment,
    categoryFor: categoryFor
  };
})(window.BAS);
