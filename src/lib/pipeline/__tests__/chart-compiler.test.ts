import { describe, it, expect } from "vitest";
import { compileCharts } from "../present/chart-compiler";
import type { DataPoint, DonutChartData, BarChartData, SparklineData, CounterData, HorizontalBarData } from "../present/types";

describe("chart-compiler: donut charts", () => {
  const donutPoints: DataPoint[] = [
    { label: "Payer Analytics", value: 40, unit: "%", chartRole: "donut-segment" },
    { label: "Provider Solutions", value: 28, unit: "%", chartRole: "donut-segment" },
    { label: "Life Sciences", value: 20, unit: "%", chartRole: "donut-segment" },
    { label: "Government", value: 12, unit: "%", chartRole: "donut-segment" },
  ];

  it("produces a donut ChartData with correct segments", () => {
    const result = compileCharts(donutPoints);
    const donut = result.find((c) => c.type === "donut") as DonutChartData;
    expect(donut).toBeDefined();
    expect(donut.segments).toHaveLength(4);
    expect(donut.circumference).toBeCloseTo(502.65, 1);
  });

  it("computes correct dashArray for first segment (40%)", () => {
    const result = compileCharts(donutPoints);
    const donut = result.find((c) => c.type === "donut") as DonutChartData;
    expect(donut.segments[0].dashArray).toBe("201.06 502.65");
    expect(donut.segments[0].dashOffset).toBe("0");
  });

  it("computes correct dashOffset for second segment", () => {
    const result = compileCharts(donutPoints);
    const donut = result.find((c) => c.type === "donut") as DonutChartData;
    expect(donut.segments[1].dashOffset).toBe("-201.06");
  });

  it("generates valid SVG fragment with chart-legend", () => {
    const result = compileCharts(donutPoints);
    const donut = result.find((c) => c.type === "donut") as DonutChartData;
    expect(donut.svgFragment).toContain('<svg class="donut-chart"');
    expect(donut.svgFragment).toContain('class="segment"');
    expect(donut.svgFragment).toContain('class="chart-legend"');
    expect(donut.svgFragment).toContain('class="legend-item"');
    expect(donut.svgFragment).toContain('class="legend-dot"');
  });

  it("assigns chart colors in order", () => {
    const result = compileCharts(donutPoints);
    const donut = result.find((c) => c.type === "donut") as DonutChartData;
    expect(donut.segments[0].color).toBe("var(--chart-1)");
    expect(donut.segments[1].color).toBe("var(--chart-2)");
  });
});

describe("chart-compiler: bar charts", () => {
  const barPoints: DataPoint[] = [
    { label: "Claims", value: 92, unit: "%", chartRole: "bar-value" },
    { label: "Quality", value: 85, unit: "%", chartRole: "bar-value" },
    { label: "Risk Adj.", value: 78, unit: "%", chartRole: "bar-value" },
  ];

  it("produces a bar ChartData with correct bar count", () => {
    const result = compileCharts(barPoints);
    const bar = result.find((c) => c.type === "bar") as BarChartData;
    expect(bar).toBeDefined();
    expect(bar.bars).toHaveLength(3);
  });

  it("generates SVG with bar-chart class and rect elements", () => {
    const result = compileCharts(barPoints);
    const bar = result.find((c) => c.type === "bar") as BarChartData;
    expect(bar.svgFragment).toContain('<svg class="bar-chart"');
    expect(bar.svgFragment).toContain('class="bar"');
  });

  it("computes bar heights proportional to values", () => {
    const result = compileCharts(barPoints);
    const bar = result.find((c) => c.type === "bar") as BarChartData;
    // 92% should have taller bar than 78%
    expect(bar.bars[0].height).toBeGreaterThan(bar.bars[2].height);
  });
});

