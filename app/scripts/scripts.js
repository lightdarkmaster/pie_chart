/* ============================================================
   Lead Source Distribution Widget — scripts.js
   Zoho CRM Custom Widget | By: Christian Barbosa

   ARCHITECTURE OVERVIEW
   ─────────────────────
   allLeads[]          Raw full dataset fetched once on PageLoad
                       (all records, no date filter applied at API
                       level because Zoho getAllRecords does not
                       support server-side Created_Time filtering
                       in the basic SDK; we filter client-side).

   filteredLeads[]     Subset of allLeads after applyDateFilter().
                       All chart / table / stat renders consume
                       this array, never allLeads directly.

   leadSourceCounts{}  Aggregated from filteredLeads.
   totalLeads          filteredLeads.length.

   FILTER FLOW
   ───────────
   PageLoad
     └─ fetchAllLeads()           fetch + paginate all records
          └─ applyDateFilter()    slice filteredLeads by date window
               └─ processLeadData()  aggregate + renderVisualization()

   User picks a preset / custom range / all-time
     └─ onPresetClick() / onCustomApply() / onFilterReset()
          └─ applyDateFilter()
               └─ processLeadData()

   NEW FUNCTIONS (marked ── DATE FILTER ──)
   ─────────────────────────────────────────
   • getDateRange(preset)        returns { start, end } Date objects
   • applyDateFilter()           filters allLeads → filteredLeads
   • updateBadge(label)          updates the #wg-period chip text
   • showEmpty(msg)              shows the zero-results empty state
   • hideAllPanels()             utility — hides all content divs
   • onPresetClick(btn, preset)  handles preset pill clicks
   • onCustomApply()             handles custom-range Apply click
   • onCustomCancel()            collapses custom expander
   • onFilterReset()             resets to all-time view
   • formatDateLocal(date)       ISO yyyy-mm-dd in local time
   • parseLocalDate(str)         parses yyyy-mm-dd without UTC shift

   UNCHANGED FUNCTIONS
   ───────────────────
   fetchAllLeads, processLeadData, getColor, getLightColor,
   renderVisualization, polarToXY, renderPieChart,
   positionTooltip, activateHighlight, clearHighlight,
   renderLegend, renderTable, renderStats, showError,
   switchView, renderRadarChart, renderRadarStats,
   renderRadarLegend, activateRadarHighlight, clearRadarHighlight
   ============================================================ */

/* ── Global state ── */
var allLeads          = [];      /* full unfiltered dataset        */
var filteredLeads     = [];      /* date-filtered working set      */
var leadSourceCounts  = {};      /* aggregated from filteredLeads  */
var totalLeads        = 0;       /* filteredLeads.length           */

var currentView       = 'donut'; /* 'donut' | 'radar'             */

/* ── Active filter state ── */
var activePreset      = 'all_time';  /* default on load           */
var activeCustomStart = null;         /* Date | null               */
var activeCustomEnd   = null;         /* Date | null               */

/* ── Colour palette (unchanged) ── */
var COLORS = [
    '#3b7dd8', '#1a9e75', '#d85a30', '#c44faa',
    '#7c6dd8', '#c47a17', '#e24b4a', '#0e8a8a',
    '#e07b39', '#5a9e3a'
];
var LIGHT_COLORS = [
    '#ddeeff', '#d4f5ea', '#fce8df', '#f9e0f4',
    '#eae8fb', '#fdf0d5', '#fde8e8', '#d4f0f0',
    '#fdeede', '#e3f4d9'
];

/* ============================================================
   ZOHO SDK BOOTSTRAP (unchanged entry point)
   ============================================================ */
ZOHO.embeddedApp.on('PageLoad', function (data) {
    console.log('[Widget] PageLoad fired');
    /* Set default pill active state visually */
    setActivePill('all_time');
    fetchAllLeads();
});

ZOHO.embeddedApp.init();

/* ============================================================
   ── FETCH: getAllRecords with full pagination (unchanged) ──
   Fetches ALL leads regardless of date; date filtering is then
   applied client-side via applyDateFilter() so switching
   presets is instant without additional API calls.
   ============================================================ */
