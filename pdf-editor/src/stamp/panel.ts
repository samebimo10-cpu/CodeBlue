import { FADE_LEVELS, STAMP_INKS, defaultStamp, renderStamp, type StampSpec } from './stamp';
import { db } from '../lib/db';
import { icon } from '../lib/icons';
import { saveFile } from '../lib/save';
import { canvasToBlob, field, h, selectEl, toast, uid } from '../lib/util';

interface SavedStamp { id: string; spec: StampSpec }

/** Stamp maker: type your company's details, then put the stamp on receipts or PDFs. */
export class StampMaker {
  readonly el: HTMLElement;
  private s: StampSpec = defaultStamp();
  private preview = h('div', { class: 'stamp-preview checker' });
  private form = h('div', { class: 'stamp-form' });
  private savedBox = h('div', { class: 'chips' });

  constructor(
    private useOnReceipt: (url: string) => void,
    private placeInPdf: (url: string) => Promise<void>,
  ) {
    this.el = h('div', { class: 'card stamp-maker' },
      h('h2', {}, icon('logo'), 'Stamp maker'),
      h('p', { class: 'muted' }, 'Make your company stamp from your own business details. Use it on the quick receipt or place it on any PDF.'),
      h('div', { class: 'logo-grid' }, this.preview, h('div', {}, this.form, h('h4', {}, 'My stamps'), this.savedBox)));
    void this.init();
  }

  private async init() {
    const last = await db.get<StampSpec>('settings', 'stamp-current').catch(() => undefined);
    if (last) this.s = { ...this.s, ...last };
    this.renderForm();
    this.draw();
    void this.renderSaved();
  }

  private draw() {
    const c = renderStamp(this.s, 320);
    c.className = 'stamp-canvas';
    this.preview.replaceChildren(c);
    void db.put('settings', 'stamp-current', this.s).catch(() => {});
  }

  private renderForm() {
    const s = this.s;
    const upd = (fn: () => void) => { fn(); this.draw(); };
    const input = (label: string, key: 'top' | 'bottom' | 'center' | 'sub' | 'date', placeholder: string, max = 60) =>
      field(label, h('input', { value: s[key], placeholder, maxlength: max, oninput: (e: Event) => upd(() => (s[key] = (e.target as HTMLInputElement).value)) }));
    const inks = h('div', { class: 'swatches' }, ...STAMP_INKS.map(([c, name]) => h('button', {
      class: 'swatch' + (c === s.color ? ' on' : ''), title: name, 'aria-label': name + ' ink', style: { background: c },
      onclick: () => { upd(() => (s.color = c)); this.renderForm(); },
    })));
    const dateOn = h('input', { type: 'checkbox', checked: s.dateLine, onchange: () => upd(() => (s.dateLine = dateOn.checked)) });
    this.form.replaceChildren(
      h('div', { class: 'two' },
        field('Shape', selectEl([['round', 'Round seal'], ['rect', 'Rectangle']], s.shape, (v) => upd(() => (s.shape = v as any)))),
        field('Ink', inks)),
      h('div', { class: 'row wrap' },
        field('Ink fade', selectEl(FADE_LEVELS.map(([v, l]) => [String(v), l]), String(s.fade), (v) => upd(() => (s.fade = +v)))),
        h('button', { class: 'btn small', title: 'Same fade level, different pattern', onclick: () => upd(() => (s.seed = Math.floor(Math.random() * 1e6))) }, 'New fade pattern')),
      input('Company name', 'top', 'e.g. YOUR COMPANY LIMITED'),
      input(s.shape === 'round' ? 'Bottom of ring (RC number, city)' : 'Second line (address, RC number)', 'bottom', 'e.g. RC 000000 • LAGOS'),
      h('div', { class: 'two' },
        input('Middle word', 'center', 'e.g. PAID', 16),
        input('Small line', 'sub', 'e.g. Accounts', 30)),
      h('div', { class: 'row wrap' },
        h('label', { class: 'check' }, dateOn, 'Date line'),
        input('Date (leave empty to write by hand)', 'date', 'e.g. 25/10/2026', 20)),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn primary', onclick: () => this.useOnReceipt(this.url()) }, 'Use on quick receipt'),
        h('button', { class: 'btn', onclick: () => void this.placeInPdf(this.url()) }, 'Place in PDF'),
        h('button', { class: 'btn', onclick: async () => toast(await saveFile(await canvasToBlob(renderStamp(this.s, 1000)), 'stamp.png')) }, 'PNG'),
        h('button', { class: 'btn', onclick: () => void this.save() }, 'Save stamp')));
  }

  private url() {
    return renderStamp(this.s, 600).toDataURL('image/png');
  }

  private async save() {
    const all = (await db.get<SavedStamp[]>('settings', 'stamps').catch(() => undefined)) ?? [];
    all.unshift({ id: uid(), spec: { ...this.s } });
    await db.put('settings', 'stamps', all.slice(0, 20));
    toast('Stamp saved');
    void this.renderSaved();
  }

  private async renderSaved() {
    const all = (await db.get<SavedStamp[]>('settings', 'stamps').catch(() => undefined)) ?? [];
    this.savedBox.replaceChildren();
    if (!all.length) {
      this.savedBox.append(h('p', { class: 'muted small' }, 'Stamps you save appear here.'));
      return;
    }
    for (const st of all) {
      this.savedBox.append(h('div', { class: 'preset' },
        h('button', { class: 'plain', title: st.spec.top, onclick: () => { this.s = { ...defaultStamp(), ...st.spec, fade: st.spec.fade ?? 0 }; this.renderForm(); this.draw(); } }, renderStamp(st.spec, 88)),
        h('button', { class: 'icon-btn', 'aria-label': 'Delete stamp', onclick: async () => {
          await db.put('settings', 'stamps', all.filter((x) => x.id !== st.id));
          void this.renderSaved();
        } }, icon('trash', 14))));
    }
  }
}
