const MAX_CARDBOARD_UNITS = 16;          // максимум картона в одной коробке (можно поменять)
const BOX_CODE_RE = /^TRBX\d{10}$/;     // коробка: TRBX + 10 цифр
const BOX_CODE_MAX = 14;                // длина стикера: 4 буквы + 10 цифр
let selectedCardboardBoxId = null;
let qtyModalBoxId = null;               // коробка, для которой открыта модалка количества
let r3EventsBound = false;              // слушатели вешаем один раз (init может вызываться дважды)
let lastCreatedBoxCode = null;          // чтобы повторный скан только что созданной коробки ничего не делал

// --- Helper Functions ---
function playSingleSound(id) {
    const audio = document.getElementById(id);
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.error("Sound play failed:", e));
    }
}

// Последовательно: сначала failScan, потом голосовой маркер
function playTwoSounds(firstId, secondId) {
    const first = document.getElementById(firstId);
    const second = document.getElementById(secondId);
    if (first && second) {
        first.currentTime = 0;
        first.play().catch(e => console.error("First sound play failed:", e));
        first.onended = () => {
            second.currentTime = 0;
            second.play().catch(e => console.error("Second sound play failed:", e));
            first.onended = null;
        };
    } else if (second) {
        playSingleSound(secondId);
    }
}

// Только латиница и цифры, верхний регистр, максимум 14 символов (TRBX + 10 цифр)
function sanitizeBoxCode(v) {
    return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, BOX_CODE_MAX);
}

// «TRBX1234567890» -> «TRBX» серым + «1234567890» чёрным (для ленты). Старые коды без TRBX — как есть.
function formatBoxCodeHTML(code) {
    const c = String(code || '');
    if (/^TRBX\d+$/.test(c)) {
        return `<span style="color:#b5b5b5;">${c.slice(0, 4)}</span> ${c.slice(4)}`;
    }
    return c;
}

function copyBoxId(id) {
    navigator.clipboard.writeText(id).then(() => {
        showAlert('ШК скопирован', false);
    }).catch(err => {
        console.error('Не удалось скопировать текст: ', err);
    });
}

// Дата закрытия: ДД.ММ.ГГГГ в ЧЧ:ММ
function formatClosedAt(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} в ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// --- Initialization ---
function initVozvratKartonPage() {
    // Имитация загрузки (как на странице коробок)
    setTimeout(() => {
        const loader = document.getElementById('data-loader');
        if (loader) loader.style.display = 'none';
    }, 2000);

    cleanupClosedCardboardBoxes();
    renderCardboardStrip();

    const box = selectedCardboardBoxId ? findCardboardBox(selectedCardboardBoxId) : null;
    if (box) {
        toggleMainSplit(true);
        renderCardboardDetails(box.id);
    } else {
        selectedCardboardBoxId = null;
        toggleMainSplit(false);
    }

    // init вызывается и из window.onload, и из p_shared.js (после загрузки данных):
    // рендер повторяем, а слушатели вешаем только один раз
    if (r3EventsBound) return;
    r3EventsBound = true;
    setupMobileMenu();

    // --- Модалка сканирования стикера коробки ---
    const submitBtn = document.getElementById('submit-new-cardboard-box-btn');
    if (submitBtn) submitBtn.addEventListener('click', createCardboardBox);

    const boxInput = document.getElementById('new-cardboard-box-code');
    if (boxInput) {
        boxInput.addEventListener('input', () => { boxInput.value = sanitizeBoxCode(boxInput.value); });
        boxInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') createCardboardBox();
        });
    }

    const closeCreateBtn = document.getElementById('close-create-cardboard-box-modal');
    if (closeCreateBtn) closeCreateBtn.addEventListener('click', () => toggleModal('create-cardboard-box-modal', false));

    // --- Модалка количества картона ---
    const qtyInput = document.getElementById('cardboard-qty-input');
    if (qtyInput) {
        qtyInput.addEventListener('input', () => { qtyInput.value = qtyInput.value.replace(/\D/g, '').slice(0, 2); });
        qtyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') submitCloseCardboardBox();
        });
    }

    const qtyCloseBtn = document.getElementById('cardboard-qty-close-btn');
    if (qtyCloseBtn) qtyCloseBtn.addEventListener('click', submitCloseCardboardBox);

    // Закрытие модалки крестиком: коробка остаётся открытой
    const closeQtyBtn = document.getElementById('close-cardboard-qty-modal');
    if (closeQtyBtn) closeQtyBtn.addEventListener('click', () => {
        toggleModal('cardboard-qty-modal', false);
        qtyModalBoxId = null;
    });

    // --- Сканер ---
    document.addEventListener('scan', (e) => {
        const code = String(e.detail.code).trim();

        // Открыта модалка количества — скан сюда не относится
        const qtyModal = document.getElementById('cardboard-qty-modal');
        if (qtyModal && qtyModal.classList.contains('visible')) return;

        // Открыта модалка создания коробки
        const createModal = document.getElementById('create-cardboard-box-modal');
        if (createModal && createModal.classList.contains('visible')) {
            const nBoxInput = document.getElementById('new-cardboard-box-code');
            // если поле в фокусе, код уже введён и отправлен по Enter — второй раз не создаём
            if (nBoxInput && document.activeElement === nBoxInput && code.length <= nBoxInput.maxLength) return;
            if (nBoxInput) nBoxInput.value = code.toUpperCase();
            createCardboardBox();
            return;
        }

        // Повторный скан только что созданной коробки — игнорируем
        if (code.toUpperCase() === lastCreatedBoxCode) return;
    });
}

