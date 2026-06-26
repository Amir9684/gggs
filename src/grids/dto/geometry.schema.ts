import { z } from 'zod';

/**
 * A minimal but real GeoJSON `Geometry` validator (RFC 7946), covering the
 * geometry types grid elements actually use:
 *  - Point            → rods, wells, equipment
 *  - LineString        → conductors, fences
 *  - Polygon           → buildings, fenced areas
 *
 * Coordinates are stored in the grid's local Web Mercator-like plane
 * (meters), matching `SpatialReferenceID.WebMercator` on the
 * `GridElement` entity — not real-world lng/lat — so no lng/lat range
 * validation is applied here.
 */
const positionSchema = z
  .tuple([z.number(), z.number()])
  .rest(z.number())
  .describe('GeoJSON position: [x, y] or [x, y, z]');

const pointGeometrySchema = z.object({
  type: z.literal('Point'),
  coordinates: positionSchema,
});

const lineStringGeometrySchema = z.object({
  type: z.literal('LineString'),
  coordinates: z
    .array(positionSchema)
    .min(2, 'یک خط باید حداقل دو نقطه داشته باشد'),
});

const polygonGeometrySchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z
    .array(
      z
        .array(positionSchema)
        .min(4, 'هر حلقه چندضلعی باید حداقل چهار نقطه داشته باشد'),
    )
    .min(1, 'چندضلعی باید حداقل یک حلقه داشته باشد'),
});

const geometrySchema = z.discriminatedUnion('type', [
  pointGeometrySchema,
  lineStringGeometrySchema,
  polygonGeometrySchema,
]);

export {
  positionSchema,
  pointGeometrySchema,
  lineStringGeometrySchema,
  polygonGeometrySchema,
  geometrySchema,
};
