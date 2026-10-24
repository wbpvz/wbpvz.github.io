/* ====== Раздел «Удалить из ПО» ====== */

const DSP_SCAN_LENGTH = 10;            // сколько цифр считается «сканированием»
let dspItems = [];                     // товары, доступные к удалению
const dspSelected = new Set();         // выбранные коды товаров
let dspListenersBound = false;

function initVozvratUtilPage() {
    dspSelected.clear();
    bindDisposalListeners();
    renderDisposalItems();
    focusScanInput();
}

/* ---------- Вспомогательные ---------- */
function dspEscape(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function dspIsImageUrl(value) {
    return typeof value === 'string' && /^(https?:|data:|\/|\.\/|[\w\-]+\.(png|jpe?g|webp|svg|gif))/i.test(value);
}

function dspNotify(text, isError) {
    if (typeof showAlert === 'function') showAlert(text, !!isError);
}

function dspSetModal(visible) {
    if (typeof toggleModal === 'function') {
        toggleModal('disposal-confirm-modal', visible);
    } else {
        document.getElementById('disposal-confirm-modal').classList.toggle('visible', visible);
    }
    if (!visible) focusScanInput();
}

function dspModalOpen() {
    const m = document.getElementById('disposal-confirm-modal');
    return !!m && m.classList.contains('visible');
}

function focusScanInput() {
    const input = document.getElementById('disposal-scan-input');
    if (input) input.focus({ preventScroll: true });
}

/* ---------- Отрисовка ---------- */
function renderDisposalItems() {
    const container = document.getElementById('disposal-container');
    const userData = getUserData();
    const allItems = userData.receptionItems || [];
    const cellChanges = userData.cellChanges || {};
    const fourteenDaysAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);

    dspItems = allItems.filter(item => new Date(item.date).getTime() < fourteenDaysAgo);

    // убираем из выбора то, чего уже нет в списке
    const existing = new Set(dspItems.map(i => String(i.code)));
    Array.from(dspSelected).forEach(code => { if (!existing.has(code)) dspSelected.delete(code); });

    container.innerHTML = '';

    if (dspItems.length === 0) {
        container.innerHTML = '<div class="dsp-empty"><img src="utilization.png" alt="Утиль"><br>Нет товаров для утилизации</div>';
        updateDisposalCounter();
        return;
    }

    dspItems.forEach(item => {
        const code = String(item.code);
        const actualCell = getActualCell(item.cell, cellChanges);
        const cellNum = parseInt(actualCell, 10);
        const cellText = isNaN(cellNum) ? dspEscape(actualCell) : cellNum;
        const isSelected = dspSelected.has(code);

        const imageHtml = dspIsImageUrl(item.image)
            ? `<img src="${dspEscape(item.image)}" alt="" draggable="false">`
            : `<span>${dspEscape(item.image || '📦')}</span>`;

        const codeHead = dspEscape(code.slice(0, -4));
        const codeTail = dspEscape(code.slice(-4));

        const card = document.createElement('div');
        card.className = 'dsp-card' + (isSelected ? ' selected' : '');
        card.dataset.code = code;
        card.innerHTML = `
            <div class="dsp-card-top ${item.isDefective ? 'has-defect' : ''}">
                <div class="checkbox-wrapper-purple dsp-check">
                    <input type="checkbox" ${isSelected ? 'checked' : ''}>
                </div>
                ${item.isDefective ? '<div class="dsp-defect">БРАК</div>' : ''}
                <span class="dsp-cell-label">Ячейка</span>
                <span class="dsp-cell-number">${cellText}</span>
            </div>
            <div class="dsp-img">${imageHtml}</div>
            <div class="dsp-info">
                <div class="dsp-code">${codeHead}<b>${codeTail}</b></div>
                <div class="dsp-name" title="${dspEscape(item.name)}">${dspEscape(item.name)}</div>
                <div class="dsp-date">Принят: ${new Date(item.date).toLocaleDateString('ru-RU')}</div>
            </div>
        `;
        container.appendChild(card);
    });

    updateDisposalCounter();
}

function updateDisposalCounter() {
    const countEl = document.getElementById('disposal-count');
    const subEl = document.getElementById('disposal-count-sub');
    const btn = document.getElementById('dispose-all-btn');
    countEl.textContent = dspSelected.size;
    if (subEl) subEl.textContent = `из ${dspItems.length} к удалению`;
    if (btn) btn.disabled = dspSelected.size === 0;
}

