import { ConductorMaterial } from '../enum';

/**
 * Conductor materials and their IEEE Std 80 Table 1 constants.
 *
 * The numbers are copied from the Windows GGGS source (the material
 * `If conductor.Combo1.Text = ...` table), so both programs size
 * conductors from the same data.
 */
export interface ConductorMaterialData {
  id: ConductorMaterial;
  /** Name as shown in the Windows GGGS picker. */
  name: string;
  /** Thermal coefficient of resistivity at 20 °C, αr (1/°C). */
  alphaR: number;
  /** K0 = 1/α0 (°C), used in the temperature log term. */
  k0: number;
  /** Maximum allowable (fusing) temperature, Tm (°C). */
  fusingTemperature: number;
  /** Resistivity at 20 °C, ρr (µΩ·cm). */
  rhoR: number;
  /** Thermal capacity per unit volume, TCAP (J/(cm³·°C)). */
  tcap: number;
  /**
   * Default conduction time (s) the Windows picker pre-fills for this
   * material (`conductor.tc3`: 0.5 or 1). Suggestion only — the sizing
   * duration is always an explicit input.
   */
  defaultDuration: number;
}

export const CONDUCTOR_MATERIALS: readonly ConductorMaterialData[] = [
  {
    id: ConductorMaterial.COPPER_ANNEALED_SOFT_DRAWN,
    name: 'Standard Annealed Soft Copper Wire',
    alphaR: 0.00393,
    k0: 234,
    fusingTemperature: 1083,
    rhoR: 1.7241,
    tcap: 3.422,
    defaultDuration: 0.5,
  },
  {
    id: ConductorMaterial.COPPER_COMMERCIAL_HARD_DRAWN,
    name: 'Commercial Hard Drawn Copper Wire',
    alphaR: 0.00381,
    k0: 242,
    fusingTemperature: 1084,
    rhoR: 1.7774,
    tcap: 3.422,
    defaultDuration: 0.5,
  },
  {
    id: ConductorMaterial.COPPER_CLAD_STEEL_1,
    name: 'Copper-Clad Steel Core Wire(1)',
    alphaR: 0.00378,
    k0: 245,
    fusingTemperature: 1084,
    rhoR: 4.397,
    tcap: 3.846,
    defaultDuration: 1,
  },
  {
    id: ConductorMaterial.COPPER_CLAD_STEEL_2,
    name: 'Copper-Clad Steel Core Wire(2)',
    alphaR: 0.00378,
    k0: 245,
    fusingTemperature: 1300,
    rhoR: 4.397,
    tcap: 3.846,
    defaultDuration: 1,
  },
  {
    id: ConductorMaterial.COPPER_CLAD_STEEL_3,
    name: 'Copper-Clad Steel Core Wire(3)',
    alphaR: 0.00378,
    k0: 245,
    fusingTemperature: 1084,
    rhoR: 5.862,
    tcap: 3.846,
    defaultDuration: 0.5,
  },
  {
    id: ConductorMaterial.COPPER_CLAD_STEEL_4,
    name: 'Copper-Clad Steel Core Wire(4)',
    alphaR: 0.00378,
    k0: 245,
    fusingTemperature: 1300,
    rhoR: 5.862,
    tcap: 3.846,
    defaultDuration: 0.5,
  },
  {
    id: ConductorMaterial.ALUMINUM_EC_GRADE,
    name: 'Commercial EC Aluminum Wire',
    alphaR: 0.00403,
    k0: 228,
    fusingTemperature: 657,
    rhoR: 2.862,
    tcap: 2.556,
    defaultDuration: 0.5,
  },
  {
    id: ConductorMaterial.ALUMINUM_ALLOY_5005,
    name: 'Aluminum Alloy Wire 5005',
    alphaR: 0.00353,
    k0: 263,
    fusingTemperature: 660,
    rhoR: 3.2226,
    tcap: 2.598,
    defaultDuration: 0.5,
  },
  {
    id: ConductorMaterial.ALUMINUM_ALLOY_6201,
    name: 'Aluminum Alloy Wire 6201',
    alphaR: 0.00347,
    k0: 268,
    fusingTemperature: 660,
    rhoR: 3.284,
    tcap: 2.598,
    defaultDuration: 1,
  },
  {
    id: ConductorMaterial.ALUMINUM_CLAD_STEEL_1,
    name: 'Aluminum-Clad Steel Core Wire(1)',
    alphaR: 0.0036,
    k0: 258,
    fusingTemperature: 660,
    rhoR: 8.4805,
    tcap: 2.67,
    defaultDuration: 1,
  },
  {
    id: ConductorMaterial.ALUMINUM_CLAD_STEEL_2,
    name: 'Aluminum-Clad Steel Core Wire(2)',
    alphaR: 0.0036,
    k0: 258,
    fusingTemperature: 1300,
    rhoR: 8.4805,
    tcap: 2.67,
    defaultDuration: 0.5,
  },
  {
    id: ConductorMaterial.ZINC_COATED_STEEL_1,
    name: 'Zinc-Coated Steel Core Wire(1)',
    alphaR: 0.0032,
    k0: 293,
    fusingTemperature: 419,
    rhoR: 20.1,
    tcap: 3.931,
    defaultDuration: 1,
  },
  {
    id: ConductorMaterial.ZINC_COATED_STEEL_2,
    name: 'Zinc-Coated Steel Core Wire(2)',
    alphaR: 0.0032,
    k0: 293,
    fusingTemperature: 1300,
    rhoR: 20.1,
    tcap: 3.931,
    defaultDuration: 1,
  },
  {
    id: ConductorMaterial.STAINLESS_STEEL_304,
    name: 'Stainless Steel No 304',
    alphaR: 0.0013,
    k0: 746,
    fusingTemperature: 1400,
    rhoR: 72,
    tcap: 4.032,
    defaultDuration: 1,
  },
];

const BY_ID = new Map(CONDUCTOR_MATERIALS.map((m) => [m.id, m]));

export function getConductorMaterial(
  id: ConductorMaterial,
): ConductorMaterialData {
  const material = BY_ID.get(id);
  if (!material) {
    throw new Error(`Unknown conductor material: ${id}`);
  }
  return material;
}
