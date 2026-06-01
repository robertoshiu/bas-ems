/* bas-ems — app shell: top bar, nav rail, event stream, alarm banner, routing
 * Classic script -> window.BAS.app
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el;

  var refs = {}, mounted = {}, activeId = null, ticker = null;
  var GROUP_ORDER = ['Operations', 'BAS', 'EMS', 'Master Data'];

  // ---- Alarm history ring buffer (closure-scope, NOT in frame) ----
  var HIST_N = 200;
  var histBuf = new Array(HIST_N);
  var histHead = 0, histCount = 0;
  var prevActiveAlids = {};   // alid -> true; tracks set-transition dedup

  function histPush(entry) {
    histBuf[histHead] = entry;
    histHead = (histHead + 1) % HIST_N;
    if (histCount < HIST_N) histCount++;
  }

  // Returns array of history entries newest-first (out[0] = most recently pushed)
  function histSnapshot() {
    var out = [];
    for (var i = 0; i < histCount; i++) {
      out.push(histBuf[(histHead - 1 - i + HIST_N) % HIST_N]);
    }
    return out;
  }

  // ---- Area -> module resolver ----
  var AREA_MODULE = {
    LITHO: 'production', ETCH: 'production', DIFF: 'production',
    IMPL: 'production', CMP: 'production', WET: 'production',
    THIN: 'production', METRO: 'production'
  };
  function resolveModule(area) {
    return AREA_MODULE[area] || 'production';
  }

  // ---- Dropdown state ----
  var dropdownOpen = false;

  function build(root) {
    var app = el('div', 'app');

    // top bar
    var top = el('div', 'topbar');
    var brand = el('div', 'brand');
    brand.appendChild(el('div', 'logo'));
    var nm = el('div');
    nm.appendChild(el('div', 'name', 'bas&#8209;ems'));
    nm.appendChild(el('div', 'sub', 'Fab Building Automation · Energy Mgmt'));
    brand.appendChild(nm);
    top.appendChild(brand);

    var mark = el('div', 'simmark');
    mark.appendChild(el('span', 'dot'));
    mark.appendChild(document.createTextNode('Simulation · Synthetic Data'));
    top.appendChild(mark);

    top.appendChild(el('div', 'spacer'));

    var kpis = el('div', 'hdr-kpis');
    refs.hk = {};
    [['demand', 'Total Demand', 'accent'], ['overhead', 'Facility Overhead', ''], ['oee', 'Fleet OEE', 'good'],
     ['moves', 'Wafer Moves/h', ''], ['peak', 'Demand vs Peak', '']].forEach(function (k) {
      var box = el('div', 'hdr-kpi');
      box.appendChild(el('div', 'label', k[1]));
      var v = el('div', 'val ' + (k[2] || '')); v.textContent = '—';
      box.appendChild(v); kpis.appendChild(box); refs.hk[k[0]] = v;
    });
    top.appendChild(kpis);

    var clock = el('div', 'clock');
    clock.innerHTML = '<span class="d">SHIFT&nbsp;</span><span id="clk">00:00:00</span>';
    clock.setAttribute('aria-label', 'Simulation clock');
    top.appendChild(clock);
    refs.clock = clock.querySelector('#clk');
    app.appendChild(top);

    // alarm banner
    var banner = el('div', 'alarmbanner hidden');
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-expanded', 'false');
    banner.style.cursor = 'pointer';
    banner.innerHTML = '<span class="ic">&#9650;</span><span class="msg"></span><span class="cnt"></span><span class="banner-chevron">&#9660;</span>';
    app.appendChild(banner);
    refs.banner = banner; refs.bannerMsg = banner.querySelector('.msg'); refs.bannerCnt = banner.querySelector('.cnt');

    // alarm dropdown panel
    var dropdown = el('div', 'alarm-dropdown');
    dropdown.style.display = 'none';
    app.appendChild(dropdown);
    refs.dropdown = dropdown;

    banner.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleDropdown();
    });

    document.addEventListener('click', function (e) {
      if (!dropdownOpen) return;
      if (banner.contains(e.target) || dropdown.contains(e.target)) return;
      closeDropdown();
    });

    // body
    var body = el('div', 'body');
    var nav = el('div', 'navrail'); refs.nav = nav;
    nav.setAttribute('role', 'tablist');
    buildNav(nav);
    body.appendChild(nav);

    var content = el('div', 'content'); refs.content = content;
    content.setAttribute('role', 'tabpanel');
    body.appendChild(content);

    var rail = el('div', 'eventrail');
    var rh = el('div', 'rail-h');
    rh.appendChild(el('span', 't', 'Event Stream'));
    var rate = el('span', 'rate', '0 evt/s'); rh.appendChild(rate);
    rail.appendChild(rh);
    var stream = el('div', 'stream'); stream.title = 'Hover to pause the stream and read'; stream.setAttribute('aria-live', 'polite'); rail.appendChild(stream);
    body.appendChild(rail);
    ticker = U.Ticker(stream, { rateEl: rate, maxRows: 26, rowsPerSec: 2 / 3 }); // 3x slower than prior 2/s → ~1.5s/row

    app.appendChild(body);

    // bottom time-machine cockpit
    var cockpit = el('div', 'cockpit');
    app.appendChild(cockpit);
    refs.cockpit = BAS.ui.TimelineCockpit(cockpit);

    root.appendChild(app);

    // routing
    window.addEventListener('hashchange', onHash);
    var initial = (location.hash || '').replace('#', '') || (BAS.modules[0] && BAS.modules[0].id);
    activate(initial);

    window.addEventListener('keydown', function (e) {
      if (e.target && /input|textarea|button/i.test(e.target.tagName)) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;   // don't hijack browser shortcuts (Alt+←/→ Back/Fwd, Ctrl/Cmd+digit tab switch)
      if (e.key === ' ') { e.preventDefault(); BAS.clockSource.togglePlay(); }
      else if (e.key === ',') { e.preventDefault(); BAS.clockSource.step(-1); }
      else if (e.key === '.') { e.preventDefault(); BAS.clockSource.step(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        var orderedIds = navOrder();
        var idx = orderedIds.indexOf(activeId);
        if (idx < 0) idx = 0;
        if (e.key === 'ArrowLeft') { if (idx > 0) idx -= 1; }
        else { if (idx < orderedIds.length - 1) idx += 1; }
        location.hash = '#' + orderedIds[idx];
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (dropdownOpen) { closeDropdown(); return; }
        location.hash = '#production';
      } else {
        var d = parseInt(e.key, 10);
        // digits 1-8 only; cap matches current module count (extend if modules expand)
        if (d >= 1 && d <= 8) {
          var ids = navOrder();
          if (d - 1 < ids.length) { e.preventDefault(); location.hash = '#' + ids[d - 1]; }
        }
      }
    });
  }

  // ---- Dropdown helpers ----
  function openDropdown() {
    dropdownOpen = true;
    refs.banner.setAttribute('aria-expanded', 'true');
    refs.dropdown.style.display = '';
    renderDropdown(false);
  }

  function closeDropdown() {
    dropdownOpen = false;
    showingHistory = false;   // always reopen on the Active tab
    refs.banner.setAttribute('aria-expanded', 'false');
    refs.dropdown.style.display = 'none';
  }

  function toggleDropdown() {
    if (dropdownOpen) closeDropdown(); else openDropdown();
  }

  // currentAlarms is the latest frame.alarms snapshot stored for rendering
  var latestAlarms = [];
  var showingHistory = false;
  var lastRenderedSig = null;   // signature of the last dropdown render — re-render only on change

  // Cheap signature of what the open dropdown shows, so update() can skip the full
  // innerHTML rebuild when nothing changed (avoids a ~30Hz DOM teardown while open,
  // which would also reset scroll position and churn listener closures).
  function dropdownSig() {
    if (showingHistory) return 'H:' + histHead + ':' + histCount;
    var s = 'A:';
    for (var i = 0; i < latestAlarms.length; i++) s += latestAlarms[i].alid + ',';
    return s;
  }

  function renderDropdown(histMode) {
    showingHistory = !!histMode;
    var dd = refs.dropdown;
    dd.innerHTML = '';

    // header row
    var hdr = el('div', 'alarm-dd-hdr');
    var title = el('span', 'alarm-dd-title', histMode ? 'Alarm History' : 'Active Alarms');
    hdr.appendChild(title);

    var btns = el('div', 'alarm-dd-btns');
    if (!histMode) {
      var histBtn = el('button', 'history-btn');
      histBtn.textContent = 'History';
      histBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        renderDropdown(true);
      });
      btns.appendChild(histBtn);
    } else {
      var backBtn = el('button', 'history-btn');
      backBtn.textContent = 'Active';
      backBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        renderDropdown(false);
      });
      btns.appendChild(backBtn);
    }
    var closeBtn = el('button', 'alarm-dd-close');
    closeBtn.innerHTML = '&#10005;';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      closeDropdown();
    });
    btns.appendChild(closeBtn);
    hdr.appendChild(btns);
    dd.appendChild(hdr);

    var list = el('div', 'alarm-dd-list');

    if (!histMode) {
      // Active alarms
      if (!latestAlarms.length) {
        var empty = el('div', 'alarm-dd-empty', 'No active alarms');
        list.appendChild(empty);
      } else {
        for (var i = 0; i < latestAlarms.length; i++) {
          list.appendChild(buildAlarmRow(latestAlarms[i], false));
        }
      }
    } else {
      // History rows
      var snap = histSnapshot();
      if (!snap.length) {
        var emptyH = el('div', 'alarm-dd-empty', 'No alarm history yet');
        list.appendChild(emptyH);
      } else {
        for (var j = 0; j < snap.length; j++) {
          list.appendChild(buildAlarmRow(snap[j], true));
        }
      }
    }

    dd.appendChild(list);
    lastRenderedSig = dropdownSig();
  }

  // Builds one alarm row for the active list (isHist=false, clickable -> navigate)
  // or the history list (isHist=true, non-navigable). Data fields use textContent
  // (not innerHTML) — el()'s 3rd arg is innerHTML, unsafe for data strings.
  function buildAlarmRow(alarm, isHist) {
    var row = el('div', isHist ? 'alarm-row hist-row' : 'alarm-row');
    if (!isHist) {
      row.addEventListener('click', function (e) {
        e.stopPropagation();
        location.hash = '#' + resolveModule(alarm.area);
        closeDropdown();
      });
    }
    var sev = alarm.sev || 'INFO';
    var sevBadge = el('span', 'alarm-sev-badge sev-' + sev); sevBadge.textContent = sev;
    row.appendChild(sevBadge);
    var alid = el('span', 'alarm-alid'); alid.textContent = (alarm.alid != null ? alarm.alid : '');
    row.appendChild(alid);
    var txt = el('span', 'alarm-text'); txt.textContent = alarm.text || '';
    row.appendChild(txt);
    var tool = el('span', 'alarm-tool'); tool.textContent = alarm.tool || '';
    row.appendChild(tool);
    var area = el('span', 'alarm-area'); area.textContent = alarm.area || '';
    row.appendChild(area);
    return row;
  }

  function navOrder() {
    return BAS.modules.slice().sort(function (a, b) {
      return (GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)) || ((a.order || 0) - (b.order || 0));
    }).map(function (m) { return m.id; });
  }

  function buildNav(nav) {
    var lastGroup = null;
    // order modules by group
    var mods = BAS.modules.slice().sort(function (a, b) {
      return (GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)) || ((a.order || 0) - (b.order || 0));
    });
    refs.navItems = {};
    mods.forEach(function (m) {
      if (m.group !== lastGroup) { nav.appendChild(el('div', 'nav-sec', m.group)); lastGroup = m.group; }
      var it = el('div', 'navitem');
      it.setAttribute('role', 'tab');
      it.id = 'tab-' + m.id;
      it.setAttribute('aria-selected', 'false');
      it.innerHTML = U.icon(m.icon) + '<span class="label">' + m.title + '</span>';
      var badge = el('span', 'badge-n'); badge.style.display = 'none'; it.appendChild(badge);
      it.addEventListener('click', function () { location.hash = '#' + m.id; });
      it.dataset.id = m.id;
      nav.appendChild(it);
      refs.navItems[m.id] = { item: it, badge: badge };
    });
  }

  function onHash() { activate((location.hash || '').replace('#', '')); }

  function activate(id) {
    var def = BAS.moduleById(id) || BAS.modules[0];
    if (!def) return;
    id = def.id;
    for (var k in mounted) mounted[k].style.display = (k === id) ? '' : 'none';
    if (!mounted[id]) {
      var c = el('div'); c.style.display = '';
      try { def.mount(c); } catch (e) { c.innerHTML = '<div class="dim">Module error: ' + (e && e.message) + '</div>'; if (window.console) console.error(e); }
      refs.content.appendChild(c); mounted[id] = c;
    }
    activeId = id;
    for (var nid in refs.navItems) {
      var ni = refs.navItems[nid].item;
      ni.classList.toggle('active', nid === id);
      if (nid === id) { ni.setAttribute('aria-current', 'page'); ni.setAttribute('aria-selected', 'true'); }
      else { ni.removeAttribute('aria-current'); ni.setAttribute('aria-selected', 'false'); }
    }
    refs.content.setAttribute('aria-labelledby', 'tab-' + id);
    refs.content.scrollTop = 0;
  }

  function update(frame) {
    // header
    var kp = frame.kpis;
    refs.clock.textContent = frame.sim.hms;
    refs.hk.demand.textContent = kp.totalMW.toFixed(1) + ' MW';
    refs.hk.overhead.textContent = kp.overheadRatio.toFixed(2) + '×';
    refs.hk.oee.textContent = (kp.oee.oee * 100).toFixed(1) + '%';
    refs.hk.moves.textContent = U.group(Math.round(kp.wpmh));
    refs.hk.peak.textContent = kp.demandPct.toFixed(0) + '%';

    // alarm banner + ring buffer
    var al = frame.alarms;
    latestAlarms = al;

    // detect set-transitions for history ring buffer (only push on new appearance)
    var currentAlids = {};
    for (var ai = 0; ai < al.length; ai++) {
      var alarm = al[ai];
      currentAlids[alarm.alid] = true;
      if (!prevActiveAlids[alarm.alid]) {
        // newly appeared — push into history
        histPush({
          alid: alarm.alid,
          text: alarm.text,
          tool: alarm.tool,
          area: alarm.area,
          sev: alarm.sev,
          setT: alarm.set != null ? alarm.set : frame.t,
          clearT: alarm.clear != null ? alarm.clear : null
        });
      }
    }
    prevActiveAlids = currentAlids;

    if (al.length) {
      refs.banner.classList.remove('hidden');
      var worst = al[al.length - 1];
      refs.bannerMsg.textContent = 'ALID ' + worst.alid + ' — ' + worst.text + ' @ ' + worst.tool;
      refs.bannerCnt.textContent = al.length + ' active alarm' + (al.length > 1 ? 's' : '');
    } else {
      refs.banner.classList.add('hidden');
      if (dropdownOpen) closeDropdown();
    }

    // keep dropdown content fresh if open — but only re-render when the shown set changed
    if (dropdownOpen && dropdownSig() !== lastRenderedSig) renderDropdown(showingHistory);

    // nav badges (active alarms per module's area-set: only Production gets the count here)
    var pcount = al.length;
    for (var nid in refs.navItems) {
      var b = refs.navItems[nid].badge;
      if (nid === 'production' && pcount) { b.style.display = ''; b.textContent = pcount; }
      else b.style.display = 'none';
    }

    // event stream (always on)
    ticker.push(frame.newEvents, frame.sim);

    // active module
    var def = BAS.moduleById(activeId);
    if (def && def.update && mounted[activeId] && mounted[activeId].style.display !== 'none') {
      try { def.update(frame); } catch (e) { if (window.console) console.error(e); }
    }

    if (refs.cockpit) refs.cockpit.update(frame);
  }

  BAS.app = { build: build, update: function (f) { update(f); }, get active() { return activeId; } };
})(window.BAS);
