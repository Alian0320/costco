import React, { useMemo, useState } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  CATEGORY_OPTIONS,
  OrderRow,
  ProductRow,
  SOURCE_OPTIONS,
  STATUS_OPTIONS,
  formatMonthDay,
  getChannelColorClass,
  stripHashPrefix,
} from '../types';

interface HistoryTabProps {
  allRows: OrderRow[];
  products: ProductRow[];
  dirtyRowIds: Set<string>;
  onUpdateRow: (updatedRow: OrderRow) => void;
  onSaveHistoryChanges: (rowsToSave: OrderRow[]) => void;
  syncStatus: string;
}

const PAGE_SIZE = 60;

export const HistoryTab: React.FC<HistoryTabProps> = ({
  allRows,
  products,
  dirtyRowIds,
  onUpdateRow,
  onSaveHistoryChanges,
  syncStatus,
}) => {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [page, setPage] = useState(1);

  const existingUsers = useMemo(
    () => Array.from(new Set(allRows.map((r) => r.user).filter(Boolean))).sort(),
    [allRows]
  );

  const existingProductNames = useMemo(
    () => Array.from(new Set(products.map((p) => p.name).filter(Boolean))).sort(),
    [products]
  );

  const filteredRows = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    const list = allRows.filter((r) => r.originalRowIndex !== null);
    const reversed = [...list].reverse();
    if (!kw) return reversed;
    return reversed.filter(
      (row) =>
        (row.code && row.code.toLowerCase().includes(kw)) ||
        (row.user && row.user.toLowerCase().includes(kw)) ||
        (row.name && row.name.toLowerCase().includes(kw)) ||
        (row.category && row.category.toLowerCase().includes(kw)) ||
        (row.orderStatus && row.orderStatus.toLowerCase().includes(kw))
    );
  }, [allRows, searchKeyword]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, safePage]);

  const recalcAmounts = (row: OrderRow): OrderRow => {
    const qtyNum = row.qty !== '' ? Number(row.qty) : 0;
    const priceNum = row.price !== '' ? Number(row.price) : 0;
    const feeNum = row.fee !== '' ? Number(row.fee) : 0;
    const subtotal =
      row.qty !== '' && row.price !== '' ? Math.round(qtyNum * priceNum) : '';
    const totalAmount = (subtotal !== '' ? subtotal : 0) + feeNum;
    return { ...row, subtotal, totalAmount };
  };

  const handleFieldChange = (row: OrderRow, field: keyof OrderRow, value: any) => {
    let next = { ...row, [field]: value };

    if (field === 'code') {
      const codeVal = stripHashPrefix(String(value)).toLowerCase();
      if (codeVal) {
        const found = products.find(
          (p) => stripHashPrefix(p.code).toLowerCase() === codeVal
        );
        if (found) {
          next.name = found.name;
          if (found.category) next.category = found.category;
          next.price = found.price;
        }
      }
    } else if (field === 'name') {
      const nameVal = String(value).trim().toLowerCase();
      if (nameVal) {
        const found = products.find((p) => p.name.toLowerCase() === nameVal);
        if (found) {
          next.code = found.code;
          if (found.category) next.category = found.category;
          next.price = found.price;
        }
      }
    }

    if (field === 'purchaseDate') {
      next.date = value;
    }

    next = recalcAmounts(next);
    onUpdateRow(next);
  };

  const handleSaveClick = () => {
    const rowsToSave = allRows.filter(
      (r) => r.originalRowIndex !== null && dirtyRowIds.has(r.id)
    );
    onSaveHistoryChanges(rowsToSave);
  };

  return (
    <div className="space-y-3">
      {/* Header & Search Panel */}
      <section className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs sm:p-4">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-slate-800">📜 歷史訂單紀錄</h2>
            <span className="text-xs font-medium text-slate-500 tabular-nums">
              共 {filteredRows.length.toLocaleString()} 筆
            </span>
          </div>
          {syncStatus && <span className="text-xs font-medium text-slate-500">{syncStatus}</span>}
        </div>

        <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-white">
          <span className="flex items-center bg-slate-50 px-3 text-slate-500">
            <Search className="h-4 w-4" />
          </span>
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => {
              setSearchKeyword(e.target.value);
              setPage(1);
            }}
            placeholder="輸入商品代號、客戶姓名、商品名稱、分類或狀態搜尋..."
            className="flex-1 bg-white px-2.5 py-2 text-sm focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              setSearchKeyword('');
              setPage(1);
            }}
            className="border-l border-slate-300 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
          >
            清除
          </button>
        </div>

        {totalPages > 1 && (
          <div className="mt-2.5 flex items-center justify-between text-xs font-bold text-slate-600 tabular-nums">
            <span>
              第 {safePage} / {totalPages} 頁（每頁 {PAGE_SIZE} 筆）
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> 上一頁
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-50 disabled:opacity-40"
              >
                下一頁 <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </section>

      <datalist id="historyExistingUsers">
        {existingUsers.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <datalist id="historyExistingProducts">
        {existingProductNames.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      {/* History Table */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="max-h-[calc(100vh-285px)] overflow-auto">
          {pageRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">無符合的歷史訂單紀錄。</div>
          ) : (
            <table className="w-full min-w-[1060px] table-fixed border-collapse text-center align-middle">
              <thead className="sticky top-0 z-10 bg-slate-900 text-white">
                <tr className="text-xs font-bold">
                  <th className="w-[56px] whitespace-nowrap border-r border-slate-700 px-1 py-2">訂購日</th>
                  <th className="w-[56px] whitespace-nowrap border-r border-slate-700 px-1 py-2">採購日</th>
                  <th className="w-[82px] whitespace-nowrap border-r border-slate-700 px-1 py-2">來源</th>
                  <th className="w-[86px] whitespace-nowrap border-r border-slate-700 px-1 py-2">客戶</th>
                  <th className="w-[74px] whitespace-nowrap border-r border-slate-700 px-1 py-2">代號</th>
                  <th className="whitespace-nowrap border-r border-slate-700 px-2 py-2 text-left">
                    商品名稱
                  </th>
                  <th className="w-[90px] whitespace-nowrap border-r border-slate-700 px-1 py-2">分類</th>
                  <th className="w-[46px] whitespace-nowrap border-r border-slate-700 px-1 py-2">數量</th>
                  <th className="w-[60px] whitespace-nowrap border-r border-slate-700 px-1 py-2">單價</th>
                  <th className="w-[52px] whitespace-nowrap border-r border-slate-700 px-1 py-2">代購</th>
                  <th className="w-[58px] whitespace-nowrap border-r border-slate-700 px-1 py-2 text-right">
                    小計
                  </th>
                  <th className="w-[64px] whitespace-nowrap border-r border-slate-700 px-1 py-2 text-right">
                    總額
                  </th>
                  <th className="w-[78px] whitespace-nowrap border-r border-slate-700 px-1 py-2">付款</th>
                  <th className="w-[74px] whitespace-nowrap px-1 py-2">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {pageRows.map((row) => {
                  const qtyNum = Number(row.qty) || 0;
                  const priceNum = Number(row.price) || 0;
                  const feeNum = Number(row.fee) || 0;
                  const subtotal = Math.round(qtyNum * priceNum);
                  const totalAmount = subtotal + feeNum;
                  const isPaid = row.payStatus === '已轉帳' || row.payStatus === '已付款';
                  const isDirty = dirtyRowIds.has(row.id);
                  const noSpinnerCls =
                    '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

                  return (
                    <tr
                      key={row.id}
                      className={isDirty ? 'bg-[#d1e7dd]/40' : 'bg-white hover:bg-slate-50'}
                    >
                      <td className="border-r border-slate-200 p-1">
                        <input
                          type="text"
                          value={formatMonthDay(row.orderDate)}
                          placeholder="MM/DD"
                          onChange={(e) => handleFieldChange(row, 'orderDate', e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-0.5 py-1 text-center tabular-nums focus:border-[#0d6efd] focus:outline-none"
                        />
                      </td>
                      <td className="border-r border-slate-200 p-1">
                        <input
                          type="text"
                          value={formatMonthDay(row.purchaseDate)}
                          placeholder="MM/DD"
                          onChange={(e) => handleFieldChange(row, 'purchaseDate', e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-0.5 py-1 text-center tabular-nums focus:border-[#0d6efd] focus:outline-none"
                        />
                      </td>
                      <td className="border-r border-slate-200 p-1">
                        <select
                          value={row.channel}
                          onChange={(e) => handleFieldChange(row, 'channel', e.target.value)}
                          className={`w-full rounded border border-slate-300 px-0.5 py-1 focus:border-[#0d6efd] focus:outline-none ${getChannelColorClass(
                            row.channel
                          )}`}
                        >
                          {SOURCE_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="border-r border-slate-200 p-1">
                        <input
                          type="text"
                          list="historyExistingUsers"
                          value={row.user}
                          placeholder="姓名"
                          onChange={(e) => handleFieldChange(row, 'user', e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-1 py-1 font-bold focus:border-[#0d6efd] focus:outline-none"
                        />
                      </td>
                      <td className="border-r border-slate-200 p-1">
                        <input
                          type="text"
                          value={row.code}
                          placeholder="代號"
                          onChange={(e) => handleFieldChange(row, 'code', e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-1 py-1 text-center font-bold text-[#0d6efd] tabular-nums focus:border-[#0d6efd] focus:outline-none"
                        />
                      </td>
                      <td className="border-r border-slate-200 p-1">
                        <input
                          type="text"
                          list="historyExistingProducts"
                          value={row.name}
                          placeholder="商品名稱"
                          onChange={(e) => handleFieldChange(row, 'name', e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-left font-bold focus:border-[#0d6efd] focus:outline-none"
                        />
                      </td>
                      <td className="border-r border-slate-200 p-1">
                        <select
                          value={row.category}
                          onChange={(e) => handleFieldChange(row, 'category', e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-0.5 py-1 focus:border-[#0d6efd] focus:outline-none"
                        >
                          <option value="">未分類</option>
                          {!CATEGORY_OPTIONS.includes(row.category as any) && row.category && (
                            <option value={row.category}>{row.category}</option>
                          )}
                          {CATEGORY_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="border-r border-slate-200 p-1">
                        <input
                          type="number"
                          step="any"
                          min={0}
                          value={row.qty}
                          onChange={(e) =>
                            handleFieldChange(
                              row,
                              'qty',
                              e.target.value === '' ? '' : Number(e.target.value)
                            )
                          }
                          className={`w-full rounded border border-slate-300 bg-white px-0.5 py-1 text-center tabular-nums focus:border-[#0d6efd] focus:outline-none ${noSpinnerCls}`}
                        />
                      </td>
                      <td className="border-r border-slate-200 p-1">
                        <input
                          type="number"
                          min={0}
                          value={row.price}
                          onChange={(e) =>
                            handleFieldChange(
                              row,
                              'price',
                              e.target.value === '' ? '' : Number(e.target.value)
                            )
                          }
                          className={`w-full rounded border border-slate-300 bg-white px-0.5 py-1 text-center tabular-nums focus:border-[#0d6efd] focus:outline-none ${noSpinnerCls}`}
                        />
                      </td>
                      <td className="border-r border-slate-200 p-1">
                        <input
                          type="number"
                          min={0}
                          value={row.fee}
                          onChange={(e) =>
                            handleFieldChange(
                              row,
                              'fee',
                              e.target.value === '' ? '' : Number(e.target.value)
                            )
                          }
                          className={`w-full rounded border border-slate-300 bg-white px-0.5 py-1 text-center tabular-nums focus:border-[#0d6efd] focus:outline-none ${noSpinnerCls}`}
                        />
                      </td>
                      <td className="border-r border-slate-200 px-1.5 py-1 text-right font-bold tabular-nums">
                        {subtotal}
                      </td>
                      <td className="border-r border-slate-200 px-1.5 py-1 text-right font-bold text-[#dc3545] tabular-nums">
                        {totalAmount}
                      </td>
                      <td className="border-r border-slate-200 p-1">
                        <select
                          value={row.payStatus}
                          onChange={(e) => handleFieldChange(row, 'payStatus', e.target.value)}
                          className={`w-full rounded border border-slate-300 bg-white px-0.5 py-1 font-bold focus:border-[#0d6efd] focus:outline-none ${
                            isPaid ? 'text-[#198754]' : 'text-[#dc3545]'
                          }`}
                        >
                          <option value="未付款">未付款</option>
                          <option value="已轉帳">已轉帳</option>
                          {row.payStatus === '已付款' && <option value="已付款">已付款</option>}
                        </select>
                      </td>
                      <td className="p-1">
                        <select
                          value={row.orderStatus}
                          onChange={(e) => handleFieldChange(row, 'orderStatus', e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-0.5 py-1 font-bold focus:border-[#0d6efd] focus:outline-none"
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
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
          <button
            type="button"
            onClick={handleSaveClick}
            className="whitespace-nowrap rounded-lg bg-[#198754] px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#157347] sm:text-base"
          >
            💾 儲存變更 {dirtyRowIds.size > 0 ? `(${dirtyRowIds.size})` : ''}
          </button>
          <span className="hidden text-xs font-medium text-slate-500 sm:inline">
            修改狀態或金額後點擊左側按鈕寫回試算表
          </span>
        </div>
      </div>
    </div>
  );
};
