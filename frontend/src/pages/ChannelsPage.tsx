import { Fragment, useEffect, useMemo, useState } from 'react';
import { Dialog, Transition, Switch } from '@headlessui/react';
import { PlusIcon, PencilSquareIcon, PowerIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { useForm } from 'react-hook-form';
import dayjs from 'dayjs';
import { useToast } from '../context/ToastContext';
import { ChannelSummary, ChannelType } from '../types';
import { createChannel, disableChannel, listChannels, updateChannel } from '../services/channels';

interface FormValues {
  name: string;
  type: ChannelType;
  enabled: boolean;
  params: Record<string, string>;
  secrets: Record<string, string>;
}

interface FieldDefinition {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'checkbox' | 'textarea';
  placeholder?: string;
}

const TYPE_DEFINITIONS: Record<ChannelType, { label: string; params: FieldDefinition[]; secrets: FieldDefinition[] }> = {
  email_smtp: {
    label: 'SMTP',
    params: [
      { key: 'smtp_host', label: 'Servidor SMTP' },
      { key: 'smtp_port', label: 'Porta', type: 'number' },
      { key: 'smtp_user', label: 'Usuário' },
      { key: 'from_name', label: 'Nome do remetente' },
      { key: 'from_email', label: 'E-mail do remetente' },
      { key: 'tls', label: 'TLS (on/off)', placeholder: 'on' },
      { key: 'timeout_ms', label: 'Timeout (ms)', type: 'number' }
    ],
    secrets: [{ key: 'smtp_pass', label: 'Senha SMTP' }]
  },
  telegram_bot: {
    label: 'Bot do Telegram',
    params: [
      {
        key: 'chat_ids',
        label: 'Chat IDs (separados por vírgula)',
        placeholder: '123456,@canal'
      }
    ],
    secrets: [{ key: 'bot_token', label: 'Token do bot' }]
  },
  slack_webhook: {
    label: 'Slack Webhook',
    params: [{ key: 'channel_override', label: 'Canal (opcional)' }],
    secrets: [{ key: 'webhook_url', label: 'URL do webhook' }]
  },
  googlechat_webhook: {
    label: 'Google Chat Webhook',
    params: [{ key: 'space_name', label: 'Space (opcional)' }],
    secrets: [{ key: 'webhook_url', label: 'URL do webhook' }]
  }
};

const defaultValues: FormValues = {
  name: '',
  type: 'email_smtp',
  enabled: true,
  params: {},
  secrets: {}
};

const ChannelsPage: React.FC = () => {
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<ChannelSummary | null>(null);
  const [existingSecrets, setExistingSecrets] = useState<Record<string, boolean>>({});
  const { notify } = useToast();

  const { register, handleSubmit, reset, watch, setValue } = useForm<FormValues>({
    defaultValues
  });

  const selectedType = watch('type');
  const enabled = watch('enabled');

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const data = await listChannels();
      setChannels(data);
    } catch (error) {
      notify({ type: 'error', title: 'Falha ao carregar canais' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  const openCreateModal = () => {
    setExistingSecrets({});
    reset({ ...defaultValues });
    setSelectedChannel(null);
    setModalOpen(true);
  };

  const openEditModal = (summary: ChannelSummary) => {
    setSelectedChannel(summary);
    setExistingSecrets(
      Object.fromEntries(summary.secrets.map((secret) => [secret.key, secret.hasValue]))
    );
    reset({
      name: summary.channel.name,
      type: summary.channel.type,
      enabled: summary.channel.enabled,
      params: summary.params,
      secrets: Object.fromEntries(summary.secrets.map((secret) => [secret.key, '']))
    });
    setModalOpen(true);
  };

  const onSubmit = handleSubmit(async (values) => {
    const payload = {
      name: values.name,
      type: values.type,
      enabled: values.enabled,
      params: values.params,
      secrets: Object.fromEntries(
        Object.entries(values.secrets).filter(([, value]) => value && value.trim().length > 0)
      )
    };

    try {
      if (selectedChannel) {
        await updateChannel(selectedChannel.channel.id, payload);
        notify({ type: 'success', title: 'Canal atualizado' });
      } else {
        await createChannel(payload);
        notify({ type: 'success', title: 'Canal criado' });
      }
      setModalOpen(false);
      await fetchChannels();
    } catch (error) {
      notify({ type: 'error', title: 'Erro ao salvar canal' });
    }
  });

  const handleDisable = async (channel: ChannelSummary) => {
    const confirmMsg = channel.channel.enabled
      ? 'Deseja desativar este canal?'
      : 'Deseja reativar este canal?';
    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      if (channel.channel.enabled) {
        await disableChannel(channel.channel.id);
      } else {
        await updateChannel(channel.channel.id, { enabled: true, name: channel.channel.name, type: channel.channel.type });
      }
      notify({ type: 'success', title: 'Status atualizado' });
      await fetchChannels();
    } catch (error) {
      notify({ type: 'error', title: 'Erro ao atualizar status' });
    }
  };

  const typeDefinition = TYPE_DEFINITIONS[selectedType];

  const maskHint = useMemo(
    () =>
      Object.entries(existingSecrets)
        .filter(([, hasValue]) => hasValue)
        .map(([key]) => key),
    [existingSecrets]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Canais</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Gerencie instâncias de canais e segredos criptografados.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
        >
          <PlusIcon className="mr-2 h-4 w-4" /> Novo canal
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Criado</th>
              <th className="px-4 py-3">Atualizado</th>
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                  Carregando...
                </td>
              </tr>
            ) : channels.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                  Nenhum canal cadastrado.
                </td>
              </tr>
            ) : (
              channels.map((summary) => (
                <tr key={summary.channel.id}>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{summary.channel.name}</td>
                  <td className="px-4 py-3 capitalize text-slate-600 dark:text-slate-300">{summary.channel.type.replace('_', ' ')}</td>
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                        summary.channel.enabled
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                          : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                      )}
                    >
                      {summary.channel.enabled ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {dayjs(summary.channel.createdAt).format('DD/MM/YYYY HH:mm')}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {dayjs(summary.channel.updatedAt).format('DD/MM/YYYY HH:mm')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(summary)}
                        className="inline-flex items-center rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <PencilSquareIcon className="mr-1 h-4 w-4" />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDisable(summary)}
                        className="inline-flex items-center rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <PowerIcon className="mr-1 h-4 w-4" />
                        {summary.channel.enabled ? 'Desativar' : 'Ativar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Transition appear show={modalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setModalOpen(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-slate-900/50" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all dark:bg-slate-900">
                  <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {selectedChannel ? 'Editar canal' : 'Novo canal'}
                  </Dialog.Title>
                  <form onSubmit={onSubmit} className="mt-6 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nome</label>
                        <input
                          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          {...register('name', { required: true })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tipo</label>
                        <select
                          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          {...register('type', { required: true })}
                          disabled={Boolean(selectedChannel)}
                        >
                          {Object.entries(TYPE_DEFINITIONS).map(([value, def]) => (
                            <option key={value} value={value}>
                              {def.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
                      <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Canal ativo</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Ao desativar, o canal fica indisponível para uso.</p>
                      </div>
                      <Switch
                        checked={enabled}
                        onChange={(checked) => setValue('enabled', checked)}
                        className={clsx(
                          enabled ? 'bg-primary-600' : 'bg-slate-200 dark:bg-slate-700',
                          'relative inline-flex h-6 w-11 items-center rounded-full transition'
                        )}
                      >
                        <span
                          className={clsx(
                            enabled ? 'translate-x-6' : 'translate-x-1',
                            'inline-block h-4 w-4 transform rounded-full bg-white transition'
                          )}
                        />
                      </Switch>
                    </div>

                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Parâmetros</h3>
                      {typeDefinition.params.map((field) => (
                        <div key={field.key}>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{field.label}</label>
                          <input
                            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            type={field.type === 'number' ? 'number' : 'text'}
                            placeholder={field.placeholder}
                            {...register(`params.${field.key}` as const)}
                          />
                        </div>
                      ))}
                    </section>

                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Segredos</h3>
                      {maskHint.length > 0 && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Segredos existentes: {maskHint.join(', ')}. Para mantê-los, deixe os campos em branco.
                        </p>
                      )}
                      {typeDefinition.secrets.map((field) => (
                        <div key={field.key}>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{field.label}</label>
                          <input
                            type="password"
                            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            placeholder={existingSecrets[field.key] ? '••••••' : ''}
                            {...register(`secrets.${field.key}` as const)}
                          />
                        </div>
                      ))}
                    </section>

                    <div className="flex justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => setModalOpen(false)}
                        className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
                      >
                        Salvar
                      </button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
};

export default ChannelsPage;
