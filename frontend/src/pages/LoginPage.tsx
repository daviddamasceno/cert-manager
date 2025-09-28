import { useForm } from 'react-hook-form';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface LoginForm {
  email: string;
  password: string;
}

const LoginPage: React.FC = () => {
  const { register, handleSubmit, formState } = useForm<LoginForm>({
    defaultValues: {
      email: '',
      password: ''
    }
  });
  const { login, requiresPasswordReset } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      await login(values.email, values.password);
      notify({ type: 'success', title: 'Bem-vindo!', description: 'Sessão iniciada com sucesso.' });
      if (requiresPasswordReset) {
        notify({
          type: 'warning',
          title: 'Senha temporária',
          description: 'Defina uma nova senha segura para continuar.'
        });
      }
      navigate('/dashboard');
    } catch (error) {
      notify({ type: 'error', title: 'Falha no login', description: 'Verifique suas credenciais.' });
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-500 text-lg font-bold text-white">
            CM
          </div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Acessar painel</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Monitore certificados e gerencie alertas com tranquilidade.
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              {...register('email', { required: 'Informe seu e-mail' })}
            />
            {formState.errors.email ? (
              <span className="mt-1 block text-xs text-rose-500">{formState.errors.email.message}</span>
            ) : null}
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Senha
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              {...register('password', { required: 'Informe sua senha' })}
            />
            {formState.errors.password ? (
              <span className="mt-1 block text-xs text-rose-500">{formState.errors.password.message}</span>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? 'Autenticando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
