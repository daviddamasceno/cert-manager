import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { useForm } from 'react-hook-form';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  createUser,
  disableUser,
  listUsers,
  resetUserPassword,
  updateUser
} from '../services/users';
import { User, UserRole, UserStatus } from '../types';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import {
  ArrowPathIcon,
  PencilSquareIcon,
  PlusIcon,
  PowerIcon,
  KeyIcon
} from '@heroicons/react/24/outline';
import clsx from 'clsx';

dayjs.extend(relativeTime);

interface CreateFormValues {
  name: string;
  email: string;
  role: UserRole;
}

interface EditFormValues {
  name: string;
  role: UserRole;
  status: Exclude<UserStatus, 'inactive'>;
}

interface FilterState {
  search: string;
  role: 'all' | UserRole;
  status: 'all' | UserStatus;
}

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

const statusStyles: Record<UserStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  disabled: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  inactive: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
};

const createDefaults: CreateFormValues = {
  name: '',
  email: '',
  role: 'editor'
};

const editDefaults: EditFormValues = {
  name: '',
  role: 'viewer',
  status: 'active'
};

const getErrorMessage = (error: unknown): string | undefined => {
  if (error && typeof error === 'object') {
    const message = (error as any)?.response?.data?.message || (error as any)?.message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return undefined;
};

const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({ search: '', role: 'all', status: 'all' });
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);
  const { notify } = useToast();
  const { user: currentUser } = useAuth();

  const {
    register: registerCreate,
    handleSubmit: handleCreateSubmit,
    reset: resetCreate,
    formState: { errors: createErrors }
  } = useForm<CreateFormValues>({ defaultValues: createDefaults });

  const {
    register: registerEdit,
    handleSubmit: handleEditSubmit,
    reset: resetEdit,
    formState: { errors: editErrors }
  } = useForm<EditFormValues>({ defaultValues: editDefaults });

  const fetchUsers = useCallback(
    async (showLoading = false) => {
      if (showLoading) {
        setLoading(true);
      }
      try {
        const data = await listUsers();
        setUsers(data);
      } catch (error) {
        const message = getErrorMessage(error) ?? 'Não foi possível carregar os usuários.';
        notify({ type: 'error', title: 'Erro ao carregar usuários', description: message });
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [notify]
  );

  useEffect(() => {
    fetchUsers(true);
  }, [fetchUsers]);

  const filteredUsers = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesRole = filters.role === 'all' || user.role === filters.role;
      const matchesStatus = filters.status === 'all' || user.status === filters.status;
      const matchesQuery =
        query.length === 0 ||
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query);
      return matchesRole && matchesStatus && matchesQuery;
    });
  }, [users, filters]);

  const openCreateModal = () => {
    resetCreate(createDefaults);
    setCreateOpen(true);
  };

  const openEditModal = (user: User) => {
    resetEdit({
      name: user.name,
      role: user.role,
      status: user.status === 'disabled' ? 'disabled' : 'active'
    });
    setSelectedUser(user);
    setEditOpen(true);
  };

  const closeEditModal = () => {
    setEditOpen(false);
    setSelectedUser(null);
  };

  const onCreate = handleCreateSubmit(async (values) => {
    setCreating(true);
    try {
      const { temporaryPassword } = await createUser({
        name: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        role: values.role
      });
      notify({
        type: 'success',
        title: 'Usuário criado',
        description: `Senha temporária: ${temporaryPassword}`
      });
      setCreateOpen(false);
      resetCreate(createDefaults);
      await fetchUsers();
    } catch (error) {
      const message = getErrorMessage(error) ?? 'Não foi possível criar o usuário.';
      notify({ type: 'error', title: 'Erro ao criar usuário', description: message });
    } finally {
      setCreating(false);
    }
  });

  const onEdit = handleEditSubmit(async (values) => {
    if (!selectedUser) {
      return;
    }
    setSaving(true);
    try {
      await updateUser(selectedUser.id, {
        name: values.name.trim(),
        role: values.role,
        status: values.status
      });
      notify({ type: 'success', title: 'Usuário atualizado' });
      closeEditModal();
      await fetchUsers();
    } catch (error) {
      const message = getErrorMessage(error) ?? 'Não foi possível atualizar o usuário.';
      notify({ type: 'error', title: 'Erro ao atualizar usuário', description: message });
    } finally {
      setSaving(false);
    }
  });

  const handleToggleStatus = async (user: User) => {
    const disabling = user.status === 'active';
    const actionLabel = disabling ? 'desativar' : 'reativar';

    if (disabling && currentUser?.id === user.id) {
      notify({ type: 'error', title: 'Ação não permitida', description: 'Você não pode desativar o próprio acesso.' });
      return;
    }

    if (!window.confirm(`Deseja ${actionLabel} ${user.name}?`)) {
      return;
    }

    setProcessingUserId(user.id);
    try {
      if (disabling) {
        await disableUser(user.id);
      } else {
        await updateUser(user.id, { status: 'active' });
      }
      notify({ type: 'success', title: 'Status atualizado' });
      await fetchUsers();
    } catch (error) {
      const message = getErrorMessage(error) ?? 'Não foi possível atualizar o status.';
      notify({ type: 'error', title: 'Erro ao atualizar status', description: message });
    } finally {
      setProcessingUserId(null);
    }
  };

  const handleResetPassword = async (user: User) => {
    if (!window.confirm(`Gerar nova senha temporária para ${user.name}?`)) {
      return;
    }
    setProcessingUserId(user.id);
    try {
      const { temporaryPassword } = await resetUserPassword(user.id);
      notify({
        type: 'success',
        title: 'Senha redefinida',
        description: `Nova senha temporária: ${temporaryPassword}`
      });
    } catch (error) {
      const message = getErrorMessage(error) ?? 'Não foi possível redefinir a senha.';
      notify({ type: 'error', title: 'Erro ao redefinir senha', description: message });
    } finally {
      setProcessingUserId(null);
    }
  };

  const roleOptions: Array<{ label: string; value: UserRole }> = [
    { label: 'Administrador', value: 'admin' },
    { label: 'Editor', value: 'editor' },
    { label: 'Visualizador', value: 'viewer' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Usuários</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Controle quem pode administrar certificados e acompanhar alertas.
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

      <div className="grid gap-3 md:grid-cols-3">
        <div className="col-span-1 md:col-span-1">
          <label className="sr-only" htmlFor="user-search">
            Buscar
          </label>
          <input
            id="user-search"
            type="search"
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            placeholder="Buscar por nome ou e-mail"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div>
          <label className="sr-only" htmlFor="user-role-filter">
            Filtrar por perfil
          </label>
          <select
            id="user-role-filter"
            value={filters.role}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, role: event.target.value as FilterState['role'] }))
            }
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="all">Todos os perfis</option>
            <option value="admin">Administradores</option>
            <option value="editor">Editores</option>
            <option value="viewer">Visualizadores</option>
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor="user-status-filter">
            Filtrar por status
          </label>
          <select
            id="user-status-filter"
            value={filters.status}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, status: event.target.value as FilterState['status'] }))
            }
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="all">Todos os status</option>
            <option value="active">Ativos</option>
            <option value="disabled">Desativados</option>
            <option value="inactive">Inativos</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
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
                const lastSeen = user.lastLoginAt
                  ? `${dayjs(user.lastLoginAt).fromNow()} · ${dayjs(user.lastLoginAt).format('DD/MM/YYYY HH:mm')}`
                  : 'Nunca acessou';

                return (
                  <tr key={user.id}>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{user.name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                        {roleLabels[user.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', statusStyles[user.status])}>
                        {statusLabels[user.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{lastSeen}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(user)}
                          className="inline-flex items-center rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <PencilSquareIcon className="mr-1 h-4 w-4" /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResetPassword(user)}
                          className="inline-flex items-center rounded-md border border-primary-500 px-2 py-1 text-xs text-primary-600 hover:bg-primary-50 dark:border-primary-500/60 dark:text-primary-300 dark:hover:bg-primary-500/10"
                          disabled={processingUserId === user.id}
                        >
                          <KeyIcon className="mr-1 h-4 w-4" />
                          {processingUserId === user.id ? 'Gerando...' : 'Resetar senha'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(user)}
                          className="inline-flex items-center rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          disabled={processingUserId === user.id}
                        >
                          <PowerIcon className="mr-1 h-4 w-4" />
                          {processingUserId === user.id
                            ? 'Atualizando...'
                            : user.status === 'active'
                            ? 'Desativar'
                            : 'Reativar'}
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

      <Transition appear show={createOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setCreateOpen(false)}>
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
                <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all dark:bg-slate-900">
                  <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Novo usuário
                  </Dialog.Title>
                  <form onSubmit={onCreate} className="mt-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nome</label>
                      <input
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        {...registerCreate('name', { required: 'Informe o nome completo' })}
                      />
                      {createErrors.name && (
                        <span className="mt-1 block text-xs text-rose-500">{createErrors.name.message}</span>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">E-mail</label>
                      <input
                        type="email"
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        {...registerCreate('email', { required: 'Informe um e-mail válido' })}
                      />
                      {createErrors.email && (
                        <span className="mt-1 block text-xs text-rose-500">{createErrors.email.message}</span>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Perfil</label>
                      <select
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        {...registerCreate('role', { required: true })}
                      >
                        {roleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex justify-end space-x-3">
                      <button
                        type="button"
                        onClick={() => setCreateOpen(false)}
                        className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        disabled={creating}
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="inline-flex items-center rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
                        disabled={creating}
                      >
                        {creating ? (
                          <>
                            <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" /> Salvando...
                          </>
                        ) : (
                          'Criar usuário'
                        )}
                      </button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      <Transition appear show={editOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={closeEditModal}>
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
                <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all dark:bg-slate-900">
                  <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Editar usuário
                  </Dialog.Title>
                  <form onSubmit={onEdit} className="mt-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nome</label>
                      <input
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        {...registerEdit('name', { required: 'Informe o nome completo' })}
                      />
                      {editErrors.name && (
                        <span className="mt-1 block text-xs text-rose-500">{editErrors.name.message}</span>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Perfil</label>
                      <select
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        {...registerEdit('role', { required: true })}
                      >
                        {roleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Status</label>
                      <select
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        {...registerEdit('status', { required: true })}
                      >
                        <option value="active">Ativo</option>
                        <option value="disabled">Desativado</option>
                      </select>
                    </div>
                    <div className="flex justify-end space-x-3">
                      <button
                        type="button"
                        onClick={closeEditModal}
                        className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        disabled={saving}
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="inline-flex items-center rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
                        disabled={saving}
                      >
                        {saving ? (
                          <>
                            <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" /> Salvando...
                          </>
                        ) : (
                          'Salvar alterações'
                        )}
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
