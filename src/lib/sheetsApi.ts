import {
  OrderRow,
  ProductRow,
  ProductsColumnMap,
  SheetConfig,
  SheetTabMeta,
  SpreadsheetSummary,
  colIndexToLetter,
  formatMonthDay,
  parseSheetNumber,
} from '../types';

export class AuthExpiredError extends Error {
  constructor(message = 'Google 登入授權已過期，請重新登入授權。') {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

async function googleFetch(url: string, accessToken: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    throw new AuthExpiredError();
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = json?.error?.message || `Google API 請求失敗 (${res.status})`;
    throw new Error(errMsg);
  }
  return json;
}

function quoteSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

export async function listUserSpreadsheets(accessToken: string): Promise<SpreadsheetSummary[]> {
  const query = encodeURIComponent(
    "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
  );
  const fields = encodeURIComponent('files(id,name,modifiedTime)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=modifiedTime%20desc&pageSize=30`;
  const data = await googleFetch(url, accessToken);
  return data.files || [];
}

export async function getSpreadsheetMetadata(
  accessToken: string,
  spreadsheetId: string
): Promise<{ title: string; sheets: SheetTabMeta[] }> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}?fields=properties.title,sheets.properties(sheetId,title)`;
  const data = await googleFetch(url, accessToken);
  const sheets: SheetTabMeta[] = (data.sheets || []).map((s: any) => ({
    sheetId: s.properties.sheetId,
    title: s.properties.title,
  }));
  return {
    title: data.properties?.title || '未命名試算表',
    sheets,
  };
}

export const DEFAULT_TARGET_SPREADSHEET_NAME = '好市多代購統計表3.0';

export async function findAndConfigureTargetSpreadsheet(
  accessToken: string,
  targetName: string = DEFAULT_TARGET_SPREADSHEET_NAME
): Promise<SheetConfig | null> {
  const query = encodeURIComponent(
    "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false and name contains '好市多代購統計表'"
  );
  const fields = encodeURIComponent('files(id,name,modifiedTime)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=modifiedTime%20desc&pageSize=20`;
  const data = await googleFetch(url, accessToken);
  const files: SpreadsheetSummary[] = data.files || [];

  if (files.length === 0) return null;

  const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  const targetNorm = normalize(targetName);

  const matched =
    files.find((f) => f.name.trim() === targetName) ||
    files.find((f) => normalize(f.name) === targetNorm) ||
    files.find((f) => normalize(f.name).includes('好市多代購統計表3.0')) ||
    files[0];

  if (!matched) return null;

  const meta = await getSpreadsheetMetadata(accessToken, matched.id);
  const ordersSheet =
    meta.sheets.find((s) => s.title === '訂購資料') ||
    meta.sheets.find((s) => s.title.includes('訂購') || s.title.includes('訂單')) ||
    meta.sheets[0];

  if (!ordersSheet) return null;

  const productsSheet =
    meta.sheets.find((s) => s.title === '商品資訊') ||
    meta.sheets.find((s) => s.title.includes('商品')) ||
    null;

  return {
    spreadsheetId: matched.id,
    spreadsheetTitle: meta.title,
    ordersSheetName: ordersSheet.title,
    ordersSheetId: ordersSheet.sheetId,
    productsSheetName: productsSheet ? productsSheet.title : '',
    productsSheetId: productsSheet ? productsSheet.sheetId : null,
  };
}

