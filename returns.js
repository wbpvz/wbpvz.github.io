// Переменные для процесса возврата из коробок
let currentReturnItemIndex = null;
let currentReturnProcessData = {};

// Переменные для процесса возврата от клиента
let crSelectedHistoryEntry = null; 
let crSelectedItem = null; 

function initVozvratTovaryPage () {
    injectReturnModals();
    renderReturns();
    setupCustomerReturnFlow();
    
    // Закрытие модалки деталей
    document.querySelector('#product-details-modal .close-modal-btn')?.addEventListener('click', () => toggleModal('product-details-modal', false));
    
    document.addEventListener('scan', (e) => {
        const code = e.detail.code;
        
        // Стикер коробки
        const stickerModal = document.getElementById('return-sticker-modal');
        if (stickerModal && stickerModal.classList.contains('visible')) {
             const input = document.getElementById('return-sticker-input');
             input.value = code;
             document.getElementById('return-sticker-confirm-btn').click();
             return;
        }

        // Шаг 1
        const step1Modal = document.getElementById('cr-step1-modal');
        if (step1Modal && step1Modal.classList.contains('visible')) {
            document.getElementById('cr-step1-input').value = code;
            document.getElementById('cr-step1-next-btn').click();
            return;
        }

        // Шаг 2
        const step2Modal = document.getElementById('cr-step2-modal');
        if (step2Modal && step2Modal.classList.contains('visible')) {
            document.getElementById('cr-step2-input').value = code;
            document.getElementById('cr-step2-next-btn').click();
            return;
        }
    });
}

function renderReturns() {
    const unprocessedContainer = document.getElementById('returns-unprocessed-container');
    const totalCountEl = document.getElementById('left-panel-total-count');

    const userData = getUserData();
    const returnsItems = userData.returnsItems || [];
    
    // ФИЛЬТРУЕМ: Только НЕОБРАБОТАННЫЕ (!confirmed)
    const unprocessedItems = returnsItems.map((item, index) => ({...item, originalIndex: index})).filter(item => !item.confirmed);

    // Обновляем счетчик
    if(totalCountEl) totalCountEl.textContent = unprocessedItems.length;
    
    unprocessedContainer.innerHTML = '';

    if (unprocessedItems.length === 0) {
        unprocessedContainer.style.display = 'flex';
        unprocessedContainer.style.justifyContent = 'center';
        unprocessedContainer.style.alignItems = 'center';
        unprocessedContainer.style.height = '100%';
        unprocessedContainer.innerHTML = `
            <div class="empty-state-nice">
                <img src="ok.svg" alt="OK" style="width: 100px; height: 100px; margin-bottom: 20px;">
                <h3>Нет товаров к обработке</h3>
            </div>`;
    } else {
        // Сетка для товаров
        unprocessedContainer.style.display = 'grid';
        unprocessedContainer.style.height = 'auto'; 
        
        unprocessedItems.forEach(item => {
            unprocessedContainer.appendChild(createReturnItemCardElement(item));
        });
    }
}

