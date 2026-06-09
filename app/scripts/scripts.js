/* ============================================================
   Lead Source Distribution Widget — scripts.js
   Your original logic preserved: getAllRecords pagination,
   processLeadData, getColor — wired to the new HTML layout.

   NEW (clearly marked with ── NEW ──):
     • switchView()        — toggle between donut & radar panels
     • renderRadarChart()  — pure-SVG radar built on the same
                             leadSourceCounts / COLORS data
     • renderRadarStats()  — populates the radar view stat cards
     • activateRadarHighlight() / clearRadarHighlight()
     • positionTooltip()  already existed, reused for radar too
   ============================================================ */

var allLeads          = [];
var leadSourceCounts  = {};
var totalLeads        = 0;

/* ── NEW: track which view is active ── */
var currentView = 'donut';   // 'donut' | 'radar'

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

/* ── Zoho SDK bootstrap (unchanged) ── */
ZOHO.embeddedApp.on("PageLoad", function (data) {
    console.log("Widget loaded successfully");
    fetchAllLeads();
});

ZOHO.embeddedApp.init();

/* ── Fetch all leads with pagination (unchanged) ── */
async function fetchAllLeads() {
    try {
        var page           = 1;
        var hasMoreRecords = true;
        allLeads = [];

        while (hasMoreRecords) {
            var response = await ZOHO.CRM.API.getAllRecords({
                Entity:   "Leads",
                page:     page,
                per_page: 200
            });

            if (response.data && response.data.length > 0) {
                allLeads = allLeads.concat(response.data);
                console.log("Fetched page " + page + ": " + response.data.length + " leads");

                if (response.info && response.info.more_records) {
                    page++;
                } else {
                    hasMoreRecords = false;
                }
            } else {
                hasMoreRecords = false;
            }
        }

        console.log("Total leads fetched: " + allLeads.length);
        processLeadData();

    } catch (error) {
        console.error("Error fetching leads:", error);
        showError("Failed to fetch lead data. Please try again.");
    }
}

/* ── Aggregate by Lead_Source (unchanged) ── */
function processLeadData() {
    leadSourceCounts = {};
    totalLeads       = allLeads.length;

    if (totalLeads === 0) {
        showError("No leads found in the system.");
        return;
    }

    allLeads.forEach(function (lead) {
        var source = lead.Lead_Source || "Unknown";
        if (!leadSourceCounts[source]) {
            leadSourceCounts[source] = 0;
        }
        leadSourceCounts[source]++;
    });

    console.log("Lead source counts:", leadSourceCounts);
    renderVisualization();
}

/* ── Color helpers (unchanged) ── */
function getColor(index) {
    return COLORS[index % COLORS.length];
}

function getLightColor(index) {
    return LIGHT_COLORS[index % LIGHT_COLORS.length];
}

/* ── Master render (unchanged entry point; now also calls radar) ── */
function renderVisualization() {
    var sources       = Object.keys(leadSourceCounts);
    var sortedSources = sources.sort(function (a, b) {
        return leadSourceCounts[b] - leadSourceCounts[a];
    });

    /* existing renders — untouched */
    renderPieChart(sortedSources);
    renderLegend(sortedSources);
    renderTable(sortedSources);
    renderStats(sortedSources);

    /* ── NEW: also render radar with same data ── */
    renderRadarChart(sortedSources);
    renderRadarStats(sortedSources);

    document.getElementById("loadingDiv").style.display = "none";

    /* Show the correct panel based on currentView */
    if (currentView === 'radar') {
        document.getElementById("contentDiv").style.display        = "none";
        document.getElementById("radarContentDiv").style.display   = "";
    } else {
        document.getElementById("contentDiv").style.display        = "";
        document.getElementById("radarContentDiv").style.display   = "none";
    }
}

/* ── polarToXY (unchanged) ── */
function polarToXY(cx, cy, r, angleDeg) {
    var rad = (angleDeg - 90) * (Math.PI / 180);
    return {
        x: cx + r * Math.cos(rad),
        y: cy + r * Math.sin(rad)
    };
}

