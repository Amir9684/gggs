/**
 * Grounding-design calculation method a `CalculationCase` is analyzed
 * with. Mirrors the frontend's `types/design-method.ts` string values
 * exactly (same names) so the two speak the same JSON without a mapping
 * layer.
 */
enum DesignMethod {
  IEEE_80_86 = 'IEEE_80_86',
  IEEE_80_2000 = 'IEEE_80_2000',
  GALERKIN = 'GALERKIN',
}

/** Only meaningful when `designMethod === DesignMethod.IEEE_80_2000`. */
enum SoilLayeringMethod {
  ONE_LAYER = 'ONE_LAYER',
  TWO_LAYER = 'TWO_LAYER',
}

/**
 * `./engine` implements IEEE Std 80-2013 (`safety-evaluation.engine.ts`)
 * and IEEE Std 80-1986 (`safety-evaluation-1986.engine.ts`, which reuses
 * most of the 2013 formulas — see its header comment for exactly what
 * differs). There's no Galerkin (numerical field solver) implementation.
 * `run()` in `CalculationsService` refuses to execute for any method
 * outside this list rather than silently running a different method's
 * engine under this one's name. Extend this list (and add the
 * corresponding engine) as support for a method actually lands.
 */
const IMPLEMENTED_DESIGN_METHODS: readonly DesignMethod[] = [
  DesignMethod.IEEE_80_2000,
  DesignMethod.IEEE_80_86,
];

export { DesignMethod, SoilLayeringMethod, IMPLEMENTED_DESIGN_METHODS };
