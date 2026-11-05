const mqtt = require('mqtt');
const client = mqtt.connect('mqtt://localhost:1883');

client.on('connect', () => {
    const payload = {
        timestamp: new Date().toISOString(),
        mac: "48f6eebb63a4__1_",
        name: "HTG3_63A4__1",
        temperature: 25.0,
        humidity: 45,
        battery_pct: 90,
        rssi: -30,
        wakeup_reason: "periodic"
    };
    client.publish('sensors/HTG3_63A4/status', JSON.stringify(payload), () => {
        console.log("Тестовый JSON успешно отправлен в MQTT!");
        client.end();
    });
});
