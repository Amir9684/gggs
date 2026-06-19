enum GridElementType {
  CONDUCTOR,
  ROD,
  WELL,
  FENCE,
  EQUIPMENT,
  BUILDING,
  GATE,
}

/**
 * aka SRID
 */
enum SpatialReferenceID {
  /**
   * WGS 84 (Unit: Degrees (lat/lng))
   */
  WGS84 = 4326,
  /**
   * Web Mercator (Unit: Meters)
   */
  WebMercator = 3857,
}

export { GridElementType, SpatialReferenceID };
