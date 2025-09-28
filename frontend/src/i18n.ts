import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  'pt-BR': {
    translation: {
      login: {
        title: 'Acessar painel',
        email: 'E-mail',
        password: 'Senha',
        submit: 'Entrar',
        loading: 'Autenticando...'
      },
      dashboard: {
        title: 'Vis?o geral',
        active: 'Ativos',
        expiring: 'A vencer',
        expired: 'Expirados',
        alerts: 'Alertas enviados'
      }
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'pt-BR',
    fallbackLng: 'pt-BR',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
