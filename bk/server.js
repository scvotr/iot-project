const http = require('http');
const mqtt = require('mqtt');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();

// Внутренние настройки сервера
const PORT = 3000;
const HOST = 'localhost';

// =========================================================================
// 1. ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ SQLITE3
// =========================================================================
// Создает файл 'telemetry.db' в папке с бэкендом, если его еще нет
const db = new sqlite3.Database('./telemetry.db', (err) => {
    if (err) {
        console.error('❌ Ошибка подключения к SQLite:', err.message);
    } else {
        console.log('📦 Успешно подключено к базе данных SQLite.');
    }
});

// Создаем таблицу для хранения всех параметров, присылаемых вашими датчиками
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS measurements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sensor_timestamp TEXT,       -- Время, зафиксированное самим датчиком
        server_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, -- Время записи на сервере
        mac TEXT,                    -- MAC-адрес устройства
        name TEXT,                   -- Имя датчика (например, HTG3_63A4)
        temperature REAL,            -- Температура
        humidity REAL,               -- Влажность
        battery_pct INTEGER,         -- Процент заряда батареи
        rssi INTEGER,                -- Уровень Wi-Fi сигнала
        wakeup_reason TEXT           -- Причина просыпания датчика
        )
    `);
});

// =========================================================================
// 2. СОЗДАНИЕ HTTP СЕРВЕРА (Для разовых запросов истории)
// =========================================================================
const server = http.createServer((req, res) => {
    // 1. Включаем CORS-разрешения для локального Vite (порт 5173)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Перехватываем предварительные запросы браузера (Preflight)
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Маршрут для получения истории
    if (req.url === '/api/history' && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');

        const sqlQuery = 'SELECT * FROM measurements ORDER BY server_timestamp DESC LIMIT 100';

        db.all(sqlQuery, (err, rows) => {
            if (err) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
                return;
            }
            res.writeHead(200);
            res.end(JSON.stringify(rows));
        });
    } else {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Маршрут не найден' }));
    }
});

// =========================================================================
// 3. СОЗДАНИЕ WEBSOCKET СЕРВЕРА (Для живого потока ws://)
// =========================================================================

// Создаем сервер отдельно, чтобы HTTP-сервер не конфликтовал с ним при обработке CORS
const wss = new WebSocket.Server({ noServer: true });

// Перехватываем запрос на переключение протокола с HTTP на WS
server.on('upgrade', (request, socket, head) => {
    // Проверяем, что клиент ломится именно на наш путь
    if (request.url.startsWith('/api/ws')) {
        wss.handleUpgrade(request, socket, head, (wsClient) => {
            wss.emit('connection', wsClient, request);
        });
    } else {
        socket.destroy(); // Сбрасываем левые запросы
    }
});

// Функция для рассылки сообщения абсолютно всем подключенным в данный момент браузерам
function broadcastToDashboards(data) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// Слушаем успешные подключения
wss.on('connection', (wsClient) => {
    console.log('🔌 Новый дашборд успешно подключился по WS протоколу.');
});


// Поднимаем сокеты поверх созданного ранее HTTP-сервера
// const ws = new WebSocket.Server({ server, path: '/api/ws' });

// // Функция для рассылки сообщения абсолютно всем подключенным в данный момент браузерам
// function broadcastToDashboards(data) {
//     ws.clients.forEach((client) => {
//         if (client.readyState === WebSocket.OPEN) {
//             client.send(JSON.stringify(data));
//         }
//     });
// }

// ws.on('connection', (ws) => {
//     console.log('🔌 Новый дашборд подключился по WS протоколу.');
// });

// =========================================================================
// 4. ПОДКЛЮЧЕНИЕ К MQTT-БРОКЕРУ И ГЛАВНАЯ ЛОГИКА
// =========================================================================
// Подключаемся к брокеру Mosquitto, работающему локально на этой же машине
const mqttClient = mqtt.connect('mqtt://localhost:1883');

mqttClient.on('connect', () => {
    console.log('📡 Node.js успешно установил связь с локальным MQTT-брокером.');

    // Подписываемся на топик датчиков. 
    // Символ + означает, что мы слушаем любое имя устройства, например: sensors/HTG3_63A4/status
    mqttClient.subscribe('sensors/+/status');
});

// Ловим каждое новое сообщение от датчиков из Wi-Fi сети
mqttClient.on('message', (topic, message) => {
    try {
        // Парсим входящую JSON-строку от датчика в JavaScript-объект
        const data = JSON.parse(message.toString());

        // Формируем SQL-запрос для безопасной вставки данных
        const sqlInsert = `
            INSERT INTO measurements 
            (sensor_timestamp, mac, name, temperature, humidity, battery_pct, rssi, wakeup_reason) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const stmt = db.prepare(sqlInsert);

        stmt.run(
            data.timestamp,
            data.mac,
            data.name,
            data.temperature,
            data.humidity,
            data.battery_pct,
            data.rssi,
            data.wakeup_reason,
            function (err) {
                if (err) {
                    console.error('❌ Ошибка записи данных в SQLite:', err.message);
                    return;
                }

                // Данные успешно сохранены в файл БД на диске ВМ!
                console.log(`💾 [БД Успех] Запись ID: ${this.lastID} | Датчик: ${data.name} | T: ${data.temperature}°C | H: ${data.humidity}%`);

                // КЛЮЧЕВОЙ МОМЕНТ: Данные в базе, теперь мгновенно отправляем их в сокет на фронтенд
                broadcastToDashboards({
                    event: 'db_updated',
                    id: this.lastID,
                    sensorData: {
                        name: data.name,
                        mac: data.mac,
                        temperature: data.temperature,
                        humidity: data.humidity,
                        battery: data.battery_pct,
                        rssi: data.rssi,
                        wakeup_reason: data.wakeup_reason,
                        time: new Date().toLocaleTimeString() // Время сервера для отображения на графике
                    }
                });
            }
        );

        stmt.finalize();

    } catch (parseError) {
        console.error('⚠️ Не удалось разобрать JSON от датчика. Проверьте формат. Ошибка:', parseError.message);
    }
});

// =========================================================================
// 5. ЗАПУСК ОБЩЕГО СЕРВЕРА
// =========================================================================
server.listen(PORT, HOST, () => {
    console.log(`🚀 Нативный Node.js сервер запущен и готов к работе на http://${HOST}:${PORT}/`);
});
