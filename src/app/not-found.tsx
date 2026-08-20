import Image from 'next/image';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sound-50 via-white to-cyan-50 flex flex-col items-center justify-center p-6 text-center">
      <Image
        src="/404.webp"
        alt="Illustrated scene of a lost orca swimming through a digital sea"
        width={1536}
        height={1024}
        priority
        className="w-full max-w-md sm:max-w-lg md:max-w-2xl lg:max-w-3xl xl:max-w-4xl 2xl:max-w-5xl mb-8"
      />
      <h1 className="text-3xl font-bold text-slate-900 mb-3">Page not found</h1>
      <p className="text-slate-600 mb-8 max-w-sm">
        Looks like this page swam off with the orcas. It might have never existed, or maybe it moved.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/board"
          className="px-6 py-2.5 bg-sound-500 text-white font-medium rounded-lg hover:bg-sound-600 transition-colors"
        >
          Back to board
        </Link>
        <Link
          href="/login"
          className="px-6 py-2.5 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
