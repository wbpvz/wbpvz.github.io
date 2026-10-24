/**
 * Глобальный URL для озвучки цифр (Ячейки и Количество)
 * Ссылка на твой Netlify с файлами 1.mp3, 2.mp3 и т.д.
 */
const CLOUD_AUDIO_URL = 'https://stupendous-parfait-932d7e.netlify.app/';

/**
 * Проигрывает локальный файл (звуки интерфейса, ошибки, писки)
 * Возвращает Promise, чтобы можно было ждать окончания звука
 */
function playSoundPromise(fileName) {
    return new Promise((resolve) => {
        // Локальные файлы лежат рядом с index.html
        const audio = new Audio(fileName);
        audio.onended = resolve;
        audio.onerror = () => {
            console.warn(`Local audio not found: ${fileName}`);
            resolve(); // Не ломаем цепочку, если файла нет
        };
        // catch нужен, если браузер блокирует автоплей
        audio.play().catch(e => {
            console.warn("Autoplay blocked or error:", e);
            resolve();
        });
    });
}

/**
 * Обычная функция проигрывания без ожидания (для кликов, сканера)
 * Используется для звуков интерфейса
 */
function playSound(fileName) {
    const audio = new Audio(fileName);
    audio.play().catch(e => console.warn(e));
}

/**
 * ПРОИГРЫВАЕТ ЦИФРУ С NETLIFY (Ячейка или Количество)
 * Принимает: "123", 123, "5"
 * Играет: https://stupendous-parfait-932d7e.netlify.app/123.mp3
 */
function speakNumber(num) {
    return new Promise((resolve) => {
        const cleanNum = parseInt(num, 10);
        if (isNaN(cleanNum)) {
            console.warn("speakNumber: Not a number", num);
            resolve();
            return;
        }

        const url = `${CLOUD_AUDIO_URL}${cleanNum}.mp3`;
        const audio = new Audio(url);
        
        // Важно для CORS (чтобы играть с другого домена)
        audio.crossOrigin = "anonymous";

        audio.onended = resolve;
        
        audio.onerror = (e) => {
            console.warn(`Cloud audio failed for ${cleanNum} (URL: ${url})`, e);
            resolve(); 
        };

        audio.play().catch(e => {
            console.error("Play error:", e);
            resolve();
        });
    });
}

/**
 * Старая функция для совместимости, перенаправляем на новую
 */
function speakCellNumber(cell) {
    speakNumber(cell);
}