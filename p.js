document.addEventListener('DOMContentLoaded', () => {
    initPriemkaTovaryPage();
    setupMobileEventListeners();
});

function getActualCell(cell, cellChanges) {
    return (cellChanges && cellChanges[cell]) ? cellChanges[cell] : cell;
}

// === УТИЛИТА ДЛЯ ТОЧНОЙ ДАТЫ МСК ===
function getMSKDateString(dateStringOrObj) {
    const d = new Date(dateStringOrObj || new Date());
    // Получаем точное UTC время в миллисекундах
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    // Сдвигаем на +3 часа (МСК)
    const mskDate = new Date(utc + (3600 * 1000 * 3));
    const y = mskDate.getFullYear();
    const m = String(mskDate.getMonth() + 1).padStart(2, '0');
    const day = String(mskDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function initPriemkaTovaryPage () {
    if(typeof window.generateDeliveriesForToday === 'function') window.generateDeliveriesForToday();
    if(typeof window.renderDeliveries === 'function') window.renderDeliveries();
    
    clearHistoryAtMidnight();
    // Проверяем наступление полуночи каждую минуту
    setInterval(clearHistoryAtMidnight, 60000);
    renderReceptionHistory();
    
    const input = document.getElementById('product-code');
    if(input) input.focus();
    
    document.getElementById('reception-btn')?.addEventListener('click', () => processReception());
    document.getElementById('simulate-qr-btn')?.addEventListener('click', simulateQRScan);
    if(input) input.addEventListener('keypress', (e) => { if (e.key === 'Enter') processReception(); });
    
    document.getElementById('accept-no-barcode-btn')?.addEventListener('click', () => startNoBarcodeFlow());
    document.getElementById('delivery-time-btn')?.addEventListener('click', () => {
        document.getElementById('delivery-time-panel').classList.add('visible');
        if(typeof window.renderDeliveries === 'function') window.renderDeliveries();
    });
    
    document.getElementById('close-delivery-panel-btn')?.addEventListener('click', () => {
        document.getElementById('delivery-time-panel').classList.remove('visible');
    });

    // Обработчики нового флоу для брака
    document.getElementById('defect-submit-btn')?.addEventListener('click', submitDefectCode);
    document.getElementById('defect-product-code')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitDefectCode();
    });
    
    document.getElementById('defect-cancel-btn')?.addEventListener('click', () => {
        document.getElementById('desktop-defect-screen').style.display = 'none';
        document.getElementById('main-reception-container').style.display = 'flex';
        document.getElementById('product-code')?.focus();
    });

    document.addEventListener('scan', (e) => {
        const code = e.detail.code;
        const input = document.getElementById('product-code');
        const modalInput = document.getElementById('modal-input-field');
        const modal = document.getElementById('input-modal');

        if (modal && modal.classList.contains('visible') && modalInput) {
            modalInput.value = code;
            document.getElementById('modal-submit-btn').click();
        } else if (document.body.contains(input) && !document.querySelector('.fullscreen-modal.visible')) {
            if (window.innerWidth > 768) {
                input.value = code;
                processReception();
            } else {
                processReception({code: code});
            }
        }
    });
}

function submitDefectCode() {
    const input = document.getElementById('defect-product-code');
    const code = input ? input.value.trim() : '';
    
    if (!/^\d{10}$/.test(code)) {
        showAlert('Введите 10-значный код товара', true);
        return;
    }
    document.getElementById('desktop-defect-screen').style.display = 'none';
    document.getElementById('main-reception-container').style.display = 'flex';
    processReception({ code: code, isDefective: true });
}

function setupMobileEventListeners() {
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

    const dotsBtn = document.getElementById('mobile-dots-btn');
    if(dotsBtn) {
        dotsBtn.addEventListener('click', () => {
             startNoBarcodeFlow();
        });
    }
    
    document.getElementById('mobile-problems-qr-btn')?.addEventListener('click', () => {
        document.getElementById('mobile-more-menu-content').classList.remove('visible');
        startNoBarcodeFlow();
    });
    
    document.getElementById('mobile-exit-btn')?.addEventListener('click', () => {
        const uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null;
        if (uid) sessionStorage.removeItem('userCache_' + uid);
        firebase.auth().signOut();
    });

    const scanBtn = document.getElementById('mobile-start-scan-btn');
    const camOverlay = document.getElementById('mobile-camera-overlay');
    const closeCam = document.getElementById('close-cam-btn');
    let html5QrCode = null;
    
    if(scanBtn && camOverlay) {
        scanBtn.addEventListener('click', () => {
            camOverlay.style.display = 'flex';
            if (!html5QrCode) {
                html5QrCode = new Html5Qrcode("cam-reader-container");
            }
            html5QrCode.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText) => {
                    if (/^\d{10}$/.test(decodedText)) {
                        html5QrCode.stop().then(() => {
                            camOverlay.style.display = 'none';
                            playScannerSound();
                            processReception({ code: decodedText });
                        }).catch(err => {
                            console.error("Остановка сканера с ошибкой", err);
                        });
                    }
                },
                (errorMessage) => {}
            ).catch((err) => {
                console.error("Camera error:", err);
                showAlert('Ошибка доступа к камере. Разрешите использование камеры.', true);
                camOverlay.style.display = 'none';
            });
        });
        
        closeCam.addEventListener('click', () => {
            if (html5QrCode && html5QrCode.isScanning) {
                html5QrCode.stop().then(() => {
                    camOverlay.style.display = 'none';
                }).catch(err => {
                    camOverlay.style.display = 'none';
                });
            } else {
                camOverlay.style.display = 'none';
            }
        });
    }

    document.getElementById('m-res-next-btn')?.addEventListener('click', () => {
        document.getElementById('m-result-screen').style.display = 'none';
        document.getElementById('mobile-start-scan-btn').click();
    });
}

