document.addEventListener('DOMContentLoaded', () => {
    // Проверяем, что мы на нужной странице, по уникальному элементу
    if (document.getElementById('cell-change-scan-input')) {
        initPriemkaSmenaYacheykiPage();
    }
});

// Глобальное состояние для отслеживания данных в процессе
let state = {
    oldCell: null,
    newCell: null,
    itemsToMove: [], // { item: {...}, verified: false }
    verifiedCount: 0
};

function initPriemkaSmenaYacheykiPage() {
    // === Слушатели ШАГА 1 ===
    document.getElementById('cell-change-scan-btn').addEventListener('click', handleScanSubmit);
    document.getElementById('cell-change-scan-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleScanSubmit();
    });

    // === Слушатели ШАГА 2 ===
    document.getElementById('method-next-btn').addEventListener('click', handleMethodNextClick);
    
    // Кнопки "Назад" в Шаге 2
    document.getElementById('suggested-back-btn').addEventListener('click', () => showMethodChoice(true));
    document.getElementById('manual-back-btn').addEventListener('click', () => showMethodChoice(true));

    // Обработчики выбора новой ячейки
    document.getElementById('suggested-cells-container').addEventListener('click', handleSuggestedCellClick);
    document.getElementById('manual-cell-submit-btn').addEventListener('click', handleManualCellSubmit);

    // === Слушатели ШАГА 3 ===
    document.getElementById('verification-scan-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleVerificationScan();
    });
    document.getElementById('confirm-move-btn').addEventListener('click', handleConfirmMoveClick);

    // === Слушатели ШАГА 4 ===
    document.getElementById('move-more-btn').addEventListener('click', () => {
        resetState();
        showStep(1);
    });

    // Инициализация: сбрасываем состояние и показываем Шаг 1
    resetState();
    showStep(1);
}

/**
 * Показывает нужный шаг рабочего процесса и скрывает остальные.
 * @param {number} stepNumber - Номер шага (1, 2, 3 или 4).
 */
function showStep(stepNumber) {
    document.querySelectorAll('.workflow-step').forEach(step => {
        step.style.display = 'none';
    });
    
    let stepId;
    if (stepNumber === 1) stepId = 'step1-scan';
    else if (stepNumber === 2) stepId = 'step2-options';
    else if (stepNumber === 3) stepId = 'step3-confirm';
    else if (stepNumber === 4) stepId = 'step4-success';

    const stepEl = document.getElementById(stepId);
    if (stepEl) {
        stepEl.style.display = 'block';
    }
}

/**
 * Сбрасывает состояние и очищает все поля ввода и списки.
 */
function resetState() {
    state = { oldCell: null, newCell: null, itemsToMove: [], verifiedCount: 0 };
    
    // Очистка полей
    document.getElementById('cell-change-scan-input').value = '';
    document.getElementById('manual-cell-input').value = '';
    document.getElementById('verification-scan-input').value = '';
    
    // Сброс radio
    const radio1 = document.getElementById('method-suggested');
    const radio2 = document.getElementById('method-manual');
    if (radio1) radio1.checked = false;
    if (radio2) radio2.checked = false;

    // Очистка списков
    document.getElementById('step2-item-list').innerHTML = '';
    document.getElementById('step3-item-list').innerHTML = '';
    document.getElementById('suggested-cells-container').innerHTML = '';
    
    // Сброс счетчика
    document.getElementById('verification-counter').textContent = '0 / 0';
    
    // Сброс кнопки
    document.getElementById('confirm-move-btn').disabled = true;

    // Возврат к выбору способа на Шаге 2
    showMethodChoice(true);
}

/**
 * Обработчик сканирования/ввода ШК на Шаге 1.
 */
