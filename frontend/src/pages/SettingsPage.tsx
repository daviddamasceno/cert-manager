import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { fetchSettings } from '../services/settings';
import { SettingsResponse } from '../types';
import clsx from 'clsx';
import { changePassword } from '../services/auth';

const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      const data = await fetchSettings();
      setSettings(data);
    };
    load();
  }, []);

  const handlePasswordInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setPasswordForm((previous) => ({ ...previous, [name]: value }));
  };

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (passwordForm.next !== passwordForm.confirm) {
      setPasswordError('A confirmação deve ser igual à nova senha.');
      return;
    }

    setPasswordLoading(true);
    try {
      await changePassword({ currentPassword: passwordForm.current, newPassword: passwordForm.next });
      setPasswordSuccess('Senha atualizada com sucesso. Utilize a nova senha no próximo acesso.');
      setPasswordForm({ current: '', next: '', confirm: '' });
    } catch (requestError: unknown) {
      const message =
        (requestError as any)?.response?.data?.message ||
        (requestError instanceof Error ? requestError.message : 'Não foi possível atualizar a senha.');
      setPasswordError(message);
    } finally {
      setPasswordLoading(false);
    }
  };

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
              <dd
                className={clsx(
                  'rounded-full px-3 py-1 text-xs font-semibold',
                  settings.scheduler.enabled
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                    : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                )}
              >
                {settings.scheduler.enabled ? 'Ativo' : 'Desativado'}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Frequência de verificação</dt>
              <dd className="text-slate-700 dark:text-slate-200">
                A cada {settings.scheduler.intervalMinutes} minuto{settings.scheduler.intervalMinutes > 1 ? 's' : ''}
              </dd>
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

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Segurança da conta</h3>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Atualize sua senha para cumprir a política de complexidade mínima. Senhas temporárias devem ser alteradas antes do próximo acesso.
        </p>
        <form onSubmit={handlePasswordSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Senha atual
            </label>
            <input
              type="password"
              name="current"
              value={passwordForm.current}
              onChange={handlePasswordInputChange}
              required
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Nova senha
            </label>
            <input
              type="password"
              name="next"
              value={passwordForm.next}
              onChange={handlePasswordInputChange}
              required
              minLength={10}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder="Mínimo 10 caracteres"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Confirmar nova senha
            </label>
            <input
              type="password"
              name="confirm"
              value={passwordForm.confirm}
              onChange={handlePasswordInputChange}
              required
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Requisitos: ao menos 10 caracteres com letras maiúsculas, minúsculas, números e símbolos.
          </p>
          {passwordError ? <p className="text-sm text-rose-500">{passwordError}</p> : null}
          {passwordSuccess ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{passwordSuccess}</p> : null}
          <button
            type="submit"
            disabled={passwordLoading}
            className={clsx(
              'inline-flex items-center rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900',
              passwordLoading ? 'cursor-not-allowed opacity-70' : 'hover:bg-primary-700'
            )}
          >
            {passwordLoading ? 'Atualizando...' : 'Atualizar senha'}
          </button>
        </form>
      </section>
    </div>
  );
};

export default SettingsPage;