function simulateQRScan() {
    const min = 1000000000;
    const max = 9999999999;
    const randomCode = Math.floor(Math.random() * (max - min + 1)) + min;
    const input = document.getElementById('product-code');
    if(input) input.value = randomCode;
    
    playScannerSound();
    setTimeout(() => { processReception({ code: randomCode.toString() }); }, 200);
}

const modalState = { type: null, subType: null, tempCode: null, tempProduct: null };

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
    const todayStr = getMSKDateString();
    const lastClearDate = localStorage.getItem('wb_pvz_lastHistoryClearDate');
    
    if (lastClearDate !== todayStr) {
        // Наступил новый день по МСК!
        localStorage.setItem('wb_pvz_lastHistoryClearDate', todayStr);
        
        // Очищаем дневные поставки, но receptionHistoryLog НЕ трогаем
        const userData = getUserData();
        userData.deliveries = null; 
        saveUserData(userData);
        
        // Перерисовываем UI. Функция отрисовки сама скроет старые товары.
        if (document.getElementById('reception-history-grid')) {
            renderReceptionHistory();
        }
        
        if(typeof window.generateDeliveriesForToday === 'function') window.generateDeliveriesForToday();
        if(typeof window.renderDeliveries === 'function') window.renderDeliveries();
    }
}

let lastProcessedCode = null;
let lastProcessedTime = 0;

function processReception(options = {}) {
    const input = document.getElementById('product-code');
    const code = options.code || (input ? input.value.trim() : '');

    // === БЛОКИРОВКА ДВОЙНЫХ СРАБАТЫВАНИЙ (DEBOUNCE) ===
    if (!code && !options.isNoBarcode) return;

    const now = Date.now();
    if (code && code === lastProcessedCode && (now - lastProcessedTime) < 800) {
        if (input && input.value !== '') {
            input.value = ''; // Очищаем поле от дублей
        }
        return; 
    }
    lastProcessedCode = code;
    lastProcessedTime = now;

    // Сразу очищаем инпут, чтобы сканер не считывал дубли
    if (input && input.value !== '') {
        input.value = '';
        input.focus();
    }
    // ===================================================

    if (code === 'brak_brak_') {
        document.getElementById('main-reception-container').style.display = 'none';
        
        const defectScreen = document.getElementById('desktop-defect-screen');
        if (defectScreen) {
            defectScreen.style.display = 'flex';
            
            const defectInput = document.getElementById('defect-product-code');
            if (defectInput) {
                defectInput.value = '';
                defectInput.focus();
            }
        }
        return;
    }

    let isValidCode = /^\d{10}$/.test(code);

    if (!options.isNoBarcode && !options.code && !isValidCode) { 
        showAlert(`Введите 10-значный код товара`, true);
        return; 
    }
    
    setTimeout(() => {
        if (Math.random() < 0.03) {
            playDeclineSound();
            showAlert('Излишек! Отсканируйте еще раз или перейдите в раздел Принять снова', true);
            return;
        }

        const userData = getUserData();
        const receptionItems = userData.receptionItems || [];
        const receptionHistory = userData.receptionHistoryLog || [];
        const existingItem = receptionItems.find(item => item.code === code);
        
        if (existingItem) {
            const actualCell = getActualCell(existingItem.cell, userData.cellChanges);
            speakNumber(actualCell).then(() => { 
                playSound('good_already_accepted.mp3'); 
            });
            showAlert(`Товар уже в ячейке ${parseInt(actualCell)}`, false);
            showMobileResult(existingItem, actualCell, true);
            return;
        }

        let assignedCell;
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
        receptionHistory.unshift(newItem); 
        
        if(receptionHistory.length > 50) receptionHistory.pop();
        
        userData.receptionItems = receptionItems;
        userData.receptionHistoryLog = receptionHistory;
        saveUserData(userData);
        
        renderReceptionHistory();
        showMobileResult(newItem, assignedCell, false);

    }, 150);
}