// Страницы r3.html и r4.html в p_shared.js вызывают initVozvratUtilPage —
// без этого алиаса страница картона вообще не инициализировалась
function initVozvratUtilPage() {
    initVozvratKartonPage();
}

// Нижнее меню «Еще» (телефон)
function setupMobileMenu() {
    const moreBtn = document.getElementById('mobile-more-btn');
    const moreMenu = document.getElementById('mobile-more-menu-content');
    if (moreBtn && moreMenu) {
        moreBtn.addEventListener('click', (e) => { e.stopPropagation(); moreMenu.classList.toggle('visible'); });
        document.addEventListener('click', (e) => {
            if (!moreBtn.contains(e.target) && !moreMenu.contains(e.target)) moreMenu.classList.remove('visible');
        });
    }
    const exitBtn = document.getElementById('mobile-exit-btn');
    if (exitBtn) exitBtn.addEventListener('click', () => {
        if (typeof performFullLogout === 'function') performFullLogout();
        else if (window.firebase && firebase.auth) firebase.auth().signOut();
    });
}

// --- Data helpers ---
function findCardboardBox(boxId) {
    const boxes = getUserData().cardboardBoxes || [];
    return boxes.find(b => b.id === boxId) || null;
}

// Закрытые коробки хранятся только за сегодня (как в коробках)
function cleanupClosedCardboardBoxes() {
    const userData = getUserData();
    let boxes = userData.cardboardBoxes || [];
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
        userData.cardboardBoxes = boxes;
        saveUserData(userData);
    }
}

function toggleMainSplit(visible) {
    const split = document.getElementById('cardboard-main-split');
    const placeholder = document.getElementById('no-cardboard-selected-placeholder');
    if (split && placeholder) {
        split.style.display = visible ? 'flex' : 'none';
        placeholder.style.display = visible ? 'none' : 'flex';
    }
}

// --- Создание коробки ---
function showCreateCardboardBoxModal() {
    const input = document.getElementById('new-cardboard-box-code');
    if (input) input.value = '';

    toggleModal('create-cardboard-box-modal', true);
    playSingleSound('sound-scan-box');

    if (input) setTimeout(() => input.focus(), 100);
}