function createReturnItemCardElement(item) {
    const card = document.createElement('div');
    card.className = 'product-card return-styled-card';
    
    const imageContent = item.isAdult ? 
        `<img src="adult.svg" style="width:100%; height:100%;">` : 
        (item.image ? `<img src="${item.image}" style="width:100%; height:100%; object-fit:contain;">` : '<span style="font-size:3rem">📦</span>');
    
    let codeStr = String(item.code);
    let codeDisplay = codeStr;
    if (codeStr.length >= 4) {
        codeDisplay = codeStr.slice(0, -4) + '<b>' + codeStr.slice(-4) + '</b>';
    }

    let actionButtonHTML = '';
    if (item.isUnknown || item.isNoBarcode) {
        actionButtonHTML = `<button class="process-return-btn" data-index="${item.originalIndex}">Обработать</button>`;
    } else {
        actionButtonHTML = `<div style="height: 40px;"></div>`; 
    }

    // Плашка брака теперь будет внутри картинки
    const defectiveOverlay = item.isDefective ? `<div class="defective-ribbon"><span>БРАК</span></div>` : '';
    const cellDisplay = item.cell ? parseInt(item.cell, 10) : '---';

    // Вставляем defectiveOverlay внутрь vertical-img-container
    card.innerHTML = `
        <div class="rc-gray-block rc-cell-block small-cell-header" style="align-items: flex-end; text-align: right;">
            <span class="rc-cell-label" style="font-size:0.75rem;">Ячейка</span>
            <span class="rc-cell-number" style="font-size:2.5rem;">${cellDisplay}</span>
        </div>
        
        <div class="vertical-img-container" style="height: 140px;">
             ${defectiveOverlay}
             ${imageContent}
        </div>
        
        <div class="vertical-info" style="flex-grow:1; justify-content: flex-start; gap: 2px;">
             <div class="v-code-row" style="margin-top: 5px;">${codeDisplay}</div>
             <div class="v-name-row" style="-webkit-line-clamp: 2; margin-bottom: 5px;">${item.name || 'Товар'}</div>
             
             <button class="defect-small-btn">
                <img src="defect.svg" alt="Defect"> Отметить брак
             </button>

             <div style="margin-top:auto; width:100%;">
                ${actionButtonHTML}
             </div>
        </div>
    `;

    // Слушатель: Обработать
    const processBtn = card.querySelector('.process-return-btn');
    if (processBtn) {
        processBtn.addEventListener('click', (e) => {
            e.stopPropagation(); 
            startReturnProcessing(item.originalIndex);
        });
        processBtn.addEventListener('dblclick', (e) => {
            e.stopPropagation(); 
        });
    }

    // Слушатель: Брак
    const defectBtn = card.querySelector('.defect-small-btn');
    defectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleReturnItemDefect(item.originalIndex);
    });
    defectBtn.addEventListener('dblclick', (e) => {
        e.stopPropagation(); 
    });

    // Слушатель: Двойной клик (Детали)
    card.addEventListener('dblclick', () => {
        openReturnProductDetails(item);
    });

    return card;
}

function toggleReturnItemDefect(index) {
    const userData = getUserData();
    if (!userData.returnsItems || !userData.returnsItems[index]) return;
    
    // Переключаем статус
    userData.returnsItems[index].isDefective = !userData.returnsItems[index].isDefective;
    saveUserData(userData);
    renderReturns(); // Перерисовываем
}

function openReturnProductDetails(item) {
    const modal = document.getElementById('product-details-modal');
    const container = document.getElementById('pd-modal-content');
    
    const imageContent = item.isAdult ? `<img src="adult.svg" style="width:100%">` : (item.image ? `<img src="${item.image}" style="width:100%; object-fit:contain;">` : '📦');
    let receptionDateStr = item.date ? new Date(item.date).toLocaleString('ru-RU') : "Неизвестно";
    
    container.innerHTML = `
        <div class="pd-layout">
            <div class="pd-image-col"><div class="pd-image-wrapper">${imageContent}</div></div>
            <div class="pd-info-col">
                <div class="pd-header-row">
                    <div style="font-weight:bold; font-size:1.2rem;">Детали возврата</div>
                </div>
                <div class="pd-row"><span class="pd-label">Дата:</span><span class="pd-value">${receptionDateStr}</span></div>
                <div class="pd-row"><span class="pd-label">Ячейка:</span><span class="pd-value">${item.cell || '---'}</span></div>
                <div class="pd-row"><span class="pd-label">ШК:</span><span class="pd-value" style="font-family: 'Roboto Mono', monospace;">${item.code}</span></div>
                <div class="pd-price-row">${(item.price || 0).toFixed(2)} BYN</div>
                <div class="pd-desc-block"><div class="pd-label">Описание:</div><div class="pd-desc-text">${item.name || 'Товар без описания'}</div></div>
            </div>
        </div>`;
    toggleModal('product-details-modal', true);
}


// === ЛОГИКА ВОЗВРАТА ОТ КЛИЕНТА ===

function setupCustomerReturnFlow() {
    const btn = document.getElementById('customer-return-btn');
    if (!btn) return;

    btn.addEventListener('click', () => {
        document.getElementById('cr-step1-input').value = '';
        toggleModal('cr-step1-modal', true);
        document.getElementById('cr-step1-input').focus();
    });

    // ШАГ 1: QR Код клиента
    document.getElementById('cr-step1-next-btn').addEventListener('click', () => {
        const input = document.getElementById('cr-step1-input');
        const val = input.value.trim();
        
        // ВАЛИДАЦИЯ через showAlert
        if (!/^\d{9}$/.test(val)) {
            showAlert("Ошибка: Введите корректный код (9 цифр)!", true);
            input.focus();
            return;
        }

        toggleModal('cr-step1-modal', false);
        document.getElementById('cr-step2-input').value = '';
        toggleModal('cr-step2-modal', true);
        document.getElementById('cr-step2-input').focus();
    });

    // ШАГ 2: ШК Товара
    document.getElementById('cr-step2-next-btn').addEventListener('click', () => {
        const input = document.getElementById('cr-step2-input');
        const val = input.value.trim();

        // ВАЛИДАЦИЯ через showAlert
        if (!/^\d{9}$/.test(val)) {
             showAlert("Ошибка: ШК товара должен состоять из 9 цифр!", true);
             input.focus();
             return;
        }

        simulateFindRandomHistoryItem();
    });

    document.getElementById('cr-step2-no-barcode-btn').addEventListener('click', () => {
        showNoBarcodeSelection();
    });

    document.getElementById('cr-step3-cancel-btn').addEventListener('click', () => {
        toggleModal('cr-step3-modal', false);
        crSelectedItem = null;
    });

    document.getElementById('cr-step3-add-btn').addEventListener('click', () => {
        finalizeCustomerReturn();
    });
}

