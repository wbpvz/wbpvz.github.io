document.addEventListener('DOMContentLoaded', () => {
    // Инициализация
    initPriemkaTovaryPage();
    setupMobileEventListeners();
});

function initPriemkaTovaryPage () {
    // Проверка истории при загрузке и запуск таймера
    clearHistoryAtMidnight();
    setInterval(clearHistoryAtMidnight, 60000); 

    renderReceptionHistory();
    const input = document.getElementById('product-code');
    if(input) input.focus();
    
    // Desktop Events
    document.getElementById('reception-btn').addEventListener('click', () => processReception());
    document.getElementById('simulate-qr-btn').addEventListener('click', simulateQRScan);
    if(input) input.addEventListener('keypress', (e) => { if (e.key === 'Enter') processReception(); });

    document.getElementById('accept-no-barcode-btn').addEventListener('click', () => startNoBarcodeFlow());
    document.getElementById('accept-defective-btn').addEventListener('click', () => startDefectiveFlow());
    
    document.addEventListener('scan', (e) => {
        const code = e.detail.code;
        const input = document.getElementById('product-code');
        const modalInput = document.getElementById('modal-input-field');
        const modal = document.getElementById('input-modal');

        if (modal && modal.classList.contains('visible') && modalInput) {
            modalInput.value = code;
            document.getElementById('modal-submit-btn').click();
        } else if (document.body.contains(input) && !document.querySelector('.fullscreen-modal.visible')) {
            // Если мы на десктопе - в инпут, если на мобиле - просто process
            if (window.innerWidth > 768) {
                input.value = code;
                processReception();
            } else {
                // Mobile auto-process logic
                processReception({code: code});
            }
        }
    });
}

function setupMobileEventListeners() {
    // Меню "Еще"
    const moreBtn = document.getElementById('mobile-more-btn');
    const moreMenu = document.getElementById('mobile-more-menu-content');
    if(moreBtn && moreMenu) {
        moreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            moreMenu.classList.toggle('visible');
        });
        document.addEventListener('click', (e) => {
            if (!moreBtn.contains(e.target) && !moreMenu.contains(e.target)) {
                moreMenu.classList.remove('visible');
            }
        });
    }

    // Кнопка "3 точки" -> "Приемка без ШК"
    const dotsBtn = document.getElementById('mobile-dots-btn');
    if(dotsBtn) {
        dotsBtn.addEventListener('click', () => {
             // Открывает модалку проблем с QR
             const menu = document.createElement('div');
             // Простая реализация: клик сразу вызывает NoBarcodeFlow
             // Либо можно показать мини-меню "Проблемы с QR"
             startNoBarcodeFlow();
        });
    }
    
    // Кнопка в меню "Проблемы с QR"
    document.getElementById('mobile-problems-qr-btn')?.addEventListener('click', () => {
        document.getElementById('mobile-more-menu-content').classList.remove('visible');
        startNoBarcodeFlow();
    });

    // Мобильный выход
    document.getElementById('mobile-exit-btn')?.addEventListener('click', () => {
        const uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null;
        if (uid) sessionStorage.removeItem('userCache_' + uid);
        firebase.auth().signOut();
    });

    // Мобильная камера (симуляция)
    const scanBtn = document.getElementById('mobile-start-scan-btn');
    const camOverlay = document.getElementById('mobile-camera-overlay');
    const closeCam = document.getElementById('close-cam-btn');

    if(scanBtn && camOverlay) {
        scanBtn.addEventListener('click', () => {
            camOverlay.style.display = 'flex';
            // Симуляция задержки сканирования
            setTimeout(() => {
                camOverlay.style.display = 'none';
                simulateQRScan(); // Вызовет processReception
            }, 1500);
        });
        
        closeCam.addEventListener('click', () => {
            camOverlay.style.display = 'none';
        });
    }

    // Кнопка "Сканировать следующий" на экране результата
    document.getElementById('m-res-next-btn')?.addEventListener('click', () => {
        document.getElementById('m-result-screen').style.display = 'none';
        document.getElementById('m-scan-screen').style.display = 'flex';
    });
}

function simulateQRScan() {
    const min = 100000000;
    const max = 999999999;
    const randomCode = Math.floor(Math.random() * (max - min + 1)) + min;
    const input = document.getElementById('product-code');
    if(input) input.value = randomCode;
    playScannerSound();
    setTimeout(() => { processReception({ code: randomCode.toString() }); }, 200);
}

// Данные о продуктах (productData и adultProductData) теперь берутся из p_shared.js

const modalState = { 
    type: null, 
    subType: null, 
    tempCode: null,
    tempProduct: null
};

