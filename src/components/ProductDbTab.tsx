import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, Sparkles, Trash2 } from 'lucide-react';
import {
  CATEGORY_OPTIONS,
  OrderRow,
  ProductRow,
  ProductsColumnMap,
  colIndexToLetter,
  getCategoryBadgeClass,
} from '../types';

interface ProductDbTabProps {
  products: ProductRow[];
  allRows: OrderRow[];
  productsSheetName: string;
  productsColumnMap: ProductsColumnMap | null;
  dirtyProductIds: Set<string>;
  onUpdateProduct: (updated: ProductRow) => void;
  onBulkUpdateProducts: (updatedProducts: ProductRow[]) => void;
  onAddNewProduct: (newProduct: ProductRow) => void;
  onDeleteProduct: (product: ProductRow) => void;
  onSaveProducts: (productsToSave: ProductRow[]) => void;
  syncStatus: string;
}

const PAGE_SIZE = 60;

export const ProductDbTab: React.FC<ProductDbTabProps> = ({
  products,
  allRows,
  productsSheetName,
  productsColumnMap,
  dirtyProductIds,
  onUpdateProduct,
  onBulkUpdateProducts,
  onAddNewProduct,
  onDeleteProduct,
  onSaveProducts,
  syncStatus,
}) => {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterCodeState, setFilterCodeState] = useState<'all' | 'hasCode' | 'noCode'>('all');
  const [page, setPage] = useState(1);

  const codeStats = useMemo(() => {
    let withCode = 0;
    let blankCode = 0;
    for (const p of products) {
      if (p.code && p.code.trim() !== '') withCode++;
      else blankCode++;
    }
    return { withCode, blankCode };
  }, [products]);

  const availableCategories = useMemo(() => {
    const extras = Array.from(
      new Set(
        products
          .map((p) => p.category)
          .filter((c) => c && !CATEGORY_OPTIONS.includes(c as any))
      )
    );
    return [...CATEGORY_OPTIONS, ...extras];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    const sorted = [...products].sort((a, b) => {
      if (a.originalRowIndex === null && b.originalRowIndex !== null) return -1;
      if (a.originalRowIndex !== null && b.originalRowIndex === null) return 1;
      const aHasCode = a.code.trim() ? 1 : 0;
      const bHasCode = b.code.trim() ? 1 : 0;
      if (aHasCode !== bHasCode) return bHasCode - aHasCode;
      return (a.originalRowIndex ?? 0) - (b.originalRowIndex ?? 0);
    });

    return sorted.filter((p) => {
      if (p.originalRowIndex === null) return true;
      if (filterCodeState === 'hasCode' && !p.code.trim()) return false;
      if (filterCodeState === 'noCode' && p.code.trim()) return false;
      if (filterCategory === '__uncategorized__' && p.category !== '') return false;
      if (
        filterCategory &&
        filterCategory !== '__uncategorized__' &&
        p.category !== filterCategory
      ) {
        return false;
      }
      if (!kw) return true;
      return (
        (p.code && p.code.toLowerCase().includes(kw)) ||
        (p.name && p.name.toLowerCase().includes(kw)) ||
        (p.category && p.category.toLowerCase().includes(kw))
      );
    });
  }, [products, searchKeyword, filterCategory, filterCodeState]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageProducts = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredProducts.slice(start, start + PAGE_SIZE);
  }, [filteredProducts, safePage]);

  const handleAddEmpty = () => {
    setPage(1);
    onAddNewProduct({
      id: `new_prod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      originalRowIndex: null,
      code: '',
      name: '',
      category: CATEGORY_OPTIONS[0],
      price: '',
    });
  };

  const handleAutoFillCodes = () => {
    // Build lookup from 訂購資料 rows by normalized product name
    const orderCodeByName = new Map<string, string>();
    for (const r of allRows) {
      const cleanName = (r.name || '').replace(/#\d+/g, '').trim().toLowerCase();
      if (!cleanName) continue;
      let c = (r.code || '').trim();
      if (!c) {
        const m = (r.name || '').match(/#(\d+)/);
        if (m) c = `#${m[1]}`;
      }
      if (c && !orderCodeByName.has(cleanName)) {
        orderCodeByName.set(cleanName, c);
      }
    }

    const updated: ProductRow[] = [];
    for (const p of products) {
      if (p.code && p.code.trim() !== '') continue;
      let inferred = '';
      const nameMatch = (p.name || '').match(/#(\d+)/);
      if (nameMatch) {
        inferred = `#${nameMatch[1]}`;
      } else {
        const cleanProdName = (p.name || '').replace(/#\d+/g, '').trim().toLowerCase();
        inferred = orderCodeByName.get(cleanProdName) || '';
      }
      if (inferred) {
        updated.push({ ...p, code: inferred });
      }
    }

    onBulkUpdateProducts(updated);
  };

  const handleSaveClick = () => {
    const toSave = products.filter(
      (p) =>
        (p.originalRowIndex === null || dirtyProductIds.has(p.id)) &&
        (p.code || p.name)
    );
    onSaveProducts(toSave);
  };

  const colMapLabel = productsColumnMap
    ? `代號 ${colIndexToLetter(productsColumnMap.codeCol)}欄 · 名稱 ${colIndexToLetter(
        productsColumnMap.nameCol
      )}欄 · 分類 ${colIndexToLetter(productsColumnMap.categoryCol)}欄 · 價格 ${colIndexToLetter(
        productsColumnMap.priceCol
      )}欄`
    : '代號 A欄 · 名稱 B欄 · 分類 C欄 · 價格 D欄';

  return (
    <div className="space-y-3">
      {/* Header & Search Panel */}
      <section className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs sm:p-4">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-base font-bold text-slate-900">🏷️ 商品資訊</h2>
            <span className="text-xs font-medium text-slate-500 tabular-nums">
              共 {products.length.toLocaleString()} 筆 · 有代號 {codeStats.withCode} 筆 · 空白代號{' '}
              {codeStats.blankCode} 筆
              {dirtyProductIds.size > 0 ? ` · 待儲存 ${dirtyProductIds.size} 筆` : ''}
            </span>
          </div>
          {syncStatus && <span className="text-xs font-medium text-slate-500">{syncStatus}</span>}
        </div>

        {/* Column mapping verification & auto-fill bar */}
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              工作表：<strong className="text-slate-700">{productsSheetName || '商品資訊'}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">欄位對應：{colMapLabel}</span>
          </div>
          {codeStats.blankCode > 0 && (
            <button
              type="button"
              onClick={handleAutoFillCodes}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-[#0d6efd]/40 bg-[#e7f1ff] px-2.5 py-1 text-xs font-bold text-[#0d6efd] transition hover:bg-[#cfe2ff]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              自動從品名/訂單補齊空白代號
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="flex min-w-[220px] flex-1 overflow-hidden rounded-lg border border-slate-300 bg-white">
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
              placeholder="輸入商品代號、名稱或分類快速搜尋..."
              className="flex-1 bg-white px-2.5 py-1.5 text-sm focus:outline-none"
            />
            {searchKeyword && (
              <button
                type="button"
                onClick={() => {
                  setSearchKeyword('');
                  setPage(1);
                }}
                className="border-l border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                清除
              </button>
            )}
          </div>

          <select
            value={filterCodeState}
            onChange={(e) => {
              setFilterCodeState(e.target.value as 'all' | 'hasCode' | 'noCode');
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 focus:border-[#0d6efd] focus:outline-none"
          >
            <option value="all">全部代號狀態</option>
            <option value="hasCode">僅看有代號 ({codeStats.withCode})</option>
            <option value="noCode">僅看空白代號 ({codeStats.blankCode})</option>
          </select>

          <select
            value={filterCategory}
            onChange={(e) => {
              setFilterCategory(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 focus:border-[#0d6efd] focus:outline-none"
          >
            <option value="">全部分類</option>
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
            <option value="__uncategorized__">未分類</option>
          </select>
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

      {/* Product Table */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="max-h-[calc(100vh-300px)] overflow-auto">
          {pageProducts.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              {products.length === 0
                ? '目前尚未讀取到商品資訊紀錄，請點擊下方「➕ 新增商品」。'
                : '沒有符合搜尋條件的商品資訊。'}
            </div>
          ) : (
            <table className="w-full border-collapse text-center align-middle">
              <thead className="sticky top-0 z-10 bg-slate-900 text-white">
                <tr className="text-sm font-bold">
                  <th className="w-[60px] whitespace-nowrap border-r border-slate-700 px-2 py-2.5">
                    列號
                  </th>
                  <th className="min-w-[120px] w-[16%] whitespace-nowrap border-r border-slate-700 px-2 py-2.5">
                    商品代號
                  </th>
                  <th className="min-w-[220px] w-[38%] whitespace-nowrap border-r border-slate-700 px-3 py-2.5 text-left">
                    商品名稱
                  </th>
                  <th className="min-w-[140px] w-[18%] whitespace-nowrap border-r border-slate-700 px-2 py-2.5">
                    商品分類
                  </th>
                  <th className="min-w-[110px] w-[14%] whitespace-nowrap border-r border-slate-700 px-2 py-2.5">
                    商品價格
                  </th>
                  <th className="w-[68px] whitespace-nowrap px-2 py-2.5">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {pageProducts.map((p) => {
                  const isNew = p.originalRowIndex === null;
                  const isDirty = isNew || dirtyProductIds.has(p.id);

                  return (
                    <tr
                      key={p.id}
                      className={
                        isNew
                          ? 'bg-[#e7f1ff]/65'
                          : isDirty
                          ? 'bg-[#d1e7dd]/35'
                          : 'bg-white hover:bg-slate-50'
                      }
                    >
                      <td className="border-r border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-400 tabular-nums">
                        {p.originalRowIndex ?? '新增'}
                      </td>
                      <td className="border-r border-slate-200 p-1.5">
                        <input
                          type="text"
                          value={p.code}
                          placeholder="代號"
                          onChange={(e) => onUpdateProduct({ ...p, code: e.target.value })}
                          className="w-full rounded border border-slate-200 bg-white/80 px-2 py-1 text-center font-bold text-[#0d6efd] tabular-nums focus:border-[#0d6efd] focus:bg-white focus:outline-none"
                        />
                      </td>
                      <td className="border-r border-slate-200 p-1.5">
                        <input
                          type="text"
                          value={p.name}
                          placeholder="名稱"
                          onChange={(e) => onUpdateProduct({ ...p, name: e.target.value })}
                          className="w-full rounded border border-slate-200 bg-white/80 px-2.5 py-1 text-left font-bold text-slate-900 focus:border-[#0d6efd] focus:bg-white focus:outline-none"
                        />
                      </td>
                      <td className="border-r border-slate-200 p-1.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${getCategoryBadgeClass(
                              p.category
                            )}`}
                            aria-hidden="true"
                          />
                          <select
                            value={p.category}
                            onChange={(e) => onUpdateProduct({ ...p, category: e.target.value })}
                            className="w-full rounded border border-slate-200 bg-white/80 px-1.5 py-1 font-medium text-slate-800 focus:border-[#0d6efd] focus:bg-white focus:outline-none"
                          >
                            <option value="">未分類</option>
                            {!CATEGORY_OPTIONS.includes(p.category as any) && p.category && (
                              <option value={p.category}>{p.category}</option>
                            )}
                            {CATEGORY_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="border-r border-slate-200 p-1.5">
                        <input
                          type="number"
                          min={0}
                          value={p.price === '' ? '' : p.price}
                          placeholder="0"
                          onChange={(e) =>
                            onUpdateProduct({
                              ...p,
                              price: e.target.value === '' ? '' : Number(e.target.value),
                            })
                          }
                          className="w-full rounded border border-slate-200 bg-white/80 px-2 py-1 text-center font-bold text-[#dc3545] tabular-nums focus:border-[#0d6efd] focus:bg-white focus:outline-none"
                        />
                      </td>
                      <td className="p-1.5">
                        <button
                          type="button"
                          onClick={() => onDeleteProduct(p)}
                          title="刪除商品"
                          className="inline-flex items-center rounded border border-[#dc3545] p-1.5 text-[#dc3545] hover:bg-[#dc3545] hover:text-white"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
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
            onClick={handleAddEmpty}
            className="whitespace-nowrap rounded-lg border border-[#0d6efd] bg-white px-3.5 py-2 text-sm font-bold text-[#0d6efd] shadow-2xs transition hover:bg-[#e7f1ff] sm:text-base"
          >
            ➕ 新增商品
          </button>
          <button
            type="button"
            onClick={handleSaveClick}
            className="whitespace-nowrap rounded-lg bg-[#198754] px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#157347] sm:text-base"
          >
            💾 儲存變更 {dirtyProductIds.size > 0 ? `(${dirtyProductIds.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
};
