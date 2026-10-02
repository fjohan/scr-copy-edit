<?php
declare(strict_types=1);
session_start(['cookie_httponly' => true, 'cookie_samesite' => 'Strict', 'cookie_secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off']);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function respond(int $status, array $body): never { http_response_code($status); echo json_encode($body, JSON_UNESCAPED_UNICODE); exit; }
if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'POST'], true)) respond(405, ['error' => 'Method not allowed']);
$dsn = getenv('MARGIN_DB_DSN');
if (!$dsn) respond(503, ['error' => 'MySQL is not configured. Browser storage is available.']);
try {
    $pdo = new PDO($dsn, getenv('MARGIN_DB_USER') ?: '', getenv('MARGIN_DB_PASSWORD') ?: '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false]);
    $_SESSION['workspace_id'] ??= bin2hex(random_bytes(24));
    $_SESSION['csrf_token'] ??= bin2hex(random_bytes(32));
    $workspaceId = $_SESSION['workspace_id'];
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $query = $pdo->prepare('SELECT state_json FROM workspaces WHERE id = ?');
        $query->execute([$workspaceId]);
        $json = $query->fetchColumn();
        respond(200, ['csrfToken' => $_SESSION['csrf_token'], 'workspace' => $json ? json_decode($json, true, 512, JSON_THROW_ON_ERROR) : null]);
    }
    if (!hash_equals($_SESSION['csrf_token'], $_SERVER['HTTP_X_MARGIN_CSRF'] ?? '')) respond(403, ['error' => 'Invalid session token']);
    $raw = file_get_contents('php://input');
    if (strlen($raw) > 20 * 1024 * 1024) respond(413, ['error' => 'Workspace exceeds 20 MB. Export your process log.']);
    $state = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($state) || !isset($state['documents']) || !is_array($state['documents']) || count($state['documents']) > 500) respond(422, ['error' => 'Invalid workspace']);
    foreach ($state['documents'] as $document) {
        if (!is_array($document) || !is_string($document['id'] ?? null) || !is_string($document['title'] ?? null) || !is_string($document['text'] ?? null) || !is_array($document['events'] ?? null)) respond(422, ['error' => 'Invalid document']);
        foreach ($document['events'] as $event) {
            if (!is_array($event) || !is_string($event['id'] ?? null) || !is_string($event['sessionId'] ?? null) || !is_string($event['timestamp'] ?? null) || !is_string($event['type'] ?? null) || !is_int($event['sequence'] ?? null) || !is_int($event['elapsedMs'] ?? null) || !is_array($event['data'] ?? null)) respond(422, ['error' => 'Invalid event']);
        }
    }
    $pdo->beginTransaction();
    $save = $pdo->prepare('INSERT INTO workspaces (id, state_json) VALUES (?, ?) ON DUPLICATE KEY UPDATE state_json = VALUES(state_json)');
    $save->execute([$workspaceId, $raw]);
    $insert = $pdo->prepare('INSERT INTO process_events (id, workspace_id, document_id, session_id, sequence_number, client_timestamp, elapsed_ms, event_type, event_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id');
    foreach ($state['documents'] as $document) {
        foreach ($document['events'] as $event) {
            $insert->execute([$event['id'], $workspaceId, $document['id'], $event['sessionId'], $event['sequence'], $event['timestamp'], $event['elapsedMs'], $event['type'], json_encode($event['data'], JSON_THROW_ON_ERROR)]);
        }
    }
    // A removed document must not leave its timestamped process history behind.
    $liveDocuments = array_fill_keys(array_column($state['documents'], 'id'), true);
    $storedDocuments = $pdo->prepare('SELECT DISTINCT document_id FROM process_events WHERE workspace_id = ?');
    $storedDocuments->execute([$workspaceId]);
    $removeEvents = $pdo->prepare('DELETE FROM process_events WHERE workspace_id = ? AND document_id = ?');
    foreach ($storedDocuments->fetchAll(PDO::FETCH_COLUMN) as $documentId) {
        if (!isset($liveDocuments[$documentId])) $removeEvents->execute([$workspaceId, $documentId]);
    }
    $pdo->commit();
    respond(200, ['saved' => true]);
} catch (JsonException $error) {
    respond(400, ['error' => 'Invalid JSON']);
} catch (Throwable $error) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    error_log('Margin database error: ' . $error->getMessage());
    respond(503, ['error' => 'Database unavailable. Your changes remain in browser storage.']);
}
