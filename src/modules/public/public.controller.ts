import type { Request, Response } from 'express';
import { ok } from '../../common/http';
import { publicService } from './public.service';

export const publicController = {
  async showcase(_req: Request, res: Response): Promise<void> {
    ok(res, await publicService.showcase());
  },

  async demoAccounts(_req: Request, res: Response): Promise<void> {
    ok(res, await publicService.demoAccounts());
  },
};
