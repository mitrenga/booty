<?php

class DataCommand {

  // Co se posílá při startu aplikace: sekce `data/global.json`. Každou
  // sekci zapisuje nástroj z tools/ z originálu:
  //
  // - `global`   – výchozí stav hry z běhu originálu (mkglobal.py)
  // - `holds`    – tabulky všech 21 podpalubí a glyfy kulisy (dumpholds.py)
  // - `sprites`  – grafika spritů: Jim, piráti (dumpsprites.py)
  // - `panel`    – panel z operandů kódu (dumppanel.py)
  // - `texts`    – texty: proudy pro ROM tisk, menu (dumptexts.py)
  // - `memory`   – výchozí paměť hry pro bootyLogic.js, jen data (mkmemory.py)
  // - `transition` – časy přechodu dveřmi (tracetransition.py, mktransition.mjs)
  // - `loading`  – loading screen z kazety (mkscreen.py)
  // - `tape`     – scénář pro LOAD TAPE (mktape.py)
  // - `title`    – titulka s mořem pro MainModel (tracetitle.py, mktitle.py)
  // - `sounds`   – zvuk originálu: melodie, sloty, šum (tracesound.py, mksounds.py)
  // - `goldfish` – skrytá minihra: SECRET SUB GAME a pozadí menu (tracegoldfish.py, mkgoldfish.py)
  //
  // Chybějící sekce dorazí jako null a aplikace to musí přežít.
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
