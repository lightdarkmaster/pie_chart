let allLeads = [];
let leadSourceCounts = {};
let totalLeads = 0;

ZOHO.embeddedApp.on("PageLoad", function(data) {
    console.log("Widget loaded successfully");
    fetchAllLeads();
});

ZOHO.embeddedApp.init();

async function fetchAllLeads() {
    try {
        let page = 1;
        let hasMoreRecords = true;
        allLeads = [];
        
        while (hasMoreRecords) {
            const response = await ZOHO.CRM.API.getAllRecords({
                Entity: "Leads",
                page: page,
                per_page: 200
            });
            
            if (response.data && response.data.length > 0) {
                allLeads = allLeads.concat(response.data);
                console.log(`Fetched page ${page}: ${response.data.length} leads`);
                
                if (response.info && response.info.more_records) {
                    page++;
                } else {
                    hasMoreRecords = false;
                }
            } else {
                hasMoreRecords = false;
            }
        }
        
        console.log(`Total leads fetched: ${allLeads.length}`);
        processLeadData();
        
    } catch (error) {
        console.error("Error fetching leads:", error);
        showError("Failed to fetch lead data. Please try again.");
    }
}

function processLeadData() {
    leadSourceCounts = {};
    totalLeads = allLeads.length;
    
    if (totalLeads === 0) {
        showError("No leads found in the system.");
        return;
    }
    
    allLeads.forEach(lead => {
        let source = lead.Lead_Source || "Unknown";
        
        if (!leadSourceCounts[source]) {
            leadSourceCounts[source] = 0;
        }
        leadSourceCounts[source]++;
    });
    
    console.log("Lead source counts:", leadSourceCounts);
    renderVisualization();
}

function renderVisualization() {
    const sources = Object.keys(leadSourceCounts);
    const sortedSources = sources.sort((a, b) => leadSourceCounts[b] - leadSourceCounts[a]);
    
    renderPieChart(sortedSources);
    renderLegend(sortedSources);
    renderTable(sortedSources);
    
    document.getElementById("loadingDiv").style.display = "none";
    document.getElementById("contentDiv").style.display = "block";
}

function renderPieChart(sources) {
    const pieChart = document.getElementById("pieChart");
    const pieLabels = document.getElementById("pieLabels");
    let currentPercentage = 0;
    const gradientStops = [];
    
    pieLabels.innerHTML = "";
    
    sources.forEach((source, index) => {
        const count = leadSourceCounts[source];
        const percentage = (count / totalLeads) * 100;
        const color = getColor(index);
        
        gradientStops.push(`${color} ${currentPercentage}% ${currentPercentage + percentage}%`);
        
        if (percentage >= 5) {
            const middlePercentage = currentPercentage + (percentage / 2);
            const angle = (middlePercentage / 100) * 360 - 90;
            const angleRad = (angle * Math.PI) / 180;
            
            const radius = 140;
            const x = 200 + radius * Math.cos(angleRad);
            const y = 200 + radius * Math.sin(angleRad);
            
            const label = document.createElement("div");
            label.className = "pie-label";
            label.style.left = `${x}px`;
            label.style.top = `${y}px`;
            
            const sourceSpan = document.createElement("span");
            sourceSpan.className = "pie-label-source";
            sourceSpan.textContent = source.length > 15 ? source.substring(0, 12) + "..." : source;
            
            const percentageSpan = document.createElement("span");
            percentageSpan.className = "pie-label-percentage";
            percentageSpan.textContent = `${percentage.toFixed(1)}%`;
            
            label.appendChild(sourceSpan);
            label.appendChild(percentageSpan);
            pieLabels.appendChild(label);
        }
        
        currentPercentage += percentage;
    });
    
    const gradient = `conic-gradient(${gradientStops.join(", ")})`;
    pieChart.style.background = gradient;
}

function renderLegend(sources) {
    const legend = document.getElementById("legend");
    legend.innerHTML = "";
    
    sources.forEach((source, index) => {
        const color = getColor(index);
        const count = leadSourceCounts[source];
        const percentage = ((count / totalLeads) * 100).toFixed(1);
        
        const legendItem = document.createElement("div");
        legendItem.className = "legend-item";
        
        const colorBox = document.createElement("div");
        colorBox.className = "legend-color";
        colorBox.style.backgroundColor = color;
        
        const label = document.createElement("span");
        label.className = "legend-label";
        label.textContent = `${source} (${percentage}%)`;
        
        legendItem.appendChild(colorBox);
        legendItem.appendChild(label);
        legend.appendChild(legendItem);
    });
}

function renderTable(sources) {
    const tableBody = document.getElementById("tableBody");
    tableBody.innerHTML = "";
    
    sources.forEach((source, index) => {
        const count = leadSourceCounts[source];
        const percentage = ((count / totalLeads) * 100).toFixed(1);
        
        const row = document.createElement("tr");
        
        const sourceCell = document.createElement("td");
        const colorIndicator = document.createElement("span");
        colorIndicator.style.display = "inline-block";
        colorIndicator.style.width = "12px";
        colorIndicator.style.height = "12px";
        colorIndicator.style.backgroundColor = getColor(index);
        colorIndicator.style.borderRadius = "2px";
        colorIndicator.style.marginRight = "8px";
        sourceCell.appendChild(colorIndicator);
        sourceCell.appendChild(document.createTextNode(source));
        
        const countCell = document.createElement("td");
        countCell.className = "count-cell";
        countCell.textContent = count;
        
        const percentageCell = document.createElement("td");
        percentageCell.className = "percentage-cell";
        percentageCell.textContent = `${percentage}%`;
        
        row.appendChild(sourceCell);
        row.appendChild(countCell);
        row.appendChild(percentageCell);
        tableBody.appendChild(row);
    });
}

function getColor(index) {
    const hue = (index * 45) % 360;
    return `hsl(${hue}, 70%, 55%)`;
}

function showError(message) {
    document.getElementById("loadingDiv").style.display = "none";
    document.getElementById("contentDiv").style.display = "none";
    document.getElementById("errorDiv").style.display = "block";
    document.getElementById("errorMessage").textContent = message;
}