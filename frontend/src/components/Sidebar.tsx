import { NavLink } from 'react-router-dom';
import {
  HomeIcon,
  DocumentDuplicateIcon,
  BellAlertIcon,
  AdjustmentsHorizontalIcon,
  ClipboardDocumentListIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';

const navigation = [
  { name: 'Dashboard', to: '/dashboard', icon: HomeIcon, roles: ['admin', 'editor', 'viewer'] },
  { name: 'Certificados', to: '/certificates', icon: DocumentDuplicateIcon, roles: ['admin', 'editor', 'viewer'] },
  { name: 'Modelos de alerta', to: '/alert-models', icon: BellAlertIcon, roles: ['admin', 'editor', 'viewer'] },
  { name: 'Canais', to: '/channels', icon: AdjustmentsHorizontalIcon, roles: ['admin', 'editor', 'viewer'] },
  { name: 'Usuários', to: '/users', icon: UserGroupIcon, roles: ['admin'] },
  { name: 'Logs de auditoria', to: '/audit-logs', icon: ClipboardDocumentListIcon, roles: ['admin', 'editor', 'viewer'] },
  { name: 'Configurações', to: '/settings', icon: AdjustmentsHorizontalIcon, roles: ['admin', 'editor'] }
];

const Sidebar: React.FC = () => {
  const { user } = useAuth();
  const allowedNavigation = navigation.filter((item) => (user ? item.roles.includes(user.role) : false));
  return (
    <nav className="flex flex-1 flex-col px-4 py-6">
      <div className="mb-8 flex items-center space-x-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-500 text-white">CM</div>
        <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">Cert Manager</span>
      </div>
      <div className="flex-1 space-y-1">
        {allowedNavigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.to}
            className={({ isActive }) =>
              clsx(
                'group flex items-center rounded-md px-3 py-2 text-sm font-medium transition',
                isActive
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-300'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50'
              )
            }
          >
            <item.icon className="mr-3 h-5 w-5" aria-hidden="true" />
            <span>{item.name}</span>
          </NavLink>
        ))}
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500">v1.0.0</p>
    </nav>
  );
};

export default Sidebar;
