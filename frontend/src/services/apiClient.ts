import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export const api: AxiosInstance = axios.create({
  baseURL: `${baseURL}/api`,
  withCredentials: true
});

export const setAccessToken = (token: string | null): void => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

export const withAuth = <T>(config: AxiosRequestConfig<T> = {}): AxiosRequestConfig<T> => ({
  ...config
});

type RetriableConfig = AxiosRequestConfig & { _retry?: boolean };

const isAuthRoute = (config?: AxiosRequestConfig): boolean => {
  if (!config?.url) {
    return false;
  }
  return config.url.includes('/auth/login') || config.url.includes('/auth/refresh') || config.url.includes('/auth/logout');
};

export const attachAuthInterceptor = (refresh: () => Promise<string | null>): void => {
  let isRefreshing = false;
  let queue: Array<(token: string | null) => void> = [];

  api.interceptors.response.use(
    (response) => response,
    async (error) => {
      const status = error.response?.status;
      const originalConfig = error.config as RetriableConfig | undefined;

      if (status !== 401 || !originalConfig || originalConfig._retry || isAuthRoute(originalConfig)) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          queue.push((token) => {
            if (!token) {
              reject(error);
              return;
            }
            originalConfig._retry = true;
            originalConfig.headers = originalConfig.headers ?? {};
            originalConfig.headers.Authorization = `Bearer ${token}`;
            resolve(api.request(originalConfig));
          });
        });
      }

      isRefreshing = true;
      try {
        const newToken = await refresh();
        queue.forEach((callback) => callback(newToken));
        queue = [];
        if (!newToken) {
          return Promise.reject(error);
        }
        originalConfig._retry = true;
        originalConfig.headers = originalConfig.headers ?? {};
        originalConfig.headers.Authorization = `Bearer ${newToken}`;
        return api.request(originalConfig);
      } catch (refreshError) {
        queue.forEach((callback) => callback(null));
        queue = [];
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
  );
};
