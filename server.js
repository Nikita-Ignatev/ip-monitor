const express = require('express');
const path = require('path');
const ping = require('ping');

const app = express();
const PORT = 3000;

// Путь к статическим файлам (index.html)
// Убедитесь, что index.html находится в корне проекта или укажите правильный путь
app.use(express.static(path.join(__dirname))); // Обслуживаем статику из корня

// Кэш статусов (теперь хранит { alive: boolean, ip: string })
let statusCache = {};
let lastUpdateTime = null;
let updateTimeout = null;
let isManualRefresh = false;
let isChecking = false; // Флаг, чтобы избежать параллельных проверок

// Генерация данных для 50 БелАЗов (как в belaz_data.json)
const generateBelazData = () => {
  const belazData = {};
  const liveIPs = ['8.8.8.8', '1.1.1.1', '142.250.185.206']; // Пример "живых" IP для демонстрации

  for (let i = 1; i <= 50; i++) {
    const paddedIndex = i.toString().padStart(2, '0');
    belazData[`БелАЗ-${paddedIndex}`] = {
      // Используем немного другую логику для разнообразия "живых" адресов
      gps: i % 4 === 1 ? liveIPs[0] : `192.168.${i}.10`,
      sensor: i % 5 === 2 ? liveIPs[1] : `192.168.${i}.11`,
      camera: i % 6 === 3 ? liveIPs[2] : `192.168.${i}.12`,
      engine: `192.168.${i}.13` // Пусть двигатели всегда будут недоступны для примера
    };
  }
  return belazData;
};

// --- Функция проверки статусов (обновлена) ---
async function checkAllStatuses(manual = false) {
  // Если уже идет проверка, выходим
  if (isChecking) {
      console.log('Проверка уже выполняется, пропуск.');
      // Если это ручной запуск, который пропущен, все равно планируем следующий
      if (manual && !updateTimeout) {
          scheduleNextUpdate();
      }
      return;
  }
  isChecking = true; // Устанавливаем флаг

  if (manual) {
    isManualRefresh = true;
    console.log('=== ЗАПУЩЕНО РУЧНОЕ ОБНОВЛЕНИЕ ===');
    // Сбрасываем предыдущий таймаут, если он был
    if(updateTimeout) clearTimeout(updateTimeout);
    updateTimeout = null;
  } else {
      isManualRefresh = false;
  }

  const belazData = generateBelazData();
  const newStatus = {};
  const startTime = Date.now();
  console.log('Начало проверки статусов...');

  try {
    const pingPromises = []; // Используем Promises для параллельного выполнения

    for (const [truck, devices] of Object.entries(belazData)) {
      newStatus[truck] = {}; // Инициализируем объект для грузовика

      for (const [device, ip] of Object.entries(devices)) {
          // Создаем промис для каждого пинга
          const pingPromise = ping.promise.probe(ip, { timeout: 1 }) // Таймаут 1 секунда
            .then(result => {
              console.log(`Пинг ${truck} ${device} (${ip}): ${result.alive ? '✅ Online' : '❌ Offline'}`);
              // Сохраняем статус и IP
              newStatus[truck][device] = { alive: result.alive, ip: ip };
            })
            .catch((error) => {
              console.log(`Пинг ${truck} ${device} (${ip}): ❌ Offline (Ошибка: ${error.message || 'timeout'})`);
              // Сохраняем статус и IP даже при ошибке
              newStatus[truck][device] = { alive: false, ip: ip };
            });
          pingPromises.push(pingPromise); // Добавляем промис в массив
      }
    }

    // Ждем завершения всех пингов
    await Promise.all(pingPromises);

    statusCache = newStatus; // Обновляем кэш
    lastUpdateTime = new Date(); // Устанавливаем время последнего обновления

    const duration = (Date.now() - startTime) / 1000;
    console.log(`Проверка завершена за ${duration.toFixed(2)} сек.`);

  } catch (error) {
    console.error('Критическая ошибка во время проверки статусов:', error);
    // В случае критической ошибки, можно очистить кэш или оставить старый
    // statusCache = {};
  } finally {
    isChecking = false; // Сбрасываем флаг проверки
    // Запланировать следующую проверку только если не было ручного запуска только что
    if (!manual) {
        scheduleNextUpdate();
    } else {
        // Если был ручной, планируем следующий запуск через стандартный интервал
        scheduleNextUpdate();
    }
  }
}

// --- Запланировать следующее обновление ---
function scheduleNextUpdate(delay = 5 * 60 * 1000) { // 5 минут по умолчанию
  if (updateTimeout) clearTimeout(updateTimeout); // Очищаем старый таймаут

  // Убедимся, что проверка не запущена
  if (isChecking) {
      console.log("Откладываем планирование следующего обновления, т.к. проверка еще идет.");
      // Попробуем запланировать чуть позже
      updateTimeout = setTimeout(() => scheduleNextUpdate(delay), 10000); // Через 10 секунд
      return;
  }

  const nextRunTime = new Date(Date.now() + delay);
  console.log(`Следующая автоматическая проверка запланирована на: ${nextRunTime.toLocaleTimeString()}`);

  updateTimeout = setTimeout(() => {
    checkAllStatuses(); // Запускаем автоматическую проверку
  }, delay);
}

// --- API для получения статусов (обновлен) ---
app.get('/api/status', (req, res) => {
  if (!lastUpdateTime) {
    // Если данных еще нет, возвращаем ошибку или пустой объект
    return res.status(503).json({ error: 'Данные еще не готовы. Пожалуйста, подождите.' });
  }

  // Вычисляем время следующего обновления
  let nextUpdateTimestamp = null;
  if (updateTimeout && updateTimeout._idleTimeout) {
      // Если есть активный таймаут, берем его время
      nextUpdateTimestamp = new Date(Date.now() + updateTimeout._idleTimeout).toISOString();
  } else if (!isChecking) {
      // Если таймаута нет и проверка не идет, возможно, она только что завершилась
      // Планируем следующую по умолчанию
      scheduleNextUpdate();
      if (updateTimeout && updateTimeout._idleTimeout) {
         nextUpdateTimestamp = new Date(Date.now() + updateTimeout._idleTimeout).toISOString();
      }
  }

  res.json({
    status: statusCache, // Отдаем кэш со статусами и IP
    lastUpdate: lastUpdateTime.toISOString(),
    nextUpdate: nextUpdateTimestamp, // Время следующего автоматического запуска
    isChecking: isChecking // Флаг, идет ли проверка прямо сейчас
  });
});

// --- API для принудительного обновления ---
app.post('/api/refresh', (req, res) => {
  console.log('Получен запрос на принудительное обновление');
  if (isChecking) {
      res.status(429).json({ message: 'Обновление уже выполняется. Попробуйте позже.' });
  } else {
      // Немедленно запускаем проверку вручную
      checkAllStatuses(true);
      res.status(202).json({ message: 'Запущено принудительное обновление. Данные скоро появятся.' });
  }
});

// --- Роут для корневого пути, отдает index.html ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});


// --- Запуск сервера и первой проверки ---
app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
  // Запускаем первую проверку статусов при старте сервера
  checkAllStatuses();
});