async function fetchAllLeads() {
    showLoading('Loading lead data…');
    try {
        var page           = 1;
        var hasMoreRecords = true;
        allLeads           = [];

        while (hasMoreRecords) {
            var response = await ZOHO.CRM.API.getAllRecords({
                Entity:   'Leads',
                page:     page,
                per_page: 200
            });

            if (response.data && response.data.length > 0) {
                allLeads = allLeads.concat(response.data);
                console.log('[Widget] Fetched page ' + page + ': ' + response.data.length + ' leads');

                if (response.info && response.info.more_records) {
                    page++;
                } else {
                    hasMoreRecords = false;
                }
            } else {
                hasMoreRecords = false;
            }
        }

        console.log('[Widget] Total leads fetched: ' + allLeads.length);

        /* Stamp last-updated time */
        var now = new Date();
        document.getElementById('lastUpdated').textContent =
            now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        /* Apply the default date filter then render */
        applyDateFilter();

    } catch (err) {
        console.error('[Widget] fetchAllLeads error:', err);
        showError('Failed to fetch lead data. Please try again.');
    }
}

/* ============================================================
   ── DATE FILTER: getDateRange(preset) ──
   Returns { start: Date, end: Date } for the named preset,
   where start is 00:00:00 and end is 23:59:59.999 local time.
   Returns null for 'all_time' and 'custom' (handled elsewhere).

   PRESET DEFINITIONS
   ──────────────────
   today        : today 00:00 → today 23:59
   yesterday    : yesterday 00:00 → yesterday 23:59
   past_week    : today-6 days 00:00 → today 23:59  (rolling 7 days)
   prev_week    : last Mon 00:00 → last Sun 23:59    (calendar week)
   last_month   : 1st of prev month 00:00 → last day of prev month 23:59
   ============================================================ */
function getDateRange(preset) {
    var now   = new Date();
    var start = new Date(now);
    var end   = new Date(now);

    /* Reset to start of today */
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    switch (preset) {

        case 'today':
            /* start = today 00:00, end = today 23:59 — already set */
            break;

        case 'yesterday':
            start.setDate(start.getDate() - 1);
            end.setDate(end.getDate() - 1);
            break;

        case 'past_week':
            /* Rolling last 7 days inclusive of today */
            start.setDate(start.getDate() - 6);
            /* end = today 23:59 — already set */
            break;

        case 'prev_week': {
            /* Monday–Sunday of the calendar week before this one */
            var day = now.getDay();                    /* 0=Sun … 6=Sat */
            var daysToLastMon = (day === 0) ? 6 : day - 1;
            /* Last Monday */
            start.setDate(now.getDate() - daysToLastMon - 7);
            start.setHours(0, 0, 0, 0);
            /* Last Sunday = last Monday + 6 */
            end = new Date(start);
            end.setDate(start.getDate() + 6);
            end.setHours(23, 59, 59, 999);
            break;
        }

        case 'last_month': {
            /* First → last day of the previous calendar month */
            var y = now.getFullYear();
            var m = now.getMonth();              /* 0-indexed */
            if (m === 0) { y--; m = 11; } else { m--; }
            start = new Date(y, m, 1, 0, 0, 0, 0);
            end   = new Date(y, m + 1, 0, 23, 59, 59, 999); /* day 0 of next month = last day of m */
            break;
        }

        default:
            return null;
    }

    return { start: start, end: end };
}

/* ============================================================
   ── DATE FILTER: applyDateFilter() ──
   Reads activePreset / activeCustomStart / activeCustomEnd,
   slices allLeads into filteredLeads, then calls processLeadData().

   Zoho CRM stores the record creation timestamp in the
   Created_Time field (ISO 8601 string, e.g. "2026-05-29T10:40:42+05:30").
   We parse it with new Date() which correctly handles the offset.
   ============================================================ */
function applyDateFilter() {
    var range = null;

    if (activePreset === 'all_time') {
        filteredLeads = allLeads.slice();          /* full copy */
    } else if (activePreset === 'custom') {
        if (activeCustomStart && activeCustomEnd) {
            range = { start: activeCustomStart, end: activeCustomEnd };
        } else {
            filteredLeads = allLeads.slice();      /* fallback */
        }
    } else {
        range = getDateRange(activePreset);
    }

    if (range) {
        filteredLeads = allLeads.filter(function (lead) {
            if (!lead.Created_Time) return false;
            var created = new Date(lead.Created_Time);
            return created >= range.start && created <= range.end;
        });
        console.log('[Widget] Filter "' + activePreset + '" → ' + filteredLeads.length + ' leads' +
            ' (range: ' + range.start.toLocaleDateString() + ' – ' + range.end.toLocaleDateString() + ')');
    }

    processLeadData();
}

