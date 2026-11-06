const mqtt = require('mqtt');
// Подключаемся к вашему локальному MQTT брокеру
const client = mqtt.connect('mqtt://localhost:1883');

client.on('connect', () => {
    // Точная копия вашего JSON пакета от датчика
    const payload = {
        timestamp: new Date().toISOString(),
        mac: "48f6eebb63a4_8",
        name: "HTG3_63A4_8",
        temperature: 25.7,  // Можете менять эти цифры для проверки
        humidity: 35.2,
        battery_pct: 92,
        voltage: 5.76,
        rssi: -32,
        uptime: 1,
        wakeup_reason: "status_update"
    };

    // Публикуем в топик, который слушает сервер
    client.publish('sensors/HTG3_63A4/status', JSON.stringify(payload), () => {
        console.log("🚀 Тестовый пакет от датчика отправлен в MQTT!");
        client.end();
    });
});
