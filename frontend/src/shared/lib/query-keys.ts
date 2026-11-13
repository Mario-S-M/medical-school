// Claves del caché de TanStack Query; las que llevan el id del usuario nunca se comparten entre cuentas.
export const queryKeys = {
  me: (userId: string | undefined) => ['me', userId] as const,
  roles: (userId: string | undefined) => ['roles', userId] as const,
  categories: ['categories'] as const,
  catalog: ['catalog'] as const,
  courseSheet: ['course-sheet'] as const,
  myCourses: ['my-courses'] as const,
  courseEdit: ['course-edit'] as const,
  reviewCourses: ['review-courses'] as const,
  myTeam: ['my-team'] as const,
  myInvitations: ['my-invitations'] as const,
  videoStatus: (lessonId: number) => ['video-status', lessonId] as const,
};
