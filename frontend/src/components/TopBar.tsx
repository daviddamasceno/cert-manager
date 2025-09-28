import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { SunIcon, MoonIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';

const TopBar: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-900">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Gest?o de Certificados</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Monitoramento ativo e alertas inteligentes</p>
      </div>
      <div className="flex items-center space-x-4">
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          aria-label="Alternar tema"
        >
          {theme === 'dark' ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
        </button>
        <div className="flex items-center space-x-3 rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-500 text-sm font-semibold text-white capitalize">
            {user?.email[0] ?? '?'}
          </div>
          <div className="text-xs">
            <p className="font-medium text-slate-700 dark:text-slate-200">{user?.email}</p>
            <p className="text-slate-500 dark:text-slate-400">Administrador</p>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ArrowRightOnRectangleIcon className="mr-2 h-4 w-4" aria-hidden="true" />
          Sair
        </button>
      </div>
    </header>
  );
};

export default TopBar;
