# InkDesk PDF

An offline PDF editor that installs on Android, iPhone/iPad and desktop. Everything runs on the device. Nothing is uploaded, and it works with no internet connection.

## What it does

**1. Edit PDFs**
- Open any PDF (password-protected ones too), or start from a blank page or from photos.
- **Edit text:** tap a line of the PDF's own text. The old words are removed and an editable copy appears in the same size, style and colour.
- Add text, pen, highlighter, boxes, circles, lines, arrows and signatures.
- Pages: reorder, rotate, duplicate, delete, add blank pages, merge pages from other PDFs.
- Undo/redo, pinch-zoom, and keyboard shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+S, Ctrl+D, Delete).
- Saving keeps the original PDF's vectors, links and selectable text. Your edits are added on top.

**2. Smart erasers that tell handwriting from typed text**
- Modes: **Handwriting** (keeps typed text), **Typed text** (keeps handwriting), **All writing** (keeps lines, boxes and pictures) and **Whiteout**.
- **Show what's what** colours the page: blue for typed, pink for handwriting, green for lines and pictures.
- How it decides:
  - Real text in the PDF always counts as typed.
  - Long straight rules and solid shapes count as graphics.
  - Typed letters are small, all the same height and lined up on a baseline. Handwriting is not.
  - Coloured pen ink (blue, red) counts as handwriting, even where it crosses a typed line.
- Erased areas are repainted in the local paper colour, so cream or scanned paper stays even.
- With "Added items too" turned on, the eraser also removes pen strokes or text boxes you added, of the kind you chose.
- **Tuning** has a sensitivity slider and a "Restore page" button.

**3. Handwriting**
- Eight handwriting styles, from casual and neat print to cursive and calligraphy.
- Any ink colour, with presets for ballpoint, fountain pen and pencil grain.
- Controls for size, slant, messiness (natural variation), line spacing and wrapping.
- **My handwriting:** write each letter once on the pad, or several times for variety. The generator then writes anything you type in your own hand.
- **Take handwriting:**
  - From a photo: the paper is removed and only the ink is kept.
  - From a page: use the **Take ink** tool and drag a box. It can copy or move the ink, keep or change its colour, and save it to *My ink*.

**4. Pictures, PDFs and blending**
- Insert photos (camera or gallery), or another PDF's page as a picture.
- Blend modes: Multiply, Screen, Overlay, Darken and 8 more. They preview on screen exactly as they export.
- Per-item opacity, *Remove white* (makes paper see-through), *Black & white* and *Recolour*.

**5. Receipt and logo designer**
Six preloaded, editable templates:

| Sector | Template |
|---|---|
| Hospital | Payment receipt (A4) |
| Hospital | Clinic / diagnostic lab bill (A5) |
| Pharmacy | Till receipt (80 mm thermal) |
| Pharmacy | Sales invoice with batch/expiry and VAT (A4) |
| Hotel | Guest folio with VAT and service charge (A4) |
| Hotel | Restaurant / bar bill (thermal) |

- Edit the business details, logo, fields, items, taxes, discounts, payment and stamp (PAID / PART PAID / …).
- Totals, VAT and change are calculated for you.
- Choose paper (A4, A5, Letter, 80 mm, 58 mm), layout, font, brand colour and currency (₦, $, £, €, GH₵, KSh…).
- Export as PDF or PNG, print, save to reuse later, or open in the editor to sign and stamp.
- **Logo designer:** 12 presets (hospital, clinic, lab, pharmacy, hotel, restaurant…), 11 symbols, badge shapes, initials and a name + slogan layout. Use the logo on a receipt, place it in a PDF or download it as a PNG.

The templates use placeholder business names. Put in your own details.

## Install it on a phone

**Option A — installable web app (Android and iPhone, no app store)**
1. Host the `dist/` folder over HTTPS. The included GitHub Action can publish it to GitHub Pages: in the repo, go to *Settings → Pages → Source: GitHub Actions*, then run the **InkDesk PDF** workflow manually.
2. Open the link on the phone:
   - **Android (Chrome):** tap *Install app*.
   - **iPhone/iPad (Safari):** tap Share → *Add to Home Screen*.
3. After the first visit the whole app, including its fonts, is stored on the phone and works offline.

**Option B — native apps (Capacitor)**
- **Android APK:** every push that changes `pdf-editor/` runs the GitHub Action, which uploads `inkdesk-pdf-android-apk` (a debug build you can sideload). To build locally:

  ```bash
  npm run build && npx cap sync android
  cd android && ./gradlew assembleDebug
  ```

  For a Play Store release, open the project with `npm run android` (Android Studio) and use *Build → Generate Signed Bundle*.
- **iOS:** needs a Mac with Xcode. Run `npm run ios`, pick your team under *Signing*, then run it on a device or archive it for the App Store / TestFlight. Saved PDFs appear in the Files app under *InkDesk PDF*.

## Develop

```bash
cd pdf-editor
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (classifier, totals, PDF placement, PNG)
npm run build        # production build in dist/ (precached for offline use)
npm run make-sample -- sample.pdf      # test PDF with typed text + handwriting
npx vite preview --port 4173 &         # then:
npm run e2e -- sample.pdf ./e2e-out    # browser walk-through with screenshots
```

**Stack:**
- Vite + TypeScript, no UI framework.
- pdf.js renders pages and finds the real text.
- pdf-lib writes the PDF.
- Fabric.js handles the editable objects.
- Capacitor builds the Android/iOS apps.
- Workbox makes the web app work offline.
- Fonts are bundled from Fontsource (OFL).

## Limits worth knowing

- Erasing paints over content; it does not delete it. Text that was erased or replaced is hidden, but it is still in the file underneath. Don't rely on the eraser to redact confidential information.
- The handwriting vs typed sorting is a heuristic. On scanned pages, neat hand-printing can be read as typed, and black pen written directly on top of black print counts as typed. Check with *Show what's what* and adjust *Sensitivity*.
- Added text, ink and pictures are stored as high-resolution images (about 216 dpi). The original document stays vector.
- PDF form fields are not filled as form fields. Use *Add text* on top of them instead.
