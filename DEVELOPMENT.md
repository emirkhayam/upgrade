# АПГРЕЙД 2026 — План разработки

## Проект
Сайт детского лагеря АПГРЕЙД 2026, Иссык-Куль, Кыргызстан. Возраст 12-15 лет. 7 потоков за лето, 560 юнитов, цена 19 998 сом.

## Текущее состояние
- Node.js + Express сервер на порту 3000
- SQLite база данных (camp.db) с 7 потоками
- 3 страницы в `public/`: index.html, system.html, media.html
- Общий `styles.css` (дизайн-система) + `hero-bg.mp4`
- Дизайн утверждён (cinematic dark/gaming, оранжевый акцент)
- Часть фото заменена на реальные (`public/img/`), остальные — Unsplash плейсхолдеры
- Локальный сервер: `npm run dev` (порт 3000)
- Админка: `http://localhost:3000/admin/` (admin / upgrade2026)

## Утверждённый стек

| Слой | Технология | Статус |
|------|-----------|--------|
| Frontend | HTML/CSS/JS | Готов |
| Backend | Node.js + Express 5 | Готов |
| БД | SQLite (better-sqlite3) | Готов |
| Загрузка файлов | multer | Готов |
| Админ-аутентификация | JWT + bcryptjs | Готов |
| Деплой | VPS + PM2 + nginx | Не начат |

## Структура файлов (текущая)

```
/
├── server.js                 # Express сервер
├── db.js                     # SQLite инициализация + миграции + seed
├── .env                      # JWT_SECRET, ADMIN_USER, ADMIN_PASS, PORT
├── camp.db                   # SQLite (создаётся автоматически)
├── package.json
├── routes/
│   ├── streams.js            # GET /api/streams
│   ├── bookings.js           # POST /api/bookings
│   └── admin.js              # Логин, CRUD заявок/потоков, QR upload
├── middleware/
│   └── auth.js               # JWT verify middleware
├── public/                   # Статический сайт
│   ├── index.html            # Главная
│   ├── system.html           # Система + форма бронирования
│   ├── media.html            # Медиа
│   ├── styles.css            # Общая дизайн-система
│   ├── hero-bg.mp4           # Видео-фон hero
│   ├── img/                  # Локальные картинки
│   │   ├── camp-team.png     # Команда у озера
│   │   ├── participant-1.png # Айбек Усупов
│   │   ├── participant-2.png # Кубатбек Алиев
│   │   ├── trophy.png        # Трофей Grand Champion
│   │   └── medal.png         # Медаль АПГРЕЙД
│   └── admin/
│       └── index.html        # Панель менеджера
└── uploads/
    ├── qr/                   # QR-код (загружается менеджером)
    └── content/              # Фото и контент
```

## Схема БД

```sql
CREATE TABLE streams (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  date_start TEXT NOT NULL,
  date_end   TEXT NOT NULL,
  capacity   INTEGER NOT NULL,
  price      INTEGER NOT NULL DEFAULT 19998,
  is_active  INTEGER DEFAULT 1
);

CREATE TABLE bookings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  stream_id    INTEGER NOT NULL REFERENCES streams(id),
  child_name   TEXT NOT NULL,
  child_age    INTEGER NOT NULL,
  parent_phone TEXT NOT NULL,
  parent_name  TEXT DEFAULT '',
  status       TEXT DEFAULT 'pending',  -- pending | confirmed | cancelled
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

## API Endpoints

### Публичные
```
GET  /api/streams
  - Возвращает потоки где есть свободные места
  - Поля: id, name, date_start, date_end, price, spots_left

POST /api/bookings
  - Body: { stream_id, child_name, child_age, parent_phone, parent_name }
  - Проверяет свободные места внутри SQLite-транзакции
  - Возвращает: { booking_id, qr_image_url, message }
  - 409 если мест нет
```

### Админка (за JWT)
```
POST   /api/admin/login
GET    /api/admin/bookings?stream_id=&status=
PATCH  /api/admin/bookings/:id          -- смена статуса
GET    /api/admin/streams
POST   /api/admin/streams
PATCH  /api/admin/streams/:id
DELETE /api/admin/streams/:id
POST   /api/admin/settings/qr           -- загрузка QR (multipart)
GET    /api/admin/settings/qr           -- текущий QR
```

## Флоу бронирования (обновлённый)

```
1. Родитель открывает форму (system.html#register)
2. Форма: 3 шага (юнит → родитель → поток/медицина)
3. Потоки загружаются из API — показывают даты + свободные места
4. Submit → POST /api/bookings → заявка записывается
5. Показывается QR-код для оплаты (загруженный менеджером)
6. Родитель оплачивает → нажимает "Я оплатил · Подтвердить бронь"
7. Показывается: "Ваша заявка в обработке, менеджер свяжется"
8. Менеджер видит заявку в админке → связывается → подтверждает
```

## Админка — функционал

1. Логин (admin / upgrade2026)
2. Заявки: таблица с фильтрами (по потоку, статусу), кнопки "Принять" / "Отклонить"
3. Статистика: всего заявок, ожидает, подтверждено, отменено
4. Потоки: создание/редактирование (название, даты, вместимость, цена), включить/скрыть
5. QR: загрузка QR-кода для оплаты

## Порядок разработки

### Шаг 1 — Инициализация проекта
- [x] npm init, установить express, better-sqlite3, multer, jsonwebtoken, bcryptjs, cors, dotenv
- [x] server.js с Express + статика из public/
- [x] db.js — инициализация SQLite с миграциями + seed 7 потоков
- [x] Перенести HTML/CSS/JS в public/

### Шаг 2 — API потоков
- [x] GET /api/streams с подсчётом свободных мест (LEFT JOIN COUNT)
- [x] Seed данных: 7 потоков с датами лета 2026

### Шаг 3 — API бронирования
- [x] POST /api/bookings с валидацией и транзакцией
- [x] Проверка свободных мест (race condition guard внутри SQLite transaction)

### Шаг 4 — Админка: аутентификация
- [x] POST /api/admin/login → JWT (24h expiry)
- [x] Middleware проверки токена (auth.js)

### Шаг 5 — Админка: управление
- [x] CRUD потоков (создание, редактирование, включить/скрыть)
- [x] Просмотр/управление заявками (фильтры, смена статуса)
- [x] Загрузка QR-кода (multer → uploads/qr/)

### Шаг 6 — Frontend: форма бронирования
- [x] Мультистеп-форма на system.html#register (3 шага)
- [x] Загрузка потоков из API, показ свободных мест
- [x] Submit → API → показ QR → кнопка "Подтвердить" → сообщение "заявка в обработке"

### Шаг 7 — Админка: UI
- [x] admin/index.html — vanilla JS, тёмная тема
- [x] Таблица заявок с фильтрами, кнопки статусов
- [x] Управление потоками, загрузка QR

### Шаг 8 — Картинки
- [x] Частичная замена Unsplash плейсхолдеров на реальные картинки (public/img/)
- [ ] Замена оставшихся плейсхолдеров (миссии 2-4, спикеры 3-8, атмосфера 2-8)

### На потом
- [ ] Рассрочка (поле payment_type в bookings)
- [ ] Замена оставшихся фото-плейсхолдеров
- [ ] Email/SMS уведомления
- [ ] Загрузка контента через админку (CMS)
- [ ] Мобильное меню (бургер)
- [ ] Деплой на VPS (PM2 + nginx)
- [ ] Домен и SSL

## Статус
**MVP ГОТОВ. Все 7 шагов завершены.**
Сервер: `npm run dev` → http://localhost:3000
Админка: http://localhost:3000/admin/ (admin / upgrade2026)
