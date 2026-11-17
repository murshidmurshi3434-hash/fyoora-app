export const LAPTOP_VIEW_MEDIA_QUERY = '(min-width: 1280px) and (min-aspect-ratio: 1/1)';
export const LAPTOP_INTRO_VIDEO = '/assets/aistudio/fyoora-intro-video_82e6c2c5.mp4';
export const PORTRAIT_INTRO_VIDEO = '/assets/aistudio/fyoora-intro-video-portrait_14ca92cd.mp4';
export const INTRO_VIDEO_BACKDROP_COLOR = '#F81820';

export type IntroVideoVariant = 'landscape' | 'portrait';
export type StartupIntroStage = 'intro' | 'logo';

export function isLaptopViewport(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return false;
  }
  return width >= 1280 && width >= height;
}

export function resolveIntroVideo(isLaptopView: boolean): {
  src: string;
  variant: IntroVideoVariant;
} {
  return isLaptopView
    ? { src: LAPTOP_INTRO_VIDEO, variant: 'landscape' }
    : { src: PORTRAIT_INTRO_VIDEO, variant: 'portrait' };
}

export function isAutostartEnabled(search: string): boolean {
  try {
    return new URLSearchParams(search).get('autostart') === '1';
  } catch {
    return false;
  }
}

export function resolveInitialStartupStage(options: {
  forceVideo?: boolean;
  prefersReducedMotion: boolean;
}): StartupIntroStage {
  if (!options.forceVideo && options.prefersReducedMotion) {
    return 'logo';
  }
  return 'intro';
}
