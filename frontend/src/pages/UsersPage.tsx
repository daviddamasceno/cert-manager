import { Fragment, useEffect, useMemo, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { useForm } from 'react-hook-form';
import {
  PlusIcon,
  PencilSquareIcon,
  PowerIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import dayjs from 'dayjs';
import { isAxiosError } from 'axios';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { User, UserRole, UserStatus } from '../types';
import {
  activateUser,
  createUser,
  disableUser,
  listUsers,
  resetUserPassword,
  updateUser
} from '../services/users';

const roleLabels: Record<UserRole, string> = {
  admin: 'Administrador',
  editor: 'Editor',
  viewer: 'Visualizador'
};

const statusLabels: Record<UserStatus, string> = {
  active: 'Ativo',
  disabled: 'Desativado',
  inactive: 'Inativo'
};

type EditableStatus = Exclude<UserStatus, 'inactive'>;

type FormValues = {
  email: string;
  name: string;
  role: UserRole;
  status: EditableStatus;
};

const defaultValues: FormValues = {
  email: '',
  name: '',
  role: 'viewer',
  status: 'active'
};

const formatDateTime = (value?: string): string => {
  if (!value) {
    return '—';
  }
  return dayjs(value).format('DD/MM/YYYY HH:mm');
};

const extractMessage = (error: unknown, fallback: string): string => {
  if (isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message ?? fallback;
  }
  return fallback;
};

const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [recentPassword, setRecentPassword] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | EditableStatus>('all');
  const { notify } = useToast();
  const { user: currentUser } = useAuth();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<FormValues>({
    defaultValues
  });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await listUsers();
      setUsers(data);
    } catch (error) {
      notify({ type: 'error', title: 'Falha ao carregar usuários' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openCreateModal = () => {
    setFormMode('create');
    setSelectedUser(null);
    setRecentPassword(null);
    reset({ ...defaultValues });
    setModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setFormMode('edit');
    setSelectedUser(user);
    setRecentPassword(null);
    reset({
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status === 'disabled' ? 'disabled' : 'active'
    });
    setModalOpen(true);
  };

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      if (formMode === 'create') {
        const { temporaryPassword } = await createUser({
          email: values.email,
          name: values.name,
          role: values.role
        });
        notify({
          type: 'success',
          title: 'Usuário criado',
          description: `Senha temporária: ${temporaryPassword}`
        });
        setModalOpen(false);
        await fetchUsers();
      } else if (selectedUser) {
        await updateUser(selectedUser.id, {
          name: values.name,
          role: values.role,
          status: values.status
        });
        notify({ type: 'success', title: 'Usuário atualizado' });
        setModalOpen(false);
        await fetchUsers();
      }
    } catch (error) {
      const fallback = formMode === 'create' ? 'Erro ao criar usuário' : 'Erro ao atualizar usuário';
      notify({ type: 'error', title: extractMessage(error, fallback) });
    } finally {
      setSubmitting(false);
    }
  });

  const handleToggleStatus = async (user: User) => {
    const isSelf = currentUser?.id === user.id;
    if (isSelf) {
      notify({ type: 'error', title: 'Você não pode alterar seu próprio status.' });
      return;
    }

    try {
      if (user.status === 'disabled') {
        await activateUser(user.id);
        notify({ type: 'success', title: 'Usuário reativado' });
      } else {
        const confirmed = window.confirm('Deseja realmente desativar este usuário?');
        if (!confirmed) {
          return;
        }
        await disableUser(user.id);
        notify({ type: 'success', title: 'Usuário desativado' });
      }
      await fetchUsers();
    } catch (error) {
      notify({ type: 'error', title: extractMessage(error, 'Erro ao atualizar status') });
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser) {
      return;
    }
    setResetting(true);
    try {
      const { temporaryPassword } = await resetUserPassword(selectedUser.id);
      setRecentPassword(temporaryPassword);
      notify({
        type: 'success',
        title: 'Senha redefinida',
        description: 'Compartilhe a nova senha temporária com o usuário.'
      });
    } catch (error) {
      notify({ type: 'error', title: extractMessage(error, 'Não foi possível redefinir a senha') });
    } finally {
      setResetting(false);
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      if (roleFilter !== 'all' && user.role !== roleFilter) {
        return false;
      }
      if (statusFilter !== 'all') {
        if (statusFilter === 'active' && user.status !== 'active') {
          return false;
        }
        if (statusFilter === 'disabled' && user.status !== 'disabled') {
          return false;
        }
      }
      return true;
    });
  }, [users, roleFilter, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Usuários</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Gerencie acessos ao painel e mantenha as permissões atualizadas.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
        >
          <PlusIcon className="mr-2 h-4 w-4" aria-hidden="true" />
          Novo usuário
        </button>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-4 sm:flex-row">
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-medium text-slate-600 dark:text-slate-300">Filtrar por perfil</span>
            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as typeof roleFilter)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="all">Todos</option>
              <option value="admin">Administradores</option>
              <option value="editor">Editores</option>
              <option value="viewer">Visualizadores</option>
            </select>
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-medium text-slate-600 dark:text-slate-300">Filtrar por status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="disabled">Desativados</option>
            </select>
          </label>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">{filteredUsers.length} usuário(s) encontrado(s)</p>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Perfil</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Último acesso</th>
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                  Carregando usuários...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const isSelf = currentUser?.id === user.id;
                return (
                  <tr key={user.id}>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{user.name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{user.email}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{roleLabels[user.role]}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                          user.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                            : 'bg-slate-200 text-slate-700 dark:bg-slate-700/50 dark:text-slate-200'
                        }`}
                      >
                        {statusLabels[user.status] ?? user.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{formatDateTime(user.lastLoginAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(user)}
                          className="inline-flex items-center rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <PencilSquareIcon className="mr-1 h-4 w-4" aria-hidden="true" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(user)}
                          disabled={isSelf}
                          className="inline-flex items-center rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <PowerIcon className="mr-1 h-4 w-4" aria-hidden="true" />
                          {user.status === 'disabled' ? 'Reativar' : 'Desativar'}
                        </button>
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
                    {formMode === 'create' ? 'Novo usuário' : 'Editar usuário'}
                  </Dialog.Title>
                  <form onSubmit={onSubmit} className="mt-6 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">E-mail</label>
                        <input
                          type="email"
                          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          {...register('email', {
                            required: 'Informe o e-mail',
                            pattern: {
                              value: /.+@.+\..+/, // validação básica
                              message: 'E-mail inválido'
                            }
                          })}
                          disabled={formMode === 'edit'}
                        />
                        {errors.email ? (
                          <span className="mt-1 block text-xs text-rose-500">{errors.email.message}</span>
                        ) : null}
                      </div>
                      <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nome</label>
                        <input
                          type="text"
                          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          {...register('name', { required: 'Informe o nome' })}
                        />
                        {errors.name ? (
                          <span className="mt-1 block text-xs text-rose-500">{errors.name.message}</span>
                        ) : null}
                      </div>
                      <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Perfil</label>
                        <select
                          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          {...register('role', { required: 'Selecione um perfil' })}
                        >
                          <option value="admin">Administrador</option>
                          <option value="editor">Editor</option>
                          <option value="viewer">Visualizador</option>
                        </select>
                      </div>
                      {formMode === 'edit' ? (
                        <div className="md:col-span-1">
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Status</label>
                          <select
                            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            {...register('status')}
                          >
                            <option value="active">Ativo</option>
                            <option value="disabled">Desativado</option>
                          </select>
                        </div>
                      ) : null}
                    </div>

                    {formMode === 'edit' ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Redefinir senha</h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          Gere uma nova senha temporária para o usuário. Ele será solicitado a alterá-la no próximo login.
                        </p>
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                          <button
                            type="button"
                            onClick={handleResetPassword}
                            disabled={resetting}
                            className="inline-flex items-center rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <ArrowPathIcon className={`mr-2 h-4 w-4 ${resetting ? 'animate-spin' : ''}`} aria-hidden="true" />
                            {resetting ? 'Gerando...' : 'Gerar nova senha'}
                          </button>
                          {recentPassword ? (
                            <span className="inline-flex items-center rounded-md bg-slate-900 px-3 py-2 text-xs font-mono text-slate-100 dark:bg-slate-700">
                              {recentPassword}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        onClick={() => setModalOpen(false)}
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="inline-flex items-center rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {submitting ? 'Salvando...' : 'Salvar'}
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

export default UsersPage;
