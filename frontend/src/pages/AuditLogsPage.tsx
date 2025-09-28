import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import clsx from 'clsx';
import { AuditLog, User } from '../types';
import { AuditLogFilters, listAuditLogs } from '../services/audit';
import { listUsers } from '../services/users';

dayjs.extend(relativeTime);

interface DiffEntry {
  field: string;
  oldValue: string;
  newValue: string;
}

const DEFAULT_LIMIT = 200;

const defaultFilters: AuditLogFilters = {
  limit: DEFAULT_LIMIT,
  actor: '',
  entity: '',
  entityId: '',
  action: '',
  from: '',
  to: '',
  query: ''
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') {
    return 'N/A';
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return String(value);
    }
  }
  return String(value);
};

const parseDiff = (diffJson?: string): DiffEntry[] => {
  if (!diffJson) {
    return [];
  }
  try {
    const parsed = JSON.parse(diffJson) as Record<string, { old?: unknown; new?: unknown }>;
    return Object.entries(parsed).map(([field, value]) => ({
      field,
      oldValue: formatValue(value?.old),
      newValue: formatValue(value?.new)
    }));
  } catch (_error) {
    return [];
  }
};

const normalizeDateInput = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString();
};

const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<AuditLogFilters>({ ...defaultFilters });
  const [error, setError] = useState<string | null>(null);
  const [userDirectory, setUserDirectory] = useState<Record<string, User>>({});

  const fetchLogs = async (inputFilters: AuditLogFilters) => {
    setLoading(true);
    setError(null);
    try {
      const payload: AuditLogFilters = {
        ...inputFilters,
        from: normalizeDateInput(inputFilters.from),
        to: normalizeDateInput(inputFilters.to)
      };
      const data = await listAuditLogs(payload);
      setLogs(data.reverse());
    } catch (requestError) {
      const message =
        (requestError as any)?.response?.data?.message ||
        (requestError instanceof Error ? requestError.message : 'Nao foi possivel carregar os logs');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLogs(defaultFilters);
  }, []);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const data = await listUsers();
        const directory = data.reduce<Record<string, User>>((accumulator, user) => {
          accumulator[user.id] = user;
          return accumulator;
        }, {});
        setUserDirectory(directory);
      } catch (requestError) {
        console.warn('Não foi possível carregar usuários para a auditoria', requestError);
      }
    };
    void fetchUsers();
  }, []);

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setFilters((previous) => ({
      ...previous,
      [name]:
        name === 'limit'
          ? value === ''
            ? undefined
            : Number(value)
          : value
    }));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void fetchLogs(filters);
  };

  const handleReset = () => {
    setFilters({ ...defaultFilters });
    void fetchLogs(defaultFilters);
  };

  const uniqueActions = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((log) => set.add(log.action));
    return Array.from(set).sort();
  }, [logs]);

  const uniqueEntities = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((log) => set.add(log.entity));
    return Array.from(set).sort();
  }, [logs]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Auditoria</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Consulte eventos registrados; filtros refinam por ator, entidade, periodo e palavras-chave.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="grid gap-4 md:grid-cols-5">
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Ator
            </label>
            <input
              name="actor"
              value={filters.actor}
              onChange={handleChange}
              list="audit-actor-options"
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder="user-id ou email"
            />
            <datalist id="audit-actor-options">
              {Object.values(userDirectory).map((user) => (
                <option key={user.id} value={user.email}>
                  {user.name} ({user.id})
                </option>
              ))}
              {Object.values(userDirectory).map((user) => (
                <option key={`${user.id}-id`} value={user.id}>
                  {user.name}
                </option>
              ))}
            </datalist>
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              entidade
            </label>
            <select
              name="entity"
              value={filters.entity}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">Todas</option>
              {uniqueEntities.map((entity) => (
                <option key={entity} value={entity}>
                  {entity}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Acao
            </label>
            <select
              name="action"
              value={filters.action}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">Todas</option>
              {uniqueActions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              De
            </label>
            <input
              type="date"
              name="from"
              value={filters.from}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Ate
            </label>
            <input
              type="date"
              name="to"
              value={filters.to}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              entidade ID
            </label>
            <input
              name="entityId"
              value={filters.entityId}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder="ID especifico"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Texto livre
            </label>
            <input
              name="query"
              value={filters.query}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder="Busca em nota/detalhes"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Limite
            </label>
            <input
              type="number"
              min={1}
              max={500}
              name="limit"
              value={filters.limit ?? ''}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className={clsx(
              'inline-flex items-center rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900',
              loading ? 'cursor-not-allowed opacity-70' : 'hover:bg-primary-700'
            )}
          >
            {loading ? 'Filtrando...' : 'Aplicar filtros'}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Limpar
          </button>
          {error ? <span className="text-sm text-rose-500">{error}</span> : null}
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <th className="px-4 py-3">Quando</th>
              <th className="px-4 py-3">Ator</th>
              <th className="px-4 py-3">Entidade</th>
              <th className="px-4 py-3">Acao</th>
              <th className="px-4 py-3">Origem</th>
              <th className="px-4 py-3">Nota</th>
              <th className="px-4 py-3">Diff</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                  Carregando...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                  Nenhum registro encontrado para os filtros aplicados.
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const diffs = parseDiff(log.diffJson);
                const actor = userDirectory[log.actorUserId];
                return (
                  <tr key={`${log.timestamp}-${log.entity}-${log.entityId}-${log.action}`}>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      <div className="font-medium text-slate-800 dark:text-slate-100">{dayjs(log.timestamp).format('DD/MM/YYYY HH:mm')}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{dayjs(log.timestamp).fromNow()}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      <div className="font-medium">{actor?.name || log.actorEmail || log.actorUserId}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{actor?.email || log.actorEmail || 'N/A'}</div>
                      <div className="text-xs text-slate-400">{log.actorUserId}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      <div className="font-medium uppercase tracking-wide text-xs text-slate-500 dark:text-slate-400">
                        {log.entity}
                      </div>
                      <div className="text-sm text-slate-700 dark:text-slate-200">{log.entityId}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{log.ip || 'N/A'}</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 break-all">
                        {log.userAgent || 'N/A'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {log.note ? log.note : <span className="text-xs text-slate-400">N/A</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {diffs.length ? (
                        <ul className="space-y-1 text-xs">
                          {diffs.map((diff) => (
                            <li key={`${log.timestamp}-${diff.field}`} className="rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">
                              <span className="font-semibold text-slate-700 dark:text-slate-200">{diff.field}</span>{' '}
                              <span className="text-slate-500 dark:text-slate-400">{diff.oldValue}</span>{' '}
                              <span className="text-slate-400">-&gt;</span>{' '}
                              <span className="text-slate-700 dark:text-emerald-300">{diff.newValue}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-slate-400">N/A</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AuditLogsPage;


