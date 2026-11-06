import test from "node:test";
import assert from "node:assert/strict";
import { createNaturalCubicSpline, createPchipInterpolator } from "../src/interpolation.js";
import { analyzeMeasurements, SAMPLE_MEASUREMENTS } from "../src/analysis.js";

test("natural spline passes through every measurement and preserves a line", () => {
  const spline = createNaturalCubicSpline([0, 1, 2, 3], [2, 5, 8, 11]);
  for (let index = 0; index < 4; index += 1) {
    assert.ok(Math.abs(spline.evaluate(index) - (2 + 3 * index)) < 1e-12);
  }
  assert.ok(Math.abs(spline.integrate(0, 3) - 19.5) < 1e-12);
});

test("natural spline supports partial integrals and rejects invalid domains", () => {
  const spline = createNaturalCubicSpline([0, 1], [1, 3]);
  assert.ok(Math.abs(spline.integrate(0.25, 0.75) - 1) < 1e-12);
  assert.throws(() => spline.integrate(-1, 1), /dentro del dominio/);
});

test("natural spline builds the coefficients from the formula-sheet system", () => {
  const spline = createNaturalCubicSpline([0, 1, 2], [0, 1, 0]);
  assert.deepEqual(spline.coefficients, [
    { a: 0, b: 1.5, c: 0, d: -0.5 },
    { a: 1, b: 0, c: -1.5, d: 0.5 },
  ]);
  assert.ok(Math.abs(spline.evaluate(0.5) - 0.6875) < 1e-12);
  assert.ok(Math.abs(spline.integrate(0, 2) - 1.25) < 1e-12);
});

test("PCHIP interpolates nodes and remains within monotone data bounds", () => {
  const pchip = createPchipInterpolator([0, 1, 2, 3], [0, 1, 1.5, 4]);
  for (let index = 0; index < 4; index += 1) {
    assert.ok(Math.abs(pchip.evaluate(index) - [0, 1, 1.5, 4][index]) < 1e-12);
  }
  for (let distance = 0; distance <= 3; distance += 0.01) {
    assert.ok(pchip.evaluate(distance) >= -1e-12);
    assert.ok(pchip.evaluate(distance) <= 4 + 1e-12);
  }
});

test("interpolators reject repeated or unsorted distances", () => {
  assert.throws(() => createNaturalCubicSpline([0, 2, 1], [1, 2, 3]), /ordenadas/);
  assert.throws(() => createPchipInterpolator([0, 1, 1], [1, 2, 3]), /repetirse/);
});

test("case measurements yield 91 estimates, 8 validation predictions, and a confidence band", () => {
  const result = analyzeMeasurements(SAMPLE_MEASUREMENTS);
  assert.equal(result.grid.length, 91);
  assert.equal(result.splineValues.length, 91);
  assert.equal(result.pchipValues.length, 91);
  assert.equal(result.confidenceBand.length, 91);
  assert.equal(result.validation.errors.length, 8);
  assert.ok(result.integral > 0);
  assert.ok(Math.abs(result.averageConcentration - result.integral / 9) < 1e-12);
  assert.ok(result.confidenceBand.every(({ lower, upper }) => lower <= upper));
});
