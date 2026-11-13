import { ArgsType, Field } from '@nestjs/graphql';
import { EmailField } from '../../../common/validators/field-rules';

// `buscar_usuario(correo)`: el correo se recorta y se pasa a minúsculas antes de validarlo y buscarlo.
@ArgsType()
export class SearchUserArgs {
  @Field(() => String, { name: 'correo' })
  @EmailField()
  correo!: string;
}