function createCardboardBox() {
    const input = document.getElementById('new-cardboard-box-code');
    if (!input) return;
    const code = input.value.trim().toUpperCase();

    // Коробка: TRBX и 10 цифр (например, TRBX1234567890)
    if (!BOX_CODE_RE.test(code)) {
        playTwoSounds('sound-fail', 'sound-incorrect-sticker');
        showAlert('Некорректный стикер. Формат: TRBX и 10 цифр', true, true);
        return;
    }

    const userData = getUserData();
    const boxes = userData.cardboardBoxes || [];
    const returnBoxes = userData.returnBoxes || [];

    if (boxes.some(box => box.id === code) || returnBoxes.some(box => box.id === code)) {
        playTwoSounds('sound-fail', 'sound-box-exists');
        showAlert('Коробка уже принята', true, true);
        return;
    }

    boxes.unshift({
        id: code,
        createdAt: new Date().toISOString(),
        closedAt: null,
        quantity: 0,
        isClosed: false
    });
    userData.cardboardBoxes = boxes;
    saveUserData(userData);

    lastCreatedBoxCode = code;
    setTimeout(() => { if (lastCreatedBoxCode === code) lastCreatedBoxCode = null; }, 3000);

    toggleModal('create-cardboard-box-modal', false);
    selectCardboardBox(code);

    // Сразу просим ввести количество картона
    openCardboardQtyModal(code);
}

// --- Модалка количества и закрытие коробки ---
function openCardboardQtyModal(boxId) {
    const box = findCardboardBox(boxId);
    if (!box || box.isClosed) return;

    qtyModalBoxId = boxId;

    const title = document.getElementById('cardboard-qty-box-title');
    if (title) title.textContent = box.id;

    const input = document.getElementById('cardboard-qty-input');
    if (input) input.value = box.quantity > 0 ? String(box.quantity) : '';

    toggleModal('cardboard-qty-modal', true);
    if (input) setTimeout(() => input.focus(), 100);
}

function submitCloseCardboardBox() {
    const boxId = qtyModalBoxId;
    if (!boxId) return;

    const input = document.getElementById('cardboard-qty-input');
    const raw = input ? input.value.trim() : '';
    const quantity = /^\d{1,2}$/.test(raw) ? parseInt(raw, 10) : NaN;

    if (isNaN(quantity) || quantity < 1 || quantity > MAX_CARDBOARD_UNITS) {
        showAlert(`Введите количество картона от 1 до ${MAX_CARDBOARD_UNITS}`, true);
        return;
    }

    const userData = getUserData();
    const boxes = userData.cardboardBoxes || [];
    const idx = boxes.findIndex(b => b.id === boxId);
    if (idx === -1) {
        showAlert('Коробка не найдена', true);
        return;
    }
    if (boxes[idx].isClosed) return;

    boxes[idx].quantity = quantity;
    boxes[idx].isClosed = true;
    boxes[idx].closedAt = new Date().toISOString();
    userData.cardboardBoxes = boxes;
    saveUserData(userData);

    playSingleSound('sound-box-closed');

    toggleModal('cardboard-qty-modal', false);
    qtyModalBoxId = null;

    selectCardboardBox(boxId);
}

// --- Лента коробок сверху ---
function renderCardboardStrip() {
    const container = document.getElementById('cardboard-strip-container');
    if (!container) return;
    container.innerHTML = '';

    const boxes = getUserData().cardboardBoxes || [];
    const openBoxes = boxes.filter(b => !b.isClosed);
    const closedBoxes = boxes.filter(b => b.isClosed);

    // 1. Кнопка «Создать»
    const createBtn = document.createElement('div');
    createBtn.className = 'box-strip-item-new create-btn';
    createBtn.onclick = showCreateCardboardBoxModal;
    createBtn.innerHTML = `
        <i class="fas fa-plus" style="font-size: 24px; color: #000;"></i>
        <div style="margin-top: 8px; font-weight: bold; color: #000; font-size: 1.1em;">Создать</div>
    `;
    container.appendChild(createBtn);

    // 2. Открытые, затем закрытые
    openBoxes.forEach(box => container.appendChild(createCardboardStripElement(box)));
    closedBoxes.forEach(box => container.appendChild(createCardboardStripElement(box)));
}

