function initPriemkaPovtornayaPage () {
    isDataReady.then(() => {
        clearRepeatHistoryAtMidnight();
        setInterval(clearRepeatHistoryAtMidnight, 60000);

        renderReceptionRepeatHistory();
        document.getElementById('reception-repeat-btn').addEventListener('click', processReceptionRepeat);
        document.getElementById('product-code-repeat').addEventListener('keypress', e => { if (e.key === 'Enter') processReceptionRepeat(); });

        document.addEventListener('scan', (e) => {
            const code = e.detail.code;
            const input = document.getElementById('product-code-repeat');
            if (document.body.contains(input) && !document.querySelector('.fullscreen-modal.visible')) {
                input.value = code;
                processReceptionRepeat();
            }
        });
    });
}

const scannerSound = document.getElementById('scanner-sound');

function playScannerSound() {
    if (scannerSound) {
        scannerSound.currentTime = 0;
        scannerSound.play().catch(e => console.error("Scanner sound play failed:", e));
    }
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
    if (!/^\d{9}$/.test(code)) {
        showAlert('Введите 9-значный код товара', true); return;
    }
    
    playScannerSound();

    setTimeout(() => {
        const userData = getUserData();
        const receptionItems = userData.receptionItems || [];
        let repeatHistory = userData.receptionRepeatHistoryLog || [];
        
        const existingItem = receptionItems.find(item => item.code === code);

        if (!existingItem) {
            showAlert(`Товар ${code} не найден на складе.`, true);
            input.value = '';
            return;
        }

        const actualCell = getActualCell(existingItem.cell, userData.cellChanges);

        showAlert(`Товар ${code} уже принят в ячейку ${parseInt(actualCell, 10)}`, false);
        
        // --- ИЗМЕНЕНИЕ: Замена на озвучку через Netlify ---
        
        // Сначала называем ячейку
        speakNumber(actualCell); 
        
        // Затем звук "Уже принят" (локальный)
        setTimeout(() => {
            playSound('good_already_accepted.mp3'); 
        }, 800); 
        
        // --- КОНЕЦ ИЗМЕНЕНИЯ ---

        const logEntry = { ...existingItem, foundDate: new Date().toISOString(), actualCell: actualCell };
        repeatHistory.unshift(logEntry);
        if(repeatHistory.length > 10) repeatHistory.pop();

        userData.receptionRepeatHistoryLog = repeatHistory;
        saveUserData(userData);

        input.value = '';
        input.focus();
        renderReceptionRepeatHistory();
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
        const itemsInCell = (userData.receptionItems || []).filter(i => getActualCell(i.cell, userData.cellChanges) === item.actualCell).length;
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