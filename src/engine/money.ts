const millions = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const thousands = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

/** R$ 12,5 mi / R$ 750 mil */
export function formatMoney(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `R$ ${millions.format(value / 1_000_000)} mi`
  return `R$ ${thousands.format(value / 1000)} mil`
}

const reais = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
})

/** R$ 45, for small sums like ticket prices. */
export const formatReais = (value: number) => reais.format(value)
