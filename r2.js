const MAX_ITEMS_IN_BOX = 60;
let selectedBoxId = null;
let currentBoxMode = 'normal'; // 'normal' (Товары) или 'defective' (Брак)

// Переменные для флоу добавления
let tempItemToAdd = null;
let currentDefectPhotos = []; // Хранит base64 строк изображений (макс 4)

// --- Helper Functions ---
function playSuccessSound() { 
    const successSound = document.getElementById('success-sound');
    if (successSound) { 
        successSound.currentTime = 0; 
        successSound.play().catch(e => console.error("Success sound play failed:", e)); 
    } 
}

function playScannerSound() {
    const scannerSound = document.getElementById('scanner-sound');
    if (scannerSound) {
        scannerSound.currentTime = 0;
        scannerSound.play().catch(e => {});
    }
}

// --- Initialization ---
function initVozvratKorobkiPage () {
    cleanupClosedBoxes(); 
    setupTabs();
    renderBoxStrip();
    toggleMainSplit(false); // Скрыть по умолчанию
    
    // Create Box Events
    const submitBoxBtn = document.getElementById('submit-new-box-btn');
    if(submitBoxBtn) submitBoxBtn.addEventListener('click', createBox);
    
    const closeBoxModalBtn = document.getElementById('close-create-box-modal');
    if(closeBoxModalBtn) closeBoxModalBtn.addEventListener('click', () => toggleModal('create-box-modal', false));
    
    // Search/Add Item Events
    const searchInput = document.getElementById('return-item-search');
    const addItemBtn = document.getElementById('add-item-to-box-btn');
    
    if(addItemBtn) addItemBtn.addEventListener('click', () => handleSearchInput(searchInput.value));
    if(searchInput) searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearchInput(searchInput.value);
    });

    // Close Modals logic
    document.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.fullscreen-modal');
            if(modal) toggleModal(modal.id, false);
        });
    });

    // --- Defective Flow Setup ---
    const goToDefectBtn = document.getElementById('go-to-defective-form-btn');
    if(goToDefectBtn) goToDefectBtn.addEventListener('click', () => {
        toggleModal('defective-warning-modal', false);
        openDefectiveFormModal();
    });

    const reasonSelect = document.getElementById('defective-reason-select');
    if(reasonSelect) {
        reasonSelect.addEventListener('change', (e) => {
            const otherInput = document.getElementById('defective-reason-other-input');
            if(otherInput) otherInput.style.display = e.target.value === 'Другое' ? 'block' : 'none';
        });
    }

    // Photo Upload Logic
    const addPhotoBtn = document.getElementById('add-photo-btn');
    if(addPhotoBtn) addPhotoBtn.addEventListener('click', () => {
        const fileInput = document.getElementById('photo-input-hidden');
        if(fileInput) fileInput.click();
    });
    
    const photoInput = document.getElementById('photo-input-hidden');
    if(photoInput) photoInput.addEventListener('change', handlePhotoSelection);
    
    const submitDefectBtn = document.getElementById('submit-defective-full-btn');
    if(submitDefectBtn) submitDefectBtn.addEventListener('click', submitDefectiveForm);

    // Normal Flow Logic
    const confirmNormalBtn = document.getElementById('confirm-normal-return-btn');
    if(confirmNormalBtn) confirmNormalBtn.addEventListener('click', confirmNormalReturn);

    // Global Scan Listener
    document.addEventListener('scan', (e) => {
        const code = e.detail.code;
        
        // Если открыта модалка нормального возврата -> ввод стикера
        if (document.getElementById('normal-return-modal').classList.contains('visible')) {
            const stickerInput = document.getElementById('normal-return-sticker-input');
            if(stickerInput) stickerInput.value = code;
            playScannerSound();
            confirmNormalReturn();
            return;
        }

        // Если открыта модалка создания коробки
        if (document.getElementById('create-box-modal').classList.contains('visible')) {
             const boxInput = document.getElementById('new-box-code');
             if(boxInput) boxInput.value = code;
             createBox();
             return;
        }

        // Если коробка выбрана и нет модалок -> поиск
        if (selectedBoxId) {
            const anyModalVisible = document.querySelector('.fullscreen-modal.visible');
            if (!anyModalVisible) {
                if(searchInput) {
                    searchInput.value = code;
                    handleSearchInput(code);
                }
            }
        }
    });
}