function playScannerSound() { 
    const s = document.getElementById('scanner-sound'); 
    if (s) { s.currentTime = 0; s.play().catch(e => {}); } 
}
function playDeclineSound() {
    const s = document.getElementById('decline-sound');
    if (s) { s.currentTime = 0; s.play().catch(e => {}); }
}

function playSound(filename) {
    const audio = new Audio(filename);
    audio.play().catch(e => console.log('Audio error:', e));
}

function clearHistoryAtMidnight() {
    const now = new Date();
    // Получаем текущую дату в формате YYYY-MM-DD
    const todayStr = now.toISOString().split('T')[0];
    const lastClearDate = localStorage.getItem('wb_pvz_lastHistoryClearDate');

    // Если дата изменилась (наступила полночь или новый день)
    if (lastClearDate !== todayStr) {
        const userData = getUserData();
        // Очищаем ТОЛЬКО лог истории для отображения, не трогая receptionItems (базу)
        userData.receptionHistoryLog = []; 
        saveUserData(userData);
        
        if (document.getElementById('reception-history-grid')) renderReceptionHistory();
        
        // Обновляем дату
        localStorage.setItem('wb_pvz_lastHistoryClearDate', todayStr);
        console.log("История очищена по наступлению нового дня.");
    }
}

function processReception(options = {}) {
    const input = document.getElementById('product-code');
    const code = options.code || (input ? input.value.trim() : '');
    
    if (!options.isNoBarcode && !options.code && !/^\d{9}$/.test(code)) { 
        showAlert('Введите 9-значный код товара', true); 
        return; 
    }
    
    setTimeout(() => {
        // Шанс на "Излишек"
        if (Math.random() < 0.03) {
            playDeclineSound();
            showAlert('Излишек! Отсканируйте заново или отложите.', true);
            if (input) { input.value = ''; input.focus(); }
            return;
        }

        const userData = getUserData();
        const receptionItems = userData.receptionItems || [];
        // ВАЖНО: берем лог, который очищается в полночь
        const receptionHistory = userData.receptionHistoryLog || [];
        
        const existingItem = receptionItems.find(item => item.code === code);
        
        if (existingItem) {
            const actualCell = getActualCell(existingItem.cell, userData.cellChanges);
            speakNumber(actualCell).then(() => {
                playSound('good_already_accepted.mp3'); 
            });
            showAlert(`Товар уже в ячейке ${parseInt(actualCell)}`, false);
            // Для мобильного отображения тоже показываем результат, даже если повтор
            showMobileResult(existingItem, actualCell, true);
            
            if (input) { input.value = ''; input.focus(); }
            return;
        }

        let assignedCell;
        // Логика подбора ячейки (симуляция)
        const lastItem = receptionHistory[0];
        if (lastItem && Math.random() < 0.55) assignedCell = getActualCell(lastItem.cell, userData.cellChanges);
        else assignedCell = (Math.floor(Math.random() * 900) + 1).toString().padStart(3, '0');
        
        speakNumber(assignedCell);
        
        let productObj;
        if (options.product) {
            productObj = options.product;
        } else {
            const shouldBeAdult = Math.random() < 0.09;
            const dataSrc = shouldBeAdult ? adultProductData : productData;
            productObj = dataSrc[Math.floor(Math.random() * dataSrc.length)];
        }
        
        const newItem = { 
            code, 
            cell: assignedCell, 
            name: productObj.name, 
            image: productObj.image, 
            price: productObj.price, 
            date: new Date().toISOString(), 
            isDefective: options.isDefective || false, 
            isAdult: productObj.isAdult || false,
            isNoBarcode: options.isNoBarcode || false 
        };

        receptionItems.push(newItem);
        // Добавляем в историю (которая чистится ежедневно)
        receptionHistory.unshift(newItem); 
        
        // Лимит истории (на всякий случай, чтобы не переполнять UI)
        if(receptionHistory.length > 50) receptionHistory.pop();
        
        userData.receptionItems = receptionItems;
        userData.receptionHistoryLog = receptionHistory;
        saveUserData(userData);
        
        if (input) { input.value = ''; input.focus(); }
        renderReceptionHistory();
        
        // Показываем мобильный результат
        showMobileResult(newItem, assignedCell, false);

    }, 150);
}