function detectProductsHeaderAndMap(rawProducts: any[][]): {
  colMap: ProductsColumnMap;
  startIndex: number;
} {
  const defaultMap: ProductsColumnMap = {
    codeCol: 0,
    nameCol: 1,
    categoryCol: 2,
    priceCol: 3,
    hasHeader: true,
  };
  if (!rawProducts || rawProducts.length === 0) {
    return { colMap: defaultMap, startIndex: 0 };
  }

  const scanLimit = Math.min(5, rawProducts.length);
  for (let r = 0; r < scanLimit; r++) {
    const candidate = rawProducts[r];
    if (!candidate || candidate.every((c) => String(c ?? '').trim() === '')) continue;

    const headers = candidate.map((h) => String(h ?? '').trim().toLowerCase());

    const findCol = (patterns: RegExp[], exclude = new Set<number>()): number => {
      for (const pat of patterns) {
        const idx = headers.findIndex((h, i) => !exclude.has(i) && h !== '' && pat.test(h));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const used = new Set<number>();
    const codeCol = findCol(
      [/^商品代號$/, /^商品編號$/, /^代號$/, /^編號$/, /代號|貨號|品號|編號|costco|sku|code/],
      used
    );
    if (codeCol !== -1) used.add(codeCol);

    const nameCol = findCol([/^商品名稱$/, /^品名$/, /名稱|品名|商品$|name|title/], used);
    if (nameCol !== -1) used.add(nameCol);

    const categoryCol = findCol([/^商品分類$/, /^分類$/, /分類|類別|category/], used);
    if (categoryCol !== -1) used.add(categoryCol);

    const priceCol = findCol(
      [/^商品價格$/, /^價格$/, /價格|售價|單價|原價|代購價|金額|price/],
      used
    );
    if (priceCol !== -1) used.add(priceCol);

    const matchedCount =
      (codeCol !== -1 ? 1 : 0) +
      (nameCol !== -1 ? 1 : 0) +
      (categoryCol !== -1 ? 1 : 0) +
      (priceCol !== -1 ? 1 : 0);

    if (matchedCount >= 2) {
      const pickFallback = (preferred: number): number => {
        if (!used.has(preferred)) {
          used.add(preferred);
          return preferred;
        }
        for (let i = 0; i < Math.max(4, headers.length); i++) {
          if (!used.has(i)) {
            used.add(i);
            return i;
          }
        }
        return preferred;
      };

      return {
        colMap: {
          codeCol: codeCol !== -1 ? codeCol : pickFallback(0),
          nameCol: nameCol !== -1 ? nameCol : pickFallback(1),
          categoryCol: categoryCol !== -1 ? categoryCol : pickFallback(2),
          priceCol: priceCol !== -1 ? priceCol : pickFallback(3),
          hasHeader: true,
        },
        startIndex: r + 1,
      };
    }
  }

  // Fallback if no header keywords matched: check whether row 0 looks like data (numeric price in col D)
  const fourthCellNum = parseSheetNumber(rawProducts[0]?.[3]);
  const hasHeader = fourthCellNum === '';
  return {
    colMap: { ...defaultMap, hasHeader },
    startIndex: hasHeader ? 1 : 0,
  };
}

export async function fetchOrdersAndProducts(
  accessToken: string,
  config: SheetConfig
): Promise<{
  rows: OrderRow[];
  dates: string[];
  products: ProductRow[];
  productsColumnMap: ProductsColumnMap;
}> {
  const ordersRange = encodeURIComponent(`${quoteSheetName(config.ordersSheetName)}!A2:O`);
  const renderParams = 'valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING';

  const ordersPromise = googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      config.spreadsheetId
    )}/values/${ordersRange}?${renderParams}`,
    accessToken
  );

  const productsPromise = config.productsSheetName
    ? googleFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          config.spreadsheetId
        )}/values/${encodeURIComponent(
          `${quoteSheetName(config.productsSheetName)}!A1:Z`
        )}?${renderParams}`,
        accessToken
      )
    : Promise.resolve({ values: [] });

  const [ordersRes, productsRes] = await Promise.all([ordersPromise, productsPromise]);

  const rawOrders: any[][] = ordersRes?.values || [];
  const datesSet = new Set<string>();
  const rows: OrderRow[] = [];

  rawOrders.forEach((row, index) => {
    const hasContent = row.some((cell) => String(cell ?? '').trim() !== '');
    if (!hasContent) return;

    const orderDate = row[0] ? formatMonthDay(String(row[0])) : '';
    const purchaseDate = row[1] ? formatMonthDay(String(row[1])) : '';
    const channel = String(row[2] || '').trim();
    const user = String(row[3] || '').trim();
    const code = String(row[4] ?? '').trim();
    const name = String(row[5] ?? '').trim();
    const category = String(row[6] ?? '').trim();
    const qtyRaw = parseSheetNumber(row[7]);
    const priceRaw = parseSheetNumber(row[8]);
    const feeRaw = parseSheetNumber(row[9]);
    const subtotalRaw = parseSheetNumber(row[10]);
    const totalParsed = parseSheetNumber(row[11]);
    const totalRaw = totalParsed === '' ? 0 : totalParsed;
    const shippingChannel = String(row[12] || '').trim();
    const payStatus = String(row[13] || '').trim();
    const orderStatus = String(row[14] || '').trim() || '未買';

    if (
      (orderStatus === '未買' || orderStatus === '已購買' || orderStatus === '缺貨') &&
      shippingChannel !== '線上代購' &&
      purchaseDate
    ) {
      datesSet.add(purchaseDate);
    }

    const rowIndex = index + 2;
    rows.push({
      id: `row_${rowIndex}`,
      originalRowIndex: rowIndex,
      orderDate,
      purchaseDate,
      date: purchaseDate,
      channel: channel || 'LINE',
      user,
      code,
      name,
      category,
      qty: qtyRaw,
      price: priceRaw,
      fee: feeRaw,
      subtotal: subtotalRaw,
      totalAmount: totalRaw,
      shippingChannel,
      payStatus: payStatus || '未付款',
      orderStatus,
      checked: orderStatus === '已購買',
      pickupChecked: orderStatus === '已取',
    });
  });

  const dates = Array.from(datesSet).sort();

  const rawProducts: any[][] = productsRes?.values || [];
  const { colMap, startIndex } = detectProductsHeaderAndMap(rawProducts);

  const products: ProductRow[] = [];
  for (let i = startIndex; i < rawProducts.length; i++) {
    const row = rawProducts[i] || [];
    const code = String(row[colMap.codeCol] ?? '').trim();
    const name = String(row[colMap.nameCol] ?? '').trim();
    const category = String(row[colMap.categoryCol] ?? '').trim();
    const priceParsed = parseSheetNumber(row[colMap.priceCol]);
    const price = priceParsed === '' ? 0 : priceParsed;

    if (code || name) {
      const rowIndex = i + 1;
      products.push({
        id: `prod_${rowIndex}`,
        originalRowIndex: rowIndex,
        code,
        name,
        category,
        price,
      });
    }
  }

  return { rows, dates, products, productsColumnMap: colMap };
}

