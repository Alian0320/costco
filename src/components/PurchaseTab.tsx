import React, { useMemo } from 'react';
import {
  CATEGORY_OPTIONS,
  OrderRow,
  ProductRow,
  formatMonthDay,
  getCategoryBadgeClass,
  getNextPurchaseDate,
  stripHashPrefix,
} from '../types';

interface PurchaseTabProps {
  isOnline: boolean;
  allRows: OrderRow[];
  products: ProductRow[];
  availableDates: string[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  dirtyRowIds: Set<string>;
  onUpdateRows: (updatedRows: OrderRow[], markDirtyIds: string[]) => void;
  onRequestSavePending: () => void;
  onRequestCompletePurchase: (purchasedRows: OrderRow[], oosRows: OrderRow[]) => void;
  syncStatus: string;
}

interface GroupedPurchaseItem {
  key: string;
  code: string;
  name: string;
  category: string;
  price: number | '';
  totalQty: number;
  subRows: OrderRow[];
  userQtyMap: Record<string, number>;
  isOutOfStock: boolean;
  allChecked: boolean;
}

export const PurchaseTab: React.FC<PurchaseTabProps> = ({
  isOnline,
  allRows,
  products,
  availableDates,
  selectedDate,
  onSelectDate,
  dirtyRowIds,
  onUpdateRows,
  onRequestSavePending,
  onRequestCompletePurchase,
  syncStatus,
}) => {
  const formattedSelectedDate = formatMonthDay(selectedDate);

  const filteredRows = useMemo(() => {
    return allRows.filter((row) => {
      const rowPurchaseDate = formatMonthDay(row.purchaseDate || row.date);
      const isStatusMatch =
        row.orderStatus === '未買' ||
        row.orderStatus === '已購買' ||
        row.orderStatus === '缺貨';
      if (!isStatusMatch) return false;

      if (isOnline) {
        return row.shippingChannel === '線上代購';
      }
      return rowPurchaseDate === formattedSelectedDate && row.shippingChannel !== '線上代購';
    });
  }, [allRows, isOnline, formattedSelectedDate]);

  const totalExpected = useMemo(
    () => filteredRows.reduce((sum, r) => sum + Number(r.qty || 0), 0),
    [filteredRows]
  );

  const actualCount = useMemo(
    () =>
      filteredRows
        .filter((r) => r.orderStatus === '已購買')
        .reduce((sum, r) => sum + Number(r.qty || 0), 0),
    [filteredRows]
  );

  const categoryMap = useMemo(() => {
    const map: Record<string, number> = {};
    filteredRows.forEach((row) => {
      const cat = row.category || '未分類';
      const qty = Number(row.qty || 0);
      map[cat] = (map[cat] || 0) + qty;
    });
    return map;
  }, [filteredRows]);

  const groupedItems = useMemo<GroupedPurchaseItem[]>(() => {
    const map: Record<string, GroupedPurchaseItem> = {};
    filteredRows.forEach((row) => {
      const key = `${row.code ? stripHashPrefix(row.code).toLowerCase() : ''}|${
        row.name ? row.name.trim() : ''
      }`;
      if (!map[key]) {
        map[key] = {
          key,
          code: row.code,
          name: row.name,
          category: row.category,
          price: row.price,
          totalQty: 0,
          subRows: [],
          userQtyMap: {},
          isOutOfStock: row.orderStatus === '缺貨',
          allChecked: false,
        };
      }
      const group = map[key];
      const q = Number(row.qty || 0);
      group.totalQty += q;
      group.subRows.push(row);
      const userKey = row.user || '未具名';
      group.userQtyMap[userKey] = (group.userQtyMap[userKey] || 0) + q;
      if (row.orderStatus === '缺貨') {
        group.isOutOfStock = true;
      }
    });

    const arr = Object.values(map).map((g) => ({
      ...g,
      allChecked: g.subRows.length > 0 && g.subRows.every((r) => r.checked || r.orderStatus === '已購買'),
      isOutOfStock: g.subRows.some((r) => r.orderStatus === '缺貨'),
    }));

    arr.sort((a, b) => {
      let idxA = CATEGORY_OPTIONS.indexOf(a.category as any);
      let idxB = CATEGORY_OPTIONS.indexOf(b.category as any);
      if (idxA === -1) idxA = 999;
      if (idxB === -1) idxB = 999;
      if (idxA !== idxB) return idxA - idxB;
      return (a.name || '').localeCompare(b.name || '', 'zh-Hant');
    });

    return arr;
  }, [filteredRows]);

  const handleToggleCheck = (group: GroupedPurchaseItem, isChecked: boolean) => {
    const targetStatus = isChecked ? '已購買' : '未買';
    const updated = group.subRows.map((r) => ({
      ...r,
      checked: isChecked,
      orderStatus: targetStatus,
    }));
    onUpdateRows(
      updated,
      updated.map((r) => r.id)
    );
  };

  const handleToggleOos = (group: GroupedPurchaseItem, isOos: boolean) => {
    const targetStatus = isOos ? '缺貨' : '未買';
    const updated = group.subRows.map((r) => ({
      ...r,
      checked: false,
      orderStatus: targetStatus,
    }));
    onUpdateRows(
      updated,
      updated.map((r) => r.id)
    );
  };

  const handlePriceChange = (group: GroupedPurchaseItem, newVal: string) => {
    const priceNum: number | '' = newVal === '' ? '' : Number(newVal);
    const updated: OrderRow[] = group.subRows.map((r) => {
      const qtyNum = Number(r.qty || 0);
      const pNum = Number(priceNum || 0);
      const feeNum = Number(r.fee || 0);
      const subtotal: number | '' =
        priceNum !== '' && r.qty !== '' ? Math.round(qtyNum * pNum) : '';
      const totalAmount = (subtotal !== '' ? subtotal : 0) + feeNum;
      return {
        ...r,
        price: priceNum,
        subtotal,
        totalAmount,
      };
    });
    onUpdateRows(
      updated,
      updated.map((r) => r.id)
    );
  };

  const handleCodeChange = (group: GroupedPurchaseItem, newCode: string) => {
    const codeVal = newCode.trim();
    const normalizedInput = stripHashPrefix(codeVal).toLowerCase();
    const foundProduct = normalizedInput
      ? products.find((p) => stripHashPrefix(p.code).toLowerCase() === normalizedInput)
      : undefined;

    const updated: OrderRow[] = group.subRows.map((r) => {
      const nextPrice: number | '' = foundProduct ? foundProduct.price : r.price;
      const qtyNum = Number(r.qty || 0);
      const pNum = Number(nextPrice || 0);
      const feeNum = Number(r.fee || 0);
      const subtotal: number | '' =
        nextPrice !== '' && r.qty !== '' ? Math.round(qtyNum * pNum) : '';
      const totalAmount = (subtotal !== '' ? subtotal : 0) + feeNum;

      return {
        ...r,
        code: codeVal,
        name: foundProduct ? foundProduct.name : r.name,
        category: foundProduct && foundProduct.category ? foundProduct.category : r.category,
        price: nextPrice,
        subtotal,
        totalAmount,
      };
    });

    onUpdateRows(
      updated,
      updated.map((r) => r.id)
    );
  };

  const handleCompleteClick = () => {
    const allAllDates = Array.from(
      new Set(allRows.map((r) => formatMonthDay(r.purchaseDate)).filter(Boolean))
    ).sort();

    const purchasedRows: OrderRow[] = [];
    const oosRows: OrderRow[] = [];

    groupedItems.forEach((group) => {
      if (group.isOutOfStock) {
        group.subRows.forEach((row) => {
          const nextDate = getNextPurchaseDate(
            formatMonthDay(row.purchaseDate || row.date),
            allAllDates
          );
          oosRows.push({
            ...row,
            purchaseDate: nextDate,
            date: nextDate,
            orderStatus: '未買',
            checked: false,
          });
        });
      } else if (group.allChecked) {
        group.subRows.forEach((row) => {
          purchasedRows.push({
            ...row,
            orderStatus: '未取',
            checked: false,
            pickupChecked: false,
          });
        });
      }
    });

    onRequestCompletePurchase(purchasedRows, oosRows);
  };

  const dirtyCount = dirtyRowIds.size;

  return (
    <div className="space-y-3">
      {/* Header Summary Panel */}
      <section className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <h2 className={`text-base font-bold ${isOnline ? 'text-slate-900' : 'text-[#0d6efd]'}`}>
              {isOnline ? '🌐 線上代購清單' : '🛒 現場採購清單'}
            </h2>
            <span className="text-xs font-medium text-slate-500">
              {isOnline ? '全部未買' : `${groupedItems.length} 項商品`}
            </span>
          </div>
          {syncStatus && <span className="text-xs font-medium text-slate-500">{syncStatus}</span>}
        </div>

        {/* Date selector bar (現場採購 only) */}
        {!isOnline && (
          <div className="mt-3">
            <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {availableDates.length === 0 ? (
                <span className="text-sm text-slate-500">目前無待採購日期</span>
              ) : (
                availableDates.map((d) => {
                  const isActive = d === selectedDate;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => onSelectDate(d)}
                      className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-bold tabular-nums transition ${
                        isActive
                          ? 'bg-[#0d6efd] text-white shadow-xs'
                          : 'border border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      {formatMonthDay(d)}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* KPI Metrics Strip */}
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-center">
            <span className="block text-xs font-medium text-slate-500">總項目數</span>
            <span className="mt-0.5 block text-xl font-bold text-slate-900 tabular-nums">
              {totalExpected}
            </span>
          </div>
          <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-center">
            <span className="block text-xs font-medium text-slate-500">
              {isOnline ? '已實際訂購' : '已實際採購'}
            </span>
            <span className="mt-0.5 block text-xl font-bold text-[#198754] tabular-nums">
              {actualCount}
            </span>
          </div>
        </div>

        {/* Category breakdown grid */}
        <div className="mt-3 pt-2.5 border-t border-slate-100">
          <span className="mb-1.5 block text-xs font-bold text-slate-500">
            {isOnline ? '各分類訂購數量' : '各分類採購數量'}
          </span>
          {Object.keys(categoryMap).length === 0 ? (
            <span className="text-xs text-slate-400">無分類資料</span>
          ) : (
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6 lg:flex lg:flex-wrap">
              {CATEGORY_OPTIONS.filter((cat) => categoryMap[cat]).map((cat) => (
                <div
                  key={cat}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 lg:min-w-[96px]"
                >
                  <span className="truncate text-xs font-medium text-slate-600">{cat}</span>
                  <span className="shrink-0 text-sm font-bold text-slate-900 tabular-nums">
                    {categoryMap[cat]}
                  </span>
                </div>
              ))}
              {categoryMap['未分類'] ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 lg:min-w-[96px]">
                  <span className="truncate text-xs font-medium text-slate-600">未分類</span>
                  <span className="shrink-0 text-sm font-bold text-slate-900 tabular-nums">
                    {categoryMap['未分類']}
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>

      {/* Main Purchase Table */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="max-h-[calc(100vh-290px)] overflow-auto">
          {groupedItems.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              目前無{isOnline ? '線上代購' : '現場採購'}項目（
              {isOnline ? '全部未買' : formattedSelectedDate || '無日期'}）。
            </div>
          ) : (
            <table className="w-full border-collapse text-center align-middle">
              <thead className="sticky top-0 z-10 bg-slate-900 text-white">
                <tr className="text-sm font-bold">
                  <th className="w-[64px] whitespace-nowrap px-2 py-2.5">勾選</th>
                  <th className="w-[64px] whitespace-nowrap px-2 py-2.5">缺貨</th>
                  <th className="w-[64px] whitespace-nowrap px-2 py-2.5">數量</th>
                  <th className="w-[105px] whitespace-nowrap px-2 py-2.5">單價</th>
                  <th className="w-[130px] whitespace-nowrap px-2 py-2.5">商品代號</th>
                  <th className="min-w-[200px] whitespace-nowrap px-3 py-2.5 text-left">商品名稱</th>
                  <th className="w-[96px] whitespace-nowrap px-2 py-2.5">分類</th>
                  <th className="min-w-[180px] whitespace-nowrap px-3 py-2.5 text-left">訂購人</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[0.98rem]">
                {groupedItems.map((group, idx) => {
                  const userParts = Object.entries(group.userQtyMap).map(
                    ([u, q]) => `${u} [${q}]`
                  );
                  const userDisplay = userParts.join('、');
                  const cleanCode = stripHashPrefix(group.code);
                  const rowBg = group.allChecked
                    ? 'bg-[#d1e7dd]/75 line-through text-slate-600'
                    : group.isOutOfStock
                    ? 'bg-[#fff3cd]'
                    : idx % 2 === 1
                    ? 'bg-slate-50/70'
                    : 'bg-white';

                  return (
                    <tr key={group.key} className={`${rowBg} transition-colors hover:bg-slate-100/80`}>
                      <td className="whitespace-nowrap px-2 py-2.5">
                        <input
                          type="checkbox"
                          checked={group.allChecked}
                          onChange={(e) => handleToggleCheck(group, e.target.checked)}
                          className="h-5 w-5 cursor-pointer rounded border-slate-400 accent-[#0d6efd]"
                        />
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5">
                        <input
                          type="checkbox"
                          checked={group.isOutOfStock}
                          onChange={(e) => handleToggleOos(group, e.target.checked)}
                          className="h-5 w-5 cursor-pointer rounded border-slate-700 accent-[#ffc107]"
                        />
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 font-bold text-[#0d6efd] tabular-nums">
                        {group.totalQty}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          value={group.price === '' ? '' : group.price}
                          onChange={(e) => handlePriceChange(group, e.target.value)}
                          className="w-full min-w-[82px] rounded-md border border-slate-300 bg-white px-2 py-1 text-center text-[0.95rem] font-bold text-[#dc3545] tabular-nums focus:border-[#0d6efd] focus:outline-none focus:ring-2 focus:ring-[#0d6efd]/15"
                        />
                      </td>
                      <td className="whitespace-nowrap px-2 py-2">
                        <input
                          type="text"
                          value={cleanCode}
                          placeholder="代號"
                          onChange={(e) => handleCodeChange(group, e.target.value)}
                          className="w-full min-w-[96px] rounded-md border border-slate-300 bg-white px-2 py-1 text-center text-[0.95rem] font-bold text-[#0d6efd] tabular-nums focus:border-[#0d6efd] focus:outline-none focus:ring-2 focus:ring-[#0d6efd]/15"
                        />
                      </td>
                      <td className="min-w-[200px] whitespace-normal px-3 py-2.5 text-left font-bold leading-snug text-slate-900">
                        {group.name || ''}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5">
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${getCategoryBadgeClass(
                            group.category
                          )}`}
                        >
                          {group.category || '未分類'}
                        </span>
                      </td>
                      <td className="min-w-[180px] whitespace-normal px-3 py-2.5 text-left text-sm font-medium leading-snug text-slate-600 tabular-nums">
                        {userDisplay}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Floating Bottom Action Bar */}
      <div className="floating-bottom-bar">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCompleteClick}
              className="whitespace-nowrap rounded-lg bg-[#198754] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#157347] sm:px-5 sm:text-base"
            >
              {isOnline ? '✅ 訂購完成' : '✅ 購買完成'}
            </button>
            {dirtyCount > 0 && (
              <button
                type="button"
                onClick={onRequestSavePending}
                className="whitespace-nowrap rounded-lg border border-[#0d6efd] bg-white px-3 py-2 text-xs font-bold text-[#0d6efd] transition hover:bg-[#e7f1ff] sm:text-sm"
              >
                💾 同步暫存 ({dirtyCount})
              </button>
            )}
          </div>
          <span className="hidden text-xs font-medium text-slate-500 sm:inline">
            勾選完畢後點擊左側按鈕寫入試算表
          </span>
        </div>
      </div>
    </div>
  );
};
