import { useEffect, useMemo, useState } from 'react';
import { listCertificates } from '../services/certificates';
import { Certificate } from '../types';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import clsx from 'clsx';

interface FilterState {
  query: string;
  status: string;
}

dayjs.extend(relativeTime);

const statusLabels: Record<string, string> = {
  active: 'Ativo',
  expired: 'Expirado',
  revoked: 'Revogado'
};

const DashboardPage: React.FC = () => {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({ query: '', status: 'all' });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const data = await listCertificates();
        setCertificates(data);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const metrics = useMemo(() => {
    const totalActive = certificates.filter((c) => c.status === 'active').length;
    const totalExpired = certificates.filter((c) => c.status === 'expired').length;
    const now = dayjs();
    const soon30 = certificates.filter((c) => {
      const diff = dayjs(c.expiresAt).diff(now, 'day');
      return diff >= 0 && diff <= 30;
    }).length;
    const soon15 = certificates.filter((c) => {
      const diff = dayjs(c.expiresAt).diff(now, 'day');
      return diff >= 0 && diff <= 15;
    }).length;
    const soon7 = certificates.filter((c) => {
      const diff = dayjs(c.expiresAt).diff(now, 'day');
      return diff >= 0 && diff <= 7;
    }).length;
    return { totalActive, totalExpired, soon30, soon15, soon7 };
  }, [certificates]);

  const filteredCertificates = useMemo(() => {
    return certificates.filter((certificate) => {
      const matchesQuery = certificate.name.toLowerCase().includes(filters.query.toLowerCase());
      const matchesStatus = filters.status === 'all' || certificate.status === filters.status;
      return matchesQuery && matchesStatus;
    });
  }, [certificates, filters]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <DashboardCard label="Ativos" value={metrics.totalActive} helper="Certificados ativos" variant="success" />
        <DashboardCard label="A vencer em 30 dias" value={metrics.soon30} helper="Inclui 15 e 7 dias" variant="warning" />
        <DashboardCard label="A vencer em 15 dias" value={metrics.soon15} helper="Prioridade" variant="warning" />
        <DashboardCard label="A vencer em 7 dias" value={metrics.soon7} helper="Urgente" variant="danger" />
        <DashboardCard label="Expirados" value={metrics.totalExpired} helper="Requer atenção" variant="danger" />
      </div>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Certificados</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Visualize e filtre certificados monitorados.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="search"
              placeholder="Buscar por nome"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              value={filters.query}
              onChange={(event) => setFilters((prev) => ({ ...prev, query: event.target.value }))}
            />
            <select
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            >
              <option value="all">Todos os status</option>
              <option value="active">Ativos</option>
              <option value="expired">Expirados</option>
              <option value="revoked">Revogados</option>
            </select>
          </div>
        </header>
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="px-4 py-3">Certificado</th>
                <th className="px-4 py-3">Responsável</th>
                <th className="px-4 py-3">Expira em</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Canais</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                    Carregando...
                  </td>
                </tr>
              ) : filteredCertificates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                    Nenhum certificado encontrado.
                  </td>
                </tr>
              ) : (
                filteredCertificates.map((certificate) => {
                  const daysLeft = dayjs(certificate.expiresAt).diff(dayjs(), 'day');
                  return (
                    <tr key={certificate.id}>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{certificate.name}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{certificate.ownerEmail}</td>
                      <td className="px-4 py-3">
                        <span
                          className={clsx(
                            'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
                            daysLeft < 0
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                              : daysLeft <= 7
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                              : daysLeft <= 30
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                          )}
                        >
                          {daysLeft < 0 ? `Expirado há ${Math.abs(daysLeft)}d` : `Em ${daysLeft} dias`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={clsx(
                            'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                            certificate.status === 'active'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                              : certificate.status === 'expired'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                              : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                          )}
                        >
                          {statusLabels[certificate.status] ?? certificate.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {certificate.channelIds.length ? `${certificate.channelIds.length} canais` : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

const variants: Record<'success' | 'warning' | 'danger', string> = {
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  danger: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
};

const DashboardCard: React.FC<{ label: string; value: number; helper: string; variant: 'success' | 'warning' | 'danger' }> = ({
  label,
  value,
  helper,
  variant
}) => {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      <span className={clsx('mt-4 inline-flex rounded-full px-3 py-1 text-xs font-medium', variants[variant])}>{helper}</span>
    </div>
  );
};

export default DashboardPage;
