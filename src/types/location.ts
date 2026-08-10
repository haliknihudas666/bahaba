// ---------------------------------------------------------------------------
// Bahaba – Location & Search Types
// ---------------------------------------------------------------------------

export interface MetroLocationItem {
  id: string;
  name: string;
  subtext: string;
  category: "station" | "road" | "landmark";
  coords: [number, number]; // [lat, lng]
}