describe("chart-compiler: sparklines", () => {
  const sparkPoints: DataPoint[] = [
    { label: "Q1", value: 20, chartRole: "sparkline-point" },
    { label: "Q2", value: 16, chartRole: "sparkline-point" },
    { label: "Q3", value: 18, chartRole: "sparkline-point" },
    { label: "Q4", value: 12, chartRole: "sparkline-point" },
    { label: "Q5", value: 8, chartRole: "sparkline-point" },
  ];

  it("produces a sparkline ChartData", () => {
    const result = compileCharts(sparkPoints);
    const spark = result.find((c) => c.type === "sparkline") as SparklineData;
    expect(spark).toBeDefined();
    expect(spark.points).toContain(",");
  });

  it("generates SVG with sparkline class and polyline", () => {
    const result = compileCharts(sparkPoints);
    const spark = result.find((c) => c.type === "sparkline") as SparklineData;
    expect(spark.svgFragment).toContain('<svg class="sparkline"');
    expect(spark.svgFragment).toContain("sparkline-line");
    expect(spark.svgFragment).toContain("sparkline-dot");
  });

  it("wraps in sparkline-container div", () => {
    const result = compileCharts(sparkPoints);
    const spark = result.find((c) => c.type === "sparkline") as SparklineData;
    expect(spark.svgFragment).toContain('class="sparkline-container"');
  });
});

describe("chart-compiler: counters", () => {
  const counterPoints: DataPoint[] = [
    { label: "Revenue", value: 2400, unit: "M", prefix: "$", chartRole: "counter-target" },
    { label: "Market Share", value: 34, unit: "%", chartRole: "counter-target" },
  ];

  it("produces counter ChartData entries", () => {
    const result = compileCharts(counterPoints);
    const counters = result.filter((c) => c.type === "counter") as CounterData[];
    expect(counters).toHaveLength(2);
  });

  it("generates HTML with data-target attribute", () => {
    const result = compileCharts(counterPoints);
    const counter = result.find((c) => c.type === "counter") as CounterData;
    expect(counter.htmlFragment).toContain('data-target=');
    expect(counter.htmlFragment).toContain('class="stat-number');
  });

  it("includes prefix and suffix", () => {
    const result = compileCharts(counterPoints);
    const counter = result.find((c) => c.type === "counter" && c.target === 2400) as CounterData;
    expect(counter.prefix).toBe("$");
    expect(counter.suffix).toBe("M");
  });
});

describe("chart-compiler: horizontal bars", () => {
  const hbarPoints: DataPoint[] = [
    { label: "Adoption Rate", value: 85, unit: "%", chartRole: "bar-fill-percent" },
    { label: "Satisfaction", value: 72, unit: "%", chartRole: "bar-fill-percent" },
  ];

  it("produces horizontal-bar ChartData", () => {
    const result = compileCharts(hbarPoints);
    const hbar = result.find((c) => c.type === "horizontal-bar") as HorizontalBarData;
    expect(hbar).toBeDefined();
    expect(hbar.rows).toHaveLength(2);
  });

  it("generates HTML with bar-row and bar-fill classes", () => {
    const result = compileCharts(hbarPoints);
    const hbar = result.find((c) => c.type === "horizontal-bar") as HorizontalBarData;
    expect(hbar.htmlFragment).toContain("bar-row");
    expect(hbar.htmlFragment).toContain("bar-track");
    expect(hbar.htmlFragment).toContain("bar-fill");
    expect(hbar.htmlFragment).toContain("bar-fill-value");
  });
});

describe("chart-compiler: value sanitization", () => {
  it("strips currency prefix and suffix from values", () => {
    const points: DataPoint[] = [
      { label: "Revenue", value: 2400, unit: "M", prefix: "$", chartRole: "counter-target" },
    ];
    const result = compileCharts(points);
    const counter = result.find((c) => c.type === "counter") as CounterData;
    expect(counter.target).toBe(2400);
  });

  it("handles mixed chart roles in single call", () => {
    const mixed: DataPoint[] = [
      { label: "Share A", value: 60, unit: "%", chartRole: "donut-segment" },
      { label: "Share B", value: 40, unit: "%", chartRole: "donut-segment" },
      { label: "Score", value: 85, unit: "%", chartRole: "bar-value" },
      { label: "Trend", value: 42, chartRole: "counter-target" },
    ];
    const result = compileCharts(mixed);
    expect(result.some(c => c.type === "donut")).toBe(true);
    expect(result.some(c => c.type === "bar")).toBe(true);
    expect(result.some(c => c.type === "counter")).toBe(true);
  });
});