function simulateFindRandomHistoryItem() {
    const userData = getUserData();
    const history = userData.issuedHistory || [];
    
    if (history.length === 0) {
        showAlert("История выдачи пуста. Невозможно найти товар.", true);
        return;
    }
    const randomEntryIndex = Math.floor(Math.random() * history.length);
    crSelectedHistoryEntry = history[randomEntryIndex];
    const randomItemIndex = Math.floor(Math.random() * crSelectedHistoryEntry.items.length);
    crSelectedItem = crSelectedHistoryEntry.items[randomItemIndex];

    toggleModal('cr-step2-modal', false);
    showStep3();
}

function showNoBarcodeSelection() {
    const userData = getUserData();
    const history = userData.issuedHistory || [];
    if (history.length === 0) {
        showAlert("История выдачи пуста.", true);
        return;
    }
    const randomEntryIndex = Math.floor(Math.random() * history.length);
    crSelectedHistoryEntry = history[randomEntryIndex];
    const list = document.getElementById('cr-select-list');
    list.innerHTML = '';

    crSelectedHistoryEntry.items.forEach((item) => {
        const div = document.createElement('div');
        div.className = 'product-card horizontal-compact';
        const imageContent = item.isAdult ? `<img src="adult.svg" style="width:100%">` : `<img src="${item.image || 'https://placehold.co/100x100'}" style="width:100%; object-fit:contain;">`;
        div.innerHTML = `
            <div class="hc-image" style="width:60px; height:60px;">${imageContent}</div>
            <div class="hc-info">
                <div class="product-code-row">${item.code}</div>
                <div class="product-name-row">${item.name}</div>
            </div>
            <button class="primary-btn icon-only-small select-return-item-btn" style="width:auto; padding:0 15px;">Добавить</button>
        `;
        div.querySelector('.select-return-item-btn').addEventListener('click', () => {
            crSelectedItem = item;
            toggleModal('cr-select-item-modal', false);
            toggleModal('cr-step2-modal', false);
            showStep3();
        });
        list.appendChild(div);
    });
    toggleModal('cr-select-item-modal', true);
}

function showStep3() {
    if (!crSelectedItem) return;
    const container = document.getElementById('cr-step3-product-card');
    const imageContent = crSelectedItem.isAdult ? `<img src="adult.svg" style="width:120px; height:120px; object-fit:contain;">` : `<img src="${crSelectedItem.image || 'https://placehold.co/200x200'}" style="width:120px; height:120px; object-fit:contain;">`;
    container.innerHTML = `
        <div style="display:flex; gap:15px; align-items:center; background: #fff; padding: 10px; border-radius: 8px; border: 1px solid #eee;">
            ${imageContent}
            <div style="text-align:left;">
                 <div style="font-family:'Roboto Mono'; color:gray; font-size:0.9rem;">${crSelectedItem.code}</div>
                 <div style="font-weight:bold; margin-top:5px;">${crSelectedItem.name}</div>
            </div>
        </div>
    `;
    toggleModal('cr-step3-modal', true);
}

function finalizeCustomerReturn() {
    if (!crSelectedItem) return;
    const userData = getUserData();
    if (!userData.returnsItems) userData.returnsItems = [];
    const newItem = {
        ...crSelectedItem,
        date: new Date().toISOString(),
        confirmed: false,
        isUnknown: false, 
        status: 'returned_by_client',
        isDefective: true // Возврат из дома автоматически с браком
    };
    userData.returnsItems.unshift(newItem);
    saveUserData(userData);
    toggleModal('cr-step3-modal', false);
    renderReturns();
    crSelectedItem = null;
    crSelectedHistoryEntry = null;
    showAlert("Товар добавлен в возврат", false);
}