function createCardboardStripElement(box) {
    const el = document.createElement('div');
    el.className = `box-strip-item-new ${box.isClosed ? 'closed' : 'open'}`;

    if (box.id === selectedCardboardBoxId) {
        el.style.boxShadow = '0 0 0 4px rgba(168, 85, 247, 0.4)';
    }

    el.innerHTML = `
        <div style="text-align: left; margin-right: 25px;">
            <div style="font-size: 0.9em; font-weight: 500; margin-bottom: 4px; color: #000;">Коробка</div>
            <div style="font-weight: bold; font-size: 1.2em; color: #000; white-space: nowrap;">${formatBoxCodeHTML(box.id)}</div>
        </div>
    `;

    const copyImg = document.createElement('img');
    copyImg.src = 'copy.svg';
    copyImg.className = 'copy-btn-svg';
    copyImg.title = 'Скопировать ШК';
    copyImg.onclick = (e) => { e.stopPropagation(); copyBoxId(box.id); };
    el.appendChild(copyImg);

    el.onclick = () => selectCardboardBox(box.id);
    return el;
}

// Выбор коробки
function selectCardboardBox(boxId) {
    selectedCardboardBoxId = boxId;
    renderCardboardStrip();
    toggleMainSplit(true);
    renderCardboardDetails(boxId);
}

// --- Левая панель + правая часть ---
function renderCardboardDetails(boxId) {
    const box = findCardboardBox(boxId);
    if (!box) return;

    const detailsPanel = document.getElementById('cardboard-details-panel');
    const rightPanel = document.getElementById('cardboard-right-panel');

    const iconSrc = box.isClosed ? 'box.svg' : 'open-box.svg';
    const dateHTML = box.isClosed
        ? `<div class="bd-close-date">${formatClosedAt(box.closedAt)}</div>`
        : `<div class="bd-close-date muted">Коробка открыта</div>`;
    const closeBtnHTML = box.isClosed
        ? ''
        : `<button class="primary-btn cb-panel-btn" id="cardboard-panel-close-btn">Закрыть коробку</button>`;

    if (detailsPanel) {
        detailsPanel.innerHTML = `
            <div class="bd-top-right">
                <div class="bd-small-label">Коробка</div>
                <div class="bd-large-id" style="${/^TRBX\d+$/.test(box.id) ? 'font-size: 1.3em; white-space: nowrap;' : ''}">${formatBoxCodeHTML(box.id)}</div>
            </div>

            <div class="bd-divider"></div>

            <div class="bd-icons">
                <img src="${iconSrc}" style="width: 28px; height: 28px;" alt="статус">
            </div>
            ${dateHTML}

            <div class="bd-occupancy-banner">
                <div style="color: #666; font-size: 0.9em; margin-bottom: 5px;">Количество товаров</div>
                <div class="bd-occupancy-val">0</div>
            </div>

            <div style="flex-grow: 1;"></div>

            ${closeBtnHTML}
        `;

        const panelCloseBtn = document.getElementById('cardboard-panel-close-btn');
        if (panelCloseBtn) panelCloseBtn.addEventListener('click', () => openCardboardQtyModal(box.id));
    }

    if (rightPanel) {
        const qtyText = box.isClosed ? box.quantity : '—';
        rightPanel.innerHTML = `
            <div class="cb-right-card">
                <img src="cardboard_box.png" alt="Картон" class="cb-right-img">
                <div class="cb-qty-line">${qtyText}<span class="cb-unit">шт</span></div>
                <div class="cb-qty-label">Картон</div>
                ${box.isClosed ? '' : '<div class="cb-qty-hint">Количество указывается при закрытии коробки</div>'}
            </div>
        `;
    }
}

// Вызов инициализации при загрузке (как в r2.js)
window.onload = function () {
    initVozvratKartonPage();
};
