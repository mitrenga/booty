<?php

class DataCommand {

  // What is sent at application start: the sections of `data/global.json`.
  // Every section is written by a tool from tools/ out of the original:
  //
  // - `global`   – the initial game state from a run of the original (mkglobal.py)
  // - `holds`    – the tables of all 21 holds and the scenery glyphs (dumpholds.py)
  // - `sprites`  – sprite graphics: Jim, pirates (dumpsprites.py)
  // - `panel`    – the panel from the code's operands (dumppanel.py)
  // - `texts`    – texts: streams for ROM printing, menu (dumptexts.py)
  // - `memory`   – the initial game memory for bootyLogic.js, data only (mkmemory.py)
  // - `transition` – door transition timings (tracetransition.py, mktransition.mjs)
  // - `loading`  – the loading screen from the tape (mkscreen.py)
  // - `tape`     – the script for LOAD TAPE (mktape.py)
  // - `title`    – the title with the sea for MainModel (tracetitle.py, mktitle.py)
  // - `sounds`   – the original's sound: tune, slots, noise (tracesound.py, mksounds.py)
  // - `goldfish` – the hidden sub game: SECRET SUB GAME and the menu background (tracegoldfish.py, mkgoldfish.py)
  //
  // Missing sections arrive as null and the application must survive that.
  var $sections = ['global', 'holds', 'sprites', 'panel', 'texts', 'memory', 'transition', 'loading', 'tape', 'title', 'sounds', 'goldfish'];

  public function execute($postData) {
    $result = [];
    $data = null;
    if (is_file('data/global.json')) {
      try {
        $data = json_decode(file_get_contents('data/global.json'), false, 512, JSON_THROW_ON_ERROR);
      }
      catch (\JsonException $exception) {
        $result['error'] = ['message' => $exception->getMessage()];
      }
    }
    foreach ($this->sections as $section) {
      $result[$section] = ($data !== null && isset($data->$section)) ? $data->$section : null;
    }

    $mysqli = new mysqli($GLOBALS['dbHostname'], $GLOBALS['dbUser'], $GLOBALS['dbPassword'], $GLOBALS['dbName']);
    $data = $mysqli->query('SELECT `score` FROM `rg_bt_hallOfFame` ORDER BY `score` DESC LIMIT 1');
    $mysqli->close();
    $result['hiScore'] = 0;
    if ($row = $data->fetch_object()) {
      $result['hiScore'] = $row->score;
    }

    return $result;
  } // execute

} // class DataCommand