/* ============================================================
   ── AGGREGATE: processLeadData() ──
   CHANGED: now reads from filteredLeads instead of allLeads.
   Zero-result path now shows emptyDiv instead of error.
   ============================================================ */
function processLeadData() {
    leadSourceCounts = {};
    totalLeads       = filteredLeads.length;

    if (totalLeads === 0) {
        var label = buildEmptyLabel();
        showEmpty(label);
        return;
    }

    filteredLeads.forEach(function (lead) {
        var source = lead.Lead_Source || 'Unknown';
        if (!leadSourceCounts[source]) {
            leadSourceCounts[source] = 0;
        }
        leadSourceCounts[source]++;
    });

    console.log('[Widget] Lead source counts:', leadSourceCounts);
    renderVisualization();
}

/* ── Helper: human-readable empty-state message ── */
function buildEmptyLabel() {
    if (activePreset === 'today')      return 'No leads created today.';
    if (activePreset === 'yesterday')  return 'No leads created yesterday.';
    if (activePreset === 'past_week')  return 'No leads in the past 7 days.';
    if (activePreset === 'prev_week')  return 'No leads created last week.';
    if (activePreset === 'last_month') return 'No leads created last month.';
    if (activePreset === 'custom')     return 'No leads found for the selected date range.';
    return 'No leads found.';
}

/* ============================================================
   ── DATE FILTER UI HANDLERS ──
   ============================================================ */

/* ── onPresetClick(btn, preset) ──
   Called by every preset pill's onclick. Activates the pill,
   collapses or expands the custom-range panel, stores the
   preset, and re-runs the filter.                            */
function onPresetClick(btn, preset) {
    if (preset === 'custom') {
        /* Toggle custom panel; don't re-filter until Apply */
        setActivePill('custom');
        openCustomPanel();
        return;
    }
    /* Collapse custom panel if open */
    closeCustomPanel();
    activePreset = preset;
    setActivePill(preset);
    updateBadge(pillLabel(preset));
    showLoading('Filtering…');
    applyDateFilter();
}

/* ── onCustomApply() ──
   Reads + validates the two date inputs, then runs the filter. */
function onCustomApply() {
    var startInput = document.getElementById('dateStart').value;
    var endInput   = document.getElementById('dateEnd').value;
    var errEl      = document.getElementById('customDateError');

    /* Clear previous error */
    errEl.textContent = '';
    errEl.classList.remove('is-visible');

    if (!startInput) {
        showCustomError('Please select a start date.');
        return;
    }
    if (!endInput) {
        showCustomError('Please select an end date.');
        return;
    }

    var start = parseLocalDate(startInput);
    var end   = parseLocalDate(endInput);
    end.setHours(23, 59, 59, 999);   /* include the full end day */

    if (start > end) {
        showCustomError('Start date must be on or before the end date.');
        return;
    }

    /* Max 366-day range — guard against accidental giant queries */
    var dayDiff = (end - start) / (1000 * 60 * 60 * 24);
    if (dayDiff > 366) {
        showCustomError('Date range cannot exceed 366 days. Use "All Time" for wider views.');
        return;
    }

    activePreset      = 'custom';
    activeCustomStart = start;
    activeCustomEnd   = end;

    closeCustomPanel();

    /* Build a compact badge label */
    var label = formatDateLocal(start) === formatDateLocal(end)
        ? formatDateLocal(start)
        : formatDateLocal(start) + ' – ' + formatDateLocal(end);
    updateBadge(label);

    showLoading('Filtering…');
    applyDateFilter();
}

/* ── onCustomCancel() ── */
function onCustomCancel() {
    closeCustomPanel();
    /* Revert pill highlight to whatever was previously active */
    setActivePill(activePreset === 'custom' ? 'past_week' : activePreset);
    if (activePreset === 'custom') {
        /* Custom was selected but now cancelled with no valid range: fall back */
        activePreset = 'past_week';
        updateBadge(pillLabel('past_week'));
        showLoading('Filtering…');
        applyDateFilter();
    }
}

