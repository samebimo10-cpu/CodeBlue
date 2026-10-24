import type { ReceiptData } from './model';
import { defaultLogo, renderLogo, type LogoSpec } from '../logo/logo';

export interface Template {
  id: string;
  name: string;
  sector: 'Hospital' | 'Pharmacy' | 'Hotel' | 'Airport';
  description: string;
  logo: LogoSpec;
  build(): Omit<ReceiptData, 'logo'>;
}

const today = () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const now = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const daysFrom = (d: number) => {
  const t = new Date();
  t.setDate(t.getDate() + d);
  return t.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Business details are placeholders to replace with your own.
export const TEMPLATES: Template[] = [
  {
    id: 'hospital-receipt',
    name: 'Hospital payment receipt',
    sector: 'Hospital',
    description: 'A4 receipt for consultations, tests, scans and admissions.',
    logo: { ...defaultLogo(), preset: 'hospital', shape: 'circle', bg: '#0b6e99', fg: '#ffffff', icon: 'cross', text: '', layout: 'icon' },
    build: () => ({
      template: 'hospital-receipt', layout: 'classic', paper: 'A4', accent: '#0b6e99', font: 'sans', currency: '₦',
      title: 'PAYMENT RECEIPT',
      business: { name: 'Your Hospital Name', tagline: 'Specialist & General Medical Care', address: '12 Hospital Road, Your City', phone: '+234 800 000 0000', email: 'billing@yourhospital.example', website: 'www.yourhospital.example', regNo: 'Reg. No. 000000' },
      meta: [
        { label: 'Receipt No.', value: 'HSP-000123' },
        { label: 'Date', value: today() },
        { label: 'Time', value: now() },
        { label: 'Cashier', value: 'Cashier Name' },
      ],
      party: { heading: 'Patient', fields: [
        { label: 'Name', value: 'Patient Name' },
        { label: 'Hospital No.', value: 'MRN 004512' },
        { label: 'Department', value: 'Outpatient (OPD)' },
        { label: 'Doctor', value: 'Dr. A. Example' },
        { label: 'Payer / HMO', value: 'Self-pay' },
        { label: 'Phone', value: '080 0000 0000' },
      ] },
      columns: { extra: 'Code', desc: 'Service', qty: 'Qty', price: 'Unit price', amount: 'Amount' },
      showExtra: false,
      items: [
        { extra: 'C01', desc: 'Consultation — General Practitioner', qty: 1, price: 15000 },
        { extra: 'L12', desc: 'Full Blood Count (FBC)', qty: 1, price: 8500 },
        { extra: 'L07', desc: 'Malaria Parasite Test', qty: 1, price: 3500 },
        { extra: 'R03', desc: 'Chest X-ray (PA view)', qty: 1, price: 20000 },
        { extra: 'N02', desc: 'Nursing care / injection', qty: 2, price: 2500 },
      ],
      discount: 0, charges: [], amountPaid: null, paymentMethod: 'POS / Card',
      notes: 'Please keep this receipt for your records and follow-up visits.',
      footer: 'Thank you for choosing us. Wishing you good health.',
      signatures: ['Cashier', 'Patient / Guardian'], stamp: 'PAID',
    }),
  },
  {
    id: 'lab-invoice',
    name: 'Clinic / diagnostic lab bill',
    sector: 'Hospital',
    description: 'Compact A5 bill for a clinic or diagnostic laboratory.',
    logo: { ...defaultLogo(), preset: 'lab', shape: 'rounded', bg: '#6d28d9', fg: '#ffffff', icon: 'flask', text: '', layout: 'icon' },
    build: () => ({
      template: 'lab-invoice', layout: 'compact', paper: 'A5', accent: '#6d28d9', font: 'sans', currency: '₦',
      title: 'LABORATORY BILL',
      business: { name: 'Your Diagnostic Centre', tagline: 'Laboratory • Imaging • Wellness', address: '5 Clinic Close, Your City', phone: '+234 800 111 2222', email: 'results@yourlab.example', website: '', regNo: 'MLSCN Reg. 0000' },
      meta: [
        { label: 'Bill No.', value: 'LAB-2291' },
        { label: 'Date', value: today() },
        { label: 'Sample ID', value: 'S-55871' },
      ],
      party: { heading: 'Patient', fields: [
        { label: 'Name', value: 'Patient Name' },
        { label: 'Age / Sex', value: '34 / F' },
        { label: 'Referred by', value: 'Dr. B. Example' },
        { label: 'Collected', value: today() + ' ' + now() },
      ] },
      columns: { extra: 'Code', desc: 'Investigation', qty: 'Qty', price: 'Price', amount: 'Amount' },
      showExtra: true,
      items: [
        { extra: 'HB1', desc: 'Haemoglobin (HB)', qty: 1, price: 2500 },
        { extra: 'LFT', desc: 'Liver Function Test', qty: 1, price: 18000 },
        { extra: 'FBS', desc: 'Fasting Blood Sugar', qty: 1, price: 3000 },
        { extra: 'U/A', desc: 'Urinalysis', qty: 1, price: 2000 },
      ],
      discount: 1500, charges: [], amountPaid: null, paymentMethod: 'Bank transfer',
      notes: 'Results are ready within 24 hours. Bring this bill when collecting results.',
      footer: 'Accurate results. Caring service.',
      signatures: ['Received by'], stamp: 'PAID',
    }),
  },
  {
    id: 'pharmacy-thermal',
    name: 'Pharmacy till receipt',
    sector: 'Pharmacy',
    description: '80 mm thermal-printer style receipt for counter sales.',
    logo: { ...defaultLogo(), preset: 'pharmacy', shape: 'none', bg: '#16794a', fg: '#16794a', icon: 'cross', text: '', layout: 'icon' },
    build: () => ({
      template: 'pharmacy-thermal', layout: 'thermal', paper: 'thermal80', accent: '#111111', font: 'mono', currency: '₦',
      title: 'SALES RECEIPT',
      business: { name: 'YOUR PHARMACY LTD', tagline: 'Community Pharmacy', address: '22 Market Street, Your City', phone: 'Tel: 0800 000 0000', email: '', website: '', regNo: 'PCN Premises Reg. 00000' },
      meta: [
        { label: 'Receipt', value: '#PH-104582' },
        { label: 'Date', value: today() + ' ' + now() },
        { label: 'Till', value: '02' },
        { label: 'Cashier', value: 'Name' },
        { label: 'Rx No.', value: '—' },
      ],
      party: { heading: 'Customer', fields: [{ label: 'Customer', value: 'Walk-in' }] },
      columns: { extra: 'Batch', desc: 'Item', qty: 'Qty', price: 'Price', amount: 'Amount' },
      showExtra: false,
      items: [
        { extra: '', desc: 'Paracetamol 500mg Tabs x12', qty: 2, price: 450 },
        { extra: '', desc: 'Amoxicillin 500mg Caps x21', qty: 1, price: 2800 },
        { extra: '', desc: 'Vitamin C 1000mg Effervescent', qty: 1, price: 1950 },
        { extra: '', desc: 'Oral Rehydration Salts', qty: 3, price: 300 },
        { extra: '', desc: 'Hand Sanitizer 250ml', qty: 1, price: 1500 },
      ],
      discount: 0, charges: [], amountPaid: 10000, paymentMethod: 'Cash',
      notes: 'Take medicines as directed by your pharmacist.',
      footer: 'Thank you for your patronage!\nGoods sold in good condition are not returnable.',
      signatures: [], stamp: '',
    }),
  },
  {
    id: 'pharmacy-invoice',
    name: 'Pharmacy sales invoice',
    sector: 'Pharmacy',
    description: 'A4 invoice with batch and expiry column, VAT and customer details.',
    logo: { ...defaultLogo(), preset: 'pharmacy', shape: 'rounded', bg: '#16794a', fg: '#ffffff', icon: 'pill', text: '', layout: 'icon' },
    build: () => ({
      template: 'pharmacy-invoice', layout: 'classic', paper: 'A4', accent: '#16794a', font: 'sans', currency: '₦',
      title: 'SALES INVOICE',
      business: { name: 'Your Pharmacy & Stores', tagline: 'Wholesale and Retail Pharmacy', address: '8 Health Avenue, Your City', phone: '+234 800 333 4444', email: 'sales@yourpharmacy.example', website: 'www.yourpharmacy.example', regNo: 'PCN Reg. 00000 • TIN 0000000-0001' },
      meta: [
        { label: 'Invoice No.', value: 'INV-30871' },
        { label: 'Date', value: today() },
        { label: 'Due', value: daysFrom(14) },
        { label: 'Sales rep', value: 'Name' },
      ],
      party: { heading: 'Bill to', fields: [
        { label: 'Customer', value: 'Customer / Clinic Name' },
        { label: 'Address', value: 'Customer address' },
        { label: 'Phone', value: '080 0000 0000' },
        { label: 'Prescriber', value: '—' },
      ] },
      columns: { extra: 'Batch / Exp.', desc: 'Product', qty: 'Qty', price: 'Unit price', amount: 'Amount' },
      showExtra: true,
      items: [
        { extra: 'B2417 • 08/27', desc: 'Artemether/Lumefantrine 80/480 x6', qty: 10, price: 3200 },
        { extra: 'C1180 • 03/27', desc: 'Ciprofloxacin 500mg x10', qty: 5, price: 1850 },
        { extra: 'M0921 • 11/26', desc: 'Metformin 500mg x100', qty: 4, price: 2600 },
        { extra: 'G7781 • 01/28', desc: 'Sterile gloves (box of 100)', qty: 2, price: 7500 },
      ],
      discount: 2000, charges: [{ label: 'VAT', rate: 7.5 }], amountPaid: 40000, paymentMethod: 'Bank transfer',
      notes: 'Bank: Your Bank • Acct: 0000000000 • Your Pharmacy & Stores',
      footer: 'Store below 25°C. Keep all medicines out of reach of children.',
      signatures: ['Pharmacist', 'Customer'], stamp: 'PART PAID',
    }),
  },
  {
    id: 'hotel-folio',
    name: 'Hotel guest folio',
    sector: 'Hotel',
    description: 'Checkout bill with room nights, restaurant, laundry, VAT and service charge.',
    logo: { ...defaultLogo(), preset: 'hotel', shape: 'shield', bg: '#1f2937', fg: '#d4a24c', icon: 'crown', text: 'H', layout: 'icon' },
    build: () => ({
      template: 'hotel-folio', layout: 'folio', paper: 'A4', accent: '#9a6b1f', font: 'serif', currency: '₦',
      title: 'GUEST FOLIO',
      business: { name: 'Your Hotel & Suites', tagline: 'Comfort • Class • Hospitality', address: '1 Lagoon Drive, Your City', phone: '+234 800 555 6666', email: 'frontdesk@yourhotel.example', website: 'www.yourhotel.example', regNo: 'Tourism Reg. 0000' },
      meta: [
        { label: 'Folio No.', value: 'F-88214' },
        { label: 'Date', value: today() },
        { label: 'Cashier', value: 'Front Desk' },
      ],
      party: { heading: 'Guest', fields: [
        { label: 'Guest name', value: 'Guest Name' },
        { label: 'Room', value: '304 — Deluxe King' },
        { label: 'Arrival', value: daysFrom(-3) },
        { label: 'Departure', value: today() },
        { label: 'Nights', value: '3' },
        { label: 'Guests', value: '2 Adults' },
      ] },
      columns: { extra: 'Date', desc: 'Description', qty: 'Qty', price: 'Rate', amount: 'Amount' },
      showExtra: true,
      items: [
        { extra: daysFrom(-3), desc: 'Room charge — Deluxe King', qty: 3, price: 65000 },
        { extra: daysFrom(-2), desc: 'Restaurant — dinner', qty: 1, price: 18500 },
        { extra: daysFrom(-1), desc: 'Laundry service', qty: 1, price: 6000 },
        { extra: daysFrom(-1), desc: 'Minibar', qty: 1, price: 4500 },
        { extra: today(), desc: 'Airport shuttle', qty: 1, price: 15000 },
      ],
      discount: 0, charges: [{ label: 'VAT', rate: 7.5 }, { label: 'Service charge', rate: 10 }], amountPaid: null, paymentMethod: 'Card (Visa •••• 0000)',
      notes: 'Check-out time is 12:00 noon.',
      footer: 'Thank you for staying with us. We look forward to welcoming you back.',
      signatures: ['Front Office', 'Guest'], stamp: 'PAID',
    }),
  },
  {
    id: 'hotel-restaurant',
    name: 'Hotel restaurant / bar bill',
    sector: 'Hotel',
    description: 'Thermal bill for the restaurant, lounge or bar, with table & waiter.',
    logo: { ...defaultLogo(), preset: 'restaurant', shape: 'none', bg: '#9a6b1f', fg: '#111111', icon: 'cutlery', text: '', layout: 'icon' },
    build: () => ({
      template: 'hotel-restaurant', layout: 'thermal', paper: 'thermal80', accent: '#111111', font: 'mono', currency: '₦',
      title: 'RESTAURANT BILL',
      business: { name: 'YOUR HOTEL & SUITES', tagline: 'The Garden Restaurant', address: '1 Lagoon Drive, Your City', phone: 'Tel: 0800 555 6666', email: '', website: '', regNo: '' },
      meta: [
        { label: 'Bill', value: '#R-55120' },
        { label: 'Date', value: today() + ' ' + now() },
        { label: 'Table', value: '12' },
        { label: 'Covers', value: '2' },
        { label: 'Waiter', value: 'Name' },
      ],
      party: { heading: 'Guest', fields: [{ label: 'Room', value: 'Walk-in' }] },
      columns: { extra: '', desc: 'Item', qty: 'Qty', price: 'Price', amount: 'Amount' },
      showExtra: false,
      items: [
        { extra: '', desc: 'Jollof Rice & Grilled Chicken', qty: 2, price: 7500 },
        { extra: '', desc: 'Pepper Soup (Goat meat)', qty: 1, price: 5500 },
        { extra: '', desc: 'Chapman (large)', qty: 2, price: 3000 },
        { extra: '', desc: 'Bottled water 75cl', qty: 2, price: 800 },
      ],
      discount: 0, charges: [{ label: 'VAT', rate: 7.5 }, { label: 'Service', rate: 5 }], amountPaid: null, paymentMethod: 'Charged to room / POS',
      notes: '',
      footer: 'Thank you! Please come again.',
      signatures: ['Guest signature'], stamp: '',
    }),
  },
  {
    id: 'airport-hotel-taxi',
    name: 'Airport hotel & taxi receipt',
    sector: 'Airport',
    description: 'One receipt for airport taxi transfers (MMIA international & local terminals) and the hotel stay.',
    logo: { ...defaultLogo(), preset: 'airport', shape: 'circle', bg: '#0c4a6e', fg: '#fbbf24', icon: 'plane', text: '', ring: true, layout: 'icon' },
    build: () => ({
      template: 'airport-hotel-taxi', layout: 'classic', paper: 'A4', accent: '#0c4a6e', font: 'sans', currency: '₦',
      title: 'HOTEL & TAXI RECEIPT',
      business: { name: 'Your Airport Hotel & Shuttle Ltd', tagline: 'Airport taxi • Meet & greet • Hotel stays', address: 'Airport Road, near Murtala Muhammed International Airport, Ikeja, Lagos', phone: '+234 800 777 8888', email: 'bookings@yourairporthotel.example', website: 'www.yourairporthotel.example', regNo: 'RC 000000' },
      meta: [
        { label: 'Receipt No.', value: 'AHT-24051' },
        { label: 'Date', value: today() },
        { label: 'Booking ref.', value: 'BK-7731' },
        { label: 'Cashier', value: 'Front Desk' },
      ],
      party: { heading: 'Guest & trip', fields: [
        { label: 'Guest name', value: 'Guest Name' },
        { label: 'Phone', value: '080 0000 0000' },
        { label: 'Arrival flight', value: 'XX 123 — International Terminal' },
        { label: 'Departure flight', value: 'XX 456 — Local Terminal' },
        { label: 'Room', value: '112 — Executive Double' },
        { label: 'Driver / Vehicle', value: 'Driver Name • LND-123-XY' },
      ] },
      columns: { extra: 'Service', desc: 'Description', qty: 'Qty', price: 'Rate', amount: 'Amount' },
      showExtra: true,
      items: [
        { extra: 'Taxi', desc: 'Airport pick-up: MMIA International Terminal → Hotel', qty: 1, price: 25000 },
        { extra: 'Airport', desc: 'Meet & greet and porter service, International arrivals', qty: 1, price: 10000 },
        { extra: 'Hotel', desc: `Room — Executive Double (${daysFrom(-2)} to ${today()})`, qty: 2, price: 55000 },
        { extra: 'Hotel', desc: 'Breakfast for two', qty: 2, price: 12000 },
        { extra: 'Taxi', desc: 'Inter-terminal transfer: International Terminal → Local Terminal', qty: 1, price: 8000 },
        { extra: 'Taxi', desc: 'Airport drop-off: Hotel → MMIA Local (Domestic) Terminal', qty: 1, price: 15000 },
        { extra: 'Taxi', desc: 'Waiting time (per hour)', qty: 1, price: 3000 },
      ],
      discount: 5000, charges: [{ label: 'VAT', rate: 7.5 }], amountPaid: null, paymentMethod: 'POS / Bank transfer',
      notes: 'Taxi fares cover one vehicle, up to 4 passengers with luggage. Airport parking and toll fees included.',
      footer: 'Thank you for travelling with us. Safe flight!',
      signatures: ['Cashier', 'Guest'], stamp: 'PAID',
    }),
  },
];

export async function instantiate(t: Template): Promise<ReceiptData> {
  return { ...t.build(), logo: renderLogo(t.logo, 360).toDataURL('image/png') };
}
