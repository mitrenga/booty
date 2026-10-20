<?php

require_once 'app/svision/php/abstractAboutPage.php';

/**
 * The /about page: the story of the original Booty and of this remake.
 */
class AboutPage extends AbstractAboutPage {

  protected function aboutData() {
    return [
      'image' => 'images/cover.png',
      'sections' => [
        [
          'heading' => 'The original game (1984)',
          'html' =>
            '<p>Booty was written by John F. Cain and released by Firebird in 1984 for the 48K ZX Spectrum, '.
            'at a budget price. Jim the cabin boy is below decks on the Black Galleon, collecting the booty '.
            'strewn around its holds — he picks it up just by walking past it. Each hold is a single screen '.
            'of decks, ladders and numbered doors, and a door opens only to the key with the same number, so '.
            'the ship is a puzzle with an order to it.</p>'.
            '<p>Danger is everywhere: trap doors, ghost pirates, the ship\'s rats and the Captain\'s parrots, '.
            'and some pieces of booty are booby-trapped. Step through a hold door into mid-air and Jim is '.
            'over the side. When the last piece is collected, a golden key appears and Jim has 45 seconds to '.
            'find it — and the next round begins.</p>',
        ],
        [
          'heading' => 'This remake',
          'html' =>
            '<p>This is a faithful remake, rewritten for the web browser rather than emulated, and the whole '.
            'game is playable: all the holds, keys and doors, the pirates, rats, parrots, moving platforms and portholes, '.
            'the booby traps, the golden key and the rounds after it, and the original\'s tune and sounds.</p>'.
            '<p>Nothing in it is redrawn or guessed. The holds, the graphics, the texts and the music are '.
            'taken out of the original program, and the game itself is the original\'s main loop rewritten '.
            'pass by pass over memory laid out as on the Spectrum. It was checked against the running '.
            'original, down to whole recorded games played through again and compared after every pass. '.
            'The attribute clash of the hardware is kept, not cleaned up.</p>'.
            '<p>The tape loads the way it did in 1984 — LOAD TAPE plays all eight blocks of the original '.
            'cassette, the two turbo blocks included — and the title screen with its rolling sea, the menu '.
            'and the hidden CATCH 20 GOLDFISH sub game are all there.</p>'.
            '<p>It runs directly in your browser — nothing to install, nothing to download. Keyboard with '.
            'keys of your own choosing, touch controls and gamepads are supported.</p>'.$this->installNote(),
        ],
        [
          'heading' => 'Other games',
          'html' =>
            '<p>Also try <a href="https://manicminer.remake.free/" target="_blank" rel="noopener">Manic Miner</a> and '.
            '<a href="https://jetsetwilly.remake.free/" target="_blank" rel="noopener">Jet Set Willy</a> — '.
            'ZX Spectrum classics remade for your browser as well.</p>',
        ],
      ],
      'links' => [
        ['label' => 'Booty at Spectrum Computing', 'url' => 'https://spectrumcomputing.co.uk/entry/633/ZX-Spectrum/Booty'],
        ['label' => 'Booty at World of Spectrum', 'url' => 'https://worldofspectrum.org/archive/software/games/booty-firebird-software-ltd'],
        ['label' => 'Retro Games — more classic remakes playable in your browser', 'url' => 'https://retrogames.free/'],
      ],
      'footer' =>
        '<p>An unofficial fan remake. The original game and its artwork belong to their authors '.
        '(John F. Cain, Firebird Software). '.
        'Remake source code is available on <a href="https://github.com/mitrenga/booty" target="_blank" rel="noopener">GitHub</a> '.
        'under <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a>.</p>',
    ];
  } // aboutData

} // AboutPage
