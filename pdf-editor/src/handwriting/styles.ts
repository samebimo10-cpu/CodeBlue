export interface HandStyle {
  id: string;
  name: string;
  family: string;
  /** Joined-up scripts are laid out per word so the letters stay connected. */
  connected: boolean;
  /** Visual size correction so all styles look similar at the same size. */
  scale: number;
}

export const HAND_STYLES: HandStyle[] = [
  { id: 'everyday', name: 'Everyday', family: 'Caveat', connected: false, scale: 1.2 },
  { id: 'rounded', name: 'Rounded', family: 'Indie Flower', connected: false, scale: 1 },
  { id: 'neat', name: 'Neat print', family: 'Kalam', connected: false, scale: 0.95 },
  { id: 'marker', name: 'Light marker', family: 'Shadows Into Light', connected: false, scale: 1.05 },
  { id: 'scrawl', name: 'Quick scrawl', family: 'Reenie Beanie', connected: false, scale: 1.35 },
  { id: 'loopy', name: 'Loopy script', family: 'Homemade Apple', connected: true, scale: 0.8 },
  { id: 'cursive', name: 'Elegant cursive', family: 'Dancing Script', connected: true, scale: 1.1 },
  { id: 'calligraphy', name: 'Calligraphy', family: 'Great Vibes', connected: true, scale: 1.3 },
];

export interface InkPreset {
  id: string;
  name: string;
  color: string;
  /** pencil grain: 0 = solid ink */
  grain: number;
}

export const INKS: InkPreset[] = [
  { id: 'blue', name: 'Blue ballpoint', color: '#1b3a9e', grain: 0 },
  { id: 'black', name: 'Black pen', color: '#141414', grain: 0 },
  { id: 'red', name: 'Red pen', color: '#c1121f', grain: 0 },
  { id: 'green', name: 'Green pen', color: '#16794a', grain: 0 },
  { id: 'royal', name: 'Royal blue fountain', color: '#2547d0', grain: 0 },
  { id: 'pencil', name: 'Pencil', color: '#55585e', grain: 0.45 },
];

export const TYPED_FONTS: [string, string][] = [
  ['Helvetica, Arial, sans-serif', 'Sans (Helvetica)'],
  ['Inter', 'Inter'],
  ['"Times New Roman", Times, serif', 'Serif (Times)'],
  ['Merriweather', 'Merriweather'],
  ['"Courier New", Courier, monospace', 'Mono (Courier)'],
  ['Courier Prime', 'Courier Prime'],
];

export const isHandwritingFamily = (family: string) =>
  HAND_STYLES.some((s) => family.includes(s.family));
