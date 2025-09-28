import client from 'prom-client';

client.collectDefaultMetrics();

export const register = client.register;

export const jobRunCounter = new client.Counter({
  name: 'scheduler_runs_total',
  help: 'Quantidade de execu??es do scheduler'
});

export const jobErrorCounter = new client.Counter({
  name: 'scheduler_errors_total',
  help: 'Quantidade de erros no scheduler'
});

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Dura??o das requisi??es HTTP',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.05, 0.1, 0.3, 1, 3, 5]
});

export const trackRequest = (labels: { method: string; route: string; status: string }, duration: number): void => {
  httpRequestDuration.observe(labels, duration);
};
