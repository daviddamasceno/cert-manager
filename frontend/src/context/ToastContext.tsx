import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Transition } from '@headlessui/react';
import { CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';

export type ToastType = 'success' | 'error' | 'info';

type Toast = {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  copyable?: {
    label?: string;
    value: string;
  };
};

type ToastContextValue = {
  notify: (toast: Omit<Toast, 'id'>) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const iconByType: Record<ToastType, JSX.Element> = {
  success: <CheckCircleIcon className="h-6 w-6 text-emerald-500" aria-hidden="true" />,
  error: <ExclamationTriangleIcon className="h-6 w-6 text-rose-500" aria-hidden="true" />,
  info: <InformationCircleIcon className="h-6 w-6 text-sky-500" aria-hidden="true" />
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [copiedToastId, setCopiedToastId] = useState<string | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(({ type, title, description, copyable }: Omit<Toast, 'id'>) => {
    const toast: Toast = {
      id: crypto.randomUUID(),
      type,
      title,
      description,
      copyable
    };
    setToasts((current) => [...current, toast]);
    const lifetime = copyable ? 15000 : 5000;
    setTimeout(() => dismiss(toast.id), lifetime);
  }, [dismiss]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const copyToClipboard = useCallback(async (value: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (error) {
        console.warn('Falha ao copiar com navigator.clipboard', error);
      }
    }

    if (typeof document !== 'undefined') {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (successful) {
          return true;
        }
      } catch (error) {
        console.warn('Falha ao copiar utilizando textarea auxiliar', error);
      }
    }

    return false;
  }, []);

  const handleCopy = useCallback(async (toastId: string, value: string) => {
    const copied = await copyToClipboard(value);
    if (copied) {
      setCopiedToastId(toastId);
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopiedToastId((current) => (current === toastId ? null : current));
        copyTimeoutRef.current = null;
      }, 2000);
      return;
    }

    window.prompt('Copie o valor manualmente:', value);
  }, [copyToClipboard]);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="assertive" className="pointer-events-none fixed inset-0 flex items-end px-4 py-6 sm:items-start sm:p-6">
        <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
          {toasts.map((toast) => (
            <Transition
              key={toast.id}
              show
              enter="transform ease-out duration-300 transition"
              enterFrom="translate-y-4 opacity-0 sm:translate-y-0 sm:translate-x-4"
              enterTo="translate-y-0 opacity-100 sm:translate-x-0"
              leave="transition ease-in duration-100"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="pointer-events-auto w-full min-w-[20rem] max-w-2xl overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5 dark:bg-slate-800">
                <div className="p-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">{iconByType[toast.type]}</div>
                    <div className="ml-3 w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{toast.title}</p>
                      {toast.description ? (
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-200">{toast.description}</p>
                      ) : null}
                      {toast.copyable ? (
                        <div className="mt-3 rounded-md border border-slate-300 bg-slate-100 px-4 py-3 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                          {toast.copyable.label ? (
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              {toast.copyable.label}
                            </p>
                          ) : null}
                          <div className="mt-2 flex items-center gap-3">
                            <code className="flex-1 break-words font-mono text-base leading-relaxed text-slate-900 dark:text-slate-100">
                              {toast.copyable.value}
                            </code>
                            <button
                              type="button"
                              onClick={() => handleCopy(toast.id, toast.copyable!.value)}
                              className="inline-flex items-center rounded-md border border-slate-400 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 dark:border-slate-500 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              {copiedToastId === toast.id ? 'Copiado!' : 'Copiar'}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div className="ml-4 flex flex-shrink-0">
                      <button
                        type="button"
                        className="inline-flex rounded-md bg-transparent text-slate-400 hover:text-slate-500 focus:outline-none"
                        onClick={() => dismiss(toast.id)}
                      >
                        <span className="sr-only">Fechar</span>
                        <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Transition>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast deve ser usado dentro de ToastProvider');
  }
  return context;
};
