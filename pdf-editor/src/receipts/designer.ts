import { PDFDocument } from 'pdf-lib';
import { TEMPLATES, instantiate } from './templates';
import { CURRENCIES, PAPER_PT, computeTotals, money, type KV, type ReceiptData } from './model';
import { loadLogo, renderReceipt } from './render';
import { QuickReceipt } from './quick';
import { StampMaker } from '../stamp/panel';
import { ICONS, LOGO_PRESETS, SHAPES, defaultLogo, renderLogo, type LogoSpec } from '../logo/logo';
import { db } from '../lib/db';
import { icon } from '../lib/icons';
import { saveFile } from '../lib/save';
import { ensureFont } from '../fonts';
import { busy, canvasToBlob, confirmDialog, field, h, pickFile, readAsDataURL, selectEl, toast, uid } from '../lib/util';

export interface ReceiptTarget {
  addImagePage(url: string, widthPt: number, heightPt: number): Promise<void>;
  placeImage(url: string, kind: string, meta?: Record<string, any>, maxFrac?: number): Promise<unknown>;
}

interface Saved { id: string; name: string; data: ReceiptData; updated: number }

/** The Receipts & Logos tab. */
export class ReceiptDesigner {
  readonly el: HTMLElement;
  private d: ReceiptData | null = null;
  private savedId: string | null = null;
  private form!: HTMLDivElement;
  private preview!: HTMLDivElement;
  private gallery!: HTMLDivElement;
  private savedList!: HTMLDivElement;
  private logoSpec: LogoSpec = { ...defaultLogo(), ...LOGO_PRESETS[0].spec };
  private logoPreview!: HTMLDivElement;
  private logoForm!: HTMLDivElement;
  private renderTimer = 0;

  constructor(private target: ReceiptTarget, private goEditor: () => void) {
    this.el = h('section', { class: 'panel receipts' });
    void this.init();
  }

  private async init() {
    await Promise.all([ensureFont('Inter', 400), ensureFont('Inter', 800), ensureFont('Courier Prime', 400), ensureFont('Courier Prime', 700), ensureFont('Merriweather', 400), ensureFont('Merriweather', 700)]);
    this.gallery = h('div', { class: 'tpl-grid' });
    this.savedList = h('div', { class: 'saved-list' });
    this.form = h('div', { class: 'rform' });
    this.preview = h('div', { class: 'rpreview' });
    this.logoPreview = h('div', { class: 'logo-preview checker' });
    this.logoForm = h('div', { class: 'logo-form' });
    const quick = new QuickReceipt(this.target, this.goEditor);
    const stamps = new StampMaker(
      (url) => { quick.setStamp(url); toast('Stamp added to the quick receipt'); },
      async (url) => { this.goEditor(); await this.target.placeImage(url, 'stamp', {}, 0.22); },
    );
    this.el.append(
      quick.el,
      stamps.el,
      h('div', { class: 'card' },
        h('h2', {}, icon('receipt'), 'Receipt designer'),
        h('p', { class: 'muted' }, 'Pick a ready-made template, put in your business details and items — totals, VAT and change are calculated for you.'),
        this.gallery,
        h('h4', {}, 'My saved receipts'),
        this.savedList),
      h('div', { class: 'rworkspace' }, this.form, h('div', { class: 'rpreview-wrap' }, this.preview)),
      h('div', { class: 'card' },
        h('h2', {}, icon('logo'), 'Logo designer'),
        h('div', { class: 'logo-grid' }, this.logoPreview, this.logoForm)),
    );
    await this.renderGallery();
    await this.renderSaved();
    this.renderLogoDesigner();
    await this.useTemplate(TEMPLATES[0].id, false);
  }

