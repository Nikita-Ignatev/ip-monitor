const path = require('path');
const fastify = require('fastify')({ logger: true });
const fastifyStatic = require('@fastify/static');
const ping = require('ping');

// --- Настройки ---
const PORT = 3000;

// --- Обслуживание статики (index.html + .js/.css/и т.д.) ---
fastify.register(fastifyStatic, {
  root: path.join(__dirname),
  index: 'index.html'
});

// --- Кэш и логика ---
let statusCache = {};
let lastUpdateTime = null;
let updateTimeout = null;
let isManualRefresh = false;
let isChecking = false;

// --- Генерация данных для БелАЗов ---
const generateBelazData = () => {
  const belazData = {};
  const liveIPs = ['8.8.8.8', '1.1.1.1', '142.250.185.206'];
  for (let i = 1; i <= 50; i++) {
    const paddedIndex = i.toString().padStart(2, '0');
    belazData[`БелАЗ-${paddedIndex}`] = {
      gps: i % 4 === 1 ? liveIPs[0] : `192.168.${i}.10`,
      sensor: i % 5 === 2 ? liveIPs[1] : `192.168.${i}.11`,
      camera: i % 6 === 3 ? liveIPs[2] : `192.168.${i}.12`,
      engine: `192.168.${i}.13`
    };
  }
  return belazData;
};

// --- Проверка статусов устройств ---
async function checkAllStatuses(manual = false) {
  if (isChecking) {
    fastify.log.warn('Проверка уже выполняется, пропуск.');
    if (manual && !updateTimeout) scheduleNextUpdate();
    return;
  }

  isChecking = true;
  if (manual) {
    isManualRefresh = true;
    if (updateTimeout) clearTimeout(updateTimeout);
    updateTimeout = null;
    fastify.log.info('=== ЗАПУЩЕНО РУЧНОЕ ОБНОВЛЕНИЕ ===');
  } else {
    isManualRefresh = false;
  }

  const belazData = generateBelazData();
  const newStatus = {};
  const startTime = Date.now();

  try {
    const pingPromises = [];

    for (const [truck, devices] of Object.entries(belazData)) {
      newStatus[truck] = {};
      for (const [device, ip] of Object.entries(devices)) {
        const pingPromise = ping.promise.probe(ip, { timeout: 1 })
          .then(result => {
            fastify.log.info(`Пинг ${truck} ${device} (${ip}): ${result.alive ? '✅ Online' : '❌ Offline'}`);
            newStatus[truck][device] = { alive: result.alive, ip };
          })
          .catch(error => {
            fastify.log.warn(`Ошибка пинга ${truck} ${device} (${ip}): ${error.message}`);
            newStatus[truck][device] = { alive: false, ip };
          });
        pingPromises.push(pingPromise);
      }
    }

    await Promise.all(pingPromises);
    statusCache = newStatus;
    lastUpdateTime = new Date();

    const duration = (Date.now() - startTime) / 1000;
    fastify.log.info(`Проверка завершена за ${duration.toFixed(2)} сек.`);
  } catch (error) {
    fastify.log.error('Критическая ошибка:', error);
  } finally {
    isChecking = false;
    scheduleNextUpdate();
  }
}

// --- Планирование следующей проверки ---
function scheduleNextUpdate(delay = 5 * 60 * 1000) {
  if (updateTimeout) clearTimeout(updateTimeout);
  if (isChecking) {
    updateTimeout = setTimeout(() => scheduleNextUpdate(delay), 10000);
    return;
  }

  const nextRunTime = new Date(Date.now() + delay);
  fastify.log.info(`Следующее обновление запланировано на: ${nextRunTime.toLocaleTimeString()}`);
  updateTimeout = setTimeout(() => checkAllStatuses(), delay);
}

// --- API: получить текущие статусы ---
fastify.get('/api/status', async (req, reply) => {
  if (!lastUpdateTime) {
    return reply.status(503).send({ error: 'Данные еще не готовы. Подождите.' });
  }

  const nextUpdateTimestamp = updateTimeout
    ? new Date(Date.now() + updateTimeout._idleTimeout).toISOString()
    : null;

  return {
    status: statusCache,
    lastUpdate: lastUpdateTime.toISOString(),
    nextUpdate: nextUpdateTimestamp,
    isChecking
  };
});

// --- API: ручной запуск обновления ---
fastify.post('/api/refresh', async (req, reply) => {
  if (isChecking) {
    return reply.status(429).send({ message: 'Обновление уже идет. Подождите.' });
  }
  checkAllStatuses(true);
  return reply.status(202).send({ message: 'Принудительное обновление запущено.' });
});

// --- Старт сервера ---
const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`Сервер запущен: http://localhost:${PORT}`);
    checkAllStatuses(); // первая проверка при запуске
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
