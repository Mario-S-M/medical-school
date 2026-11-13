import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { roleChangeSchema, type RoleChange } from '../schemas/review-schema';

const ASSIGN_ROLE = graphql(`
  mutation asignar_rol($usuario_id: ID!, $rol: String!, $activo: Boolean!) {
    asignar_rol(usuario_id: $usuario_id, rol: $rol, activo: $activo) {
      usuario_id
      rol
      activo
    }
  }
`);

export const assignRole = (body: RoleChange) => runGraphql(ASSIGN_ROLE, body, roleChangeSchema);
