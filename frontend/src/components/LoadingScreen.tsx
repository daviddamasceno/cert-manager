const LoadingScreen: React.FC<{ message?: string }> = ({ message }) => {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" aria-hidden="true" />
      <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-200" role="status">
        {message ?? 'Carregando...'}
      </p>
    </div>
  );
};

export default LoadingScreen;