/* ── onFilterReset() ── */
function onFilterReset() {
    closeCustomPanel();
    activePreset      = 'all_time';
    activeCustomStart = null;
    activeCustomEnd   = null;
    setActivePill('all_time');
    updateBadge('All Time');
    showLoading('Loading all leads…');
    applyDateFilter();
}

/* ============================================================
   ── DATE FILTER UI HELPERS ──
   ============================================================ */

/* Sets exactly one pill to active, clears the rest */
function setActivePill(preset) {
    document.querySelectorAll('.filter-pill').forEach(function (btn) {
        var isTarget = btn.dataset.preset === preset;
        btn.classList.toggle('filter-pill--active', isTarget);
        btn.setAttribute('aria-pressed', isTarget ? 'true' : 'false');
    });
}

/* Opens the custom date range expander */
function openCustomPanel() {
    var panel = document.getElementById('filterCustom');
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    /* Pre-fill with today's date if empty */
    var startEl = document.getElementById('dateStart');
    var endEl   = document.getElementById('dateEnd');
    if (!startEl.value) {
        startEl.value = formatDateLocal(new Date());
    }
    if (!endEl.value) {
        endEl.value = formatDateLocal(new Date());
    }
    /* Focus start input for accessibility */
    setTimeout(function () { startEl.focus(); }, 60);
}

/* Closes and clears error from the custom panel */
function closeCustomPanel() {
    var panel = document.getElementById('filterCustom');
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    document.getElementById('customDateError').classList.remove('is-visible');
    document.getElementById('customDateError').textContent = '';
}

/* Shows an inline validation error inside the custom panel */
function showCustomError(msg) {
    var el = document.getElementById('customDateError');
    el.textContent = msg;
    el.classList.add('is-visible');
}

/* Updates the header badge chip */
function updateBadge(label) {
    document.getElementById('wg-period').textContent = label;
}

/* Human-readable label for a preset key */
function pillLabel(preset) {
    var labels = {
        today:      'Today',
        yesterday:  'Yesterday',
        past_week:  'Past 7 Days',
        prev_week:  'Previous Week',
        last_month: 'Last Month',
        all_time:   'All Time'
    };
    return labels[preset] || preset;
}

/* ── formatDateLocal(date) ──
   Returns "YYYY-MM-DD" in LOCAL time (not UTC).
   Used for both input pre-fill and badge labels.              */
function formatDateLocal(date) {
    var y  = date.getFullYear();
    var m  = String(date.getMonth() + 1).padStart(2, '0');
    var d  = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
}

/* ── parseLocalDate(str) ──
   Parses "YYYY-MM-DD" as local midnight (avoids the UTC
   off-by-one that new Date("YYYY-MM-DD") causes in browsers). */
function parseLocalDate(str) {
    var parts = str.split('-');
    return new Date(parseInt(parts[0], 10),
                    parseInt(parts[1], 10) - 1,
                    parseInt(parts[2], 10),
                    0, 0, 0, 0);
}

/* ============================================================
   ── STATE DISPLAY HELPERS ──
   ============================================================ */

/* Shows the loading spinner with optional message */
function showLoading(msg) {
    document.getElementById('loadingMsg').textContent = msg || 'Loading lead data…';
    document.getElementById('loadingDiv').style.display     = '';
    document.getElementById('contentDiv').style.display     = 'none';
    document.getElementById('radarContentDiv').style.display = 'none';
    document.getElementById('errorDiv').style.display       = 'none';
    document.getElementById('emptyDiv').style.display       = 'none';
}

/* Shows zero-result empty state */
function showEmpty(message) {
    document.getElementById('loadingDiv').style.display      = 'none';
    document.getElementById('contentDiv').style.display      = 'none';
    document.getElementById('radarContentDiv').style.display = 'none';
    document.getElementById('errorDiv').style.display        = 'none';
    document.getElementById('emptyDiv').style.display        = '';
    document.getElementById('emptyMessage').textContent      = message || 'No leads found for this date range.';
}

/* Shows error state (unchanged signature, expanded impl) */
function showError(message) {
    document.getElementById('loadingDiv').style.display      = 'none';
    document.getElementById('contentDiv').style.display      = 'none';
    document.getElementById('radarContentDiv').style.display = 'none';
    document.getElementById('emptyDiv').style.display        = 'none';
    document.getElementById('errorDiv').style.display        = '';
    document.getElementById('errorMessage').textContent      = message;
}

