export enum UserRole {
  DEVELOPER   = 'developer',
  COMERCIAL   = 'comercial',
  FATURISTA   = 'faturista',
  CCO         = 'cco',
  COORDENADOR = 'coordenador',
  OPERACIONAL = 'operacional',
  MOTORISTA   = 'motorista',
  AJUDANTE    = 'ajudante',
  USER        = 'user',
}

export const ROLE_LABELS: Record<string, string> = {
  [UserRole.DEVELOPER]:   'Desenvolvedor',
  [UserRole.COMERCIAL]:   'Comercial',
  [UserRole.FATURISTA]:   'Faturista',
  [UserRole.CCO]:          'CCO',
  [UserRole.COORDENADOR]: 'Coordenador',
  [UserRole.OPERACIONAL]: 'Operacional',
  [UserRole.MOTORISTA]:   'Motorista',
  [UserRole.AJUDANTE]:    'Ajudante',
  [UserRole.USER]:        'Usuário',
};
