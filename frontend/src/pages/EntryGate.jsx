import { ScanFace, Keyboard, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';

const EntryGate = () => {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
      <h1 className="text-3xl font-black mb-2 tracking-tighter text-blue-500">LIBRARY ENTRANCE</h1>
      <p className="text-gray-400 mb-12">Please select your entry method.</p>

      <div className="grid md:grid-cols-2 gap-6 max-w-4xl w-full">
        {/* Auto Mode: Face Scan */}
        <Link to="/login" className="group bg-slate-900 border border-blue-600/30 p-10 rounded-[2.5rem] flex flex-col items-center text-center hover:border-blue-500 transition-all shadow-2xl">
          <div className="w-20 h-20 bg-blue-600/10 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <ScanFace size={48} className="text-blue-500" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Auto Mode</h2>
          <p className="text-sm text-gray-500">Record Time-In/Out instantly using Face Recognition.</p>
        </Link>

        {/* Manual Mode: For Non-Account Holders */}
        <div className="group bg-slate-900 border border-white/10 p-10 rounded-[2.5rem] flex flex-col items-center text-center hover:border-white/20 transition-all cursor-pointer">
          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <Keyboard size={48} className="text-gray-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2 text-gray-300">Manual Mode</h2>
          <p className="text-sm text-gray-500">For visitors without an account. Enter details manually.</p>
        </div>
      </div>

      <Link to="/signup" className="mt-12 flex items-center gap-2 text-blue-500 font-semibold hover:underline">
        <UserPlus size={20} />
        Don't have an account? Create one for Level 1 access
      </Link>
    </div>
  );
};

export default EntryGate;