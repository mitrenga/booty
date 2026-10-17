// begin code

/**
 * Geometry of the Booty screen, measured on the original rather than off a
 * photograph (sources/docs/screen_layout.md).
 *
 * The screen is the plain ZX Spectrum one: 256x192 pixels, attributes in 8x8
 * cells. Unlike Atic Atac, whose panel is a column on the right, Booty plays
 * across the **whole width** and keeps its panel in the **bottom character
 * row**.
 *
 * ★ Measured on three frames taken off the running original in three
 * different holds (A, B, C — tools/playtrace.py): character rows 0-22 are the
 * hold, five decks on rows 1, 6, 11, 16 and 21 with four floors of four rows
 * (32 px) between them, the same in all three; row 23 is the panel, attribute
 * $06 (yellow on black) right across, the same in the demo and in the game.
 *
 * ? Whether the program holds those two as one picture or two is **not
 * measured yet** (M2). The remake composes both into one video memory, which
 * is what the machine has; the split here is a measured boundary, not a claim
 * about the program's own structure.
 */
export const ScreenLayout = {

  WIDTH: 256,
  HEIGHT: 192,

  CELL: 8,
  COLS: 32,
  ROWS: 24,

  // ★ rows 0-22, all 32 columns: the hold
  PLAY_ROW: 0,
  PLAY_ROWS: 23,

  // ★ row 23: the panel, attribute $06 across the whole row
  PANEL_ROW: 23,
  PANEL_ROWS: 1,
  ATTR_PANEL: 0x06,

  // ★ the decks: five horizontal bands, the same rows in all three holds
  // measured (screen_layout.md). Nothing uses them in M1; M2 will check the
  // hold format against them.
  DECK_ROWS: [1, 6, 11, 16, 21],

  // what is behind everything until the composer has drawn: black, as the
  // panel's paper. ? Which value the program clears the screen to between
  // holds is M2.
  ATTR_SCREEN: 0x00,

  // ★ **A deliberate departure** (ZADANI §10, R-036 as jetpac): the SECRET
  // SUB GAME is painted through ZXVideoRAM's ink plane, which remembers at
  // pixel resolution which ink lit which pixel — a bubble (ROM PLOT, the
  // diver's INK over its whole cell) no longer turns a fish the diver's
  // colour. The memory stays byte for byte the original's
  // (tools/matchgoldfish.mjs --ink). Set it false and the ULA's own rule is
  // back, clash and all. Read when the sub game starts.
  TRUE_COLOUR: true,

  // 50.08 Hz — 69888 T states per frame on a 3.5 MHz Z80 (hw_notes.md).
  //
  // ★ This is the rate of the ULA interrupt, which drives the tune and the
  // four sound slots of the IM 2 handler and the ROM's FRAMES counter that
  // the game's timed events read (disasm_notes.md §2, §4). It is **not** the
  // rate of the game: the main loop at $DF13 does not wait for the frame at
  // all, one pass takes 0.9-3.85 frames, 1.9 on average (§4, §9). The worker
  // ticks at the interrupt rate and the game logic of M3 onwards will run a
  // pass when the T-state budget of the original says so (ZADANI chap. 10) —
  // everything measured is written down **per pass**, never per frame.
  FRAME_RATE: 3500000/69888

}; // ScreenLayout
