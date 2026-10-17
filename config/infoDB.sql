SELECT `ndx`, `name`, `score`, `created`
FROM `rg_bt_hallOfFame`
ORDER BY `ndx` DESC
LIMIT :limit