/* ============================================================
   ── COLOR HELPERS (unchanged) ──
   ============================================================ */
function getColor(index)      { return COLORS[index % COLORS.length]; }
function getLightColor(index) { return LIGHT_COLORS[index % LIGHT_COLORS.length]; }

/* ============================================================
   ── MASTER RENDER (unchanged structure; reads leadSourceCounts) ──
   ============================================================ */
function renderVisualization() {
    var sources = Object.keys(leadSourceCounts).sort(function (a, b) {
        return leadSourceCounts[b] - leadSourceCounts[a];
    });

    renderPieChart(sources);
    renderLegend(sources);
    renderTable(sources);
    renderStats(sources);
    renderRadarChart(sources);
    renderRadarStats(sources);

    document.getElementById('loadingDiv').style.display = 'none';
    document.getElementById('emptyDiv').style.display   = 'none';
    document.getElementById('errorDiv').style.display   = 'none';

    if (currentView === 'radar') {
        document.getElementById('contentDiv').style.display      = 'none';
        document.getElementById('radarContentDiv').style.display = '';
    } else {
        document.getElementById('contentDiv').style.display      = '';
        document.getElementById('radarContentDiv').style.display = 'none';
    }
}

/* ============================================================
   ── polarToXY (unchanged) ──
   ============================================================ */
function polarToXY(cx, cy, r, angleDeg) {
    var rad = (angleDeg - 90) * (Math.PI / 180);
    return {
        x: cx + r * Math.cos(rad),
        y: cy + r * Math.sin(rad)
    };
}

/* ============================================================
   ── DONUT CHART (unchanged) ──
   ============================================================ */
function renderPieChart(sources) {
    var svg     = document.getElementById('donutSvg');
    var tooltip = document.getElementById('chartTooltip');

    while (svg.lastChild && svg.lastChild.tagName !== 'title') {
        svg.removeChild(svg.lastChild);
    }

    var cx = 100, cy = 100, ro = 92, ri = 60;
    var startAngle = 0;

    sources.forEach(function (source, index) {
        var count      = leadSourceCounts[source];
        var percentage = (count / totalLeads) * 100;
        var angle      = (percentage / 100) * 360;
        var endAngle   = startAngle + angle;
        var large      = angle > 180 ? 1 : 0;
        var color      = getColor(index);

        var s  = polarToXY(cx, cy, ro, startAngle);
        var e  = polarToXY(cx, cy, ro, endAngle - 0.4);
        var si = polarToXY(cx, cy, ri, startAngle);
        var ei = polarToXY(cx, cy, ri, endAngle - 0.4);

        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d',
            'M' + s.x  + ',' + s.y  +
            ' A' + ro + ',' + ro + ' 0 ' + large + ' 1 ' + e.x  + ',' + e.y  +
            ' L' + ei.x + ',' + ei.y +
            ' A' + ri + ',' + ri + ' 0 ' + large + ' 0 ' + si.x + ',' + si.y + ' Z'
        );
        path.setAttribute('fill', color);
        path.dataset.source     = source;
        path.dataset.count      = count;
        path.dataset.percentage = percentage.toFixed(1);
        path.dataset.index      = index;

        path.addEventListener('mouseenter', function (e) {
            document.getElementById('tooltipSource').innerHTML =
                '<span class="tooltip-swatch" style="background:' + color + '"></span>' + source;
            document.getElementById('tooltipCount').textContent = count.toLocaleString() + ' leads';
            document.getElementById('tooltipPct').textContent   = percentage.toFixed(1) + '%';
            tooltip.style.display = 'block';
            positionTooltip(tooltip, e);
            requestAnimationFrame(function () { tooltip.classList.add('is-visible'); });
            activateHighlight(index);
        });
        path.addEventListener('mousemove', function (e) { positionTooltip(tooltip, e); });
        path.addEventListener('mouseleave', function () {
            tooltip.classList.remove('is-visible');
            setTimeout(function () {
                if (!tooltip.classList.contains('is-visible')) { tooltip.style.display = 'none'; }
            }, 160);
            clearHighlight();
        });

        svg.appendChild(path);
        startAngle = endAngle;
    });
}

