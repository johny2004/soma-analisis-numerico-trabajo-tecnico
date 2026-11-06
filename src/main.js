import { analyzeMeasurements, SAMPLE_MEASUREMENTS, STATION_DISTANCES } from "./analysis.js";
import { buildStationFields, clearFormError, fillSampleMeasurements, readMeasurements, showAnalysis, showEmptyState, showFormError } from "./ui.js";

const fields = document.querySelector("#station-fields");
const form = document.querySelector("#measurement-form");
const error = document.querySelector("#form-error");
const sampleButton = document.querySelector("#sample-button");
const elements = {
  emptyState: document.querySelector("#empty-state"),
  analysisResults: document.querySelector("#analysis-results"),
  chartContainer: document.querySelector("#chart-container"),
  metricGrid: document.querySelector("#metric-grid"),
  alertRanges: document.querySelector("#alert-ranges"),
  validationSummary: document.querySelector("#validation-summary"),
  validationTable: document.querySelector("#validation-table"),
  measurementSummary: document.querySelector("#measurement-summary"),
};
const toggles = {
  spline: document.querySelector("#toggle-spline"),
  pchip: document.querySelector("#toggle-pchip"),
  band: document.querySelector("#toggle-band"),
};
let latestAnalysis = null;

function chartVisibility() {
  return Object.fromEntries(Object.entries(toggles).map(([key, input]) => [key, input.checked]));
}

function renderCurrentChart() {
  if (latestAnalysis) {
    showAnalysis(latestAnalysis, elements, chartVisibility());
  }
}

buildStationFields(fields, STATION_DISTANCES);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearFormError(error);
  const inputs = [...fields.querySelectorAll("input")];
  const measurements = readMeasurements(fields);
  const invalidIndex = measurements.findIndex((value) => !Number.isFinite(value) || value < 0);
  if (invalidIndex !== -1) {
    const input = inputs[invalidIndex];
    input.focus();
    input.setCustomValidity("Ingresa una concentración finita y no negativa.");
    input.reportValidity();
    showFormError(error, "Completa las 10 estaciones con concentraciones finitas y no negativas. Revisa el campo señalado.");
    return;
  }
  inputs.forEach((input) => input.setCustomValidity(""));
  try {
    latestAnalysis = analyzeMeasurements(measurements);
    showAnalysis(latestAnalysis, elements, chartVisibility());
    elements.analysisResults.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (caught) {
    latestAnalysis = null;
    showEmptyState(elements);
    showFormError(error, caught instanceof Error ? caught.message : "No se pudo analizar la medición. Verifica los datos e inténtalo de nuevo.");
  }
});

fields.addEventListener("input", (event) => {
  if (event.target instanceof HTMLInputElement) event.target.setCustomValidity("");
  clearFormError(error);
  if (latestAnalysis) {
    latestAnalysis = null;
    showEmptyState(elements);
  }
});

sampleButton.addEventListener("click", () => {
  fillSampleMeasurements(fields, SAMPLE_MEASUREMENTS);
  clearFormError(error);
  fields.querySelector("input").focus();
});

Object.values(toggles).forEach((toggle) => toggle.addEventListener("change", renderCurrentChart));
