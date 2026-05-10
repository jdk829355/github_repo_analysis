import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4 py-16">
      <div className="text-center space-y-6 max-w-md">
        <h1 className="text-6xl font-bold text-white tracking-tight">404</h1>
        <h2 className="text-2xl font-semibold text-slate-300">Page Not Found</h2>
        <p className="text-slate-400">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
        >
          Go Back Home
        </Link>
      </div>
    </div>
  );
}
