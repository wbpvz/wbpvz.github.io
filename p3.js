function initPriemkaPovtornayaPage () {
    clearRepeatHistoryAtMidnight();
    setInterval(clearRepeatHistoryAtMidnight, 60000);

    renderReceptionRepeatHistory();
    renderSurplusReady();
    window.onSurplusChanged = renderSurplusReady;   // p_shared.js зовёт, когда проверка излишка закончилась

    document.getElementById('reception-repeat-btn').addEventListener('click', processReceptionRepeat);
    document.getElementById('product-code-repeat').addEventListener('keypress', e => { if (e.key === 'Enter') processReceptionRepeat(); });
    document.getElementById('surplus-toggle-btn')?.addEventListener('click', toggleSurplusHidden);

    document.addEventListener('scan', (e) => {
        const code = e.detail.code;
        const input = document.getElementById('product-code-repeat');
        if (document.body.contains(input) && !document.querySelector('.fullscreen-modal.visible')) {
            input.value = code;
            processReceptionRepeat();
        }
    });
}

const scannerSound = document.getElementById('scanner-sound');

function playScannerSound() {
    if (scannerSound) {
        scannerSound.currentTime = 0;
        scannerSound.play().catch(e => console.error("Scanner sound play failed:", e));
    }
}

// На этой странице нет p.js, поэтому нужные функции объявлены здесь
function p3ActualCell(cell, cellChanges) {
    return (cellChanges && cellChanges[cell]) ? cellChanges[cell] : cell;
}

function p3PlaySound(filename) {
    if (typeof playSound === 'function') return playSound(filename);
    return new Promise((resolve) => {
        const audio = new Audio(filename);
        audio.onended = resolve;
        audio.play().catch(() => resolve());
    });
}

function clearRepeatHistoryAtMidnight() {
    const now = new Date();
    const moscowOffset = 3 * 60;
    const localOffset = -now.getTimezoneOffset();
    const moscowTime = new Date(now.getTime() + (moscowOffset - localOffset) * 60000);

    const lastClearDate = localStorage.getItem('wb_pvz_lastRepeatHistoryClearDate');
    const moscowDateStr = moscowTime.toISOString().split('T')[0];

    if (lastClearDate !== moscowDateStr) {
        const userData = getUserData();
        if (userData.receptionRepeatHistoryLog && userData.receptionRepeatHistoryLog.length > 0) {
            userData.receptionRepeatHistoryLog = [];
            saveUserData(userData);
            if (document.getElementById('reception-repeat-history-container')) {
                renderReceptionRepeatHistory();
            }
        }
        localStorage.setItem('wb_pvz_lastRepeatHistoryClearDate', moscowDateStr);
    }
}

function processReceptionRepeat() {
    const input = document.getElementById('product-code-repeat');
    const code = input.value.trim();
    if (!/^\d{10}$/.test(code)) {
        showAlert('Введите 10-значный код товара', true); return;
    }

    playScannerSound();

    setTimeout(() => {
        const userData = getUserData();
        const receptionItems = userData.receptionItems || [];
        let repeatHistory = userData.receptionRepeatHistoryLog || [];

        const existingItem = receptionItems.find(item => item.code === code);

        if (!existingItem) {
            // Излишек, который уже проверен: его код вводится в разделе «Приёмка»
            const readySurplus = (userData.surplusItems || []).find(s => s && s.code === code && s.status === 'ready');
            if (readySurplus) {
                showAlert(`Излишек ${code} проверен`, true);
            } else {
                showAlert(`Товар ${code} не найден на складе.`, true);
            }
            input.value = '';
            return;
        }

        const actualCell = p3ActualCell(existingItem.cell, userData.cellChanges);

        showAlert(`Товар ${code} уже принят в ячейку ${parseInt(actualCell, 10)}`, false);

        // Сначала называем ячейку
        speakNumber(actualCell);

        // Затем звук "Уже принят" (локальный).
        // Излишек, который сам попал в ячейку и лежит в «Принять снова» (fromSurplus), ещё не принимался — звук не играем.
        const wasSurplus = !!existingItem.fromSurplus;
        if (!wasSurplus) {
            setTimeout(() => {
                p3PlaySound('good_already_accepted.mp3');
            }, 800);
        } else {
            delete existingItem.fromSurplus;
            userData.surplusItems = (Array.isArray(userData.surplusItems) ? userData.surplusItems : [])
                .filter(s => !(s && s.code === code && s.status === 'ready'));
        }

        const logEntry = { ...existingItem, foundDate: new Date().toISOString(), actualCell: actualCell };
        repeatHistory.unshift(logEntry);
        if(repeatHistory.length > 10) repeatHistory.pop();

        userData.receptionRepeatHistoryLog = repeatHistory;
        saveUserData(userData);

        input.value = '';
        input.focus();
        renderReceptionRepeatHistory();
        if (wasSurplus) renderSurplusReady();
    }, 150);
}

