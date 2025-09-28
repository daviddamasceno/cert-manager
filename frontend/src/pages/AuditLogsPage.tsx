import { useEffect, useState } from 'react';
import { listAuditLogs } from '../services/audit';
import { AuditLog } from '../types';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    const fetchLogs = async () => {
      const data = await listAuditLogs(200);
      setLogs(data.reverse());
    };
    fetchLogs();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Logs de auditoria</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Hist?rico de altera??es, envios e erros registrados.</p>
      </div>
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <th className="px-4 py-3">Quando</th>
              <th className="px-4 py-3">Certificado</th>
              <th className="px-4 py-3">A??o</th>
              <th className="px-4 py-3">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                  Nenhum log registrado.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={`${log.timestamp}-${log.certificateId}-${log.action}`}>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    <div className="font-medium text-slate-800 dark:text-slate-100">{dayjs(log.timestamp).format('DD/MM/YYYY HH:mm')}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{dayjs(log.timestamp).fromNow()}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{log.certificateId}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{log.detail}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AuditLogsPage;