  private async renderGallery() {
    this.gallery.replaceChildren();
    for (const t of TEMPLATES) {
      const data = await instantiate(t);
      const { canvas } = renderReceipt(data, await loadLogo(data.logo), 0.6);
      canvas.className = 'tpl-thumb';
      this.gallery.append(h('button', { class: 'tpl', onclick: () => void this.useTemplate(t.id, true) },
        h('div', { class: 'tpl-img' }, canvas),
        h('span', { class: 'tag' }, t.sector),
        h('strong', {}, t.name),
        h('small', {}, t.description)));
    }
  }

  private async renderSaved() {
    const all = (await db.all<Saved>('receipts')).sort((a, b) => b.updated - a.updated);
    this.savedList.replaceChildren();
    if (!all.length) {
      this.savedList.append(h('p', { class: 'muted small' }, 'Receipts you save appear here so you can reuse your business details.'));
      return;
    }
    for (const s of all) {
      this.savedList.append(h('div', { class: 'saved' },
        h('button', { class: 'chip', onclick: () => { this.d = structuredClone(s.data); this.savedId = s.id; this.renderForm(); this.scheduleRender(); } }, s.name),
        h('small', { class: 'muted' }, new Date(s.updated).toLocaleDateString()),
        h('button', { class: 'icon-btn', 'aria-label': 'Delete ' + s.name, onclick: async () => { await db.del('receipts', s.id); void this.renderSaved(); } }, icon('trash', 16))));
    }
  }

  private async useTemplate(id: string, ask: boolean) {
    if (ask && this.d && !(await confirmDialog('Start from this template? Unsaved changes to the current receipt will be lost.', 'Use template'))) return;
    const t = TEMPLATES.find((x) => x.id === id)!;
    this.d = await instantiate(t);
    this.savedId = null;
    this.renderForm();
    this.scheduleRender();
    if (ask) this.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private scheduleRender() {
    clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => void this.renderPreview(), 120);
  }

  private async renderPreview() {
    if (!this.d) return;
    const { canvas } = renderReceipt(this.d, await loadLogo(this.d.logo), Math.min(2.5, (window.devicePixelRatio || 1) * 1.4));
    canvas.className = 'receipt-canvas' + (this.d.layout === 'thermal' ? ' thermal' : '');
    this.preview.replaceChildren(canvas);
    const t = computeTotals(this.d);
    this.totalEl.textContent = 'Total ' + money(t.total, this.d.currency);
  }

  private totalEl = h('strong', { class: 'total-pill' });

  // ───────────────────────────── form ─────────────────────────────

