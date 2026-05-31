/* bas-ems — app shell: top bar, nav rail, event stream, alarm banner, routing
 * Classic script -> window.BAS.app
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el;

  var refs = {}, mounted = {}, activeId = null, ticker = null;
  var GROUP_ORDER = ['Operations', 'BAS', 'EMS', 'Master Data'];

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
    top.appendChild(clock);
    refs.clock = clock.querySelector('#clk');
    app.appendChild(top);

    // alarm banner
    var banner = el('div', 'alarmbanner hidden');
    banner.innerHTML = '<span class="ic">&#9650;</span><span class="msg"></span><span class="cnt"></span>';
    app.appendChild(banner);
    refs.banner = banner; refs.bannerMsg = banner.querySelector('.msg'); refs.bannerCnt = banner.querySelector('.cnt');

    // body
    var body = el('div', 'body');
    var nav = el('div', 'navrail'); refs.nav = nav;
    buildNav(nav);
    body.appendChild(nav);

    var content = el('div', 'content'); refs.content = content;
    body.appendChild(content);

    var rail = el('div', 'eventrail');
    var rh = el('div', 'rail-h');
    rh.appendChild(el('span', 't', 'Event Stream'));
    var rate = el('span', 'rate', '0 evt/s'); rh.appendChild(rate);
    rail.appendChild(rh);
    var stream = el('div', 'stream'); stream.title = 'Hover to pause the stream and read'; rail.appendChild(stream);
    body.appendChild(rail);
    ticker = U.Ticker(stream, { rateEl: rate, maxRows: 26, rowsPerSec: 2 });

    app.appendChild(body);
    root.appendChild(app);

    // routing
    window.addEventListener('hashchange', onHash);
    var initial = (location.hash || '').replace('#', '') || (BAS.modules[0] && BAS.modules[0].id);
    activate(initial);
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
    for (var nid in refs.navItems) refs.navItems[nid].item.classList.toggle('active', nid === id);
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

    // alarm banner
    var al = frame.alarms;
    if (al.length) {
      refs.banner.classList.remove('hidden');
      var worst = al[al.length - 1];
      refs.bannerMsg.textContent = 'ALID ' + worst.alid + ' — ' + worst.text + ' @ ' + worst.tool;
      refs.bannerCnt.textContent = al.length + ' active alarm' + (al.length > 1 ? 's' : '');
    } else refs.banner.classList.add('hidden');

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
  }

  BAS.app = { build: build, update: function (f) { update(f); }, get active() { return activeId; } };
})(window.BAS);
