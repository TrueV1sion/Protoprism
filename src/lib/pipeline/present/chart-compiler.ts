import type {
  DataPoint,
  ChartData,
  DonutChartData,
  DonutSegment,
  BarChartData,
  SparklineData,
  CounterData,
  HorizontalBarData,
} from "./types";

const CHART_COLORS = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)",
  "var(--chart-5)", "var(--chart-6)", "var(--chart-7)", "var(--chart-8)",
];

const DONUT_RADIUS = 80;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS; // 502.6548...

export function compileCharts(dataPoints: DataPoint[]): ChartData[] {
  const results: ChartData[] = [];

  // Group by chartRole
  const groups = new Map<string, DataPoint[]>();
  for (const pt of dataPoints) {
    const existing = groups.get(pt.chartRole) ?? [];
    existing.push(pt);
    groups.set(pt.chartRole, existing);
  }

  // Process donut segments
  const donutPoints = groups.get("donut-segment");
  if (donutPoints?.length) {
    results.push(compileDonut(donutPoints));
  }

  // Process bar-value (vertical bar chart)
  const barPoints = groups.get("bar-value");
  if (barPoints?.length) {
    results.push(compileBar(barPoints));
  }

  // Process sparkline-point (sparkline chart)
  const sparkPoints = groups.get("sparkline-point");
  if (sparkPoints?.length) {
    results.push(compileSparkline(sparkPoints));
  }

  // Process counter-target (each point becomes its own CounterData)
  const counterPoints = groups.get("counter-target");
  if (counterPoints?.length) {
    for (const pt of counterPoints) {
      results.push(compileCounter(pt));
    }
  }

  // Process bar-fill-percent (horizontal bars — all grouped into one HorizontalBarData)
  const hbarPoints = groups.get("bar-fill-percent");
  if (hbarPoints?.length) {
    results.push(compileHorizontalBar(hbarPoints));
  }

  return results;
}

function compileDonut(points: DataPoint[]): DonutChartData {
  const total = points.reduce((sum, p) => sum + p.value, 0);
  let offset = 0;

  const segments: DonutSegment[] = points.map((pt, i) => {
    const pct = pt.value / total;
    const dashLen = +(pct * DONUT_CIRCUMFERENCE).toFixed(2);
    const seg: DonutSegment = {
      label: pt.label,
      percentage: +(pct * 100).toFixed(1),
      dashArray: `${dashLen} ${+DONUT_CIRCUMFERENCE.toFixed(2)}`,
      dashOffset: offset === 0 ? "0" : `-${offset.toFixed(2)}`,
      color: CHART_COLORS[i % CHART_COLORS.length],
    };
    offset += dashLen;
    return seg;
  });

  // Generate SVG fragment
  const circles = segments.map(s =>
    `<circle class="segment" cx="100" cy="100" r="${DONUT_RADIUS}" stroke="${s.color}" stroke-width="24" stroke-dasharray="${s.dashArray}" stroke-dashoffset="${s.dashOffset}" fill="none" />`
  ).join("\n    ");

  const legendItems = segments.map(s =>
    `<div class="legend-item"><span class="legend-dot" style="background:${s.color}"></span> ${s.label} (${s.percentage}%)</div>`
  ).join("\n      ");

  const svgFragment = `<div style="display:flex;align-items:center;gap:2rem;">
  <svg class="donut-chart" viewBox="0 0 200 200" style="max-width:200px">
    ${circles}
  </svg>
  <div class="chart-legend">
      ${legendItems}
  </div>
</div>`;

  return {
    type: "donut",
    segments,
    circumference: +DONUT_CIRCUMFERENCE.toFixed(2),
    svgFragment,
  };
}