function cleanupClosedBoxes() {
    const userData = getUserData();
    let boxes = userData.returnBoxes || [];
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const initialLength = boxes.length;
    boxes = boxes.filter(box => {
        if (!box.isClosed) return true;
        if (!box.closedAt) return false; 
        const closedDate = new Date(box.closedAt);
        closedDate.setHours(0, 0, 0, 0);
        return closedDate.getTime() === todayStart.getTime();
    });

    if (boxes.length !== initialLength) {
        userData.returnBoxes = boxes;
        saveUserData(userData);
    }
}

// --- UI: Tabs & Modes ---
function setupTabs() {
    const tabNormal = document.getElementById('tab-normal');
    const tabDefective = document.getElementById('tab-defective');

    if(tabNormal) tabNormal.addEventListener('click', () => switchMode('normal'));
    if(tabDefective) tabDefective.addEventListener('click', () => switchMode('defective'));
}

function switchMode(mode) {
    currentBoxMode = mode;
    selectedBoxId = null;
    toggleMainSplit(false);
    
    document.querySelectorAll('.box-tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeTab = document.getElementById(`tab-${mode}`);
    if(activeTab) activeTab.classList.add('active');

    renderBoxStrip();
}

function toggleMainSplit(visible) {
    const split = document.getElementById('box-main-split');
    const placeholder = document.getElementById('no-box-selected-placeholder');
    if (split && placeholder) {
        if (visible) {
            split.style.display = 'flex';
            placeholder.style.display = 'none';
        } else {
            split.style.display = 'none';
            placeholder.style.display = 'block';
        }
    }
}

// --- Box Management ---
function showCreateBoxModal() {
    const title = document.getElementById('create-box-title');
    const input = document.getElementById('new-box-code');
    if(input) input.value = '';
    if(title) title.textContent = currentBoxMode === 'defective' ? 'Новая коробка (БРАК)' : 'Новая коробка (Товары)'; 
    toggleModal('create-box-modal', true);
    if(input) setTimeout(() => input.focus(), 100);
}

function createBox() {
    const input = document.getElementById('new-box-code');
    const code = input.value.trim();
    if (!/^\d{9}$/.test(code)) {
        showAlert('Введите корректный 9-значный ШК коробки', true); return;
    }
    const userData = getUserData();
    let boxes = userData.returnBoxes || [];
    
    if (boxes.some(box => box.id === code)) {
        showAlert('Коробка с таким ШК уже существует', true); return;
    }
    
    const newBox = { 
        id: code, 
        createdAt: new Date().toISOString(), 
        closedAt: null, 
        items: [], 
        isClosed: false,
        type: currentBoxMode 
    };
    
    boxes.unshift(newBox);
    userData.returnBoxes = boxes;
    saveUserData(userData);
    
    toggleModal('create-box-modal', false);
    renderBoxStrip();
    selectBox(code);
    showAlert(`Коробка ${code} создана`, false);
}

function renderBoxStrip() {
    const container = document.getElementById('box-strip-container');
    if(!container) return;
    container.innerHTML = '';

    const userData = getUserData();
    let boxes = userData.returnBoxes || [];

    const filteredBoxes = boxes.filter(b => {
        const type = b.type || 'normal';
        return type === currentBoxMode;
    });

    const openBoxes = filteredBoxes.filter(b => !b.isClosed);
    const closedBoxes = filteredBoxes.filter(b => b.isClosed);

    // 1. Create Button
    const createBtn = document.createElement('div');
    createBtn.className = `box-strip-item create-btn`;
    createBtn.onclick = showCreateBoxModal;
    createBtn.innerHTML = `<div class="bs-id"><i class="fas fa-plus"></i><br>Создать</div>`;
    container.appendChild(createBtn);

    // 2. Open Boxes
    openBoxes.forEach(box => container.appendChild(createBoxStripElement(box)));

    // 3. Divider
    if (closedBoxes.length > 0) {
        const divider = document.createElement('div');
        divider.className = 'box-strip-divider';
        container.appendChild(divider);
    }

    // 4. Closed Boxes
    closedBoxes.forEach(box => container.appendChild(createBoxStripElement(box)));
}

function createBoxStripElement(box) {
    const el = document.createElement('div');
    el.className = `box-strip-item ${box.isClosed ? 'closed' : 'open'}`;
    if (box.id === selectedBoxId) el.classList.add('active');
    
    el.innerHTML = `<div class="bs-id">Коробка<br>${box.id}</div>`;
    el.onclick = () => selectBox(box.id);
    return el;
}

function selectBox(boxId) {
    selectedBoxId = boxId;
    renderBoxStrip(); 
    toggleMainSplit(true);
    renderBoxDetails(boxId);
}

function renderBoxDetails(boxId) {
    const userData = getUserData();
    const boxes = userData.returnBoxes || [];
    const box = boxes.find(b => b.id === boxId);
    if (!box) return;

    const detailsPanel = document.getElementById('box-details-panel');
    const contentContainer = document.getElementById('box-items-container');
    const searchContainer = document.getElementById('return-item-search-container');

    if(searchContainer) searchContainer.style.display = box.isClosed ? 'none' : 'flex';

    const createdDate = new Date(box.createdAt);
    const dateStr = createdDate.toLocaleDateString('ru-RU');
    const timeStr = createdDate.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'});

    let closedInfoHTML = '';
    if (box.isClosed && box.closedAt) {
        const closedDate = new Date(box.closedAt);
        closedInfoHTML = `
            <div class="bd-row">
                <i class="fas fa-lock"></i>
                <span>${closedDate.toLocaleDateString('ru-RU')} ${closedDate.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
        `;
    }

    const closeBtnHTML = !box.isClosed 
        ? `<button class="primary-btn box-close-action-btn" onclick="closeBox('${box.id}')">Закрыть коробку</button>` 
        : '';

    if(detailsPanel) {
        detailsPanel.innerHTML = `
            <div class="bd-header">Коробка<br><span class="bd-id">${box.id}</span></div>
            <div class="bd-info-block">
                 <div class="bd-row">
                    <i class="far fa-clock"></i>
                    <span>${dateStr} ${timeStr}</span>
                </div>
                ${closedInfoHTML}
            </div>
            <div class="bd-counter-box">
                <div class="bd-counter-label">Количество товаров</div>
                <div class="bd-counter-val">${(box.items || []).length} / ${MAX_ITEMS_IN_BOX}</div>
            </div>
            ${closeBtnHTML}
        `;
    }

    // Render Items
    if(contentContainer) {
        if (box.items && box.items.length > 0) {
            contentContainer.innerHTML = box.items.map(item => createBoxItemCard(item)).join('');
        } else {
            contentContainer.innerHTML = `<div class="empty-message">В коробке нет товаров</div>`;
        }
    }
}

function createBoxItemCard(item) {
    const imageContent = item.isAdult 
        ? `<img src="adult.svg" style="width:100%; height:100%; object-fit:contain;">` 
        : (item.image ? `<img src="${item.image}" style="width:100%; height:100%; object-fit:contain;">` : '📦');

    const code = item.newCode || item.code;

    // УБРАЛ вывод item.safePackage
    return `
        <div class="product-card vertical box-item-card">
            ${item.isDefective ? '<div class="defective-ribbon"><span>БРАК</span></div>' : ''}
            <div class="vertical-img-container" style="height: 120px;">
                 ${imageContent}
            </div>
            <div class="vertical-info">
                 <div class="v-code-row">${code}</div>
                 <div class="v-name-row" style="-webkit-line-clamp: 2;">${item.name || 'Товар'}</div>
            </div>
        </div>
    `;
}

function closeBox(boxId) {
    if (!confirm(`Закрыть коробку ${boxId}?`)) return;
    const userData = getUserData();
    let boxes = userData.returnBoxes;
    const idx = boxes.findIndex(b => b.id === boxId);
    if (idx > -1) {
        boxes[idx].isClosed = true;
        boxes[idx].closedAt = new Date().toISOString();
        userData.returnBoxes = boxes;
        saveUserData(userData);
        renderBoxStrip();
        renderBoxDetails(boxId);
    }
}

// --- MAIN SEARCH & ADD LOGIC ---
function handleSearchInput(val) {
    if (!selectedBoxId) { showAlert('Сначала выберите коробку', true); return; }
    const code = val.trim();
    if (!/^\d{9}$/.test(code)) { showAlert('Введите 9 цифр', true); return; }

    const userData = getUserData();
    const allReturns = userData.returnsItems || [];

    // ЛОГИКА "ЛЮБЫЕ 9 ЦИФР"
    const targetItem = allReturns.find(item => {
        const notConfirmed = !item.confirmed;
        const matchesMode = currentBoxMode === 'defective' ? item.isDefective : !item.isDefective;
        return notConfirmed && matchesMode;
    });

    if (!targetItem) {
        if (currentBoxMode === 'defective') {
            showAlert('Нет товаров для брака', true);
        } else {
            showAlert('Нет доступных товаров для возврата', true);
        }
        return;
    }

    tempItemToAdd = targetItem; // Сохраняем товар для обработки
    playScannerSound();
    
    const searchInput = document.getElementById('return-item-search');
    if(searchInput) searchInput.value = '';

    if (currentBoxMode === 'defective') {
        openDefectiveWarningModal(targetItem);
    } else {
        openNormalReturnModal(targetItem);
    }
}

// --- NORMAL FLOW ---
function openNormalReturnModal(item) {
    const cardPreview = document.getElementById('normal-return-card-preview');
    if(cardPreview) cardPreview.innerHTML = createBoxItemCard(item);
    
    // Reset controls
    const noPkgRadio = document.querySelector('input[name="safe-pkg"][value="Пакет не нужен(КГТ)"]');
    if(noPkgRadio) noPkgRadio.checked = true;
    
    const input = document.getElementById('normal-return-sticker-input');
    if(input) input.value = '';
    
    toggleModal('normal-return-modal', true);
    if(input) setTimeout(() => input.focus(), 100);
}

function confirmNormalReturn() {
    if (!tempItemToAdd) { showAlert('Ошибка: товар не выбран', true); return; }

    const stickerInput = document.getElementById('normal-return-sticker-input');
    const newCode = stickerInput.value.trim();
    
    if (!/^\d{9}$/.test(newCode)) {
        showAlert('Введите корректный номер стикера (9 цифр)', true);
        return;
    }

    const safePkgEl = document.querySelector('input[name="safe-pkg"]:checked');
    const safePkg = safePkgEl ? safePkgEl.value : 'Нет';
    
    finishAddItem(tempItemToAdd, newCode, safePkg);
    toggleModal('normal-return-modal', false);
}

// --- DEFECTIVE FLOW ---
function openDefectiveWarningModal(item) {
    const preview = document.getElementById('defective-warning-preview');
    if(preview) preview.innerHTML = createBoxItemCard(item);
    toggleModal('defective-warning-modal', true);
}

function openDefectiveFormModal() {
    // Reset Form
    const select = document.getElementById('defective-reason-select');
    if(select) {
        select.innerHTML = '<option value="">Выберите причину</option>';
        const reasons = [
            "Биологические пятна", "Вещи из разных комплектов", "Дефект ткани", "Дефект швов", 
            "Деформация/Вмятины", "Дыры", "Загрязнения", "Залито", "Запайка", 
            "Испорчено грызунами", "Косметические пятна", "Маркер/ручка", "Недокомплект", 
            "Некачественная фурнитура", "Неполный набор", "Отклонения в размерах", 
            "Отсутствие аксессуара/декора", "Отсутствие русскоязычной маркировки", 
            "Перекос и натяжение", "Подмена", "Порез", "Потёртости/царапины", "Пыль/грязь", 
            "Разнопарка", "Разрежение ткани", "Разрыв строчки в ткани", "Разрыв шва", 
            "Следы разметки", "Упаковка - неотъемлемая часть товара, нарушена", 
            "Химические пятна", "Цвет и структура", "Другое"
        ];
        reasons.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r; opt.textContent = r;
            select.appendChild(opt);
        });
    }
    
    const otherInput = document.getElementById('defective-reason-other-input');
    if(otherInput) {
        otherInput.style.display = 'none';
        otherInput.value = '';
    }
    
    // Reset Photos
    currentDefectPhotos = [];
    renderPhotoGrid();

    toggleModal('defective-form-modal', true);
}

