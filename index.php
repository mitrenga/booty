<?php
  $appName = 'BOOTY';
  $appDescription = 'Play BOOTY online for free in your browser. Faithful remake of the 1984 Firebird ZX Spectrum classic by John F. Cain, no download required.';
  $appPrefix = 'bt';
  $appNoscript =
    '<h1>BOOTY</h1>'.
    '<p>Booty is the 1984 ZX Spectrum game by John F. Cain, published by Firebird for the 48K '.
    'machine. Jim the cabin boy is aboard the Black Galleon, and its twenty holds are full of '.
    'pirate treasure. The doors are numbered and so are the keys — find the right one, keep '.
    'clear of the pirates, the parrot and the rats, and do not trust every treasure.</p>'.
    '<p>This is a faithful remake that runs directly in your web browser. '.
    'There is nothing to install and nothing to download — just open the page and play. '.
    'Please enable JavaScript to start the game.</p>'.
    '<p><a href="about">More about Booty and this remake</a></p>';
  $appOpenGraph = [
    'image' => 'images/poster.png',
  ];
  $appJsonLd = [
    'genre' => 'Platform',
    'isBasedOn' => [
      '@type' => 'VideoGame',
      'name' => 'Booty',
      'author' => [
        ['@type' => 'Person', 'name' => 'John F. Cain'],
      ],
      'publisher' => [
        ['@type' => 'Organization', 'name' => 'Firebird Software'],
      ],
      'datePublished' => '1984',
      'gamePlatform' => 'ZX Spectrum',
    ],
  ];
  require_once 'config/config.php';
  require_once 'app/svision/php/main.php';
