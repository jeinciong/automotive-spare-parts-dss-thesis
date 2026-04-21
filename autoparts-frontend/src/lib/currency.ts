export const PESO_SYMBOL = "₱";

const toNumber = (value: number | string | null | undefined) => {
  const numeric = typeof value === "string" ? Number(value) : value ?? 0;
  return Number.isFinite(numeric) ? numeric : 0;
};

export function formatCurrency(
  value: number | string | null | undefined,
  options: Intl.NumberFormatOptions = {},
) {
  const amount = toNumber(value);

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(amount);
}

export function formatCurrencyCompact(
  value: number | string | null | undefined,
  maximumFractionDigits = 1,
) {
  const amount = toNumber(value);
  const abs = Math.abs(amount);

  if (abs >= 1_000_000) {
    return `${PESO_SYMBOL}${(amount / 1_000_000).toFixed(maximumFractionDigits)}M`;
  }

  if (abs >= 1_000) {
    return `${PESO_SYMBOL}${(amount / 1_000).toFixed(maximumFractionDigits)}K`;
  }

  return formatCurrency(amount, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
