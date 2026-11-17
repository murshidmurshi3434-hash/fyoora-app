import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import {
  LAPTOP_VIEW_MEDIA_QUERY,
  isLaptopViewport,
  resolveInitialStartupStage,
  resolveIntroVideo,
  type StartupIntroStage,
} from '../lib/introMedia.ts';

interface StartupIntroOverlayProps {
  holdWhileLoading?: boolean;
  forceVideo?: boolean;
  onComplete: () => void;
}

export function StartupIntroOverlay({
  holdWhileLoading = false,
  forceVideo = false,
  onComplete,
}: StartupIntroOverlayProps) {
  const [stage, setStage] = useState<StartupIntroStage>(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return resolveInitialStartupStage({ forceVideo, prefersReducedMotion });
  });
  const [logoElapsed, setLogoElapsed] = useState(false);
  const [isLaptopView, setIsLaptopView] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia(LAPTOP_VIEW_MEDIA_QUERY).matches ||
      isLaptopViewport(window.innerWidth, window.innerHeight)
    );
  });
  const introVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const laptopQuery = window.matchMedia(LAPTOP_VIEW_MEDIA_QUERY);
    const updateView = () => {
      setIsLaptopView(
        laptopQuery.matches || isLaptopViewport(window.innerWidth, window.innerHeight)
      );
    };
    updateView();
    laptopQuery.addEventListener('change', updateView);
    window.addEventListener('resize', updateView);
    return () => {
      laptopQuery.removeEventListener('change', updateView);
      window.removeEventListener('resize', updateView);
    };
  }, []);

  const finishIntro = useCallback(() => {
    setStage((current) => (current === 'intro' ? 'logo' : current));
  }, []);

  useEffect(() => {
    if (stage !== 'logo') {
      setLogoElapsed(false);
      return;
    }
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => {
      setLogoElapsed(true);
    }, reducedMotion ? 350 : 950);
    return () => window.clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (stage === 'logo' && logoElapsed && !holdWhileLoading) {
      onComplete();
    }
  }, [holdWhileLoading, logoElapsed, onComplete, stage]);

  useEffect(() => {
    if (stage !== 'intro') return;
    let cancelled = false;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        finishIntro();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    const videoEl = introVideoRef.current;
    if (videoEl) {
      videoEl.muted = true;
      videoEl.defaultMuted = true;
      videoEl.playsInline = true;
      try {
        videoEl.currentTime = 0;
      } catch {
        // ignore seek errors before metadata is loaded
      }
      const playPromise = videoEl.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err: unknown) => {
          if (cancelled) return;
          const errName = err instanceof Error ? err.name : '';
          if (errName === 'AbortError') return;
          finishIntro();
        });
      }
    }
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [finishIntro, isLaptopView, stage]);

  if (stage === 'intro') {
    const { src: activeIntroVideo, variant: activeIntroVariant } = resolveIntroVideo(isLaptopView);
    return (
      <div
        role="region"
        aria-label="FYOORA intro showcase"
        className="fixed inset-0 z-50 h-[100dvh] w-screen overflow-hidden bg-[#F81820] flex items-center justify-center"
      >
        <video
          ref={introVideoRef}
          key={activeIntroVideo}
          src={activeIntroVideo}
          data-testid="intro-video"
          data-variant={activeIntroVariant}
          autoPlay
          muted
          playsInline
          preload="auto"
          onCanPlay={(e) => {
            const videoEl = e.currentTarget;
            videoEl.muted = true;
            if (videoEl.paused) {
              void videoEl.play().catch(() => {});
            }
          }}
          onEnded={finishIntro}
          onError={finishIntro}
          className="h-full w-full max-h-[100dvh] max-w-full object-contain"
        />
        <button
          type="button"
          onClick={finishIntro}
          aria-label="Skip intro video"
          className="absolute top-4 right-4 sm:top-6 sm:right-6 z-10 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-black/65 hover:bg-black/85 text-white border border-white/25 backdrop-blur-sm text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <span>Skip Intro</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center px-6 animate-fade-in">
      <img
        src="/assets/aistudio/fyoora-lockup-red_72717535.png"
        alt="FYOORA"
        className="h-16 sm:h-20 object-contain mb-4"
      />
      <p className="font-display text-sm font-semibold tracking-wide text-neutral-500 text-center">
        Everything. One place. · Vadakara, Kozhikode
      </p>
    </div>
  );
}
