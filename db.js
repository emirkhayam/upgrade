const Database = require('better-sqlite3');
const path = require('path');

const dataDir = process.env.DATA_DIR || __dirname;
const db = new Database(path.join(dataDir, 'camp.db'));

// WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Migrations
db.exec(`
  CREATE TABLE IF NOT EXISTS streams (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    date_start TEXT NOT NULL,
    date_end   TEXT NOT NULL,
    capacity   INTEGER NOT NULL,
    price      INTEGER NOT NULL DEFAULT 19998,
    is_active  INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    stream_id    INTEGER NOT NULL REFERENCES streams(id),
    child_name   TEXT NOT NULL,
    child_age    INTEGER NOT NULL,
    parent_phone TEXT NOT NULL,
    parent_name  TEXT DEFAULT '',
    status       TEXT DEFAULT 'new',
    created_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS speakers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    role       TEXT DEFAULT '',
    category   TEXT DEFAULT '',
    bio        TEXT DEFAULT '',
    photo      TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    is_active  INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS stars (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    title       TEXT DEFAULT '',
    description TEXT DEFAULT '',
    photo       TEXT DEFAULT '',
    category    TEXT DEFAULT '',
    sort_order  INTEGER DEFAULT 0,
    is_active   INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS media (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT NOT NULL DEFAULT 'photo',
    title      TEXT DEFAULT '',
    category   TEXT DEFAULT '',
    url        TEXT DEFAULT '',
    thumbnail  TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    is_active  INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migrations: add missing columns to bookings
const bookingMigrations = [
  ['gender', "TEXT DEFAULT ''"],
  ['parent_city', "TEXT DEFAULT ''"],
  ['parent_email', "TEXT DEFAULT ''"],
  ['alt_phone', "TEXT DEFAULT ''"],
  ['tshirt_size', "TEXT DEFAULT ''"],
  ['health', "TEXT DEFAULT ''"],
  ['allergies', "TEXT DEFAULT ''"],
  ['about_child', "TEXT DEFAULT ''"],
  ['wishes', "TEXT DEFAULT ''"],
  // Payment + sales-funnel fields (ТЗ §3)
  ['base_price', 'INTEGER DEFAULT 19998'],
  ['discount', 'INTEGER DEFAULT 0'],
  ['paid_amount', 'INTEGER DEFAULT 0'],
  ['payment_status', "TEXT DEFAULT 'none'"],
  ['payment_date', "TEXT DEFAULT ''"],
  ['receipt', "TEXT DEFAULT ''"],
  ['manager', "TEXT DEFAULT ''"],
  ['next_action', "TEXT DEFAULT ''"],
  ['next_contact_date', "TEXT DEFAULT ''"],
];
for (const [col, def] of bookingMigrations) {
  try {
    db.prepare(`SELECT ${col} FROM bookings LIMIT 1`).get();
  } catch {
    db.exec(`ALTER TABLE bookings ADD COLUMN ${col} ${def}`);
    console.log(`Migration: added ${col} column to bookings`);
  }
}

// Migrate legacy lead statuses (pending/confirmed/cancelled) to the 6-stage funnel
const legacyStatusMap = { pending: 'new', confirmed: 'reserved', cancelled: 'rejected' };
for (const [oldVal, newVal] of Object.entries(legacyStatusMap)) {
  const r = db.prepare('UPDATE bookings SET status = ? WHERE status = ?').run(newVal, oldVal);
  if (r.changes > 0) console.log(`Migration: remapped ${r.changes} booking(s) "${oldVal}" -> "${newVal}"`);
}

// Seed streams if empty
const count = db.prepare('SELECT COUNT(*) as c FROM streams').get();
if (count.c === 0) {
  const insert = db.prepare(
    'INSERT INTO streams (name, date_start, date_end, capacity, price) VALUES (?, ?, ?, ?, ?)'
  );
  const streams = [
    ['Поток 1', '2026-06-20', '2026-06-30', 80, 19998],
    ['Поток 2', '2026-06-30', '2026-07-10', 80, 19998],
    ['Поток 3', '2026-07-10', '2026-07-20', 80, 19998],
    ['Поток 4', '2026-07-20', '2026-07-30', 80, 19998],
    ['Поток 5', '2026-07-30', '2026-08-09', 80, 19998],
    ['Поток 6', '2026-08-09', '2026-08-19', 80, 19998],
    ['Поток 7', '2026-08-19', '2026-08-29', 80, 19998],
  ];
  const tx = db.transaction(() => {
    for (const s of streams) insert.run(...s);
  });
  tx();
  console.log('Seeded 7 streams');
}

// Seed speakers if empty
const speakerCount = db.prepare('SELECT COUNT(*) as c FROM speakers').get();
if (speakerCount.c === 0) {
  const ins = db.prepare('INSERT INTO speakers (name, role, category, bio, photo, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
  const speakers = [
    ['Олимпийские чемпионы', 'Чемпионы мира · Тренеры сборной КР', 'Спорт', 'Борьба, дзюдо, спортивная гимнастика. Личные сессии, лекции о пути к золоту.', 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600&q=85', 1],
    ['Учёные мирового уровня', 'Физики · Биологи · MIT, ETH, Max Planck', 'Наука', 'Эксперименты вживую, лекции о физике, генетике, ИИ. Лабораторные сессии.', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&q=85', 2],
    ['Программисты Google · Meta', 'Senior Engineers · ML / AI', 'IT', 'Кыргызстанцы в Big Tech. AI workshops, карьерные траектории, менторство.', 'https://images.unsplash.com/photo-1556157382-97eda2d62296?w=600&q=85', 3],
    ['Актёры · Музыканты · Дизайнеры', 'Лауреаты фестивалей', 'Творчество', 'Актёры кино, архитекторы, видеомейкеры. Мастер-классы по самовыражению.', 'https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=600&q=85', 4],
    ['IT-предприниматели', 'Основатели стартапов', 'Бизнес', 'Кыргызские IT-стартапы. Лекции об инвестициях, networking, менторство.', 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=600&q=85', 5],
    ['Специальные гости', 'Меняются каждый поток', 'Special', 'Космонавты, путешественники, блогеры. Анонсы перед стартом потока.', 'https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?w=600&q=85', 6],
  ];
  const tx = db.transaction(() => { for (const s of speakers) ins.run(...s); });
  tx();
  console.log('Seeded 6 speakers');
}

// Seed stars if empty
const starCount = db.prepare('SELECT COUNT(*) as c FROM stars').get();
if (starCount.c === 0) {
  const insStar = db.prepare('INSERT INTO stars (name, title, category, description, photo, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
  const stars = [
    ['Айсулуу Тыныбекова', 'Олимпийская чемпионка по борьбе', 'Спорт', 'Первая олимпийская чемпионка Кыргызстана. Многократная чемпионка мира и Азии по женской борьбе.', 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600&q=85', 1],
    ['Акжол Махмудов', 'Олимпийский чемпион по борьбе', 'Спорт', 'Золото Олимпийских игр в греко-римской борьбе. Гордость кыргызского спорта.', 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&q=85', 2],
    ['Эрнест Абдыжапаров', 'Senior Engineer, Google', 'IT', 'Кыргызстанец в Google. Разработка AI-систем, менторство молодых программистов из ЦА.', 'https://images.unsplash.com/photo-1556157382-97eda2d62296?w=600&q=85', 3],
    ['Азамат Жаналиев', 'Чемпион мира по борьбе', 'Спорт', 'Двукратный чемпион мира по борьбе. Тренер молодёжной сборной Кыргызстана.', 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&q=85', 4],
    ['Нурбек Изабеков', 'Основатель IT-стартапа', 'Бизнес', 'Серийный предприниматель из Бишкека. Создатель нескольких успешных tech-стартапов в регионе.', 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=600&q=85', 5],
    ['Алтынай Омурбекова', 'Учёный-биолог', 'Наука', 'PhD в молекулярной биологии. Исследования в области генетики в ведущих лабораториях Европы.', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&q=85', 6],
  ];
  const tx = db.transaction(() => { for (const s of stars) insStar.run(...s); });
  tx();
  console.log('Seeded 6 stars');
}

// Seed media if empty
const mediaCount = db.prepare('SELECT COUNT(*) as c FROM media').get();
if (mediaCount.c === 0) {
  const ins = db.prepare('INSERT INTO media (type, title, category, url, sort_order) VALUES (?, ?, ?, ?, ?)');
  const media = [
    ['photo', 'Утренние тренировки', 'Sport', 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=900&q=85', 1],
    ['video', 'Костёр под звёздами', 'Evening', 'https://images.unsplash.com/photo-1475139441338-693e7dbe20b6?w=900&q=85', 2],
    ['photo', 'Хакатон-финал', 'IT', 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=900&q=85', 3],
    ['photo', 'Восхождение', 'Mountain', 'https://images.unsplash.com/photo-1454942901704-3c44c11b2ad1?w=900&q=85', 4],
    ['photo', 'Утро на Иссык-Куле', 'Lake', 'https://images.unsplash.com/photo-1465056836041-7f43ac27dcb5?w=900&q=85', 5],
    ['video', 'Вечеринка финала', 'Night', 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=900&q=85', 6],
    ['photo', 'Командный квест', 'Team', 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=900&q=85', 7],
    ['photo', 'Турнир потока', 'Sport', 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=900&q=85', 8],
    ['photo', 'Творческая мастерская', 'Creative', 'https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=900&q=85', 9],
    ['video', 'Награждение', 'Ceremony', 'https://images.unsplash.com/photo-1543610892-0b1f7e6d8ac1?w=900&q=85', 10],
    ['photo', 'Команда дня 3', 'Friends', 'https://images.unsplash.com/photo-1517022812141-23620dba5c23?w=900&q=85', 11],
    ['photo', 'Юнит #047', 'Portrait', 'https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?w=900&q=85', 12],
  ];
  const tx = db.transaction(() => { for (const m of media) ins.run(...m); });
  tx();
  console.log('Seeded 12 media');
}

module.exports = db;
