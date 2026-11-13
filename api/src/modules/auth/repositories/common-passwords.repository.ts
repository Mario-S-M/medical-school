import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CommonPassword } from '../entities/common-password.entity';

@Injectable()
export class CommonPasswordsRepository {
  constructor(@InjectRepository(CommonPassword) private readonly repository: Repository<CommonPassword>) {}

  isCommon(candidates: string[]): Promise<boolean> {
    return this.repository.exists({ where: { password: In(candidates) } });
  }
}