  private renderForm() {
    const d = this.d!;
    const f = this.form;
    f.replaceChildren();
    const set = (fn: () => void) => { fn(); this.scheduleRender(); };
    const input = (value: string | number, on: (v: string) => void, attrs: Record<string, any> = {}) => {
      const el = h('input', { value: String(value), ...attrs, oninput: () => set(() => on(el.value)) });
      return el;
    };
    const area = (value: string, on: (v: string) => void) => {
      const el = h('textarea', { rows: 2, oninput: () => set(() => on(el.value)) });
      el.value = value;
      return el;
    };
    const section = (title: string, open: boolean, ...kids: (Node | null)[]) =>
      h('details', { class: 'fsec', open }, h('summary', {}, title), h('div', { class: 'fsec-body' }, ...kids.filter(Boolean) as Node[]));
    const kvList = (list: KV[], addLabel: string) => {
      const box = h('div', { class: 'kv' });
      const draw = () => {
        box.replaceChildren(...list.map((kv, i) => h('div', { class: 'kv-row' },
          input(kv.label, (v) => (kv.label = v), { placeholder: 'Label', class: 'kv-l' }),
          input(kv.value, (v) => (kv.value = v), { placeholder: 'Value', class: 'kv-v' }),
          h('button', { class: 'icon-btn', 'aria-label': 'Remove', onclick: () => set(() => { list.splice(i, 1); draw(); }) }, icon('close', 16)))),
        h('button', { class: 'btn small', onclick: () => set(() => { list.push({ label: 'Field', value: '' }); draw(); }) }, icon('plus', 14), addLabel));
      };
      draw();
      return box;
    };

    // actions bar
    f.append(h('div', { class: 'ractions' },
      this.totalEl,
      h('button', { class: 'btn primary', onclick: () => void this.exportPdf() }, icon('save', 16), 'PDF'),
      h('button', { class: 'btn', onclick: () => void this.exportPng() }, icon('image', 16), 'PNG'),
      h('button', { class: 'btn', onclick: () => void this.toEditor() }, icon('editor', 16), 'Open in editor'),
      h('button', { class: 'btn', onclick: () => void this.save() }, icon('library', 16), this.savedId ? 'Update saved' : 'Save'),
      h('button', { class: 'btn', onclick: () => this.print() }, 'Print')));

    // business
    const logoRow = h('div', { class: 'row wrap' },
      d.logo ? h('img', { src: d.logo, class: 'logo-thumb', alt: 'Logo' }) : h('span', { class: 'muted small' }, 'No logo'),
      h('button', { class: 'btn small', onclick: async () => { const [file] = await pickFile('image/*'); if (file) { d.logo = await readAsDataURL(file); this.renderForm(); this.scheduleRender(); } } }, 'Upload logo'),
      h('button', { class: 'btn small', onclick: () => document.querySelector('.logo-grid')?.scrollIntoView({ behavior: 'smooth' }) }, 'Design a logo'),
      d.logo ? h('button', { class: 'btn small', onclick: () => { d.logo = null; this.renderForm(); this.scheduleRender(); } }, 'Remove') : null);
    const b = d.business;
    f.append(section('Business details', true,
      logoRow,
      field('Business name', input(b.name, (v) => (b.name = v))),
      field('Slogan / department', input(b.tagline, (v) => (b.tagline = v))),
      field('Address', input(b.address, (v) => (b.address = v))),
      h('div', { class: 'two' }, field('Phone', input(b.phone, (v) => (b.phone = v))), field('Email', input(b.email, (v) => (b.email = v)))),
      h('div', { class: 'two' }, field('Website', input(b.website, (v) => (b.website = v))), field('Reg. / Tax number', input(b.regNo, (v) => (b.regNo = v))))));

    f.append(section('Receipt details', true,
      field('Title', input(d.title, (v) => (d.title = v))),
      kvList(d.meta, 'Add field')));

    f.append(section(d.party.heading || 'Customer', true,
      field('Heading (Patient, Guest, Customer…)', input(d.party.heading, (v) => (d.party.heading = v))),
      kvList(d.party.fields, 'Add field')));

    // items
    const items = h('div', { class: 'items' });
    const drawItems = () => {
      items.replaceChildren(
        h('div', { class: 'item-row head' + (d.showExtra ? ' extra' : '') },
          d.showExtra ? h('span', {}, d.columns.extra) : null, h('span', {}, d.columns.desc), h('span', {}, d.columns.qty), h('span', {}, d.columns.price), h('span', {})),
        ...d.items.map((it, i) => h('div', { class: 'item-row' + (d.showExtra ? ' extra' : '') },
          d.showExtra ? input(it.extra, (v) => (it.extra = v), { 'aria-label': d.columns.extra }) : null,
          input(it.desc, (v) => (it.desc = v), { 'aria-label': 'Description' }),
          input(it.qty, (v) => (it.qty = parseFloat(v) || 0), { type: 'number', inputmode: 'decimal', step: 'any', 'aria-label': 'Quantity' }),
          input(it.price, (v) => (it.price = parseFloat(v) || 0), { type: 'number', inputmode: 'decimal', step: 'any', 'aria-label': 'Price' }),
          h('button', { class: 'icon-btn', 'aria-label': 'Remove item', onclick: () => set(() => { d.items.splice(i, 1); drawItems(); }) }, icon('close', 16)))),
        h('button', { class: 'btn small', onclick: () => set(() => { d.items.push({ extra: '', desc: 'New item', qty: 1, price: 0 }); drawItems(); }) }, icon('plus', 14), 'Add item'));
    };
    drawItems();
    const extraToggle = h('input', { type: 'checkbox', checked: d.showExtra, onchange: () => set(() => { d.showExtra = extraToggle.checked; drawItems(); }) });
    f.append(section('Items', true,
      items,
      h('div', { class: 'row wrap' },
        h('label', { class: 'check' }, extraToggle, 'Extra column'),
        field('Extra column name', input(d.columns.extra, (v) => { d.columns.extra = v; }, { onchange: () => drawItems() })),
        field('Description header', input(d.columns.desc, (v) => (d.columns.desc = v))),
        field('Price header', input(d.columns.price, (v) => (d.columns.price = v))))));

    // totals
    const charges = h('div', { class: 'kv' });
    const drawCharges = () => {
      charges.replaceChildren(...d.charges.map((c, i) => h('div', { class: 'kv-row' },
        input(c.label, (v) => (c.label = v), { placeholder: 'e.g. VAT', class: 'kv-l' }),
        input(c.rate, (v) => (c.rate = parseFloat(v) || 0), { type: 'number', step: 'any', inputmode: 'decimal', class: 'kv-v', 'aria-label': 'Percent' }),
        h('span', { class: 'muted' }, '%'),
        h('button', { class: 'icon-btn', 'aria-label': 'Remove', onclick: () => set(() => { d.charges.splice(i, 1); drawCharges(); }) }, icon('close', 16)))),
      h('button', { class: 'btn small', onclick: () => set(() => { d.charges.push({ label: 'VAT', rate: 7.5 }); drawCharges(); }) }, icon('plus', 14), 'Add tax / charge'));
    };
    drawCharges();
    const paidAuto = h('input', { type: 'checkbox', checked: d.amountPaid === null, onchange: () => set(() => { d.amountPaid = paidAuto.checked ? null : computeTotals(d).total; paidIn.disabled = paidAuto.checked; paidIn.value = String(d.amountPaid ?? ''); }) });
    const paidIn = input(d.amountPaid ?? '', (v) => (d.amountPaid = v === '' ? null : parseFloat(v)), { type: 'number', step: 'any', inputmode: 'decimal', disabled: d.amountPaid === null });
    f.append(section('Totals & payment', true,
      h('div', { class: 'two' },
        field('Discount (amount)', input(d.discount, (v) => (d.discount = parseFloat(v) || 0), { type: 'number', step: 'any', inputmode: 'decimal' })),
        field('Payment method', input(d.paymentMethod, (v) => (d.paymentMethod = v)))),
      charges,
      h('div', { class: 'row wrap' }, h('label', { class: 'check' }, paidAuto, 'Paid in full'), field('Amount paid', paidIn)),
      field('Stamp', selectEl([['', 'None'], ['PAID', 'PAID'], ['PART PAID', 'PART PAID'], ['UNPAID', 'UNPAID'], ['COPY', 'COPY']], d.stamp, (v) => set(() => (d.stamp = v as any))))));

    f.append(section('Notes, footer & signatures', false,
      field('Notes', area(d.notes, (v) => (d.notes = v))),
      field('Footer', area(d.footer, (v) => (d.footer = v))),
      field('Signature lines (comma separated)', input(d.signatures.join(', '), (v) => (d.signatures = v.split(',').map((s) => s.trim()).filter(Boolean)))),
    ));

    f.append(section('Look & paper', false,
      h('div', { class: 'two' },
        field('Paper', selectEl(Object.entries(PAPER_PT).map(([k, v]) => [k, v.label]), d.paper, (v) => set(() => {
          d.paper = v as any;
          if (v.startsWith('thermal')) d.layout = 'thermal';
          else if (d.layout === 'thermal') d.layout = 'classic';
          this.renderForm();
        }))),
        field('Layout', selectEl([['classic', 'Classic'], ['compact', 'Compact'], ['folio', 'Elegant (hotel)'], ['thermal', 'Till roll']], d.layout, (v) => set(() => {
          d.layout = v as any;
          if (v === 'thermal' && !d.paper.startsWith('thermal')) d.paper = 'thermal80';
          if (v !== 'thermal' && d.paper.startsWith('thermal')) d.paper = 'A4';
          this.renderForm();
        })))),
      h('div', { class: 'two' },
        field('Font', selectEl([['sans', 'Modern sans'], ['serif', 'Classic serif'], ['mono', 'Till printer']], d.font, (v) => set(() => (d.font = v as any)))),
        field('Currency', selectEl(CURRENCIES.map((c) => [c, c.trim()]), d.currency, (v) => set(() => (d.currency = v))))),
      field('Brand colour', h('input', { type: 'color', value: d.accent, oninput: (e: Event) => set(() => (d.accent = (e.target as HTMLInputElement).value)) }))));
  }