function showMobileResult(item, cell, isRepeat) {
    if (window.innerWidth > 768) return; // Только для мобилок

    const scanScreen = document.getElementById('m-scan-screen');
    const resScreen = document.getElementById('m-result-screen');
    
    scanScreen.style.display = 'none';
    resScreen.style.display = 'flex';

    // Ячейка
    document.getElementById('m-res-cell').textContent = parseInt(cell, 10);
    
    // Кнопка звука
    const sndBtn = document.getElementById('m-res-sound-btn');
    sndBtn.onclick = () => {
        speakNumber(cell).then(() => {
             playSound('good_already_accepted.mp3');
        });
    };

    // Картинка
    const imgEl = document.getElementById('m-res-img');
    if (item.isAdult) {
        imgEl.src = 'adult.svg';
        imgEl.style.filter = 'blur(5px)';
    } else {
        imgEl.src = item.image || 'https://placehold.co/1200x800/png?text=No+Image';
        imgEl.style.filter = 'none';
    }

    // Код (последние 4 жирным)
    const codeStr = item.code.toString();
    const codeFormatted = codeStr.length >= 4 
            ? `${codeStr.slice(0, -4)} <b>${codeStr.slice(-4)}</b>` 
            : `<b>${codeStr}</b>`;
    document.getElementById('m-res-code').innerHTML = codeFormatted;

    // Имя и Бренд (Разделение по слэшу)
    const nameEl = document.getElementById('m-res-name');
    const brandEl = document.getElementById('m-res-brand');
    
    let fullName = item.name || '';
    let brandText = 'BRAND';
    let nameText = fullName;
    
    if (fullName.includes('/')) {
        const parts = fullName.split('/');
        brandText = parts[0].trim();
        nameText = parts.slice(1).join('/').trim(); // Остальное это имя
    }
    
    brandEl.textContent = brandText;
    nameEl.textContent = nameText;

    // Цена
    document.getElementById('m-res-price').textContent = item.price ? `${item.price} ₽` : '';

    // Брак
    const defCheck = document.getElementById('m-res-defective-check');
    defCheck.checked = item.isDefective;
    // Обновление брака при клике
    defCheck.onclick = () => {
        const isDef = defCheck.checked;
        // Обновляем в локальном кеше и базе
        const userData = getUserData();
        const targetItem = userData.receptionItems.find(i => i.code === item.code);
        if(targetItem) {
            targetItem.isDefective = isDef;
            saveUserData(userData);
            renderReceptionHistory(); // обновить десктоп список
        }
    };
}

function renderReceptionHistory() {
    const userData = getUserData();
    const receptionHistory = userData.receptionHistoryLog || [];
    const allReceptionItems = userData.receptionItems || [];
    const cellChanges = userData.cellChanges || {};
    const gridContainer = document.getElementById('reception-history-grid');
    
    if(!gridContainer) return;

    gridContainer.innerHTML = '';
    
    const itemsToDisplay = receptionHistory.slice(0, 3); 

    if (itemsToDisplay.length === 0) {
        gridContainer.innerHTML = `<div class="empty-message" style="grid-column: 1 / -1; margin-top:20px; display:flex; flex-direction:column; align-items:center;"><i class="fas fa-box-open" style="font-size:3rem; color:var(--text-secondary-color);"></i><div style="margin-top:10px;">Нет истории приёмки</div></div>`;
        return;
    }

    itemsToDisplay.forEach((item, index) => {
        const actualCell = getActualCell(item.cell, cellChanges);
        const displayCell = parseInt(actualCell, 10);
        const isLatest = index === 0;
        const styleClass = isLatest ? 'latest' : 'historic';
        
        const itemsInCell = allReceptionItems.filter(i => getActualCell(i.cell, cellChanges) === actualCell).length;
        
        const textBlurClass = item.isAdult ? 'adult-blur-text' : '';
        
        let imageContent;
        if (item.isAdult) {
            imageContent = `<img src="adult.svg" class="adult-svg-icon" alt="18+" draggable="false" onmousedown="return false" style="user-select: none; -webkit-user-drag: none;">`;
        } else {
            imageContent = `<img src="${item.image || 'https://placehold.co/1200x800/png?text=No+Image'}" alt="Товар">`;
        }
            
        const nameText = item.name;
        
        const codeStr = item.code.toString();
        const codeFormatted = codeStr.length >= 4 
            ? `${codeStr.slice(0, -4)} <b>${codeStr.slice(-4)}</b>` 
            : `<b>${codeStr}</b>`;

        const card = document.createElement('div');
        card.className = `reception-card-new ${styleClass}`;
        
        card.innerHTML = `
            ${item.isDefective ? '<div class="defective-overlay">БРАК</div>' : ''}
            
            <div class="rc-gray-block rc-cell-block">
                <span class="rc-cell-label">Ячейка</span>
                <span class="rc-cell-number">${displayCell}</span>
            </div>
            
            <div class="rc-gray-block rc-info-block">
                 <span class="rc-info-title">Информация по товарам клиента:</span>
                 <div class="rc-info-value"><b>На ячейке:</b> <span class="highlight-digit">${itemsInCell}</span></div>
            </div>

            <div class="rc-center-image-container">
                ${imageContent}
            </div>
            
            <div class="rc-bottom-info">
                <div class="rc-code ${textBlurClass}">${codeFormatted}</div>
                <div class="rc-name ${textBlurClass}">${nameText}</div>
            </div>
        `;
        gridContainer.appendChild(card);
    });
}

