import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const CSV_SEED_PATH = path.resolve(__dirname, 'public/assets/aistudio/________3_5080ab49.0');

interface StoredOrderRow {
  id: string;
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
  checked: boolean;
  pickupChecked: boolean;
}

interface StoredProductRow {
  id: string;
  originalRowIndex: number | null;
  code: string;
  name: string;
  category: string;
  price: number | '';
}

interface StoreData {
  rows: StoredOrderRow[];
  products: StoredProductRow[];
  updatedAt: string;
}

function parseCsvLines(csvText: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell);
        cell = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(cell);
        lines.push(row);
        row = [];
        cell = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(cell);
        lines.push(row);
        row = [];
        cell = '';
      } else {
        cell += ch;
      }
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    lines.push(row);
  }
  return lines;
}

function formatMonthDay(dateStr: string): string {
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

function parseNum(val: unknown): number | '' {
  if (val === undefined || val === null || val === '') return '';
  const cleaned = String(val).replace(/[NT$￥元,\s]/gi, '').trim();
  if (!cleaned) return '';
  const n = Number(cleaned);
  return Number.isNaN(n) ? '' : n;
}

function seedFromCsv(): StoreData {
  if (!fs.existsSync(CSV_SEED_PATH)) {
    return { rows: [], products: [], updatedAt: new Date().toISOString() };
  }

  const csvText = fs.readFileSync(CSV_SEED_PATH, 'utf8');
  const parsed = parseCsvLines(csvText);
  const rows: StoredOrderRow[] = [];
  const productMap = new Map<string, { code: string; name: string; category: string; price: number }>();

  for (let i = 1; i < parsed.length; i++) {
    const r = parsed[i];
    if (!r || !r.some((c) => String(c || '').trim() !== '')) continue;

    const orderDate = formatMonthDay(r[0] || '');
    const purchaseDate = formatMonthDay(r[1] || '');
    const channel = String(r[2] || '').trim() || 'LINE';
    const user = String(r[3] || '').trim();
    let code = String(r[4] || '').trim();
    const rawName = String(r[5] || '').trim();
    const category = String(r[6] || '').trim();
    const qty = parseNum(r[7]);
    const price = parseNum(r[8]);
    const fee = parseNum(r[9]);
    const subtotal = parseNum(r[10]);
    const totalParsed = parseNum(r[11]);
    const totalAmount = totalParsed === '' ? 0 : totalParsed;
    const shippingChannel = String(r[12] || '').trim();
    const payStatus = String(r[13] || '').trim() || '未付款';
    const orderStatus = String(r[14] || '').trim() || '未買';

    const rowIndex = i + 1;
    rows.push({
      id: `row_${rowIndex}`,
      originalRowIndex: rowIndex,
      orderDate,
      purchaseDate,
      date: purchaseDate,
      channel,
      user,
      code,
      name: rawName,
      category,
      qty,
      price,
      fee,
      subtotal,
      totalAmount,
      shippingChannel,
      payStatus,
      orderStatus,
      checked: orderStatus === '已購買',
      pickupChecked: orderStatus === '已取',
    });

    // Extract code from #digits inside name if col E is empty
    if (!code) {
      const match = rawName.match(/#(\d+)/);
      if (match) code = `#${match[1]}`;
    }
    const cleanName = rawName.replace(/#\d+/g, '').trim() || rawName;
    if (cleanName || code) {
      const existing = productMap.get(cleanName);
      const numPrice = typeof price === 'number' ? price : 0;
      if (!existing) {
        productMap.set(cleanName, {
          code,
          name: cleanName,
          category,
          price: numPrice,
        });
      } else {
        if (!existing.code && code) existing.code = code;
        if (!existing.category && category) existing.category = category;
        if (numPrice > 0) existing.price = numPrice;
      }
    }
  }

  // Sort coded products first so product codes are immediately visible
  const sortedProductEntries = Array.from(productMap.values()).sort((a, b) => {
    const aHas = a.code ? 1 : 0;
    const bHas = b.code ? 1 : 0;
    if (aHas !== bHas) return bHas - aHas;
    return a.name.localeCompare(b.name, 'zh-Hant');
  });

  const products: StoredProductRow[] = sortedProductEntries.map((p, idx) => {
    const rowIndex = idx + 2;
    return {
      id: `prod_${rowIndex}`,
      originalRowIndex: rowIndex,
      code: p.code,
      name: p.name,
      category: p.category,
      price: p.price,
    };
  });

  return {
    rows,
    products,
    updatedAt: new Date().toISOString(),
  };
}

function readStore(): StoreData {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    const seeded = seedFromCsv();
    fs.writeFileSync(STORE_PATH, JSON.stringify(seeded), 'utf8');
    return seeded;
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    return JSON.parse(raw) as StoreData;
  } catch {
    const seeded = seedFromCsv();
    fs.writeFileSync(STORE_PATH, JSON.stringify(seeded), 'utf8');
    return seeded;
  }
}

function writeStore(data: StoreData): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(STORE_PATH, JSON.stringify(data), 'utf8');
}

function computeDates(rows: StoredOrderRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (
      (r.orderStatus === '未買' || r.orderStatus === '已購買' || r.orderStatus === '缺貨') &&
      r.shippingChannel !== '線上代購' &&
      r.purchaseDate
    ) {
      set.add(formatMonthDay(r.purchaseDate));
    }
  }
  return Array.from(set).sort();
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/data', (_req, res) => {
    const store = readStore();
    res.json({
      rows: store.rows,
      products: store.products,
      dates: computeDates(store.rows),
      updatedAt: store.updatedAt,
    });
  });

  app.post('/api/orders/batch', (req, res) => {
    const incoming: StoredOrderRow[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const store = readStore();

    const byRowIndex = new Map<number, StoredOrderRow>();
    let maxRowIdx = 1;
    for (const r of store.rows) {
      if (r.originalRowIndex !== null) {
        byRowIndex.set(r.originalRowIndex, r);
        if (r.originalRowIndex > maxRowIdx) maxRowIdx = r.originalRowIndex;
      }
    }

    for (const item of incoming) {
      const qtyNum = item.qty !== '' ? Number(item.qty) : '';
      const priceNum = item.price !== '' ? Number(item.price) : '';
      const feeNum = item.fee !== '' ? Number(item.fee) : '';
      const subtotal: number | '' =
        qtyNum !== '' && priceNum !== '' ? Math.round(Number(qtyNum) * Number(priceNum)) : '';
      const totalAmount = (subtotal !== '' ? subtotal : 0) + (feeNum !== '' ? Number(feeNum) : 0);

      if (item.originalRowIndex !== null && byRowIndex.has(item.originalRowIndex)) {
        const updated: StoredOrderRow = {
          ...item,
          id: `row_${item.originalRowIndex}`,
          qty: qtyNum,
          price: priceNum,
          fee: feeNum,
          subtotal,
          totalAmount,
          checked: item.orderStatus === '已購買',
          pickupChecked: item.orderStatus === '已取',
        };
        byRowIndex.set(item.originalRowIndex, updated);
      } else {
        maxRowIdx += 1;
        const created: StoredOrderRow = {
          ...item,
          id: `row_${maxRowIdx}`,
          originalRowIndex: maxRowIdx,
          qty: qtyNum,
          price: priceNum,
          fee: feeNum,
          subtotal,
          totalAmount,
          orderStatus: item.orderStatus || '未買',
          payStatus: item.payStatus || '未付款',
          checked: item.orderStatus === '已購買',
          pickupChecked: item.orderStatus === '已取',
        };
        byRowIndex.set(maxRowIdx, created);
      }
    }

    store.rows = Array.from(byRowIndex.values()).sort(
      (a, b) => (a.originalRowIndex || 0) - (b.originalRowIndex || 0)
    );
    writeStore(store);

    res.json({
      rows: store.rows,
      products: store.products,
      dates: computeDates(store.rows),
      updatedAt: store.updatedAt,
    });
  });

  app.delete('/api/orders/:rowIndex', (req, res) => {
    const rowIndex = Number(req.params.rowIndex);
    if (!Number.isFinite(rowIndex)) {
      res.status(400).json({ error: '無效的訂單列號' });
      return;
    }
    const store = readStore();
    store.rows = store.rows
      .filter((r) => r.originalRowIndex !== rowIndex)
      .map((r) => {
        if (r.originalRowIndex !== null && r.originalRowIndex > rowIndex) {
          const nextIdx = r.originalRowIndex - 1;
          return { ...r, id: `row_${nextIdx}`, originalRowIndex: nextIdx };
        }
        return r;
      });
    writeStore(store);

    res.json({
      rows: store.rows,
      products: store.products,
      dates: computeDates(store.rows),
      updatedAt: store.updatedAt,
    });
  });

  app.post('/api/products/batch', (req, res) => {
    const incoming: StoredProductRow[] = Array.isArray(req.body?.products)
      ? req.body.products
      : [];
    const store = readStore();

    const byRowIndex = new Map<number, StoredProductRow>();
    let maxRowIdx = 1;
    for (const p of store.products) {
      if (p.originalRowIndex !== null) {
        byRowIndex.set(p.originalRowIndex, p);
        if (p.originalRowIndex > maxRowIdx) maxRowIdx = p.originalRowIndex;
      }
    }

    for (const item of incoming) {
      const priceVal = item.price === '' ? 0 : Number(item.price) || 0;
      if (item.originalRowIndex !== null && byRowIndex.has(item.originalRowIndex)) {
        byRowIndex.set(item.originalRowIndex, {
          ...item,
          id: `prod_${item.originalRowIndex}`,
          price: priceVal,
        });
      } else {
        maxRowIdx += 1;
        byRowIndex.set(maxRowIdx, {
          ...item,
          id: `prod_${maxRowIdx}`,
          originalRowIndex: maxRowIdx,
          price: priceVal,
        });
      }
    }

    store.products = Array.from(byRowIndex.values()).sort(
      (a, b) => (a.originalRowIndex || 0) - (b.originalRowIndex || 0)
    );
    writeStore(store);

    res.json({
      rows: store.rows,
      products: store.products,
      dates: computeDates(store.rows),
      updatedAt: store.updatedAt,
    });
  });

  app.delete('/api/products/:rowIndex', (req, res) => {
    const rowIndex = Number(req.params.rowIndex);
    if (!Number.isFinite(rowIndex)) {
      res.status(400).json({ error: '無效的商品列號' });
      return;
    }
    const store = readStore();
    store.products = store.products
      .filter((p) => p.originalRowIndex !== rowIndex)
      .map((p) => {
        if (p.originalRowIndex !== null && p.originalRowIndex > rowIndex) {
          const nextIdx = p.originalRowIndex - 1;
          return { ...p, id: `prod_${nextIdx}`, originalRowIndex: nextIdx };
        }
        return p;
      });
    writeStore(store);

    res.json({
      rows: store.rows,
      products: store.products,
      dates: computeDates(store.rows),
      updatedAt: store.updatedAt,
    });
  });

  app.post('/api/sync-snapshot', (req, res) => {
    const rows: StoredOrderRow[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const products: StoredProductRow[] = Array.isArray(req.body?.products)
      ? req.body.products
      : [];
    const store = readStore();
    if (rows.length > 0 || products.length > 0) {
      store.rows = rows;
      store.products = products;
      writeStore(store);
    }
    res.json({ ok: true, updatedAt: store.updatedAt });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
  });
}

startServer();
