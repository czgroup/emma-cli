/** Format a money amount with a sign, in the given currency. */
export function money(amount: number, currency = 'GBP'): string {
  const symbol = currency === 'GBP' ? '£' : `${currency} `;
  const formatted = Math.abs(amount).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = amount < 0 ? '-' : amount > 0 ? '+' : '';
  return `${sign}${symbol}${formatted}`;
}

/** Format a date string returned by the API (e.g. "2026-08-14 01:00:00"). */
export function shortDate(bookingDate: string): string {
  const match = bookingDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return bookingDate;
  return `${match[3]} ${match[2]} ${match[1]}`;
}

/** Simple table with a variable number of columns, first column right-padded. */
export function table(rows: string[][]): void {
  const width = Math.max(...rows.map(([left]) => left.length));
  for (const row of rows) {
    const [first, ...rest] = row;
    process.stdout.write(`${first.padEnd(width + 2)}${rest.join('  ')}\n`);
  }
}
