/* bas-ems — i18n (site-wide UI-chrome translation)
 * Classic script -> window.BAS.i18n. Loaded FIRST among src scripts; no deps.
 *
 * Design constraints honoured:
 *  - Classic IIFE, no ES modules, no fetch/XHR — dictionaries live inline below.
 *  - file:// safe: localStorage gated in try/catch; locale switch also rewrites the
 *    ?lang= query so it survives even when storage is blocked on file://.
 *  - t() is a plain object-property lookup (dict[s] || s). NO regex/split per call,
 *    so it is safe to call at mount/build time and even (cheaply) per render.
 *  - en is the identity locale (empty dict). Only UI chrome + narration are
 *    translated; ALL engine text (SECS/GEM events, alarm text, lot/job ids),
 *    SEMI E10 state names, units (MW/kW/RT/CFM/MΩ·cm/ppb/t·h…), and protocol
 *    tokens (CEID/ALID/OEE/PUE/ISO 14644/18.2 MΩ·cm) stay English by design.
 *
 * Locale resolution at load:  ?lang=zh|en  >  localStorage 'bas.lang'  >
 *                             navigator.language startsWith('zh')  >  'en'.
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';

  var STORE_KEY = 'bas.lang';

  // ---- dictionaries ------------------------------------------------------
  // en is identity (empty map). zh keys are the EXACT English source strings.
  var dicts = {
    en: {},
    zh: {
      // ===== shell: brand / sim / topbar chrome =====
      'Fab Building Automation · Energy Mgmt': '晶圓廠廠務自動化 · 能源管理',
      'Simulation · Synthetic Data': '模擬 · 合成資料',
      'GUIDED TOUR': '導覽',
      'Guided tour — a narrated walkthrough of the whole console (D)':
        '導覽 — 帶解說走過整個控制台（按 D）',
      'Simulation clock': '模擬時鐘',
      'Demo mode — live production → facility coupling':
        '展示模式 — 即時生產 → 廠務耦合',

      // ===== shell: language toggle =====
      '中文': 'EN',   // label shown depends on active lang; both keys present for symmetry

      // ===== shell: topbar KPI labels =====
      'Total Demand': '總需量',
      'Facility Overhead': '廠務負載占比',
      'Fleet OEE': '機台群 OEE',
      'Wafer Moves/h': '晶圓 Moves/時',
      'Demand vs Peak': '需量 / 峰值',

      // ===== shell: nav group names =====
      'Operations': '營運',
      'BAS': 'BAS',
      'EMS': 'EMS',
      'Master Data': '主檔資料',

      // ===== shell: module titles (nav labels + view headings) =====
      'Command Center': '指揮中心',
      'Production Floor': '生產現場',
      'Trends / Historian': '趨勢 / 歷史資料',
      'Cleanroom': '無塵室',
      'Cooling / CHW': '冰水 / 冷卻',
      'Ultrapure Water': '超純水',
      'Gas & Exhaust': '氣體 / 排氣',
      'Energy Center': '能源中心',
      'Sustainability': '永續',

      // ===== shell: event rail =====
      'Event Stream': '事件串流',
      'Filter event stream': '篩選事件串流',
      'All': '全部',
      'Lot/Job': '批貨/製程',
      'AMHS': 'AMHS',
      'FDC': 'FDC',
      'Alarm': '警報',

      // ===== shell: alarm banner / dropdown =====
      'active alarm': '筆有效警報',
      'active alarms': '筆有效警報',
      'Active Alarms': '有效警報',
      'Alarm History': '警報歷史',
      'History': '歷史',
      'Active': '有效',
      'Close': '關閉',
      'No active alarms': '無有效警報',
      'No alarm history yet': '尚無警報歷史',

      // ===== timeline cockpit: transport pills =====
      'LIVE': '即時',
      'PAUSED': '暫停',
      'REPLAY': '回放',

      // ===== shell: demo caption module labels =====
      'Command Center — facility demand, isometric fab cutaway & energy flow':
        '指揮中心 — 廠務需量、等角廠房剖視與能流',
      'Production Floor — tool states, lot tracking & AMHS moves':
        '生產現場 — 機台狀態、批貨追蹤與 AMHS 搬運',
      'Trends & Historian — 180-min KPI sparklines for all subsystems':
        '趨勢與歷史 — 全子系統 180 分鐘 KPI 走勢',
      'Cleanroom HVAC — ISO 14644 zone pressure & FFU airflow':
        '無塵室空調 — ISO 14644 區域壓差與 FFU 風量',
      'PCW Cooling — process-chilled-water loop temperatures & flow':
        '製程冰水 — PCW 迴路溫度與流量',
      'Gas & Exhaust — acid/base/solvent CFM abatement balance':
        '氣體與排氣 — 酸/鹼/有機溶劑 CFM 尾氣處理平衡',
      'Energy Distribution — facility MW breakdown by subsystem':
        '能源分配 — 各子系統廠務 MW 拆解',
      'Sustainability — CO₂e rate & rolling cost analytics':
        '永續 — CO₂e 排放率與滾動成本分析',
      'Master Data — tool registry, E10 state-time allocation':
        '主檔資料 — 機台清冊、E10 狀態時間分攤',

      // ===== tour: modal =====
      'Guided tour of the fab BAS/EMS': '晶圓廠 BAS/EMS 導覽',
      'Take a 3-minute walkthrough of the whole console — from facility demand and the live fab floor, through cleanroom, cooling, water and exhaust, out to the energy and sustainability desks.':
        '用 3 分鐘走過整個控制台 — 從廠務需量、即時生產現場，經無塵室、冰水、超純水與排氣，一路到能源與永續看板。',
      'Start tour': '開始導覽',
      'Explore on my own': '自行探索',

      // ===== tour: controls + hint =====
      'Prev': '上一步',
      'Pause': '暫停',
      'Resume': '繼續',
      'Next': '下一步',
      'Finish': '完成',
      'Exit': '離開',
      'Click outside the highlight to exit · Esc': '點選反白區外即可離開 · Esc',
      'Guided tour': '導覽',

      // ===== tour: chapter names =====
      'Mission Overview': '任務總覽',
      'The Live Fab': '即時廠房',
      'Shift-Start Walkdown (BAS)': '交接班巡檢（BAS）',
      'Energy Desk (EMS)': '能源看板（EMS）',
      'Eyes on Everything': '全面監視',
      'Keep Exploring': '繼續探索',

      // ===== tour: step 1 — Welcome =====
      'Welcome to the fab control room': '歡迎來到晶圓廠控制室',
      'This is a semiconductor fab’s Building Automation (BAS) and Energy Management (EMS) console. One synthetic shift, fully coupled — process activity drives every facility system you’ll see.':
        '這是一座半導體晶圓廠的廠務自動化（BAS）與能源管理（EMS）控制台。一個合成班別、完全耦合 — 製程活動驅動你所看到的每一套廠務系統。',
      'A fab is a building and a factory at once; the two must be read together.':
        '晶圓廠既是建築也是工廠，兩者必須一起看。',

      // ===== tour: step 2 — Facility demand =====
      'Facility demand, live': '即時廠務需量',
      'The hero band shows total electrical demand against the metered peak. Watch the bar breathe as tool load shifts — this is the number the utility bills against.':
        '主視覺帶顯示總用電需量對比計量尖峰。隨機台負載變化看著長條起伏 — 這正是台電據以計費的數字。',
      'Demand charges are set by your worst 15-minute peak, not average use.':
        '需量費率取決於最差的 15 分鐘尖峰，而非平均用電。',

      // ===== tour: step 3 — Energy stack =====
      'The energy stack, in section': '能源堆疊剖視',
      'The isometric cutaway splits the building into sub-fab (pumps, chillers, abatement), fab (process tools, FFUs), and roof (cooling towers, exhaust fans). Most power lives below the cleanroom.':
        '等角剖視把建築分為地下層（泵浦、冰機、尾氣處理）、製程層（製程機台、FFU）與屋頂層（冷卻水塔、排氣風機）。大部分用電其實在無塵室之下。',
      'Two-thirds of fab energy is facility overhead, not the tools themselves.':
        '晶圓廠三分之二的能耗是廠務負載，而非機台本身。',

      // ===== tour: step 4 — Sankey =====
      'Where the megawatts go': '百萬瓦流向何處',
      'The Sankey traces incoming grid and on-site renewable power out to each subsystem. Band width is live load — the widest ribbons are your biggest decarbonization targets.':
        'Sankey 圖追蹤外購市電與廠內再生能源流向各子系統。帶寬即時負載 — 最寬的帶子就是你最大的減碳目標。',
      'You cannot cut what you cannot see flowing.':
        '看不見流向，就無從削減。',

      // ===== tour: step 5 — Load by area =====
      'Load by process area': '各製程區負載',
      'Each tile is a process area — litho, etch, diffusion, CMP, wet, implant. The matrix ranks them by live draw so the desk knows which bay is leaning on the plant right now.':
        '每格代表一個製程區 — 微影、蝕刻、擴散、CMP、濕製程、離子植入。矩陣依即時用電排序，讓值班人員知道此刻哪個 bay 最吃廠務。',
      'Area-level visibility is the first step to allocating cost and carbon.':
        '製程區層級可視化，是分攤成本與碳排的第一步。',

      // ===== tour: step 6 — Production drives =====
      'Production drives the building': '生產驅動整棟建築',
      'Each particle is a SECS/GEM event — a lot move, a job start, an AMHS handoff — streaming from a process area to the facility system it loads. This is the coupling, made visible.':
        '每個粒子都是一筆 SECS/GEM 事件 — 批貨搬運、製程開始、AMHS 交接 — 從製程區流向它所牽動的廠務系統。這就是被視覺化的耦合。',
      'Every wafer move pulls power, water, gas and exhaust behind it.':
        '每一次晶圓搬運，背後都牽動電、水、氣與排氣。',

      // ===== tour: step 7 — Live floor stats =====
      'Live floor stats': '即時現場統計',
      'These overlay chips read straight off the floor: wafers in motion, active jobs, current moves-per-hour. They give the running pulse of the shift without leaving the stage.':
        '這些浮層數字直接讀自現場：移動中的晶圓、進行中的製程、當前每小時 moves。不離開舞台就能掌握整班脈動。',
      'Throughput and facility load rise and fall together — read them side by side.':
        '產出與廠務負載同起同落 — 並排一起看。',

      // ===== tour: step 8 — OEE =====
      'OEE = Availability × Performance × Quality': 'OEE = 稼動率 × 效能 × 良率',
      'The ring cluster decomposes Overall Equipment Effectiveness. The headline OEE is the product of the other three — a single ring can’t lie about a weak link upstream.':
        '環形群拆解整體設備效率（OEE）。主 OEE 是其餘三者的乘積 — 任一環都瞞不住上游的弱點。',
      'OEE ties tool uptime directly to the energy spent per good wafer.':
        'OEE 把機台稼動直接連到每片良品晶圓的耗能。',

      // ===== tour: step 9 — E10 states =====
      'SEMI E10 equipment states': 'SEMI E10 設備狀態',
      'Each bar is an area’s time split across E10 states: Productive, Standby, Engineering, Scheduled and Unscheduled Down, Non-Scheduled. The color mix is the real health of the fleet.':
        '每條長條是一個製程區在 E10 各狀態的時間拆分：Productive、Standby、Engineering、Scheduled 與 Unscheduled Down、Non-Scheduled。配色比例就是機台群的真實健康度。',
      'Unscheduled Down is the most expensive color on the chart.':
        'Unscheduled Down 是圖上最昂貴的顏色。',

      // ===== tour: step 10 — State colors =====
      'Reading the state colors': '判讀狀態配色',
      'The shared legend keys every E10 color used across the console. Standby still draws facility load — idle tools keep their environment conditioned even when not processing.':
        '共用圖例標明控制台各處用到的每個 E10 顏色。Standby 仍在吃廠務 — 機台閒置時，環境調控照樣運轉。',
      'Idle does not mean off; standby energy is a real, trackable line item.':
        '閒置不等於關機；待機能耗是一筆真實可追蹤的帳。',

      // ===== tour: step 11 — Cleanroom HVAC =====
      'Cleanroom HVAC': '無塵室空調',
      'The cleanroom is graded to ISO 14644 particle classes. This band watches the air that keeps it there — temperature, humidity, fan-filter units and the pressure cascade between bays.':
        '無塵室依 ISO 14644 微粒等級分級。這條帶監看維持等級的空氣 — 溫度、濕度、風機過濾單元（FFU）與各 bay 之間的壓差級聯。',
      'Particle control is an HVAC problem before it is a chemistry problem.':
        '微粒控制先是空調問題，才是化學問題。',

      // ===== tour: step 12 — Bay heat-grid =====
      'The bay heat-grid': 'Bay 熱區格圖',
      'Each tile is a cleanroom bay glowing with its live status. The floor plan lets the desk spot a drifting zone at a glance, before it shows up as a particle excursion.':
        '每格是一個無塵室 bay，以即時狀態發光。平面配置讓值班人員一眼揪出飄移中的區域，搶在它變成微粒異常之前。',
      'A single bay losing pressure can contaminate its neighbors downstream.':
        '一個 bay 壓力失守，就可能污染下游鄰區。',

      // ===== tour: step 13 — Pressure cascade =====
      'Pressure cascade & FFU airflow': '壓差級聯與 FFU 風量',
      'The KPI strip tracks the differential-pressure cascade and fan-filter-unit airflow. Cleaner bays sit at higher pressure so air always flows from clean to less-clean.':
        'KPI 列追蹤差壓級聯與 FFU 風量。越潔淨的 bay 壓力越高，讓空氣永遠由潔淨流向較不潔淨處。',
      'FFUs are a 24/7 load — they run whether or not a tool is processing.':
        'FFU 是 24 小時全天候負載 — 不管機台有沒有在跑都得運轉。',

      // ===== tour: step 14 — Process cooling water =====
      'Process cooling water': '製程冷卻水',
      'Process tools dump heat into the PCW loop. This plant hero shows loop efficiency and the live plant kW it takes to reject that heat back out through the towers.':
        '製程機台把熱排進 PCW 迴路。這個機房主視覺顯示迴路效率，以及透過水塔把熱排掉所需的即時機房 kW。',
      'Cooling is one of the three biggest facility loads in any fab.':
        '冷卻是任何晶圓廠三大廠務負載之一。',

      // ===== tour: step 15 — kW/RT =====
      'Plant efficiency in kW per ton': '機房效率（kW/RT）',
      'The signature dial reads kW per refrigeration-ton — the canonical chiller-plant efficiency metric. Lower is better; the dial drifts as chillers stage up and down with demand.':
        '主儀表讀出每冷凍噸 kW（kW/RT）— 冰水機房效率的標準指標。越低越好；儀表隨冰機依需求加減載而飄移。',
      'A tenth of a kW/RT across the plant is real money over a shift.':
        '整廠每差 0.1 kW/RT，一個班下來就是真金白銀。',

      // ===== tour: step 16 — P&ID =====
      'The P&ID schematic': 'P&ID 管路圖',
      'The piping-and-instrumentation diagram shows the chilled-water loop: chillers, pumps, headers and the staging logic that brings machines online as the heat load climbs.':
        '管路與儀錶圖（P&ID）呈現冰水迴路：冰機、泵浦、集管，以及隨熱負載上升而加機上線的加減載邏輯。',
      'Staging the right number of chillers is the single biggest efficiency lever.':
        '冰機上線台數抓得準，是效率最大的一根槓桿。',

      // ===== tour: step 17 — Ultra-pure water =====
      'Ultra-pure water': '超純水',
      'UPW is the fab’s most-used chemical. This signature band watches the two numbers that define it: resistivity and total organic carbon, plus make-up flow and reclaim.':
        '超純水（UPW）是晶圓廠用量最大的化學品。這條主視覺帶監看定義它的兩個數字：電阻率與總有機碳（TOC），外加補水流量與回收。',
      'A wafer can touch UPW hundreds of times; off-spec water scraps lots.':
        '一片晶圓會接觸超純水數百次；水質不合規就報廢整批。',

      // ===== tour: step 18 — 18.2 MΩ·cm =====
      '18.2 MΩ·cm and TOC in ppb': '18.2 MΩ·cm 與 ppb 級 TOC',
      'The large ring holds resistivity at its 18.2 megaohm-centimeter theoretical maximum — the purer the water, the higher it reads. The small ring tracks organic carbon in parts per billion.':
        '大環把電阻率穩在 18.2 MΩ·cm 的理論上限 — 水越純，讀值越高。小環以 ppb 追蹤有機碳。',
      'Resistivity is the live proof the polish loop is doing its job.':
        '電阻率就是拋光迴路有在做事的即時證據。',

      // ===== tour: step 19 — UPW trains =====
      'Make-up, polish & reclaim': '補水、拋光與回收',
      'These cards are the UPW trains — make-up production, the polishing loop, and storage. Reclaim returns rinse water to the front of the plant instead of to drain.':
        '這些卡片是超純水的處理列 — 補水製造、拋光迴路與儲槽。回收把沖洗水送回廠頭，而不是排放掉。',
      'Reclaim cuts both the water bill and the energy to purify fresh make-up.':
        '水回收同時省下水費與製造新補水的能耗。',

      // ===== tour: step 20 — Gas & exhaust =====
      'Gas & exhaust abatement': '氣體與排氣尾氣處理',
      'Process exhaust splits into streams — acid, solvent, heat and general. The big read is total CFM; the split shows how much of each the abatement plant is handling right now.':
        '製程排氣分流 — 酸、有機溶劑、熱排與一般。大數字是總 CFM；分流顯示尾氣處理機房此刻各處理多少。',
      'Exhaust must be balanced and abated before anything leaves the stack.':
        '排氣必須先平衡並處理，才能離開煙囪。',

      // ===== tour: step 21 — Scrubbers =====
      'Scrubbers & oxidizers': '洗滌塔與氧化爐',
      'Each status card is an abatement unit — a wet scrubber or thermal oxidizer — with its live state and destruction-removal efficiency. Green means it is meeting permit.':
        '每張狀態卡是一台尾氣處理設備 — 濕式洗滌塔或熱氧化爐 — 顯示即時狀態與破壞去除效率（DRE）。綠燈代表符合許可。',
      'Destruction efficiency is what keeps the fab inside its air permit.':
        '破壞效率是讓晶圓廠守住空污許可的關鍵。',

      // ===== tour: step 22 — Bulk gas =====
      'Bulk gas distribution': '大宗氣體分配',
      'The tile grid is the bulk and specialty gas distribution — nitrogen, hydrogen, process gases — each glowing with live flow. N2 alone is a massive continuous facility load.':
        '格圖是大宗與特殊氣體分配 — 氮、氫、製程氣 — 各以即時流量發光。光是氮氣就是龐大的連續廠務負載。',
      'Bulk gas runs continuously; it is overhead the tools rarely think about.':
        '大宗氣體連續供應；是機台少有意識到的廠務負載。',

      // ===== tour: step 23 — Energy demand up close =====
      'Facility demand, up close': '近看廠務需量',
      'The energy desk owns the meter. This band pairs the demand-versus-peak dial with a rolling trend and a KPI strip, so the desk can see a peak forming before it sets.':
        '能源看板掌管電表。這條帶把需量對尖峰儀表、滾動趨勢與 KPI 列並列，讓值班人員在尖峰成形前就先看到。',
      'Shaving a forecast peak by minutes can reset the month’s demand charge.':
        '把預測尖峰削掉幾分鐘，就可能重訂整月需量費。',

      // ===== tour: step 24 — Sub-metering =====
      'Sub-metering the building': '建築分表計量',
      'Each meter is a sub-metered load — process, HVAC, cooling, UPW, gas, abatement. Sub-metering is what turns one big bill into an accountable, area-by-area breakdown.':
        '每只電表是一筆分表負載 — 製程、空調、冷卻、超純水、氣體、尾氣處理。分表計量把一張大帳單變成可究責、逐區拆解的明細。',
      'You cannot allocate or reduce a load you have never metered.':
        '沒計量過的負載，既無法分攤也無法削減。',

      // ===== tour: step 25 — Power quality =====
      'Power quality': '電力品質',
      'These rings watch power factor and UPS health. Poor power factor wastes capacity and can draw penalties; the UPS protects sensitive tools through any grid sag.':
        '這些環監看功率因數與 UPS 健康度。功因不良浪費容量還可能挨罰；UPS 在任何市電瞬降時保護敏感機台。',
      'A power-quality event can scrap in-process wafers across a whole bay.':
        '一次電力品質事件，可能報廢整個 bay 在製的晶圓。',

      // ===== tour: step 26 — kWh per move =====
      'kWh per move — not PUE': 'kWh/move — 不是 PUE',
      'Process load is broken out by area, normalized to energy per wafer move. Fabs track the facility-to-process overhead ratio and kWh/move — PUE was built for data centers, not cleanrooms.':
        '製程負載依區拆解，正規化為每次晶圓 move 的能耗。晶圓廠看廠務對製程的負載比與 kWh/move — PUE 是為資料中心而設，不適用無塵室。',
      'Energy per good wafer is the metric that ties power to product.':
        '每片良品晶圓耗能，是把電力連到產品的指標。',

      // ===== tour: step 27 — Sustainability =====
      'Sustainability': '永續',
      'This band rolls the shift up to its footprint: a CO₂e rate, renewable share and water reuse, with the day’s running emissions as the big read. Scope 2, straight from grid power.':
        '這條帶把整班彙總成足跡：CO₂e 排放率、再生能源占比與水回收，以當日累計排放為主數字。範疇二，直接來自市電。',
      'Grid-power carbon (Scope 2) is the largest lever most fabs can pull.':
        '市電碳排（範疇二）是多數晶圓廠能拉的最大槓桿。',

      // ===== tour: step 28 — Footprint rings =====
      'The footprint rings': '足跡環',
      'Three gauges — CO₂e rate, renewable percent, and water reuse. They move with the generation mix and reclaim flow, turning operations into a footprint the desk can defend.':
        '三只儀表 — CO₂e 排放率、再生能源百分比與水回收。它們隨發電配比與回收流量變動，把營運化為值班人員能交代的足跡。',
      'Renewable share and reuse are the numbers auditors and customers ask for.':
        '再生能源占比與水回收，是稽核與客戶要的數字。',

      // ===== tour: step 29 — Generation mix =====
      'Generation mix & water balance': '發電配比與水平衡',
      'The stacked bar is live generation mix — grid versus on-site renewable. Below, the water-balance strip traces make-up into reclaim into net draw, closing the loop visually.':
        '堆疊長條是即時發電配比 — 市電對廠內再生能源。下方水平衡列追蹤補水→回收→淨取水，把迴路視覺化收尾。',
      'Carbon intensity swings with the mix; timing big loads to clean power helps.':
        '碳密度隨配比起伏；把大負載排在乾淨電力時段有幫助。',

      // ===== tour: step 30 — Event stream =====
      'The event stream': '事件串流',
      'The right rail is the live SECS/GEM feed. Lot and job events fire as CEIDs — collection-event IDs — while alarms arrive as S5F1 ALIDs. Use the filters to isolate AMHS, FDC or alarms.':
        '右側軌是即時 SECS/GEM 訊源。批貨與製程事件以 CEID（收集事件 ID）發出，警報則以 S5F1 ALID 到達。用篩選器隔出 AMHS、FDC 或警報。',
      'CEIDs and ALIDs are the fab’s ground-truth event vocabulary.':
        'CEID 與 ALID 是晶圓廠事件的真值語彙。',

      // ===== tour: step 31 — Alarm banner =====
      'Active-alarm banner': '有效警報橫幅',
      'When an alarm sets, this banner surfaces the worst active ALID and a live count. Click it to drop down the full active list — and the history of everything that fired this shift.':
        '當警報觸發，這條橫幅浮出最嚴重的有效 ALID 與即時筆數。點它即可展開完整有效清單 — 以及本班觸發過的全部歷史。',
      'One glance tells the desk whether the floor needs hands right now.':
        '一眼就能判斷現場此刻是否需要人手。',

      // ===== tour: step 32 — Cockpit =====
      'The time-machine cockpit': '時光機座艙',
      'The bottom bar is a 180-minute timeline: a demand lane, alarm spans, and the E10 state ribbon. Scrub to any moment, or click an alarm to replay its cause-chain at 1.5×.':
        '底部列是 180 分鐘時間軸：需量軌、警報區段與 E10 狀態帶。拖曳到任一時刻，或點警報以 1.5× 回放它的成因鏈。',
      'Replaying the minutes around an alarm is how root cause gets found.':
        '回放警報前後幾分鐘，正是找出根因的方法。',

      // ===== tour: step 33 — Historian wall =====
      'The historian wall': '歷史資料牆',
      'Every subsystem gets a trend with now / min / avg / max chips and a hover crosshair. This is the historian — where the desk reads drift and correlation across the whole shift.':
        '每個子系統都有一條趨勢，附 now / min / avg / max 數字與移動十字游標。這就是歷史資料 — 值班人員據以判讀整班的飄移與相關性。',
      'Trends turn a snapshot into a story: cause, effect, and lead time.':
        '趨勢把快照變成故事：因、果與前置時間。',

      // ===== tour: step 34 — Master data =====
      'Master data & asset hierarchy': '主檔資料與資產階層',
      'The tree is the asset model — areas, tools, and chambers — backing every view you’ve seen. The registry holds the full tool fleet with its kind and family.':
        '樹狀圖是資產模型 — 製程區、機台與腔體 — 支撐你看過的每個畫面。清冊收錄完整機台群及其類型與族系。',
      'Clean master data is what makes every other number trustworthy.':
        '乾淨的主檔資料，才讓其他每個數字可信。',

      // ===== tour: step 35 — E10 state-time =====
      'E10 state-time, allocated': 'E10 狀態時間分攤',
      'This strip allocates each tool’s shift across its E10 states. Roll it up and you have utilization; cross it with energy and you have cost and carbon per state.':
        '這條帶把每台機的整班拆攤到各 E10 狀態。彙總起來就是稼動率；再交叉能耗，就得到每狀態的成本與碳排。',
      'State-time allocation is the bridge from equipment data to facility cost.':
        '狀態時間分攤，是從設備資料通往廠務成本的橋。',

      // ===== tour: step 36 — The desk is yours =====
      'The desk is yours': '看板交給你了',
      'Press 1–9 to jump straight to any module, ← / → to walk them in order, and Space, comma and period to play, pause and step the clock. Click any alarm to replay it.':
        '按 1–9 直接跳到任一模組，← / → 依序切換，Space、逗號與句點則播放、暫停與單步時鐘。點任一警報即可回放。',
      'A control room rewards the operator who knows the shortcuts cold.':
        '控制室最愛把快捷鍵練到滾瓜爛熟的操作員。',

      // ===== tour: step 37 — Re-run =====
      'Re-run this tour anytime': '隨時可重跑導覽',
      'The GUIDED TOUR button up in the top bar restarts this walkthrough whenever you want a refresher. Otherwise — explore on your own. Every number on screen is live and coupled.':
        '上方頂列的「導覽」按鈕，隨時可重啟這趟走訪複習。否則 — 就自行探索。畫面上每個數字都是即時且耦合的。',
      'The best way to learn a fab console is to drive it.':
        '學會晶圓廠控制台最好的方法，就是親手操作它。',

      // ============================================================
      // ===== PHASE 2: module UI chrome ============================
      // ============================================================

      // ===== fab process AREA display names (master.areas[].name) =====
      'Lithography': '黃光區',
      'Etch': '蝕刻區',
      'Diffusion': '擴散區',
      'Implant': '離子植入區',
      'CMP': 'CMP 區',
      'Wet / Clean': '濕製程區',
      'Thin Film': '薄膜區',
      'Metrology': '量測區',

      // ===== cleanroom bay names (master.bays[].name = area.name + ' Bay') =====
      'Lithography Bay': '黃光區',
      'Etch Bay': '蝕刻區',
      'Diffusion Bay': '擴散區',
      'Implant Bay': '離子植入區',
      'CMP Bay': 'CMP 區',
      'Wet / Clean Bay': '濕製程區',
      'Thin Film Bay': '薄膜區',
      'Metrology Bay': '量測區',

      // ===== shell: topbar clock label =====
      'SHIFT': '輪班',

      // ===== masterdata: asset hierarchy type labels (node.type.toUpperCase()) =====
      'SITE': '廠區',
      'BUILDING': '建築',
      'FLOOR': '樓層',
      'SYSTEM': '系統',
      'ZONE': '區域',
      'EQUIPMENT': '設備',

      // ===== masterdata: point/tag descriptions from humanize() =====
      'Auxiliary analog 1': '輔助類比 1',
      'Auxiliary analog 2': '輔助類比 2',
      'Auxiliary analog 3': '輔助類比 3',
      'Auxiliary analog 4': '輔助類比 4',
      'Auxiliary analog 5': '輔助類比 5',
      'Auxiliary analog 6': '輔助類比 6',
      'Auxiliary analog 7': '輔助類比 7',
      'Auxiliary analog 8': '輔助類比 8',
      'points': '個點位',

      // ===== masterdata: tag descriptions (humanize() outputs) =====
      'State': '狀態',
      'Recipe': '配方',
      'Wafer Ct': '晶圓數',
      'Chamber Pres': '腔體壓力',
      'Rf Pwr': 'RF 功率',
      'Proc Temp': '製程溫度',
      'Flow Ar': 'Ar 流量',
      'Flow O2': 'O2 流量',
      'Exh Flow': '排氣流量',
      'Alarm Ct': '警報數',
      'Chws Temp': '冰水供水溫度',
      'Chwr Temp': '冰水回水溫度',
      'Tonnage': '冷凍噸',
      'Flow': '流量',
      'Approach': '逼近溫差',
      'Kw': 'kW',
      'Pct Load': '負載 %',
      'Evap Pres': '蒸發壓力',
      'Cond Pres': '冷凝壓力',
      'Sup Temp': '送風溫度',
      'Ret Temp': '回風溫度',
      'Sup Rh': '送風濕度',
      'Cfm': 'CFM',
      'Filter Dp': '濾網壓差',
      'Vfd Pct': 'VFD %',
      'Static Pres': '靜壓',
      'Resistivity': '電阻率',
      'Toc': 'TOC',
      'Reclaim Pct': '回收 %',
      'Tank Lvl': '槽位',
      'Pump Kw': '泵 kW',
      'Temp': '溫度',
      'Hdr Pres': '總管壓力',
      'Purity': '純度',
      'Dewpoint': '露點',
      'Valve Pos': '閥門開度',
      'Inlet Flow': '入口流量',
      'Dp': '壓差',
      'Ph': 'pH',
      'Blower Kw': '鼓風機 kW',
      'Stack Temp': '煙囪溫度',
      'Destr Eff': '破壞效率',
      'Kvar': 'kVAR',
      'Pf': '功率因數',
      'Voltage': '電壓',
      'Current': '電流',
      'Thd': 'THD',
      'Freq': '頻率',
      'Load Pct': '負載 %',

      // ===== overview: hero-sub composed tokens =====
      'peak': '峰值',
      'overhead': '廠務占比',

      // ===== energy: widget label strings (lowercased; widgets.js uppercases after tr()) =====
      'of peak': '峰值占比',
      'power factor': '功率因數',
      'ups load': 'UPS 負載',

      // ===== sustainability: ring gauge label strings =====
      'Renew': '再生能源',
      'Reuse': '廢水回用',

      // ===== cooling: hero-sub + table data tokens =====
      'staged': '台上線',
      'loop': '迴路',
      'Proc Load': '製程負載',

      // ===== gas-exhaust: hero-sub + panel-meta tokens =====
      'moved': '已排送',
      'avg destruction': '平均破壞去除率',
      'destruction': '破壞去除率',
      'header pressure': '總管壓力',
      'Oxidizer': '氧化爐',

      // ===== gas-exhaust: exhaust header seg labels (lowercase) =====
      'general': '一般',
      'heat': '熱排',
      'acid': '酸性',
      'solvent': '有機溶劑',

      // ===== gas-exhaust: gas yard schematic node labels =====
      'N2 Bulk': 'N2 儲槽',
      'O2 Bulk': 'O2 儲槽',
      'Ar Bulk': 'Ar 儲槽',
      'H2 Bulk': 'H2 儲槽',
      'Gas Hdr': '氣體總管',
      'Scrubber': '洗滌塔',

      // ===== gas-exhaust: bulk gas table row names (GASES[sym].name) =====
      'Bulk Nitrogen': '液氮',
      'Bulk Oxygen': '液氧',
      'Bulk Argon': '液氬',
      'Bulk Hydrogen': '液氫',
      'Bulk CO2': '液態 CO2',
      'Bulk Helium': '液氦',

      // ===== trends: band/spec meta tokens =====
      'spec': '規格帶',
      'band': '帶',

      // ===== cleanroom: meta text tokens =====
      'lowest': '最低',
      'online': '上線',

      // ===== UPW: schematic node labels + meta =====
      'Raw Water': '原水',
      'RO Unit': 'RO 機組',
      'Polish Loop': '拋光迴路',
      'Pt-of-Use': '使用端',

      // ===== facility asset names (master.facility.*[].name — rendered via T()) =====
      'Centrifugal Chiller 1': '離心冰機 1',
      'Centrifugal Chiller 2': '離心冰機 2',
      'Centrifugal Chiller 3': '離心冰機 3',
      'Centrifugal Chiller 4': '離心冰機 4',
      'Centrifugal Chiller 5': '離心冰機 5',
      'Centrifugal Chiller 6': '離心冰機 6',
      'Cooling Tower 1': '冷卻水塔 1',
      'Cooling Tower 2': '冷卻水塔 2',
      'Cooling Tower 3': '冷卻水塔 3',
      'CHW Pump 1': '冰水泵 1',
      'CHW Pump 2': '冰水泵 2',
      'CHW Pump 3': '冰水泵 3',
      'CHW Pump 4': '冰水泵 4',
      'PCW Loop A': 'PCW 迴路 A',
      'PCW Loop B': 'PCW 迴路 B',
      'Makeup Air Unit 1': '新風機組 1',
      'Makeup Air Unit 2': '新風機組 2',
      'Makeup Air Unit 3': '新風機組 3',
      'Makeup Air Unit 4': '新風機組 4',
      'Makeup Air Unit 5': '新風機組 5',
      'Makeup Air Unit 6': '新風機組 6',
      'Air Handling Unit 1': '空調箱 1',
      'Air Handling Unit 2': '空調箱 2',
      'Air Handling Unit 3': '空調箱 3',
      'Air Handling Unit 4': '空調箱 4',
      'Air Handling Unit 5': '空調箱 5',
      'Air Handling Unit 6': '空調箱 6',
      'Air Handling Unit 7': '空調箱 7',
      'Air Handling Unit 8': '空調箱 8',
      'UPW Train A': '超純水列 A',
      'UPW Train B': '超純水列 B',
      'Wet Scrubber 1': '濕式洗滌塔 1',
      'Wet Scrubber 2': '濕式洗滌塔 2',
      'Wet Scrubber 3': '濕式洗滌塔 3',
      'Wet Scrubber 4': '濕式洗滌塔 4',
      'Thermal Oxidizer 1': '熱氧化爐 1',
      'Thermal Oxidizer 2': '熱氧化爐 2',
      'Main Switchgear A': '主配電盤 A',
      'Main Switchgear B': '主配電盤 B',
      'UPS Module 1': 'UPS 模組 1',
      'UPS Module 2': 'UPS 模組 2',
      'UPS Module 3': 'UPS 模組 3',
      'Standby Generator 1': '備用發電機 1',
      'Standby Generator 2': '備用發電機 2',
      'Gas Cabinet 1': '氣瓶櫃 1',
      'Gas Cabinet 2': '氣瓶櫃 2',
      'Gas Cabinet 3': '氣瓶櫃 3',
      'Gas Cabinet 4': '氣瓶櫃 4',
      'Gas Cabinet 5': '氣瓶櫃 5',
      'Gas Cabinet 6': '氣瓶櫃 6',
      'Gas Cabinet 7': '氣瓶櫃 7',
      'Gas Cabinet 8': '氣瓶櫃 8',
      'Gas Cabinet 9': '氣瓶櫃 9',
      'Gas Cabinet 10': '氣瓶櫃 10',

      // ===== asset hierarchy node names (master.hierarchy — rendered via T()) =====
      'Fab 1 — Advanced Logic (300mm)': 'Fab 1 — 先進邏輯（300mm）',
      'Cleanroom': '無塵室',
      'Fab Floor': '製程層',
      'Interstitial': '夾層',
      'Central Utility Building': '中央廠務大樓',
      'Chilled Water Plant': '冰水機房',
      'UPW Plant': '超純水廠房',
      'Bulk Gas Yard': '大宗氣體儲區',
      'Electrical': '電氣',
      'Sub-Fab': '地下層',
      'Exhaust & Abatement': '排氣與尾氣處理',
      'Process Cooling Water': '製程冷卻水',

      // ===== widgets-common: shared widget labels =====
      'Area': '製程區',
      'Status': '狀態',
      'Value': '數值',
      'Load': '負載',
      'Total': '合計',

      // ===== Command Center (overview) =====
      'Facility Demand': '廠房需量',
      'Facility demand · Fab cutaway · Energy flow': '廠務需量 · 廠房剖視 · 能流',
      'live mission overview': '即時任務總覽',
      'FACILITY DEMAND': '廠房總需量',
      'Demand / Peak': '需量 / 峰值',
      'Renewable': '再生能源',
      'CO₂e': 'CO₂e',
      'Wafer Moves': '晶圓 Moves',
      'Crit': '危急',
      'Major': '重大',
      'Minor': '次要',
      'EVENT RATE': '事件速率',
      'ROOF': '屋頂層',
      'FAB LEVEL': '製程層',
      'SUB-FAB': '地下層',
      'SOLAR': '太陽能',
      'CHW PLANT': '冰水機房',
      'BULK GAS': '大宗氣體',
      'ABATEMENT': '尾氣處理',
      'GRID': '市電',
      'RENEWABLE': '再生能源',
      'TOTAL': '總計',
      'Process': '製程',
      'CHW Plant': '冰水機房',
      'Exhaust': '排氣',
      'Bulk Gas': '大宗氣體',
      'Other': '其他',
      // panels/metas
      'Fab Cutaway': '廠房剖視',
      'Energy Flow': '能流',
      'Area Load Matrix': '製程區負載矩陣',
      'Alarm & Event Pulse': '警報與事件脈動',

      // ===== Production Floor =====
      'Live SECS/GEM · MES · AMHS': '即時 SECS/GEM · MES · AMHS',
      'production activity drives facility load': '生產活動驅動廠務負載',
      'WAFER MOVES / HR': '每小時晶圓 MOVES',
      'ACTIVE LOTS': '進行中批貨',
      'HOTTEST AREA': '最熱製程區',
      'Lots / hr': '批貨 / 時',
      'Wafer moves / hr': '晶圓 moves / 時',
      'Active jobs': '進行中製程',
      'Active alarms': '有效警報',
      'Availability': '稼動率',
      'Performance': '效能',
      'Quality': '良率',
      // panels/metas
      'Living Fab — Production ⟶ Facility Coupling': '即時廠房 — 生產 ⟶ 廠務耦合',
      'Fab Equipment Effectiveness (E79 OEE)': '機台效率（E79 OEE）',
      'live fleet roll-up': '即時機台群彙總',
      'Equipment State — SEMI E10': '設備狀態 — SEMI E10',
      'productive share by area': '各製程區稼動占比',
      'Active Process Jobs (E40 / E94)': '進行中製程作業（E40 / E94）',
      'Live Event Log — SECS/GEM Collection Events': '即時事件記錄 — SECS/GEM 收集事件',
      'Tool': '機台',
      'Lot': '批貨',
      'Recipe': '配方',
      'Carrier': '載具',
      'Progress': '進度',

      // ===== Trends / Historian =====
      'Whole-Hour Curves · Setpoint Bands · Now Cursor': '整點曲線 · 設定值帶 · 現時游標',
      'one loop = 60 sim-min · 240 samples': '一迴圈 = 60 模擬分鐘 · 240 取樣',
      'UPW Resistivity': '超純水電阻率',
      'Acid-Exhaust': '酸排氣',
      'CHW Load': '冰水負載',
      'Historian Wall': '歷史資料牆',
      '5 channels · 60 sim-min window': '5 通道 · 60 模擬分鐘視窗',

      // ===== Cleanroom =====
      'Cleanroom Environmental': '無塵室環境',
      'FFU fan power tracks HVAC load': 'FFU 風機功率隨空調負載變動',
      'BAY FLOOR PLAN — ≥0.5µm/m³ vs ISO LIMIT': 'BAY 平面圖 — ≥0.5µm/m³ 對 ISO 上限',
      'Avg Temp': '平均溫度',
      'Avg RH': '平均濕度',
      'FFU Fan Power': 'FFU 風機功率',
      'FFU Online': 'FFU 上線',
      'Mean dP': '平均壓差',
      'Worst Bay dP': '最差 Bay 壓差',
      'Mean Differential Pressure': '平均差壓',
      'FFU Face Velocity': 'FFU 面風速',
      'Particles ≥0.5µm': '微粒 ≥0.5µm',
      'Cleanroom Floor Plan — ISO 14644 Air Cleanliness': '無塵室平面圖 — ISO 14644 空氣潔淨度',
      '8 bays · ULPA FFU · particle band': '8 個 bay · ULPA FFU · 微粒帶',
      'Bay Detail — Temp · RH · dP · FFU · Particles': 'Bay 明細 — 溫度 · 濕度 · 壓差 · FFU · 微粒',
      '8 bays · ULPA FFU': '8 個 bay · ULPA FFU',
      'Environmental Trends': '環境趨勢',
      'Bay': 'Bay',
      'Temp °C': '溫度 °C',
      'RH %': '濕度 %',
      'dP Pa': '壓差 Pa',
      'FFU online': 'FFU 上線',
      'Airflow m/s': '風速 m/s',
      '≥0.5µm /m³': '≥0.5µm /m³',

      // ===== Cooling / CHW =====
      'Process & Chilled Water': '製程與冰水',
      'CHW Plant · PCW Loops · Cooling Towers': '冰水機房 · PCW 迴路 · 冷卻水塔',
      'PLANT EFFICIENCY': '機房效率',
      'Total Cooling': '總冷卻量',
      'CHWS / CHWR': '冰水供 / 回',
      'Towers': '水塔',
      'PCW Load': 'PCW 負載',
      'Chillers Staged': '冰機上線',
      'Process Cooling Water Loops  ·  20 °C Setpoint': '製程冷卻水迴路  ·  20 °C 設定',
      'Cooling Towers  ·  Condenser-Water Heat Rejection': '冷卻水塔  ·  冷凝水散熱',
      'Cooling Load — RT': '冷卻負載 — RT',
      'Plant Power — MW': '機房功率 — MW',
      'Design Capacity': '設計容量',
      'CHW Setpoint': '冰水設定',
      'Distribution': '配送',
      'CHW pumps · VPF': '冰水泵 · VPF',
      'Condenser Water': '冷凝水',
      'towers': '座水塔',
      'Cooling Plant': '冷卻機房',
      'Chiller Plant P&ID — Schematic Overview': '冰水機房 P&ID — 管路圖總覽',
      'Chiller Plant — Central Utility Building': '冰水機房 — 中央廠務大樓',
      'Plant Trends': '機房趨勢',
      'Chiller': '冰機',
      'Tonnage': '冷凍噸',
      'CHWS': '冰水供水',
      'CHWR': '冰水回水',
      'Approach': '逼近溫差',
      'Loop': '迴路',
      'Supply': '供水',
      'Return': '回水',
      'Flow': '流量',
      'Tower': '水塔',
      'Cells': '冷卻格',
      'Basin': '水盤',
      'Range': '溫差範圍',
      'Fan VFD': '風機變頻',

      // ===== Ultrapure Water =====
      'Ultrapure Water (UPW)': '超純水（UPW）',
      'Reclaim': '回收',
      'POLISH-LOOP QUALITY': '拋光迴路水質',
      'MAKE-UP FLOW': '補水流量',
      'Target 18.2 MΩ·cm @25°C · sub-ppb TOC': '目標 18.2 MΩ·cm @25°C · 次 ppb TOC',
      'Reclaim / Reuse': '回收 / 再利用',
      'Trains Online': '處理列上線',
      'Loop ΔP': '迴路 ΔP',
      'N₂ Blanket': 'N₂ 氣封',
      'Make-up Flow': '補水流量',
      'Polish Pump': '拋光泵',
      'Storage Tank': '儲槽',
      'UPW Make-up Flow': '超純水補水流量',
      'Loop Resistivity': '迴路電阻率',
      'Resistivity': '電阻率',
      'TOC': 'TOC',
      'Dissolved O₂': '溶氧',
      'Silica': '二氧化矽',
      'Boron': '硼',
      'Particles > 50 nm': '微粒 > 50 nm',
      'Bacteria': '細菌',
      'Temperature': '溫度',
      'Excursion': '超出規格',
      'Near-spec': '接近規格',
      'In-spec': '符合規格',
      'UPW Quality Signature': '超純水水質指標',
      'UPW Process Flow — Make-up to Point-of-Use': '超純水製程流 — 補水至使用端',
      'UPW Water Quality': '超純水水質',
      '8 parameters · all in-spec': '8 項參數 · 全部符合規格',
      'UPW Trains — Make-up & Polish': '超純水處理列 — 補水與拋光',
      'Trends — Make-up Flow & Loop Resistivity': '趨勢 — 補水流量與迴路電阻率',
      'Parameter': '參數',
      'Spec': '規格',
      'Headroom': '餘裕',

      // ===== Gas & Exhaust =====
      'Bulk Gas & Exhaust / Abatement': '大宗氣體與排氣 / 尾氣處理',
      'Scrubbers · Thermal Oxidizers': '洗滌塔 · 熱氧化爐',
      'acid exhaust & abatement track Etch / Wet': '酸排氣與尾氣處理隨蝕刻 / 濕製程變動',
      'TOTAL EXHAUST': '總排氣量',
      'Acid': '酸',
      'Solvent': '有機溶劑',
      'Heat': '熱排',
      'General': '一般',
      'Abatement': '尾氣處理',
      'Destruction': '破壞去除率',
      '% destruction': '% 破壞去除率',
      'Inlet': '入口',
      'Blower': '鼓風機',
      'Liquor pH': '洗滌液 pH',
      'Recirc': '循環',
      'Stack': '煙囪',
      'Fuel': '燃料',
      'Type': '類型',
      'VOC / pyro': 'VOC / 自燃',
      'Bulk Nitrogen': '大宗氮氣',
      'Bulk Oxygen': '大宗氧氣',
      'Bulk Argon': '大宗氬氣',
      'Bulk Hydrogen': '大宗氫氣',
      'Bulk CO2': '大宗二氧化碳',
      'Bulk Helium': '大宗氦氣',
      'Gas Cabinet': '氣瓶櫃',
      'Acid Exhaust Header': '酸排氣總管',
      'Abatement Load': '尾氣處理負載',
      'N2 Bulk Demand': 'N2 大宗需求',
      'Exhaust & Abatement': '排氣與尾氣處理',
      'Abatement Status Wall — Wet Scrubbers + Thermal Oxidizers': '尾氣處理狀態牆 — 濕式洗滌塔 + 熱氧化爐',
      'Gas Yard — Bulk Storage → Distribution → Exhaust Treatment': '氣體儲區 — 大宗儲存 → 配送 → 排氣處理',
      'Bulk Gas Distribution — Live Flow': '大宗氣體配送 — 即時流量',
      'Bulk Gas Yard — Headers & Storage': '大宗氣體儲區 — 總管與儲存',
      'Segregated Exhaust Headers — Flow Balance': '分流排氣總管 — 流量平衡',
      'Specialty Gas Cabinets — Process Gas Distribution': '特殊氣體櫃 — 製程氣體配送',
      'Gas': '氣體',
      'Header bar': '總管 bar',
      'Flow Nm3/h': '流量 Nm3/h',
      'Tank %': '儲槽 %',
      'Purity %': '純度 %',
      'Dewpt °C': '露點 °C',
      'Header': '總管',
      'Flow CFM': '流量 CFM',
      'Share': '占比',
      'Cabinet': '氣瓶櫃',
      'Hazard': '危害',
      'Header mTorr': '總管 mTorr',
      'Cylinder %': '鋼瓶 %',
      'Purge N2 sccm': '吹驅 N2 sccm',

      // ===== Energy Center =====
      'Energy Command Center': '能源指揮中心',
      'Demand · Sub-metering · Power Quality': '需量 · 分表計量 · 電力品質',
      'all totals from live facility metering': '所有總量取自即時廠務計量',
      'DEMAND / PEAK': '需量 / 峰值',
      'TOTAL DEMAND · 180s TREND': '總需量 · 180 秒趨勢',
      'Energy / Move': '能耗 / Move',
      'Specific Energy': '單位能耗',
      'Power Factor': '功率因數',
      'HVAC (MAU / AHU / FFU)': '空調（MAU / AHU / FFU）',
      'Chilled Water Plant': '冰水機房',
      'Process Tools': '製程機台',
      'Bulk Gas & CDA': '大宗氣體與 CDA',
      'Other / House': '其他 / 廠用',
      'Process Load': '製程負載',
      'Facility Load': '廠務負載',
      'Peak Demand (loop)': '峰值需量（迴圈）',
      'Energy / Wafer-Move': '能耗 / 晶圓 Move',
      'Specific Energy (fab)': '單位能耗（全廠）',
      'Wafer Moves / hr': '晶圓 Moves / 時',
      'Cost Run-Rate': '成本即時率',
      'Est. Daily Energy': '預估日能耗',
      'Carbon Rate': '碳排率',
      'BUS VOLTAGE': '匯流排電壓',
      'FREQUENCY': '頻率',
      'VOLTAGE THD': '電壓 THD',
      'UPS DRAW': 'UPS 用電',
      'HARMONIC COMPLIANCE': '諧波合規',
      'Demand Detail': '需量明細',
      'Sub-metered Load': '分表負載',
      'by system': '依系統',
      'Energy Intensity & Cost': '能源強度與成本',
      'Power Quality': '電力品質',
      'Process Load by Area': '各製程區製程負載',
      '% Proc': '% 製程',

      // ===== Sustainability =====
      'Sustainability & Carbon': '永續與碳排',
      'Renewable · Water Reuse': '再生能源 · 水回收',
      'Scope 2 Rate': '範疇二排放率',
      'Renewable Mix': '再生能源配比',
      'Water Reclaim': '水回收',
      'DAILY CO₂e PROJECTION': '每日 CO₂e 推估',
      'Carbon Intensity': '碳密度',
      'Scope 2 Share': '範疇二占比',
      'Annual Run-rate': '年化排放率',
      'per Wafer-Move': '每晶圓 Move',
      'Scope 2 — Grid (electricity)': '範疇二 — 市電（電力）',
      'Scope 1 — Direct (combustion / process)': '範疇一 — 直接（燃燒 / 製程）',
      'Daily Projection': '每日推估',
      'Grid Emission Factor': '市電排放係數',
      'Facility Overhead (facility / process)': '廠務負載比（廠務 / 製程）',
      'UPW Make-up (fresh demand)': '超純水補水（新增需求）',
      'Reclaim / Reuse Return': '回收 / 再利用回流',
      'City Water Intake': '自來水取水',
      'Wastewater to Treatment': '廢水送處理',
      'Net Consumptive Use': '淨消耗用水',
      'Generation Mix — Facility Demand': '發電配比 — 廠房需量',
      'Grid': '市電',
      'Solar PPA': '太陽能 PPA',
      'Wind PPA': '風力 PPA',
      'MAKE-UP': '補水',
      'RECLAIM': '回收',
      'NET USE': '淨用水',
      'fresh demand': '新增需求',
      'reuse return': '再利用回流',
      'consumptive': '消耗',
      'Reuse Efficiency': '再利用效率',
      '2030 Renewable Target': '2030 再生能源目標',
      'Net-Zero Scope 2 Target': '範疇二淨零目標',
      'Water Reuse Goal': '水回收目標',
      'Reporting Basis': '報告基準',
      '-> 60% RE100': '→ 60% RE100',
      '-> FY2035': '→ FY2035',
      '-> >80%': '→ >80%',
      'Sustainability Signature': '永續指標',
      'Carbon Accounting — GHG Protocol': '碳盤查 — GHG Protocol',
      'Water Balance — UPW Make-up & Reclaim': '水平衡 — 超純水補水與回收',
      'CO₂e Rate — Trailing': 'CO₂e 排放率 — 追蹤',
      'Renewable Mix — Trailing': '再生能源配比 — 追蹤',
      'Decarbonization Targets': '減碳目標',

      // ===== Master Data =====
      'Master Data & Asset Registry': '主檔資料與資產清冊',
      'Asset Hierarchy · Point/Tag Registry': '資產階層 · 點位/標籤清冊',
      'engineered points': '個工程點位',
      'PROCESS TOOLS REGISTERED': '已登錄製程機台',
      'facility assets': '項廠務資產',
      'process areas': '個製程區',
      'Process Areas': '製程區',
      'Connected Load': '連接負載',
      'Point / Tag Count': '點位 / 標籤數',
      'E10 Fleet Uptime': 'E10 機台群稼動',
      'Fleet Registry': '機台群清冊',
      'Asset Hierarchy': '資產階層',
      'Site ▸ Building ▸ System ▸ Equipment': '廠區 ▸ 建築 ▸ 系統 ▸ 設備',
      'Point / Tag Registry': '點位 / 標籤清冊',
      'E10 State-Time Allocation': 'E10 狀態時間分攤',
      'per-area · live': '各製程區 · 即時',
      'Equipment Registry — Process Tools': '設備清冊 — 製程機台',
      'Tag': '標籤',
      'Description': '說明',
      'Unit': '單位',
      'Bus': '匯流排',
      'Address': '位址',
      'ID': 'ID',
      'Name': '名稱',
      'Kind': '類型',
      'E10 State': 'E10 狀態',
      'Base kW': '基礎 kW',
      'Load vs Area Max': '負載 vs 區上限'
    }
  };

  // ---- locale resolution -------------------------------------------------
  function readQuery() {
    var m = /[?&]lang=([a-zA-Z-]+)/.exec(location.search || '');
    return m ? m[1].toLowerCase() : null;
  }
  function readStore() {
    try { return window.localStorage.getItem(STORE_KEY); } catch (e) { return null; }
  }
  function normalize(v) {
    if (!v) return null;
    v = String(v).toLowerCase();
    if (v === 'zh' || v.indexOf('zh') === 0) return 'zh';
    if (v === 'en' || v.indexOf('en') === 0) return 'en';
    return null;
  }
  function resolve() {
    return normalize(readQuery())
        || normalize(readStore())
        || ((navigator.language || '').toLowerCase().indexOf('zh') === 0 ? 'zh' : null)
        || 'en';
  }

  var lang = resolve();
  var dict = dicts[lang] || dicts.en;

  // Reflect on <html lang> for a11y / CSS :lang() hooks.
  try {
    document.documentElement.lang = (lang === 'zh') ? 'zh-Hant' : 'en';
  } catch (e) { /* no document yet — won't happen, script is in body */ }

  // ---- t(): plain property lookup, identity fallback ---------------------
  function t(s) {
    return (dict[s] != null) ? dict[s] : s;
  }

  // ---- set(): persist + rewrite ?lang= (file:// safe) + reload -----------
  function set(next) {
    next = normalize(next) || 'en';
    if (next === lang) return;
    try { window.localStorage.setItem(STORE_KEY, next); } catch (e) { /* storage blocked */ }
    // Rewrite the ?lang= query (preserving the #hash) so the choice survives even
    // when storage is blocked on file://; then reload to re-mount everything.
    var hash = location.hash || '';
    var search = (location.search || '').replace(/[?&]lang=[a-zA-Z-]+/g, '');
    search = search.replace(/^&/, '?');
    if (!search || search === '?') search = '';
    var sep = search ? '&' : '?';
    var base = location.pathname;
    location.replace(base + search + sep + 'lang=' + next + hash);
  }

  BAS.i18n = {
    get lang() { return lang; },
    t: t,
    set: set,
    dicts: dicts
  };
})(window.BAS);
