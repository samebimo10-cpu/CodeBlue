import { describe, expect, it } from 'vitest';
import { computeTotals, money, type ReceiptData } from '../src/receipts/model';

const base = (): ReceiptData => ({
  template: 't', layout: 'classic', paper: 'A4', accent: '#000', font: 'sans', currency: '₦', title: 'R',
  business: { name: '', tagline: '', address: '', phone: '', email: '', website: '', regNo: '' }, logo: null,
  meta: [], party: { heading: '', fields: [] }, columns: { extra: '', desc: '', qty: '', price: '', amount: '' }, showExtra: false,
  items: [{ extra: '', desc: 'Room', qty: 3, price: 65000 }, { extra: '', desc: 'Dinner', qty: 1, price: 18500 }],
  discount: 0, charges: [{ label: 'VAT', rate: 7.5 }, { label: 'Service', rate: 10 }], amountPaid: null,
  paymentMethod: '', notes: '', footer: '', signatures: [], stamp: '',
});

describe('receipt totals', () => {
  it('adds VAT and service charge on the subtotal', () => {
    const t = computeTotals(base());
    expect(t.subtotal).toBe(213500);
    expect(t.charges.map((c) => c.amount)).toEqual([16012.5, 21350]);
    expect(t.total).toBe(250862.5);
    expect(t.balance).toBe(0);
  });
  it('applies discount before charges and works out change', () => {
    const d = base();
    d.discount = 13500;
    d.charges = [{ label: 'VAT', rate: 7.5 }];
    d.amountPaid = 220000;
    const t = computeTotals(d);
    expect(t.total).toBe(215000);
    expect(t.balance).toBe(-5000);
  });
  it('formats money', () => {
    expect(money(1234.5, '₦')).toBe('₦1,234.50');
    expect(money(-3, '$')).toBe('-$3.00');
  });
});