/* ============================================================
   ── TOOLTIP POSITIONING (unchanged; shared by donut + radar) ──
   ============================================================ */
function positionTooltip(tooltip, mouseEvent) {
    var offset = 14;
    var tw = tooltip.offsetWidth  || 160;
    var th = tooltip.offsetHeight || 52;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var left = mouseEvent.clientX + offset;
    var top  = mouseEvent.clientY + offset;
    if (left + tw > vw - 8) { left = mouseEvent.clientX - tw - offset; }
    if (top  + th > vh - 8) { top  = mouseEvent.clientY - th - offset; }
    tooltip.style.left = left + 'px';
    tooltip.style.top  = top  + 'px';
}

/* ============================================================
   ── DONUT HIGHLIGHT (unchanged) ──
   ============================================================ */
function activateHighlight(activeIndex) {
    var svg  = document.getElementById('donutSvg');
    svg.classList.add('has-highlight');
    svg.querySelectorAll('path').forEach(function (p) {
        p.classList.toggle('seg-active', parseInt(p.dataset.index, 10) === activeIndex);
    });
    document.querySelectorAll('#tableBody tr').forEach(function (row) {
        row.classList.toggle('row-active', parseInt(row.dataset.index, 10) === activeIndex);
    });
}

function clearHighlight() {
    var svg = document.getElementById('donutSvg');
    svg.classList.remove('has-highlight');
    svg.querySelectorAll('path').forEach(function (p) { p.classList.remove('seg-active'); });
    document.querySelectorAll('#tableBody tr').forEach(function (r) { r.classList.remove('row-active'); });
}

/* ============================================================
   ── LEGEND (unchanged) ──
   ============================================================ */
function renderLegend(sources) {
    var legend = document.getElementById('legend');
    legend.innerHTML = '';
    sources.slice(0, 9).forEach(function (source, index) {
        var color      = getColor(index);
        var percentage = ((leadSourceCounts[source] / totalLeads) * 100).toFixed(1);
        var item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML =
            '<span class="legend-dot" style="background:' + color + '"></span>' +
            '<span class="legend-name">' + source + '</span>' +
            '<span class="legend-pct">' + percentage + '%</span>';
        legend.appendChild(item);
    });
}

/* ============================================================
   ── TABLE (unchanged) ──
   ============================================================ */
function renderTable(sources) {
    var tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    sources.forEach(function (source, index) {
        var count      = leadSourceCounts[source];
        var percentage = ((count / totalLeads) * 100).toFixed(1);
        var color      = getColor(index);
        var light      = getLightColor(index);
        var row        = document.createElement('tr');
        row.dataset.index = index;
        row.innerHTML =
            '<td class="col-dot"><span class="src-dot" style="background:' + color + '"></span></td>' +
            '<td>' + source + '</td>' +
            '<td class="cell-count">' + count.toLocaleString() + '</td>' +
            '<td class="col-bar">' +
                '<div class="bar-track">' +
                    '<div class="bar-fill" style="width:' + percentage + '%;background:' + color + '"></div>' +
                '</div></td>' +
            '<td><span class="pct-chip" style="background:' + light + ';color:' + color + '">' + percentage + '%</span></td>';
        row.addEventListener('mouseenter', function () { activateHighlight(index); });
        row.addEventListener('mouseleave', function () { clearHighlight(); });
        tbody.appendChild(row);
    });
}

/* ============================================================
   ── STAT CARDS (unchanged) ──
   ============================================================ */
function renderStats(sources) {
    var top = sources[0];
    document.getElementById('donutTotal').textContent      = totalLeads.toLocaleString();
    document.getElementById('statTopSource').textContent   = top || '—';
    document.getElementById('statTopCount').textContent    = top ? leadSourceCounts[top].toLocaleString() + ' leads' : '';
    document.getElementById('statSourceCount').textContent = sources.length;
    document.getElementById('statAvg').textContent         = Math.round(totalLeads / sources.length).toLocaleString();
}

/* ============================================================
   ── VIEW SWITCHER (unchanged) ──
   ============================================================ */
