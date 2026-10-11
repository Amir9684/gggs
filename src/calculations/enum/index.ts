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

/**
 * Soil model type of the IEEE methods. Meaningful for
 * `DesignMethod.IEEE_80_2000` and `DesignMethod.IEEE_80_86`; `TWO_LAYER`
 * needs a soil model with exactly two layers.
 */
enum SoilLayeringMethod {
  ONE_LAYER = 'ONE_LAYER',
  TWO_LAYER = 'TWO_LAYER',
}

/**
 * Conductor materials of the Windows GGGS "Material of Conductor" picker,
 * which uses the IEEE Std 80 Table 1 materials. The `(n)` variants come
 * straight from the Windows list ("Copper-Clad Steel Core Wire(1)" …):
 * they share the material but differ in resistivity and/or fusing
 * temperature, so they are numbered the same way instead of guessing a
 * wire/rod meaning the Windows source does not state.
 */
enum ConductorMaterial {
  COPPER_ANNEALED_SOFT_DRAWN = 'COPPER_ANNEALED_SOFT_DRAWN',
  COPPER_COMMERCIAL_HARD_DRAWN = 'COPPER_COMMERCIAL_HARD_DRAWN',
  COPPER_CLAD_STEEL_1 = 'COPPER_CLAD_STEEL_1',
  COPPER_CLAD_STEEL_2 = 'COPPER_CLAD_STEEL_2',
  COPPER_CLAD_STEEL_3 = 'COPPER_CLAD_STEEL_3',
  COPPER_CLAD_STEEL_4 = 'COPPER_CLAD_STEEL_4',
  ALUMINUM_EC_GRADE = 'ALUMINUM_EC_GRADE',
  ALUMINUM_ALLOY_5005 = 'ALUMINUM_ALLOY_5005',
  ALUMINUM_ALLOY_6201 = 'ALUMINUM_ALLOY_6201',
  ALUMINUM_CLAD_STEEL_1 = 'ALUMINUM_CLAD_STEEL_1',
  ALUMINUM_CLAD_STEEL_2 = 'ALUMINUM_CLAD_STEEL_2',
  ZINC_COATED_STEEL_1 = 'ZINC_COATED_STEEL_1',
  ZINC_COATED_STEEL_2 = 'ZINC_COATED_STEEL_2',
  STAINLESS_STEEL_304 = 'STAINLESS_STEEL_304',
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

export {
  DesignMethod,
  SoilLayeringMethod,
  ConductorMaterial,
  IMPLEMENTED_DESIGN_METHODS,
};
