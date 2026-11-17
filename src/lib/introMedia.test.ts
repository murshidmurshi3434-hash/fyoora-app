import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INTRO_VIDEO_BACKDROP_COLOR,
  LAPTOP_INTRO_VIDEO,
  PORTRAIT_INTRO_VIDEO,
  isAutostartEnabled,
  isLaptopViewport,
  resolveInitialStartupStage,
  resolveIntroVideo,
} from './introMedia';

test('mobile and tablet viewports select the portrait intro video', () => {
  const mobileAndTabletSizes: Array<[string, number, number]> = [
    ['iPhone SE', 375, 667],
    ['iPhone 14', 390, 844],
    ['Mobile landscape', 844, 390],
    ['iPad portrait', 768, 1024],
    ['iPad Air portrait', 820, 1180],
    ['iPad Pro portrait', 1024, 1366],
    ['iPad landscape', 1024, 768],
    ['Large tablet landscape', 1180, 820],
    ['Portrait monitor 1280x1920', 1280, 1920],
  ];

  for (const [label, width, height] of mobileAndTabletSizes) {
    const isLaptop = isLaptopViewport(width, height);
    assert.equal(isLaptop, false, `${label} (${width}x${height}) should use portrait intro`);
    const resolved = resolveIntroVideo(isLaptop);
    assert.equal(resolved.variant, 'portrait');
    assert.equal(resolved.src, PORTRAIT_INTRO_VIDEO);
  }
});

test('laptop and desktop landscape viewports select the landscape intro video', () => {
  const laptopSizes: Array<[string, number, number]> = [
    ['Laptop 1280x720', 1280, 720],
    ['MacBook 1280x800', 1280, 800],
    ['Laptop 1366x768', 1366, 768],
    ['Desktop 1440x900', 1440, 900],
    ['Full HD 1920x1080', 1920, 1080],
  ];

  for (const [label, width, height] of laptopSizes) {
    const isLaptop = isLaptopViewport(width, height);
    assert.equal(isLaptop, true, `${label} (${width}x${height}) should use landscape intro`);
    const resolved = resolveIntroVideo(isLaptop);
    assert.equal(resolved.variant, 'landscape');
    assert.equal(resolved.src, LAPTOP_INTRO_VIDEO);
  }
  assert.equal(INTRO_VIDEO_BACKDROP_COLOR, '#F81820');
});

test('startup stage plays intro video first by default and respects autostart and reduced motion', () => {
  assert.equal(isAutostartEnabled(''), false);
  assert.equal(isAutostartEnabled('?autostart=1'), true);
  assert.equal(resolveInitialStartupStage({ prefersReducedMotion: false }), 'intro');
  assert.equal(resolveInitialStartupStage({ prefersReducedMotion: true }), 'logo');
  assert.equal(resolveInitialStartupStage({ forceVideo: true, prefersReducedMotion: true }), 'intro');
});
