/**
 * Persian messages for the errors the split factor engines throw (they
 * are plain English `Error`s, meant for developers). Used where a failed
 * calculation is shown to the user.
 */
const RULES: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [
    /singular/i,
    () =>
      'دستگاه معادلات حل‌پذیر نیست (ماتریس تکین است). مقاومت‌ها و امپدانس‌ها را بررسی کنید.',
  ],
  [/division by a zero/i, () => 'تقسیم بر صفر: امپدانس سیم گارد نباید صفر باشد.'],
  [/earth resistivity must be positive/i, () => 'مقاومت ویژه خاک باید بزرگ‌تر از صفر باشد.'],
  [/frequency must be positive/i, () => 'فرکانس باید بزرگ‌تر از صفر باشد.'],
  [/gmr must be positive/i, () => 'GMR سیم گارد باید بزرگ‌تر از صفر باشد.'],
  [/span length must be positive/i, () => 'طول span باید بزرگ‌تر از صفر باشد.'],
  [
    /tower footing resistance must be positive/i,
    () => 'مقاومت پایه دکل باید بزرگ‌تر از صفر باشد.',
  ],
  [
    /ground wire resistance must be positive/i,
    () => 'قسمت حقیقی امپدانس سیم گارد (مقاومت) باید بزرگ‌تر از صفر باشد.',
  ],
  [
    /(grid|ground) resistance must be positive/i,
    () => 'مقاومت شبکه زمین باید بزرگ‌تر از صفر باشد.',
  ],
  [/at least one terminal/i, () => 'حداقل یک ترمینال لازم است.'],
  [
    /total fault current must not be zero/i,
    () => 'مجموع جریان خطای ترمینال‌ها نباید صفر باشد.',
  ],
  [
    /no standard curve exists for (\d+) transmission and (\d+) distribution/i,
    (match) =>
      `برای ${match[1]} خط انتقال و ${match[2]} خط توزیع با این نوع خطا منحنی استانداردی وجود ندارد.`,
  ],
  [
    /number of (transmission|distribution) lines/i,
    () => 'تعداد خطوط باید عدد صحیح بین ۰ و ۱۸ باشد.',
  ],
  [/ground wire .* was not found/i, () => 'سیم گارد مورد استفاده در کاتالوگ یافت نشد.'],
];

export function describeSplitError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  for (const [pattern, describe] of RULES) {
    const match = message.match(pattern);
    if (match) return describe(match);
  }

  return `خطای محاسبه: ${message}`;
}
