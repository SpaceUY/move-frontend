const priceFormat = new Intl.NumberFormat("es-UY", { useGrouping: "always" });
const exactFormat = new Intl.NumberFormat("es-UY", {
  useGrouping: "always",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const exactCentsFormat = new Intl.NumberFormat("es-UY", {
  useGrouping: "always",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPrice(amount: number): string {
  return `$ ${priceFormat.format(Math.ceil(amount))}`;
}

/** The real amount: whole pesos as they are, cents with two decimals (never rounded up). */
export function formatExactPrice(amount: number): string {
  const format = Number.isInteger(amount) ? exactFormat : exactCentsFormat;
  return `$ ${format.format(amount)}`;
}

/** Always two decimals ("$ 372.660,00"), so a column of amounts reads the same whether or not it has cents. */
export function formatPriceWithCents(amount: number): string {
  return `$ ${exactCentsFormat.format(amount)}`;
}