/* ── Donut chart (unchanged) ── */
function renderPieChart(sources) {
    var svg     = document.getElementById("donutSvg");
    var tooltip = document.getElementById("chartTooltip");

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

        var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d",
            "M" + s.x  + "," + s.y  +
            " A" + ro + "," + ro + " 0 " + large + " 1 " + e.x  + "," + e.y  +
            " L" + ei.x + "," + ei.y +
            " A" + ri + "," + ri + " 0 " + large + " 0 " + si.x + "," + si.y + " Z"
        );
        path.setAttribute("fill", color);
        path.dataset.source     = source;
        path.dataset.count      = count;
        path.dataset.percentage = percentage.toFixed(1);
        path.dataset.index      = index;

        path.addEventListener("mouseenter", function (e) {
            document.getElementById("tooltipSource").innerHTML =
                '<span class="tooltip-swatch" style="background:' + color + '"></span>' + source;
            document.getElementById("tooltipCount").textContent = count.toLocaleString() + " leads";
            document.getElementById("tooltipPct").textContent   = percentage.toFixed(1) + "%";

            tooltip.style.display = "block";
            positionTooltip(tooltip, e);
            requestAnimationFrame(function () { tooltip.classList.add("is-visible"); });
            activateHighlight(index);
        });

        path.addEventListener("mousemove", function (e) {
            positionTooltip(tooltip, e);
        });

        path.addEventListener("mouseleave", function () {
            tooltip.classList.remove("is-visible");
            setTimeout(function () {
                if (!tooltip.classList.contains("is-visible")) {
                    tooltip.style.display = "none";
                }
            }, 160);
            clearHighlight();
        });

        svg.appendChild(path);
        startAngle = endAngle;
    });
}

/* ── Tooltip positioning helper (unchanged; reused by radar) ── */
function positionTooltip(tooltip, mouseEvent) {
    var offset  = 14;
    var tw      = tooltip.offsetWidth  || 160;
    var th      = tooltip.offsetHeight || 52;
    var vw      = window.innerWidth;
    var vh      = window.innerHeight;

    var left = mouseEvent.clientX + offset;
    var top  = mouseEvent.clientY + offset;

    if (left + tw > vw - 8) { left = mouseEvent.clientX - tw - offset; }
    if (top  + th > vh - 8) { top  = mouseEvent.clientY - th - offset; }

    tooltip.style.left = left + "px";
    tooltip.style.top  = top  + "px";
}

/* ── Donut highlight helpers (unchanged) ── */
function activateHighlight(activeIndex) {
    var svg  = document.getElementById("donutSvg");
    var rows = document.querySelectorAll("#tableBody tr");

    svg.classList.add("has-highlight");

    svg.querySelectorAll("path").forEach(function (p) {
        if (parseInt(p.dataset.index, 10) === activeIndex) {
            p.classList.add("seg-active");
        } else {
            p.classList.remove("seg-active");
        }
    });

    rows.forEach(function (row) {
        if (parseInt(row.dataset.index, 10) === activeIndex) {
            row.classList.add("row-active");
        } else {
            row.classList.remove("row-active");
        }
    });
}

function clearHighlight() {
    var svg  = document.getElementById("donutSvg");
    svg.classList.remove("has-highlight");
    svg.querySelectorAll("path").forEach(function (p) { p.classList.remove("seg-active"); });
    document.querySelectorAll("#tableBody tr").forEach(function (r) { r.classList.remove("row-active"); });
}

/* ── Legend (unchanged) ── */
function renderLegend(sources) {
    var legend  = document.getElementById("legend");
    legend.innerHTML = "";

    sources.slice(0, 9).forEach(function (source, index) {
        var count      = leadSourceCounts[source];
        var percentage = ((count / totalLeads) * 100).toFixed(1);
        var color      = getColor(index);

        var item = document.createElement("div");
        item.className = "legend-item";
        item.innerHTML =
            '<span class="legend-dot" style="background:' + color + '"></span>' +
            '<span class="legend-name">' + source + '</span>' +
            '<span class="legend-pct">' + percentage + '%</span>';
        legend.appendChild(item);
    });
}

/* ── Table (unchanged) ── */
function renderTable(sources) {
    var tableBody = document.getElementById("tableBody");
    tableBody.innerHTML = "";

    sources.forEach(function (source, index) {
        var count      = leadSourceCounts[source];
        var percentage = ((count / totalLeads) * 100).toFixed(1);
        var color      = getColor(index);
        var light      = getLightColor(index);

        var row = document.createElement("tr");
        row.dataset.index = index;

        row.innerHTML =
            '<td class="col-dot"><span class="src-dot" style="background:' + color + '"></span></td>' +
            '<td>' + source + '</td>' +
            '<td class="cell-count">' + count.toLocaleString() + '</td>' +
            '<td class="col-bar">' +
                '<div class="bar-track">' +
                    '<div class="bar-fill" style="width:' + percentage + '%; background:' + color + '"></div>' +
                '</div>' +
            '</td>' +
            '<td><span class="pct-chip" style="background:' + light + '; color:' + color + '">' + percentage + '%</span></td>';

        row.addEventListener("mouseenter", function () { activateHighlight(index); });
        row.addEventListener("mouseleave", function () { clearHighlight(); });

        tableBody.appendChild(row);
    });
}

