import React, { useMemo, useState } from 'react';
import { OrderRow, stripHashPrefix } from '../types';

interface PickupTabProps {
  allRows: OrderRow[];
  dirtyRowIds: Set<string>;
  onUpdateRows: (updatedRows: OrderRow[], markDirtyIds: string[]) => void;
  onRequestSavePending: () => void;
  onRequestMarkPickedUp: (pickedRows: OrderRow[]) => void;
  syncStatus: string;
}

export const PickupTab: React.FC<PickupTabProps> = ({
  allRows,
  dirtyRowIds,
  onUpdateRows,
  onRequestSavePending,
  onRequestMarkPickedUp,
  syncStatus,
}) => {
  const [selectedUser, setSelectedUser] = useState('');

  const allUnpicked = useMemo(
    () => allRows.filter((row) => row.orderStatus === '未取'),
    [allRows]
  );

  const unpickedUsers = useMemo(
    () => Array.from(new Set(allUnpicked.map((r) => r.user).filter(Boolean))).sort(),
    [allUnpicked]
  );

  const filteredRows = useMemo(() => {
    if (!selectedUser) return allUnpicked;
    return allUnpicked.filter((r) => r.user === selectedUser);
  }, [allUnpicked, selectedUser]);

  const userGroups = useMemo(() => {
    const map: Record<
      string,
      { user: string; rows: OrderRow[]; totalQty: number; activeAmount: number }
    > = {};

    filteredRows.forEach((row) => {
      const userKey = row.user || '未具名';
      if (!map[userKey]) {
        map[userKey] = { user: userKey, rows: [], totalQty: 0, activeAmount: 0 };
      }
      map[userKey].rows.push(row);
      const rowAmt = Number(row.totalAmount || 0);
      map[userKey].totalQty += Number(row.qty || 0);
      if (row.payStatus !== '已轉帳') {
        map[userKey].activeAmount += rowAmt;
      }
    });

    return Object.values(map);
  }, [filteredRows]);

  const handleToggleRowPickup = (row: OrderRow, isChecked: boolean) => {
    onUpdateRows([{ ...row, pickupChecked: isChecked }], [row.id]);
  };

  const handleToggleRowPay = (row: OrderRow, isPaid: boolean) => {
    onUpdateRows(
      [{ ...row, payStatus: isPaid ? '已轉帳' : '未付款' }],
      [row.id]
    );
  };

  const handleToggleGroupPickup = (rows: OrderRow[], isChecked: boolean) => {
    const updated = rows.map((r) => ({ ...r, pickupChecked: isChecked }));
    onUpdateRows(
      updated,
      updated.map((r) => r.id)
    );
  };

  const handleToggleGroupPay = (rows: OrderRow[], isPaid: boolean) => {
    const payStatus = isPaid ? '已轉帳' : '未付款';
    const updated = rows.map((r) => ({ ...r, payStatus }));
    onUpdateRows(
      updated,
      updated.map((r) => r.id)
    );
  };

  const handleMarkPickedUp = () => {
    const pickedRows = allUnpicked
      .filter((r) => r.pickupChecked)
      .map((r) => ({
        ...r,
        orderStatus: '已取',
        payStatus: r.payStatus || '已轉帳',
      }));
    onRequestMarkPickedUp(pickedRows);
  };

  const dirtyCount = dirtyRowIds.size;

  return (
    <div className="space-y-3">
      {/* Header & Filter Panel */}
      <section className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs sm:p-4">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-[#198754]">📦 待取清單</h2>
            <span className="text-xs font-medium text-slate-500 tabular-nums">
              {userGroups.length} 位客戶 · {filteredRows.length} 項商品
            </span>
          </div>
          {syncStatus && <span className="text-xs font-medium text-slate-500">{syncStatus}</span>}
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
          <span className="text-xs font-bold text-slate-600">客戶篩選</span>
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="min-w-[180px] flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-bold text-slate-900 focus:border-[#0d6efd] focus:outline-none"
          >
            <option value="">👤 全部客戶 (待取)</option>
            {unpickedUsers.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSelectedUser('')}
            className="whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
          >
            重設篩選
          </button>
        </div>
      </section>

      {/* Pickup Table */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="max-h-[calc(100vh-260px)] overflow-auto">
          {userGroups.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              目前沒有符合條件的待取項目。
            </div>
          ) : (
            <table className="w-full border-collapse text-center align-middle">
              <thead className="sticky top-0 z-10 bg-slate-900 text-white">
                <tr className="text-sm font-bold">
                  <th className="w-[76px] whitespace-nowrap px-2.5 py-3">取貨勾選</th>
                  <th className="w-[76px] whitespace-nowrap px-2.5 py-3">已轉帳</th>
                  <th className="min-w-[240px] whitespace-nowrap px-3 py-3 text-left">細分商品名稱</th>
                  <th className="w-[110px] whitespace-nowrap px-3 py-3">數量</th>
                  <th className="w-[130px] whitespace-nowrap px-3 py-3 text-right">金額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-base">
                {userGroups.map((group) => {
                  const groupAllChecked = group.rows.every((r) => r.pickupChecked);
                  const groupAllPaid = group.rows.every((r) => r.payStatus === '已轉帳');

                  return (
                    <React.Fragment key={group.user}>
                      {/* Customer Group Header */}
                      <tr className="bg-slate-100 font-bold">
                        <td className="px-2.5 py-3">
                          <input
                            type="checkbox"
                            checked={groupAllChecked}
                            onChange={(e) =>
                              handleToggleGroupPickup(group.rows, e.target.checked)
                            }
                            className="h-6 w-6 cursor-pointer rounded accent-[#0d6efd]"
                          />
                        </td>
                        <td className="px-2.5 py-3">
                          <input
                            type="checkbox"
                            checked={groupAllPaid}
                            onChange={(e) =>
                              handleToggleGroupPay(group.rows, e.target.checked)
                            }
                            className="h-6 w-6 cursor-pointer rounded accent-[#198754]"
                          />
                        </td>
                        <td colSpan={3} className="px-3 py-2.5 text-left text-slate-900">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-lg font-bold">👤 {group.user}</span>
                            <div className="flex items-center gap-3 tabular-nums">
                              <span className="text-lg font-bold text-slate-700">
                                總計 {group.totalQty} 件
                              </span>
                              <span className="text-slate-300">·</span>
                              <span className="text-lg font-bold text-[#dc3545]">
                                總金額 ${group.activeAmount.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* Child Item Rows */}
                      {group.rows.map((row) => {
                        const cleanCode = stripHashPrefix(row.code);
                        const isPaid = row.payStatus === '已轉帳';

                        return (
                          <tr
                            key={row.id}
                            className={`transition-colors ${
                              row.pickupChecked
                                ? 'bg-[#d1e7dd]/75 line-through text-slate-500'
                                : 'bg-white hover:bg-slate-50'
                            }`}
                          >
                            <td className="px-2.5 py-3">
                              <input
                                type="checkbox"
                                checked={row.pickupChecked}
                                onChange={(e) =>
                                  handleToggleRowPickup(row, e.target.checked)
                                }
                                className="h-6 w-6 cursor-pointer rounded accent-[#0d6efd]"
                              />
                            </td>
                            <td className="px-2.5 py-3">
                              <input
                                type="checkbox"
                                checked={isPaid}
                                onChange={(e) => handleToggleRowPay(row, e.target.checked)}
                                className="h-6 w-6 cursor-pointer rounded accent-[#198754]"
                              />
                            </td>
                            <td className="min-w-[220px] whitespace-normal px-3 py-2.5 text-left text-sm font-bold leading-snug text-slate-900">
                              <span className="mr-1.5 text-slate-400">└</span>
                              <span>{row.name || ''}</span>
                              {cleanCode && (
                                <span className="ml-2 text-xs font-semibold text-slate-500 tabular-nums">
                                  #{cleanCode}
                                </span>
                              )}
                              {row.shippingChannel === '線上代購' && (
                                <span className="ml-2 rounded bg-[#cff4fc] px-1.5 py-0.5 text-xs font-bold text-[#055160]">
                                  線上
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-sm font-bold text-[#0d6efd] tabular-nums">
                              {row.qty || 0} 件
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm font-bold text-[#dc3545] tabular-nums">
                              ${Number(row.totalAmount || 0).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
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
              onClick={handleMarkPickedUp}
              className="whitespace-nowrap rounded-lg bg-[#0d6efd] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#0b5ed7] sm:px-5 sm:text-base"
            >
              🎉 取貨完成
            </button>
            {dirtyCount > 0 && (
              <button
                type="button"
                onClick={onRequestSavePending}
                className="whitespace-nowrap rounded-lg border border-[#198754] bg-white px-3 py-2 text-xs font-bold text-[#198754] transition hover:bg-[#d1e7dd] sm:text-sm"
              >
                💾 同步轉帳/勾選 ({dirtyCount})
              </button>
            )}
          </div>
          <span className="hidden text-xs font-medium text-slate-500 sm:inline">
            勾選完成後點擊左側按鈕更新為「已取」
          </span>
        </div>
      </div>
    </div>
  );
};
