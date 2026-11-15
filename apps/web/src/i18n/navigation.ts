import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Link / useRouter / usePathname / redirect بإصدارات "واعية باللغة":
// تُضيف بادئة اللغة تلقائيًا فلا نكتبها يدويًا في كل مكان بالواجهة.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
