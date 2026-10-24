export interface Palette {
  bg: string;
  raised: string;
  ink: string;
  soft: string;
  line: string;
  accent: string;
  accentInk: string;
  on: string;
  warn: string;
  danger: string;
  info: string;
  sim: string;
  mode: 'light' | 'dark';
}

export const lightPalette: Palette = {
  bg: '#F3F0E8',
  raised: '#FFFCF7',
  ink: '#1E1A16',
  soft: '#6B6258',
  line: '#E3D9CC',
  accent: '#C45C26',
  accentInk: '#FFF8F3',
  on: '#2C6B4A',
  warn: '#8A5A12',
  danger: '#8E3B31',
  info: '#3C5870',
  sim: '#68458F',
  mode: 'light',
};

export const darkPalette: Palette = {
  bg: '#141210',
  raised: '#221F1B',
  ink: '#F6F0E6',
  soft: '#B7AFA3',
  line: '#3A342C',
  accent: '#E08A4F',
  accentInk: '#1A120C',
  on: '#8FCBAA',
  warn: '#E0B15A',
  danger: '#E39A90',
  info: '#A9C3D6',
  sim: '#D2C0EA',
  mode: 'dark',
};