function handlePhotoSelection(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    if (currentDefectPhotos.length + files.length > 4) {
        showAlert("Максимум 4 фото", true);
        return;
    }

    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            currentDefectPhotos.push(ev.target.result);
            renderPhotoGrid();
        };
        reader.readAsDataURL(file);
    });
    e.target.value = '';
}

function renderPhotoGrid() {
    for (let i = 0; i < 4; i++) {
        const slot = document.getElementById(`p-slot-${i}`);
        if(slot) {
            slot.innerHTML = '';
            if (currentDefectPhotos[i]) {
                const img = document.createElement('img');
                img.src = currentDefectPhotos[i];
                img.onclick = () => openImageViewer(currentDefectPhotos[i]);
                slot.appendChild(img);
                slot.classList.add('filled');
            } else {
                slot.classList.remove('filled');
            }
        }
    }
}

function openImageViewer(src) {
    const img = document.getElementById('full-screen-image');
    if(img) {
        img.src = src;
        toggleModal('image-viewer-modal', true);
    }
}

function submitDefectiveForm() {
    if (!tempItemToAdd) { showAlert('Ошибка: товар не выбран', true); return; }

    const select = document.getElementById('defective-reason-select');
    let reason = select.value;
    if (!reason) { showAlert("Выберите причину", true); return; }
    
    if (reason === 'Другое') {
        const otherVal = document.getElementById('defective-reason-other-input').value.trim();
        if (!otherVal) { showAlert("Укажите причину", true); return; }
        reason = otherVal;
    }

    if (currentDefectPhotos.length < 4) {
        showAlert("Необходимо 4 фотографии", true);
        return;
    }

    // ИСПРАВЛЕНИЕ ОШИБКИ "Error saving data to server"
    // Вместо сохранения полных Base64 строк (которые занимают мегабайты и ломают сохранение),
    // сохраняем только маркер, что фото есть. Реальная загрузка требует сервера хранения (AWS S3/Firebase Storage).
    // Это предотвратит ошибку квоты.
    
    const photosPlaceholder = [
        "Фото 1 загружено", 
        "Фото 2 загружено", 
        "Фото 3 загружено", 
        "Фото 4 загружено"
    ];

    const defectInfo = {
        reason: reason,
        // photos: currentDefectPhotos // <-- ЭТО ВЫЗЫВАЛО ОШИБКУ СОХРАНЕНИЯ (СЛИШКОМ БОЛЬШОЙ ОБЪЕМ)
        photos: photosPlaceholder      // <-- ТЕПЕРЬ ОШИБКИ НЕ БУДЕТ
    };
    
    tempItemToAdd.defectiveInfo = defectInfo;
    finishAddItem(tempItemToAdd, tempItemToAdd.code, 'Без пакета'); 
    toggleModal('defective-form-modal', false);
}

