// Хранилище: JSON-файлы в server/data.
// Запись всегда атомарная: пишем во временный файл рядом, затем переименовываем.
// Переименование в пределах одной директории атомарно и на Linux, и на Windows.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Создаёт директорию, если её нет.
export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// Читает JSON. Если файла нет или он пустой, возвращает копию значения по умолчанию.
export function readJson(file, fallback) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return structuredClone(fallback);
    throw new Error(`Не удалось прочитать ${file}: ${err.message}`);
  }
  if (raw.trim() === '') return structuredClone(fallback);
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Файл ${file} содержит битый JSON: ${err.message}`);
  }
}

// Атомарная запись: tmp-файл рядом плюс renameSync.
export function writeJsonAtomic(file, value) {
  const dir = path.dirname(file);
  ensureDir(dir);
  const suffix = crypto.randomBytes(6).toString('hex');
  const tmp = path.join(dir, `.${path.basename(file)}.${suffix}.tmp`);
  const text = JSON.stringify(value, null, 2) + '\n';
  try {
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, file);
  } catch (err) {
    // Мусор после неудачной записи не оставляем.
    try { fs.unlinkSync(tmp); } catch { /* уже удалён */ }
    throw new Error(`Не удалось записать ${file}: ${err.message}`);
  }
}

// Один JSON-файл: данные держим в памяти, на диск пишем целиком и атомарно.
export class JsonFile {
  constructor(file, fallback) {
    this.file = file;
    this.fallback = fallback;
    this.data = readJson(file, fallback);
    this.stamp = statStamp(file);
    // Файла может не быть: создаём сразу, чтобы структура данных была видна глазами.
    if (this.stamp === null) this.save();
  }

  // Сохраняет текущее состояние.
  save() {
    writeJsonAtomic(this.file, this.data);
    this.stamp = statStamp(this.file);
  }

  // Перечитывает файл, если его правили снаружи (mtime или размер изменились).
  // Нужно для справочников, которые редактирует человек: staff.json.
  reloadIfChanged() {
    const stamp = statStamp(this.file);
    if (stamp === null) return this.data;
    if (this.stamp && stamp.mtimeMs === this.stamp.mtimeMs && stamp.size === this.stamp.size) {
      return this.data;
    }
    this.data = readJson(this.file, this.fallback);
    this.stamp = stamp;
    return this.data;
  }
}

function statStamp(file) {
  try {
    const st = fs.statSync(file);
    return { mtimeMs: st.mtimeMs, size: st.size };
  } catch {
    return null;
  }
}
