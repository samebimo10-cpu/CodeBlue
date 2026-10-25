import { PDFDocument, degrees, rgb } from 'pdf-lib';
import { QUICK_PAPER, defaultQuick, quickTotal, renderQuick, sheetLayout, type QuickData, type StampBox } from './simple';
import { CURRENCIES, money } from './model';
import { loadLogo } from './render';
import { LOGO_PRESETS, defaultLogo, renderLogo } from '../logo/logo';
import { db } from '../lib/db';
import { icon } from '../lib/icons';
import { saveFile } from '../lib/save';
import { busy, canvasToBlob, field, h, pickFile, readAsDataURL, selectEl, toast } from '../lib/util';
import type { ReceiptTarget } from './designer';

type Sheet = 'single' | 'sheet';

/** Quick receipt: a plain form to print blank and fill by hand, or type into and save as PDF. */
export class QuickReceipt {
  readonly el: HTMLElement;
  private d: QuickData = defaultQuick();
  private sheet: Sheet = 'single';
  private pages = 1;
  private numberFrom = '';
  private form = h('div', { class: 'rform' });
  private preview = h('div', { class: 'rpreview qpreview' });
  private info = h('p', { class: 'muted small' });
  private timer = 0;

  constructor(private target: ReceiptTarget, private goEditor: () => void) {
    this.el = h('div', { class: 'quick' },
      h('div', { class: 'card' },
        h('h2', {}, icon('receipt'), 'Quick receipt — airport hotel & taxi'),
        h('p', { class: 'muted' }, 'A simple receipt form. Print it blank and fill it in by pen, or type the details and save a finished PDF. Pick any size from a till roll to A4.')),
      h('div', { class: 'rworkspace' }, this.form, h('div', { class: 'rpreview-wrap' }, this.preview, this.stampTools, this.info)));
    void this.init();
  }

  private async init() {
    const saved = await db.get<Partial<QuickData>>('settings', 'quick-receipt').catch(() => undefined);
    if (saved) this.d = { ...this.d, ...saved, business: { ...this.d.business, ...saved.business } };
    if (!this.d.logo) {
      const airport = LOGO_PRESETS.find((p) => p.spec.preset === 'airport');
      this.d.logo = renderLogo({ ...defaultLogo(), ...airport?.spec, layout: 'icon' }, 300).toDataURL('image/png');
    }
    this.renderForm();
    this.refresh();
  }

