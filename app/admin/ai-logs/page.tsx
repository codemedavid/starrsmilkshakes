import { redirect } from 'next/navigation';

export default function AiLogsRedirect() {
  redirect('/admin/ai?tab=logs');
}
