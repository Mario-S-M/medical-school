import { Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../security/utils/authenticated-user';
import { Authenticated } from '../decorators/authenticated.decorator';
import { User } from '../models/user.model';

@Resolver(() => User)
export class UserResolver {
  // Los datos salen del JWT ya verificado (`user_metadata.nombre`), sin consultar a Supabase Auth.
  // El workflow `quien-soy` devolvía `nombre: null` si no había; aquí el campo es obligatorio y queda vacío.
  @Query(() => User, { name: 'yo', description: 'La persona que hace la petición.' })
  @Authenticated()
  me(@CurrentUser() user: AuthenticatedUser): User {
    return { id: user.id, email: user.email ?? '', name: user.name ?? '' };
  }
}
