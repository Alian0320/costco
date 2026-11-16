import React from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'success' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  details = [],
  confirmLabel = '確認執行',
  cancelLabel = '取消',
  variant = 'success',
  loading = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  const confirmBtnClass =
    variant === 'danger'
      ? 'bg-[#dc3545] hover:bg-[#bb2d3b] text-white'
      : variant === 'primary'
      ? 'bg-[#0d6efd] hover:bg-[#0b5ed7] text-white'
      : 'bg-[#198754] hover:bg-[#157347] text-white';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl border border-[#dee2e6]">
        <div className="flex items-center justify-between border-b border-[#dee2e6] bg-[#f8f9fa] px-4 py-3">
          <div className="flex items-center gap-2 font-bold text-[#212529]">
            {variant === 'danger' ? (
              <AlertTriangle className="h-5 w-5 text-[#dc3545]" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-[#198754]" />
            )}
            <span>{title}</span>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="rounded-md p-1 text-[#6c757d] hover:bg-[#e9ecef] hover:text-[#212529]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 text-[0.95rem] text-[#212529]">
          <p className="whitespace-pre-line font-medium leading-relaxed">{description}</p>
          {details.length > 0 && (
            <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[#e9ecef] bg-[#f8f9fa] p-2.5 text-sm text-[#495057]">
              {details.map((item, i) => (
                <li key={i} className="leading-snug">
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#dee2e6] bg-[#f8f9fa] px-4 py-3">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="rounded-lg border border-[#ced4da] bg-white px-4 py-2 text-sm font-bold text-[#495057] hover:bg-[#e9ecef] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-bold shadow-sm disabled:opacity-50 ${confirmBtnClass}`}
          >
            {loading ? '同步試算表中...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