function startNoBarcodeFlow() {
    modalState.type = 'no_barcode';
    const title = document.getElementById('reason-modal-title');
    const btnContainer = document.getElementById('reason-buttons-container');
    const radioContainer = document.getElementById('reason-radio-container');
    const confirmBtn = document.getElementById('reason-confirm-btn');

    title.textContent = "Приёмка без ШК";
    btnContainer.innerHTML = '';
    btnContainer.style.display = 'flex'; 
    radioContainer.style.display = 'none';
    confirmBtn.style.display = 'none';

    const reasons = { 'missing': 'ШК отсутствует', 'damaged': 'ШК поврежден' };
    for (const [key, value] of Object.entries(reasons)) {
        const btn = document.createElement('button');
        btn.className = 'secondary-btn';
        btn.textContent = value;
        btn.onclick = () => { 
            modalState.subType = key; 
            toggleModal('reason-modal', false); 
            processNoBarcodeStep1(); 
        };
        btnContainer.appendChild(btn);
    }
    toggleModal('reason-modal', true);
}

function processNoBarcodeStep1() {
    const { subType } = modalState;
    const modalTitle = document.getElementById('input-modal-title');
    const modalPrompt = document.getElementById('input-modal-prompt');
    const inputField = document.getElementById('modal-input-field');
    const submitBtn = document.getElementById('modal-submit-btn');
    const cancelBtn = document.getElementById('modal-cancel-btn');
    const linkAction = document.getElementById('modal-link-action');
    const productDisplay = document.getElementById('modal-product-display');

    productDisplay.style.display = 'none';
    inputField.style.display = 'block';
    cancelBtn.style.display = 'none';
    submitBtn.textContent = 'Продолжить';
    inputField.value = '';

    if (subType === 'missing') {
        modalTitle.textContent = 'ШК Отсутствует';
        modalPrompt.textContent = 'Отсканируйте бар-код товара или введите цифры';
        linkAction.style.display = 'block';
        linkAction.onclick = () => {
            toggleModal('input-modal', false);
            moveToReturns({ isUnknown: true });
        };
    } else {
        modalTitle.textContent = 'ШК Поврежден';
        modalPrompt.textContent = 'Введите цифры под QR-кодом';
        linkAction.style.display = 'none';
    }

    submitBtn.onclick = () => {
        const val = inputField.value.trim();
        if (val.length < 4) { showAlert('Введите корректный код', true); return; }
        modalState.tempCode = val;
        processConfirmationStep();
    };

    toggleModal('input-modal', true);
    inputField.focus();
}

function startDefectiveFlow() {
    modalState.type = 'defective';
    const title = document.getElementById('reason-modal-title');
    const btnContainer = document.getElementById('reason-buttons-container');
    const radioContainer = document.getElementById('reason-radio-container');
    const confirmBtn = document.getElementById('reason-confirm-btn');

    title.textContent = "Приёмка с браком";
    btnContainer.style.display = 'none';
    radioContainer.style.display = 'block';
    radioContainer.innerHTML = '';
    confirmBtn.style.display = 'block';

    const reasons = [
        { val: 'present', label: 'ШК присутствует' },
        { val: 'missing', label: 'ШК отсутствует' },
        { val: 'damaged', label: 'ШК поврежден' }
    ];

    reasons.forEach((r, idx) => {
        const div = document.createElement('div');
        div.className = 'radio-option';
        const checked = idx === 0 ? 'checked' : '';
        div.innerHTML = `<input type="radio" name="defective_reason" id="rad_${r.val}" value="${r.val}" ${checked}><label for="rad_${r.val}">${r.label}</label>`;
        div.onclick = (e) => {
             if(e.target.tagName !== 'INPUT') document.getElementById(`rad_${r.val}`).checked = true;
        };
        radioContainer.appendChild(div);
    });

    confirmBtn.onclick = () => {
        const selected = document.querySelector('input[name="defective_reason"]:checked');
        if (!selected) return;
        modalState.subType = selected.value;
        toggleModal('reason-modal', false);
        processDefectiveStep1();
    };
    
    toggleModal('reason-modal', true);
}

