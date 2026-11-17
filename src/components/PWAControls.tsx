import { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall.ts';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-[#252525] text-white px-4 py-2 text-xs font-medium flex items-center justify-center gap-2"
    >
      <WifiOff className="w-3.5 h-3.5 text-[#E60023]" />
      <span>You are currently offline. Viewing cached FYOORA catalog; live ordering resumes when connected.</span>
    </div>
  );
}

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { canInstall, isInstalled, isIOS, install } = usePWAInstall();
  const [showIosGuide, setShowIosGuide] = useState(false);

  if (isInstalled) return null;
  if (!canInstall && !isIOS) return null;

  const handleClick = async () => {
    if (canInstall) {
      await install();
    } else if (isIOS) {
      setShowIosGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          compact
            ? 'inline-flex items-center gap-1.5 text-xs font-semibold text-[#252525] hover:text-[#E60023] px-2.5 py-1.5 rounded-lg bg-[#F5F5F5] border border-neutral-200 transition-colors'
            : 'inline-flex items-center gap-2 text-xs font-semibold text-white bg-[#252525] hover:bg-black px-3.5 py-2 rounded-lg transition-colors'
        }
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install App</span>
      </button>

      {showIosGuide && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl border border-neutral-200">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#E60023]/10 text-[#E60023] flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-[#252525]">Install FYOORA on iOS</h3>
                  <p className="text-xs text-neutral-500">Add to your Home Screen</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                aria-label="Close guide"
                className="p-1.5 text-neutral-400 hover:text-[#252525]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ol className="text-sm text-neutral-700 space-y-2 list-decimal list-inside mb-4">
              <li>Tap the <strong>Share</strong> button in Safari&apos;s toolbar.</li>
              <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong> to launch FYOORA like a native app.</li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="w-full py-2.5 rounded-xl bg-[#E60023] text-white font-semibold text-sm"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