function handleScanSubmit() {
    const code = document.getElementById('cell-change-scan-input').value.trim();
    if (!code) {
        showAlert('Введите ШК/Код товара', true);
        return;
    }

    const userData = getUserData();
    const allItems = userData.receptionItems || [];
    
    // Ищем товар по ШК или по 9-значному коду
    const scannedItem = allItems.find(item => item.barcode === code || item.code === code);

    if (!scannedItem) {
        showAlert('Товар с таким ШК/кодом не найден в принятых', true);
        return;
    }

    // Сохраняем старую ячейку и все товары из нее
    state.oldCell = scannedItem.cell;
    
    // Заполняем state.itemsToMove
    const itemsFromCell = allItems.filter(item => item.cell === state.oldCell);
    state.itemsToMove = itemsFromCell.map(item => ({ item: item, verified: false }));
    state.verifiedCount = 0;
    
    document.getElementById('old-cell-display').textContent = `Ячейка ${parseInt(state.oldCell, 10)}`;
    
    // Заполняем список товаров на Шаге 2
    populateItemList(document.getElementById('step2-item-list'), state.itemsToMove);
    
    // Переходим на Шаг 2
    showStep(2);
    // Показываем начальный экран Шага 2
    showMethodChoice(true);
}

/**
 * Заполняет контейнер списком карточек товаров.
 * @param {HTMLElement} container - Элемент <ul> или <div> для списка.
 * @param {Array} itemsWithStatus - Массив объектов {item: {...}, verified: ...}.
 * @param {boolean} [isVerificationStep=false] - Флаг, что это для Шага 3 (проверка).
 */
function populateItemList(container, itemsWithStatus, isVerificationStep = false) {
    if (!container) return;
    container.innerHTML = '';
    if (itemsWithStatus.length === 0) {
        container.innerHTML = '<p>Товаров не найдено</p>';
        return;
    }
    
    itemsWithStatus.forEach(itemObj => {
        const item = itemObj.item;
        const itemCard = document.createElement('div');
        // Используем data-атрибуты для поиска
        itemCard.dataset.barcode = item.barcode;
        itemCard.dataset.code = item.code;
        
        // "highlight" = верифицирован, "" = не верифицирован
        itemCard.className = `pv-item-card ${itemObj.verified ? 'highlight' : ''}`; 

        let cardHtml = '';
        if (isVerificationStep) {
            // Новый формат для Шага 3 (Проверка)
            cardHtml = `
            <div class="pv-item-image">${item.image || '📦'}</div>
            <div class="pv-item-details">
                <span class="product-name-pv">${item.name || 'Без имени'}</span>
                <span>Ячейка: <strong>${parseInt(item.cell, 10)}</strong></span>
                <span>ШК: <strong>${item.barcode || 'N/A'}</strong></span>
            </div>`;
        } else {
            // Старый формат для Шага 2 (Список)
            cardHtml = `
            <div class="pv-item-image">${item.image || '📦'}</div>
            <div class="pv-item-details">
                <span class="product-name-pv">${item.name || 'Без имени'}</span>
                <span>Ячейка: <strong>${parseInt(item.cell, 10)}</strong></span>
                <span>ШК: <strong>${item.barcode || 'N/A'}</strong></span>
                <span>Код: <strong>${item.code || 'N/A'}</strong></span>
            </div>`;
        }
        
        itemCard.innerHTML = cardHtml;
        container.appendChild(itemCard);
    });
}

// --- Логика ШАГА 2 ---

/**
 * Показывает или скрывает контейнеры на Шаге 2.
 * @param {boolean} showChoice - Показать главный выбор?
 * @param {string|null} [showOption=null] - 'suggested' или 'manual'.
 */
function showMethodChoice(showChoice, showOption = null) {
    document.getElementById('method-choice-container').style.display = showChoice ? 'block' : 'none';
    document.getElementById('suggested-choice-container').style.display = showOption === 'suggested' ? 'block' : 'none';
    document.getElementById('manual-choice-container').style.display = showOption === 'manual' ? 'block' : 'none';
}

/**
 * Обработчик кнопки "Далее" на Шаге 2.
 */
function handleMethodNextClick() {
    const suggested = document.getElementById('method-suggested').checked;
    const manual = document.getElementById('method-manual').checked;

    if (!suggested && !manual) {
        showAlert('Пожалуйста, выберите способ', true);
        return;
    }

    if (suggested) {
        populateSuggestedCells(5); // Генерируем ячейки
        showMethodChoice(false, 'suggested');
    } else if (manual) {
        showMethodChoice(false, 'manual');
    }
}

/**
 * Находит 5 свободных ячеек и создает для них кнопки.
 * @param {number} count - Количество ячеек для поиска.
 */