function renderReceptionRepeatHistory() {
    const userData = getUserData();
    const repeatHistory = userData.receptionRepeatHistoryLog || [];
    const mainContainer = document.getElementById('reception-repeat-history-container');

    mainContainer.innerHTML = '';
    if (repeatHistory.length === 0) {
        mainContainer.innerHTML = `<div class="empty-message" style="width: 100%"><i class="fas fa-box-open"></i><div>Нет истории</div></div>`;
        return;
    }

    repeatHistory.forEach(item => {
        const itemsInCell = (userData.receptionItems || []).filter(i => p3ActualCell(i.cell, userData.cellChanges) === item.actualCell).length;
        const imageContent = item.isAdult ? `<img src="adult.svg" class="adult-svg-icon" alt="18+">` : `<span class="product-emoji">${item.image || '📦'}</span>`;
        const codeContent = item.isAdult ? `<span class="main-code blurred-text">${item.code}</span>` : `<span class="main-code">${item.code}</span>`;
        const nameContent = item.isAdult ? `<div class="product-name blurred-text" style="font-size: 0.9rem; color: var(--text-secondary-color);">Наименование скрыто</div>` : `<div class="product-name" style="font-size: 0.9rem; color: var(--text-secondary-color);">${item.name}</div>`;

        const card = document.createElement('div');
        card.className = 'reception-card-new';
        card.innerHTML = `
            <div class="cell-header"><span class="cell-title">Ячейка</span><span class="cell-number">${parseInt(item.actualCell, 10)}</span></div>
            <div class="info-block"><span class="info-title">Информация по товарам клиента</span><span class="info-count">На ячейке: ${itemsInCell}</span></div>
            <div class="product-image-container">${imageContent}</div>
            <div class="product-details-new">${codeContent}${nameContent}</div>`;
        mainContainer.appendChild(card);
    });
}

// ===================== ИЗЛИШКИ, ПРОШЕДШИЕ ПРОВЕРКУ =====================
// Карточка как в приёмке: сверху ячейка, ниже картинка, ниже код. Слева — кнопка «Скрыть товары».
// Скрытие только убирает карточки с экрана этого раздела: сами излишки остаются проверенными,
// их по-прежнему можно принять, введя код в «Приёмке».
function getReadySurplus() {
    return (getUserData().surplusItems || [])
        .filter(s => s && s.status === 'ready')
        .sort((a, b) => (b.readyAt || 0) - (a.readyAt || 0));
}

function surplusEsc(v) {
    return String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function surplusImageHtml(s) {
    if (s.isAdult) return '<img src="adult.svg" class="sp-adult" alt="18+" draggable="false">';
    const img = String(s.image || '');
    if (/[\/.]/.test(img)) return `<img src="${surplusEsc(img)}" alt="" draggable="false" onerror="this.style.visibility='hidden'">`;
    return `<span class="sp-emoji">${surplusEsc(img || '📦')}</span>`;
}

function surplusCodeHtml(code) {
    const s = String(code || '');
    const splitAt = Math.max(s.length - 4, 0);
    return splitAt > 0 ? `${surplusEsc(s.slice(0, splitAt))} <b>${surplusEsc(s.slice(splitAt))}</b>` : `<b>${surplusEsc(s)}</b>`;
}

function renderSurplusReady() {
    const section = document.getElementById('surplus-section');
    const grid = document.getElementById('surplus-ready-grid');
    const btn = document.getElementById('surplus-toggle-btn');
    const note = document.getElementById('surplus-count-note');
    if (!section || !grid) return;

    const userData = getUserData();
    const ready = getReadySurplus();

    if (!ready.length) { section.style.display = 'none'; grid.innerHTML = ''; return; }
    section.style.display = 'flex';

    const hidden = !!userData.surplusHidden;
    if (btn) {
        btn.querySelector('span').textContent = hidden ? 'Показать товары' : 'Скрыть товары';
        btn.querySelector('i').className = hidden ? 'fas fa-eye' : 'fas fa-eye-slash';
    }
    if (note) note.textContent = `Товаров: ${ready.length}`;

    grid.style.display = hidden ? 'none' : 'grid';
    grid.innerHTML = hidden ? '' : ready.map(s => `
        <div class="sp-card" data-code="${surplusEsc(s.code)}">
            <div class="sp-cell">
                <span class="sp-cell-label">Ячейка</span>
                <span class="sp-cell-num">${parseInt(p3ActualCell(s.cell, userData.cellChanges), 10)}</span>
            </div>
            <div class="sp-img">${surplusImageHtml(s)}</div>
            <div class="sp-code">${surplusCodeHtml(s.code)}</div>
        </div>`).join('');
}

function toggleSurplusHidden() {
    const userData = getUserData();
    userData.surplusHidden = !userData.surplusHidden;
    saveUserData(userData);
    renderSurplusReady();
}
