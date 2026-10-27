<?php
// Tar emot beställningar från sidan, sparar dem i orders/ och mejlar restaurangen direkt.
declare(strict_types=1);

const RECIPIENT = 'restaurangoscars@gmail.com';
const SENDER = 'webb@oscars.nu';
const ORDERS_DIR = __DIR__ . '/orders';
const MAX_PER_HOUR = 5;
const CUTOFF_HOUR = 9;
const MIN_PERSONS = 5;
// Filerna i orders/ börjar med den här raden, så de visar ingenting om någon öppnar dem
// i webbläsaren. Skyddet gäller även om servern struntar i orders/.htaccess.
const GUARD = "<?php exit; ?>\n";
const DAYS = ['', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
const MONTHS = ['', 'januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

date_default_timezone_set('Europe/Stockholm');

function respond(bool $ok, int $status = 200, array $extra = []): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => $ok] + $extra, JSON_UNESCAPED_UNICODE);
    exit;
}

function readGuarded(string $file): string
{
    return is_file($file) ? substr((string)file_get_contents($file), strlen(GUARD)) : '';
}

function clean(mixed $value, int $max = 120): string
{
    $value = preg_replace('/[\r\n\t]+/', ' ', is_scalar($value) ? (string)$value : '');
    return trim(mb_substr($value, 0, $max));
}

function kr(int $n): string
{
    return number_format($n, 0, ',', ' ') . ' kr';
}

function longDate(DateTimeImmutable $d): string
{
    return DAYS[(int)$d->format('N')] . ' ' . (int)$d->format('j') . ' ' . MONTHS[(int)$d->format('n')] . ' ' . $d->format('Y');
}

function earliestLunchDate(DateTimeImmutable $now): DateTimeImmutable
{
    $d = $now->setTime(0, 0);
    if ((int)$d->format('N') <= 5 && (int)$now->format('G') < CUTOFF_HOUR) {
        return $d;
    }
    do {
        $d = $d->modify('+1 day');
    } while ((int)$d->format('N') > 5);
    return $d;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(false, 405);
}

$in = json_decode((string)file_get_contents('php://input', false, null, 0, 50000), true);
if (!is_array($in)) {
    respond(false, 400);
}

$ref = 'OS-' . date('ymd') . '-' . strtoupper(bin2hex(random_bytes(2)));

// Fällan för spambotar: låtsas att allt gick bra
if (!empty($in['webbplats'])) {
    respond(true, 200, ['ref' => $ref]);
}

// Priserna hämtas från meny.json, inte från webbläsaren
$menu = json_decode((string)file_get_contents(__DIR__ . '/meny.json'), true);
$catalog = [];
foreach ($menu['rader'] as $row) {
    $catalog[$row['id']] = $row;
}

$groups = [];
$sum = 0;
$count = 0;
$persons = 0;
$vardag = false;
$forfragan = false;
foreach ((array)($in['rader'] ?? []) as $row) {
    $id = clean($row['id'] ?? '', 40);
    $n = (int)($row['antal'] ?? 0);
    if (!isset($catalog[$id]) || $n < 1 || $n > 999) {
        continue;
    }
    $item = $catalog[$id];
    $group = $menu['grupper'][$item['grupp']];
    $name = $item['namn'];
    if (str_starts_with($id, 'dagens')) {
        // Dagens rätt beror på leveransdagen, så namnet kommer med från sidan
        $given = clean($row['namn'] ?? '', 120);
        $name = ($given !== '' ? $given : $name) . ' (' . $item['alt'] . ')';
    }
    $groups[$group['namn']][] = ['antal' => $n, 'namn' => $name, 'pris' => $item['pris'], 'summa' => $n * $item['pris']];
    $sum += $n * $item['pris'];
    $count += $n;
    if ($group['typ'] === 'vardag') {
        $vardag = true;
        $persons += $n * ($group['personer'] ?? 1);
    } else {
        $forfragan = true;
    }
}
if (!$groups) {
    respond(false, 422, ['fel' => 'rader']);
}

$now = new DateTimeImmutable('now');
$datum = DateTimeImmutable::createFromFormat('!Y-m-d', (string)($in['datum'] ?? ''));
if (!$datum || $datum < $now->setTime(0, 0)) {
    respond(false, 422, ['fel' => 'datum']);
}
if ($vardag && ((int)$datum->format('N') > 5 || $datum < earliestLunchDate($now) || $persons < MIN_PERSONS)) {
    respond(false, 422, ['fel' => 'datum']);
}
$tid = preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', (string)($in['tid'] ?? '')) ? (string)$in['tid'] : '';

