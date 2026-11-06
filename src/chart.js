const SVG_NS = "http://www.w3.org/2000/svg";

function element(name, attributes = {}, text = null) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== null) node.textContent = text;
  return node;
}

function formatTick(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function renderChart(container, analysis, visibility = { spline: true, pchip: true, band: true }) {
  const width = 760;
  const height = 265;
  const margin = { top: 16, right: 16, bottom: 34, left: 48 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const allValues = [
    ...analysis.splineValues,
    ...analysis.pchipValues,
    ...analysis.confidenceBand.flatMap(({ lower, upper }) => [lower, upper]),
  ];
  let minY = Math.min(0, ...allValues);
  let maxY = Math.max(100, ...allValues);
  const padding = (maxY - minY) * 0.08 || 1;
  minY -= padding;
  maxY += padding;
  const scaleX = (value) => margin.left + ((value - analysis.grid[0]) / (analysis.grid.at(-1) - analysis.grid[0])) * plotWidth;
  const scaleY = (value) => margin.top + ((maxY - value) / (maxY - minY)) * plotHeight;
  const svg = element("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Gráfica de concentraciones de PM2.5 por distancia, con spline cúbico natural, curva PCHIP, mediciones y banda de confianza del 95 por ciento.",
  });
  svg.append(element("title", {}, "Concentración estimada de PM₂.₅ a lo largo del corredor"));
  svg.append(element("desc", {}, "Comparación de dos interpoladores cúbicos sobre 91 puntos de distancia."));

  const yStep = (maxY - minY) / 4;
  for (let i = 0; i <= 4; i += 1) {
    const value = minY + yStep * i;
    const y = scaleY(value);
    svg.append(element("line", { x1: margin.left, y1: y, x2: width - margin.right, y2: y, class: "chart-gridline" }));
    svg.append(element("text", { x: margin.left - 8, y: y + 3, "text-anchor": "end", class: "chart-tick" }, String(Math.round(value))));
  }
  for (let value = 0; value <= 9; value += 1) {
    const x = scaleX(value);
    svg.append(element("line", { x1: x, y1: margin.top, x2: x, y2: height - margin.bottom, class: "chart-gridline chart-gridline-vertical" }));
    svg.append(element("text", { x, y: height - margin.bottom + 16, "text-anchor": "middle", class: "chart-tick" }, String(value)));
  }
  svg.append(element("line", { x1: margin.left, y1: height - margin.bottom, x2: width - margin.right, y2: height - margin.bottom, class: "chart-axis" }));

  if (visibility.band) {
    const upper = analysis.confidenceBand.map((item, index) => `${index === 0 ? "M" : "L"}${scaleX(analysis.grid[index]).toFixed(2)},${scaleY(item.upper).toFixed(2)}`).join(" ");
    const lower = analysis.confidenceBand.map((item, index) => `L${scaleX(analysis.grid[analysis.grid.length - 1 - index]).toFixed(2)},${scaleY(analysis.confidenceBand[analysis.grid.length - 1 - index].lower).toFixed(2)}`).join(" ");
    svg.append(element("path", { d: `${upper} ${lower} Z`, class: "chart-confidence-band" }));
  }
  const makeLine = (values, className) => values.map((value, index) => `${index === 0 ? "M" : "L"}${scaleX(analysis.grid[index]).toFixed(2)},${scaleY(value).toFixed(2)}`).join(" ");
  if (visibility.pchip) svg.append(element("path", { d: makeLine(analysis.pchipValues), class: "chart-pchip" }));
  if (visibility.spline) {
    svg.append(element("path", { d: makeLine(analysis.splineValues), class: "chart-spline" }));
    for (const range of analysis.alertRanges.filter(({ level }) => level !== "normal")) {
      const valueAt = (distance) => {
        const index = Math.min(Math.floor((distance - analysis.grid[0]) / (analysis.grid[1] - analysis.grid[0])), analysis.grid.length - 2);
        const fraction = (distance - analysis.grid[index]) / (analysis.grid[index + 1] - analysis.grid[index]);
        return analysis.splineValues[index] * (1 - fraction) + analysis.splineValues[index + 1] * fraction;
      };
      const points = [
        { distance: range.start, value: valueAt(range.start) },
        ...analysis.grid
          .map((distance, index) => ({ distance, value: analysis.splineValues[index] }))
          .filter(({ distance }) => distance > range.start && distance < range.end),
        { distance: range.end, value: valueAt(range.end) },
      ];
      const path = points.map(({ distance, value }, index) =>
        `${index === 0 ? "M" : "L"}${scaleX(distance).toFixed(2)},${scaleY(value).toFixed(2)}`).join(" ");
      const segment = element("path", { d: path, class: `chart-alert-segment chart-alert-${range.level}` });
      segment.append(element("title", {}, range.level === "red" ? "Alerta roja: spline ≥ 90 µg/m³" : "Alerta amarilla: spline ≥ 70 y < 90 µg/m³"));
      svg.append(segment);
    }
  }

  for (let index = 0; index < analysis.x.length; index += 1) {
    const point = element("circle", {
      cx: scaleX(analysis.x[index]),
      cy: scaleY(analysis.y[index]),
      r: 3.5,
      class: "chart-measurement",
      tabindex: "0",
      "aria-label": `Estación ${index + 1}: ${analysis.y[index]} microgramos por metro cúbico a ${analysis.x[index]} kilómetros`,
    });
    point.append(element("title", {}, `E${index + 1} · ${analysis.x[index]} km · ${analysis.y[index]} µg/m³`));
    svg.append(point);
  }
  container.replaceChildren(svg);
}
