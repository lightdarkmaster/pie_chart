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

/* ── Donut chart (replaces conic-gradient pie) ── */
function renderPieChart(sources) {
    var svg = document.getElementById("donutSvg");

    // Clear previous paths
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
        path.style.transition = "opacity 0.2s";
        path.addEventListener("mouseenter", function () { path.setAttribute("opacity", "0.78"); });
        path.addEventListener("mouseleave", function () { path.setAttribute("opacity", "1"); });
        svg.appendChild(path);

        startAngle = endAngle;
    });
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

/* ── Table ── */
function renderTable(sources) {
    var tableBody = document.getElementById("tableBody");
    tableBody.innerHTML = "";

    sources.forEach(function (source, index) {
        var count      = leadSourceCounts[source];
        var percentage = ((count / totalLeads) * 100).toFixed(1);
        var color      = getColor(index);
        var light      = getLightColor(index);

        var row = document.createElement("tr");
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