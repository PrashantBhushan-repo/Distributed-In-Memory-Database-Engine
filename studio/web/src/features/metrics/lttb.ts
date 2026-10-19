/**
 * Largest-Triangle-Three-Buckets (LTTB) downsampling algorithm
 * Preserves visually significant peaks and valleys for high-density charts.
 */
export function downsampleLTTB<T extends Record<string, any>>(
  data: T[],
  threshold: number,
  xAccessor: (item: T) => number,
  yAccessor: (item: T) => number
): T[] {
  if (threshold >= data.length || threshold <= 2) {
    return data;
  }

  const sampled: T[] = [];
  const bucketSize = (data.length - 2) / (threshold - 2);

  // Always include first point
  sampled.push(data[0]);

  let a = 0; // Previous selected point index

  for (let i = 0; i < threshold - 2; i++) {
    // Calculate average point for the next bucket (bucket C)
    let avgX = 0;
    let avgY = 0;
    const nextBucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const nextBucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, data.length);
    const nextBucketLength = nextBucketEnd - nextBucketStart;

    if (nextBucketLength > 0) {
      for (let j = nextBucketStart; j < nextBucketEnd; j++) {
        avgX += xAccessor(data[j]);
        avgY += yAccessor(data[j]);
      }
      avgX /= nextBucketLength;
      avgY /= nextBucketLength;
    } else {
      const idx = Math.min(nextBucketStart, data.length - 1);
      avgX = xAccessor(data[idx]);
      avgY = yAccessor(data[idx]);
    }

    // Current bucket range (bucket B)
    const currentBucketStart = Math.floor(i * bucketSize) + 1;
    const currentBucketEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, data.length);

    // Find point in current bucket that forms the largest triangle with point A and avg C
    const pointAX = xAccessor(data[a]);
    const pointAY = yAccessor(data[a]);

    let maxArea = -1;
    let maxAreaIndex = currentBucketStart;

    for (let j = currentBucketStart; j < currentBucketEnd; j++) {
      const currentX = xAccessor(data[j]);
      const currentY = yAccessor(data[j]);

      // Triangle area: 0.5 * |x_A(y_B - y_C) + x_B(y_C - y_A) + x_C(y_A - y_B)|
      const area = Math.abs(
        (pointAX - avgX) * (currentY - pointAY) - (pointAX - currentX) * (avgY - pointAY)
      ) * 0.5;

      if (area > maxArea) {
        maxArea = area;
        maxAreaIndex = j;
      }
    }

    sampled.push(data[maxAreaIndex]);
    a = maxAreaIndex;
  }

  // Always include last point
  sampled.push(data[data.length - 1]);

  return sampled;
}

/**
 * Downloads arbitrary time-series chart data as a clean CSV file
 */
export function exportChartToCsv(
  filename: string,
  data: Record<string, any>[],
  columns: { key: string; header: string }[]
) {
  if (!data || data.length === 0) return;

  const headerRow = columns.map((c) => `"${c.header.replace(/"/g, '""')}"`).join(',');
  const rows = data.map((row) =>
    columns
      .map((c) => {
        let val = row[c.key];
        if (c.key === 'timestamp' || c.key === 'time') {
          val = new Date(val).toISOString();
        }
        if (val === undefined || val === null) val = '';
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(',')
  );

  const csvContent = [headerRow, ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
