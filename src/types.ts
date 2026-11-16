export type TabId =
  | 'purchase'
  | 'online'
  | 'pickup'
  | 'notice'
  | 'orders'
  | 'history'
  | 'product-db';

export const SOURCE_OPTIONS = ['LINE', 'LINE(私)', 'FB', 'IG', 'Threads'] as const;

export const CATEGORY_OPTIONS = [
  '3C家電',
  '生活用品',
  '零食',
  '箱型飲品',
  '保健生活',
  '麵包',
  '熟食',
  '即飲沖泡',
  '冷藏',
  '冷凍',
  '乾貨',
] as const;

export const STATUS_OPTIONS = ['未買', '已購買', '未取', '已取', '缺貨'] as const;

export const TARGET_CHANNELS = ['LINE', 'LINE(私)', 'IG', 'FB', 'Threads'] as const;

export interface OrderRow {
  /** Local unique React key */
  id: string;
  /** 1-based row index in Google Sheet (row 2 is first data row). null if unsaved new row */
  originalRowIndex: number | null;
  orderDate: string;
  purchaseDate: string;
  date: string;
  channel: string;
  user: string;
  code: string;
  name: string;
  category: string;
  qty: number | '';
  price: number | '';
  fee: number | '';
  subtotal: number | '';
  totalAmount: number;
  shippingChannel: string;
  payStatus: string;
  orderStatus: string;
  /** Local UI state for 現場採購 / 線上代購 */
  checked: boolean;
  /** Local UI state for 待取清單 */
  pickupChecked: boolean;
}

export interface ProductRow {
  id: string;
  originalRowIndex: number | null;
  code: string;
  name: string;
  category: string;
  price: number | '';
}

export interface ProductsColumnMap {
  codeCol: number;
  nameCol: number;
  categoryCol: number;
  priceCol: number;
  hasHeader: boolean;
}

export interface SpreadsheetSummary {
  id: string;
  name: string;
  modifiedTime?: string;
}

export interface SheetTabMeta {
  sheetId: number;
  title: string;
}

export interface SheetConfig {
  spreadsheetId: string;
  spreadsheetTitle: string;
  ordersSheetName: string;
  ordersSheetId: number;
  productsSheetName: string;
  productsSheetId: number | null;
  productsColumnMap?: ProductsColumnMap;
}

export interface NotificationItem {
  code: string;
  name: string;
  qty: number;
  price: number;
  subtotal: number;
  isOutOfStock: boolean;
  orderStatus: string;
}

export interface NotificationUserGroup {
  userName: string;
  items: NotificationItem[];
  totalSubtotal: number;
  totalFee: number;
}

export function parseSheetNumber(val: unknown): number | '' {
  if (val === undefined || val === null || val === '') return '';
  if (typeof val === 'number') return Number.isNaN(val) ? '' : val;
  const cleaned = String(val)
    .replace(/[NT$￥元,\s]/gi, '')
    .trim();
  if (!cleaned) return '';
  const num = Number(cleaned);
  return Number.isNaN(num) ? '' : num;
}

export function colIndexToLetter(colIndex0Based: number): string {
  let n = colIndex0Based + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export function formatMonthDay(dateStr: string): string {
  if (!dateStr) return '';
  const str = String(dateStr).trim();
  const parts = str.split(/[-/]/);
  if (parts.length >= 3) {
    return `${String(parts[1]).padStart(2, '0')}/${String(parts[2].substring(0, 2)).padStart(2, '0')}`;
  }
  if (parts.length === 2) {
    return `${String(parts[0]).padStart(2, '0')}/${String(parts[1]).padStart(2, '0')}`;
  }
  return str;
}

export function getTodayMonthDay(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${month}/${day}`;
}

function resolveMonthDayDate(dateStr: string, now = new Date()): Date | null {
  const formatted = formatMonthDay(dateStr);
  const match = formatted.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  let year = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (month - currentMonth <= -6) {
    year += 1;
  } else if (month - currentMonth >= 6) {
    year -= 1;
  }
  const d = new Date(year, month - 1, day);
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

export function isTodayOrFutureMonthDay(dateStr: string): boolean {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = resolveMonthDayDate(dateStr, now);
  if (!target) return false;
  return target.getTime() >= todayStart.getTime();
}

export function compareMonthDay(a: string, b: string): number {
  const da = resolveMonthDayDate(a);
  const db = resolveMonthDayDate(b);
  if (da && db) return da.getTime() - db.getTime();
  return a.localeCompare(b);
}

export function getChannelColorClass(channel: string): string {
  if (channel === 'LINE') return 'bg-channel-line';
  if (channel === 'LINE(私)') return 'bg-channel-line-private';
  if (channel === 'FB') return 'bg-channel-fb';
  if (channel === 'IG') return 'bg-channel-ig';
  if (channel === 'Threads') return 'bg-channel-threads';
  return '';
}

export function getCategoryBadgeClass(category: string): string {
  if (category === '3C家電') return 'badge-3c';
  if (category === '生活用品') return 'badge-life';
  if (category === '零食') return 'badge-snack';
  if (category === '箱型飲品') return 'badge-drink-box';
  if (category === '保健生活') return 'badge-health';
  if (category === '麵包') return 'badge-bakery';
  if (category === '熟食') return 'badge-cooked';
  if (category === '即飲沖泡') return 'badge-instant';
  if (category === '冷藏') return 'badge-chilled';
  if (category === '冷凍') return 'badge-frozen';
  if (category === '乾貨') return 'badge-dry';
  return 'badge-default';
}

export function getNextPurchaseDate(currentDate: string, sortedDates: string[]): string {
  if (sortedDates && sortedDates.length > 0) {
    for (let i = 0; i < sortedDates.length; i++) {
      if (sortedDates[i] > currentDate) {
        return sortedDates[i];
      }
    }
  }
  if (currentDate) {
    const parts = currentDate.split('/');
    if (parts.length === 2) {
      const year = new Date().getFullYear();
      const d = new Date(year, Number(parts[0]) - 1, Number(parts[1]));
      if (!Number.isNaN(d.getTime())) {
        d.setDate(d.getDate() + 7);
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${m}/${day}`;
      }
    }
  }
  return currentDate;
}

export function stripHashPrefix(code: string): string {
  return code ? code.replace(/^#+/, '').trim() : '';
}

export function parseSpreadsheetIdFromInput(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];
  return trimmed;
}
