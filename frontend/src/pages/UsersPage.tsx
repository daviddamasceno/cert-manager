import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import dayjs from 'dayjs';
import { useToast } from '../context/ToastContext';
import { createUser, disableUser, listUsers, updateUser, CreateUserResponse, UpdateUserResponse } from '../services/users';
import { CreateUserRequest, ManagedUser, UpdateUserRequest, UserRole, UserStatus } from '../types';

interface UserFormValues {
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  resetPassword: boolean;
}

type ModalState = {
  open: boolean;
  mode: 'create' | 'edit';
  user?: ManagedUser;
};

const defaultValues: UserFormValues = {
  email: '',
  name: '',
  role: 'viewer',
  status: 'active',
  resetPassword: false
};

const roleLabels: Record<UserRole, string> = {
  admin: 'Administrador',
  editor: 'Editor',
  viewer: 'Visualizador'
};

const statusLabels: Record<UserStatus, string> = {
  active: 'Ativo',
  disabled: 'Desativado'
};

const UsersPage: React.FC = () => {
  const { notify } = useToast();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<{ role?: UserRole; status?: UserStatus; query?: string }>({});
  const [modalState, setModalState] = useState<ModalState>({ open: false, mode: 'create' });
  const {
    register,
    reset,
    handleSubmit,
    formState: { errors }
  } = useForm<UserFormValues>({ defaultValues });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await listUsers(filters);
      setUsers(data);
    } catch (error) {
      notify({ type: 'error', title: 'Falha ao carregar usuários' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.role, filters.status, filters.query]);

  const openCreateModal = () => {
    reset({ ...defaultValues });
    setModalState({ open: true, mode: 'create' });
  };

  const openEditModal = (user: ManagedUser) => {
    reset({
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      resetPassword: false
    });
    setModalState({ open: true, mode: 'edit', user });
  };

  const closeModal = () => {
    setModalState((prev) => ({ ...prev, open: false }));
  };

  const handleDisableUser = async (user: ManagedUser) => {
    if (user.status === 'disabled') {
      try {
        const response = await updateUser(user.id, { status: 'active' });
        await fetchUsers();
        notify({ type: 'success', title: 'Usuário reativado', description: response.user.email });
      } catch (error) {
        notify({ type: 'error', title: 'Falha ao reativar usuário' });
      }
      return;
    }

    if (!window.confirm(`Desativar o usuário ${user.email}?`)) {
      return;
    }

    try {
      await disableUser(user.id);
      await fetchUsers();
      notify({ type: 'success', title: 'Usuário desativado', description: user.email });
    } catch (error) {
      notify({ type: 'error', title: 'Falha ao desativar usuário' });
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (modalState.mode === 'create') {
        const payload: CreateUserRequest = {
          email: values.email,
          name: values.name,
          role: values.role,
          status: values.status
        };
        const response: CreateUserResponse = await createUser(payload);
        await fetchUsers();
        notify({
          type: 'success',
          title: 'Usuário criado',
          description: `Senha temporária: ${response.temporaryPassword}`
        });
      } else if (modalState.user) {
        const payload: UpdateUserRequest = {
          name: values.name,
          role: values.role,
          status: values.status,
          resetPassword: values.resetPassword
        };
        const response: UpdateUserResponse = await updateUser(modalState.user.id, payload);
        await fetchUsers();
        if (values.resetPassword && response.temporaryPassword) {
          notify({
            type: 'info',
            title: 'Senha redefinida',
            description: `Nova senha temporária: ${response.temporaryPassword}`
          });
        } else {
          notify({ type: 'success', title: 'Usuário atualizado' });
        }
      }
      closeModal();
    } catch (error) {
      notify({ type: 'error', title: 'Falha ao salvar usuário' });
    }
  });

  const filteredUsers = useMemo(() => users, [users]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Gestão de usuários</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Controle de acesso com perfis de permissão e auditoria.</p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          Novo usuário
        </button>
      </div>

      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:grid-cols-4">
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Buscar
          </label>
          <input
            type="text"
            placeholder="Nome ou e-mail"
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            value={filters.query || ''}
            onChange={(event) => setFilters((prev) => ({ ...prev, query: event.target.value || undefined }))}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Perfil
          </label>
          <select
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            value={filters.role || ''}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, role: (event.target.value as UserRole) || undefined }))
            }
          >
            <option value="">Todos</option>
            <option value="admin">Administrador</option>
            <option value="editor">Editor</option>
            <option value="viewer">Visualizador</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Status
          </label>
          <select
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            value={filters.status || ''}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, status: (event.target.value as UserStatus) || undefined }))
            }
          >
            <option value="">Todos</option>
            <option value="active">Ativo</option>
            <option value="disabled">Desativado</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
          <thead className="bg-slate-50 dark:bg-slate-900">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Nome</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">E-mail</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Perfil</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Último acesso</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  Carregando usuários...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">{user.name}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{user.email}</td>
                  <td className="px-4 py-3 text-sm capitalize text-slate-600 dark:text-slate-300">{roleLabels[user.role]}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{statusLabels[user.status]}</td>
                  <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                    {user.lastLoginAt ? dayjs(user.lastLoginAt).format('DD/MM/YYYY HH:mm') : 'Nunca'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(user)}
                        className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDisableUser(user)}
                        className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-slate-700 dark:text-rose-300 dark:hover:bg-rose-900/20"
                      >
                        {user.status === 'disabled' ? 'Reativar' : 'Desativar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Transition appear show={modalState.open} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={closeModal}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-slate-900/40" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-6">
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
                    {modalState.mode === 'create' ? 'Novo usuário' : 'Editar usuário'}
                  </Dialog.Title>
                  <form className="mt-6 space-y-4" onSubmit={onSubmit}>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        E-mail
                      </label>
                      <input
                        type="email"
                        disabled={modalState.mode === 'edit'}
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        {...register('email', {
                          required: 'Informe o e-mail',
                          pattern: {
                            value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                            message: 'E-mail inválido'
                          }
                        })}
                      />
                      {errors.email ? <span className="mt-1 block text-xs text-rose-500">{errors.email.message}</span> : null}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Nome
                      </label>
                      <input
                        type="text"
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        {...register('name', { required: 'Informe o nome' })}
                      />
                      {errors.name ? <span className="mt-1 block text-xs text-rose-500">{errors.name.message}</span> : null}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Perfil
                        </label>
                        <select
                          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          {...register('role', { required: true })}
                        >
                          <option value="admin">Administrador</option>
                          <option value="editor">Editor</option>
                          <option value="viewer">Visualizador</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Status
                        </label>
                        <select
                          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          {...register('status', { required: true })}
                        >
                          <option value="active">Ativo</option>
                          <option value="disabled">Desativado</option>
                        </select>
                      </div>
                    </div>
                    {modalState.mode === 'edit' ? (
                      <label className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-300">
                        <input type="checkbox" className="rounded border-slate-300" {...register('resetPassword')} />
                        <span>Gerar senha temporária e exigir troca no próximo acesso</span>
                      </label>
                    ) : null}
                    <div className="flex justify-end space-x-3 pt-4">
                      <button
                        type="button"
                        onClick={closeModal}
                        className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                      >
                        {modalState.mode === 'create' ? 'Criar usuário' : 'Salvar alterações'}
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
