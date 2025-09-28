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

export const attachAuthInterceptor = (refresh: () => Promise<string | null>): void => {
  let isRefreshing = false;
  let queue: Array<(token: string | null) => void> = [];

  api.interceptors.response.use(
    (response) => response,
    async (error) => {
      const status = error.response?.status;
      if (status !== 401) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          queue.push((token) => {
            if (!token) {
              reject(error);
              return;
            }
            error.config.headers.Authorization = `Bearer ${token}`;
            resolve(api.request(error.config));
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
        error.config.headers.Authorization = `Bearer ${newToken}`;
        return api.request(error.config);
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