function switchView(view) {
    if (view === currentView) return;
    currentView = view;

    var btnDonut = document.getElementById('btnDonut');
    var btnRadar = document.getElementById('btnRadar');

    btnDonut.classList.toggle('view-btn--active', view === 'donut');
    btnDonut.setAttribute('aria-pressed', view === 'donut' ? 'true' : 'false');
    btnRadar.classList.toggle('view-btn--active', view === 'radar');
    btnRadar.setAttribute('aria-pressed', view === 'radar' ? 'true' : 'false');

    if (view === 'radar') {
        document.getElementById('contentDiv').style.display      = 'none';
        document.getElementById('radarContentDiv').style.display = '';
        if (totalLeads > 0) {
            var sources = Object.keys(leadSourceCounts).sort(function (a, b) {
                return leadSourceCounts[b] - leadSourceCounts[a];
            });
            renderRadarChart(sources);
            renderRadarStats(sources);
        }
    } else {
        document.getElementById('radarContentDiv').style.display = 'none';
        document.getElementById('contentDiv').style.display      = '';
    }
}

/* ============================================================
   ── RADAR CHART (unchanged) ──
   ============================================================ */
function renderRadarChart(sources) {
    var svg     = document.getElementById('radarSvg');
    var tooltip = document.getElementById('radarTooltip');

    while (svg.firstChild) { svg.removeChild(svg.firstChild); }

    var MAX_RADAR_SOURCES = 10;
    var displaySources    = sources.slice(0, MAX_RADAR_SOURCES);
    var N                 = displaySources.length;

    if (N < 3) {
        var txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        txt.setAttribute('x', '210'); txt.setAttribute('y', '210');
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('fill', '#8a96a8'); txt.setAttribute('font-size', '13');
        txt.textContent = 'Need at least 3 lead sources for radar view.';
        svg.appendChild(txt);
        return;
    }

    var CX = 210, CY = 210, RADAR_R = 155, RINGS = 5, LABEL_PAD = 22;
    var maxCount = leadSourceCounts[displaySources[0]] || 1;

    function axisAngle(i) { return (i / N) * 360; }
    function axisPoint(i, t) { return polarToXY(CX, CY, RADAR_R * t, axisAngle(i)); }

    /* Grid rings */
    for (var ring = 1; ring <= RINGS; ring++) {
        var t = ring / RINGS;
        var ringPts = [];
        for (var i = 0; i < N; i++) {
            var p = axisPoint(i, t);
            ringPts.push(p.x + ',' + p.y);
        }
        var poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', ringPts.join(' '));
        poly.setAttribute('class', 'radar-grid-line');
        svg.appendChild(poly);

        var lp = polarToXY(CX, CY, RADAR_R * t, 0);
        var rl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        rl.setAttribute('x', lp.x + 3); rl.setAttribute('y', lp.y);
        rl.setAttribute('class', 'radar-ring-label');
        rl.textContent = Math.round((ring / RINGS) * 100) + '%';
        svg.appendChild(rl);
    }

    /* Axis spokes + labels */
    displaySources.forEach(function (source, i) {
        var tip     = polarToXY(CX, CY, RADAR_R, axisAngle(i));
        var labelPt = polarToXY(CX, CY, RADAR_R + LABEL_PAD, axisAngle(i));

        var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', CX); line.setAttribute('y1', CY);
        line.setAttribute('x2', tip.x); line.setAttribute('y2', tip.y);
        line.setAttribute('class', 'radar-axis-line');
        svg.appendChild(line);

        var MAX_LABEL  = 13;
        var labelText  = source.length > MAX_LABEL ? source.slice(0, MAX_LABEL - 1) + '…' : source;
        var label      = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', labelPt.x); label.setAttribute('y', labelPt.y);
        label.setAttribute('class', 'radar-axis-label');
        var deg = axisAngle(i);
        label.setAttribute('text-anchor',
            deg > 15 && deg < 165 ? 'start' : deg > 195 && deg < 345 ? 'end' : 'middle');
        label.textContent = labelText;
        svg.appendChild(label);
    });

    /* Data polygon */
    var dataPoints = displaySources.map(function (source, i) {
        return axisPoint(i, leadSourceCounts[source] / maxCount);
    });
    var polyPoints = dataPoints.map(function (p) { return p.x + ',' + p.y; }).join(' ');

    var dataPoly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    dataPoly.setAttribute('points', polyPoints);
    dataPoly.setAttribute('class', 'radar-polygon');
    dataPoly.setAttribute('fill', 'rgba(59,125,216,0.14)');
    dataPoly.setAttribute('stroke', '#3b7dd8');
    dataPoly.setAttribute('stroke-width', '1.8');
    dataPoly.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(dataPoly);

    /* Vertex dots */
    displaySources.forEach(function (source, i) {
        var count      = leadSourceCounts[source];
        var percentage = ((count / totalLeads) * 100).toFixed(1);
        var color      = getColor(i);
        var pt         = dataPoints[i];

        var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', pt.x); circle.setAttribute('cy', pt.y);
        circle.setAttribute('r', '5');
        circle.setAttribute('fill', color);
        circle.setAttribute('stroke', '#ffffff'); circle.setAttribute('stroke-width', '1.5');
        circle.setAttribute('class', 'radar-dot');
        circle.dataset.index      = i;
        circle.dataset.source     = source;
        circle.dataset.count      = count;
        circle.dataset.percentage = percentage;

        circle.addEventListener('mouseenter', function (e) {
            document.getElementById('radarTooltipSource').innerHTML =
                '<span class="tooltip-swatch" style="background:' + color + '"></span>' + source;
            document.getElementById('radarTooltipCount').textContent = count.toLocaleString() + ' leads';
            document.getElementById('radarTooltipPct').textContent   = percentage + '%';
            tooltip.style.display = 'block';
            positionTooltip(tooltip, e);
            requestAnimationFrame(function () { tooltip.classList.add('is-visible'); });
            activateRadarHighlight(i);
        });
        circle.addEventListener('mousemove', function (e) { positionTooltip(tooltip, e); });
        circle.addEventListener('mouseleave', function () {
            tooltip.classList.remove('is-visible');
            setTimeout(function () {
                if (!tooltip.classList.contains('is-visible')) { tooltip.style.display = 'none'; }
            }, 160);
            clearRadarHighlight();
        });

        svg.appendChild(circle);
    });

    renderRadarLegend(displaySources);
}

