import { complex, mul, solveLinearSystem, div, abs } from '../complex';

describe('solveLinearSystem', () => {
  it('solves a small complex system', () => {
    const a = [
      [complex(2, 1), complex(1, 0)],
      [complex(0, 1), complex(3, -1)],
    ];
    const x = [complex(1, -1), complex(2, 0.5)];
    const b = a.map((row) =>
      row.reduce(
        (sum, value, k) => ({
          re: sum.re + mul(value, x[k]).re,
          im: sum.im + mul(value, x[k]).im,
        }),
        complex(0),
      ),
    );

    const solved = solveLinearSystem(a, b);

    expect(solved[0].re).toBeCloseTo(1, 10);
    expect(solved[0].im).toBeCloseTo(-1, 10);
    expect(solved[1].re).toBeCloseTo(2, 10);
    expect(solved[1].im).toBeCloseTo(0.5, 10);
  });

  it('needs a row swap when the first pivot is zero', () => {
    const solved = solveLinearSystem(
      [
        [complex(0), complex(1)],
        [complex(1), complex(0)],
      ],
      [complex(3), complex(5)],
    );
    expect(solved[0].re).toBeCloseTo(5, 12);
    expect(solved[1].re).toBeCloseTo(3, 12);
  });

  it('rejects a singular matrix', () => {
    expect(() =>
      solveLinearSystem(
        [
          [complex(1), complex(2)],
          [complex(2), complex(4)],
        ],
        [complex(1), complex(1)],
      ),
    ).toThrow();
  });

  it('rejects a non-square system', () => {
    expect(() =>
      solveLinearSystem([[complex(1)]], [complex(1), complex(2)]),
    ).toThrow();
  });
});

describe('complex division', () => {
  it('divides', () => {
    const q = div(complex(1, 2), complex(3, -1));
    expect(abs(q)).toBeCloseTo(Math.sqrt(5) / Math.sqrt(10), 12);
  });
  it('refuses to divide by zero', () => {
    expect(() => div(complex(1), complex(0))).toThrow();
  });
});
