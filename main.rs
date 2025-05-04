use axum::{
    extract::State,
    http::StatusCode,
    response::{sse::Event, IntoResponse, Sse},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    net::IpAddr,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime},
};
use tokio::{
    sync::broadcast,
    time::{interval, sleep},
};
use tokio_stream::{wrappers::BroadcastStream, StreamExt as _};

// Типы данных
type SharedState = Arc<AppState>;
type StatusCache = HashMap<String, DeviceStatus>;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DeviceStatus {
    gps: DeviceInfo,
    sensor: DeviceInfo,
    camera: DeviceInfo,
    engine: DeviceInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DeviceInfo {
    alive: bool,
    ip: String,
}

#[derive(Debug, Clone)]
struct AppState {
    status_cache: Mutex<StatusCache>,
    last_update: Mutex<SystemTime>,
    tx: broadcast::Sender<StatusCache>,
}

#[derive(Debug, Serialize)]
struct ApiResponse {
    status: StatusCache,
    last_update: String,
}

// Константы
const UPDATE_INTERVAL: u64 = 300; // 5 минут
const PING_TIMEOUT: u64 = 1; // 1 секунда

#[tokio::main]
async fn main() {
    // Инициализация состояния
    let (tx, _) = broadcast::channel(10);
    let state = Arc::new(AppState {
        status_cache: Mutex::new(HashMap::new()),
        last_update: Mutex::new(SystemTime::now()),
        tx,
    });

    // Запуск фоновой задачи для проверки статусов
    tokio::spawn(check_statuses_task(state.clone()));

    // Настройка маршрутов
    let app = Router::new()
        .route("/api/status", get(get_status))
        .route("/api/refresh", post(force_refresh))
        .route("/updates", get(sse_updates))
        .with_state(state);

    // Запуск сервера
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("Сервер запущен на http://localhost:3000");
    axum::serve(listener, app).await.unwrap();
}

// Фоновый таск для периодической проверки статусов
async fn check_statuses_task(state: SharedState) {
    let mut interval = interval(Duration::from_secs(UPDATE_INTERVAL));
    
    loop {
        interval.tick().await;
        if let Err(e) = check_all_statuses(&state, false).await {
            eprintln!("Ошибка при проверке статусов: {}", e);
        }
    }
}

// Проверка всех статусов
async fn check_all_statuses(state: &SharedState, manual: bool) -> Result<(), String> {
    if manual {
        println!("=== ЗАПУЩЕНО РУЧНОЕ ОБНОВЛЕНИЕ ===");
    }

    let start_time = SystemTime::now();
    let mut new_status = HashMap::new();

    // Генерация тестовых данных (в реальном проекте - запрос к устройствам)
    for i in 1..=50 {
        let truck_name = format!("БелАЗ-{:02}", i);
        let live_ips = ["8.8.8.8", "1.1.1.1", "142.250.185.206"];
        
        new_status.insert(truck_name.clone(), DeviceStatus {
            gps: DeviceInfo {
                alive: i % 4 == 1,
                ip: if i % 4 == 1 { live_ips[0].to_string() } else { format!("192.168.{}.10", i) },
            },
            sensor: DeviceInfo {
                alive: i % 5 == 2,
                ip: if i % 5 == 2 { live_ips[1].to_string() } else { format!("192.168.{}.11", i) },
            },
            camera: DeviceInfo {
                alive: i % 6 == 3,
                ip: if i % 6 == 3 { live_ips[2].to_string() } else { format!("192.168.{}.12", i) },
            },
            engine: DeviceInfo {
                alive: false,
                ip: format!("192.168.{}.13", i),
            },
        });
    }

    // Обновление состояния
    {
        let mut cache = state.status_cache.lock().unwrap();
        *cache = new_status.clone();
        *state.last_update.lock().unwrap() = SystemTime::now();
    }

    // Отправка обновления через SSE
    let _ = state.tx.send(new_status);
    
    let duration = start_time.elapsed().unwrap().as_secs_f64();
    println!("Проверка завершена за {:.2} сек.", duration);
    
    Ok(())
}

// API эндпоинты
async fn get_status(State(state): State<SharedState>) -> impl IntoResponse {
    let cache = state.status_cache.lock().unwrap().clone();
    let last_update = *state.last_update.lock().unwrap();
    
    Json(ApiResponse {
        status: cache,
        last_update: format!("{:?}", last_update),
    })
}

async fn force_refresh(State(state): State<SharedState>) -> impl IntoResponse {
    if let Err(e) = check_all_statuses(&state, true).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e);
    }
    (StatusCode::ACCEPTED, "Запущено принудительное обновление".to_string())
}

async fn sse_updates(State(state): State<SharedState>) -> Sse<impl tokio_stream::Stream<Item = Result<Event, axum::Error>>> {
    let rx = state.tx.subscribe();
    let stream = BroadcastStream::new(rx)
        .filter_map(|result| match result {
            Ok(data) => Some(Ok(Event::default().json_data(data).unwrap())),
            Err(_) => None,
        })
        .map(Ok);

    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keep-alive"),
    )
}