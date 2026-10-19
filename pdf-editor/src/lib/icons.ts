// Minimal stroke icon set (24×24 viewBox) so the UI needs no icon font or network.
const P: Record<string, string> = {
  open: 'M3 7h6l2 2h10v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z M3 7V5a1 1 0 0 1 1-1h5l2 2',
  save: 'M12 3v12 M7 10l5 5 5-5 M4 19h16',
  undo: 'M9 14 4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3',
  pages: 'M8 3h10a1 1 0 0 1 1 1v14 M5 6h10a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z',
  select: 'M5 3l14 8-6 2-2 6z',
  hand: 'M8 13V5a1.5 1.5 0 0 1 3 0v6 M11 11V4a1.5 1.5 0 0 1 3 0v7 M14 11V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.5-1.5L8 15',
  text: 'M5 6V4h14v2 M12 4v16 M9 20h6',
  edittext: 'M4 7V5h10v2 M9 5v12 M6 17h6 M14 19l6-6 2 2-6 6h-2z',
  pen: 'M4 20l4-1 11-11a2 2 0 0 0-3-3L5 16z M14 7l3 3',
  highlight: 'M9 15l-4 4h6l1-1 M8 13l7-9 5 4-7 9z M8 13l4 4',
  rect: 'M4 6h16v12H4z',
  ellipse: 'M12 5c4.4 0 8 3.1 8 7s-3.6 7-8 7-8-3.1-8-7 3.6-7 8-7z',
  line: 'M5 19L19 5',
  arrow: 'M5 19L19 5 M10 5h9v9',
  eraser: 'M8 20h12 M5 15l9-9a2 2 0 0 1 3 0l3 3a2 2 0 0 1 0 3l-8 8H9l-4-4a1 1 0 0 1 0-1z M9 11l5 5',
  image: 'M4 5h16v14H4z M4 16l5-5 4 4 2-2 5 5 M15 9.5a1.5 1.5 0 1 0 0-.01',
  pdfimg: 'M7 3h7l5 5v13H7z M14 3v5h5 M9 13h6 M9 17h4',
  sign: 'M3 17c3 0 4-9 6-9s1 8 3 8 2-4 4-4 1 3 3 3 M3 21h18',
  capture: 'M4 8V4h4 M16 4h4v4 M20 16v4h-4 M8 20H4v-4 M9 13c1-2 2-3 3-1s2 1 3-1',
  hand2: 'M4 18c2-6 4-10 6-10s0 8 2 8 3-6 5-6 1 4 3 4',
  detect: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  zoomin: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-5-5 M8 11h6 M11 8v6',
  zoomout: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-5-5 M8 11h6',
  fit: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  prev: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  copy: 'M9 9h10v11H9z M5 15V4h10',
  rotate: 'M20 12a8 8 0 1 1-3-6.2 M20 4v5h-5',
  up: 'M12 19V5 M6 11l6-6 6 6',
  down: 'M12 5v14 M6 13l6 6 6-6',
  plus: 'M12 5v14 M5 12h14',
  front: 'M8 8h12v12H8z M4 16V4h12',
  back: 'M4 4h12v12H4z M20 8v12H8',
  receipt: 'M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z M9 8h6 M9 12h6 M9 16h3',
  editor: 'M7 3h7l5 5v13H7z M14 3v5h5 M10 17l1-3 5-5 2 2-5 5z',
  feather: 'M20 4C12 4 7 9 6 17l-2 3 M6 17c6 0 10-4 12-9 M10 13h5',
  logo: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.3 6L12 16.4 6.6 19.4l1.3-6L3.4 9.3l6-.7z',
  check: 'M5 12l5 5 9-10',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  blank: 'M7 3h7l5 5v13H7z M14 3v5h5 M12 11v6 M9 14h6',
  merge: 'M6 3v6a6 6 0 0 0 6 6h6 M15 12l3 3-3 3 M6 21v-4',
  close: 'M6 6l12 12 M18 6L6 18',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 19h16',
  library: 'M4 4h4v16H4z M10 4h4v16h-4z M16 5l3.5-1 3 15-3.5 1z',
};

export function icon(name: keyof typeof P | string, size = 20): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', P[name] ?? P.more);
  svg.append(path);
  return svg;
}