/* ── Stat cards (unchanged) ── */
function renderStats(sources) {
    var top = sources[0];
    document.getElementById("donutTotal").textContent      = totalLeads.toLocaleString();
    document.getElementById("statTopSource").textContent   = top || "—";
    document.getElementById("statTopCount").textContent    = top ? leadSourceCounts[top].toLocaleString() + " leads" : "";
    document.getElementById("statSourceCount").textContent = sources.length;
    document.getElementById("statAvg").textContent         = Math.round(totalLeads / sources.length).toLocaleString();
}

/* ── Error state (unchanged) ── */
function showError(message) {
    document.getElementById("loadingDiv").style.display    = "none";
    document.getElementById("contentDiv").style.display    = "none";
    document.getElementById("radarContentDiv").style.display = "none"; /* NEW: also hide radar */
    document.getElementById("errorDiv").style.display      = "block";
    document.getElementById("errorMessage").textContent    = message;
}

/* ============================================================
   ── NEW: switchView() ──
   Swaps between the donut panel (#contentDiv) and the radar
   panel (#radarContentDiv), updates toggle button states, and
   triggers a (re)render if the data is already loaded so that
   the radar always reflects the latest dataset.
   ============================================================ */
function switchView(view) {
    if (view === currentView) return;
    currentView = view;

    var btnDonut = document.getElementById("btnDonut");
    var btnRadar = document.getElementById("btnRadar");

    if (view === 'radar') {
        /* activate radar button */
        btnRadar.classList.add("view-btn--active");
        btnRadar.setAttribute("aria-pressed", "true");
        btnDonut.classList.remove("view-btn--active");
        btnDonut.setAttribute("aria-pressed", "false");

        /* show radar panel, hide donut panel */
        document.getElementById("contentDiv").style.display        = "none";
        document.getElementById("radarContentDiv").style.display   = "";

        /* re-render radar so it updates if data changed since last render */
        if (totalLeads > 0) {
            var sources = Object.keys(leadSourceCounts).sort(function (a, b) {
                return leadSourceCounts[b] - leadSourceCounts[a];
            });
            renderRadarChart(sources);
            renderRadarStats(sources);
        }
    } else {
        /* activate donut button */
        btnDonut.classList.add("view-btn--active");
        btnDonut.setAttribute("aria-pressed", "true");
        btnRadar.classList.remove("view-btn--active");
        btnRadar.setAttribute("aria-pressed", "false");

        /* show donut panel, hide radar panel */
        document.getElementById("radarContentDiv").style.display   = "none";
        document.getElementById("contentDiv").style.display        = "";
    }
}

/* ============================================================
   ── NEW: renderRadarChart() ──

   Pure-SVG radar chart drawn on a 420×420 canvas.
   Algorithm:
     1. Cap display at MAX_RADAR_SOURCES (10) to keep axes readable.
     2. Compute equal angular spacing for N axes.
     3. Draw concentric polygon grid rings (5 rings = 20/40/60/80/100%).
     4. Draw axis spokes with truncated source-name labels at tips.
     5. Normalize each source's count to [0..maxCount] → [0..RADAR_R].
     6. Draw filled polygon (data shape) + vertex dots.
     7. Wire mouseenter/mouseleave on each dot for tooltip + highlight.
   ============================================================ */
