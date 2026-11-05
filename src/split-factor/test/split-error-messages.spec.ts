import { complex } from '../engine/complex';
import { computeGroundWireImpedance } from '../engine/ground-wire-impedance.engine';
import { computeIeee80SplitFactor } from '../engine/ieee80-split-factor.engine';
import { computeSoniSplitFactor } from '../engine/soni.engine';
import { describeSplitError } from '../split-error-messages';

/** Messages are matched on the real errors the engines throw, not on made-up text. */
function messageOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return describeSplitError(error);
  }
  throw new Error('expected the engine to throw');
}

const terminal = {
  faultCurrent: complex(400, -500),
  spanLength: 500,
  towerFootingResistance: 10,
  groundWireImpedance: complex(0.55, 0.9),
  mutualImpedance: complex(0, 0),
};

describe('describeSplitError', () => {
  it('translates the Soni engine errors', () => {
    expect(
      messageOf(() =>
        computeSoniSplitFactor({ gridResistance: 0, terminals: [terminal] }),
      ),
    ).toContain('مقاومت شبکه زمین');
    expect(
      messageOf(() =>
        computeSoniSplitFactor({ gridResistance: 0.3, terminals: [] }),
      ),
    ).toContain('حداقل یک ترمینال');
    expect(
      messageOf(() =>
        computeSoniSplitFactor({
          gridResistance: 0.3,
          terminals: [{ ...terminal, faultCurrent: complex(0, 0) }],
        }),
      ),
    ).toContain('مجموع جریان خطا');
    expect(
      messageOf(() =>
        computeSoniSplitFactor({
          gridResistance: 0.3,
          terminals: [{ ...terminal, spanLength: 0 }],
        }),
      ),
    ).toContain('طول span');
    expect(
      messageOf(() =>
        computeSoniSplitFactor({
          gridResistance: 0.3,
          terminals: [{ ...terminal, towerFootingResistance: 0 }],
        }),
      ),
    ).toContain('مقاومت پایه دکل');
    expect(
      messageOf(() =>
        computeSoniSplitFactor({
          gridResistance: 0.3,
          terminals: [{ ...terminal, groundWireImpedance: complex(0, 1) }],
        }),
      ),
    ).toContain('قسمت حقیقی');
  });

  it('translates the ground wire impedance errors', () => {
    const wire = {
      acResistance: 0.5,
      dcResistance: 0.45,
      gmr: 0.003,
      reactance: 0.1,
      resistanceSource: 'AC' as const,
      reactanceSource: 'GMR' as const,
    };
    expect(messageOf(() => computeGroundWireImpedance(wire, 0))).toContain(
      'مقاومت ویژه خاک',
    );
    expect(
      messageOf(() => computeGroundWireImpedance({ ...wire, gmr: 0 }, 100)),
    ).toContain('GMR');
    expect(messageOf(() => computeGroundWireImpedance(wire, 100, 0))).toContain(
      'فرکانس',
    );
  });

  it('translates the IEEE 80 errors and names the missing combination', () => {
    const message = messageOf(() =>
      computeIeee80SplitFactor({
        faultType: 2,
        footingSet: 1,
        transmissionLines: 4,
        distributionLines: 2,
        gridResistance: 1,
      }),
    );
    expect(message).toContain('۴ خط انتقال'.replace('۴', '4'));
    expect(message).toContain('2 خط توزیع');
    expect(
      messageOf(() =>
        computeIeee80SplitFactor({
          faultType: 1,
          footingSet: 1,
          transmissionLines: 2.5,
          distributionLines: 2,
          gridResistance: 1,
        }),
      ),
    ).toContain('عدد صحیح');
  });

  it('describes a singular system and a division by zero', () => {
    expect(
      describeSplitError(new Error('The system matrix is singular.')),
    ).toContain('تکین');
    expect(
      describeSplitError(new Error('Division by a zero complex number.')),
    ).toContain('تقسیم بر صفر');
  });

  it('falls back to the original message for an unknown error', () => {
    expect(describeSplitError(new Error('something odd'))).toContain(
      'something odd',
    );
    expect(describeSplitError('plain text')).toContain('plain text');
  });
});
