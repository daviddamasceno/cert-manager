import { useEffect, useState } from 'react';
import { fetchSettings } from '../services/settings';
import { SettingsResponse } from '../types';
import clsx from 'clsx';

const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);

  useEffect(() => {
    const load = async () => {
      const data = await fetchSettings();
      setSettings(data);
    };
    load();
  }, []);

  if (!settings) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando configurações...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Configurações gerais</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Informações do scheduler e integração com o Google Sheets.</p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Agendamento</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Scheduler</dt>
              <dd className={clsx(
                'rounded-full px-3 py-1 text-xs font-semibold',
                settings.scheduler.enabled
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                  : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
              )}>
                {settings.scheduler.enabled ? 'Ativo' : 'Desativado'}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Cron horário</dt>
              <dd className="font-mono text-slate-700 dark:text-slate-200">{settings.scheduler.hourlyCron}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Cron diário</dt>
              <dd className="font-mono text-slate-700 dark:text-slate-200">{settings.scheduler.dailyCron}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Fuso horário padrão</dt>
              <dd className="text-slate-700 dark:text-slate-200">{settings.timezone}</dd>
            </div>
          </dl>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Google Sheets</h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            ID da planilha utilizada como base de dados. Compartilhe-a com a Service Account.
          </p>
          <code className="mt-3 block break-all rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {settings.sheets.spreadsheetId}
          </code>
        </div>
      </section>
    </div>
  );
};

export default SettingsPage;