  // ───────────────────────────── output ─────────────────────────────

  private fileBase() {
    const d = this.d!;
    const num = d.meta[0]?.value?.replace(/[^\w-]+/g, '') || 'receipt';
    return `${d.title.toLowerCase().replace(/[^\w]+/g, '-')}-${num}`.replace(/-+/g, '-');
  }

  private async exportPdf() {
    const d = this.d!;
    const bytes = await busy('Building PDF…', async () => {
      const { canvas, widthPt, heightPt } = renderReceipt(d, await loadLogo(d.logo), 4);
      const pdf = await PDFDocument.create();
      pdf.setTitle(d.title + ' — ' + d.business.name);
      pdf.setCreator('InkDesk PDF');
      const img = await pdf.embedPng(new Uint8Array(await (await canvasToBlob(canvas)).arrayBuffer()));
      pdf.addPage([widthPt, heightPt]).drawImage(img, { x: 0, y: 0, width: widthPt, height: heightPt });
      return pdf.save();
    });
    toast(await saveFile(new Blob([bytes as BlobPart], { type: 'application/pdf' }), this.fileBase() + '.pdf'));
  }

  private async exportPng() {
    const d = this.d!;
    const { canvas } = renderReceipt(d, await loadLogo(d.logo), 4);
    toast(await saveFile(await canvasToBlob(canvas), this.fileBase() + '.png'));
  }