function showMobileResult(item, cell, isRepeat) {
    if (window.innerWidth > 768) return;
    
    const scanScreen = document.getElementById('m-scan-screen');
    const resScreen = document.getElementById('m-result-screen');
    
    scanScreen.style.display = 'none';
    resScreen.style.display = 'flex';

    document.getElementById('m-res-cell').textContent = parseInt(cell, 10);
    
    const sndBtn = document.getElementById('m-res-sound-btn');
    sndBtn.onclick = () => { speakNumber(cell).then(() => { playSound('good_already_accepted.mp3'); }); };

    const imgEl = document.getElementById('m-res-img');
    
    if (item.isAdult) {
        imgEl.src = 'adult.svg';
        imgEl.style.filter = 'blur(5px)';
    } else {
        imgEl.src = item.image || 'https://placehold.co/1200x800/png?text=No+Image';
        imgEl.style.filter = 'none';
    }

    const codeStr = item.code.toString();
    const codeFormatted = codeStr.length >= 4 ? `${codeStr.slice(0, -4)} <b>${codeStr.slice(-4)}</b>` : `<b>${codeStr}</b>`;
    document.getElementById('m-res-code').innerHTML = codeFormatted;
    
    const nameEl = document.getElementById('m-res-name');
    const brandEl = document.getElementById('m-res-brand');
    let fullName = item.name || '';
    
    let brandText = 'BRAND';
    let nameText = fullName;
    
    if (fullName.includes('/')) {
        const parts = fullName.split('/');
        brandText = parts[0].trim();
        nameText = parts.slice(1).join('/').trim(); 
    }
    
    brandEl.textContent = brandText;
    nameEl.textContent = nameText;
    
    document.getElementById('m-res-price').textContent = item.price ? `${item.price} BYN` : '';

    const defCheck = document.getElementById('m-res-defective-check');
    defCheck.checked = item.isDefective;
    
    defCheck.onclick = () => {
        const isDef = defCheck.checked;
        const userData = getUserData();
        
        const targetItem = userData.receptionItems.find(i => i.code === item.code);
        if(targetItem) {
            targetItem.isDefective = isDef;
            saveUserData(userData);
            renderReceptionHistory();
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
    
    // Получаем текущую дату по МСК
    const todayStr = getMSKDateString();
    
    // Фильтруем визуальное отображение - только товары, принятые СЕГОДНЯ по МСК
    const todayHistory = receptionHistory.filter(item => {
        if (!item.date) return false;
        return getMSKDateString(item.date) === todayStr;
    });
    
    const itemsToDisplay = todayHistory.slice(0, 3);

    // Если за сегодня еще не было сканирований — показываем заглушку
    if (itemsToDisplay.length === 0) {
        gridContainer.innerHTML = `
        <div class="empty-message" style="grid-column: 1 / -1; margin-top:20px; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%;">
            <img src="scan_qr.png" alt="Scan QR" style="width:120px; height:120px; object-fit:contain; margin-bottom:15px; opacity:0.8;">
            <div style="font-size:1.1rem; color:var(--text-primary-color); font-weight:500;">Начните процесс приемки, отсканировав QR-код на упаковке</div>
        </div>`;
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
        const codeFormatted = codeStr.length >= 4 ? `${codeStr.slice(0, -4)} <b>${codeStr.slice(-4)}</b>` : `<b>${codeStr}</b>`;
        
        const card = document.createElement('div');
        card.className = `reception-card-new ${styleClass}`;
        card.innerHTML = `
            ${item.isDefective ? '<div class="defective-diagonal-stripe"></div>' : ''}
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
        modalPrompt.textContent = 'Отсканируйте баркод или введите ШК баркода';
        linkAction.style.display = 'block';
        
        linkAction.onclick = () => {
            toggleModal('input-modal', false);
            moveToReturns({ isUnknown: true });
        };
    } else {
        modalTitle.textContent = 'ШК Поврежден';
        modalPrompt.textContent = 'Введите цифры под ШК';
        linkAction.style.display = 'none';
    }

    submitBtn.onclick = () => {
        const val = inputField.value.trim();
        
        if (val.length < 4) { 
            showAlert('Некорректный стикер или данные!', true); 
            return;
        }
        
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
    
    let dataSrc = productData;
    
    if (Math.random() < 0.04) dataSrc = adultProductData;
    
    const randomProduct = dataSrc[Math.floor(Math.random() * dataSrc.length)];
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
            name: 'Товар-излишек',
            image: 'box_delivery.svg',
            cell: '0',
            date: new Date().toISOString(),
            isDefective: (modalState.type === 'defective'), 
            confirmed: false
        };
    } else {
        newItem = {
            code: details.code || '?',
            name: details.name || 'Товар-излишек',
            image: details.image || 'box_delivery.svg',
            cell: '0',
            date: new Date().toISOString(),
            isDefective: (modalState.type === 'defective'),
            confirmed: false
        };
    }

    returnsItems.push(newItem);
    userData.returnsItems = returnsItems;
    saveUserData(userData);
    
    alert("Товар системно перемещен в раздел Возвраты. Поместите его в возвратную коробку как обычный товар.");
}