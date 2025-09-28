import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { listAlertModels, createAlertModel, updateAlertModel, deleteAlertModel } from '../services/alertModels';
import { AlertModel } from '../types';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { PlusIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

interface AlertModelFormValues {
  name: string;
  offsetDaysBefore: number;
  offsetDaysAfter?: number;
  repeatEveryDays?: number;
  templateSubject: string;
  templateBody: string;
}

const defaultValues: AlertModelFormValues = {
  name: '',
  offsetDaysBefore: 30,
  offsetDaysAfter: undefined,
  repeatEveryDays: undefined,
  templateSubject: 'Alerta: certificado {{name}} vence em {{days_left}} dias',
  templateBody:
    'Olá,\n\nO certificado {{name}} irá expirar em {{days_left}} dias ({{expires_at}}).\nPor favor, providencie a renovação.\n\nEquipe Cert Manager.'
};

const AlertModelsPage: React.FC = () => {
  const [alertModels, setAlertModels] = useState<AlertModel[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<AlertModel | null>(null);
  const { notify } = useToast();
  const { user } = useAuth();
  const canManage = user?.role === 'admin' || user?.role === 'editor';
  const { register, handleSubmit, reset, formState } = useForm<AlertModelFormValues>({ defaultValues });

  const fetchData = async () => {
    const data = await listAlertModels();
    setAlertModels(data);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreate = () => {
    if (!canManage) {
      return;
    }
    reset(defaultValues);
    setSelectedModel(null);
    setModalOpen(true);
  };

  const openEdit = (model: AlertModel) => {
    if (!canManage) {
      return;
    }
    reset({
      name: model.name,
      offsetDaysBefore: model.offsetDaysBefore,
      offsetDaysAfter: model.offsetDaysAfter,
      repeatEveryDays: model.repeatEveryDays,
      templateSubject: model.templateSubject,
      templateBody: model.templateBody
    });
    setSelectedModel(model);
    setModalOpen(true);
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      const payload: Partial<AlertModel> = {
        ...values,
        offsetDaysAfter: Number.isFinite(values.offsetDaysAfter) ? values.offsetDaysAfter : undefined,
        repeatEveryDays: Number.isFinite(values.repeatEveryDays) ? values.repeatEveryDays : undefined
      };

      if (selectedModel) {
        await updateAlertModel(selectedModel.id, payload);
        notify({ type: 'success', title: 'Modelo atualizado' });
      } else {
        await createAlertModel(payload);
        notify({ type: 'success', title: 'Modelo criado' });
      }
      setModalOpen(false);
      await fetchData();
    } catch (error) {
      notify({ type: 'error', title: 'Erro ao salvar modelo' });
    }
  });

  const handleDelete = async (model: AlertModel) => {
    if (!canManage) {
      return;
    }
    if (!confirm(`Deseja remover ${model.name}?`)) {
      return;
    }
    try {
      await deleteAlertModel(model.id);
      notify({ type: 'success', title: 'Modelo removido' });
      await fetchData();
    } catch (error) {
      notify({ type: 'error', title: 'Erro ao remover modelo' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Modelos de alerta</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Configure regras de disparo e personalize os templates dos avisos.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
          >
            <PlusIcon className="mr-2 h-4 w-4" aria-hidden="true" />
            Novo modelo
          </button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Antes (dias)</th>
              <th className="px-4 py-3">Depois (dias)</th>
              <th className="px-4 py-3">Repetição</th>
              {canManage ? <th className="px-4 py-3">Ações</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
            {alertModels.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 5 : 4} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                  Nenhum modelo cadastrado.
                </td>
              </tr>
            ) : (
              alertModels.map((model) => (
                <tr key={model.id}>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{model.name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{model.offsetDaysBefore}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{model.offsetDaysAfter ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{model.repeatEveryDays ?? '—'}</td>
                  {canManage ? (
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => openEdit(model)}
                          className="inline-flex items-center rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <PencilSquareIcon className="mr-1 h-4 w-4" /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(model)}
                          className="inline-flex items-center rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:border-rose-500/60 dark:text-rose-300 dark:hover:bg-rose-500/10"
                        >
                          <TrashIcon className="mr-1 h-4 w-4" /> Remover
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Transition appear show={modalOpen && canManage} as={Fragment}>
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
                    {selectedModel ? 'Editar modelo' : 'Novo modelo'}
                  </Dialog.Title>
                  <form onSubmit={onSubmit} className="mt-6 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nome</label>
                        <input
                          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          {...register('name', { required: 'Informe o nome' })}
                        />
                        {formState.errors.name ? (
                          <span className="mt-1 block text-xs text-rose-500">{formState.errors.name.message}</span>
                        ) : null}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Dias antes da expiração</label>
                        <input
                          type="number"
                          min={0}
                          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          {...register('offsetDaysBefore', { valueAsNumber: true, required: true })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Dias após expiração</label>
                        <input
                          type="number"
                          min={0}
                          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          {...register('offsetDaysAfter', { valueAsNumber: true })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Repetir a cada (dias)</label>
                        <input
                          type="number"
                          min={0}
                          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          {...register('repeatEveryDays', { valueAsNumber: true })}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Assunto</label>
                      <input
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        {...register('templateSubject', { required: true })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Corpo da mensagem <span className="text-xs text-slate-400">Use placeholders: {'{{name}}'}, {'{{expires_at}}'}, {'{{days_left}}'}</span>
                      </label>
                      <textarea
                        rows={6}
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        {...register('templateBody', { required: true })}
                      />
                    </div>

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

export default AlertModelsPage;
