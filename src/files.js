const DB = "id-studio-local-files";
function open() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function putFile(key, file) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction("files", "readwrite");
    t.objectStore("files").put(file, key);
    t.oncomplete = () => {
      db.close();
      resolve();
    };
    t.onerror = () => {
      db.close();
      reject(t.error);
    };
  });
}
export async function getFile(key) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction("files", "readonly");
    const r = t.objectStore("files").get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    t.oncomplete = () => db.close();
  });
}
export async function deleteFile(key) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction("files", "readwrite");
    t.objectStore("files").delete(key);
    t.oncomplete = () => {
      db.close();
      resolve();
    };
    t.onerror = () => reject(t.error);
  });
}
export async function clearFiles() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction("files", "readwrite");
    t.objectStore("files").clear();
    t.oncomplete = () => {
      db.close();
      resolve();
    };
    t.onerror = () => reject(t.error);
  });
}
