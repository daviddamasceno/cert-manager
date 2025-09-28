import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Transition } from '@headlessui/react';
import { CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';

export type ToastType = 'success' | 'error' | 'info';

type Toast = {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
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

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(({ type, title, description }: Omit<Toast, 'id'>) => {
    const toast: Toast = {
      id: crypto.randomUUID(),
      type,
      title,
      description
    };
    setToasts((current) => [...current, toast]);
    setTimeout(() => dismiss(toast.id), 5000);
  }, [dismiss]);

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
              <div className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5 dark:bg-slate-800">
                <div className="p-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">{iconByType[toast.type]}</div>
                    <div className="ml-3 w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{toast.title}</p>
                      {toast.description ? (
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-200">{toast.description}</p>
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