// === ЛОГИКА УПАКОВКИ В КОРОБКУ ===
function startReturnProcessing(index) {
    currentReturnItemIndex = index;
    currentReturnProcessData = {}; 
    toggleModal('return-package-modal', true);
}

function handlePackageSelection(pkgType) {
    currentReturnProcessData.package = pkgType;
    toggleModal('return-package-modal', false);
    const stickerInput = document.getElementById('return-sticker-input');
    stickerInput.value = '';
    toggleModal('return-sticker-modal', true);
    stickerInput.focus();
}

function handleStickerInput() {
    const input = document.getElementById('return-sticker-input');
    const val = input.value.trim();
    if (!/^\d{9}$/.test(val)) {
        showAlert('Ошибка: Введите корректный 9-значный код стикера', true);
        input.focus();
        return;
    }
    currentReturnProcessData.sticker = val;
    toggleModal('return-sticker-modal', false);
    showBoxSelectionModal();
}

function showBoxSelectionModal() {
    const userData = getUserData();
    const boxes = userData.returnBoxes || []; 
    const openBoxes = boxes.filter(b => !b.isClosed);
    const listContainer = document.getElementById('return-box-list');
    listContainer.innerHTML = '';
    
    if (openBoxes.length === 0) {
        listContainer.innerHTML = '<p>Нет открытых коробок. Создайте коробку в разделе "Коробки".</p>';
    } else {
        openBoxes.forEach(box => {
            const div = document.createElement('div');
            div.className = 'box-select-item';
            div.innerHTML = `<span>Коробка</span> <strong>${box.id}</strong>`;
            div.onclick = () => finishReturnProcessing(box.id);
            listContainer.appendChild(div);
        });
    }
    toggleModal('return-box-modal', true);
}

function finishReturnProcessing(boxId) {
    const userData = getUserData();
    // Находим актуальный объект по индексу
    const item = userData.returnsItems[currentReturnItemIndex];
    if(!item) {
        showAlert("Ошибка: товар не найден", true);
        return;
    }
    item.newCode = currentReturnProcessData.sticker;
    item.safePackage = currentReturnProcessData.package;
    item.confirmed = true;
    item.placedInBoxId = boxId;
    
    if (!userData.returnBoxes) userData.returnBoxes = [];
    const boxIndex = userData.returnBoxes.findIndex(b => b.id === boxId);
    if (boxIndex > -1) {
        if (!userData.returnBoxes[boxIndex].items) userData.returnBoxes[boxIndex].items = [];
        userData.returnBoxes[boxIndex].items.unshift(item);
    }
    
    saveUserData(userData);
    toggleModal('return-box-modal', false);
    
    const s = document.getElementById('scanner-sound'); 
    if (s) { s.currentTime = 0; s.play().catch(e=>{}); }
    
    renderReturns(); 
    showAlert(`Товар упакован в коробку ${boxId}`, false);
}

function injectReturnModals() {
    if (document.getElementById('return-package-modal')) return;
    const html = `
        <div class="fullscreen-modal" id="return-package-modal">
            <div class="modal-content">
                <button class="close-modal-btn" onclick="toggleModal('return-package-modal', false)">&times;</button>
                <h3>Выберите сейф-пакет</h3>
                <div class="modal-buttons-container">
                    <button class="secondary-btn" onclick="handlePackageSelection('small')">Маленький</button>
                    <button class="secondary-btn" onclick="handlePackageSelection('medium')">Средний</button>
                    <button class="secondary-btn" onclick="handlePackageSelection('large')">Большой</button>
                    <button class="secondary-btn" onclick="handlePackageSelection('none')">Без пакета</button>
                </div>
            </div>
        </div>
        <div class="fullscreen-modal" id="return-sticker-modal">
            <div class="modal-content">
                <button class="close-modal-btn" onclick="toggleModal('return-sticker-modal', false)">&times;</button>
                <h3>Сканируйте новый стикер</h3>
                <div class="input-group">
                    <input type="text" id="return-sticker-input" placeholder="9 цифр..." maxlength="9" inputmode="numeric">
                </div>
                <button id="return-sticker-confirm-btn" class="primary-btn full-width-btn" onclick="handleStickerInput()">Далее</button>
            </div>
        </div>
        <div class="fullscreen-modal" id="return-box-modal">
            <div class="modal-content">
                <button class="close-modal-btn" onclick="toggleModal('return-box-modal', false)">&times;</button>
                <h3>Выберите коробку</h3>
                <div id="return-box-list" class="box-list-selection"></div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}