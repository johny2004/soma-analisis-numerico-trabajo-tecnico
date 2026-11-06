import { createNaturalCubicSpline, createPchipInterpolator } from "./interpolation.js";

export const STATION_DISTANCES = Array.from({ length: 10 }, (_, index) => index);
export const SAMPLE_MEASUREMENTS = [45, 52, 68, 85, 92, 88, 79, 63, 48, 42];
export const SIMULATION_COUNT = 100;
export const SENSOR_NOISE_SIGMA = 2.5;

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianGenerator(random) {
  let spare = null;
  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = random();
    while (v === 0) v = random();
    const magnitude = Math.sqrt(-2 * Math.log(u));
    spare = magnitude * Math.sin(2 * Math.PI * v);
    return magnitude * Math.cos(2 * Math.PI * v);
  };
}

function percentile(sortedValues, probability) {
  const position = (sortedValues.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  const upper = Math.min(lower + 1, sortedValues.length - 1);
  return sortedValues[lower] * (1 - fraction) + sortedValues[upper] * fraction;
}

export function calculateLeaveOneOut(x, y) {
  const absoluteErrors = [];
  for (let omitted = 1; omitted < x.length - 1; omitted += 1) {
    const trainingX = x.filter((_, index) => index !== omitted);
    const trainingY = y.filter((_, index) => index !== omitted);
    const prediction = createNaturalCubicSpline(trainingX, trainingY).evaluate(x[omitted]);
    absoluteErrors.push({
      station: omitted + 1,
      distance: x[omitted],
      observed: y[omitted],
      predicted: prediction,
      absoluteError: Math.abs(y[omitted] - prediction),
    });
  }
  const rmse = Math.sqrt(absoluteErrors.reduce((sum, item) => sum + item.absoluteError ** 2, 0) / absoluteErrors.length);
  const maxAbsoluteError = Math.max(...absoluteErrors.map((item) => item.absoluteError));
  return { errors: absoluteErrors, rmse, maxAbsoluteError };
}

function findThresholdCrossings(spline, threshold, step = 0.01) {
  const crossings = [];
  const count = Math.ceil((spline.x.at(-1) - spline.x[0]) / step);
  let left = spline.x[0];
  let leftValue = spline.evaluate(left) - threshold;
  for (let index = 1; index <= count; index += 1) {
    const right = Math.min(spline.x[0] + index * step, spline.x.at(-1));
    const rightValue = spline.evaluate(right) - threshold;
    if ((leftValue < 0 && rightValue >= 0) || (leftValue >= 0 && rightValue < 0)) {
      let low = left;
      let high = right;
      const leftIsBelow = leftValue < 0;
      for (let iteration = 0; iteration < 40; iteration += 1) {
        const middle = (low + high) / 2;
        const isBelow = spline.evaluate(middle) - threshold < 0;
        if (isBelow === leftIsBelow) low = middle;
        else high = middle;
      }
      crossings.push((low + high) / 2);
    }
    left = right;
    leftValue = rightValue;
  }
  return crossings;
}

export function findAlertRanges(spline) {
  const start = spline.x[0];
  const end = spline.x.at(-1);
  const boundaries = [start, ...findThresholdCrossings(spline, 70), ...findThresholdCrossings(spline, 90), end]
    .sort((a, b) => a - b)
    .filter((value, index, values) => index === 0 || value - values[index - 1] > 1e-7);
  const ranges = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const from = boundaries[i];
    const to = boundaries[i + 1];
    const concentration = spline.evaluate((from + to) / 2);
    const level = concentration >= 90 ? "red" : concentration >= 70 ? "yellow" : "normal";
    const previous = ranges.at(-1);
    if (previous?.level === level) previous.end = to;
    else ranges.push({ start: from, end: to, level });
  }
  return ranges;
}

function calculateConfidenceBand(x, y, grid, simulations = SIMULATION_COUNT, sigma = SENSOR_NOISE_SIGMA) {
  let seed = 2166136261;
  for (const value of y) {
    seed ^= Math.round(value * 1000);
    seed = Math.imul(seed, 16777619);
  }
  const normal = gaussianGenerator(seededRandom(seed));
  const samples = grid.map(() => []);
  for (let iteration = 0; iteration < simulations; iteration += 1) {
    const perturbed = y.map((value) => value + sigma * normal());
    const spline = createNaturalCubicSpline(x, perturbed);
    for (let index = 0; index < grid.length; index += 1) samples[index].push(spline.evaluate(grid[index]));
  }
  return samples.map((values) => {
    values.sort((a, b) => a - b);
    return { lower: percentile(values, 0.025), upper: percentile(values, 0.975) };
  });
}

export function analyzeMeasurements(y) {
  if (!Array.isArray(y) || y.length !== STATION_DISTANCES.length
    || y.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Ingresa exactamente 10 concentraciones finitas y no negativas.");
  }
  const x = [...STATION_DISTANCES];
  const spline = createNaturalCubicSpline(x, y);
  const pchip = createPchipInterpolator(x, y);
  const grid = Array.from({ length: 91 }, (_, index) => index / 10);
  const integral = spline.integrate(0, 9);
  return {
    x,
    y: [...y],
    grid,
    splineValues: grid.map((distance) => spline.evaluate(distance)),
    pchipValues: grid.map((distance) => pchip.evaluate(distance)),
    confidenceBand: calculateConfidenceBand(x, y, grid),
    integral,
    averageConcentration: integral / 9,
    validation: calculateLeaveOneOut(x, y),
    alertRanges: findAlertRanges(spline),
    simulationCount: SIMULATION_COUNT,
    noiseSigma: SENSOR_NOISE_SIGMA,
  };
}