function renderRadarChart(sources) {
    var svg     = document.getElementById("radarSvg");
    var tooltip = document.getElementById("radarTooltip");

    /* Clear previous render */
    while (svg.firstChild) { svg.removeChild(svg.firstChild); }

    var MAX_RADAR_SOURCES = 10;
    var displaySources = sources.slice(0, MAX_RADAR_SOURCES);
    var N = displaySources.length;

    if (N < 3) {
        /* Need at least 3 axes for a meaningful radar */
        var txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        txt.setAttribute("x", "210");
        txt.setAttribute("y", "210");
        txt.setAttribute("text-anchor", "middle");
        txt.setAttribute("fill", "#8a96a8");
        txt.setAttribute("font-size", "13");
        txt.textContent = "Need at least 3 lead sources for radar view.";
        svg.appendChild(txt);
        return;
    }

    var CX     = 210;          /* SVG centre x */
    var CY     = 210;          /* SVG centre y */
    var RADAR_R = 155;         /* outer ring radius */
    var RINGS   = 5;           /* number of concentric grid rings */
    var LABEL_PAD = 22;        /* extra space past RADAR_R for axis labels */

    var maxCount = leadSourceCounts[displaySources[0]] || 1;

    /* ── Helper: angle for axis i (clockwise from top) ── */
    function axisAngle(i) {
        return (i / N) * 360;          /* degrees, 0 = top */
    }

    /* ── Helper: point on axis i at fraction t of RADAR_R ── */
    function axisPoint(i, t) {
        return polarToXY(CX, CY, RADAR_R * t, axisAngle(i));
    }

    /* ── 1. Grid rings ── */
    for (var ring = 1; ring <= RINGS; ring++) {
        var t = ring / RINGS;
        var ringPoints = [];
        for (var i = 0; i < N; i++) {
            var p = axisPoint(i, t);
            ringPoints.push(p.x + "," + p.y);
        }

        var polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        polygon.setAttribute("points", ringPoints.join(" "));
        polygon.setAttribute("class", "radar-grid-line");
        svg.appendChild(polygon);

        /* Ring value label (% of max) at the top axis */
        var labelPt = polarToXY(CX, CY, RADAR_R * t, 0);
        var ringLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
        ringLabel.setAttribute("x", labelPt.x + 3);
        ringLabel.setAttribute("y", labelPt.y);
        ringLabel.setAttribute("class", "radar-ring-label");
        ringLabel.textContent = Math.round((ring / RINGS) * 100) + "%";
        svg.appendChild(ringLabel);
    }

    /* ── 2. Axis spokes + labels ── */
    displaySources.forEach(function (source, i) {
        var tip   = polarToXY(CX, CY, RADAR_R, axisAngle(i));
        var labelPt = polarToXY(CX, CY, RADAR_R + LABEL_PAD, axisAngle(i));

        /* Spoke line */
        var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", CX);
        line.setAttribute("y1", CY);
        line.setAttribute("x2", tip.x);
        line.setAttribute("y2", tip.y);
        line.setAttribute("class", "radar-axis-line");
        svg.appendChild(line);

        /* Axis label — truncate long names */
        var MAX_LABEL = 13;
        var labelText = source.length > MAX_LABEL
            ? source.slice(0, MAX_LABEL - 1) + "…"
            : source;

        var label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", labelPt.x);
        label.setAttribute("y", labelPt.y);
        label.setAttribute("class", "radar-axis-label");

        /* Nudge text-anchor based on position around the circle */
        var deg = axisAngle(i);
        if (deg > 15 && deg < 165)        { label.setAttribute("text-anchor", "start");  }
        else if (deg > 195 && deg < 345)  { label.setAttribute("text-anchor", "end");    }
        else                              { label.setAttribute("text-anchor", "middle"); }

        label.textContent = labelText;
        svg.appendChild(label);
    });

    /* ── 3. Data polygon ── */
    var dataPoints = displaySources.map(function (source, i) {
        var count = leadSourceCounts[source];
        var t     = count / maxCount;          /* normalised 0..1 */
        return axisPoint(i, t);
    });

    var polyPoints = dataPoints.map(function (p) { return p.x + "," + p.y; }).join(" ");

    var dataPolygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    dataPolygon.setAttribute("points", polyPoints);
    dataPolygon.setAttribute("class", "radar-polygon");
    /* Use the primary brand colour with transparency for the fill */
    dataPolygon.setAttribute("fill",         "rgba(59,125,216,0.14)");
    dataPolygon.setAttribute("stroke",       "#3b7dd8");
    dataPolygon.setAttribute("stroke-width", "1.8");
    dataPolygon.setAttribute("stroke-linejoin", "round");
    svg.appendChild(dataPolygon);

    /* ── 4. Vertex dots (interactive) ── */
    displaySources.forEach(function (source, i) {
        var count      = leadSourceCounts[source];
        var percentage = ((count / totalLeads) * 100).toFixed(1);
        var color      = getColor(i);
        var pt         = dataPoints[i];

        var circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx",    pt.x);
        circle.setAttribute("cy",    pt.y);
        circle.setAttribute("r",     "5");
        circle.setAttribute("fill",  color);
        circle.setAttribute("stroke","#ffffff");
        circle.setAttribute("stroke-width", "1.5");
        circle.setAttribute("class", "radar-dot");
        circle.dataset.index      = i;
        circle.dataset.source     = source;
        circle.dataset.count      = count;
        circle.dataset.percentage = percentage;

        /* Tooltip + highlight on hover */
        circle.addEventListener("mouseenter", function (e) {
            document.getElementById("radarTooltipSource").innerHTML =
                '<span class="tooltip-swatch" style="background:' + color + '"></span>' + source;
            document.getElementById("radarTooltipCount").textContent = count.toLocaleString() + " leads";
            document.getElementById("radarTooltipPct").textContent   = percentage + "%";

            tooltip.style.display = "block";
            positionTooltip(tooltip, e);
            requestAnimationFrame(function () { tooltip.classList.add("is-visible"); });

            activateRadarHighlight(i);
        });

        circle.addEventListener("mousemove", function (e) {
            positionTooltip(tooltip, e);
        });

        circle.addEventListener("mouseleave", function () {
            tooltip.classList.remove("is-visible");
            setTimeout(function () {
                if (!tooltip.classList.contains("is-visible")) {
                    tooltip.style.display = "none";
                }
            }, 160);
            clearRadarHighlight();
        });

        svg.appendChild(circle);
    });

    /* ── Render radar legend ── */
    renderRadarLegend(displaySources);
}

