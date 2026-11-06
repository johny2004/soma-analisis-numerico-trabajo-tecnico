import { renderChart } from "./chart.js";

const numberFormat = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const preciseFormat = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function buildStationFields(container, distances) {
  const fragment = document.createDocumentFragment();
  distances.forEach((distance, index) => {
    const row = makeElement("label", "station-row");
    const station = makeElement("span", "station-name");
    station.append(makeElement("span", "station-index", String(index + 1).padStart(2, "0")));
    station.append(document.createTextNode(`E${index + 1}`));
    const location = makeElement("span", "station-distance", `${distance.toFixed(1)} km`);
    const inputWrap = makeElement("span", "station-input-wrap");
    const input = document.createElement("input");
    input.className = "station-input";
    input.type = "number";
    input.inputMode = "decimal";
    input.min = "0";
    input.step = "any";
    input.required = true;
    input.autocomplete = "off";
    input.dataset.station = String(index);
    input.setAttribute("aria-label", `Concentración de PM2.5 en estación E${index + 1}, ${distance} kilómetros`);
    input.placeholder = "—";
    const suffix = makeElement("span", "unit-suffix", "µg");
    inputWrap.append(input, suffix);
    row.append(station, location, inputWrap);
    fragment.append(row);
  });
  container.replaceChildren(fragment);
}

export function readMeasurements(container) {
  return [...container.querySelectorAll("input")].map((input) => {
    const value = input.value.trim();
    return value === "" ? Number.NaN : Number(value);
  });
}

export function fillSampleMeasurements(container, sample) {
  container.querySelectorAll("input").forEach((input, index) => {
    input.value = String(sample[index]);
    input.setCustomValidity("");
  });
}

export function showFormError(container, message) {
  container.textContent = message;
  container.hidden = false;
}

export function clearFormError(container) {
  container.textContent = "";
  container.hidden = true;
}

function metricCard(label, value, unit, caption) {
  const card = makeElement("div", "metric-card");
  card.append(makeElement("span", "metric-label", label));
  const valueNode = makeElement("strong", "metric-value", value);
  if (unit) valueNode.append(makeElement("span", "metric-unit", unit));
  card.append(valueNode, makeElement("span", "metric-caption", caption));
  return card;
}

function formatDistance(value) {
  return `${numberFormat.format(value)} km`;
}

function renderMetrics(container, analysis) {
  const { validation } = analysis;
  const fragment = document.createDocumentFragment();
  fragment.append(
    metricCard("Concentración media", numberFormat.format(analysis.averageConcentration), "µg/m³", "Promedio espacial del corredor"),
    metricCard("Carga acumulada", numberFormat.format(analysis.integral), "µg·km/m³", "Integral de la spline entre 0 y 9 km"),
    metricCard("RMSE · validación", numberFormat.format(validation.rmse), "µg/m³", "Error de predicción leave-one-out"),
    metricCard("Error máximo", numberFormat.format(validation.maxAbsoluteError), "µg/m³", "Mayor error absoluto en 8 nodos"),
  );
  container.replaceChildren(fragment);
}

function renderAlerts(container, ranges) {
  const alerts = ranges.filter((range) => range.level !== "normal");
  if (alerts.length === 0) {
    container.replaceChildren(makeElement("div", "alert-empty", "Sin tramos por encima de 70 µg/m³."));
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const range of alerts) {
    const row = makeElement("div", `alert-row ${range.level}`);
    const level = makeElement("span", "alert-level");
    level.append(makeElement("span", "alert-status-dot"), document.createTextNode(range.level === "red" ? "Alerta roja" : "Alerta amarilla"));
    row.append(level, makeElement("span", "alert-distance", `${formatDistance(range.start)} – ${formatDistance(range.end)}`));
    fragment.append(row);
  }
  container.replaceChildren(fragment);
}

function renderValidation(container, tableContainer, validation) {
  const fragment = document.createDocumentFragment();
  const rmse = makeElement("div", "validation-stat");
  rmse.append(makeElement("span", "validation-stat-label", "RMSE"));
  rmse.append(makeElement("strong", "", `${numberFormat.format(validation.rmse)} µg/m³`));
  const max = makeElement("div", "validation-stat");
  max.append(makeElement("span", "validation-stat-label", "Error máximo"));
  max.append(makeElement("strong", "", `${numberFormat.format(validation.maxAbsoluteError)} µg/m³`));
  fragment.append(rmse, max);
  container.replaceChildren(fragment);

  const table = document.createElement("table");
  table.className = "validation-table";
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const label of ["Estación", "Real", "Predicción", "Error abs."]) {
    headerRow.append(makeElement("th", "", label));
  }
  head.append(headerRow);
  const body = document.createElement("tbody");
  for (const item of validation.errors) {
    const row = document.createElement("tr");
    row.append(
      makeElement("th", "", `E${item.station} · ${numberFormat.format(item.distance)} km`),
      makeElement("td", "", numberFormat.format(item.observed)),
      makeElement("td", "", preciseFormat.format(item.predicted)),
      makeElement("td", "", preciseFormat.format(item.absoluteError)),
    );
    body.append(row);
  }
  table.append(head, body);
  tableContainer.replaceChildren(table);
}

function renderMeasurements(container, x, y) {
  const fragment = document.createDocumentFragment();
  x.forEach((distance, index) => {
    const cell = makeElement("div", "measurement-cell");
    cell.append(makeElement("span", "", `E${index + 1} · ${distance} km`));
    cell.append(makeElement("b", "", numberFormat.format(y[index])));
    fragment.append(cell);
  });
  container.replaceChildren(fragment);
}

export function showAnalysis(analysis, elements, visibility) {
  renderMetrics(elements.metricGrid, analysis);
  renderAlerts(elements.alertRanges, analysis.alertRanges);
  renderValidation(elements.validationSummary, elements.validationTable, analysis.validation);
  renderMeasurements(elements.measurementSummary, analysis.x, analysis.y);
  renderChart(elements.chartContainer, analysis, visibility);
  elements.emptyState.hidden = true;
  elements.analysisResults.hidden = false;
}

export function showEmptyState(elements) {
  elements.analysisResults.hidden = true;
  elements.emptyState.hidden = false;
}