export async function updateOrderRowsBatch(
  accessToken: string,
  config: SheetConfig,
  rowsToUpdate: OrderRow[]
): Promise<void> {
  if (rowsToUpdate.length === 0) return;

  const existingUpdates = rowsToUpdate.filter((r) => r.originalRowIndex !== null);
  const newRows = rowsToUpdate.filter((r) => r.originalRowIndex === null);

  if (existingUpdates.length > 0) {
    const data = existingUpdates.map((r) => {
      const qtyNum = r.qty !== '' ? Number(r.qty) : '';
      const priceNum = r.price !== '' ? Number(r.price) : '';
      const feeNum = r.fee !== '' ? Number(r.fee) : '';
      const subtotal =
        qtyNum !== '' && priceNum !== '' ? Math.round(Number(qtyNum) * Number(priceNum)) : '';
      const totalAmount = (subtotal !== '' ? subtotal : 0) + (feeNum !== '' ? Number(feeNum) : 0);

      return {
        range: `${quoteSheetName(config.ordersSheetName)}!A${r.originalRowIndex}:O${r.originalRowIndex}`,
        values: [
          [
            r.orderDate || '',
            r.purchaseDate || '',
            r.channel || 'LINE',
            r.user || '',
            r.code || '',
            r.name || '',
            r.category || '',
            qtyNum,
            priceNum,
            feeNum,
            subtotal,
            totalAmount,
            r.shippingChannel || '',
            r.payStatus || '未付款',
            r.orderStatus || '未買',
          ],
        ],
      };
    });

    await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        config.spreadsheetId
      )}/values:batchUpdate`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data,
        }),
      }
    );
  }

  if (newRows.length > 0) {
    const values = newRows.map((r) => {
      const qtyNum = r.qty !== '' ? Number(r.qty) : '';
      const priceNum = r.price !== '' ? Number(r.price) : '';
      const feeNum = r.fee !== '' ? Number(r.fee) : '';
      const subtotal =
        qtyNum !== '' && priceNum !== '' ? Math.round(Number(qtyNum) * Number(priceNum)) : '';
      const totalAmount = (subtotal !== '' ? subtotal : 0) + (feeNum !== '' ? Number(feeNum) : 0);

      return [
        r.orderDate || '',
        r.purchaseDate || '',
        r.channel || 'LINE',
        r.user || '',
        r.code || '',
        r.name || '',
        r.category || '',
        qtyNum,
        priceNum,
        feeNum,
        subtotal,
        totalAmount,
        r.shippingChannel || '',
        r.payStatus || '未付款',
        r.orderStatus || '未買',
      ];
    });

    const appendRange = encodeURIComponent(`${quoteSheetName(config.ordersSheetName)}!A1`);
    await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        config.spreadsheetId
      )}/values/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ values }),
      }
    );
  }
}

export async function deleteSheetRow(
  accessToken: string,
  spreadsheetId: string,
  sheetId: number,
  rowIndex1Based: number
): Promise<void> {
  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex1Based - 1,
                endIndex: rowIndex1Based,
              },
            },
          },
        ],
      }),
    }
  );
}

export async function ensureProductsSheetExists(
  accessToken: string,
  spreadsheetId: string
): Promise<{ sheetId: number; title: string }> {
  const meta = await getSpreadsheetMetadata(accessToken, spreadsheetId);
  const existing = meta.sheets.find((s) => s.title === '商品資訊');
  if (existing) return existing;

  const res = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: { title: '商品資訊' },
            },
          },
        ],
      }),
    }
  );

  const newSheetId = res.replies?.[0]?.addSheet?.properties?.sheetId;
  const headerRange = encodeURIComponent(`'商品資訊'!A1:D1`);
  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${headerRange}?valueInputOption=USER_ENTERED`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify({
        values: [['商品代號', '商品名稱', '商品分類', '商品價格']],
      }),
    }
  );

  return { sheetId: newSheetId, title: '商品資訊' };
}