  private print() {
    document.body.classList.add('printing-receipt');
    const done = () => { document.body.classList.remove('printing-receipt'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 60_000);
  }

  private async toEditor() {
    const d = this.d!;
    const { canvas, widthPt, heightPt } = renderReceipt(d, await loadLogo(d.logo), 4);
    await this.target.addImagePage(canvas.toDataURL('image/png'), widthPt, heightPt);
    this.goEditor();
    toast('Receipt added as a new page — you can now write, sign or stamp on it');
  }

  private async save() {
    const d = this.d!;
    const id = this.savedId ?? uid();
    this.savedId = id;
    const name = `${d.business.name} — ${d.title} ${d.meta[0]?.value ?? ''}`.trim();
    await db.put('receipts', id, { id, name, data: structuredClone(d), updated: Date.now() } satisfies Saved);
    toast('Saved on this device');
    void this.renderSaved();
    this.renderForm();
  }

  // ───────────────────────────── logo designer ─────────────────────────────

  private renderLogoDesigner() {
    const s = this.logoSpec;
    const redraw = () => {
      const c = renderLogo(s, 320);
      c.className = 'logo-canvas';
      this.logoPreview.replaceChildren(c);
    };
    const upd = (fn: () => void) => { fn(); redraw(); };
    const presets = h('div', { class: 'chips' }, ...LOGO_PRESETS.map((p) => {
      const mini = renderLogo({ ...defaultLogo(), ...p.spec, layout: 'icon' }, 64);
      return h('button', { class: 'preset', title: p.name, onclick: () => { this.logoSpec = { ...defaultLogo(), ...p.spec, layout: s.layout }; this.renderLogoDesigner(); } }, mini, h('span', {}, p.name));
    }));
    const iconGrid = h('div', { class: 'icon-pick' }, ...ICONS.map(([id, name]) => {
      const mini = renderLogo({ ...s, icon: id, shape: 'none', fg: '#1d2433', text: '', layout: 'icon' }, 40);
      return h('button', { class: id === s.icon ? 'on' : '', title: name, 'aria-label': name, onclick: () => { s.icon = id; this.renderLogoDesigner(); } }, mini);
    }));
    const colour = (label: string, key: 'bg' | 'fg' | 'brandColor') =>
      field(label, h('input', { type: 'color', value: s[key], oninput: (e: Event) => upd(() => (s[key] = (e.target as HTMLInputElement).value)) }));
    const textIn = (label: string, key: 'text' | 'brand' | 'slogan', max = 40) =>
      field(label, h('input', { value: s[key], maxlength: max, oninput: (e: Event) => upd(() => (s[key] = (e.target as HTMLInputElement).value)) }));
    const ring = h('input', { type: 'checkbox', checked: s.ring, onchange: () => upd(() => (s.ring = ring.checked)) });
    this.logoForm.replaceChildren(
      h('h4', {}, 'Start from'), presets,
      h('h4', {}, 'Symbol'), iconGrid,
      h('div', { class: 'row wrap' },
        field('Badge', selectEl(SHAPES, s.shape, (v) => upd(() => (s.shape = v as any)))),
        colour('Badge colour', 'bg'), colour('Symbol colour', 'fg'),
        h('label', { class: 'check' }, ring, 'Ring'),
        textIn('Initials', 'text', 3)),
      h('div', { class: 'row wrap' },
        field('Layout', selectEl([['icon', 'Badge only'], ['wide', 'Badge + name']], s.layout, (v) => upd(() => (s.layout = v as any)))),
        textIn('Business name', 'brand'), textIn('Slogan', 'slogan'), colour('Name colour', 'brandColor'),
        field('Font', selectEl([['sans', 'Modern'], ['serif', 'Classic']], s.font, (v) => upd(() => (s.font = v as any))))),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn primary', onclick: () => {
          if (!this.d) return;
          this.d.logo = renderLogo(s, 360).toDataURL('image/png');
          this.renderForm(); this.scheduleRender();
          toast('Logo added to the receipt');
          this.form.scrollIntoView({ behavior: 'smooth' });
        } }, 'Use on receipt'),
        h('button', { class: 'btn', onclick: async () => { await this.target.placeImage(renderLogo(s, 600).toDataURL('image/png'), 'image', { source: 'logo' }, 0.25); this.goEditor(); } }, 'Place in PDF'),
        h('button', { class: 'btn', onclick: async () => toast(await saveFile(await canvasToBlob(renderLogo(s, 1024)), 'logo.png')) }, 'Download PNG'),
        h('button', { class: 'btn', onclick: async () => { const id = uid(); await db.put('logos', id, { id, spec: { ...s }, created: Date.now() }); toast('Logo saved'); this.renderLogoDesigner(); } }, 'Save logo')),
      h('div', { class: 'saved-logos' }),
    );
    void db.all<{ id: string; spec: LogoSpec }>('logos').then((all) => {
      const box = this.logoForm.querySelector('.saved-logos')!;
      if (!all.length) return;
      box.append(h('h4', {}, 'My logos'), h('div', { class: 'chips' }, ...all.map((l) => h('div', { class: 'preset' },
        h('button', { class: 'plain', onclick: () => { this.logoSpec = { ...l.spec }; this.renderLogoDesigner(); } }, renderLogo({ ...l.spec, layout: 'icon' }, 64)),
        h('button', { class: 'icon-btn', 'aria-label': 'Delete logo', onclick: async () => { await db.del('logos', l.id); this.renderLogoDesigner(); } }, icon('trash', 14))))));
    });
    redraw();
  }
}
