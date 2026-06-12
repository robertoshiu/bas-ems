/* bas-ems — Guided Tour ("作業流程自動導覽")
 * Classic script -> window.BAS.tour
 *
 * A timer/event-driven guided walkthrough of the whole fab BAS/EMS console.
 * Does NOT hook the RAF loop (zero per-frame work). Pre-builds all DOM at first
 * launch; reuses it across runs. Spotlight = one fixed cutout box with a massive
 * box-shadow dim; caption card auto-flips to stay on-screen. Module routing reuses
 * the app's hash-based router; spotlight is re-positioned twice after each route
 * change (≈400ms + ≈900ms) so it lands after the .view-enter stagger settles.
 *
 * file:// safe: no fetch/asset/CDN. localStorage gated in try/catch (file:// throws
 * in some browsers). Respects prefers-reduced-motion (no progress animation / pulse).
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el;
  // i18n: plain dict[s]||s lookup (no per-call regex). Wrap at render/build time.
  var t = (BAS.i18n && BAS.i18n.t) ? BAS.i18n.t : function (s) { return s; };

  var reducedMotion = (typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var DEFAULT_DUR = 9000;
  var SEEN_KEY = 'bas.tourSeen';

  // ---- Tour script: chapters + steps -------------------------------------
  // step = { module, target (selector|null), title, body, why, dur?, beat? }
  // body ≤ ~220 chars, why ≤ ~120 chars. Static strings — generic references to
  // what is on screen, never live data. Domain-correct per project constraints.
  var CHAPTERS = [
    {
      name: 'Mission Overview',
      steps: [
        {
          module: 'overview', target: null, beat: 'intro',
          title: 'Welcome to the fab control room',
          body: 'This is a semiconductor fab’s Building Automation (BAS) and Energy Management (EMS) console. One synthetic shift, fully coupled — process activity drives every facility system you’ll see.',
          why: 'A fab is a building and a factory at once; the two must be read together.'
        },
        {
          module: 'overview', target: '.cc-hero',
          title: 'Facility demand, live',
          body: 'The hero band shows total electrical demand against the metered peak. Watch the bar breathe as tool load shifts — this is the number the utility bills against.',
          why: 'Demand charges are set by your worst 15-minute peak, not average use.'
        },
        {
          module: 'overview', target: '.cc-iso',
          title: 'The energy stack, in section',
          body: 'The isometric cutaway splits the building into sub-fab (pumps, chillers, abatement), fab (process tools, FFUs), and roof (cooling towers, exhaust fans). Most power lives below the cleanroom.',
          why: 'Two-thirds of fab energy is facility overhead, not the tools themselves.'
        },
        {
          module: 'overview', target: '.cc-sankey',
          title: 'Where the megawatts go',
          body: 'The Sankey traces incoming grid and on-site renewable power out to each subsystem. Band width is live load — the widest ribbons are your biggest decarbonization targets.',
          why: 'You cannot cut what you cannot see flowing.'
        },
        {
          module: 'overview', target: '.cc-areas',
          title: 'Load by process area',
          body: 'Each tile is a process area — litho, etch, diffusion, CMP, wet, implant. The matrix ranks them by live draw so the desk knows which bay is leaning on the plant right now.',
          why: 'Area-level visibility is the first step to allocating cost and carbon.'
        }
      ]
    },
    {
      name: 'The Live Fab',
      steps: [
        {
          module: 'production', target: '.prod-stage', beat: 'intro',
          title: 'Production drives the building',
          body: 'Each particle is a SECS/GEM event — a lot move, a job start, an AMHS handoff — streaming from a process area to the facility system it loads. This is the coupling, made visible.',
          why: 'Every wafer move pulls power, water, gas and exhaust behind it.'
        },
        {
          module: 'production', target: '.prod-ov',
          title: 'Live floor stats',
          body: 'These overlay chips read straight off the floor: wafers in motion, active jobs, current moves-per-hour. They give the running pulse of the shift without leaving the stage.',
          why: 'Throughput and facility load rise and fall together — read them side by side.'
        },
        {
          module: 'production', target: '.prod-rings',
          title: 'OEE = Availability × Performance × Quality',
          body: 'The ring cluster decomposes Overall Equipment Effectiveness. The headline OEE is the product of the other three — a single ring can’t lie about a weak link upstream.',
          why: 'OEE ties tool uptime directly to the energy spent per good wafer.'
        },
        {
          module: 'production', target: '.prod-states',
          title: 'SEMI E10 equipment states',
          body: 'Each bar is an area’s time split across E10 states: Productive, Standby, Engineering, Scheduled and Unscheduled Down, Non-Scheduled. The color mix is the real health of the fleet.',
          why: 'Unscheduled Down is the most expensive color on the chart.'
        },
        {
          module: 'production', target: '.prod-legend',
          title: 'Reading the state colors',
          body: 'The shared legend keys every E10 color used across the console. Standby still draws facility load — idle tools keep their environment conditioned even when not processing.',
          why: 'Idle does not mean off; standby energy is a real, trackable line item.'
        }
      ]
    },
    {
      name: 'Shift-Start Walkdown (BAS)',
      steps: [
        {
          module: 'cleanroom', target: '.cr-hero', beat: 'intro',
          title: 'Cleanroom HVAC',
          body: 'The cleanroom is graded to ISO 14644 particle classes. This band watches the air that keeps it there — temperature, humidity, fan-filter units and the pressure cascade between bays.',
          why: 'Particle control is an HVAC problem before it is a chemistry problem.'
        },
        {
          module: 'cleanroom', target: '.cr-floor',
          title: 'The bay heat-grid',
          body: 'Each tile is a cleanroom bay glowing with its live status. The floor plan lets the desk spot a drifting zone at a glance, before it shows up as a particle excursion.',
          why: 'A single bay losing pressure can contaminate its neighbors downstream.'
        },
        {
          module: 'cleanroom', target: '.cr-kpis',
          title: 'Pressure cascade & FFU airflow',
          body: 'The KPI strip tracks the differential-pressure cascade and fan-filter-unit airflow. Cleaner bays sit at higher pressure so air always flows from clean to less-clean.',
          why: 'FFUs are a 24/7 load — they run whether or not a tool is processing.'
        },
        {
          module: 'cooling', target: '.cw-hero', beat: 'intro',
          title: 'Process cooling water',
          body: 'Process tools dump heat into the PCW loop. This plant hero shows loop efficiency and the live plant kW it takes to reject that heat back out through the towers.',
          why: 'Cooling is one of the three biggest facility loads in any fab.'
        },
        {
          module: 'cooling', target: '.pg-hero-sig .ring-gauge.dial',
          title: 'Plant efficiency in kW per ton',
          body: 'The signature dial reads kW per refrigeration-ton — the canonical chiller-plant efficiency metric. Lower is better; the dial drifts as chillers stage up and down with demand.',
          why: 'A tenth of a kW/RT across the plant is real money over a shift.'
        },
        {
          module: 'cooling', target: '#schematic-meta',
          title: 'The P&ID schematic',
          body: 'The piping-and-instrumentation diagram shows the chilled-water loop: chillers, pumps, headers and the staging logic that brings machines online as the heat load climbs.',
          why: 'Staging the right number of chillers is the single biggest efficiency lever.'
        },
        {
          module: 'upw', target: '.upw-hero', beat: 'intro',
          title: 'Ultra-pure water',
          body: 'UPW is the fab’s most-used chemical. This signature band watches the two numbers that define it: resistivity and total organic carbon, plus make-up flow and reclaim.',
          why: 'A wafer can touch UPW hundreds of times; off-spec water scraps lots.'
        },
        {
          module: 'upw', target: '.upw-rings',
          title: '18.2 MΩ·cm and TOC in ppb',
          body: 'The large ring holds resistivity at its 18.2 megaohm-centimeter theoretical maximum — the purer the water, the higher it reads. The small ring tracks organic carbon in parts per billion.',
          why: 'Resistivity is the live proof the polish loop is doing its job.'
        },
        {
          module: 'upw', target: '.upw-trains',
          title: 'Make-up, polish & reclaim',
          body: 'These cards are the UPW trains — make-up production, the polishing loop, and storage. Reclaim returns rinse water to the front of the plant instead of to drain.',
          why: 'Reclaim cuts both the water bill and the energy to purify fresh make-up.'
        },
        {
          module: 'gas-exhaust', target: '.pg-hero', beat: 'intro',
          title: 'Gas & exhaust abatement',
          body: 'Process exhaust splits into streams — acid, solvent, heat and general. The big read is total CFM; the split shows how much of each the abatement plant is handling right now.',
          why: 'Exhaust must be balanced and abated before anything leaves the stack.'
        },
        {
          module: 'gas-exhaust', target: '.gx-wall',
          title: 'Scrubbers & oxidizers',
          body: 'Each status card is an abatement unit — a wet scrubber or thermal oxidizer — with its live state and destruction-removal efficiency. Green means it is meeting permit.',
          why: 'Destruction efficiency is what keeps the fab inside its air permit.'
        },
        {
          module: 'gas-exhaust', target: '.heat-grid:not(.cr-floor)',
          title: 'Bulk gas distribution',
          body: 'The tile grid is the bulk and specialty gas distribution — nitrogen, hydrogen, process gases — each glowing with live flow. N2 alone is a massive continuous facility load.',
          why: 'Bulk gas runs continuously; it is overhead the tools rarely think about.'
        }
      ]
    },
    {
      name: 'Energy Desk (EMS)',
      steps: [
        {
          module: 'energy', target: '.ens-hero', beat: 'intro',
          title: 'Facility demand, up close',
          body: 'The energy desk owns the meter. This band pairs the demand-versus-peak dial with a rolling trend and a KPI strip, so the desk can see a peak forming before it sets.',
          why: 'Shaving a forecast peak by minutes can reset the month’s demand charge.'
        },
        {
          module: 'energy', target: '.ens-sub',
          title: 'Sub-metering the building',
          body: 'Each meter is a sub-metered load — process, HVAC, cooling, UPW, gas, abatement. Sub-metering is what turns one big bill into an accountable, area-by-area breakdown.',
          why: 'You cannot allocate or reduce a load you have never metered.'
        },
        {
          module: 'energy', target: '.ens-pq-rings',
          title: 'Power quality',
          body: 'These rings watch power factor and UPS health. Poor power factor wastes capacity and can draw penalties; the UPS protects sensitive tools through any grid sag.',
          why: 'A power-quality event can scrap in-process wafers across a whole bay.'
        },
        {
          module: 'energy', target: '.panel.col-12 .tbl',
          title: 'kWh per move — not PUE',
          body: 'Process load is broken out by area, normalized to energy per wafer move. Fabs track the facility-to-process overhead ratio and kWh/move — PUE was built for data centers, not cleanrooms.',
          why: 'Energy per good wafer is the metric that ties power to product.'
        },
        {
          module: 'sustainability', target: '.sus-hero', beat: 'intro',
          title: 'Sustainability',
          body: 'This band rolls the shift up to its footprint: a CO₂e rate, renewable share and water reuse, with the day’s running emissions as the big read. Scope 2, straight from grid power.',
          why: 'Grid-power carbon (Scope 2) is the largest lever most fabs can pull.'
        },
        {
          module: 'sustainability', target: '.sus-ringrow',
          title: 'The footprint rings',
          body: 'Three gauges — CO₂e rate, renewable percent, and water reuse. They move with the generation mix and reclaim flow, turning operations into a footprint the desk can defend.',
          why: 'Renewable share and reuse are the numbers auditors and customers ask for.'
        },
        {
          module: 'sustainability', target: '.sus-mix',
          title: 'Generation mix & water balance',
          body: 'The stacked bar is live generation mix — grid versus on-site renewable. Below, the water-balance strip traces make-up into reclaim into net draw, closing the loop visually.',
          why: 'Carbon intensity swings with the mix; timing big loads to clean power helps.'
        }
      ]
    },
    {
      name: 'Eyes on Everything',
      steps: [
        {
          module: 'production', target: '.stream', beat: 'intro',
          title: 'The event stream',
          body: 'The right rail is the live SECS/GEM feed. Lot and job events fire as CEIDs — collection-event IDs — while alarms arrive as S5F1 ALIDs. Use the filters to isolate AMHS, FDC or alarms.',
          why: 'CEIDs and ALIDs are the fab’s ground-truth event vocabulary.'
        },
        {
          module: 'production', target: '.alarmbanner',
          title: 'Active-alarm banner',
          body: 'When an alarm sets, this banner surfaces the worst active ALID and a live count. Click it to drop down the full active list — and the history of everything that fired this shift.',
          why: 'One glance tells the desk whether the floor needs hands right now.',
          dur: 8000
        },
        {
          module: 'production', target: '.cockpit', beat: 'intro',
          title: 'The time-machine cockpit',
          body: 'The bottom bar is a 180-minute timeline: a demand lane, alarm spans, and the E10 state ribbon. Scrub to any moment, or click an alarm to replay its cause-chain at 1.5×.',
          why: 'Replaying the minutes around an alarm is how root cause gets found.'
        },
        {
          module: 'trends', target: '.thw-band', beat: 'intro',
          title: 'The historian wall',
          body: 'Every subsystem gets a trend with now / min / avg / max chips and a hover crosshair. This is the historian — where the desk reads drift and correlation across the whole shift.',
          why: 'Trends turn a snapshot into a story: cause, effect, and lead time.'
        },
        {
          module: 'masterdata', target: '.md-tree', beat: 'intro',
          title: 'Master data & asset hierarchy',
          body: 'The tree is the asset model — areas, tools, and chambers — backing every view you’ve seen. The registry holds the full tool fleet with its kind and family.',
          why: 'Clean master data is what makes every other number trustworthy.'
        },
        {
          module: 'masterdata', target: '.md-st-wrap',
          title: 'E10 state-time, allocated',
          body: 'This strip allocates each tool’s shift across its E10 states. Roll it up and you have utilization; cross it with energy and you have cost and carbon per state.',
          why: 'State-time allocation is the bridge from equipment data to facility cost.'
        }
      ]
    },
    {
      name: 'Keep Exploring',
      steps: [
        {
          module: 'overview', target: null, beat: 'outro',
          title: 'The desk is yours',
          body: 'Press 1–9 to jump straight to any module, ← / → to walk them in order, and Space, comma and period to play, pause and step the clock. Click any alarm to replay it.',
          why: 'A control room rewards the operator who knows the shortcuts cold.'
        },
        {
          module: 'overview', target: null, beat: 'outro',
          title: 'Re-run this tour anytime',
          body: 'The GUIDED TOUR button up in the top bar restarts this walkthrough whenever you want a refresher. Otherwise — explore on your own. Every number on screen is live and coupled.',
          why: 'The best way to learn a fab console is to drive it.'
        }
      ]
    }
  ];

  // Flatten chapters into a linear step list, tagging each with its chapter name + index.
  var STEPS = [];
  (function () {
    for (var c = 0; c < CHAPTERS.length; c++) {
      var ch = CHAPTERS[c];
      for (var s = 0; s < ch.steps.length; s++) {
        var st = ch.steps[s];
        st._chapter = ch.name;
        st._chapterIdx = c;
        STEPS.push(st);
      }
    }
  })();

  // ---- Runtime state -----------------------------------------------------
  var active = false;
  var idx = 0;
  var paused = false;
  var built = false;
  var advanceTid = null;     // auto-advance setTimeout
  var posTid1 = null, posTid2 = null;  // post-route reposition timers
  var stepStartedAt = 0;     // wall ms when current step's timer began
  var stepRemaining = 0;     // ms left when paused

  // DOM refs (built once)
  var root, dim, spot, card, hint, modal;
  var elChapter, elTitle, elBody, elWhy, elProg, elBar;
  var btnPrev, btnPause, btnNext;

  // ---- Build the tour DOM (once) ----------------------------------------
  function buildDom() {
    if (built) return;
    built = true;

    root = el('div', 'tour-root');
    root.style.display = 'none';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', t('Guided tour'));

    // Dim layer (catches outside clicks -> exit). The spotlight box itself carries
    // the big box-shadow that does the dimming; this layer is a transparent click trap.
    dim = el('div', 'tour-dim');
    dim.addEventListener('click', function () { stop(); });
    root.appendChild(dim);

    // Spotlight cutout box (its box-shadow dims everything around it).
    spot = el('div', 'tour-spot');
    root.appendChild(spot);

    // "click outside to exit" hint
    hint = el('div', 'tour-hint', t('Click outside the highlight to exit · Esc'));
    root.appendChild(hint);

    // Caption card
    card = el('div', 'tour-card');
    var head = el('div', 'tour-card-h');
    elChapter = el('span', 'tour-chapter', '');
    elProg = el('span', 'tour-prog', '');
    head.appendChild(elChapter);
    head.appendChild(elProg);
    card.appendChild(head);

    elTitle = el('div', 'tour-title', '');
    card.appendChild(elTitle);
    elBody = el('div', 'tour-body', '');
    card.appendChild(elBody);
    elWhy = el('div', 'tour-why', '');
    card.appendChild(elWhy);

    var ctrls = el('div', 'tour-ctrls');
    btnPrev = el('button', 'tour-btn', t('Prev'));
    btnPrev.addEventListener('click', function (e) { e.stopPropagation(); prev(); });
    btnPause = el('button', 'tour-btn tour-btn-pause', t('Pause'));
    btnPause.addEventListener('click', function (e) { e.stopPropagation(); togglePause(); });
    btnNext = el('button', 'tour-btn tour-btn-next', t('Next'));
    btnNext.addEventListener('click', function (e) { e.stopPropagation(); next(); });
    var btnExit = el('button', 'tour-btn tour-btn-exit', t('Exit'));
    btnExit.addEventListener('click', function (e) { e.stopPropagation(); stop(); });
    ctrls.appendChild(btnPrev);
    ctrls.appendChild(btnPause);
    ctrls.appendChild(btnNext);
    ctrls.appendChild(btnExit);
    card.appendChild(ctrls);

    // Progress bar (fills over step duration)
    var progWrap = el('div', 'tour-pbar');
    elBar = el('i');
    progWrap.appendChild(elBar);
    card.appendChild(progWrap);

    // Clicks inside the card must not bubble to the dim (which would exit).
    card.addEventListener('click', function (e) { e.stopPropagation(); });

    root.appendChild(card);
    document.body.appendChild(root);
  }

  // ---- Welcome modal (first-visit gate) ---------------------------------
  function buildModal() {
    if (modal) return;
    modal = el('div', 'tour-modal-root');
    modal.style.display = 'none';
    var box = el('div', 'tour-modal');
    box.addEventListener('click', function (e) { e.stopPropagation(); });
    box.appendChild(el('div', 'tour-modal-eyebrow', 'bas‑ems'));
    box.appendChild(el('div', 'tour-modal-title', t('Guided tour of the fab BAS/EMS')));
    box.appendChild(el('div', 'tour-modal-body',
      t('Take a 3-minute walkthrough of the whole console — from facility demand and the live fab floor, ' +
        'through cleanroom, cooling, water and exhaust, out to the energy and sustainability desks.')));
    var row = el('div', 'tour-modal-ctrls');
    var startBtn = el('button', 'tour-btn tour-btn-next tour-modal-start', t('Start tour'));
    startBtn.addEventListener('click', function (e) { e.stopPropagation(); hideModal(); start(); });
    var skipBtn = el('button', 'tour-btn tour-modal-skip', t('Explore on my own'));
    skipBtn.addEventListener('click', function (e) { e.stopPropagation(); hideModal(); });
    row.appendChild(startBtn);
    row.appendChild(skipBtn);
    box.appendChild(row);
    modal.appendChild(box);
    // Click on backdrop = dismiss (explore on own)
    modal.addEventListener('click', function () { hideModal(); });
    document.body.appendChild(modal);
  }

  function showModal() {
    buildModal();
    modal.style.display = 'flex';
  }
  function hideModal() {
    if (modal) modal.style.display = 'none';
  }

  // ---- localStorage gate (file:// safe) ---------------------------------
  function tourSeen() {
    try { return window.localStorage.getItem(SEEN_KEY) === '1'; }
    catch (e) { return false; }   // storage blocked (file://) -> treat as unseen
  }
  function markSeen() {
    try { window.localStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* no-op */ }
  }

  // ---- Routing helper ----------------------------------------------------
  function routeTo(moduleId) {
    if (BAS.app && BAS.app.active === moduleId) return false;  // already there
    location.hash = '#' + moduleId;
    return true;
  }

  // Resolve a step's target. Module-local selectors (e.g. .pg-hero, .heat-grid)
  // can collide with hidden, already-mounted sibling modules, so we search the
  // *visible* module container first and only fall back to a document-wide query.
  // The visible module root is the one child of .content with display != 'none'.
  function resolveTarget(selector) {
    if (!selector) return null;
    var content = document.querySelector('.content');
    if (content) {
      var kids = content.children;
      for (var i = 0; i < kids.length; i++) {
        var k = kids[i];
        if (k.style.display !== 'none') {
          var hit = k.querySelector(selector);
          if (hit) return hit;
          break;   // only the one visible module matters
        }
      }
    }
    // Fallback: shell-level anchors (.stream, .alarmbanner, .cockpit) live outside
    // .content, so a document-wide query is the correct resolver for those.
    return document.querySelector(selector);
  }

  // ---- Spotlight positioning --------------------------------------------
  // Computed only on step change + window resize (never per-frame).
  function positionSpotlight() {
    if (!active) return;
    var step = STEPS[idx];
    var target = resolveTarget(step.target);
    var vw = window.innerWidth, vh = window.innerHeight;

    if (!target) {
      // Whole-page fallback: no cutout. Hide the spot box (so its shadow doesn't
      // dim) and let the dim layer carry a flat scrim instead.
      spot.style.display = 'none';
      dim.classList.add('flat');
      placeCard(null, vw, vh);
      return;
    }

    var r = target.getBoundingClientRect();
    // Skip degenerate / off-screen rects gracefully -> fall back to whole page.
    if (r.width < 2 || r.height < 2) {
      spot.style.display = 'none';
      dim.classList.add('flat');
      placeCard(null, vw, vh);
      return;
    }

    dim.classList.remove('flat');
    spot.style.display = '';
    var pad = 8;
    var x = Math.max(2, r.left - pad);
    var y = Math.max(2, r.top - pad);
    var w = Math.min(vw - 4, r.right + pad) - x;
    var h = Math.min(vh - 4, r.bottom + pad) - y;
    spot.style.left = x + 'px';
    spot.style.top = y + 'px';
    spot.style.width = w + 'px';
    spot.style.height = h + 'px';

    placeCard({ x: x, y: y, w: w, h: h }, vw, vh);
  }

  // Place the caption card near the spotlight, flipping to whichever side has room.
  function placeCard(box, vw, vh) {
    var cw = card.offsetWidth || 360;
    var chh = card.offsetHeight || 200;
    var gap = 16;
    var left, top;

    if (!box) {
      // Whole-page: center-bottom.
      left = Math.round((vw - cw) / 2);
      top = Math.round(vh - chh - 40);
    } else {
      var spaceBelow = vh - (box.y + box.h);
      var spaceAbove = box.y;
      var spaceRight = vw - (box.x + box.w);
      var spaceLeft = box.x;

      if (spaceBelow >= chh + gap) {
        top = box.y + box.h + gap;
        left = clamp(box.x + box.w / 2 - cw / 2, gap, vw - cw - gap);
      } else if (spaceAbove >= chh + gap) {
        top = box.y - chh - gap;
        left = clamp(box.x + box.w / 2 - cw / 2, gap, vw - cw - gap);
      } else if (spaceRight >= cw + gap) {
        left = box.x + box.w + gap;
        top = clamp(box.y + box.h / 2 - chh / 2, gap, vh - chh - gap);
      } else if (spaceLeft >= cw + gap) {
        left = box.x - cw - gap;
        top = clamp(box.y + box.h / 2 - chh / 2, gap, vh - chh - gap);
      } else {
        // No room beside it — overlay bottom-center as a last resort.
        left = clamp((vw - cw) / 2, gap, vw - cw - gap);
        top = clamp(vh - chh - 40, gap, vh - chh - gap);
      }
    }
    card.style.left = Math.round(left) + 'px';
    card.style.top = Math.round(top) + 'px';
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // ---- Step rendering ----------------------------------------------------
  function renderStep() {
    var step = STEPS[idx];
    elChapter.textContent = t(step._chapter);
    elProg.textContent = (idx + 1) + ' / ' + STEPS.length;
    elTitle.textContent = t(step.title);
    elBody.textContent = t(step.body);
    elWhy.textContent = t(step.why);
    card.setAttribute('data-beat', step.beat || '');
    btnPrev.disabled = (idx === 0);
    // Static control labels also re-translated each render (cheap, not per-frame).
    btnPrev.textContent = t('Prev');
    btnPause.textContent = paused ? t('Resume') : t('Pause');
    btnNext.textContent = (idx === STEPS.length - 1) ? t('Finish') : t('Next');
  }

  // Run a step: route if needed, then position spotlight (twice, post-stagger),
  // then start the auto-advance timer + progress bar.
  function runStep() {
    clearAdvance();
    clearPosTimers();
    renderStep();

    var step = STEPS[idx];
    var routed = routeTo(step.module);

    if (routed) {
      // Reposition after the view-enter stagger settles (two passes max).
      posTid1 = setTimeout(positionSpotlight, 400);
      posTid2 = setTimeout(positionSpotlight, 900);
    } else {
      // Already on the right module — position now (next frame for layout).
      positionSpotlight();
      posTid2 = setTimeout(positionSpotlight, 200);
    }

    startTimer(step.dur || DEFAULT_DUR);
  }

  // ---- Auto-advance timer + progress bar --------------------------------
  function startTimer(dur) {
    stepRemaining = dur;
    stepStartedAt = nowMs();
    armBar(dur);
    if (advanceTid) clearTimeout(advanceTid);
    advanceTid = setTimeout(function () {
      if (idx < STEPS.length - 1) next();
      else stop();   // last step auto-finishes the tour
    }, dur);
  }

  function armBar(dur) {
    if (!elBar) return;
    // Reset to 0 width with no transition, force reflow, then animate to 100%.
    elBar.style.transition = 'none';
    elBar.style.width = '0%';
    // force reflow
    void elBar.offsetWidth;
    if (reducedMotion) {
      // No smooth animation under reduced-motion — step to full immediately.
      elBar.style.transition = 'none';
      elBar.style.width = '100%';
    } else {
      elBar.style.transition = 'width ' + dur + 'ms linear';
      elBar.style.width = '100%';
    }
  }

  function freezeBar() {
    if (!elBar || reducedMotion) return;
    // Snapshot current computed width and pin it (stop the CSS animation).
    var w = getComputedStyle(elBar).width;
    var parentW = elBar.parentNode ? elBar.parentNode.offsetWidth : 1;
    var pct = parentW ? (parseFloat(w) / parentW) * 100 : 0;
    elBar.style.transition = 'none';
    elBar.style.width = pct + '%';
  }

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : (+new Date());
  }

  // ---- Navigation --------------------------------------------------------
  function next() {
    if (!active) return;
    if (idx < STEPS.length - 1) { idx++; runStep(); }
    else stop();
  }
  function prev() {
    if (!active) return;
    if (idx > 0) { idx--; runStep(); }
  }

  function togglePause() {
    if (!active) return;
    if (paused) resume(); else pause();
  }
  function pause() {
    if (paused) return;
    paused = true;
    // Compute remaining time from elapsed, halt timer + bar.
    var elapsed = nowMs() - stepStartedAt;
    stepRemaining = Math.max(0, stepRemaining - elapsed);
    if (advanceTid) { clearTimeout(advanceTid); advanceTid = null; }
    freezeBar();
    btnPause.textContent = t('Resume');
    root.classList.add('paused');
  }
  function resume() {
    if (!paused) return;
    paused = false;
    btnPause.textContent = t('Pause');
    root.classList.remove('paused');
    startTimer(stepRemaining > 0 ? stepRemaining : (STEPS[idx].dur || DEFAULT_DUR));
  }

  // ---- Timers cleanup ----------------------------------------------------
  function clearAdvance() {
    if (advanceTid) { clearTimeout(advanceTid); advanceTid = null; }
  }
  function clearPosTimers() {
    if (posTid1) { clearTimeout(posTid1); posTid1 = null; }
    if (posTid2) { clearTimeout(posTid2); posTid2 = null; }
  }

  // ---- Keyboard (bound only while active) --------------------------------
  function onKey(e) {
    if (!active) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); prev(); }
    else if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); togglePause(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stop(); }
  }

  function onResize() {
    if (!active) return;
    positionSpotlight();
  }

  // ---- Lifecycle ---------------------------------------------------------
  function start() {
    hideModal();
    buildDom();
    if (active) { idx = 0; paused = false; btnPause.textContent = t('Pause'); runStep(); return; }
    active = true;
    paused = false;
    idx = 0;
    markSeen();
    root.style.display = '';
    btnPause.textContent = t('Pause');
    root.classList.remove('paused');
    // Bind keyboard in capture phase so we win over the shell's digit/arrow handlers.
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    if (refsDemoBtnSetState) refsDemoBtnSetState(true);
    runStep();
  }

  function stop() {
    if (!active) return;
    active = false;
    paused = false;
    clearAdvance();
    clearPosTimers();
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    if (root) root.style.display = 'none';
    if (refsDemoBtnSetState) refsDemoBtnSetState(false);
  }

  // Shell registers a callback so the GUIDED TOUR button reflects active state.
  var refsDemoBtnSetState = null;
  function onButtonStateChange(fn) { refsDemoBtnSetState = fn; }

  // ---- First-visit auto-show (called by shell after build) --------------
  function maybeAutoShow() {
    if (tourSeen()) return;   // already seen -> don't nag
    showModal();
  }

  BAS.tour = {
    start: start,
    stop: stop,
    toggle: function () { if (active) stop(); else start(); },
    get active() { return active; },
    maybeAutoShow: maybeAutoShow,
    onButtonStateChange: onButtonStateChange,
    _steps: STEPS,
    _chapters: CHAPTERS
  };
})(window.BAS);
