import { Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { clientIp } from '../utils/client-ip';

@Injectable()
export class ClientIpService {
  get(request: Pick<FastifyRequest, 'ip'>): string {
    return clientIp(request);
  }
}
