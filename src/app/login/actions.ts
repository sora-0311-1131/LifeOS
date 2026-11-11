'use server';

import { revalidatePath } from 'next/cache';

export async function revalidateSession() {
  revalidatePath('/', 'layout');
}
