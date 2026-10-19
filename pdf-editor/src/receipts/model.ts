export interface KV {
  label: string;
  value: string;
}

export interface LineItem {
  extra: string;
  desc: string;
  qty: number;
  price: number;
}

export interface Charge {
  label: string;
  rate: number; // percent of the discounted subtotal
}

export type Layout = 'classic' | 'compact' | 'folio' | 'thermal';
export type Paper = 'A4' | 'A5' | 'Letter' | 'thermal80' | 'thermal58';
export type FontKind = 'sans' | 'serif' | 'mono';

export interface ReceiptData {
  template: string;
  layout: Layout;
  paper: Paper;
  accent: string;
  font: FontKind;
  currency: string;
  title: string;
  business: { name: string; tagline: string; address: string; phone: string; email: string; website: string; regNo: string };
  logo: string | null;
  meta: KV[];
  party: { heading: string; fields: KV[] };
  columns: { extra: string; desc: string; qty: string; price: string; amount: string };
  showExtra: boolean;
  items: LineItem[];
  discount: number;
  charges: Charge[];
  amountPaid: number | null;
  paymentMethod: string;
  notes: string;
  footer: string;
  signatures: string[];
  stamp: '' | 'PAID' | 'PART PAID' | 'UNPAID' | 'COPY';
}

export interface Totals {
  subtotal: number;
  discount: number;
  charges: { label: string; rate: number; amount: number }[];
  total: number;
  paid: number;
  balance: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function lineAmount(i: LineItem) {
  return round2((Number(i.qty) || 0) * (Number(i.price) || 0));
}

export function computeTotals(d: ReceiptData): Totals {
  const subtotal = round2(d.items.reduce((s, i) => s + lineAmount(i), 0));
  const discount = round2(Math.min(subtotal, Math.max(0, Number(d.discount) || 0)));
  const base = subtotal - discount;
  const charges = d.charges
    .filter((c) => c.label.trim() || c.rate)
    .map((c) => ({ label: c.label, rate: Number(c.rate) || 0, amount: round2((base * (Number(c.rate) || 0)) / 100) }));
  const total = round2(base + charges.reduce((s, c) => s + c.amount, 0));
  const paid = d.amountPaid === null || Number.isNaN(d.amountPaid) ? total : round2(d.amountPaid);
  return { subtotal, discount, charges, total, paid, balance: round2(total - paid) };
}

export function money(n: number, currency: string) {
  const neg = n < 0;
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (neg ? '-' : '') + currency + s;
}

export const PAPER_PT: Record<Paper, { w: number; h: number | null; label: string }> = {
  A4: { w: 595.28, h: 841.89, label: 'A4' },
  A5: { w: 419.53, h: 595.28, label: 'A5' },
  Letter: { w: 612, h: 792, label: 'US Letter' },
  thermal80: { w: 226.77, h: null, label: '80 mm roll' },
  thermal58: { w: 164.41, h: null, label: '58 mm roll' },
};

export const CURRENCIES = ['₦', '$', '£', '€', 'GH₵', 'KSh ', 'R ', '₹', 'CFA ', 'USh '];
