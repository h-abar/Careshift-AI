/**
 * Cheap in-process request metrics (item 8): per-route request count and
 * cumulative latency. In-memory is intentional — a multi-instance deploy
 * should scrape each instance; this is a floor, not a full telemetry stack.
 */

interface Bucket {
  count: number;
  totalMs: number;
}

const buckets = new Map<string, Bucket>();

export function recordRequest(route: string, status: number, ms: number) {
  const key = `${route}|${Math.floor(status / 100)}xx`;
  const b = buckets.get(key) ?? { count: 0, totalMs: 0 };
  b.count += 1;
  b.totalMs += ms;
  buckets.set(key, b);
}

/** Prometheus text exposition format. */
export function metricsText(): string {
  const lines = [
    "# HELP careshift_http_requests_total HTTP requests by route/status class",
    "# TYPE careshift_http_requests_total counter",
  ];
  for (const [key, b] of buckets) {
    const [route, cls] = key.split("|");
    lines.push(
      `careshift_http_requests_total{route="${route}",status="${cls}"} ${b.count}`,
    );
    lines.push(
      `careshift_http_duration_ms_sum{route="${route}",status="${cls}"} ${b.totalMs.toFixed(1)}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function __resetMetricsForTests() {
  buckets.clear();
}
