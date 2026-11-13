import { deleteUsersE2E, cleanSchoolE2E, clearLimits } from './database';

export default async function setup() {
  await cleanSchoolE2E();
  deleteUsersE2E();
  clearLimits();
}
