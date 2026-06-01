/* ============================================================
   Lead Source Distribution Widget — scripts.js
   Your original logic preserved: getAllRecords pagination,
   processLeadData, getColor — wired to the new HTML layout.
   ============================================================ */

var allLeads          = [];
var leadSourceCounts  = {};
var totalLeads        = 0;

/* ── Colour palette ── */
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

/* ── Zoho SDK bootstrap ── */
ZOHO.embeddedApp.on("PageLoad", function (data) {
    console.log("Widget loaded successfully");
    fetchAllLeads();
});

ZOHO.embeddedApp.init();

/* ── Fetch all leads with pagination (your original logic) ── */
async function fetchAllLeads() {
    try {
        var page          = 1;
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

/* ── Aggregate by Lead_Source (your original logic) ── */
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

/* ── Color helper (your original HSL logic) ── */
function getColor(index) {
    return COLORS[index % COLORS.length];
}

function getLightColor(index) {
    return LIGHT_COLORS[index % LIGHT_COLORS.length];
}

/* ── Master render ── */
function renderVisualization() {
    var sources       = Object.keys(leadSourceCounts);
    var sortedSources = sources.sort(function (a, b) {
        return leadSourceCounts[b] - leadSourceCounts[a];
    });

    renderPieChart(sortedSources);   // now renders a donut into #donutSvg
    renderLegend(sortedSources);
    renderTable(sortedSources);
    renderStats(sortedSources);

    document.getElementById("loadingDiv").style.display = "none";
    document.getElementById("contentDiv").style.display = "";
}

/* ── polarToXY: converts polar angle to SVG x/y coordinates ──
   Required by renderPieChart to compute donut arc endpoints.   */
function polarToXY(cx, cy, r, angleDeg) {
    var rad = (angleDeg - 90) * (Math.PI / 180);
    return {
        x: cx + r * Math.cos(rad),
        y: cy + r * Math.sin(rad)
    };
}

/* ── Donut chart (replaces conic-gradient pie) ── */
/* ENHANCEMENT 1 & 2: Segments now show a tooltip on hover
   and trigger two-way highlight with the data table.        */
function renderPieChart(sources) {
    var svg     = document.getElementById("donutSvg");
    var tooltip = document.getElementById("chartTooltip");

    // Clear previous paths (preserve the <title> element)
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

        // Store metadata on the element for retrieval in event handlers
        path.dataset.source     = source;
        path.dataset.count      = count;
        path.dataset.percentage = percentage.toFixed(1);
        path.dataset.index      = index;

        /* ── ENHANCEMENT 1: Tooltip on segment mouseenter ── */
        path.addEventListener("mouseenter", function (e) {
            // Populate tooltip content
            document.getElementById("tooltipSource").innerHTML =
                '<span class="tooltip-swatch" style="background:' + color + '"></span>' + source;
            document.getElementById("tooltipCount").textContent = count.toLocaleString() + " leads";
            document.getElementById("tooltipPct").textContent   = percentage.toFixed(1) + "%";

            // Show tooltip and position it near the cursor
            tooltip.style.display = "block";
            positionTooltip(tooltip, e);
            requestAnimationFrame(function () { tooltip.classList.add("is-visible"); });

            /* ── ENHANCEMENT 2: Chart → Table highlight ── */
            activateHighlight(index);
        });

        // Track mouse movement so tooltip follows cursor
        path.addEventListener("mousemove", function (e) {
            positionTooltip(tooltip, e);
        });

        /* ── ENHANCEMENT 2: Clear highlights + hide tooltip on mouseleave ── */
        path.addEventListener("mouseleave", function () {
            tooltip.classList.remove("is-visible");
            setTimeout(function () {
                // Only hide if still not visible (avoids flicker when
                // moving quickly to another segment)
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

/* ── ENHANCEMENT 1: Tooltip positioning helper ──
   Keeps the tooltip inside the viewport with a small offset.  */
function positionTooltip(tooltip, mouseEvent) {
    var offset  = 14;
    var tw      = tooltip.offsetWidth  || 160;
    var th      = tooltip.offsetHeight || 52;
    var vw      = window.innerWidth;
    var vh      = window.innerHeight;

    var left = mouseEvent.clientX + offset;
    var top  = mouseEvent.clientY + offset;

    // Flip horizontally if it would overflow right edge
    if (left + tw > vw - 8) { left = mouseEvent.clientX - tw - offset; }
    // Flip vertically if it would overflow bottom edge
    if (top  + th > vh - 8) { top  = mouseEvent.clientY - th - offset; }

    tooltip.style.left = left + "px";
    tooltip.style.top  = top  + "px";
}

/* ── ENHANCEMENT 2: Activate highlight by source index ──
   Dims all segments except the active one; highlights table row. */
function activateHighlight(activeIndex) {
    var svg  = document.getElementById("donutSvg");
    var rows = document.querySelectorAll("#tableBody tr");

    // Put SVG into "highlight mode" — CSS dims all non-active paths
    svg.classList.add("has-highlight");

    // Mark the active segment
    var paths = svg.querySelectorAll("path");
    paths.forEach(function (p) {
        if (parseInt(p.dataset.index, 10) === activeIndex) {
            p.classList.add("seg-active");
        } else {
            p.classList.remove("seg-active");
        }
    });

    // Highlight the matching table row
    rows.forEach(function (row) {
        if (parseInt(row.dataset.index, 10) === activeIndex) {
            row.classList.add("row-active");
        } else {
            row.classList.remove("row-active");
        }
    });
}

/* ── ENHANCEMENT 2: Clear all highlights ── */
function clearHighlight() {
    var svg  = document.getElementById("donutSvg");
    svg.classList.remove("has-highlight");
    svg.querySelectorAll("path").forEach(function (p) { p.classList.remove("seg-active"); });
    document.querySelectorAll("#tableBody tr").forEach(function (r) { r.classList.remove("row-active"); });
}

/* ── Legend ── */
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

/* ── Table ──
   ENHANCEMENT 3: Each row stores its source index via data-index
   and wires mouseenter/mouseleave to activateHighlight/clearHighlight
   so hovering a row highlights the corresponding donut segment.     */
function renderTable(sources) {
    var tableBody = document.getElementById("tableBody");
    tableBody.innerHTML = "";

    sources.forEach(function (source, index) {
        var count      = leadSourceCounts[source];
        var percentage = ((count / totalLeads) * 100).toFixed(1);
        var color      = getColor(index);
        var light      = getLightColor(index);

        var row = document.createElement("tr");

        // Store index so activateHighlight/clearHighlight can match segments
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

        /* ── ENHANCEMENT 3: Table row → Chart highlight ── */
        row.addEventListener("mouseenter", function () {
            activateHighlight(index);
        });
        row.addEventListener("mouseleave", function () {
            clearHighlight();
        });

        tableBody.appendChild(row);
    });
}

/* ── Stat cards ── */
function renderStats(sources) {
    var top = sources[0];
    document.getElementById("donutTotal").textContent      = totalLeads.toLocaleString();
    document.getElementById("statTopSource").textContent   = top || "—";
    document.getElementById("statTopCount").textContent    = top ? leadSourceCounts[top].toLocaleString() + " leads" : "";
    document.getElementById("statSourceCount").textContent = sources.length;
    document.getElementById("statAvg").textContent         = Math.round(totalLeads / sources.length).toLocaleString();
}

/* ── Error state ── */
function showError(message) {
    document.getElementById("loadingDiv").style.display = "none";
    document.getElementById("contentDiv").style.display = "none";
    document.getElementById("errorDiv").style.display = "block";
    document.getElementById("errorMessage").textContent = message;
}