/* ============================================================
   ── NEW: renderRadarStats() ──
   Populates the three stat cards inside the radar view panel.
   Uses the same dataset as renderStats() — kept separate so
   each panel owns its own DOM IDs.
   ============================================================ */
function renderRadarStats(sources) {
    var top = sources[0];
    document.getElementById("radarStatTopSource").textContent   = top || "—";
    document.getElementById("radarStatTopCount").textContent    = top ? leadSourceCounts[top].toLocaleString() + " leads" : "";
    document.getElementById("radarStatSourceCount").textContent = sources.length;
    document.getElementById("radarStatAvg").textContent         = Math.round(totalLeads / sources.length).toLocaleString();
}

/* ============================================================
   ── NEW: renderRadarLegend() ──
   Builds the legend inside the radar panel. Mirrors the
   existing renderLegend() style but targets #radarLegend.
   ============================================================ */
function renderRadarLegend(displaySources) {
    var legend = document.getElementById("radarLegend");
    legend.innerHTML = '<div class="radar-legend-title">Lead Sources</div>';

    displaySources.forEach(function (source, index) {
        var count      = leadSourceCounts[source];
        var percentage = ((count / totalLeads) * 100).toFixed(1);
        var color      = getColor(index);

        var item = document.createElement("div");
        item.className     = "legend-item";
        item.dataset.index = index;
        item.innerHTML =
            '<span class="legend-dot" style="background:' + color + '"></span>' +
            '<span class="legend-name">' + source + '</span>' +
            '<span class="legend-pct">' + percentage + '%</span>';

        /* Hover on legend item also highlights the radar dot */
        item.addEventListener("mouseenter", function () { activateRadarHighlight(index); });
        item.addEventListener("mouseleave", function () { clearRadarHighlight(); });

        legend.appendChild(item);
    });
}

/* ============================================================
   ── NEW: activateRadarHighlight(activeIndex) ──
   Dims the filled polygon and non-active dots; enlarges the
   active dot via CSS (.dot-active) and highlights the matching
   legend row.
   ============================================================ */
function activateRadarHighlight(activeIndex) {
    var svg         = document.getElementById("radarSvg");
    var legendItems = document.querySelectorAll("#radarLegend .legend-item");

    svg.classList.add("has-highlight");

    svg.querySelectorAll(".radar-dot").forEach(function (dot) {
        if (parseInt(dot.dataset.index, 10) === activeIndex) {
            dot.classList.add("dot-active");
        } else {
            dot.classList.remove("dot-active");
        }
    });

    legendItems.forEach(function (item) {
        if (parseInt(item.dataset.index, 10) === activeIndex) {
            item.classList.add("legend-item--active");
        } else {
            item.classList.remove("legend-item--active");
        }
    });
}

/* ============================================================
   ── NEW: clearRadarHighlight() ──
   Removes all highlight states from the radar SVG and legend.
   ============================================================ */
function clearRadarHighlight() {
    var svg = document.getElementById("radarSvg");
    svg.classList.remove("has-highlight");
    svg.querySelectorAll(".radar-dot").forEach(function (d) { d.classList.remove("dot-active"); });
    document.querySelectorAll("#radarLegend .legend-item").forEach(function (i) {
        i.classList.remove("legend-item--active");
    });
}