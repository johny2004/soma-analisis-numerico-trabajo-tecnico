function validateNodes(x, y) {
  if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length || x.length < 2) {
    throw new Error("Se requieren al menos dos pares de nodos.");
  }
  for (let i = 0; i < x.length; i += 1) {
    if (!Number.isFinite(x[i]) || !Number.isFinite(y[i])) {
      throw new Error("Todos los nodos deben ser números finitos.");
    }
    if (i > 0 && x[i] <= x[i - 1]) {
      throw new Error("Las distancias deben estar ordenadas y no repetirse.");
    }
  }
}

function findInterval(x, value) {
  if (value <= x[0]) return 0;
  if (value >= x[x.length - 1]) return x.length - 2;
  let low = 0;
  let high = x.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (x[middle] <= value) low = middle;
    else high = middle;
  }
  return low;
}

function solveTridiagonal(lower, diagonal, upper, rhs) {
  const c = [...upper];
  const d = [...rhs];
  const b = [...diagonal];
  for (let i = 1; i < b.length; i += 1) {
    const factor = lower[i] / b[i - 1];
    b[i] -= factor * c[i - 1];
    d[i] -= factor * d[i - 1];
  }
  const solution = Array(b.length).fill(0);
  solution[b.length - 1] = d[b.length - 1] / b[b.length - 1];
  for (let i = b.length - 2; i >= 0; i -= 1) {
    solution[i] = (d[i] - c[i] * solution[i + 1]) / b[i];
  }
  return solution;
}

export function createNaturalCubicSpline(x, y) {
  validateNodes(x, y);
  const n = x.length;
  const widths = Array.from({ length: n - 1 }, (_, index) => x[index + 1] - x[index]);
  const lower = Array(n).fill(0);
  const diagonal = Array(n).fill(0);
  const upper = Array(n).fill(0);
  const rhs = Array(n).fill(0);

  diagonal[0] = 1;
  diagonal[n - 1] = 1;
  for (let j = 1; j < n - 1; j += 1) {
    const leftWidth = widths[j - 1];
    const rightWidth = widths[j];
    const leftSecant = (y[j] - y[j - 1]) / leftWidth;
    const rightSecant = (y[j + 1] - y[j]) / rightWidth;
    lower[j] = leftWidth;
    diagonal[j] = 2 * (leftWidth + rightWidth);
    upper[j] = rightWidth;
    rhs[j] = 3 * (rightSecant - leftSecant);
  }

  const c = solveTridiagonal(lower, diagonal, upper, rhs);
  const segments = widths.map((width, j) => {
    const a = y[j];
    const b = (y[j + 1] - y[j]) / width - width * (2 * c[j] + c[j + 1]) / 3;
    const d = (c[j + 1] - c[j]) / (3 * width);
    return { a, b, c: c[j], d };
  });

  function evaluate(value) {
    const i = findInterval(x, value);
    const offset = value - x[i];
    const { a, b, c: quadratic, d } = segments[i];
    return a + offset * (b + offset * (quadratic + offset * d));
  }

  function integrate(start = x[0], end = x[x.length - 1]) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < x[0] || end > x[x.length - 1] || start > end) {
      throw new Error("Los límites de integración deben estar dentro del dominio y en orden.");
    }
    let total = 0;
    for (let i = 0; i < n - 1; i += 1) {
      const left = Math.max(start, x[i]);
      const right = Math.min(end, x[i + 1]);
      if (right <= left) continue;
      const from = left - x[i];
      const to = right - x[i];
      const { a, b, c: quadratic, d } = segments[i];
      const primitive = (t) => a * t + b * t ** 2 / 2
        + quadratic * t ** 3 / 3 + d * t ** 4 / 4;
      total += primitive(to) - primitive(from);
    }
    return total;
  }

  return { evaluate, integrate, x: [...x], y: [...y], coefficients: segments };
}

function endpointSlope(firstWidth, secondWidth, firstSecant, secondSecant) {
  let slope = ((2 * firstWidth + secondWidth) * firstSecant - firstWidth * secondSecant)
    / (firstWidth + secondWidth);
  if (Math.sign(slope) !== Math.sign(firstSecant)) return 0;
  if (Math.sign(firstSecant) !== Math.sign(secondSecant) && Math.abs(slope) > 3 * Math.abs(firstSecant)) {
    slope = 3 * firstSecant;
  }
  return slope;
}

export function createPchipInterpolator(x, y) {
  validateNodes(x, y);
  const n = x.length;
  const widths = Array.from({ length: n - 1 }, (_, i) => x[i + 1] - x[i]);
  const secants = Array.from({ length: n - 1 }, (_, i) => (y[i + 1] - y[i]) / widths[i]);
  const slopes = Array(n).fill(0);

  if (n === 2) {
    slopes[0] = secants[0];
    slopes[1] = secants[0];
  } else {
    for (let i = 1; i < n - 1; i += 1) {
      const before = secants[i - 1];
      const after = secants[i];
      if (before === 0 || after === 0 || Math.sign(before) !== Math.sign(after)) continue;
      const weightBefore = 2 * widths[i] + widths[i - 1];
      const weightAfter = widths[i] + 2 * widths[i - 1];
      slopes[i] = (weightBefore + weightAfter)
        / (weightBefore / before + weightAfter / after);
    }
    slopes[0] = endpointSlope(widths[0], widths[1], secants[0], secants[1]);
    slopes[n - 1] = endpointSlope(widths[n - 2], widths[n - 3], secants[n - 2], secants[n - 3]);
  }

  function evaluate(value) {
    const i = findInterval(x, value);
    const width = widths[i];
    const t = (value - x[i]) / width;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y[i]
      + (t3 - 2 * t2 + t) * width * slopes[i]
      + (-2 * t3 + 3 * t2) * y[i + 1]
      + (t3 - t2) * width * slopes[i + 1];
  }

  return { evaluate, x: [...x], y: [...y], slopes };
}
