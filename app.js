// Конфигурация
const CONFIG = {
  itemsPerPage: 12, // Это может быть не строго необходимо для одного списка
  updatesUrl: '/updates'
  // Local Storage ключ удален
  // favoritesApiUrl удален
};

// Состояние приложения
const state = {
  allTrucks: [], // Полный список имен всех БелАЗов (получен из currentData.status)
  currentStatus: {}, // Текущие статусы всех устройств
  sseConnected: false,
  // favorites: [], // Массив для хранения избранных БелАЗов удален
  // viewMode: 'all' // Режим отображения удален
};

// Элементы DOM
const elements = {
  belazStatus: document.getElementById('belaz-status'), // Контейнер списка
  updateTime: document.getElementById('update-time'),
  searchInput: document.getElementById('search'),
  // prevPageBtn: document.getElementById('prev-page'), // Элементы пагинации, если используются
  // nextPageBtn: document.getElementById('next-page'),
  // pageInfo: document.getElementById('page-info'),
  refreshBtn: document.getElementById('refresh'),
  // toggleFavoritesBtn: document.getElementById('toggle-favorites'), // Кнопка переключения вида удалена
  // sseStatus: document.getElementById('ws-status') // Элемент статуса SSE/WS
  ipInfo: document.getElementById('ip-info') // Элемент для отображения IP
};

// --- Функции для работы с избранным полностью удалены ---


// Инициализация SSE соединения
function initSSE() {
console.log('Инициализация SSE...'); // LOG

if (typeof EventSource === 'undefined') {
  console.error('EventSource не поддерживается в этом браузере.'); // LOG
  return;
}

let eventSource = new EventSource(CONFIG.updatesUrl);

eventSource.onopen = () => {
  console.log('SSE подключен'); // LOG
  state.sseConnected = true;
};

eventSource.onmessage = (event) => {
  try {
    console.log('Получено SSE сообщение (сырое):', event.data); // LOG
    const newData = JSON.parse(event.data); // Теперь newData содержит всю структуру с lastUpdate, nextUpdate и status
    console.log('Получены данные по SSE (парсинг):', newData); // LOG

    if (!newData.status || typeof newData.status !== 'object') {
        console.error('Получены некорректные данные статусов в SSE сообщении:', newData); // LOG
        return;
    }
    state.currentStatus = newData.status; // Обновляем только statuses

    const truckNames = Object.keys(state.currentStatus).sort();
     if (state.allTrucks.length === 0 || truckNames.join(',') !== state.allTrucks.join(',')) {
         state.allTrucks = truckNames;
         console.log('Список всех БелАЗов обновлен из SSE:', state.allTrucks); // LOG
     }

    // Обновляем отображение с учетом текущего поиска
    filterAndRenderTrucks(); // Вызываем фильтрацию и отрисовку

    if(elements.updateTime) {
        elements.updateTime.textContent = `Обновлено: ${formatTime(new Date(newData.lastUpdate))}`;
    }
    nextUpdateTime = newData.nextUpdate;
    updateNextUpdateTimer();

  } catch (error) {
    console.error('Ошибка парсинга или обработки данных SSE:', error); // LOG
  }
};

eventSource.onerror = (error) => {
  console.log('SSE ошибка соединения', error); // LOG
  state.sseConnected = false;
  eventSource.close();
  console.log('Попытка переподключения SSE через 5 секунд...'); // LOG
  setTimeout(initSSE, 5000);
};

  eventSource.onclose = () => {
      console.log('SSE соединение закрыто'); // LOG
      state.sseConnected = false;
  };


return eventSource;
}

// --- Вспомогательные функции ---

