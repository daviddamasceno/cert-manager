const AccessDeniedPage: React.FC = () => {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-4 rounded-2xl border border-rose-200 bg-rose-50 p-10 text-center dark:border-rose-900/40 dark:bg-rose-900/10">
      <h1 className="text-2xl font-semibold text-rose-600 dark:text-rose-300">Permissão negada</h1>
      <p className="max-w-md text-sm text-rose-700 dark:text-rose-200">
        Você não possui privilégios suficientes para acessar este recurso. Entre em contato com um administrador para revisar suas permissões.
      </p>
    </div>
  );
};

export default AccessDeniedPage;