function populateSuggestedCells(count) {
    const container = document.getElementById('suggested-cells-container');
    if (!container) return;
    container.innerHTML = '';
    
    const emptyCells = findEmptyCells(count);
    
    if (emptyCells.length === 0) {
        container.innerHTML = '<p style="font-size: 0.9rem; color: var(--text-secondary-color);">Нет свободных ячеек.</p>';
        return;
    }

    // Создаем кнопки для каждой свободной ячейки
    emptyCells.forEach(cell => {
        const btn = document.createElement('button');
        btn.className = 'secondary-btn'; // Используем класс из styles.css
        btn.style.padding = '15px 10px';
        btn.style.fontSize = '1.2rem';
        btn.textContent = parseInt(cell, 10);
        btn.dataset.cell = cell; // Сохраняем 3-значный номер в data-атрибуте
        container.appendChild(btn);
    });
}

/**
 * Ищет свободные ячейки.
 * @param {number} count - Сколько ячеек найти.
 * @returns {Array<string>} - Массив 3-значных номеров ячеек (строки).
 */
function findEmptyCells(count) {
    const userData = getUserData();
    const allItems = userData.receptionItems || [];
    const usedCells = new Set(allItems.map(item => item.cell));
    
    const emptyCells = [];
    let attempts = 0; // Защита от бесконечного цикла

    // Ищем случайные ячейки от 100 до 999
    while (emptyCells.length < count && attempts < 1000) {
        const randomCell = Math.floor(Math.random() * 900) + 100;
        const paddedCell = String(randomCell).padStart(3, '0');
        
        // Добавляем, если ячейка не занята, не равна старой, и еще не в нашем списке
        if (paddedCell !== state.oldCell && !usedCells.has(paddedCell) && !emptyCells.includes(paddedCell)) {
            emptyCells.push(paddedCell);
        }
        attempts++;
    }
    return emptyCells;
}

/**
 * Проверяет, пуста ли ячейка.
 * @param {string} cell - 3-значный номер ячейки (строка).
 * @returns {boolean} - true, если пуста.
 */
function isCellEmpty(cell) {
    const paddedCell = cell.padStart(3, '0');
    const userData = getUserData();
    const allItems = userData.receptionItems || [];
    // Ячейка пуста, если ни один товар ее не использует
    return !allItems.some(item => item.cell === paddedCell);
}

/**
 * Обработчик клика по предложенной ячейке (Шаг 2).
 */
function handleSuggestedCellClick(e) {
    // Используем делегирование событий
    if (e.target.tagName === 'BUTTON' && e.target.dataset.cell) {
        state.newCell = e.target.dataset.cell;
        // Переходим к Шагу 3 (Проверка)
        initStep3Verification();
    }
}

/**
 * Обработчик ручного ввода ячейки (Шаг 2).
 */
function handleManualCellSubmit() {
    const manualCellInput = document.getElementById('manual-cell-input');
    const manualCell = manualCellInput.value.trim();
    
    if (!/^\d{1,3}$/.test(manualCell)) {
        showAlert('Введите корректный номер ячейки (1-3 цифры)', true);
        return;
    }

    const paddedCell = manualCell.padStart(3, '0');

    if (paddedCell === state.oldCell) {
        showAlert('Новая ячейка не должна совпадать со старой', true);
        return;
    }

    if (!isCellEmpty(paddedCell)) {
        showAlert('Эта ячейка занята, выберите другую', true);
        return;
    }

    // Ячейка свободна, сохраняем и переходим к проверке
    state.newCell = paddedCell;
    initStep3Verification();
}


// --- Логика ШАГА 3 ---

/**
 * Инициализирует Шаг 3 (Проверка).
 */
function initStep3Verification() {
    // Заполняем номера ячеек
    document.getElementById('confirm-old-cell').textContent = parseInt(state.oldCell, 10);
    document.getElementById('confirm-new-cell').textContent = parseInt(state.newCell, 10);
    
    // Сбрасываем счетчик
    state.verifiedCount = 0;
    state.itemsToMove.forEach(itemObj => itemObj.verified = false);
    updateVerificationCounter();

    // Заполняем список товаров на Шаге 3 (с новым форматом)
    populateItemList(document.getElementById('step3-item-list'), state.itemsToMove, true);
    
    // Сбрасываем поле и кнопку
    document.getElementById('verification-scan-input').value = '';
    document.getElementById('confirm-move-btn').disabled = true;

    // Показываем Шаг 3
    showStep(3);
    
    // Фокусируемся на поле ввода
    document.getElementById('verification-scan-input').focus();
}

