/** How the places lists show: the map with the list as its panel, or the table. */
export const placesViews = ['map', 'table'] as const;
export type PlacesView = (typeof placesViews)[number];
