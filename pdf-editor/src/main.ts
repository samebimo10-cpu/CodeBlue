import './fonts';
import './styles.css';
import { Capacitor } from '@capacitor/core';
import { Editor } from './editor/editor';
import { HandwritingPanel } from './handwriting/panel';
import { ReceiptDesigner } from './receipts/designer';
import { icon } from './lib/icons';
import { h, toast } from './lib/util';

// CanvasRenderingContext2D.roundRect for older iOS / Android WebViews
if (!(CanvasRenderingContext2D.prototype as any).roundRect) {
  (CanvasRenderingContext2D.prototype as any).roundRect = function (x: number, y: number, w: number, hh: number, r: number | number[] = 0) {
    const rr = Array.isArray(r) ? r[0] ?? 0 : r;
    const k = Math.min(rr, w / 2, hh / 2);
    this.moveTo(x + k, y);
    this.arcTo(x + w, y, x + w, y + hh, k);
    this.arcTo(x + w, y + hh, x, y + hh, k);
    this.arcTo(x, y + hh, x, y, k);
    this.arcTo(x, y, x + w, y, k);
    this.closePath();
  };
}

type TabId = 'editor' | 'handwriting' | 'receipts';

const editor = new Editor();
const tabs: Record<TabId, { label: string; icon: string; el: HTMLElement }> = {
  editor: { label: 'PDF Editor', icon: 'editor', el: editor.el },
  handwriting: { label: 'Handwriting', icon: 'feather', el: h('div') },
  receipts: { label: 'Receipts & Logos', icon: 'receipt', el: h('div') },
};

let current: TabId = 'editor';
const nav = h('nav', { class: 'tabs', 'aria-label': 'Sections' });
const main = h('main', { class: 'content' });

function show(id: TabId) {
  current = id;
  // build the heavier panels on first use
  if (id === 'handwriting' && !tabs.handwriting.el.childElementCount) {
    tabs.handwriting.el.replaceWith((tabs.handwriting.el = new HandwritingPanel(editor, () => show('editor')).el));
  }
  if (id === 'receipts' && !tabs.receipts.el.childElementCount) {
    tabs.receipts.el.replaceWith((tabs.receipts.el = new ReceiptDesigner(editor, () => show('editor')).el));
  }
  for (const [k, t] of Object.entries(tabs) as [TabId, (typeof tabs)[TabId]][]) {
    t.el.hidden = k !== id;
    if (!t.el.isConnected) main.append(t.el);
  }
  nav.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
  if (id === 'editor') requestAnimationFrame(() => editor.onShow());
}

for (const [id, t] of Object.entries(tabs) as [TabId, (typeof tabs)[TabId]][]) {
  nav.append(h('button', { 'data-tab': id, onclick: () => show(id) }, icon(t.icon, 22), h('span', {}, t.label)));
}

const installBtn = h('button', { class: 'btn small install', hidden: true }, icon('download', 16), 'Install app');
const header = h('header', { class: 'appbar' },
  h('div', { class: 'brand' }, h('img', { src: 'icons/icon.svg', alt: '', width: 28, height: 28 }), h('span', {}, 'InkDesk ', h('b', {}, 'PDF'))),
  h('span', { class: 'offline-badge', title: 'Works without internet' }, '● Offline ready'),
  installBtn);

document.getElementById('app')!.append(header, main, nav);
show(current);

// ───────── install & offline ─────────
let deferred: any = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  installBtn.hidden = false;
});
const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (!Capacitor.isNativePlatform() && !standalone && isIOS) installBtn.hidden = false;
installBtn.addEventListener('click', async () => {
  if (deferred) {
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    installBtn.hidden = true;
  } else if (isIOS) {
    toast('On iPhone/iPad: tap the Share button, then “Add to Home Screen”.', 6000);
  }
});

if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({
    immediate: true,
    onOfflineReady: () => toast('Ready to work offline'),
  })).catch(() => {});
}

// "Open with InkDesk" from the OS (installed desktop PWA)
(window as any).launchQueue?.setConsumer(async (params: any) => {
  const handle = params.files?.[0];
  if (handle) {
    show('editor');
    await editor.openFile(await handle.getFile());
  }
});

window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  toast('Something went wrong: ' + (e.reason?.message ?? e.reason));
});

window.addEventListener('beforeunload', (e) => {
  if (editor.dirty) e.preventDefault();
});