$namn = clean($in['namn'] ?? '');
$foretag = clean($in['foretag'] ?? '');
$telefon = clean($in['telefon'] ?? '', 40);
$epost = filter_var(clean($in['epost'] ?? '', 160), FILTER_VALIDATE_EMAIL) ?: '';
$adress = clean($in['adress'] ?? '', 200);
$meddelande = trim(mb_substr(is_string($in['meddelande'] ?? null) ? $in['meddelande'] : '', 0, 2000));
$samtycke = ($in['samtycke'] ?? '') === 'ja';

if ($namn === '' || $telefon === '' || $epost === '' || $adress === '' || !$samtycke) {
    respond(false, 422, ['fel' => 'kontakt']);
}

if (!is_dir(ORDERS_DIR)) {
    mkdir(ORDERS_DIR, 0750, true);
}

// Enkel spärr mot massutskick från samma adress
$ipHash = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . __FILE__);
$rateFile = ORDERS_DIR . '/rate.php';
$rate = json_decode(readGuarded($rateFile), true) ?: [];
$stamp = time();
$rate = array_filter($rate, fn($t) => $stamp - $t < 3600);
$recent = array_filter($rate, fn($t, $k) => str_starts_with((string)$k, $ipHash), ARRAY_FILTER_USE_BOTH);
if (count($recent) >= MAX_PER_HOUR) {
    respond(false, 429);
}
$rate[$ipHash . '-' . $stamp . '-' . mt_rand()] = $stamp;
file_put_contents($rateFile, GUARD . json_encode($rate), LOCK_EX);

$typ = $forfragan ? 'Förfrågan' : 'Beställning';
$tidText = implode(', ', array_filter([$vardag ? 'ca kl 10:30-11:30' : '', $forfragan && $tid ? 'kl ' . $tid : '']));

$order = [
    'ref' => $ref,
    'tid' => $now->format('c'),
    'typ' => $typ,
    'datum' => $datum->format('Y-m-d'),
    'klockslag' => $tid,
    'rader' => $groups,
    'summa' => $sum,
    'namn' => $namn,
    'foretag' => $foretag,
    'telefon' => $telefon,
    'epost' => $epost,
    'adress' => $adress,
    'meddelande' => $meddelande,
];
$ordersFile = ORDERS_DIR . '/orders.php';
if (!is_file($ordersFile)) {
    file_put_contents($ordersFile, GUARD, LOCK_EX);
}
file_put_contents(
    $ordersFile,
    // JSON_HEX_TAG gör om < och > så att ingen kan smyga in PHP-kod via formuläret
    json_encode($order, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG) . "\n",
    FILE_APPEND | LOCK_EX
);

$lines = [];
foreach ($groups as $groupName => $rows) {
    $lines[] = $groupName;
    foreach ($rows as $r) {
        $lines[] = '  ' . $r['antal'] . ' x ' . $r['namn'] . '  ' . kr($r['summa']);
    }
    $lines[] = '';
}

$subject = $typ . ' ' . $ref . ': ' . longDate($datum) . ', ' . kr($sum) . ', ' . ($foretag ?: $namn);
$body = implode("\n", [
    $typ . ' ' . $ref,
    '',
    'Leveransdag: ' . longDate($datum),
    'Tid: ' . ($tidText ?: '-'),
    'Leveransadress: ' . $adress,
    '',
    ...$lines,
    'Totalt: ' . kr($sum) . ' (' . $count . ' st)',
    '',
    'Namn: ' . $namn,
    'Företag: ' . ($foretag ?: '-'),
    'Telefon: ' . $telefon,
    'E-post: ' . $epost,
    '',
    $meddelande ?: '(inget meddelande)',
    '',
    'Skickat från oscars.nu ' . $now->format('Y-m-d H:i'),
]);
$headers = [
    'From' => 'Restaurang Oscar webb <' . SENDER . '>',
    'Reply-To' => $epost,
    'MIME-Version' => '1.0',
    'Content-Type' => 'text/plain; charset=UTF-8',
    'Content-Transfer-Encoding' => '8bit',
];
mail(RECIPIENT, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, $headers);

// Beställningen är sparad även om mejlet skulle fastna
respond(true, 200, ['ref' => $ref]);
