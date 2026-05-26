const db = require('./db');

// Seed speakers
const speakers = [
  { name: 'Олимпийские чемпионы', role: 'Чемпионы мира · Тренеры сборной КР', category: 'Спорт', bio: 'Борьба, дзюдо, спортивная гимнастика. Личные сессии, лекции о пути к золоту.', photo: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600&q=85', sort_order: 1 },
  { name: 'Учёные мирового уровня', role: 'Физики · Биологи · MIT, ETH, Max Planck', category: 'Наука', bio: 'Эксперименты вживую, лекции о физике, генетике, ИИ. Лабораторные сессии.', photo: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&q=85', sort_order: 2 },
  { name: 'Программисты Google · Meta', role: 'Senior Engineers · ML / AI', category: 'IT', bio: 'Кыргызстанцы в Big Tech. AI workshops, карьерные траектории, менторство.', photo: 'https://images.unsplash.com/photo-1556157382-97eda2d62296?w=600&q=85', sort_order: 3 },
  { name: 'Актёры · Музыканты · Дизайнеры', role: 'Лауреаты фестивалей', category: 'Творчество', bio: 'Актёры кино, архитекторы, видеомейкеры. Мастер-классы по самовыражению.', photo: 'https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=600&q=85', sort_order: 4 },
  { name: 'IT-предприниматели', role: 'Основатели стартапов', category: 'Бизнес', bio: 'Кыргызские IT-стартапы. Лекции об инвестициях, networking, менторство.', photo: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=600&q=85', sort_order: 5 },
  { name: 'Специальные гости', role: 'Меняются каждый поток', category: 'Special', bio: 'Космонавты, путешественники, блогеры. Анонсы перед стартом потока.', photo: 'https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?w=600&q=85', sort_order: 6 },
];

// Seed media (gallery from media.html)
const media = [
  { type: 'photo', title: 'Утренние тренировки', category: 'Sport', url: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=900&q=85', sort_order: 1 },
  { type: 'video', title: 'Костёр под звёздами', category: 'Evening', url: 'https://images.unsplash.com/photo-1475139441338-693e7dbe20b6?w=900&q=85', sort_order: 2 },
  { type: 'photo', title: 'Хакатон-финал', category: 'IT', url: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=900&q=85', sort_order: 3 },
  { type: 'photo', title: 'Восхождение', category: 'Mountain', url: 'https://images.unsplash.com/photo-1454942901704-3c44c11b2ad1?w=900&q=85', sort_order: 4 },
  { type: 'photo', title: 'Утро на Иссык-Куле', category: 'Lake', url: 'https://images.unsplash.com/photo-1465056836041-7f43ac27dcb5?w=900&q=85', sort_order: 5 },
  { type: 'video', title: 'Вечеринка финала', category: 'Night', url: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=900&q=85', sort_order: 6 },
  { type: 'photo', title: 'Командный квест', category: 'Team', url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=900&q=85', sort_order: 7 },
  { type: 'photo', title: 'Турнир потока', category: 'Sport', url: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=900&q=85', sort_order: 8 },
  { type: 'photo', title: 'Творческая мастерская', category: 'Creative', url: 'https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=900&q=85', sort_order: 9 },
  { type: 'video', title: 'Награждение', category: 'Ceremony', url: 'https://images.unsplash.com/photo-1543610892-0b1f7e6d8ac1?w=900&q=85', sort_order: 10 },
  { type: 'photo', title: 'Команда дня 3', category: 'Friends', url: 'https://images.unsplash.com/photo-1517022812141-23620dba5c23?w=900&q=85', sort_order: 11 },
  { type: 'photo', title: 'Юнит #047', category: 'Portrait', url: 'https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?w=900&q=85', sort_order: 12 },
];

// Seed stars
const stars = [
  { name: 'Азамат Жаналиев', title: 'Олимпийский чемпион', category: 'Спорт', description: 'Двукратный чемпион мира по борьбе. Гордость Кыргызстана.', photo: 'img/azamat-zhanaliev.jpg', sort_order: 1 },
];

// Insert
const insertSpeaker = db.prepare('INSERT INTO speakers (name, role, category, bio, photo, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
const insertMedia = db.prepare('INSERT INTO media (type, title, category, url, sort_order) VALUES (?, ?, ?, ?, ?)');
const insertStar = db.prepare('INSERT INTO stars (name, title, category, description, photo, sort_order) VALUES (?, ?, ?, ?, ?, ?)');

const tx = db.transaction(() => {
  // Clear existing
  db.prepare('DELETE FROM speakers').run();
  db.prepare('DELETE FROM media').run();
  db.prepare('DELETE FROM stars').run();

  for (const s of speakers) insertSpeaker.run(s.name, s.role, s.category, s.bio, s.photo, s.sort_order);
  for (const m of media) insertMedia.run(m.type, m.title, m.category, m.url, m.sort_order);
  for (const s of stars) insertStar.run(s.name, s.title, s.category, s.description, s.photo, s.sort_order);
});

tx();
console.log(`Seeded: ${speakers.length} speakers, ${media.length} media, ${stars.length} stars`);