function processDefectiveStep1() {
    const { subType } = modalState;
    const modalTitle = document.getElementById('input-modal-title');
    const modalPrompt = document.getElementById('input-modal-prompt');
    const inputField = document.getElementById('modal-input-field');
    const submitBtn = document.getElementById('modal-submit-btn');
    const cancelBtn = document.getElementById('modal-cancel-btn');
    const linkAction = document.getElementById('modal-link-action');
    const productDisplay = document.getElementById('modal-product-display');

    productDisplay.style.display = 'none';
    inputField.style.display = 'block';
    cancelBtn.style.display = 'none';
    linkAction.style.display = 'none';
    submitBtn.textContent = 'Продолжить';
    inputField.value = '';

    if (subType === 'present') {
        modalTitle.textContent = 'ШК Присутствует';
        modalPrompt.textContent = 'Отсканируйте код или введите код ниже';
    } else if (subType === 'missing') {
        modalTitle.textContent = 'ШК Отсутствует';
        modalPrompt.textContent = 'Отсканируйте бар-код товара или введите цифры';
    } else {
        modalTitle.textContent = 'ШК Поврежден';
        modalPrompt.textContent = 'Введите цифры под QR-кодом';
    }

    submitBtn.onclick = () => {
        const val = inputField.value.trim();
        if (val.length < 4) { showAlert('Введите корректный код', true); return; }
        modalState.tempCode = val;
        processConfirmationStep();
    };

    toggleModal('input-modal', true);
    inputField.focus();
}

function processConfirmationStep() {
    const modalTitle = document.getElementById('input-modal-title');
    const modalPrompt = document.getElementById('input-modal-prompt');
    const inputField = document.getElementById('modal-input-field');
    const submitBtn = document.getElementById('modal-submit-btn');
    const cancelBtn = document.getElementById('modal-cancel-btn');
    const linkAction = document.getElementById('modal-link-action');
    const productDisplay = document.getElementById('modal-product-display');

    const randomProduct = productData[Math.floor(Math.random() * productData.length)];
    modalState.tempProduct = randomProduct;

    modalTitle.textContent = 'Подтвердите товар';
    modalPrompt.textContent = 'Возможно, это этот товар?';
    
    inputField.style.display = 'none';
    linkAction.style.display = 'none';
    
    productDisplay.style.display = 'flex';
    productDisplay.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px; width: 100%; text-align: left; background: var(--gray-lightest); padding: 10px; border-radius: 8px;">
            <div style="width: 120px; height: 80px; flex-shrink:0;">
                <img src="${randomProduct.image}" style="width:100%; height:100%; object-fit:contain;" alt="Img">
            </div>
            <div>
                <div style="font-weight: bold; color: var(--primary);">${modalState.tempCode}</div>
                <div style="font-size: 0.9rem; color: var(--text-secondary-color);">${randomProduct.name}</div>
            </div>
        </div>
    `;

    submitBtn.textContent = 'Да';
    cancelBtn.style.display = 'inline-block';
    cancelBtn.textContent = 'Нет';
    
    submitBtn.onclick = () => {
        toggleModal('input-modal', false);
        const isDef = (modalState.type === 'defective');
        const isNoBar = (modalState.type === 'no_barcode');
        
        processReception({
            code: modalState.tempCode,
            product: modalState.tempProduct,
            isDefective: isDef,
            isNoBarcode: isNoBar
        });
    };

    cancelBtn.onclick = () => {
        toggleModal('input-modal', false);
        moveToReturns({ isUnknown: true });
    };
}

function moveToReturns(details = {}) {
    const userData = getUserData();
    const returnsItems = userData.returnsItems || [];
    
    let newItem;
    
    if (details.isUnknown) {
        newItem = {
            code: '?',
            name: '???',
            image: '',
            cell: 'Возврат',
            date: new Date().toISOString(),
            isDefective: (modalState.type === 'defective'), 
            confirmed: false
        };
    } else {
        newItem = {
            code: details.code || '???',
            name: details.name || '???',
            image: details.image || '',
            cell: 'Возврат',
            date: new Date().toISOString(),
            isDefective: (modalState.type === 'defective'),
            confirmed: false
        };
    }

    returnsItems.push(newItem);
    userData.returnsItems = returnsItems;
    saveUserData(userData);
    
    alert("Товар системно перемещен в раздел Возвраты. Найдите товар '???' и нажмите 'Обработать'.");
}