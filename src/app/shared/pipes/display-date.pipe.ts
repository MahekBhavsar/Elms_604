import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'displayDate',
  standalone: true
})
export class DisplayDatePipe implements PipeTransform {
  transform(value: unknown): string {
    const parsed = this.parseDate(value);
    if (!parsed) return '';

    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const year = parsed.getFullYear();
    return `${day}/${month}/${year}`;
  }

  private parseDate(value: unknown): Date | null {
    if (!value) return null;

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    const raw = String(value).trim();
    if (!raw) return null;

    // YYYY-MM-DD or YYYY/MM/DD
    const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (iso) {
      const y = Number(iso[1]);
      const m = Number(iso[2]) - 1;
      const d = Number(iso[3]);
      const date = new Date(y, m, d);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    // M/D/YYYY or MM/DD/YYYY
    const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) {
      const m = Number(slash[1]) - 1;
      const d = Number(slash[2]);
      const y = Number(slash[3]);
      const date = new Date(y, m, d);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
}
