import React, { useEffect, useState } from 'react';
import heroImg from './assets/hero.png'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import './App.css'



function App() {
  // Хранилище для датчиков. Ключ — MAC-адрес, значение — данные датчика
  const [sensors, setSensors] = useState({});
  const [status, setStatus] = useState('Подключение...');

  useEffect(() => {
    // 1. При загрузке страницы сначала запрашиваем историю по HTTP, 
    // чтобы дашборд не был пустым
    // fetch('/api/history')
    fetch('http://localhost:3000/api/history')
      .then((res) => res.json())
      .then((data) => {
        // Группируем последние записи по устройствам, чтобы показать актуальные значения
        const initialSensors = {};
        // Идем с конца в начало, чтобы более свежие записи перезаписали старые
        [...data].reverse().forEach((row) => {
          initialSensors[row.mac] = {
            name: row.name,
            mac: row.mac,
            temperature: row.temperature,
            humidity: row.humidity,
            battery: row.battery_pct,
            rssi: row.rssi,
            time: new Date(row.server_timestamp).toLocaleTimeString()
          };
        });
        setSensors(initialSensors);
        setStatus('Подключено (Live)');
      })
      .catch((err) => console.error('Ошибка загрузки истории:', err));

    // 2. Открываем «живую ниточку» WebSocket через Nginx
    // window.location.host автоматически подставит IP вашей ВМ (10.x.x.x)
    // const socket = new WebSocket(`ws://${window.location.host}/api/`);
    const socket = new WebSocket('ws://localhost:3000/api/ws');

    socket.onopen = () => {
      setStatus('Подключено (Live)');
    };

    socket.onmessage = (event) => {
      const response = JSON.parse(event.data);

      // Если сервер крикнул в сокет, что база обновилась:
      if (response.event === 'db_updated') {
        const newSensorData = response.sensorData;

        // Обновляем состояние React: берем старых роботов и обновляем/добавляем пришедшего
        setSensors((prevSensors) => ({
          ...prevSensors,
          [newSensorData.mac]: newSensorData
        }));
      }
    };

    socket.onclose = () => {
      setStatus('Связь потеряна. Переподключение...');
    };

    // Закрываем сокет, если пользователь ушел со страницы
    return () => socket.close();
  }, []);

  return (
    <div style={{ padding: '30px', fontFamily: 'Segoe UI, sans-serif', backgroundColor: '#f5f7fb', minHeight: '100vh' }}>
      <header style={{ marginBottom: '30px', display: 'flex', justifyContent: 'between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, color: '#1e293b' }}>Мониторинг микроклимата</h1>
          <p style={{ margin: '5px 0 0 0', color: '#64748b' }}>Данные поступают из корпоративной Wi-Fi сети</p>
        </div>
        <span style={{
          padding: '6px 12px',
          borderRadius: '20px',
          fontSize: '14px',
          fontWeight: 'bold',
          backgroundColor: status.includes('Live') ? '#dcfce7' : '#fee2e2',
          color: status.includes('Live') ? '#15803d' : '#b91c1c'
        }}>
          {status}
        </span>
      </header>

      {/* Сетка с карточками датчиков */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {Object.values(sensors).map((sensor) => (
          <div key={sensor.mac} style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)'
          }}>
            <h3 style={{ margin: '0 0 5px 0', color: '#0f172a' }}>{sensor.name}</h3>
            <code style={{ fontSize: '12px', color: '#94a3b8' }}>MAC: {sensor.mac}</code>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Термометр</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ef4444' }}>{sensor.temperature} °C</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Влажность</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#3b82f6' }}>{sensor.humidity} %</div>
              </div>
            </div>

            <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b' }}>
              <div>🔋 Батарея: <b>{sensor.battery}%</b></div>
              <div>📶 Сигнал: <b>{sensor.rssi} dBm</b></div>
            </div>

            <div style={{ marginTop: '10px', fontSize: '11px', color: '#94a3b8', textAlign: 'right' }}>
              Обновлено в: {sensor.time}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