/**
 * Обновляет счетчик проверки.
 */
function updateVerificationCounter() {
    document.getElementById('verification-counter').textContent = `${state.verifiedCount} / ${state.itemsToMove.length}`;
}

/**
 * Обработчик сканирования на Шаге 3.
 */
function handleVerificationScan() {
    const input = document.getElementById('verification-scan-input');
    const codeOrBarcode = input.value.trim();
    
    if (!codeOrBarcode) return;

    // Ищем *непроверенный* товар
    const itemToVerify = state.itemsToMove.find(itemObj => 
        !itemObj.verified && 
        (itemObj.item.barcode === codeOrBarcode || itemObj.item.code === codeOrBarcode)
    );

    if (itemToVerify) {
        // Найден!
        itemToVerify.verified = true;
        state.verifiedCount++;
        updateVerificationCounter();
        
        // Озвучиваем (если speaker.js подключен)
        if (typeof playSound === 'function') {
            playSound("successScan.mp3"); // Используем звук успеха вместо речи
        }

        // Обновляем UI-карточку (добавляем класс 'highlight')
        const listContainer = document.getElementById('step3-item-list');
        const card = listContainer.querySelector(`[data-code="${itemToVerify.item.code}"]`) || 
                     listContainer.querySelector(`[data-barcode="${itemToVerify.item.barcode}"]`);
        
        if (card) {
            card.classList.add('highlight');
            // Плавно прокручиваем к найденному товару
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // Проверяем, все ли товары проверены
        if (state.verifiedCount === state.itemsToMove.length) {
            document.getElementById('confirm-move-btn').disabled = false;
        }

    } else {
        // Ошибка: товар не найден или уже проверен
        showAlert('Товар не найден или уже проверен', true);
        if (typeof playSound === 'function') {
            playSound("failScan.mp3"); // Используем звук ошибки
        }
    }
    
    // Очищаем поле ввода
    input.value = '';
}


// --- Логика ШАГА 4 ---

/**
 * Обработчик финального подтверждения (Шаг 3).
 */
function handleConfirmMoveClick() {
    const loader = document.getElementById('data-loader');
    loader.style.display = 'flex';

    // Имитируем задержку сети и сохраняем данные
    setTimeout(() => {
        let userData = getUserData();
        let allItems = userData.receptionItems || [];

        // Обновляем ячейку для всех перемещаемых товаров
        // Нам нужны ШК/коды перемещаемых товаров
        const itemCodesToMove = new Set(state.itemsToMove.map(itemObj => itemObj.item.code));

        const updatedItems = allItems.map(item => {
            // Если код товара есть в нашем списке на перемещение
            if (itemCodesToMove.has(item.code)) {
                // Возвращаем копию объекта с новой ячейкой
                return { ...item, cell: state.newCell };
            }
            return item; // Возвращаем неизменный объект
        });

        userData.receptionItems = updatedItems;
        saveUserData(userData); // Сохраняем все данные
        
        // Показываем экран успеха
        showSuccessScreen();
        loader.style.display = 'none';

    }, 500); // Короткая задержка
}

/**
 * Показывает Шаг 4 (Успех).
 */
function showSuccessScreen() {
    document.getElementById('success-message-cell').textContent = `Товары (${state.itemsToMove.length} шт.) перемещены с ячейки ${parseInt(state.oldCell, 10)} на ячейку ${parseInt(state.newCell, 10)}.`;
    showStep(4);
    
    // --- ИЗМЕНЕНИЕ: Добавлена озвучка ---
    if (typeof playSound === 'function' && typeof speakCellNumber === 'function') {
        playSound('new_cell_is.mp3');
        setTimeout(() => {
            speakCellNumber(state.newCell);
        }, 1000); // 1-секундная задержка
    }
    // --- КОНЕЦ ИЗМЕНЕНИЯ ---
}