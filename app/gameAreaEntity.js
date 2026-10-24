const { ZXVideoRAMEntity } = await import('./svision/js/platform/canvas2D/zx/zxVideoRAMEntity.js?ver='+window.srcVersion);
const { ScreenLayout } = await import('./screenLayout.js?ver='+window.srcVersion);
const { ScreenComposer } = await import('./screenComposer.js?ver='+window.srcVersion);
// begin code

/**
 * The screen: **all of it**, 256x192, panel included.
 *
 * The hold and the panel along the bottom live in the same 6912 bytes on the
 * machine, so they are one entity here as well; the boundary between them
 * (★ character row 23, sources/docs/screen_layout.md) is a measurement, not a
 * split into two surfaces.
 *
 * The memory, the painting and the off-screen cache are svision's
 * {@link ZXVideoRAMEntity} (R-003, R-022). What is left here is feeding it
 * with a frame from the worker, which ScreenComposer turns into 6912 bytes.
 */
export class GameAreaEntity extends ZXVideoRAMEntity {

  /**
   * @param {AbstractEntity} parentEntity - The parent entity.
   * @param {number} x - X position relative to the parent.
   * @param {number} y - Y position relative to the parent.
   * @param {ScreenComposer} render - The shared renderer.
   */
  constructor(parentEntity, x, y, render) {
    super(parentEntity, x, y,
          {col: 0, row: 0, cols: ScreenLayout.COLS, rows: ScreenLayout.ROWS});
    this.id = 'GameAreaEntity';

    this.render = render;
    this.frameState = {};
  } // constructor

  /**
   * Stores the newest frame and invalidates the cache.
   * @param {Object} state - The 'frame' message of the worker.
   */
  setFrame(state) {
    // a frame without a screen is a tick between two passes: nothing new
    if (state.screen || !this.frameState.screen) {
      this.frameState = state;
      this.invalidate();
    }
  } // setFrame

  /**
   * Composes the screen. Called only when the cache is dirty, so the pixel
   * work happens once per game pass rather than once per display frame.
   */
  compose() {
    this.render.composeInto(this.videoRAM, this.frameState);
  } // compose

} // GameAreaEntity
