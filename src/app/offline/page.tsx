"use client";

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="mb-8 flex justify-center">
          <div className="w-24 h-24 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-12 h-12 text-cyan-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 3l18 18M8.111 8.111A5.5 5.5 0 0 0 5.5 13.5m1.636 2.864A5.5 5.5 0 0 0 12 18.5a5.5 5.5 0 0 0 4.864-2.864M9.5 9.5A5.5 5.5 0 0 1 12 9a5.5 5.5 0 0 1 5.5 5.5M12 3v1M4.22 4.22l1.42 1.42M19.78 4.22l-1.42 1.42M21 12h-1M4 12H3"
              />
            </svg>
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-3xl font-bold text-white mb-2">
          Sedang{" "}
          <span className="text-cyan-400">Offline</span>
        </h1>
        <p className="text-gray-400 mb-8">
          Tidak ada koneksi internet. Periksa jaringan Anda dan coba lagi.
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 px-6 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium transition-colors"
          >
            Coba Lagi
          </button>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <a
              href="/admin"
              className="py-2 px-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm rounded-lg text-center transition-colors"
            >
              Admin
            </a>
            <a
              href="/customer"
              className="py-2 px-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm rounded-lg text-center transition-colors"
            >
              Customer
            </a>
            <a
              href="/agent"
              className="py-2 px-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm rounded-lg text-center transition-colors"
            >
              Agent
            </a>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-xs text-gray-600">
          Salfanet Radius &mdash; Halaman tersimpan mungkin masih tersedia
        </p>
      </div>
    </div>
  );
}