  /** Put a stamp (from the stamp maker) on the receipt. */
  setStamp(url: string | null) {
    this.d.stamp = url;
    this.d.stampPos = null;
    this.renderForm();
    this.refresh();
    this.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private refresh() {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(async () => {
      const { canvas, widthPt, heightPt, stampBox } = renderQuick(this.d, await loadLogo(this.d.logo), Math.min(2.5, (window.devicePixelRatio || 1) * 1.4), this.numbers(1)[0], await loadLogo(this.d.stamp), true);
      canvas.className = 'receipt-canvas';
      const sheet = h('div', { class: 'qsheet' + (this.d.paper.startsWith('thermal') ? ' thermal' : '') }, canvas);
      if (this.d.stamp && stampBox) sheet.append(this.stampOverlay(widthPt, heightPt, stampBox));
      this.preview.replaceChildren(sheet);
      this.stampControls(widthPt, heightPt, stampBox);
      const sl = sheetLayout(widthPt, heightPt);
      const mm = (pt: number) => Math.round((pt / 72) * 25.4);
      this.info.textContent = `${mm(widthPt)} × ${mm(heightPt)} mm` +
        (sl.perSheet > 1 ? ` · ${sl.perSheet} fit on one A4 sheet` : '');
      void db.put('settings', 'quick-receipt', this.d).catch(() => {});
    }, 100);
  }

  private stampTools = h('div', { class: 'stamp-tools' });

  /** The stamp drawn on top of the preview, so it can be dragged anywhere on the receipt. */
  private stampOverlay(W: number, H: number, box: StampBox) {
    const img = h('img', { src: this.d.stamp!, class: 'qstamp', alt: 'Stamp — drag to move', draggable: false, title: 'Drag to move the stamp' });
    const place = (b: StampBox) => Object.assign(img.style, {
      left: (b.cx / W) * 100 + '%', top: (b.cy / H) * 100 + '%', width: (b.w / W) * 100 + '%',
      transform: `translate(-50%, -50%) rotate(${b.angle}deg)`,
    });
    place(box);
    let start: { px: number; py: number; cx: number; cy: number } | null = null;
    img.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      img.setPointerCapture(e.pointerId);
      const pos = this.d.stampPos ?? { x: box.cx / W, y: box.cy / H, size: box.h, angle: box.angle };
      this.d.stampPos = pos;
      start = { px: e.clientX, py: e.clientY, cx: pos.x, cy: pos.y };
      img.classList.add('dragging');
    });
    img.addEventListener('pointermove', (e) => {
      if (!start || !this.d.stampPos) return;
      const r = img.parentElement!.getBoundingClientRect();
      const pos = this.d.stampPos;
      pos.x = Math.max(0, Math.min(1, start.cx + (e.clientX - start.px) / r.width));
      pos.y = Math.max(0, Math.min(1, start.cy + (e.clientY - start.py) / r.height));
      place({ ...box, cx: pos.x * W, cy: pos.y * H });
    });
    const end = () => {
      if (!start) return;
      start = null;
      img.classList.remove('dragging');
      void db.put('settings', 'quick-receipt', this.d).catch(() => {});
    };
    img.addEventListener('pointerup', end);
    img.addEventListener('pointercancel', end);
    return img;
  }

  /** Size and tilt controls under the preview while a stamp is on the receipt. */
  private stampControls(W: number, H: number, box: StampBox | null) {
    const t = this.stampTools;
    if (!this.d.stamp || !box) { t.replaceChildren(); delete t.dataset.key; return; }
    // rebuild only when the paper or stamp changes, so a slider isn't replaced mid-drag
    const key = `${W}|${this.d.stamp.length}|${this.d.stampPos ? 1 : 0}`;
    if (t.dataset.key === key) return;
    t.dataset.key = key;
    const fix = () => (this.d.stampPos ??= { x: box.cx / W, y: box.cy / H, size: box.h, angle: box.angle });
    const slider = (label: string, min: number, max: number, value: number, on: (v: number) => void) =>
      field(label, h('input', { type: 'range', min: String(min), max: String(max), step: '1', value: String(Math.round(value)), oninput: (e: Event) => { on(+(e.target as HTMLInputElement).value); this.refresh(); } }));
    t.replaceChildren(
      h('span', { class: 'muted small' }, 'Drag the stamp to move it.'),
      slider('Stamp size', 30, Math.round(Math.min(240, W * 0.6)), box.h, (v) => (fix().size = v)),
      slider('Tilt', -45, 45, box.angle, (v) => (fix().angle = v)),
      h('button', { class: 'btn small', onclick: () => { this.d.stampPos = null; this.refresh(); } }, 'Reset stamp'));
  }

  private renderForm() {
    const d = this.d;
    const set = (fn: () => void, redraw = false) => { fn(); if (redraw) this.renderForm(); this.refresh(); };
    const input = (value: string, on: (v: string) => void, attrs: Record<string, any> = {}) => {
      const el = h('input', { value, ...attrs, oninput: () => set(() => on(el.value)) });
      return el;
    };
    const check = (label: string, on: boolean, change: (v: boolean) => void) => {
      const el = h('input', { type: 'checkbox', checked: on, onchange: () => set(() => change(el.checked)) });
      return h('label', { class: 'check' }, el, label);
    };

    const mode = h('div', { class: 'seg big' },
      h('button', { class: d.blank ? 'on' : '', onclick: () => set(() => (d.blank = true), true) }, 'Blank — fill by hand'),
      h('button', { class: d.blank ? '' : 'on', onclick: () => set(() => (d.blank = false), true) }, 'Type it in'));

    const paper = selectEl(Object.entries(QUICK_PAPER).map(([k, v]) => [k, v.label]), d.paper, (v) => set(() => (d.paper = v as any)));
    const sheet = selectEl([['single', 'One receipt per page'], ['sheet', 'Fill A4 sheets (cut out)']], this.sheet, (v) => set(() => (this.sheet = v as Sheet)));
    const pagesIn = h('input', { type: 'number', min: '1', max: '50', value: String(this.pages), class: 'num', oninput: () => (this.pages = Math.max(1, Math.min(50, parseInt(pagesIn.value) || 1))) });
    const numIn = input(this.numberFrom, (v) => (this.numberFrom = v.trim()), { placeholder: 'e.g. 0001', inputmode: 'numeric' });

    this.form.replaceChildren(
      h('div', { class: 'fsec qtop' },
        h('div', { class: 'fsec-body' },
          mode,
          h('div', { class: 'two' }, field('Receipt size', paper), field('Print layout', sheet)),
          d.blank
            ? h('div', { class: 'two' }, field('Pages to make', pagesIn), field('Number receipts from (optional)', numIn))
            : null,
          h('div', { class: 'row wrap' },
            h('button', { class: 'btn primary', onclick: () => void this.exportPdf() }, icon('save', 16), d.blank ? 'Make printable PDF' : 'Save PDF'),
            h('button', { class: 'btn', onclick: () => this.print() }, 'Print'),
            h('button', { class: 'btn', onclick: () => void this.exportPng() }, icon('image', 16), 'PNG'),
            h('button', { class: 'btn', onclick: () => void this.toEditor() }, icon('editor', 16), 'Open in editor')),
          h('p', { class: 'muted small' }, d.blank
            ? 'Tip: choose A6 + “Fill A4 sheets” to print 4 receipts on every A4 page, or A5 for 2. Numbering prints a different red number on each receipt, like a receipt book.'
            : 'Typed entries print in dark blue on the lines, so the receipt looks filled in.'))),
    );

    if (!d.blank) {
      const items = h('div', { class: 'items' });
      const drawItems = () => {
        items.replaceChildren(
          ...d.items.map((it, i) => h('div', { class: 'qitem' },
            input(it.desc, (v) => (it.desc = v), { placeholder: 'Description', 'aria-label': 'Description' }),
            input(it.amount === null ? '' : String(it.amount), (v) => (it.amount = v === '' ? null : parseFloat(v) || 0), { type: 'number', step: 'any', inputmode: 'decimal', placeholder: 'Amount', 'aria-label': 'Amount' }),
            h('button', { class: 'icon-btn', 'aria-label': 'Remove line', onclick: () => set(() => { d.items.splice(i, 1); drawItems(); }) }, icon('close', 16)))),
          h('div', { class: 'row wrap' },
            h('button', { class: 'btn small', onclick: () => set(() => { d.items.push({ desc: '', amount: null }); drawItems(); }) }, icon('plus', 14), 'Add line'),
            ...[
              ['+ Taxi (International)', 'Taxi: International Terminal → Hotel'],
              ['+ Taxi (Local)', 'Taxi: Hotel → Local Terminal'],
              ['+ Hotel night', 'Hotel room (1 night)'],
            ].map(([lbl, desc]) => h('button', { class: 'btn small', onclick: () => set(() => { d.items.push({ desc, amount: null }); drawItems(); }) }, lbl))),
          h('strong', { class: 'qtotal' }, 'Total ' + money(quickTotal(d), d.currency)));
      };
      drawItems();
      this.form.append(h('details', { class: 'fsec', open: true }, h('summary', {}, 'Receipt details'),
        h('div', { class: 'fsec-body' },
          h('div', { class: 'two' },
            field('Receipt no.', input(d.receiptNo, (v) => (d.receiptNo = v))),
            field('Date', input(d.date, (v) => (d.date = v)))),
          h('div', { class: 'two' },
            field('Received from', input(d.customer, (v) => (d.customer = v))),
            field('Phone', input(d.phone, (v) => (d.phone = v)))),
          h('div', { class: 'row wrap' },
            check('Airport taxi', d.taxi, (v) => (d.taxi = v)),
            check('Hotel', d.hotel, (v) => (d.hotel = v)),
            check('International terminal', d.international, (v) => (d.international = v)),
            check('Local terminal', d.local, (v) => (d.local = v))),
          h('div', { class: 'two' },
            field('Pick-up', input(d.pickup, (v) => (d.pickup = v))),
            field('Drop-off', input(d.dropoff, (v) => (d.dropoff = v)))),
          h('div', { class: 'two' },
            field('Flight no.', input(d.flight, (v) => (d.flight = v))),
            field('Room no.', input(d.room, (v) => (d.room = v)))),
          h('div', { class: 'two' },
            field('Check-in', input(d.checkIn, (v) => (d.checkIn = v))),
            field('Check-out', input(d.checkOut, (v) => (d.checkOut = v)))),
          h('h4', {}, 'What was paid for'),
          items,
          field('Paid by', selectEl([['', '—'], ['cash', 'Cash'], ['pos', 'POS / Card'], ['transfer', 'Bank transfer']], d.payment, (v) => set(() => (d.payment = v as any)))))));
      // keep the total line current while typing
      items.addEventListener('input', () => {
        const t = items.querySelector('.qtotal');
        if (t) t.textContent = 'Total ' + money(quickTotal(d), d.currency);
      });
    }

    const b = d.business;
    this.form.append(h('details', { class: 'fsec', open: false }, h('summary', {}, 'Your business details & logo'),
      h('div', { class: 'fsec-body' },
        field('Business name', input(b.name, (v) => (b.name = v))),
        field('Services line', input(b.tagline, (v) => (b.tagline = v))),
        field('Address', input(b.address, (v) => (b.address = v))),
        field('Phone', input(b.phone, (v) => (b.phone = v))),
        h('div', { class: 'row wrap' },
          d.logo ? h('img', { src: d.logo, class: 'logo-thumb', alt: 'Logo' }) : h('span', { class: 'muted small' }, 'No logo'),
          h('button', { class: 'btn small', onclick: async () => {
            const [f] = await pickFile('image/*');
            if (!f) return;
            d.logo = await readAsDataURL(f);
            this.renderForm();
            this.refresh();
          } }, 'Upload logo'),
          h('button', { class: 'btn small', onclick: () => set(() => (d.logo = renderLogo({ ...defaultLogo(), ...LOGO_PRESETS.find((p) => p.spec.preset === 'airport')?.spec, layout: 'icon' }, 300).toDataURL('image/png')), true) }, 'Plane logo'),
          h('button', { class: 'btn small', onclick: () => set(() => (d.logo = renderLogo({ ...defaultLogo(), ...LOGO_PRESETS.find((p) => p.spec.preset === 'taxi')?.spec, layout: 'icon' }, 300).toDataURL('image/png')), true) }, 'Taxi logo'),
          d.logo ? h('button', { class: 'btn small', onclick: () => set(() => (d.logo = null), true) }, 'No logo') : null),
        h('div', { class: 'row wrap' },
          d.stamp ? h('img', { src: d.stamp, class: 'logo-thumb', alt: 'Stamp' }) : h('span', { class: 'muted small' }, 'No stamp'),
          h('button', { class: 'btn small', onclick: () => document.querySelector('.stamp-maker')?.scrollIntoView({ behavior: 'smooth' }) }, d.stamp ? 'Change stamp' : 'Make a stamp'),
          d.stamp ? h('button', { class: 'btn small', onclick: () => set(() => (d.stamp = null), true) }, 'Remove stamp') : null),
        h('div', { class: 'two' },
          field('Title', input(d.title, (v) => (d.title = v))),
          field('Currency', selectEl(CURRENCIES.map((c) => [c, c.trim()]), d.currency, (v) => set(() => (d.currency = v), true)))),
        h('div', { class: 'two' },
          field('Colour', h('input', { type: 'color', value: d.accent, oninput: (e: Event) => set(() => (d.accent = (e.target as HTMLInputElement).value)) })),
          field('Bottom line', input(d.footer, (v) => (d.footer = v)))))));
  }

  // ───────────────────────────── output ─────────────────────────────

  private fileName(ext: string) {
    const base = this.d.blank ? `blank-receipts-${this.d.paper}` : `receipt-${(this.d.receiptNo || 'quick').replace(/[^\w-]+/g, '')}`;
    return `${base}.${ext}`;
  }

  /** Receipt numbers for each copy, e.g. "0001", "0002"… (keeps leading zeros). */
  private numbers(count: number): (string | undefined)[] {
    const start = this.numberFrom;
    if (!this.d.blank || !start || !/\d+$/.test(start)) return Array(count).fill(undefined);
    const m = start.match(/^(.*?)(\d+)$/)!;
    const n0 = parseInt(m[2], 10);
    return Array.from({ length: count }, (_, i) => m[1] + String(n0 + i).padStart(m[2].length, '0'));
  }

  private async exportPdf() {
    const d = this.d;
    const bytes = await busy('Building PDF…', async () => {
      const logo = await loadLogo(d.logo);
      const pdf = await PDFDocument.create();
      pdf.setTitle(d.blank ? 'Blank receipts' : `${d.title} ${d.receiptNo}`);
      pdf.setCreator('InkDesk PDF');
      const stamp = await loadLogo(d.stamp);
      const first = renderQuick(d, logo, 3, undefined, stamp);
      const { widthPt: w, heightPt: hh } = first;
      const sheet = this.sheet === 'sheet' ? sheetLayout(w, hh) : null;
      const perPage = sheet && sheet.perSheet > 0 ? sheet.perSheet : 1;
      const pages = d.blank ? this.pages : 1;
      const nums = this.numbers(pages * perPage);
      const numbered = nums.some(Boolean);
      const embed = async (c: HTMLCanvasElement) => pdf.embedPng(new Uint8Array(await (await canvasToBlob(c)).arrayBuffer()));
      // identical copies share one image; numbered copies each get their own
      const shared = numbered ? null : await embed(first.canvas);
      const imageFor = async (num?: string) => shared ?? embed(renderQuick(d, logo, 3, num, stamp).canvas);
      let k = 0;
      for (let p = 0; p < pages; p++) {
        if (!sheet || sheet.perSheet <= 1) {
          const page = pdf.addPage([w, hh]);
          page.drawImage(await imageFor(nums[k++]), { x: 0, y: 0, width: w, height: hh });
          continue;
        }
        const page = pdf.addPage([sheet.sw, sheet.sh]);
        const ox = (sheet.sw - sheet.cols * w) / 2, oy = (sheet.sh - sheet.rows * hh) / 2;
        for (let r = 0; r < sheet.rows; r++) for (let c = 0; c < sheet.cols; c++) {
          const x = ox + c * w, y = sheet.sh - oy - (r + 1) * hh;
          page.drawImage(await imageFor(nums[k++]), { x, y, width: w, height: hh, rotate: degrees(0) });
        }
        // dashed cutting guides
        const dash = { thickness: 0.5, color: rgb(0.6, 0.6, 0.6), dashArray: [4, 3] };
        for (let c = 1; c < sheet.cols; c++) page.drawLine({ start: { x: ox + c * w, y: 0 }, end: { x: ox + c * w, y: sheet.sh }, ...dash });
        for (let r = 1; r < sheet.rows; r++) page.drawLine({ start: { x: 0, y: sheet.sh - oy - r * hh }, end: { x: sheet.sw, y: sheet.sh - oy - r * hh }, ...dash });
      }
      return pdf.save();
    });
    toast(await saveFile(new Blob([bytes as BlobPart], { type: 'application/pdf' }), this.fileName('pdf')));
  }

  private async exportPng() {
    const { canvas } = renderQuick(this.d, await loadLogo(this.d.logo), 4, this.numbers(1)[0], await loadLogo(this.d.stamp));
    toast(await saveFile(await canvasToBlob(canvas), this.fileName('png')));
  }

  private print() {
    document.body.classList.add('printing-quick');
    const done = () => { document.body.classList.remove('printing-quick'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 60_000);
  }

  private async toEditor() {
    const { canvas, widthPt, heightPt } = renderQuick(this.d, await loadLogo(this.d.logo), 4, this.numbers(1)[0], await loadLogo(this.d.stamp));
    await this.target.addImagePage(canvas.toDataURL('image/png'), widthPt, heightPt);
    this.goEditor();
    toast(this.d.blank ? 'Blank receipt added — use Add text or Pen to fill it in' : 'Receipt added as a new page');
  }
}
