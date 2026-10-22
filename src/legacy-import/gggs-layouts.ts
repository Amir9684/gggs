import type { VbFieldType } from './vb-random-file.reader';

/**
 * Record layouts of the Windows GGGS input files, read off the VB source:
 * the order of the `Put #1, , x` statements in each form's `SAVEMENU_Click`
 * and the declared type of each variable in `MODULEsave.bas`.
 *
 * `uiState` entries only restored the Windows form's own widgets and carry
 * no data the web app needs.
 */
type Layout = ReadonlyArray<{ name: string; type: VbFieldType }>;

/** `grounding` (GROUND2n.frm) — records 1..20, shared by every file. */
const GROUNDING_BLOCK: Layout = [
  { name: 'soilResistivity', type: 'Single' }, // ro  (ohm-m)
  { name: 'surfaceLayerResistivity', type: 'Single' }, // ros (ohm-m)
  { name: 'surfaceLayerThickness', type: 'Single' }, // hs  (m)
  { name: 'faultCurrent', type: 'Single' }, // ief (A)
  { name: 'shockDuration', type: 'Single' }, // ts  (s)
  { name: 'requiredConductorAreaMm2', type: 'Single' }, // conar
  { name: 'conductorAreaMm2', type: 'Single' }, // cona
  { name: 'touchLimit50', type: 'Single' }, // Etch50 (V)
  { name: 'stepLimit50', type: 'Single' }, // Estp50 (V)
  { name: 'touchLimit70', type: 'Single' }, // Etch70 (V)
  { name: 'stepLimit70', type: 'Single' }, // Estp70 (V)
  { name: 'faultDuration0008', type: 'String' }, // tf(0).Value, 0.008 s
  { name: 'faultDuration01', type: 'String' }, // tf(1).Value, 0.1 s
  { name: 'faultDuration025', type: 'String' }, // tf(2).Value, 0.25 s
  { name: 'faultDuration05', type: 'String' }, // tf(3).Value, 0.5 s
  { name: 'uiMaterialLabel', type: 'String' }, // Label9.Caption
  { name: 'uiFrameVisible', type: 'String' }, // Frame3.Visible
  { name: 'uiLabel11', type: 'String' }, // Label11.Caption
  { name: 'uiLabel5', type: 'String' }, // Label5.Caption
  { name: 'uiFormHeight', type: 'Single' }, // grounding.Height
];

/** Conductor choice, records 21..22 of the design files. */
const CONDUCTOR_BLOCK: Layout = [
  { name: 'conductorName', type: 'String' }, // conductor.CndctrNmtxt
  { name: 'allowableTemperature', type: 'Single' }, // conductor.ta (degC)
];

/** Grid-shape and rod-arrangement radio buttons (VB `Value`, as "True"/"False"). */
const SHAPE_AND_RODS: Layout = [
  { name: 'shapeSquare', type: 'String' },
  { name: 'shapeRectangular', type: 'String' },
  { name: 'shapeLShaped', type: 'String' },
  { name: 'rodsOption1', type: 'String' }, // corners, perimeter, throughout
  { name: 'rodsOption2', type: 'String' }, // none or a few scattered
];

/** IEEE 80-2000, one-layer soil (ieee2000.frm) — 46 records. */
const IEEE_80_2000_LAYOUT: Layout = [
  ...GROUNDING_BLOCK,
  ...CONDUCTOR_BLOCK,
  { name: 'length', type: 'Single' }, // lent (m)
  { name: 'width', type: 'Single' }, // wid  (m)
  { name: 'spacing', type: 'Single' }, // dis  (m)
  { name: 'burialDepth', type: 'Single' }, // h (m)
  { name: 'rodCount', type: 'Single' }, // rod
  { name: 'rodLength', type: 'Single' }, // lr (m)
  { name: 'resultGridResistance', type: 'Single' }, // rgf (ohm)
  { name: 'resultGpr', type: 'Single' }, // GPR (V)
  { name: 'resultMeshVoltage', type: 'Single' }, // emesh (V)
  { name: 'resultStepVoltage', type: 'Single' }, // estep (V)
  ...SHAPE_AND_RODS,
  { name: 'splitFactor', type: 'Single' }, // Sftxt
  { name: 'lShapeText1', type: 'Single' },
  { name: 'lShapeText2', type: 'Single' },
  { name: 'lShapeText3', type: 'Single' },
  { name: 'lShapeText4', type: 'Single' },
  { name: 'uiLabel20', type: 'String' }, // Label20.Caption
  { name: 'lineCountLl', type: 'Single' }, // nll
  { name: 'lineCountLw', type: 'Single' }, // nlw
  { name: 'meshCount', type: 'Single' }, // numbermeshes
];

/** IEEE 80-2000, two-layer soil (Towlay2000.frm) — 47 records. */
const IEEE_80_2000_TWO_LAYER_LAYOUT: Layout = [
  ...GROUNDING_BLOCK,
  ...CONDUCTOR_BLOCK,
  { name: 'length', type: 'Single' },
  { name: 'width', type: 'Single' },
  { name: 'spacing', type: 'Single' },
  { name: 'burialDepth', type: 'Single' },
  { name: 'rodCount', type: 'Single' },
  { name: 'rodLength', type: 'Single' },
  { name: 'resultMeshVoltage', type: 'Single' }, // emesh (V)
  { name: 'resultStepVoltage', type: 'Single' }, // estep (V)
  ...SHAPE_AND_RODS,
  { name: 'splitFactor', type: 'Single' },
  { name: 'lShapeText1', type: 'Single' },
  { name: 'lShapeText2', type: 'Single' },
  { name: 'lShapeText3', type: 'Single' },
  { name: 'lShapeText4', type: 'Single' },
  { name: 'upperResistivity', type: 'Single' }, // ros (ohm-m)
  { name: 'upperThickness', type: 'Single' }, // hs  (m)
  { name: 'lowerResistivity', type: 'Single' }, // ro  (ohm-m)
  { name: 'uiConductorDiameter', type: 'Single' }, // DiametOfConductors
  { name: 'lineCountLl', type: 'Single' },
  { name: 'lineCountLw', type: 'Single' },
  { name: 'meshCount', type: 'Single' },
];

export const GGGS_FILE_KINDS = [
  'GROUNDING_INPUT',
  'IEEE_80_2000',
  'IEEE_80_2000_TWO_LAYER',
] as const;

export type GggsFileKind = (typeof GGGS_FILE_KINDS)[number];

export const GGGS_LAYOUTS: Record<GggsFileKind, Layout> = {
  GROUNDING_INPUT: GROUNDING_BLOCK,
  IEEE_80_2000: IEEE_80_2000_LAYOUT,
  IEEE_80_2000_TWO_LAYER: IEEE_80_2000_TWO_LAYER_LAYOUT,
};

/** Fault durations of the `tf(0..3)` option buttons of the Windows form (s). */
export const FAULT_DURATION_OPTIONS = [
  { field: 'faultDuration0008', seconds: 0.008 },
  { field: 'faultDuration01', seconds: 0.1 },
  { field: 'faultDuration025', seconds: 0.25 },
  { field: 'faultDuration05', seconds: 0.5 },
] as const;

/** Files are told apart by their record count (each form saves a fixed number). */
export function detectKindByRecordCount(
  recordCount: number,
): GggsFileKind | null {
  const match = GGGS_FILE_KINDS.find(
    (kind) => GGGS_LAYOUTS[kind].length === recordCount,
  );
  return match ?? null;
}
