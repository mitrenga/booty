const { ZXSpectrumPlatform } = await import('./svision/js/platform/canvas2D/zxSpectrum/zxSpectrumPlatform.js?ver='+window.srcVersion);
// begin code

/**
 * Booty runs on the ZX Spectrum platform of svision: a 256x192 desktop with a
 * border, integer scaling and the Spectrum palette — the same machine the
 * original ran on (ZADANI chap. 2).
 */
export function appPlatform() {
  return new ZXSpectrumPlatform();
} // appPlatform