function formatTime(date) {
  if (!date) return '--:--:--';
  const dateObj = (date instanceof Date) ? date : new Date(date);
  if (isNaN(dateObj.getTime())) {
      console.error('Некорректная дата для форматирования:', date);
      return '--:--:--';
  }
  return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getTimeRemaining(endTime) {
  if (!endTime) return '--:--';
  const now = new Date();
  const endTimeObj = (endTime instanceof Date) ? endTime : new Date(endTime);
   if (isNaN(endTimeObj.getTime())) {
      console.error('Некорректная конечная дата/время для расчета оставшегося времени:', endTime);
      return '--:--';
  }
  const diff = Math.max(0, endTimeObj - now);
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

let updateInterval;
let nextUpdateTime = null;
let currentData = {}; // Полные текущие данные с сервера
let debounceTimer; // Таймер для debounce поиска


function updateNextUpdateTimer() {
console.log('Запуск таймера следующего обновления. Следующее обновление:', nextUpdateTime);
if (updateInterval) clearInterval(updateInterval);
if (!nextUpdateTime) {
    console.log('Следующее время обновления не задано.');
    if(document.getElementById('next-update')) {
        document.getElementById('next-update').textContent = 'Следующее: --:--';
    }
    return;
}

updateInterval = setInterval(() => {
  const remaining = getTimeRemaining(nextUpdateTime);
  if(document.getElementById('next-update')) {
       document.getElementById('next-update').textContent = `Следующее: ${remaining}`;
  }
  if (remaining === '00:00') {
    console.log('Таймер достиг 00:00, запуск loadData.');
    clearInterval(updateInterval);
    setTimeout(loadData, 1000);
  }
}, 1000);
}


// showLoading теперь будет вызываться либо при первой загрузке, либо при ручном обновлении
function showLoading(isRefreshing = false) {
console.log('Отображение индикатора загрузки (обновление:', isRefreshing, ')');
if(elements.refreshBtn) {
  elements.refreshBtn.disabled = true; // Отключаем кнопку во время загрузки/обновления
}

// Логика отображения текста и анимации для кнопки обновления
const refreshIcon = document.getElementById('refresh-icon');
const refreshBtn = elements.refreshBtn;

if (isRefreshing) { // Если это ручное обновление
    if (refreshIcon) refreshIcon.classList.add('refresh-icon'); // Добавляем анимацию вращения
    if(refreshBtn) {
        refreshBtn.innerHTML = `
          <svg id="refresh-icon" width="12" height="12" viewBox="0 0 24 24" fill="white">
            <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4C7.58 4 4.01 7.58 4.01 12C4.01 16.42 7.58 20 12 20C15.73 20 18.84 17.45 19.73 14H17.65C16.83 16.33 14.61 18 12 18C8.69 18 6 15.31 6 12C6 8.69 8.69 6 12 6C13.66 6 15.14 6.69 16.22 7.78L13 11H20V4L17.65 6.35Z"/>
          </svg>
          Обновление...
        `; // Меняем текст
    }
} else { // Если это не ручное обновление (первая загрузка, таймер)
     // Показываем общее сообщение о загрузке в контейнере списка, если он пуст
     if(elements.belazStatus && elements.belazStatus.innerHTML.trim() === '' ) { // Проверяем, пуст ли контейнер
          elements.belazStatus.innerHTML = `<div class="loading">Загрузка данных...</div>`;
     }
     // Кнопка обновления при этом просто отключается, текст и иконка не меняются на "Обновление..." автоматически
}
}


// Функция для обработки клика по кнопкам управления реле
function handleRelayControl(truckName, action) {
console.log(`Запрос на управление реле для ${truckName}: ${action}`);
alert(`Управление реле для ${truckName}: ${action} (функционал не реализован)`);
}


async function loadData() {
  // showLoading(); // Теперь showLoading() вызывается только из initApp и forceRefresh
  if (updateInterval) clearInterval(updateInterval);

  try {
      console.log('Запрос данных через /api/status...');
      const response = await fetch('/api/status');
      console.log('Ответ от /api/status получен:', response.status);

      if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('Ошибка HTTP или ошибка от сервера:', response.status, response.statusText, errorData);
          let errorMessage = `Сервер вернул ошибку: ${response.status}`;
          if (errorData.error) {
               errorMessage = errorData.error;
          } else if (errorData.message) {
               errorMessage = errorData.message;
          }

          if (response.status === 503 && (errorData.error || errorData.message)) {
               throw new Error(errorData.error || errorData.message);
          }
          throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('Данные загружены успешно:', data);

      if (data.error) {
           console.error('Ошибка в данных от сервера (поле error):', data.error);
           throw new Error(data.error);
      }

      if (!data.status || typeof data.status !== 'object') {
           console.error('Получены некорректные данные в поле status:', data.status);
           throw new Error('Получены некорректные данные статусов от сервера.');
      }

      currentData = data;
      console.log('currentData обновлен:', currentData);

      const truckNames = Object.keys(currentData.status).sort();
       if (state.allTrucks.length === 0 || truckNames.join(',') !== state.allTrucks.join(',')) {
           state.allTrucks = truckNames;
           console.log('Список всех БелАЗов обновлен из loadData:', state.allTrucks);
       }

      filterAndRenderTrucks(); // Вызывает отрисовку DOM с новыми данными

      if(elements.updateTime) {
           elements.updateTime.textContent = `Обновлено: ${formatTime(new Date(currentData.lastUpdate))}`;
      }
      nextUpdateTime = currentData.nextUpdate;
      updateNextUpdateTimer();

  } catch (error) {
      console.error('Общая ошибка при загрузке данных:', error);
      if(elements.belazStatus) {
          elements.belazStatus.innerHTML = `<div class="loading error">Ошибка загрузки: ${error.message}</div>`;
      }
      if(elements.updateTime) elements.updateTime.textContent = 'Обновлено: Ошибка';
      if(document.getElementById('next-update')) document.getElementById('next-update').textContent = 'Следующее: Ошибка';
      if (updateInterval) clearInterval(updateInterval);

  } finally {
       console.log('loadData завершена');
       // !!! ПЕРЕМЕЩЕНА ЛОГИКА СБРОСА КНОПКИ ОБНОВЛЕНИЯ СЮДА !!!
       const refreshBtn = elements.refreshBtn;
       const refreshIcon = document.getElementById('refresh-icon');
       if(refreshBtn) {
          refreshBtn.disabled = false; // Включаем кнопку
          // Возвращаем исходный текст и иконку только если они были изменены (т.е. если был showLoading(true))
          // Проще всегда устанавливать исходное состояние
          refreshBtn.innerHTML = `
              <svg id="refresh-icon" width="12" height="12" viewBox="0 0 24 24" fill="white">
                  <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4C7.58 4 4.01 7.58 4.01 12C4.01 16.42 7.58 20 12 20C15.73 20 18.84 17.45 19.73 14H17.65C16.83 16.33 14.61 18 12 18C8.69 18 6 15.31 6 12C6 8.69 8.69 6 12 6C13.66 6 15.14 6.69 16.22 7.78L13 11H20V4L17.65 6.35Z"/>
              </svg>
              Обновить
          `;
       }
        if (refreshIcon) refreshIcon.classList.remove('refresh-icon'); // Убираем анимацию вращения
  }
}

async function forceRefresh() {
console.log('Запрос на принудительное обновление...');
// Показываем состояние "Обновление..." для кнопки
showLoading(true);
// Очищаем таймер следующего обновления при ручном запуске
if (updateInterval) clearInterval(updateInterval);
nextUpdateTime = null;
 if(document.getElementById('next-update')) document.getElementById('next-update').textContent = 'Следующее: --:--';

try {
  const response = await fetch('/api/refresh', { method: 'POST' });
  if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      let errorMessage = errorData.message || `Ошибка при запросе обновления (${response.status})`;
       if (response.status === 429 && errorData.message) {
           errorMessage = errorData.message;
       }
      throw new Error(errorMessage);
  }
  const result = await response.json();
  console.log('Ответ от /api/refresh:', result.message);
  // Запрос на обновление на сервере успешен.
  // Теперь ждем, пока сервер завершит проверку статусов и пришлет новые данные по SSE,
  // или пока не сработает таймаут, после чего loadData() будет вызвана,
  // и loadData() уже сбросит состояние кнопки.

  // Если нужно сбросить кнопку сразу при *успешном* ответе /api/refresh,
  // даже до получения новых данных (не рекомендуется, т.к. кнопка вернется рано)
  // -- здесь мог бы быть вызов логики сброса кнопки --
  // Но по задаче нужно ждать перерисовки DOM, поэтому сброс в loadData.

  // Вызываем loadData через таймаут, чтобы дать серверу время.
  // loadData() сама обработает свое состояние загрузки и сброс кнопки в finally.
  setTimeout(loadData, 2000);


} catch (error) {
  console.error('Ошибка при принудительном обновлении (запрос к /api/refresh):', error);
  // В случае ошибки самого запроса /api/refresh, сбрасываем состояние кнопки сразу
  // и показываем ошибку, связанную с запросом обновления.
   if(elements.belazStatus) {
       // Можно показать ошибку в контейнере статусов, но она может быть переписана loadData позже
       // Лучше показать ошибку обновления отдельно или в консоли
       console.error("Ошибка запроса принудительного обновления:", error.message);
   }
   alert(`Не удалось запросить принудительное обновление: ${error.message}`); // Показать ошибку пользователю

   // Сбрасываем состояние кнопки, т.к. запрос на сервер не удался
   const refreshBtn = elements.refreshBtn;
   const refreshIcon = document.getElementById('refresh-icon');
   if(refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = `
          <svg id="refresh-icon" width="12" height="12" viewBox="0 0 24 24" fill="white">
              <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4C7.58 4 4.01 7.58 4.01 12C4.01 16.42 7.58 20 12 20C15.73 20 18.84 17.45 19.73 14H17.65C16.83 16.33 14.61 18 12 18C8.69 18 6 15.31 6 12C6 8.69 8.69 6 12 6C13.66 6 15.14 6.69 16.22 7.78L13 11H20V4L17.65 6.35Z"/>
          </svg>
          Обновить
      `;
   }
    if (refreshIcon) refreshIcon.classList.remove('refresh-icon');

}
// Убран finaly блок, который сбрасывал кнопку слишком рано
}


// Функция для фильтрации данных и вызова отрисовки - Только по поиску
function filterAndRenderTrucks() {
  console.log('Вызвана filterAndRenderTrucks (только по поиску). Поиск:', elements.searchInput ? elements.searchInput.value.toLowerCase().trim() : 'N/A');

  const searchTerm = elements.searchInput ? elements.searchInput.value.toLowerCase().trim() : '';
  let dataToFilter = currentData.status;

  const searchedData = {};
  if (dataToFilter) {
      for (const truckName in dataToFilter) {
          if (Object.prototype.hasOwnProperty.call(dataToFilter, truckName)) {
               const formattedTruckName = 'Б' + truckName.replace('БелАЗ-', '');
               if (truckName.toLowerCase().includes(searchTerm) || formattedTruckName.toLowerCase().includes(searchTerm)) {
                   searchedData[truckName] = dataToFilter[truckName];
               }
          }
      }
  }

  console.log('Данные после фильтрации по поиску:', Object.keys(searchedData).length, 'БелАЗов');

  renderTrucks(searchedData);
}

// Функция отрисовки принимает данные
function renderTrucks(dataToRender) {
console.log('Вызвана renderTrucks с данными:', dataToRender);

if(elements.belazStatus) {
  elements.belazStatus.innerHTML = ''; // Очищаем контейнер перед отрисовкой
} else {
    console.error("Элемент #belaz-status не найден в DOM. Невозможно отрисовать список.");
    return;
}

if (!dataToRender || typeof dataToRender !== 'object') {
    console.error("Некорректные данные переданы в renderTrucks:", dataToRender);
    elements.belazStatus.innerHTML = `<div class="loading error">Ошибка отрисовки: некорректные данные.</div>`;
    return;
}

const truckNames = Object.keys(dataToRender);
console.log('Количество БелАЗов для отрисовки:', truckNames.length);


if (truckNames.length === 0) {
    let message = 'Нет данных для отображения';
    if (elements.searchInput && elements.searchInput.value.trim() !== '') {
        message = 'Нет БелАЗов, соответствующих поиску';
    } else {
         message = 'Нет данных для отображения.';
    }

     elements.belazStatus.innerHTML = `<div class="loading">${message}</div>`;
    console.log('Отображено сообщение о пустом списке:', message);
    return;
}

const sortedTrucks = truckNames.sort();
console.log('Отсортированный список БелАЗов для рендеринга:', sortedTrucks);


const fragment = document.createDocumentFragment();

for (const truck of sortedTrucks) {
    if (!Object.prototype.hasOwnProperty.call(dataToRender, truck)) {
         console.warn(`Пропущен БелАЗ ${truck} при отрисовке (не собственный ключ).`);
         continue;
    }

    const devices = dataToRender[truck];

    if (!devices) {
        console.warn(`Пропущен БелАЗ ${truck} из-за отсутствия данных об устройствах в dataToRender.`);
        continue;
    }

    const formattedTruckName = 'Б' + truck.replace('БелАЗ-', '');

    const listItem = document.createElement('div');
    listItem.className = 'belaz-list-item';
    listItem.setAttribute('data-truck', truck);

    const gpsAlive = devices.gps && devices.gps.alive;
    const engineAlive = devices.engine && devices.engine.alive;
    const sensorAlive = devices.sensor && devices.sensor.alive;
    cameraAlive = devices.camera && devices.camera.alive; // Убрано лишнее объявление с let/const

    const gpsStatus = gpsAlive ? 'online' : 'offline';
    const engineStatus = engineAlive ? 'online' : 'offline';
    const sensorStatus = sensorAlive ? 'online' : 'offline';
    const cameraStatus = cameraAlive ? 'online' : 'offline';


    listItem.innerHTML = `
      <div class="belaz-name">${formattedTruckName}</div>
      <div class="status-container">
        <div class="status-item" data-device="gps">
          <div class="status-value ${gpsStatus}"><span class="indicator"></span></div>
        </div>
        <div class="status-item" data-device="engine">
          <div class="status-value ${engineStatus}"><span class="indicator"></span></div>
        </div>
        <div class="status-item" data-device="sensor">
          <div class="status-value ${sensorStatus}"><span class="indicator"></span></div>
        </div>
        <div class="status-item" data-device="camera">
          <div class="status-value ${cameraStatus}"><span class="indicator"></span></div>
        </div>
      </div>
      <div class="buttons-container">
        <button class="control-button" onclick="handleRelayControl('${truck}', 'on')">ВКЛ</button>
        <button class="control-button" onclick="handleRelayControl('${truck}', 'off')">ВЫКЛ</button>
      </div>
    `;
    fragment.appendChild(listItem);
}

elements.belazStatus.appendChild(fragment);
console.log('Список БелАЗов отрисован успешно.');
}


// Обработчик кликов на статусы
if(elements.belazStatus) {
  elements.belazStatus.addEventListener('click', (event) => {
      const statusItem = event.target.closest('.status-item');
      if (!statusItem) return;
      const listItem = event.target.closest('.belaz-list-item');
      if (!listItem) return;

      const truckName = listItem.dataset.truck;
      const deviceName = statusItem.dataset.device;
      console.log('Клик по статусу для:', truckName, '/', deviceName);


      if (truckName && deviceName && currentData.status && currentData.status[truckName] && currentData.status[truckName][deviceName]) {
          const ipAddress = currentData.status[truckName][deviceName].ip;
           if(elements.ipInfo) {
              elements.ipInfo.textContent = `IP адрес для ${truckName} / ${deviceName.toUpperCase()}: ${ipAddress || 'Нет данных'}`;
              console.log(`Отображен IP: ${ipAddress || 'Нет данных'} для ${truckName} / ${deviceName}`);
           }
      } else {
           if(elements.ipInfo) {
              elements.ipInfo.textContent = `Не удалось получить IP для ${truckName} / ${deviceName ? deviceName.toUpperCase() : '???'}`;
              console.warn(`Не удалось получить IP для ${truckName} / ${deviceName ? deviceName.toUpperCase() : '???'}`);
           }
      }
  });
}


// Обработчик ввода в поле поиска с Debounce
if(elements.searchInput) {
  elements.searchInput.addEventListener('input', () => {
      console.log('Ввод в поле поиска:', elements.searchInput.value);
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
          console.log('Запуск фильтрации после Debounce');
          filterAndRenderTrucks();
      }, 250);
  });
}

// Обработчик клика по кнопке обновления
if(elements.refreshBtn) {
  elements.refreshBtn.addEventListener('click', forceRefresh);
}


// Инициализация приложения
function initApp() {
console.log('Инициализация приложения...');
// showLoading() вызывается здесь для первой загрузки
showLoading(); // Показываем индикатор первой загрузки

initSSE();
loadData(); // Первая загрузка данных
}

// Запуск приложения при полной загрузке DOM
document.addEventListener('DOMContentLoaded', initApp);