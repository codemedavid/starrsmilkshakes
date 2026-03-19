import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

export default function AdminNotFound() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto w-16 h-16 bg-[#F2EEE8] rounded-full flex items-center justify-center mb-6">
          <FileQuestion className="h-8 w-8 text-stone-400" />
        </div>

        <h2 className="font-playfair text-2xl font-semibold text-stone-900 mb-2">
          Page not found
        </h2>

        <p className="font-nunito text-sm text-stone-500 mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <Link
          href="/admin/orders"
          className="
            inline-flex items-center gap-2 px-6 py-3
            bg-[#7BBFB5] text-[#F0EBE0] font-nunito font-semibold text-sm
            rounded-[10px] shadow-sm
            hover:bg-[#3D8A80] active:bg-[#2C6E65]
            focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:ring-offset-2
            transition-all duration-200
          "
        >
          Go to Orders
        </Link>
      </div>
    </div>
  );
}
