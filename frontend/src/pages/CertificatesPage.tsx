import { Fragment, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  listCertificates,
  createCertificate,
  updateCertificate,
  deleteCertificate,
  sendTestNotification
} from '../services/certificates';
import { listAlertModels } from '../services/alertModels';
import { listChannels } from '../services/channels';
import { AlertModel, Certificate, ChannelSummary, ChannelType } from '../types';
import { Dialog, Transition } from '@headlessui/react';
import { PlusIcon, PencilSquareIcon, TrashIcon, PaperAirplaneIcon, TagIcon } from '@heroicons/react/24/outline';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import clsx from 'clsx';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

dayjs.extend(relativeTime);

interface CertificateFormValues {
  name: string;
  ownerEmail: string;
  issuedAt: string;
  expiresAt: string;
  status: Certificate['status'];
  alertModelId?: string;
  notes?: string;
  channelIds: string[];
}

const defaultFormValues: CertificateFormValues = {
  name: '',
  ownerEmail: '',
  issuedAt: dayjs().format('YYYY-MM-DD'),
  expiresAt: dayjs().add(90, 'day').format('YYYY-MM-DD'),
  status: 'active',
  alertModelId: '',
  notes: '',
  channelIds: []
};

const statusLabels: Record<string, string> = {
  active: 'Ativo',
  expired: 'Expirado',
  revoked: 'Revogado'
};

const CHANNEL_TYPE_LABELS: Record<ChannelType, string> = {
  email_smtp: 'SMTP',
  telegram_bot: 'Telegram',
  slack_webhook: 'Slack',
  googlechat_webhook: 'Google Chat'
};