export async function saveProductsBatch(
  accessToken: string,
  config: SheetConfig,
  productsToSave: ProductRow[]
): Promise<SheetConfig> {
  let activeConfig = { ...config };
  if (!activeConfig.productsSheetName || activeConfig.productsSheetId === null) {
    const ensured = await ensureProductsSheetExists(accessToken, config.spreadsheetId);
    activeConfig = {
      ...activeConfig,
      productsSheetName: ensured.title,
      productsSheetId: ensured.sheetId,
      productsColumnMap: {
        codeCol: 0,
        nameCol: 1,
        categoryCol: 2,
        priceCol: 3,
        hasHeader: true,
      },
    };
  }

  const colMap: ProductsColumnMap = activeConfig.productsColumnMap || {
    codeCol: 0,
    nameCol: 1,
    categoryCol: 2,
    priceCol: 3,
    hasHeader: true,
  };

  const existingUpdates = productsToSave.filter((p) => p.originalRowIndex !== null);
  const newRows = productsToSave.filter((p) => p.originalRowIndex === null);

  const isStandardOrder =
    colMap.codeCol === 0 &&
    colMap.nameCol === 1 &&
    colMap.categoryCol === 2 &&
    colMap.priceCol === 3;

  if (existingUpdates.length > 0) {
    const quotedSheet = quoteSheetName(activeConfig.productsSheetName);
    const data = isStandardOrder
      ? existingUpdates.map((p) => ({
          range: `${quotedSheet}!A${p.originalRowIndex}:D${p.originalRowIndex}`,
          values: [[p.code || '', p.name || '', p.category || '', Number(p.price) || 0]],
        }))
      : existingUpdates.flatMap((p) => {
          const rowIdx = p.originalRowIndex!;
          return [
            {
              range: `${quotedSheet}!${colIndexToLetter(colMap.codeCol)}${rowIdx}`,
              values: [[p.code || '']],
            },
            {
              range: `${quotedSheet}!${colIndexToLetter(colMap.nameCol)}${rowIdx}`,
              values: [[p.name || '']],
            },
            {
              range: `${quotedSheet}!${colIndexToLetter(colMap.categoryCol)}${rowIdx}`,
              values: [[p.category || '']],
            },
            {
              range: `${quotedSheet}!${colIndexToLetter(colMap.priceCol)}${rowIdx}`,
              values: [[Number(p.price) || 0]],
            },
          ];
        });

    await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        activeConfig.spreadsheetId
      )}/values:batchUpdate`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data,
        }),
      }
    );
  }

  if (newRows.length > 0) {
    const maxCol = Math.max(
      colMap.codeCol,
      colMap.nameCol,
      colMap.categoryCol,
      colMap.priceCol
    );
    const values = newRows.map((p) => {
      const rowArr: (string | number)[] = Array(maxCol + 1).fill('');
      rowArr[colMap.codeCol] = p.code || '';
      rowArr[colMap.nameCol] = p.name || '';
      rowArr[colMap.categoryCol] = p.category || '';
      rowArr[colMap.priceCol] = Number(p.price) || 0;
      return rowArr;
    });
    const appendRange = encodeURIComponent(`${quoteSheetName(activeConfig.productsSheetName)}!A1`);
    await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        activeConfig.spreadsheetId
      )}/values/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ values }),
      }
    );
  }

  return activeConfig;
}

export async function createNewBuyingSpreadsheet(
  accessToken: string,
  title: string,
  seedFromCsvText?: string
): Promise<SheetConfig> {
  const created = await googleFetch(
    'https://sheets.googleapis.com/v4/spreadsheets',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        properties: { title },
        sheets: [
          { properties: { title: '訂購資料' } },
          { properties: { title: '商品資訊' } },
        ],
      }),
    }
  );

  const spreadsheetId = created.spreadsheetId;
  const ordersSheet = created.sheets[0].properties;
  const productsSheet = created.sheets[1].properties;

  const ordersHeader = [
    [
      '訂購日期',
      '採購日期',
      '來源管道',
      '客戶姓名',
      '商品代號',
      '商品名稱',
      '商品分類',
      '數量',
      '單價',
      '代購費',
      '小計',
      '應收/應付金額',
      '通路別',
      '付款狀態',
      '訂單狀態',
    ],
  ];

  let orderValues: any[][] = ordersHeader;
  const productMap = new Map<string, [string, string, string, number]>();

  if (seedFromCsvText) {
    const parsedRows = parseCsvLines(seedFromCsvText);
    if (parsedRows.length > 1) {
      orderValues = parsedRows;
      // Also derive unique products into 商品資訊
      for (let i = 1; i < parsedRows.length; i++) {
        const r = parsedRows[i];
        const code = String(r[4] || '').trim();
        const name = String(r[5] || '').trim();
        const category = String(r[6] || '').trim();
        const price = Number(r[8]) || 0;
        if (code || name) {
          const key = `${code.toLowerCase()}|${name}`;
          if (!productMap.has(key) && price > 0) {
            productMap.set(key, [code, name, category, price]);
          }
        }
      }
    }
  }

  const productValues: any[][] = [
    ['商品代號', '商品名稱', '商品分類', '商品價格'],
    ...Array.from(productMap.values()),
  ];

  // Write in chunks if large
  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: `'訂購資料'!A1`,
            values: orderValues,
          },
          {
            range: `'商品資訊'!A1`,
            values: productValues,
          },
        ],
      }),
    }
  );

  return {
    spreadsheetId,
    spreadsheetTitle: title,
    ordersSheetName: ordersSheet.title,
    ordersSheetId: ordersSheet.sheetId,
    productsSheetName: productsSheet.title,
    productsSheetId: productsSheet.sheetId,
  };
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
