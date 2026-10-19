// All fonts are bundled with the app so everything renders offline.
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/800.css';
import '@fontsource/courier-prime/400.css';
import '@fontsource/courier-prime/700.css';
import '@fontsource/merriweather/400.css';
import '@fontsource/merriweather/700.css';
import '@fontsource/caveat/400.css';
import '@fontsource/caveat/700.css';
import '@fontsource/indie-flower/400.css';
import '@fontsource/kalam/400.css';
import '@fontsource/shadows-into-light/400.css';
import '@fontsource/reenie-beanie/400.css';
import '@fontsource/homemade-apple/400.css';
import '@fontsource/dancing-script/400.css';
import '@fontsource/great-vibes/400.css';

export async function ensureFont(family: string, weight = 400, sample = 'Aa₦') {
  try {
    await document.fonts.load(`${weight} 32px "${family}"`, sample);
  } catch {
    /* fall back to whatever is available */
  }
}
