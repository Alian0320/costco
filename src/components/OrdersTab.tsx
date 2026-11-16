import React, { useMemo, useState } from 'react';
import { Copy, Search, Trash2 } from 'lucide-react';
import {
  CATEGORY_OPTIONS,
  OrderRow,
  ProductRow,
  SOURCE_OPTIONS,
  formatMonthDay,
  getChannelColorClass,
  getTodayMonthDay,
  stripHashPrefix,
} from '../types';

interface OrdersTabProps {
  allRows: OrderRow[];
  products: ProductRow[];
  dirtyRowIds: Set<string>;
  onUpdateRow: (updatedRow: OrderRow) => void;
  onAddNewRow: (newRow: OrderRow) => void;
  onDeleteRow: (row: OrderRow) => void;
  onSaveAllOrders: (rowsToSave: OrderRow[]) => void;
  syncStatus: string;
}

export const OrdersTab: React.FC<OrdersTabProps> = ({
  allRows,
  products,
  dirtyRowIds,
  onUpdateRow,
  onAddNewRow,
  onDeleteRow,
  onSaveAllOrders,
  syncStatus,
}) => {
  const [searchKeyword, setSearchKeyword] = useState('');

  const unboughtAll = useMemo(
    () => allRows.filter((row) => row.orderStatus === '未買'),
    [allRows]
  );

  const allExistingUsers = useMemo(
    () => Array.from(new Set(allRows.map((r) => r.user).filter(Boolean))).sort(),
    [allRows]
  );

  const allExistingProductNames = useMemo(
    () => Array.from(new Set(products.map((p) => p.name).filter(Boolean))).sort(),
    [products]
  );

  const displayedRows = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    let list = unboughtAll.filter((r) => {
      if (r.originalRowIndex === null) return true;
      if (!kw) return true;
      return (
        (r.code && r.code.toLowerCase().includes(kw)) ||
        (r.user && r.user.toLowerCase().includes(kw)) ||
        (r.name && r.name.toLowerCase().includes(kw)) ||
        (r.category && r.category.toLowerCase().includes(kw)) ||
        (r.channel && r.channel.toLowerCase().includes(kw)) ||
        (r.orderDate && formatMonthDay(r.orderDate).toLowerCase().includes(kw)) ||
        (r.purchaseDate && formatMonthDay(r.purchaseDate).toLowerCase().includes(kw)) ||
        (r.payStatus && r.payStatus.toLowerCase().includes(kw))
      );
    });

    list = [...list].sort((a, b) => {
      if (a.originalRowIndex === null && b.originalRowIndex !== null) return -1;
      if (a.originalRowIndex !== null && b.originalRowIndex === null) return 1;
      if (a.originalRowIndex === null && b.originalRowIndex === null) {
        return b.id.localeCompare(a.id);
      }

      const pDateA = a.purchaseDate || '';
      const pDateB = b.purchaseDate || '';
      if (pDateA !== pDateB) return pDateA.localeCompare(pDateB);

      const chanA = a.channel || '';
      const chanB = b.channel || '';
      if (chanA !== chanB) return chanA.localeCompare(chanB, 'zh-Hant');

      const userA = a.user || '';
      const userB = b.user || '';
      if (userA !== userB) return userA.localeCompare(userB, 'zh-Hant');

      return (a.name || '').localeCompare(b.name || '', 'zh-Hant');
    });

    return list;
  }, [unboughtAll, searchKeyword]);

  const duplicateCounts = useMemo(() => {
    const map: Record<string, number> = {};
    displayedRows.forEach((row) => {
      const key = `${(row.user || '').trim()}_${(row.name || '').trim()}_${row.qty ?? ''}_${
        row.orderDate || ''
      }`;
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [displayedRows]);

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

  const handleAddEmpty = () => {
    const newRow: OrderRow = {
      id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      originalRowIndex: null,
      orderDate: getTodayMonthDay(),
      purchaseDate: '',
      date: '',
      channel: 'LINE',
      user: '',
      code: '',
      name: '',
      category: '生活用品',
      qty: '',
      price: '',
      fee: '',
      subtotal: '',
      totalAmount: 0,
      shippingChannel: '',
      payStatus: '未付款',
      orderStatus: '未買',
      checked: false,
      pickupChecked: false,
    };
    onAddNewRow(newRow);
  };

  const handleDuplicate = (row: OrderRow) => {
    const copied: OrderRow = {
      ...row,
      id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      originalRowIndex: null,
      user: '',
    };
    onAddNewRow(copied);
  };

  const handleSaveClick = () => {
    const rowsToSave = displayedRows.filter(
      (r) =>
        (r.originalRowIndex === null || dirtyRowIds.has(r.id)) &&
        (r.user || r.name || r.code)
    );
    onSaveAllOrders(rowsToSave);
  };

  const noSpinnerCls =
    '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

  return (
    <div className="space-y-3">
      {/* Header & Quick Search Panel */}
      <section className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs sm:p-4">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-slate-900">📋 訂單資料</h2>
            <span className="text-xs font-medium text-slate-500 tabular-nums">
              未買清單 {displayedRows.length} 筆
              {dirtyRowIds.size > 0 ? ` · 待儲存 ${dirtyRowIds.size} 筆` : ''}
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
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="輸入商品代號、客戶姓名、商品名稱、分類、日期或管道快速搜尋..."
            className="flex-1 bg-white px-2.5 py-2 text-sm focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setSearchKeyword('')}
            className="border-l border-slate-300 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
          >
            清除
          </button>
        </div>
      </section>

      {/* Datalists */}
      <datalist id="existingUsers">
        {allExistingUsers.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <datalist id="existingProducts">
        {allExistingProductNames.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      {/* Compact Fit-Width Editable Orders Table */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="max-h-[calc(100vh-260px)] overflow-auto">
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
                <th className="w-[38px] whitespace-nowrap border-r border-slate-700 px-1 py-2">線上</th>
                <th className="w-[44px] whitespace-nowrap border-r border-slate-700 px-1 py-2">轉帳</th>
                <th className="w-[62px] whitespace-nowrap px-1 py-2">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {displayedRows.length === 0 ? (
                <tr>
                  <td colSpan={15} className="p-8 text-center text-sm text-slate-500">
                    目前無符合條件的未買訂單。
                  </td>
                </tr>
              ) : (
                displayedRows.map((row) => {
                  const key = `${(row.user || '').trim()}_${(row.name || '').trim()}_${
                    row.qty ?? ''
                  }_${row.orderDate || ''}`;
                  const isDuplicate = duplicateCounts[key] > 1;
                  const isNew = row.originalRowIndex === null;
                  const isDirty = dirtyRowIds.has(row.id);

                  const qtyVal = row.qty !== '' ? Number(row.qty) : null;
                  const priceVal = row.price !== '' ? Number(row.price) : null;
                  const feeVal = row.fee !== '' ? Number(row.fee) : 0;
                  const subtotal =
                    qtyVal !== null && priceVal !== null ? Math.round(qtyVal * priceVal) : '';
                  const totalAmount = (subtotal !== '' ? subtotal : 0) + feeVal;

                  const rowBg = isDuplicate
                    ? 'bg-[#fff3cd]'
                    : isNew
                    ? 'bg-[#e7f1ff]/65'
                    : isDirty
                    ? 'bg-[#d1e7dd]/35'
                    : 'bg-white hover:bg-slate-50';

                  return (
                    <tr key={row.id} className={rowBg}>
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
                          list="existingUsers"
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
                      <td className="border-r border-slate-200 p-1 text-left">
                        <div className="flex items-center gap-1">
                          {isDuplicate && (
                            <span className="shrink-0 rounded bg-[#dc3545] px-1 py-0.5 text-[11px] font-bold text-white">
                              重複
                            </span>
                          )}
                          <input
                            type="text"
                            list="existingProducts"
                            value={row.name}
                            placeholder="商品名稱"
                            onChange={(e) => handleFieldChange(row, 'name', e.target.value)}
                            className="w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-left font-bold focus:border-[#0d6efd] focus:outline-none"
                          />
                        </div>
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
                        <input
                          type="checkbox"
                          checked={row.shippingChannel === '線上代購'}
                          onChange={(e) =>
                            handleFieldChange(
                              row,
                              'shippingChannel',
                              e.target.checked ? '線上代購' : ''
                            )
                          }
                          className="h-4 w-4 cursor-pointer accent-[#0d6efd]"
                        />
                      </td>
                      <td className="border-r border-slate-200 p-1">
                        <input
                          type="checkbox"
                          checked={row.payStatus === '已轉帳'}
                          onChange={(e) =>
                            handleFieldChange(
                              row,
                              'payStatus',
                              e.target.checked ? '已轉帳' : '未付款'
                            )
                          }
                          className="h-4 w-4 cursor-pointer accent-[#198754]"
                        />
                      </td>
                      <td className="whitespace-nowrap p-1">
                        <button
                          type="button"
                          title="複製此筆訂單"
                          onClick={() => handleDuplicate(row)}
                          className="mr-0.5 inline-flex items-center rounded border border-[#198754] p-1 text-[#198754] hover:bg-[#198754] hover:text-white"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="刪除"
                          onClick={() => onDeleteRow(row)}
                          className="inline-flex items-center rounded border border-[#dc3545] p-1 text-[#dc3545] hover:bg-[#dc3545] hover:text-white"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Floating Bottom Action Bar */}
      <div className="floating-bottom-bar">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleAddEmpty}
            className="whitespace-nowrap rounded-lg border border-[#0d6efd] bg-white px-3.5 py-2 text-sm font-bold text-[#0d6efd] shadow-2xs transition hover:bg-[#e7f1ff] sm:text-base"
          >
            ➕ 新增一筆
          </button>
          <button
            type="button"
            onClick={handleSaveClick}
            className="whitespace-nowrap rounded-lg bg-[#198754] px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#157347] sm:text-base"
          >
            💾 修改完成
          </button>
        </div>
      </div>
    </div>
  );
};
