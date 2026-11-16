import React, { useEffect, useMemo, useState } from 'react';
import {
  NotificationUserGroup,
  OrderRow,
  TARGET_CHANNELS,
  compareMonthDay,
  formatMonthDay,
  isTodayOrFutureMonthDay,
} from '../types';

interface NoticeTabProps {
  allRows: OrderRow[];
  availableDates: string[];
  onRefresh: () => void;
}

export const NoticeTab: React.FC<NoticeTabProps> = ({
  allRows,
  availableDates,
  onRefresh,
}) => {
  const [noticeSelectedDate, setNoticeSelectedDate] = useState<string>('');
  const [copiedCardKey, setCopiedCardKey] = useState<string | null>(null);
  const [copiedColKey, setCopiedColKey] = useState<string | null>(null);

  const noticeDates = useMemo(() => {
    const set = new Set<string>();
    availableDates.forEach((d) => {
      const formatted = formatMonthDay(d);
      if (formatted && isTodayOrFutureMonthDay(formatted)) {
        set.add(formatted);
      }
    });
    allRows.forEach((r) => {
      if (r.orderStatus !== '已取' && r.purchaseDate) {
        const formatted = formatMonthDay(r.purchaseDate);
        if (formatted && isTodayOrFutureMonthDay(formatted)) {
          set.add(formatted);
        }
      }
    });
    return Array.from(set).sort(compareMonthDay);
  }, [allRows, availableDates]);

  useEffect(() => {
    if (noticeDates.length === 0) {
      if (noticeSelectedDate) setNoticeSelectedDate('');
      return;
    }
    if (!noticeSelectedDate || !noticeDates.includes(noticeSelectedDate)) {
      setNoticeSelectedDate(noticeDates[0]);
    }
  }, [noticeDates, noticeSelectedDate]);

  const channelGroups = useMemo(() => {
    const groups: Record<string, Record<string, NotificationUserGroup>> = {};

    allRows.forEach((row) => {
      const purchaseDate = formatMonthDay(row.purchaseDate || row.date);
      if (!purchaseDate || !isTodayOrFutureMonthDay(purchaseDate)) {
        return;
      }

      const channel = row.channel || 'LINE';
      const user = row.user || '未具名';
      const qty = Number(row.qty) || 1;
      const price = Number(row.price) || 0;
      const fee = Number(row.fee) || 0;
      const orderStatus = row.orderStatus || '';

      const isDateMatch = !noticeSelectedDate || purchaseDate === noticeSelectedDate;

      if (orderStatus !== '已取' && isDateMatch) {
        if (!groups[channel]) groups[channel] = {};
        if (!groups[channel][user]) {
          groups[channel][user] = {
            userName: user,
            items: [],
            totalSubtotal: 0,
            totalFee: 0,
          };
        }

        const isOos = orderStatus === '缺貨';
        const itemSubtotal = Math.round(qty * price);

        groups[channel][user].items.push({
          code: row.code,
          name: row.name,
          qty,
          price,
          subtotal: itemSubtotal,
          isOutOfStock: isOos,
          orderStatus,
        });

        if (!isOos) {
          groups[channel][user].totalSubtotal += itemSubtotal;
          groups[channel][user].totalFee += fee;
        }
      }
    });

    return groups;
  }, [allRows, noticeSelectedDate]);

  const buildNoticeText = (ch: string, uData: NotificationUserGroup): string => {
    let headerPrefix = '';
    if (ch === 'FB') headerPrefix = '📍 (FB) ';
    else if (ch === 'LINE' || ch === 'LINE(私)' || ch === 'IG' || ch === 'Threads') {
      headerPrefix = '@';
    }
    const headerLine = `${headerPrefix}${uData.userName}`;

    const itemLines = uData.items.map((it) => {
      if (it.isOutOfStock || it.orderStatus === '缺貨') {
        return `⚠️ ${it.name} ${it.qty}項 (缺貨)`;
      }
      return `🔹 ${it.name} ${it.qty}項 $${it.subtotal}`;
    });

    const totalAmount = uData.totalSubtotal + uData.totalFee;
    const summaryLine = `💰 商品金額 $${uData.totalSubtotal} + 代購費 $${uData.totalFee}\n🛒 總金額 $${totalAmount}`;

    return `${headerLine}\n${itemLines.join('\n')}\n${summaryLine}`;
  };

  const handleCopyCard = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedCardKey(key);
    setTimeout(() => {
      setCopiedCardKey((prev) => (prev === key ? null : prev));
    }, 1500);
  };

  const handleCopyColumn = async (ch: string, texts: string[]) => {
    const combined = texts.join('\n\n--------------------\n\n');
    await navigator.clipboard.writeText(combined);
    setCopiedColKey(ch);
    setTimeout(() => {
      setCopiedColKey((prev) => (prev === ch ? null : prev));
    }, 1500);
  };

  return (
    <div className="space-y-3">
      {/* Header & Date Filter Panel */}
      <section className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs sm:p-4">
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
          <h2 className="text-base font-bold text-[#0d6efd]">📢 取貨通知訊息產生器</h2>
          <button
            type="button"
            onClick={onRefresh}
            className="whitespace-nowrap rounded-lg border border-[#0d6efd] bg-white px-3 py-1 text-xs font-bold text-[#0d6efd] transition hover:bg-[#0d6efd] hover:text-white"
          >
            🔄 重新整理
          </button>
        </div>

        <div className="mt-3">
          <span className="mb-1.5 block text-xs font-bold text-slate-500">
            依採購日期篩選
          </span>
          <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {noticeDates.length === 0 ? (
              <span className="text-sm text-slate-500">目前無採購日期資料</span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setNoticeSelectedDate('')}
                  className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-bold transition ${
                    noticeSelectedDate === ''
                      ? 'bg-[#0d6efd] text-white shadow-xs'
                      : 'border border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50'
                  }`}
                >
                  全部日期
                </button>
                {noticeDates.map((d) => {
                  const isActive = d === noticeSelectedDate;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setNoticeSelectedDate(d)}
                      className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-bold tabular-nums transition ${
                        isActive
                          ? 'bg-[#0d6efd] text-white shadow-xs'
                          : 'border border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      {formatMonthDay(d)}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </section>

      {/* Responsive 5-Channel Grid */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {TARGET_CHANNELS.map((ch) => {
          const usersMap = channelGroups[ch] || {};
          const userKeys = Object.keys(usersMap);
          const columnTexts = userKeys.map((uk) => buildNoticeText(ch, usersMap[uk]));

          return (
            <div
              key={ch}
              className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs"
            >
              <div className="flex items-center justify-between gap-2 bg-slate-900 px-3 py-2.5 text-white">
                <div className="flex items-center gap-1.5 font-bold">
                  <span>{ch}</span>
                  <span className="text-xs font-medium text-slate-300 tabular-nums">
                    ({userKeys.length})
                  </span>
                </div>
                {userKeys.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleCopyColumn(ch, columnTexts)}
                    className={`whitespace-nowrap rounded-md border px-2 py-1 text-xs font-bold transition ${
                      copiedColKey === ch
                        ? 'border-[#198754] bg-[#198754] text-white'
                        : 'border-white/40 text-white hover:bg-white hover:text-slate-900'
                    }`}
                  >
                    {copiedColKey === ch ? '✅ 已複製' : '📋 複製全部'}
                  </button>
                )}
              </div>

              <div className="flex-1 space-y-2.5 bg-slate-50/60 p-2.5">
                {userKeys.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-white py-8 text-center text-xs text-slate-400">
                    無 {ch} 待取訂單
                  </div>
                ) : (
                  userKeys.map((userKey, idx) => {
                    const text = columnTexts[idx];
                    const cardKey = `${ch}_${userKey}`;
                    const isCopied = copiedCardKey === cardKey;

                    return (
                      <div
                        key={cardKey}
                        className="relative rounded-lg border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-800 shadow-2xs"
                      >
                        <button
                          type="button"
                          onClick={() => handleCopyCard(cardKey, text)}
                          className={`absolute right-2 top-2 whitespace-nowrap rounded border px-2 py-0.5 text-[0.72rem] font-bold transition ${
                            isCopied
                              ? 'border-[#198754] bg-[#198754] text-white'
                              : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {isCopied ? '✅ 已複製' : '📋 複製'}
                        </button>
                        <div className="whitespace-pre-wrap break-words pr-14 tabular-nums">
                          {text}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
};
