export function generatePolicyNo(): string {
  const now = new Date();
  const timestamp = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `POL${timestamp}${random}`;
}

export function generateClaimNo(): string {
  const now = new Date();
  const timestamp = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `CLM${timestamp}${random}`;
}

export function getDateAfterDays(dateStr: string, days: number): Date {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date;
}

export function getDaysDifference(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function isDateWithinRange(dateStr: string, days: number): boolean {
  const targetDate = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  futureDate.setHours(23, 59, 59, 999);
  return targetDate >= now && targetDate <= futureDate;
}

export function getCurrentDateString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}