/* ── Radar stat cards (unchanged) ── */
function renderRadarStats(sources) {
    var top = sources[0];
    document.getElementById('radarStatTopSource').textContent   = top || '—';
    document.getElementById('radarStatTopCount').textContent    = top ? leadSourceCounts[top].toLocaleString() + ' leads' : '';
    document.getElementById('radarStatSourceCount').textContent = sources.length;
    document.getElementById('radarStatAvg').textContent         = Math.round(totalLeads / sources.length).toLocaleString();
}

/* ── Radar legend (unchanged) ── */
function renderRadarLegend(displaySources) {
    var legend = document.getElementById('radarLegend');
    legend.innerHTML = '<div class="radar-legend-title">Lead Sources</div>';

    displaySources.forEach(function (source, index) {
        var count      = leadSourceCounts[source];
        var percentage = ((count / totalLeads) * 100).toFixed(1);
        var color      = getColor(index);

        var item = document.createElement('div');
        item.className     = 'legend-item';
        item.dataset.index = index;
        item.innerHTML =
            '<span class="legend-dot" style="background:' + color + '"></span>' +
            '<span class="legend-name">' + source + '</span>' +
            '<span class="legend-pct">' + percentage + '%</span>';

        item.addEventListener('mouseenter', function () { activateRadarHighlight(index); });
        item.addEventListener('mouseleave', function () { clearRadarHighlight(); });

        legend.appendChild(item);
    });
}

/* ── Radar highlight (unchanged) ── */
function activateRadarHighlight(activeIndex) {
    var svg = document.getElementById('radarSvg');
    svg.classList.add('has-highlight');
    svg.querySelectorAll('.radar-dot').forEach(function (dot) {
        dot.classList.toggle('dot-active', parseInt(dot.dataset.index, 10) === activeIndex);
    });
    document.querySelectorAll('#radarLegend .legend-item').forEach(function (item) {
        item.classList.toggle('legend-item--active', parseInt(item.dataset.index, 10) === activeIndex);
    });
}

function clearRadarHighlight() {
    var svg = document.getElementById('radarSvg');
    svg.classList.remove('has-highlight');
    svg.querySelectorAll('.radar-dot').forEach(function (d) { d.classList.remove('dot-active'); });
    document.querySelectorAll('#radarLegend .legend-item').forEach(function (i) { i.classList.remove('legend-item--active'); });
}