export function formatCurrency(value: number, compact = false): string {
  if (compact && Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (compact && Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPct(value: number, decimals = 2): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatQuantity(value: number): string {
  if (value % 1 === 0) return value.toLocaleString("en-US");
  return value.toFixed(8).replace(/\.?0+$/, "");
}

export function pnlClass(value: number): string {
  if (value > 0) return "text-[oklch(0.65_0.18_145)]";
  if (value < 0) return "text-[oklch(0.60_0.22_25)]";
  return "text-muted-foreground";
}

export function rankBadgeClass(rank: number, total: number): string {
  if (rank === 1) return "text-yellow-400 bg-yellow-400/10 border-yellow-400/20";
  if (rank === total) return "text-red-400 bg-red-400/10 border-red-400/20";
  return "text-muted-foreground bg-muted/10 border-border";
}
