// Map tiles. With VITE_MAPTILER_KEY set: MapTiler, which has a real dark style. Without it:
// OpenStreetMap's public servers, which are fine for development but whose usage policy rules
// out production traffic.

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY?.trim();

export interface TileSource {
  url: string;
  attribution: string;
  tileSize: number;
  zoomOffset: number;
  /** OSM has no dark tiles, so they're recoloured with a CSS filter in dark mode. */
  recolourInDark: boolean;
}

const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors';

export function tileSource(dark: boolean): TileSource {
  if (!MAPTILER_KEY) {
    return {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: OSM_ATTRIBUTION,
      tileSize: 256,
      zoomOffset: 0,
      recolourInDark: true,
    };
  }
  // 512 px tiles: a quarter of the requests of 256 px ones, which matters on the free plan.
  const style = dark ? 'streets-v2-dark' : 'streets-v2';
  return {
    url: `https://api.maptiler.com/maps/${style}/{z}/{x}/{y}.png?key=${encodeURIComponent(MAPTILER_KEY)}`,
    attribution: `<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> ${OSM_ATTRIBUTION}`,
    tileSize: 512,
    zoomOffset: -1,
    recolourInDark: false,
  };
}