/* ---------- Выбор товаров ---------- */
function setItemSelected(code, selected) {
    code = String(code);
    if (selected) dspSelected.add(code); else dspSelected.delete(code);

    const container = document.getElementById('disposal-container');
    const card = Array.from(container.querySelectorAll('.dsp-card')).find(c => c.dataset.code === code);
    if (card) {
        card.classList.toggle('selected', selected);
        const cb = card.querySelector('input[type="checkbox"]');
        if (cb) cb.checked = selected;
    }
    updateDisposalCounter();
    return card;
}

function flashCard(card) {
    if (!card) return;
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    card.classList.remove('dsp-flash');
    void card.offsetWidth;
    card.classList.add('dsp-flash');
}

function shakeScanInput() {
    const input = document.getElementById('disposal-scan-input');
    input.classList.remove('dsp-shake');
    void input.offsetWidth;
    input.classList.add('dsp-shake');
}

/* Сканирование: точное совпадение ШК — выбираем его,
   иначе любые 10 цифр выбирают первый ещё не выбранный товар из списка */
function handleScan(value) {
    if (dspItems.length === 0) {
        dspNotify('Нет товаров для удаления', true);
        shakeScanInput();
        return;
    }

    let target = dspItems.find(i => String(i.code) === value || (i.barcode && String(i.barcode) === value));

    if (target) {
        if (dspSelected.has(String(target.code))) {
            dspNotify('Этот товар уже выбран', true);
            shakeScanInput();
            return;
        }
    } else {
        target = dspItems.find(i => !dspSelected.has(String(i.code)));
        if (!target) {
            dspNotify('Все товары уже выбраны', true);
            shakeScanInput();
            return;
        }
    }

    flashCard(setItemSelected(target.code, true));
}

/* ---------- Обработчики ---------- */
function bindDisposalListeners() {
    if (dspListenersBound) return;
    dspListenersBound = true;

    const input = document.getElementById('disposal-scan-input');
    const container = document.getElementById('disposal-container');
    const deleteBtn = document.getElementById('dispose-all-btn');
    const modal = document.getElementById('disposal-confirm-modal');

    // Поле ввода: только цифры, на 10-й цифре — выбор товара
    input.addEventListener('input', () => {
        const digits = input.value.replace(/\D/g, '');
        if (digits.length >= DSP_SCAN_LENGTH) {
            input.value = '';
            handleScan(digits.slice(0, DSP_SCAN_LENGTH));
        } else if (digits !== input.value) {
            input.value = digits;
        }
    });

    // Enter (сканеры часто отправляют его в конце)
    input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const digits = input.value.replace(/\D/g, '');
        if (!digits) return;
        const exact = dspItems.some(i => String(i.code) === digits || (i.barcode && String(i.barcode) === digits));
        if (exact) {
            input.value = '';
            handleScan(digits);
        } else {
            shakeScanInput();
            dspNotify(`Введите ${DSP_SCAN_LENGTH} цифр`, true);
        }
    });

    // Клик по карточке или чекбоксу
    container.addEventListener('click', (e) => {
        const card = e.target.closest('.dsp-card');
        if (!card) return;
        const cb = card.querySelector('input[type="checkbox"]');
        const newState = (e.target === cb) ? cb.checked : !dspSelected.has(card.dataset.code);
        setItemSelected(card.dataset.code, newState);
        if (window.innerWidth > 768) focusScanInput();
    });

    // Кнопка «Удалить из программы» → окно подтверждения
    deleteBtn.addEventListener('click', () => {
        if (dspSelected.size === 0) return;
        document.getElementById('disposal-confirm-text').textContent =
            `Вы уверены, что хотите удалить товары из программы в количестве ${dspSelected.size} штук?`;
        dspSetModal(true);
    });

    document.getElementById('disposal-cancel-btn').addEventListener('click', () => dspSetModal(false));
    modal.querySelector('.close-modal-btn').addEventListener('click', () => dspSetModal(false));

    document.getElementById('disposal-confirm-btn').addEventListener('click', () => {
        const codes = new Set(dspSelected);
        dspSetModal(false);
        disposeSelectedItems(codes);
    });

    // Поле ввода всегда активно: возвращаем фокус при клике по пустому месту (на ПК)
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 || dspModalOpen()) return;
        if (e.target.closest('button, input, a, header, .menu-item, .fullscreen-modal, .side-panel')) return;
        focusScanInput();
    });
}

/* ---------- Удаление ---------- */
function disposeSelectedItems(codesToDispose) {
    const userData = getUserData();
    const allItems = userData.receptionItems || [];
    const removedCount = codesToDispose.size;

    userData.receptionItems = allItems.filter(item => !codesToDispose.has(String(item.code)));
    saveUserData(userData);

    dspSelected.clear();
    dspNotify(`Удалено из ПО: ${removedCount} шт.`, false);
    renderDisposalItems();
    focusScanInput();
}
