import { v4 as uuid } from 'uuid';
import { AlertModel } from '../domain/types';
import { AlertModelRepository } from '../repositories/interfaces';

export interface AlertModelInput {
  name: string;
  offsetDaysBefore: number;
  offsetDaysAfter?: number;
  repeatEveryDays?: number;
  templateSubject: string;
  templateBody: string;
}

export class AlertModelService {
  constructor(private readonly repository: AlertModelRepository) {}

  async list(): Promise<AlertModel[]> {
    return this.repository.listAlertModels();
  }

  async get(id: string): Promise<AlertModel | null> {
    return this.repository.getAlertModel(id);
  }

  async create(input: AlertModelInput): Promise<AlertModel> {
    const model: AlertModel = {
      id: uuid(),
      ...input
    };

    await this.repository.createAlertModel(model);
    return model;
  }

  async update(id: string, input: Partial<AlertModelInput>): Promise<AlertModel> {
    return this.repository.updateAlertModel(id, input);
  }

  async delete(id: string): Promise<void> {
    await this.repository.deleteAlertModel(id);
  }
}