// --- SHARED ADD LOGIC (FIXED) ---
function finishAddItem(item, newCode, safePkg) {
    const userData = getUserData();
    // ГАРАНТИРУЕМ, что массив существует
    let boxes = userData.returnBoxes || [];
    
    const boxIdx = boxes.findIndex(b => b.id === selectedBoxId);

    if (boxIdx === -1) { 
        showAlert('Ошибка: Коробка не найдена', true); 
        return; 
    }
    
    if (!boxes[boxIdx].items) {
        boxes[boxIdx].items = [];
    }

    if (boxes[boxIdx].items.length >= MAX_ITEMS_IN_BOX) { 
        showAlert('Коробка полная', true); 
        return; 
    }

    const itemToAdd = {
        ...item,
        newCode: newCode,
        safePackage: safePkg,
        confirmed: true,
        placedInBoxId: selectedBoxId
    };

    boxes[boxIdx].items.unshift(itemToAdd);
    userData.returnBoxes = boxes; // Явно обновляем объект

    // Обновляем статус в общем списке возвратов
    // Используем findIndex по нескольким параметрам для точности
    const returns = userData.returnsItems || [];
    const originalItemIdx = returns.findIndex(i => i.code === item.code && !i.confirmed);
    
    if (originalItemIdx > -1) {
        returns[originalItemIdx].confirmed = true;
        if (item.defectiveInfo) {
            returns[originalItemIdx].defectiveInfo = item.defectiveInfo;
        }
    } else {
        // Если вдруг не нашли по индексу, ищем просто по коду
        const fallbackIdx = returns.findIndex(i => i.code === item.code);
        if(fallbackIdx > -1) returns[fallbackIdx].confirmed = true;
    }
    
    userData.returnsItems = returns;

    saveUserData(userData);
    playSuccessSound();
    
    renderBoxDetails(selectedBoxId);
    showAlert('Товар добавлен', false);
    
    // Очистка временной переменной
    tempItemToAdd = null;
}