import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { OrderRow, ProductRow, ProductsColumnMap, TabId } from './types';
import { ConfirmDialog, ConfirmDialogProps } from './components/ConfirmDialog';
import { PurchaseTab } from './components/PurchaseTab';
import { PickupTab } from './components/PickupTab';
import { NoticeTab } from './components/NoticeTab';
import { OrdersTab } from './components/OrdersTab';
import { HistoryTab } from './components/HistoryTab';
import { ProductDbTab } from './components/ProductDbTab';

const DEFAULT_PRODUCTS_COL_MAP: ProductsColumnMap = {
  codeCol: 0,
  nameCol: 1,
  categoryCol: 2,
  priceCol: 3,
  hasHeader: true,
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'purchase', label: '🛒 現場採購' },
  { id: 'online', label: '🌐 線上代購' },
  { id: 'pickup', label: '📦 待取清單' },
  { id: 'notice', label: '📢 取貨通知' },
  { id: 'orders', label: '📋 訂單資料' },
  { id: 'history', label: '📜 歷史訂單' },
  { id: 'product-db', label: '🏷️ 商品資訊' },
];

export default function App() {
  const [currentTab, setCurrentTab] = useState<TabId>('purchase');
  const [allRows, setAllRows] = useState<OrderRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productsColumnMap] = useState<ProductsColumnMap>(DEFAULT_PRODUCTS_COL_MAP);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');

  const [dirtyRowIds, setDirtyRowIds] = useState<Set<string>>(new Set());
  const [dirtyProductIds, setDirtyProductIds] = useState<Set<string>>(new Set());

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [syncStatus, setSyncStatus] = useState('');
  const [toast, setToast] = useState<{ type: 'error' | 'info' | 'success'; message: string } | null>(
    null
  );

  const [confirmState, setConfirmState] = useState<
    Omit<ConfirmDialogProps, 'onCancel'> & { open: boolean }
  >({
    open: false,
    title: '',
    description: '',
    details: [],
    onConfirm: () => {},
  });
  const [isMutating, setIsMutating] = useState(false);

  const showToast = useCallback((type: 'error' | 'info' | 'success', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3800);
  }, []);

  const applyLoadedPayload = useCallback(
    (payload: { rows: OrderRow[]; products: ProductRow[]; dates: string[] }) => {
      setAllRows(payload.rows);
      setProducts(payload.products);
      setAvailableDates(payload.dates);
      setDirtyRowIds(new Set());
      setDirtyProductIds(new Set());
      setSelectedDate((prev) => {
        if (payload.dates.length === 0) return '';
        if (prev && payload.dates.includes(prev)) return prev;
        return payload.dates[0];
      });
    },
    []
  );

  const loadData = useCallback(
    async (silent = false) => {
      if (!silent) {
        setIsLoadingData(true);
        setSyncStatus('⏳ 讀取資料中...');
      }
      try {
        const res = await fetch('/api/data');
        if (!res.ok) {
          throw new Error(`讀取資料失敗 (${res.status})`);
        }
        const json = await res.json();
        applyLoadedPayload({
          rows: json.rows || [],
          products: json.products || [],
          dates: json.dates || [],
        });
        if (!silent) {
          setSyncStatus('✨ 已同步');
          setTimeout(() => setSyncStatus(''), 1800);
        }
      } catch (err: any) {
        setSyncStatus('❌ 載入失敗');
        showToast('error', err?.message || '讀取資料失敗');
      } finally {
        setIsLoadingData(false);
      }
    },
    [applyLoadedPayload, showToast]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- Row mutation helpers ---
  const handleUpdateMultipleRows = (updatedRows: OrderRow[], markDirtyIds: string[]) => {
    const updateMap = new Map(updatedRows.map((r) => [r.id, r]));
    setAllRows((prev) => prev.map((r) => updateMap.get(r.id) || r));
    setDirtyRowIds((prev) => {
      const next = new Set(prev);
      markDirtyIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleUpdateSingleOrderRow = (updated: OrderRow) => {
    setAllRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setDirtyRowIds((prev) => {
      const next = new Set(prev);
      next.add(updated.id);
      return next;
    });
  };

  const handleAddNewOrderRow = (newRow: OrderRow) => {
    setAllRows((prev) => [newRow, ...prev]);
    setDirtyRowIds((prev) => {
      const next = new Set(prev);
      next.add(newRow.id);
      return next;
    });
  };

  const executeOrderBatchUpdate = async (rowsToWrite: OrderRow[], successMessage: string) => {
    setIsMutating(true);
    setSyncStatus('⏳ 儲存變更中...');
    try {
      const res = await fetch('/api/orders/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rowsToWrite }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error || `儲存訂單失敗 (${res.status})`);
      }
      const json = await res.json();
      applyLoadedPayload({
        rows: json.rows || [],
        products: json.products || [],
        dates: json.dates || [],
      });
      setConfirmState((s) => ({ ...s, open: false }));
      setSyncStatus('✨ 已儲存');
      setTimeout(() => setSyncStatus(''), 1800);
      showToast('success', successMessage);
    } catch (err: any) {
      setSyncStatus('❌ 儲存失敗');
      showToast('error', err?.message || '儲存訂單資料失敗');
    } finally {
      setIsMutating(false);
    }
  };

  const handleRequestSavePending = () => {
    const rowsToWrite = allRows.filter((r) => dirtyRowIds.has(r.id));
    if (rowsToWrite.length === 0) {
      showToast('info', '目前沒有尚未儲存的變更。');
      return;
    }
    executeOrderBatchUpdate(rowsToWrite, `已儲存 ${rowsToWrite.length} 筆暫存變更`);
  };

  const handleRequestCompletePurchase = (purchasedRows: OrderRow[], oosRows: OrderRow[]) => {
    const totalCount = purchasedRows.length + oosRows.length;
    if (totalCount === 0) {
      showToast('info', '請先勾選已完成購買的商品，或是勾選缺貨的商品！');
      return;
    }

    const touchedIds = new Set([...purchasedRows, ...oosRows].map((r) => r.id));
    const extraDirty = allRows.filter((r) => dirtyRowIds.has(r.id) && !touchedIds.has(r.id));
    const allToWrite = [...purchasedRows, ...oosRows, ...extraDirty];

    executeOrderBatchUpdate(
      allToWrite,
      `已更新 ${purchasedRows.length} 筆轉入未取、${oosRows.length} 筆缺貨遞延`
    );
  };

  const handleRequestMarkPickedUp = (pickedRows: OrderRow[]) => {
    if (pickedRows.length === 0) {
      showToast('info', '請先勾選已完成取貨的項目！');
      return;
    }

    const pickedIds = new Set(pickedRows.map((r) => r.id));
    const extraDirty = allRows.filter((r) => dirtyRowIds.has(r.id) && !pickedIds.has(r.id));
    const allToWrite = [...pickedRows, ...extraDirty];

    executeOrderBatchUpdate(allToWrite, `已完成 ${pickedRows.length} 筆取貨並儲存`);
  };

  const handleRequestSaveOrders = (rowsToSave: OrderRow[]) => {
    if (rowsToSave.length === 0) {
      showToast('info', '目前沒有需要儲存或新增的訂單修改。');
      return;
    }
    executeOrderBatchUpdate(rowsToSave, `已儲存 ${rowsToSave.length} 筆訂單變更`);
  };

  const handleRequestDeleteOrder = (row: OrderRow) => {
    if (row.originalRowIndex === null) {
      setAllRows((prev) => prev.filter((r) => r.id !== row.id));
      setDirtyRowIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      return;
    }

    setConfirmState({
      open: true,
      title: '確認刪除訂單',
      description: `確定要永久刪除第 ${row.originalRowIndex} 列的訂單嗎？此動作無法復原。`,
      details: [`客戶：${row.user || '未具名'}`, `商品：${row.name || row.code}`, `數量：${row.qty}`],
      confirmLabel: '永久刪除',
      variant: 'danger',
      onConfirm: async () => {
        setIsMutating(true);
        setSyncStatus('⏳ 刪除訂單中...');
        try {
          const res = await fetch(`/api/orders/${row.originalRowIndex}`, {
            method: 'DELETE',
          });
          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson?.error || '刪除訂單失敗');
          }
          const json = await res.json();
          applyLoadedPayload({
            rows: json.rows || [],
            products: json.products || [],
            dates: json.dates || [],
          });
          setConfirmState((s) => ({ ...s, open: false }));
          setSyncStatus('');
          showToast('success', '已永久刪除該筆訂單');
        } catch (err: any) {
          showToast('error', err?.message || '刪除訂單失敗');
        } finally {
          setIsMutating(false);
        }
      },
    });
  };

  const handleRequestSaveHistory = (rowsToSave: OrderRow[]) => {
    if (rowsToSave.length === 0) {
      showToast('info', '目前沒有修改任何歷史訂單紀錄。');
      return;
    }
    executeOrderBatchUpdate(rowsToSave, `已更新 ${rowsToSave.length} 筆歷史訂單`);
  };

  // --- Product DB helpers ---
  const handleUpdateProduct = (updated: ProductRow) => {
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setDirtyProductIds((prev) => {
      const next = new Set(prev);
      next.add(updated.id);
      return next;
    });
  };

  const handleBulkUpdateProducts = (updatedProducts: ProductRow[]) => {
    if (updatedProducts.length === 0) {
      showToast('info', '目前沒有可從品名或訂購紀錄自動對應的新商品代號。');
      return;
    }
    const updateMap = new Map(updatedProducts.map((p) => [p.id, p]));
    setProducts((prev) => prev.map((p) => updateMap.get(p.id) || p));
    setDirtyProductIds((prev) => {
      const next = new Set(prev);
      updatedProducts.forEach((p) => next.add(p.id));
      return next;
    });
    showToast(
      'success',
      `已自動補齊 ${updatedProducts.length} 筆商品代號，請點擊「💾 儲存變更」確認寫入！`
    );
  };

  const handleAddNewProduct = (newProd: ProductRow) => {
    setProducts((prev) => [newProd, ...prev]);
    setDirtyProductIds((prev) => {
      const next = new Set(prev);
      next.add(newProd.id);
      return next;
    });
  };

  const handleRequestDeleteProduct = (prod: ProductRow) => {
    if (prod.originalRowIndex === null) {
      setProducts((prev) => prev.filter((p) => p.id !== prod.id));
      setDirtyProductIds((prev) => {
        const next = new Set(prev);
        next.delete(prod.id);
        return next;
      });
      return;
    }

    setConfirmState({
      open: true,
      title: '確認刪除商品資訊',
      description: `確定要從「商品資訊」永久刪除第 ${prod.originalRowIndex} 列的商品嗎？`,
      details: [
        `商品代號：${prod.code || '(空白)'}`,
        `商品名稱：${prod.name}`,
        `價格：$${prod.price === '' ? 0 : prod.price}`,
      ],
      confirmLabel: '永久刪除',
      variant: 'danger',
      onConfirm: async () => {
        setIsMutating(true);
        try {
          const res = await fetch(`/api/products/${prod.originalRowIndex}`, {
            method: 'DELETE',
          });
          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson?.error || '刪除商品失敗');
          }
          const json = await res.json();
          applyLoadedPayload({
            rows: json.rows || [],
            products: json.products || [],
            dates: json.dates || [],
          });
          setConfirmState((s) => ({ ...s, open: false }));
          showToast('success', '已刪除商品資訊');
        } catch (err: any) {
          showToast('error', err?.message || '刪除商品失敗');
        } finally {
          setIsMutating(false);
        }
      },
    });
  };

  const handleRequestSaveProducts = async (productsToSave: ProductRow[]) => {
    if (productsToSave.length === 0) {
      showToast('info', '目前沒有需要儲存或新增的商品資訊。');
      return;
    }
    setIsMutating(true);
    setSyncStatus('⏳ 儲存商品中...');
    try {
      const res = await fetch('/api/products/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: productsToSave }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error || '儲存商品失敗');
      }
      const json = await res.json();
      applyLoadedPayload({
        rows: json.rows || [],
        products: json.products || [],
        dates: json.dates || [],
      });
      setSyncStatus('✨ 商品已儲存');
      setTimeout(() => setSyncStatus(''), 1800);
      showToast('success', `已儲存 ${productsToSave.length} 筆商品資訊`);
    } catch (err: any) {
      setSyncStatus('❌ 儲存失敗');
      showToast('error', err?.message || '儲存商品失敗');
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] px-2.5 py-2.5 sm:px-5 sm:py-3">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed right-4 top-4 z-50 flex max-w-sm items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold shadow-lg ${
            toast.type === 'error'
              ? 'border-[#f5c2c7] bg-[#f8d7da] text-[#842029]'
              : toast.type === 'success'
              ? 'border-[#badbcc] bg-[#d1e7dd] text-[#0f5132]'
              : 'border-[#b6effb] bg-[#cff4fc] text-[#055160]'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Sticky 7-Tab Navigation Bar */}
      <nav aria-label="功能分頁" className="sticky-nav mb-3">
        <ul className="no-scrollbar flex flex-nowrap gap-1 overflow-x-auto overflow-y-hidden whitespace-nowrap rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-xs backdrop-blur-xs">
          {TABS.map((tab) => {
            const isActive = currentTab === tab.id;
            return (
              <li key={tab.id} className="flex-none">
                <button
                  type="button"
                  onClick={() => setCurrentTab(tab.id)}
                  className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-bold transition ${
                    isActive
                      ? 'bg-[#0d6efd] text-white shadow-xs'
                      : 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Active Tab Content */}
      {isLoadingData && allRows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm font-medium text-slate-500 shadow-xs">
          資料載入中...
        </div>
      ) : (
        <>
          {(currentTab === 'purchase' || currentTab === 'online') && (
            <PurchaseTab
              isOnline={currentTab === 'online'}
              allRows={allRows}
              products={products}
              availableDates={availableDates}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              dirtyRowIds={dirtyRowIds}
              onUpdateRows={handleUpdateMultipleRows}
              onRequestSavePending={handleRequestSavePending}
              onRequestCompletePurchase={handleRequestCompletePurchase}
              syncStatus={syncStatus}
            />
          )}

          {currentTab === 'pickup' && (
            <PickupTab
              allRows={allRows}
              dirtyRowIds={dirtyRowIds}
              onUpdateRows={handleUpdateMultipleRows}
              onRequestSavePending={handleRequestSavePending}
              onRequestMarkPickedUp={handleRequestMarkPickedUp}
              syncStatus={syncStatus}
            />
          )}

          {currentTab === 'notice' && (
            <NoticeTab
              allRows={allRows}
              availableDates={availableDates}
              onRefresh={() => loadData(false)}
            />
          )}

          {currentTab === 'orders' && (
            <OrdersTab
              allRows={allRows}
              products={products}
              dirtyRowIds={dirtyRowIds}
              onUpdateRow={handleUpdateSingleOrderRow}
              onAddNewRow={handleAddNewOrderRow}
              onDeleteRow={handleRequestDeleteOrder}
              onSaveAllOrders={handleRequestSaveOrders}
              syncStatus={syncStatus}
            />
          )}

          {currentTab === 'history' && (
            <HistoryTab
              allRows={allRows}
              products={products}
              dirtyRowIds={dirtyRowIds}
              onUpdateRow={handleUpdateSingleOrderRow}
              onSaveHistoryChanges={handleRequestSaveHistory}
              syncStatus={syncStatus}
            />
          )}

          {currentTab === 'product-db' && (
            <ProductDbTab
              products={products}
              allRows={allRows}
              productsSheetName="商品資訊"
              productsColumnMap={productsColumnMap}
              dirtyProductIds={dirtyProductIds}
              onUpdateProduct={handleUpdateProduct}
              onBulkUpdateProducts={handleBulkUpdateProducts}
              onAddNewProduct={handleAddNewProduct}
              onDeleteProduct={handleRequestDeleteProduct}
              onSaveProducts={handleRequestSaveProducts}
              syncStatus={syncStatus}
            />
          )}
        </>
      )}

      {/* Confirmation Dialog for permanent deletions */}
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        details={confirmState.details}
        confirmLabel={confirmState.confirmLabel}
        variant={confirmState.variant}
        loading={isMutating}
        onConfirm={confirmState.onConfirm}
        onCancel={() => {
          if (!isMutating) setConfirmState((s) => ({ ...s, open: false }));
        }}
      />
    </div>
  );
}
