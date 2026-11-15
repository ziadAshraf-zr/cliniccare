/**
 * أدوات تنسيق مشتركة عبر الواجهة (القسم 6 من الخطة التقنية):
 * - كل الأوقات تُعرض بتوقيت العيادة (Africa/Cairo) بصرف النظر عن توقيت المتصفح.
 * - الأرقام الطبية (قياسات، جرعات، تواريخ) تُعرض دائمًا بأرقام لاتينية (0-9)
 *   حتى في الواجهة العربية، لتفادي التباس الأرقام الهندية الشرقية في
 *   سياق طبي حسّاس.
 */

export const CLINIC_TIMEZONE = 'Africa/Cairo';

function toDate(value: Date | string): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

export function formatMedicalNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, { numberingSystem: 'latn', ...options }).format(value);
}

export function formatClinicDate(value: Date | string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: CLINIC_TIMEZONE,
    numberingSystem: 'latn',
    dateStyle: 'medium',
  }).format(toDate(value));
}

export function formatClinicTime(value: Date | string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: CLINIC_TIMEZONE,
    numberingSystem: 'latn',
    timeStyle: 'short',
  }).format(toDate(value));
}

export function formatClinicDateTime(value: Date | string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: CLINIC_TIMEZONE,
    numberingSystem: 'latn',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(toDate(value));
}