function compileBar(points: DataPoint[]): BarChartData {
  // SVG viewBox: 300 x 200
  // Layout: chart area y=10 to y=160 (height 150), x margins for N bars
  const svgWidth = 300;
  const svgHeight = 200;
  const chartTop = 10;
  const chartBottom = 160;
  const chartHeight = chartBottom - chartTop; // 150
  const labelAreaHeight = svgHeight - chartBottom; // 40

  const maxValue = Math.max(...points.map(p => p.value));
  const barWidth = Math.floor((svgWidth - 20) / points.length) - 8;
  const xPad = 10;

  const bars = points.map((pt, i) => {
    const heightRatio = maxValue > 0 ? pt.value / maxValue : 0;
    const height = +(heightRatio * chartHeight).toFixed(2);
    const y = +(chartBottom - height).toFixed(2);
    const x = xPad + i * (barWidth + 8);
    return {
      label: pt.label,
      value: pt.value,
      height,
      y,
      color: CHART_COLORS[i % CHART_COLORS.length],
      x,
    };
  });

  const rects = bars.map(b =>
    `<rect class="bar" x="${b.x}" y="${b.y}" width="${barWidth}" height="${b.height}" fill="${b.color}" rx="2" />`
  ).join("\n    ");

  const valueLabels = bars.map(b =>
    `<text x="${b.x + barWidth / 2}" y="${b.y - 4}" text-anchor="middle" class="bar-value-label" font-size="10">${b.value}${points[bars.indexOf(b)]?.unit ?? ""}</text>`
  ).join("\n    ");

  const catLabels = bars.map(b =>
    `<text x="${b.x + barWidth / 2}" y="${chartBottom + 14}" text-anchor="middle" class="bar-category-label" font-size="9">${b.label}</text>`
  ).join("\n    ");

  const svgFragment = `<svg class="bar-chart" viewBox="0 0 ${svgWidth} ${svgHeight}" style="width:100%;max-width:${svgWidth}px">
    ${rects}
    ${valueLabels}
    ${catLabels}
</svg>`;

  return {
    type: "bar",
    bars: bars.map(({ label, value, height, y, color }) => ({ label, value, height, y, color })),
    svgFragment,
  };
}

function compileSparkline(points: DataPoint[]): SparklineData {
  // SVG viewBox: 80 x 24
  const svgWidth = 80;
  const svgHeight = 24;
  const padX = 4;
  const padY = 3;

  const values = points.map(p => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const n = points.length;
  const coordPairs = points.map((pt, i) => {
    const x = +(padX + (i / (n - 1)) * (svgWidth - 2 * padX)).toFixed(2);
    const y = +(padY + (1 - (pt.value - minVal) / range) * (svgHeight - 2 * padY)).toFixed(2);
    return { x, y };
  });

  const pointsStr = coordPairs.map(p => `${p.x},${p.y}`).join(" ");
  const lastPt = coordPairs[coordPairs.length - 1];

  const svgFragment = `<div class="sparkline-container">
  <svg class="sparkline" viewBox="0 0 ${svgWidth} ${svgHeight}" style="width:100%;max-width:${svgWidth}px">
    <polyline class="sparkline-line" points="${pointsStr}" fill="none" stroke="var(--chart-1)" stroke-width="1.5" />
    <circle class="sparkline-dot" cx="${lastPt.x}" cy="${lastPt.y}" r="2.5" fill="var(--chart-1)" />
  </svg>
</div>`;

  return {
    type: "sparkline",
    points: pointsStr,
    endX: lastPt.x,
    endY: lastPt.y,
    svgFragment,
  };
}

function compileCounter(pt: DataPoint): CounterData {
  const colorClass = "stat-highlight";
  const prefix = pt.prefix ?? "";
  const suffix = pt.unit ?? "";

  const dataPrefixAttr = prefix ? ` data-prefix="${prefix}"` : "";
  const dataSuffixAttr = suffix ? ` data-suffix="${suffix}"` : "";

  const htmlFragment = `<span class="stat-number ${colorClass}" data-target="${pt.value}"${dataPrefixAttr}${dataSuffixAttr}>${prefix}${pt.value}${suffix}</span>`;

  return {
    type: "counter",
    target: pt.value,
    prefix: prefix || undefined,
    suffix: suffix || undefined,
    colorClass,
    htmlFragment,
  };
}

function compileHorizontalBar(points: DataPoint[]): HorizontalBarData {
  const rows = points.map((pt, i) => ({
    label: pt.label,
    value: pt.value,
    percentage: pt.value, // treat value as percentage directly for bar-fill-percent
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const rowsHtml = rows.map(row =>
    `<div class="bar-row">
    <span class="bar-label">${row.label}</span>
    <div class="bar-track">
      <div class="bar-fill" style="width:${row.percentage}%;background:${row.color}"></div>
    </div>
    <span class="bar-fill-value">${row.percentage}%</span>
  </div>`
  ).join("\n  ");

  const htmlFragment = `<div class="horizontal-bar-chart">
  ${rowsHtml}
</div>`;

  return {
    type: "horizontal-bar",
    rows,
    htmlFragment,
  };
}
