import { redirect } from 'next/navigation';
import { getSession, homeFor } from '../lib/session';

/** Start page: each role lands on its own view. */
export default async function Home() {
  const session = await getSession();
  redirect(session ? homeFor(session.user.role) : '/login');
}