const CertificatesPage: React.FC = () => {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [alertModels, setAlertModels] = useState<AlertModel[]>([]);
  const [channelSummaries, setChannelSummaries] = useState<ChannelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCertificate, setSelectedCertificate] = useState<Certificate | null>(null);
  const { notify } = useToast();
  const { user } = useAuth();
  const canManage = user?.role === 'admin' || user?.role === 'editor';

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors }
  } = useForm<CertificateFormValues>({
    defaultValues: defaultFormValues
  });

  useEffect(() => {
    register('channelIds');
  }, [register]);

  const selectedChannelIds = watch('channelIds') ?? [];

  const channelMap = useMemo(() => {
    const map: Record<string, ChannelSummary> = {};
    channelSummaries.forEach((summary) => {
      map[summary.channel.id] = summary;
    });
    return map;
  }, [channelSummaries]);

  const activeChannels = useMemo(
    () => channelSummaries.filter((summary) => summary.channel.enabled),
    [channelSummaries]
  );

  const groupedChannels = useMemo(() => {
    const groups = new Map<ChannelType, ChannelSummary[]>();
    activeChannels.forEach((summary) => {
      const current = groups.get(summary.channel.type) ?? [];
      current.push(summary);
      groups.set(summary.channel.type, current);
    });
    return groups;
  }, [activeChannels]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [certs, models, channels] = await Promise.all([
        listCertificates(),
        listAlertModels(),
        listChannels()
      ]);
      setCertificates(certs);
      setAlertModels(models);
      setChannelSummaries(channels);
    } catch (error) {
      notify({ type: 'error', title: 'Falha ao carregar dados' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openModalForCreate = () => {
    if (!canManage) {
      return;
    }
    reset({ ...defaultFormValues });
    setSelectedCertificate(null);
    setModalOpen(true);
  };

  const openModalForEdit = (certificate: Certificate) => {
    if (!canManage) {
      return;
    }
    reset({
      name: certificate.name,
      ownerEmail: certificate.ownerEmail,
      issuedAt: certificate.issuedAt ? dayjs(certificate.issuedAt).format('YYYY-MM-DD') : '',
      expiresAt: certificate.expiresAt ? dayjs(certificate.expiresAt).format('YYYY-MM-DD') : '',
      status: certificate.status,
      alertModelId: certificate.alertModelId ?? '',
      notes: certificate.notes ?? '',
      channelIds: certificate.channelIds ?? []
    });
    setSelectedCertificate(certificate);
    setModalOpen(true);
  };

  const onSubmit = handleSubmit(async (values) => {
    if (!canManage) {
      return;
    }
    try {
      const payload: Partial<Certificate> = {
        name: values.name,
        ownerEmail: values.ownerEmail,
        issuedAt: values.issuedAt,
        expiresAt: values.expiresAt,
        status: values.status,
        alertModelId: values.alertModelId ? values.alertModelId : undefined,
        notes: values.notes?.trim() ? values.notes : undefined,
        channelIds: values.channelIds
      };

      if (selectedCertificate) {
        await updateCertificate(selectedCertificate.id, payload);
        notify({ type: 'success', title: 'Certificado atualizado' });
      } else {
        await createCertificate(payload);
        notify({ type: 'success', title: 'Certificado criado' });
      }

      setModalOpen(false);
      await fetchData();
    } catch (error) {
      notify({ type: 'error', title: 'Erro ao salvar certificado' });
    }
  });

  const handleDelete = async (certificate: Certificate) => {
    if (!canManage) {
      return;
    }
    if (!window.confirm(`Deseja remover ${certificate.name}?`)) {
      return;
    }
    try {
      await deleteCertificate(certificate.id);
      notify({ type: 'success', title: 'Certificado removido' });
      await fetchData();
    } catch (error) {
      notify({ type: 'error', title: 'Erro ao remover certificado' });
    }
  };

  const handleTestNotification = async (certificate: Certificate) => {
    if (!canManage) {
      return;
    }
    try {
      await sendTestNotification(certificate.id);
      notify({ type: 'success', title: 'Teste enviado' });
    } catch (error) {
      notify({ type: 'error', title: 'Não foi possível enviar o teste' });
    }
  };

  const handleChannelToggle = (channelId: string) => {
    const current = new Set(selectedChannelIds ?? []);
    if (current.has(channelId)) {
      current.delete(channelId);
    } else {
      current.add(channelId);
    }
    setValue('channelIds', Array.from(current), { shouldDirty: true });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Certificados</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Cadastre certificados, defina canais e vincule modelos de alerta.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={openModalForCreate}
            className="inline-flex items-center rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
          >
            <PlusIcon className="mr-2 h-4 w-4" aria-hidden="true" />
            Novo certificado
          </button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Responsável</th>
              <th className="px-4 py-3">Expiração</th>
              <th className="px-4 py-3">Canais</th>
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500 dark:text-slate-400" colSpan={5}>
                  Carregando...
                </td>
              </tr>
            ) : certificates.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500 dark:text-slate-400" colSpan={5}>
                  Nenhum certificado cadastrado.
                </td>
              </tr>
            ) : (
              certificates.map((certificate) => {
                const daysLeft = dayjs(certificate.expiresAt).diff(dayjs(), 'day');
                const channelLabels = certificate.channelIds
                  .map((id) => channelMap[id]?.channel.name)
                  .filter(Boolean);

                return (
                  <tr key={certificate.id}>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{certificate.name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{certificate.ownerEmail}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {dayjs(certificate.expiresAt).format('DD/MM/YYYY')} ({dayjs(certificate.expiresAt).fromNow()})
                    </td>
                    <td className="px-4 py-3">
                      {channelLabels.length ? (
                        <div className="flex flex-wrap gap-1">
                          {channelLabels.map((label) => (
                            <span
                              key={label}
                              className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                            >
                              <TagIcon className="h-3 w-3" />
                              {label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400">Nenhum canal</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        {canManage ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openModalForEdit(certificate)}
                              className="inline-flex items-center rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              <PencilSquareIcon className="mr-1 h-4 w-4" /> Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTestNotification(certificate)}
                              className="inline-flex items-center rounded-md border border-primary-500 px-2 py-1 text-xs text-primary-600 hover:bg-primary-50 dark:border-primary-500/60 dark:text-primary-300 dark:hover:bg-primary-500/10"
                            >
                              <PaperAirplaneIcon className="mr-1 h-4 w-4" /> Enviar teste
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(certificate)}
                              className="inline-flex items-center rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:border-rose-500/60 dark:text-rose-300 dark:hover:bg-rose-500/10"
                            >
                              <TrashIcon className="mr-1 h-4 w-4" /> Remover
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">Somente leitura</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
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
                    {selectedCertificate ? 'Editar certificado' : 'Novo certificado'}
                  </Dialog.Title>
                  <form onSubmit={onSubmit} className="mt-6 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nome</label>
                        <input
                          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          {...register('name', { required: 'Informe o nome' })}
                        />
                        {errors.name && <span className="mt-1 block text-xs text-rose-500">{errors.name.message}</span>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">E-mail do responsável</label>
                        <input
                          type="email"
                          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          {...register('ownerEmail', { required: 'Informe o e-mail' })}
                        />
                        {errors.ownerEmail && (
                          <span className="mt-1 block text-xs text-rose-500">{errors.ownerEmail.message}</span>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Data de emissão</label>
                        <input
                          type="date"
                          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          {...register('issuedAt', { required: true })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Data de expiração</label>
                        <input
                          type="date"
                          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          {...register('expiresAt', { required: true })}
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Status</label>
                        <select
                          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          {...register('status', { required: true })}
                        >
                          <option value="active">Ativo</option>
                          <option value="expired">Expirado</option>
                          <option value="revoked">Revogado</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Modelo de alerta</label>
                        <select
                          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          {...register('alertModelId')}
                        >
                          <option value="">Selecionar modelo</option>
                          {alertModels.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Canais vinculados</h3>
                      {activeChannels.length === 0 ? (
                        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                          Nenhuma instância de canal ativa cadastrada.
                        </p>
                      ) : (
                        <div className="mt-3 space-y-4">
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Selecione uma ou mais instâncias ativas. Os canais estão agrupados pelo tipo configurado.
                          </p>
                          <div className="space-y-4">
                            {(Object.keys(CHANNEL_TYPE_LABELS) as ChannelType[]).map((type) => {
                              const group = groupedChannels.get(type);
                              if (!group || group.length === 0) {
                                return null;
                              }

                              return (
                                <div key={type} className="space-y-2">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    {CHANNEL_TYPE_LABELS[type]}
                                  </p>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {group.map((summary) => {
                                      const channelId = summary.channel.id;
                                      const isSelected = selectedChannelIds.includes(channelId);
                                      const inputId = `channel-${channelId}`;

                                      return (
                                        <label
                                          key={channelId}
                                          htmlFor={inputId}
                                          className={clsx(
                                            'flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 transition focus-within:outline-none focus-within:ring-2 focus-within:ring-primary-500 hover:border-primary-500/60 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:border-primary-500/60 dark:hover:bg-slate-800',
                                            {
                                              'border-primary-500/80 bg-primary-500/5 dark:border-primary-500/60 dark:bg-primary-500/10': isSelected
                                            }
                                          )}
                                        >
                                          <input
                                            id={inputId}
                                            type="checkbox"
                                            value={channelId}
                                            checked={isSelected}
                                            onChange={() => handleChannelToggle(channelId)}
                                            className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-2 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-900 dark:text-primary-400"
                                          />
                                          <span className="flex flex-col text-left text-slate-700 dark:text-slate-200">
                                            <span className="font-medium text-slate-800 dark:text-slate-100">
                                              {summary.channel.name}
                                            </span>
                                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                              {CHANNEL_TYPE_LABELS[summary.channel.type]}
                                            </span>
                                          </span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {selectedChannelIds.length > 0 ? (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Selecionados:{' '}
                              {selectedChannelIds
                                .map((id) => channelMap[id]?.channel.name || id)
                                .join(', ')}
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Observações</label>
                      <textarea
                        rows={3}
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        {...register('notes')}
                      />
                    </div>

                    <div className="flex justify-end space-x-2 pt-2">
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

export default CertificatesPage;
