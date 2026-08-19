const firebaseConfig = {
    apiKey: "AIzaSyD_K-A6a0x6iRVPTdArVVBauLvMfhKCilM",
    authDomain: "wbpvz-d22a9.firebaseapp.com",
    databaseURL: "https://wbpvz-d22a9-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "wbpvz-d22a9",
    storageBucket: "wbpvz-d22a9.appspot.com",
    messagingSenderId: "226300786281",
    appId: "1:226300786281:web:5895daad84bfcb6b38d4f8"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const database = firebase.database();

let localUserCache = null;
window.appVoiceSettings = {
    cellsSpeed: localStorage.getItem('voiceSpeedCells') || '1.0',
    phrasesSpeed: localStorage.getItem('voiceSpeedPhrases') || '1.0',
    endIssueVoice: localStorage.getItem('voiceEndIssue') || '1'
};

const SPLASH_DURATION = 5000;
const splashStartTime = Date.now();
let isSplashDone = sessionStorage.getItem('splashShown') === 'true';

window.getMSKDate = function() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (3600 * 1000 * 3));
}

window.formatEpochToMSK = function(epochMs) {
    const d = new Date(epochMs);
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const mskDate = new Date(utc + (3600 * 1000 * 3));
    const dd = String(mskDate.getDate()).padStart(2, '0');
    const mm = String(mskDate.getMonth() + 1).padStart(2, '0');
    const yyyy = mskDate.getFullYear();
    const hh = String(mskDate.getHours()).padStart(2, '0');
    const min = String(mskDate.getMinutes()).padStart(2, '0');
    return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
}

window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
        showAlert('Скопировано!', false);
    }).catch(err => {
        console.error('Ошибка копирования', err);
    });
};

function waitForSplash(callback) {
    if (isSplashDone) {
        const splashScreen = document.getElementById('splash-screen');
        if (splashScreen) {
            splashScreen.style.display = 'none';
            splashScreen.classList.add('hidden');
        }
        callback();
        return;
    }
    const elapsed = Date.now() - splashStartTime;
    const remaining = SPLASH_DURATION - elapsed;
    
    if (remaining > 0) {
        setTimeout(() => { finishSplash(callback); }, remaining);
    } else {
        finishSplash(callback);
    }
}

function finishSplash(callback) {
    sessionStorage.setItem('splashShown', 'true');
    isSplashDone = true;
    const splashScreen = document.getElementById('splash-screen');
    if (splashScreen) {
        splashScreen.classList.add('hidden');
        setTimeout(() => {
            splashScreen.style.display = 'none';
            callback();
        }, 500);
    } else {
        callback();
    }
}

auth.onAuthStateChanged(async user => {
    const isAuthPage = window.location.pathname.includes('login.html') || window.location.pathname.includes('register.html');
    
    if (user) {
        const hasPvz = localStorage.getItem('savedPvzId');
        const hasManager = sessionStorage.getItem('currentManager');
        
        if (!hasPvz || !hasManager) {
            waitForSplash(() => {
                if (!isAuthPage) window.location.href = 'login.html';
            });
        } else {
            if (isAuthPage) {
                window.location.href = 'index.html';
            } else {
                try {
                    const cachedData = sessionStorage.getItem('userCache_' + user.uid);
                    if (cachedData) {
                        localUserCache = JSON.parse(cachedData);
                        cleanupOldHistory(user.uid); 
                    } else {
                        const userRef = database.ref('users/' + user.uid);
                        const snapshot = await userRef.once('value');
                        if (snapshot.exists()) {
                            localUserCache = snapshot.val();
                            sessionStorage.setItem('userCache_' + user.uid, JSON.stringify(localUserCache));
                            cleanupOldHistory(user.uid);
                        } else {
                            auth.signOut();
                        }
                    }
                } catch(e) { console.error("Ошибка синхронизации:", e); }
                
                waitForSplash(() => {
                    runAppLogic();
                });
            }
        }
    } else {
        waitForSplash(() => {
            if (!isAuthPage) window.location.href = 'login.html';
        });
    }
});

async function syncDataToFirebase(uid, userObject) {
    if (!uid || !userObject) return;
    try {
        await database.ref('users/' + uid).set(userObject);
        sessionStorage.setItem('userCache_' + uid, JSON.stringify(userObject));
        updateAllBadges();
    } catch (error) {
        console.error("Ошибка при сохранении данных:", error);
        showAlert("Не удалось сохранить данные на сервер", true);
    }
}

function cleanupOldHistory(uid) {
    if (!localUserCache || !localUserCache.data || !localUserCache.data.issuedHistory) return;
    const history = localUserCache.data.issuedHistory;
    const now = Date.now();
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    const cleanHistory = history.filter(entry => {
        const entryDate = new Date(entry.date).getTime();
        return (now - entryDate) < fourteenDaysMs;
    });
    if (cleanHistory.length !== history.length) {
        localUserCache.data.issuedHistory = cleanHistory;
        syncDataToFirebase(uid, localUserCache);
    }
}

window.getUserData = function() {
    if (!localUserCache) return {};
    if (typeof localUserCache.data === 'undefined') localUserCache.data = {};
    return localUserCache.data;
}

window.saveUserData = function(dataObject) {
    const uid = auth.currentUser ? auth.currentUser.uid : null;
    if (!uid || !localUserCache) return;
    localUserCache.data = dataObject;
    syncDataToFirebase(uid, localUserCache);
}

window.generateDeliveriesForToday = function() {
    const userData = getUserData();
    const mskNow = getMSKDate();
    const todayStr = mskNow.toISOString().split('T')[0];
    
    if (!userData.deliveries || userData.deliveries.date !== todayStr) {
        const deliveries = [];
        
        const makeEpochFromMSK = (h, m, addDays = 0) => {
            const d = getMSKDate();
            if (addDays > 0) d.setDate(d.getDate() + addDays);
            d.setUTCHours(h - 3, m, 0, 0); 
            return d.getTime();
        };

        const getRandomBetween = (startMs, endMs) => {
            return startMs + Math.floor(Math.random() * (endMs - startMs));
        };

        let arrNight = getRandomBetween(makeEpochFromMSK(0, 0), makeEpochFromMSK(4, 0));
        deliveries.push({ id: 'night', actArrive: arrNight, deadline: makeEpochFromMSK(10, 0), type: 'night', notified: false });

        if (Math.random() < 0.10) {
            let arrMorning = getRandomBetween(makeEpochFromMSK(9, 30), makeEpochFromMSK(10, 0));
            deliveries.push({ id: 'morning', actArrive: arrMorning, deadline: arrMorning + 3600000, type: 'morning', notified: false });
        }

        let arrDay1 = getRandomBetween(makeEpochFromMSK(13, 0), makeEpochFromMSK(14, 0));
        deliveries.push({ id: 'day1', actArrive: arrDay1, deadline: arrDay1 + 3600000, type: 'day1', notified: false });

        let arrDay2 = getRandomBetween(makeEpochFromMSK(16, 0), makeEpochFromMSK(18, 0));
        deliveries.push({ id: 'day2', actArrive: arrDay2, deadline: arrDay2 + 3600000, type: 'day2', notified: false });

        if (Math.random() < 0.05) {
            let arrLate = getRandomBetween(makeEpochFromMSK(20, 0), makeEpochFromMSK(22, 0));
            deliveries.push({ id: 'late', actArrive: arrLate, deadline: makeEpochFromMSK(10, 0, 1), type: 'late', notified: false });
        }

        userData.deliveries = { date: todayStr, list: deliveries };
        saveUserData(userData);
    }
    return userData.deliveries.list;
}

window.checkDeliveries = function() {
    const userData = getUserData();
    if (!userData.deliveries) return;
    const nowMs = Date.now();
    let changed = false;

    userData.deliveries.list.forEach(del => {
        if (nowMs >= del.actArrive && !del.notified) {
            del.notified = true;
            changed = true;
            window.addGlobalNotification('Поставки', 'Прибыла поставка! Не забудьте принять в течении указанного времени в разделе Приемка');
        }
    });
    if (changed) {
        saveUserData(userData);
        if (typeof window.renderDeliveries === 'function') window.renderDeliveries();
    }
}

window.renderDeliveries = function() {
    const listContainer = document.getElementById('delivery-time-list');
    if(!listContainer) return;
    const userData = getUserData();
    const deliveries = userData.deliveries ? userData.deliveries.list : [];
    const nowMs = Date.now();
    listContainer.innerHTML = '';
    
    const visibleDeliveries = deliveries.filter(del => nowMs >= del.actArrive);

    if(visibleDeliveries.length === 0) {
         listContainer.innerHTML = '<p style="text-align:center; color:var(--text-secondary-color);">Нет активных поставок</p>';
         return;
    }

    visibleDeliveries.sort((a,b) => a.actArrive - b.actArrive).forEach(del => {
        const isExpired = nowMs > del.deadline;

        let statusClass = 'active';
        if(isExpired) statusClass = 'expired';

        const iconColorClass = statusClass === 'active' ? 'active' : 'expired';
        
        let arriveStr = `${formatEpochToMSK(del.actArrive)}`;
        let deadlineStr = `${formatEpochToMSK(del.deadline)}`;

        listContainer.innerHTML += `
            <div class="delivery-item">
                <div class="delivery-icon-box ${iconColorClass}">
                    <i class="far fa-clock"></i>
                </div>
                <div class="delivery-info">
                    <div class="delivery-info-line">Принять до: ${deadlineStr}</div>
                    <div class="delivery-info-line" style="color:var(--text-secondary-color);">Время прибытия: ${arriveStr}</div>
                </div>
            </div>
        `;
    });
}

window.addGlobalNotification = function(title, text) {
    const userData = getUserData();
    if (!userData.notifications) userData.notifications = [];
    const newNotif = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        title: title,
        text: text,
        timestamp: new Date().toISOString()
    };
    userData.notifications.push(newNotif);
    saveUserData(userData);
    
    renderNotificationsList();
    updateBellIcon();

    let notifSound = document.getElementById('global-notif-sound');
    if (!notifSound) {
        notifSound = document.createElement('audio');
        notifSound.id = 'global-notif-sound';
        notifSound.src = 'notification_sound.mp3';
        notifSound.preload = 'auto';
        document.body.appendChild(notifSound);
    }
    notifSound.currentTime = 0;
    notifSound.play().catch(e => console.log('Audio error:', e));

    showAlert(`${title}: ${text}`, false);
};
window.removeNotification = function(id) {
    const userData = getUserData();
    if (!userData.notifications) return;
    userData.notifications = userData.notifications.filter(n => n.id !== id);
    saveUserData(userData);
    
    renderNotificationsList();
    updateBellIcon();
};
window.clearAllNotifications = function() {
    const userData = getUserData();
    userData.notifications = [];
    saveUserData(userData);
    
    renderNotificationsList();
    updateBellIcon();
};
window.updateBellIcon = function() {
    const icon = document.getElementById('header-bell-icon');
    if (!icon) return;
    
    const userData = getUserData();
    const hasUnread = userData.notifications && userData.notifications.length > 0;
    
    if (hasUnread) {
        icon.src = 'warning.svg';
        icon.style.filter = 'none';
    } else {
        icon.src = 'notification_bell.svg';
        icon.style.filter = 'grayscale(100%) opacity(60%)';
    }
};

window.renderNotificationsList = function() {
    const notifList = document.getElementById('notifications-list');
    if (!notifList) return;
    const userData = getUserData();
    const notifications = userData.notifications || [];
    
    notifList.innerHTML = '';
    if (notifications.length === 0) {
        notifList.innerHTML = '<div class="empty-message" style="text-align: center; color: var(--text-secondary-color); padding: 20px 0;"> Нет новых уведомлений</div>';
        return;
    }
    
    notifications.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).forEach(n => {
        const div = document.createElement('div');
        div.className = 'custom-notif-card';
        div.innerHTML = `
            <img src="warning.svg" class="custom-notif-icon" alt="Warning">
            <div class="custom-notif-body">
                <div class="custom-notif-title">${n.title}</div>
                <div class="custom-notif-text">${n.text}</div>
            </div>
            <button class="custom-notif-close" onclick="removeNotification('${n.id}')">&times;</button>
        `;
        notifList.appendChild(div);
    });
};

let isAppLogicRun = false;

function runAppLogic() {
    if (isAppLogicRun) return;
    isAppLogicRun = true;

    renderDesktopHeader();
    populateSharedElements();
    attachSharedEventListeners();
    updateAllBadges();
    
    generateDeliveriesForToday();
    setInterval(checkDeliveries, 10000); 
    renderNotificationsList();
    updateBellIcon();
    
    initFirebaseScannerBridge();
    
    const path = window.location.pathname;
    if ((path.endsWith('/') || path.includes('index.html')) && typeof initIndexPage === 'function') initIndexPage();
    else if (path.includes('p.html') && typeof initPriemkaTovaryPage === 'function') initPriemkaTovaryPage();
    else if (path.includes('returns.html') && typeof initVozvratTovaryPage === 'function') initVozvratTovaryPage();
    else if (path.includes('r2.html') && typeof initVozvratKorobkiPage === 'function') initVozvratKorobkiPage();
    else if (path.includes('r3.html') && typeof initVozvratUtilPage === 'function') initVozvratUtilPage();
    else if (path.includes('r4.html') && typeof initVozvratUtilPage === 'function') initVozvratUtilPage();
    else if (path.includes('fines.html') && typeof initFinesPage === 'function') initFinesPage();
    else if (path.includes('rating.html') && typeof initRatingPage === 'function') initRatingPage();
    else if (path.includes('box_stats.html') && typeof initBoxStatsPage === 'function') initBoxStatsPage();
    else if (path.includes('p2.html') && typeof initPriemkaSmenaYacheykiPage === 'function') initPriemkaSmenaYacheykiPage();
    else if (path.includes('p3.html') && typeof initPriemkaPovtornayaPage === 'function') initPriemkaPovtornayaPage();
}

function renderDesktopHeader() {
    const headerContainer = document.getElementById('desktop-header-container');
    if (!headerContainer) return;

    const currentPath = window.location.pathname;
    const isIndex = currentPath.endsWith('/') || currentPath.includes('index.html');
    const isP = currentPath.includes('p.html') || currentPath.includes('p2.html') || currentPath.includes('p3.html');
    const isReturns = currentPath.includes('returns.html') || currentPath.includes('r2.html') || currentPath.includes('r3.html') || currentPath.includes('r4.html');
    const isMore = currentPath.includes('more.html');
    headerContainer.innerHTML = `
        <div class="header-left-controls">
            <div class="toolbar-btn" id="burger-menu" title="Меню"><img src="points_menu.svg" alt="Меню" class="header-icon"></div>
            <div class="toolbar-btn" id="show-qr-btn" title="QR-код ПВЗ"><img src="delivery-qr-pvz_resized.svg" alt="QR ПВЗ" class="header-icon"></div>
            <div class="toolbar-btn" id="search-redirect-btn" title="Информация о товаре"><img src="search_loupe.svg" alt="Информация о товаре" class="header-icon"></div>
        </div>
        <nav class="main-nav">
            <div class="nav-center">
                <button class="nav-btn ${isIndex ? 'active' : ''}" onclick="location.href='index.html'">
                    <div class="nav-icon-wrapper">
                        <img src="delivery.svg" alt="Выдача" class="nav-icon">
                        <div class="nav-badge" id="order-count-badge" style="display: none;">0</div>
                    </div>
                    <span class="nav-text">Выдача</span>
                </button>
                <button class="nav-btn ${isP ? 'active' : ''}" onclick="location.href='p.html'">
                    <div class="nav-icon-wrapper">
                        <img src="accept.svg" alt="Приёмка" class="nav-icon">
                    </div>
                    <span class="nav-text">Приёмка</span>
                </button>
                <button class="nav-btn ${isReturns ? 'active' : ''}" onclick="location.href='returns.html'">
                    <div class="nav-icon-wrapper">
                        <img src="returns.svg" alt="Возврат" class="nav-icon">
                        <div class="nav-badge" id="returns-nav-badge" style="display: none;">0</div>
                    </div>
                    <span class="nav-text">Возврат</span>
                </button>
                <button class="nav-btn ${isMore ? 'active' : ''}" onclick="location.href='more.html'">
                    <div class="nav-icon-wrapper">
                        <img src="grid-cards.svg" alt="Еще" class="nav-icon">
                    </div>
                    <span class="nav-text">Еще</span>
                </button>
            </div>
        </nav>
        <div class="header-right-controls">
            <div class="toolbar-btn" id="notifications-btn" title="Уведомления"><img src="notification_bell.svg" alt="Уведомления" class="header-icon" id="header-bell-icon"></div>
            <div class="toolbar-btn" id="chat-bot-btn" title="Чат-бот помощник"><img src="chat.svg" alt="Чат-бот помощник" class="header-icon"></div>
            <div id="connection-status" title="Статус сканера"><i class="fas fa-barcode"></i></div>
        </div>
    `;
}

const onboardingItemsList = [
    { id: 'ob-issue', title: 'Выдача', text: 'Отсканируйте QR-код клиента или введите 4 цифры телефона и 6 цифр кода. Выберите товары для выдачи и нажмите "Выдать" или "Оплатить и выдать".' },
    { id: 'ob-reception', title: 'Приемка', text: 'Отсканируйте ШК товара. Программа сама назначит ячейку или вы можете положить в предложенную. Озвучка подскажет номер.' },
    { id: 'ob-rec-no-bc', title: 'Приемка без ШК', text: 'Если на товаре нет ШК или он поврежден, нажмите кнопку "Принять без ШК" (или через меню "Проблемы с QR"), введите код с упаковки или переместите товар в "Возвраты", выбрав соответствующую причину.' },
    { id: 'ob-cell-change', title: 'Смена ячейки', text: 'Перейдите во вкладку "Смена ячейки", отсканируйте товар, выберите новую ячейку (из предложенных или введите вручную) и подтвердите перенос сканированием товаров из ячейки.' },
    { id: 'ob-returns', title: 'Возврат', text: 'Отказные товары попадают во вкладку "Возвраты -> Товары". Отсканируйте стикер возвратной коробки (вкладка Коробки), затем ШК товара, чтобы добавить его в коробку.' },
    { id: 'ob-ret-home', title: 'Возврат из дома', text: 'В разделе Возвраты нажмите "Возврат от клиента". Отсканируйте QR-код из приложения клиента, отсканируйте товар, проверьте статус (одобрено) и добавьте товар в коробку.' },
    { id: 'ob-ret-home-no-bc', title: 'Возврат из дома и товар без шк', text: 'Если при возврате от клиента ШК не читается, в модальном окне нажмите "На товаре нет ШК", выберите товар из истории клиента вручную и добавьте в возвратную коробку.' },
    { id: 'ob-util', title: 'Утилизация', text: 'Перейдите во вкладку "Утиль". Отказные товары, хранящиеся в ПВЗ более 14 дней, появляются здесь. Нажмите "Утилизировать все" для удаления их из базы и подготовки к вывозу.' },
    { id: 'ob-defect', title: 'Отметка о браке', text: 'При приемке нажмите "Принять с браком". Либо в карточке товара на выдаче/возврате нажмите кнопку "Брак". При оформлении возврата бракованного товара потребуется заполнить форму с 4 фото и указанием причины.' },
    { id: 'ob-info', title: 'Информация о товаре', text: 'Нажмите на иконку Поиска (лупа) в верхней панели или в боковом меню. Отсканируйте ШК товара, чтобы узнать его текущий статус, ячейку и историю операций в ПВЗ.' },
    { id: 'ob-repack', title: 'Переупаковка', text: 'При обработке возврата выберите подходящий сейф-пакет (маленький, средний, большой или без пакета), отсканируйте новый стикер ПВЗ и привяжите его к товару в программе.' },
    { id: 'ob-cardboard', title: 'Возврат картона', text: 'Перейдите во вкладку "Возвраты -> Картон", отсканируйте ШК новой пустой коробки, укажите количество сложенного в неё картона (до 16 единиц) и закройте коробку.' }
];

function initSharedCountrySelector(wrapperId) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
    
    const selector = wrapper.querySelector('.custom-country-selector');
    const selectedFlag = wrapper.querySelector('.flag-img');
    const list = wrapper.querySelector('.country-dropdown-list');
    const prefixSpan = wrapper.querySelector('.phone-prefix');
    const phoneInput = wrapper.querySelector('.phone-input');

    selector.addEventListener('click', (e) => {
        list.classList.toggle('show');
        e.stopPropagation();
    });

    document.addEventListener('click', () => {
        list.classList.remove('show');
    });

    list.querySelectorAll('li').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const code = item.getAttribute('data-code');
            const prefix = item.getAttribute('data-prefix');
            const length = item.getAttribute('data-length');
            const imgSrc = item.getAttribute('data-img');

            phoneInput.dataset.countryCode = code;
            selectedFlag.src = imgSrc;
            prefixSpan.textContent = prefix;
            if(length) phoneInput.maxLength = length;
            phoneInput.value = '';
            phoneInput.focus();

            list.classList.remove('show');
        });
    });
}

function populateSharedElements() {
    const currentUserInfo = localUserCache ? localUserCache.pvzInfo : {};
    const currentPvzId = localStorage.getItem('savedPvzId');
    const currentRole = sessionStorage.getItem('currentManagerRole') || 'employee';
    
    let activePvz = {};
    if (currentUserInfo) {
        if (Array.isArray(currentUserInfo)) {
            activePvz = currentUserInfo.find(p => p.pvzId === currentPvzId) || currentUserInfo[0] || {};
        } else if (currentUserInfo.pvzId) {
            activePvz = currentUserInfo;
        } else {
            const pvzArray = Object.values(currentUserInfo);
            activePvz = pvzArray.find(p => p.pvzId === currentPvzId) || pvzArray[0] || {};
        }
    }

    const userPvzId = activePvz.pvzId || '?';
    const userAddress = activePvz.address || '?';
    const userEmployeeId = sessionStorage.getItem('currentManagerId') || activePvz.employeeId || '?';
    const currentManager = sessionStorage.getItem('currentManager') || 'Сотрудник';
    const userEmail = activePvz.email || (localUserCache && localUserCache.email ? localUserCache.email : 'N/A');
    const userPhone = activePvz.phone || (localUserCache && localUserCache.phone ? localUserCache.phone : 'N/A');

    document.querySelectorAll('.sidebar-version').forEach(div => {
        if(div) div.innerHTML = `ID ${userPvzId}<br>v1.5.1`;
    });
    
    document.querySelectorAll('.sidebar-logo').forEach(logo => {
        if (!logo.querySelector('.sidebar-divider')) {
            const divider = document.createElement('hr');
            divider.className = 'sidebar-divider';
            logo.appendChild(divider);
        }
    });

    const helpMenu = document.getElementById('help-menu');
    if (helpMenu) {
        helpMenu.innerHTML = `
        <div class="help-menu-content">
            <div class="help-header" style="justify-content: flex-end; margin-bottom: 10px;">
                <button class="icon-btn" id="close-help-btn" style="color: var(--gray-dark); font-size: 1.8rem; background: transparent; border: none; cursor: pointer;">&times;</button>
            </div>
            <div class="pvz-info" style="background: transparent; padding: 0; border: none;">
                <div class="menu-info-row">
                    <div class="menu-info-text"><strong>ID ПВЗ:</strong> <span id="menu-pvz-id">${userPvzId}</span></div>
                    <button class="menu-copy-btn" onclick="copyToClipboard('ID ПВЗ: ${userPvzId}')" title="Копировать"><img src="copy.svg" alt="Copy"></button>
                </div>
                <div class="menu-info-row">
                    <div class="menu-info-text" title="${userAddress}"><strong>Адрес:</strong> <span id="menu-pvz-address">${userAddress}</span></div>
                    <button class="menu-copy-btn" onclick="copyToClipboard('${userAddress}')" title="Копировать"><img src="copy.svg" alt="Copy"></button>
                </div>
                <div class="menu-info-row">
                    <div class="menu-info-text"><strong>ID сотрудника:</strong> <span id="menu-emp-id">${userEmployeeId}</span></div>
                    <button class="menu-copy-btn" onclick="copyToClipboard('${userEmployeeId}')" title="Копировать"><img src="copy.svg" alt="Copy"></button>
                </div>
            </div>
            <hr class="menu-divider" style="margin: 15px 0;">
            <button class="menu-button" onclick="location.href='search.html'">
                <img src="search_loupe.svg" class="menu-icon-svg" alt="" style="width: 20px; height: 20px; filter: grayscale(100%); opacity: 0.7; margin-right: 10px;"> Информация о товаре
            </button>
            <hr class="menu-divider" style="margin: 15px 0;">
            <div class="onboarding-accordion">
                <button class="menu-button onboarding-header" style="margin-top: 0;">
                    <img src="onboarding.svg" class="menu-icon-svg" alt="" style="width: 20px; height: 20px; margin-right: 10px;">
                    <span style="flex-grow: 1; text-align: left; font-weight: 600;">Как работать с программой</span>
                    <i class="fas fa-chevron-down onboarding-chevron" style="transition: transform 0.2s;"></i>
                </button>
                <div class="onboarding-content" style="display: none; flex-direction: column; gap: 5px; padding: 10px 5px 0 5px;">
                    ${onboardingItemsList.map(item => `
                        <div class="onboarding-item" data-id="${item.id}">
                            <img src="success.svg" alt="+" style="width: 18px; height: 18px; flex-shrink: 0;">
                            <span style="font-size: 0.95rem; color: var(--text-primary-color);">${item.title}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            <button class="menu-button" id="settings-menu-btn">
                <img src="set.svg" class="menu-icon-svg" alt="" style="width: 20px; height: 20px; margin-right: 10px;"> Настройки
            </button>
            <button class="menu-button" onclick="location.href='register_rools.html'">
                <img src="scanner.svg" class="menu-icon-svg" alt="" style="width: 20px; height: 20px; margin-right: 10px;"> Регистрация рулонов с наклейками
            </button>
            <button class="menu-button" id="leave-feedback-btn-menu">
                <img src="star.svg" class="menu-icon-svg" alt="" style="width: 20px; height: 20px; margin-right: 10px;"> Оставить отзыв
            </button>
            <hr class="menu-divider" style="margin: 15px 0;">
            <div class="onboarding-accordion custom-accordion">
                <button class="menu-button custom-accordion-header" style="margin-top: 0;">
                    <img src="like.svg" class="menu-icon-svg" alt="" style="width: 20px; height: 20px; margin-right: 10px;">
                    <span style="flex-grow: 1; text-align: left; font-weight: 600;">Полезные ссылки</span>
                    <i class="fas fa-chevron-down custom-accordion-chevron" style="transition: transform 0.2s;"></i>
                </button>
                <div class="custom-accordion-content" style="display: none; flex-direction: column; gap: 5px; padding: 10px 5px 0 5px;">
                    <div class="onboarding-item" onclick="window.open('https://pvz.wb.ru/', '_blank')">
                        <img src="home2.svg" alt="" style="width: 18px; height: 18px; flex-shrink: 0; filter: grayscale(100%); opacity: 0.6; margin-right: 10px;">
                        <span style="font-size: 0.95rem; color: var(--text-primary-color);">Промо-сайт WB ПВЗ</span>
                    </div>
                    <div class="onboarding-item" onclick="window.open('https://t.me/s/wbpvzlearning', '_blank')">
                        <img src="info.svg" alt="" style="width: 18px; height: 18px; flex-shrink: 0; margin-right: 10px;">
                        <span style="font-size: 0.95rem; color: var(--text-primary-color);">Новостной канал</span>
                    </div>
                </div>
            </div>
            <hr class="menu-divider" style="margin: 15px 0;">
            <div class="onboarding-accordion custom-accordion">
                <button class="menu-button custom-accordion-header" style="margin-top: 0;">
                    <img src="dots.svg" class="menu-icon-svg" alt="" style="width: 20px; height: 20px; margin-right: 10px;">
                    <span style="flex-grow: 1; text-align: left; font-weight: 600;">Дополнительный функционал</span>
                    <i class="fas fa-chevron-down custom-accordion-chevron" style="transition: transform 0.2s;"></i>
                </button>
                <div class="custom-accordion-content" style="display: none; flex-direction: column; gap: 5px; padding: 10px 5px 0 5px;">
                    ${currentRole === 'owner' ? `
                    <div class="onboarding-item" id="manage-employees-btn">
                        <img src="user.svg" alt="" style="width: 18px; height: 18px; flex-shrink: 0; margin-right: 10px;">
                        <span style="font-size: 0.95rem; color: var(--text-primary-color);">Управление сотрудниками</span>
                    </div>` : ''}
                    <div class="onboarding-item" id="scanner-settings-btn">
                        <img src="scanner-set.svg" alt="" style="width: 18px; height: 18px; flex-shrink: 0; margin-right: 10px;">
                        <span style="font-size: 0.95rem; color: var(--text-primary-color);">Работа со сканером</span>
                    </div>
                </div>
            </div>
            <hr class="menu-divider" style="margin: 15px 0;">
            <button class="menu-button" id="exit-btn" style="color: var(--error);">
                <img src="log-out.svg" class="menu-icon-svg" alt="" style="width: 20px; height: 20px; margin-right: 10px;"> Выйти
            </button>
        </div>`;
    }

    if (currentRole === 'owner' && !document.getElementById('employee-management-modal')) {
        const empModal = document.createElement('div');
        empModal.id = 'employee-management-modal';
        empModal.className = 'fullscreen-modal';
        empModal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <button class="close-modal-btn">&times;</button>
            <h2>Управление сотрудниками</h2>
            <button class="primary-btn full-width-btn" id="add-employee-trigger" style="margin-bottom: 15px;"><i class="fas fa-user-plus"></i> Добавить сотрудника</button>
            <div id="employee-list-container" class="employee-list"></div>
        </div>`;
        document.body.appendChild(empModal);

        const empFormModal = document.createElement('div');
        empFormModal.id = 'employee-form-modal';
        empFormModal.className = 'fullscreen-modal';
        empFormModal.innerHTML = `
        <div class="modal-content" style="max-width: 500px; text-align: left;">
            <button class="close-modal-btn">&times;</button>
            <h2 id="emp-form-title" style="margin-bottom: 20px;">Добавить сотрудника</h2>
            <input type="hidden" id="emp-edit-id">
            <div class="input-group"><div class="phone-input-wrapper"><input type="text" id="emp-last-name" placeholder="Фамилия" required></div></div>
            <div class="input-group"><div class="phone-input-wrapper"><input type="text" id="emp-first-name" placeholder="Имя" required></div></div>
            <div class="input-group"><div class="phone-input-wrapper"><input type="text" id="emp-patronymic" placeholder="Отчество"></div></div>
            <div class="input-group"><label>Дата рождения</label><div class="phone-input-wrapper"><input type="date" id="emp-dob" required></div></div>
            <hr style="margin: 20px 0; border: none; border-top: 1px solid var(--border-color);">
            <h3 style="margin-bottom: 15px;">Контактные данные</h3>
            
            <div class="input-group">
                <div class="custom-phone-group" id="emp-phone-wrapper">
                    <div class="custom-country-selector">
                        <div class="selected-country">
                            <img class="flag-img" src="ru.svg" alt="flag">
                            <i class="fas fa-chevron-down"></i>
                        </div>
                        <ul class="country-dropdown-list">
                            <li data-code="7" data-prefix="+7" data-length="10" data-img="ru.svg"><img src="ru.svg" alt="ru"> <span>+7</span></li>
                            <li data-code="375" data-prefix="+375" data-length="9" data-img="by.svg"><img src="by.svg" alt="by"> <span>+375</span></li>
                            <li data-code="7" data-prefix="+7" data-length="10" data-img="kz.svg"><img src="kz.svg" alt="kz"> <span>+7</span></li>
                            <li data-code="374" data-prefix="+374" data-length="8" data-img="ar.svg"><img src="ar.svg" alt="ar"> <span>+374</span></li>
                            <li data-code="996" data-prefix="+996" data-length="9" data-img="kg.svg"><img src="kg.svg" alt="kg"> <span>+996</span></li>
                            <li data-code="998" data-prefix="+998" data-length="9" data-img="uz.svg"><img src="uz.svg" alt="uz"> <span>+998</span></li>
                            <li data-code="995" data-prefix="+995" data-length="9" data-img="ge.svg"><img src="ge.svg" alt="ge"> <span>+995</span></li>
                            <li data-code="992" data-prefix="+992" data-length="9" data-img="tj.svg"><img src="tj.svg" alt="tj"> <span>+992</span></li>
                            <li data-code="993" data-prefix="+993" data-length="8" data-img="tm.svg"><img src="tm.svg" alt="tm"> <span>+993</span></li>
                            <li data-code="994" data-prefix="+994" data-length="9" data-img="az.svg"><img src="az.svg" alt="az"> <span>+994</span></li>
                            <li data-code="90" data-prefix="+90" data-length="10" data-img="tr.svg"><img src="tr.svg" alt="tr"> <span>+90</span></li>
                            <li data-code="972" data-prefix="+972" data-length="9" data-img="iz.svg"><img src="iz.svg" alt="iz"> <span>+972</span></li>
                            <li data-code="380" data-prefix="+380" data-length="9" data-img="ua.svg"><img src="ua.svg" alt="ua"> <span>+380</span></li>
                            <li data-code="44" data-prefix="+44" data-length="10" data-img="uk.svg"><img src="uk.svg" alt="uk"> <span>+44</span></li>
                        </ul>
                    </div>
                    
                    <div class="phone-input-wrapper">
                        <span class="phone-prefix">+7</span>
                        <input type="tel" class="phone-input" id="emp-phone" required inputmode="numeric" placeholder="Телефон" data-country-code="7" maxlength="10">
                    </div>
                </div>
            </div>

            <!-- E-MAIL СДЕЛАН ОБЯЗАТЕЛЬНЫМ (required) -->
            <div class="input-group">
                <div class="phone-input-wrapper">
                    <input type="email" id="emp-email" placeholder="E-mail" required>
                </div>
            </div>

            <div class="input-group">
                <label>Кем является:</label>
                <div class="custom-form-select" id="emp-role-wrapper">
                    <span class="selected-val" id="emp-role-selected-text">Менеджер</span>
                    <i class="fas fa-chevron-down"></i>
                    <ul class="custom-select-dropdown" id="emp-role-dropdown">
                        <li data-value="employee">Менеджер</li>
                        <li data-value="owner">Собственник ПВЗ</li>
                    </ul>
                </div>
                <input type="hidden" id="emp-role" value="employee">
            </div>
            <button class="primary-btn full-width-btn" id="save-employee-btn" style="margin-top: 10px;">Сохранить</button>
        </div>`;
        document.body.appendChild(empFormModal);
        
        setupCustomRoleSelector();
        initSharedCountrySelector('emp-phone-wrapper');
    }

    if (!document.getElementById('logout-choice-modal')) {
        const logoutModal = document.createElement('div');
        logoutModal.id = 'logout-choice-modal';
        logoutModal.className = 'fullscreen-modal';
        logoutModal.innerHTML = `
        <div class="modal-content">
            <button class="close-modal-btn">&times;</button>
            <h2>Выход</h2>
            <p>Выберите вариант выхода из системы:</p>
            <div class="modal-buttons-container">
                <button class="primary-btn" id="change-employee-btn">Сменить сотрудника</button>
                <button class="primary-btn" id="change-pvz-btn">Сменить ПВЗ</button>
                <button class="secondary-btn" id="full-logout-btn" style="color: var(--error); border-color: var(--error);">Выйти полностью</button>
            </div>
        </div>`;
        document.body.appendChild(logoutModal);
    }

    if (!document.getElementById('confirm-delete-modal')) {
        const delModal = document.createElement('div');
        delModal.id = 'confirm-delete-modal';
        delModal.className = 'fullscreen-modal';
        delModal.innerHTML = `
        <div class="modal-content">
            <h2>Удаление сотрудника</h2>
            <p>Вы уверены, что хотите удалить этого сотрудника?</p>
            <div class="modal-buttons-container">
                <button class="secondary-btn" id="cancel-delete-btn">Отмена</button>
                <button class="primary-btn" id="confirm-delete-action-btn" style="background: var(--error);">Да, удалить</button>
            </div>
        </div>`;
        document.body.appendChild(delModal);
    }

    if (!document.getElementById('notifications-modal')) {
        const notifModal = document.createElement('div');
        notifModal.id = 'notifications-modal';
        notifModal.className = 'fullscreen-modal';
        notifModal.innerHTML = `
            <div class="modal-content" style="max-width: 500px; text-align: left;">
                <button class="close-modal-btn">&times;</button>
                <h2 style="margin-bottom: 20px;">Уведомления</h2>
                <div id="notifications-list"></div>
                <button id="clear-notifications-btn" class="secondary-btn full-width-btn" style="margin-top: 20px;" onclick="clearAllNotifications()">Стереть все</button>
            </div>
        `;
        document.body.appendChild(notifModal);
    }

    if (!document.getElementById('chat-bot-panel')) {
        const chatPanel = document.createElement('div');
        chatPanel.id = 'chat-bot-panel';
        chatPanel.className = 'chat-bot-panel';
        chatPanel.innerHTML = `
            <div class="chat-header">
                <h2>Чат-бот помощник</h2>
                <button class="close-chat-btn" id="close-chat-btn">&times;</button>
            </div>
            <div class="chat-messages" id="chat-messages-container">
                <div class="chat-message bot">Привет! Я твой виртуальный помощник. Выбери нужную тему ниже.</div>
            </div>
            <div class="chat-options">
                <button class="chat-option-btn" data-question="Как принимать товар">Как принимать товар</button>
                <button class="chat-option-btn" data-question="Как выдать заказ">Как выдать заказ</button>
                <button class="chat-option-btn" data-question="Как оформить возврат">Как оформить возврат</button>
            </div>
        `;
        document.body.appendChild(chatPanel);
    }

    if (!document.getElementById('onboarding-detail-modal')) {
        const obModal = document.createElement('div');
        obModal.id = 'onboarding-detail-modal';
        obModal.className = 'fullscreen-modal';
        obModal.style.zIndex = '10005';
        obModal.innerHTML = `
            <div class="modal-content" style="max-width: 500px; text-align: left;">
                <button class="close-modal-btn">&times;</button>
                <h2 id="ob-modal-title" style="margin-bottom: 15px; color: var(--primary);"></h2>
                <p id="ob-modal-text" style="font-size: 1.05rem; line-height: 1.5; color: var(--text-primary-color);"></p>
                <button class="primary-btn full-width-btn close-ob-btn" style="margin-top: 20px;">Понятно</button>
            </div>
        `;
        document.body.appendChild(obModal);
    }

    if (!document.getElementById('settings-modal')) {
        const setModal = document.createElement('div');
        setModal.id = 'settings-modal';
        setModal.className = 'fullscreen-modal';
        setModal.style.zIndex = '10005';
        setModal.innerHTML = `
        <div class="modal-content settings-modal-content">
            <button class="close-modal-btn">&times;</button>
            <h2>Голосовая озвучка</h2>
            <div class="settings-scroll-area">
                <div class="settings-horizontal-block">
                    <h3>Скорость воспроизведения озвучки</h3>
                    <div class="sliders-container">
                        <div class="slider-box">
                            <label>Ячейки</label>
                            <input type="range" id="cells-speed-slider" min="1" max="1.5" step="0.1" value="${window.appVoiceSettings.cellsSpeed}">
                            <span id="cells-speed-val">${Number(window.appVoiceSettings.cellsSpeed).toFixed(1)}x</span>
                        </div>
                        <div class="slider-box">
                            <label>Фразы</label>
                            <input type="range" id="phrases-speed-slider" min="1" max="1.5" step="0.1" value="${window.appVoiceSettings.phrasesSpeed}">
                            <span id="phrases-speed-val">${Number(window.appVoiceSettings.phrasesSpeed).toFixed(1)}x</span>
                        </div>
                    </div>
                </div>
                <h3>Кастомная озвучка</h3>
                <table class="custom-voice-table">
                    <thead>
                        <tr><th>Вид озвучки</th><th>Вариант</th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Окончание выдачи</td>
                            <td>
                                <div class="voice-select-wrapper">
                                    <select id="voice-end-issue-select" class="custom-form-select">
                                        <option value="1" ${window.appVoiceSettings.endIssueVoice === '1' ? 'selected' : ''}>Вариант 1</option>
                                        <option value="2" ${window.appVoiceSettings.endIssueVoice === '2' ? 'selected' : ''}>Вариант 2</option>
                                        <option value="3" ${window.appVoiceSettings.endIssueVoice === '3' ? 'selected' : ''}>Вариант 3</option>
                                    </select>
                                    <button class="play-voice-btn" data-sound="end-issue" title="Прослушать"><i class="fas fa-play"></i></button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="modal-buttons-container" style="flex-direction: row; gap: 15px; margin-top: 20px;">
                <button class="secondary-btn" id="reset-settings-btn" style="flex: 1; padding: 12px 10px;">Восстановить по умолчанию</button>
                <button class="primary-btn" id="save-settings-btn" style="flex: 1;">Сохранить</button>
            </div>
        </div>`;
        document.body.appendChild(setModal);
    }

    const qrModal = document.getElementById('qr-code-modal');
    if(qrModal) {
        qrModal.innerHTML = `<div class="modal-content"><button class="close-modal-btn">&times;</button><h2>QR-код пункта выдачи</h2><img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=PVZ_ID_${userPvzId}" alt="QR Code"><p>ID ПВЗ: ${userPvzId}</p></div>`;
    }

    const accountModal = document.getElementById('account-modal');
     if (accountModal) {
        accountModal.innerHTML = `<div class="modal-content" style="text-align: left;"><button class="close-modal-btn">&times;</button><h2><i class="fas fa-user-circle"></i> Данные аккаунта</h2><div class="pvz-info" style="padding: 0; background: none; border: none;"><p><strong>ID ПВЗ:</strong> ${userPvzId}</p><p><strong>Адрес:</strong> ${userAddress}</p><p><strong>ID Сотрудника:</strong> ${userEmployeeId}</p><p><strong>Текущий Менеджер:</strong> ${currentManager}</p><p><strong>Логин (Телефон):</strong> ${userPhone}</p><p><strong>Email:</strong> ${userEmail}</p></div></div>`;
    }
    
    let feedbackModal = document.getElementById('feedback-modal');
    if (!feedbackModal) {
        feedbackModal = document.createElement('div');
        feedbackModal.id = 'feedback-modal';
        feedbackModal.className = 'fullscreen-modal';
        document.body.appendChild(feedbackModal);
    }
    feedbackModal.innerHTML = `<div class="modal-content"><button class="close-modal-btn">&times;</button><h2>Оцените программу</h2><p>Пожалуйста, оставьте вашу оценку. Это поможет нам стать лучше.</p><div class="feedback-stars" id="feedback-stars-container"><span class="star" data-value="1"><i class="far fa-star"></i></span><span class="star" data-value="2"><i class="far fa-star"></i></span><span class="star" data-value="3"><i class="far fa-star"></i></span><span class="star" data-value="4"><i class="far fa-star"></i></span><span class="star" data-value="5"><i class="far fa-star"></i></span></div><textarea id="feedback-text" placeholder="Напишите ваш комментарий (необязательно)" style="width: 100%; min-height: 80px; margin-top: 10px; resize: vertical; padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);"></textarea><button id="send-feedback-btn" class="primary-btn" style="margin-top: 20px;" disabled>Отправить</button></div>`;
}

function setupCustomRoleSelector() {
    const wrapper = document.getElementById('emp-role-wrapper');
    const dropdown = document.getElementById('emp-role-dropdown');
    const selectedText = document.getElementById('emp-role-selected-text');
    const hiddenInput = document.getElementById('emp-role');
    if(!wrapper) return;
    wrapper.addEventListener('click', (e) => {
        dropdown.classList.toggle('show');
        e.stopPropagation();
    });
    document.addEventListener('click', () => { dropdown.classList.remove('show'); });
    dropdown.querySelectorAll('li').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const value = item.getAttribute('data-value');
            const text = item.textContent;
            selectedText.textContent = text;
            hiddenInput.value = value;
            dropdown.classList.remove('show');
        });
    });
}

function updateCustomRoleSelectorDisplay(value) {
    const selectedText = document.getElementById('emp-role-selected-text');
    const hiddenInput = document.getElementById('emp-role');
    if(!selectedText) return;
    hiddenInput.value = value;
    selectedText.textContent = value === 'owner' ? 'Собственник ПВЗ' : 'Менеджер';
}

function attachSharedEventListeners() {
    document.getElementById('burger-menu')?.addEventListener('click', () => toggleModal('help-menu', true));
    document.getElementById('close-help-btn')?.addEventListener('click', () => toggleModal('help-menu', false));
    document.getElementById('show-qr-btn')?.addEventListener('click', () => toggleModal('qr-code-modal', true));
    document.getElementById('search-redirect-btn')?.addEventListener('click', () => { window.location.href = 'search.html'; });
    document.getElementById('notifications-btn')?.addEventListener('click', () => {
        toggleModal('notifications-modal', true);
    });
    document.getElementById('chat-bot-btn')?.addEventListener('click', () => {
        document.getElementById('chat-bot-panel').classList.add('visible');
    });
    document.getElementById('close-chat-btn')?.addEventListener('click', () => {
        document.getElementById('chat-bot-panel').classList.remove('visible');
    });
    document.querySelectorAll('.chat-option-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const question = e.target.getAttribute('data-question');
            const chatContainer = document.getElementById('chat-messages-container');
            const userMsg = document.createElement('div');
            userMsg.className = 'chat-message user';
            userMsg.textContent = question;
            chatContainer.appendChild(userMsg);
            
            setTimeout(() => {
                const botMsg = document.createElement('div');
                botMsg.className = 'chat-message bot';
                if (question === 'Как принимать товар') {
                    botMsg.innerHTML = 'Перейдите в раздел <b>Приёмка</b>, сканируйте ШК товара. Программа озвучит ячейку.';
                } else if (question === 'Как выдать заказ') {
                    botMsg.innerHTML = 'В разделе <b>Выдача</b> отсканируйте QR клиента или введите код. Затем отсканируйте товары к выдаче, выдайте или отмените необходимые товары.';
                } else if (question === 'Как оформить возврат') {
                    botMsg.innerHTML = 'Перейдите в раздел <b>Возврат -> Товары</b>, найдите товар, затем в разделе Коробки. Отсканируйте товар, переупакуйте, наклейте и отсканируйте новый стикер';
                } else {
                    botMsg.innerHTML = 'Уточните ваш вопрос у собственника ПВЗ';
                }
                chatContainer.appendChild(botMsg);
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }, 500);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        });
    });

    const obHeader = document.querySelector('.onboarding-header');
    const obContent = document.querySelector('.onboarding-content');
    const obChevron = document.querySelector('.onboarding-chevron');
    if (obHeader && obContent && obChevron) {
        obHeader.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = obContent.style.display === 'none';
            obContent.style.display = isHidden ? 'flex' : 'none';
            obChevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
        });
    }

    document.querySelectorAll('.onboarding-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const titleElement = item.querySelector('span');
            if(!titleElement) return;
            const title = titleElement.textContent;
            const obData = onboardingItemsList.find(i => i.title === title);
            
            if (obData) {
                document.getElementById('ob-modal-title').textContent = obData.title;
                document.getElementById('ob-modal-text').innerHTML = obData.text; 
                toggleModal('onboarding-detail-modal', true);
            }
        });
    });
    document.querySelectorAll('.custom-accordion-header').forEach(header => {
        header.addEventListener('click', (e) => {
            e.stopPropagation();
            const content = header.nextElementSibling;
            const chevron = header.querySelector('.custom-accordion-chevron');
            if(content && chevron) {
                const isHidden = content.style.display === 'none';
                content.style.display = isHidden ? 'flex' : 'none';
                chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
            }
        });
    });
    const obModal = document.getElementById('onboarding-detail-modal');
    if (obModal) {
        obModal.querySelector('.close-modal-btn')?.addEventListener('click', () => toggleModal('onboarding-detail-modal', false));
        obModal.querySelector('.close-ob-btn')?.addEventListener('click', () => toggleModal('onboarding-detail-modal', false));
    }

    document.getElementById('settings-menu-btn')?.addEventListener('click', () => {
        toggleModal('help-menu', false);
        toggleModal('settings-modal', true);
    });
    document.getElementById('leave-feedback-btn-menu')?.addEventListener('click', () => {
        toggleModal('help-menu', false);
        toggleModal('feedback-modal', true);
    });
    const cellsSlider = document.getElementById('cells-speed-slider');
    const phrasesSlider = document.getElementById('phrases-speed-slider');
    const cellsVal = document.getElementById('cells-speed-val');
    const phrasesVal = document.getElementById('phrases-speed-val');
    const endIssueSelect = document.getElementById('voice-end-issue-select');
    if (cellsSlider && cellsVal) {
        cellsSlider.addEventListener('input', () => { cellsVal.textContent = parseFloat(cellsSlider.value).toFixed(1) + 'x'; });
    }
    if (phrasesSlider && phrasesVal) {
        phrasesSlider.addEventListener('input', () => { phrasesVal.textContent = parseFloat(phrasesSlider.value).toFixed(1) + 'x'; });
    }

    document.querySelectorAll('.play-voice-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const soundType = e.currentTarget.dataset.sound;
            console.log(`Играем звук: ${soundType}, вариант: ${endIssueSelect.value}, скорость: ${phrasesSlider.value}`);
            showAlert(`Воспроизведение звука (Вариант ${endIssueSelect.value})...`, false);
        });
    });
    document.getElementById('save-settings-btn')?.addEventListener('click', () => {
        const cSpeed = cellsSlider.value;
        const pSpeed = phrasesSlider.value;
        const eVoice = endIssueSelect.value;
        
        localStorage.setItem('voiceSpeedCells', cSpeed);
        localStorage.setItem('voiceSpeedPhrases', pSpeed);
        localStorage.setItem('voiceEndIssue', eVoice);
        
        window.appVoiceSettings = { cellsSpeed: cSpeed, phrasesSpeed: pSpeed, endIssueVoice: eVoice };
        showAlert('Настройки озвучки сохранены!', false);
        toggleModal('settings-modal', false);
    });
    document.getElementById('reset-settings-btn')?.addEventListener('click', () => {
        cellsSlider.value = '1.0'; cellsVal.textContent = '1.0x';
        phrasesSlider.value = '1.0'; phrasesVal.textContent = '1.0x';
        endIssueSelect.value = '1';
        
        localStorage.setItem('voiceSpeedCells', '1.0');
        localStorage.setItem('voiceSpeedPhrases', '1.0');
        localStorage.setItem('voiceEndIssue', '1');
        
        window.appVoiceSettings = { cellsSpeed: '1.0', phrasesSpeed: '1.0', endIssueVoice: '1' };
        showAlert('Настройки сброшены!', false);
    });
    document.getElementById('exit-btn')?.addEventListener('click', () => {
        const rememberMe = localStorage.getItem('rememberMe') === 'true';
        if (rememberMe) {
            toggleModal('help-menu', false);
            toggleModal('logout-choice-modal', true);
        } else {
            performFullLogout();
        }
    });
    document.getElementById('change-employee-btn')?.addEventListener('click', () => {
        sessionStorage.removeItem('currentManager');
        sessionStorage.removeItem('currentManagerId');
        sessionStorage.removeItem('currentManagerRole');
        window.location.href = 'login.html';
    });
    document.getElementById('change-pvz-btn')?.addEventListener('click', () => {
        localStorage.removeItem('savedPvzId');
        window.location.href = 'login.html';
    });
    document.getElementById('full-logout-btn')?.addEventListener('click', performFullLogout);
    
    document.getElementById('scanner-settings-btn')?.addEventListener('click', () => {
        toggleModal('help-menu', false);
        window.openScannerSetupModal();
    });
    document.getElementById('account-details-btn')?.addEventListener('click', () => { toggleModal('help-menu', false); toggleModal('account-modal', true); });
    document.getElementById('manage-employees-btn')?.addEventListener('click', () => {
        toggleModal('help-menu', false);
        toggleModal('employee-management-modal', true);
        loadEmployeesToModal();
    });
    document.getElementById('add-employee-trigger')?.addEventListener('click', () => {
        document.getElementById('emp-form-title').textContent = "Добавить сотрудника";
        document.getElementById('emp-edit-id').value = '';
        ['emp-last-name', 'emp-first-name', 'emp-patronymic', 'emp-dob', 'emp-phone', 'emp-email'].forEach(id => document.getElementById(id).value = '');
        updateCustomRoleSelectorDisplay('employee');
        toggleModal('employee-management-modal', false);
        toggleModal('employee-form-modal', true);
    });
    
    // --- ПРИВЯЗЫВАЕМ НОВУЮ ФУНКЦИЮ СОХРАНЕНИЯ СОТРУДНИКА ---
    document.getElementById('save-employee-btn')?.addEventListener('click', saveEmployeeData);

    document.querySelectorAll('.accordion-header').forEach(button => {
        button.addEventListener('click', (e) => {
            const currentItem = button.closest('.accordion-item');
            document.querySelectorAll('.accordion-item.open').forEach(openItem => {
                if (openItem !== currentItem) {
                    openItem.classList.remove('open');
                    openItem.querySelector('.accordion-content').style.maxHeight = '0';
                }
            });
            if (currentItem) {
                currentItem.classList.toggle('open');
                const content = currentItem.querySelector('.accordion-content');
                if (content) content.style.maxHeight = currentItem.classList.contains('open') ? content.scrollHeight + 'px' : '0';
            }
        });
    });
    document.querySelectorAll('[data-help-topic]').forEach(button => button.addEventListener('click', showHelpModal));
    document.querySelectorAll('.fullscreen-modal').forEach(modal => { modal.querySelector('.close-modal-btn')?.addEventListener('click', () => toggleModal(modal.id, false)); });
    
    document.getElementById('education-portal-btn')?.addEventListener('click', () => { window.open('https://pvz-learning.wb.ru/', '_blank'); });
    document.getElementById('main-page-link-btn')?.addEventListener('click', () => { window.open('https://pvz.wb.ru/', '_blank'); });
    document.getElementById('leave-feedback-btn')?.addEventListener('click', () => { toggleModal('help-menu', false); toggleModal('feedback-modal', true); });
    
    const starsContainer = document.getElementById('feedback-stars-container');
    const sendFeedbackBtn = document.getElementById('send-feedback-btn');
    let currentRating = 0;

    function updateStars(rating) {
        if (!starsContainer) return;
        starsContainer.querySelectorAll('.star').forEach(s => {
            const i = s.querySelector('i');
            if (parseInt(s.dataset.value) <= rating) { s.classList.add('selected'); i.classList.remove('far'); i.classList.add('fas'); } 
            else { s.classList.remove('selected'); i.classList.remove('fas'); i.classList.add('far'); }
        });
    }

    if (starsContainer) {
        const stars = starsContainer.querySelectorAll('.star');
        stars.forEach(star => { star.addEventListener('click', () => { currentRating = parseInt(star.dataset.value); if (sendFeedbackBtn) sendFeedbackBtn.disabled = false; updateStars(currentRating); }); });
    }

    if (sendFeedbackBtn) {
        sendFeedbackBtn.addEventListener('click', () => {
            const feedbackText = document.getElementById('feedback-text').value;
            toggleModal('feedback-modal', false);
            showAlert('Спасибо за ваш отзыв!', false);
            currentRating = 0; updateStars(0);
            if(document.getElementById('feedback-text')) document.getElementById('feedback-text').value = '';
            sendFeedbackBtn.disabled = true;
        });
    }
}

function performFullLogout() {
    const uid = auth.currentUser ? auth.currentUser.uid : null;
    if (uid) sessionStorage.removeItem('userCache_' + uid);
    localStorage.removeItem('savedPvzId');
    sessionStorage.removeItem('currentManager');
    sessionStorage.removeItem('currentManagerId');
    sessionStorage.removeItem('currentManagerRole');
    localStorage.removeItem('rememberMe');
    auth.signOut();
}

async function loadEmployeesToModal() {
    const uid = auth.currentUser.uid;
    const pvzId = localStorage.getItem('savedPvzId');
    if (!pvzId) return; 
    
    const container = document.getElementById('employee-list-container');
    container.innerHTML = '<div class="spinner" style="margin:20px auto;"></div>';
    try {
        const snap = await database.ref(`users/${uid}/employees/${pvzId}`).once('value');
        container.innerHTML = '';
        if (snap.exists()) {
            const emps = Object.values(snap.val());
            emps.forEach(emp => {
                const div = document.createElement('div');
                div.className = 'employee-item';
                div.innerHTML = `
                    <div class="emp-info">
                        <strong>${emp.lastName} ${emp.firstName} ${emp.patronymic || ''}</strong>
                        <span>${emp.role === 'owner' ? 'Собственник' : 'Менеджер'} | ${emp.phone}</span>
                    </div>
                    <div class="emp-actions">
                        <button class="icon-btn-small edit-emp" title="Редактировать"><i class="fas fa-edit"></i></button>
                        <button class="icon-btn-small del-emp" style="color:var(--error);" title="Удалить"><i class="fas fa-trash-alt"></i></button>
                    </div>
                `;
                div.querySelector('.edit-emp').onclick = () => editEmployee(emp);
                div.querySelector('.del-emp').onclick = () => showDeleteConfirmation(emp.id);
                container.appendChild(div);
            });
        } else {
            container.innerHTML = '<p>Сотрудники не найдены.</p>';
        }
    } catch (e) {
        container.innerHTML = '<p style="color:red;">Ошибка загрузки</p>';
    }
}

function editEmployee(emp) {
    document.getElementById('emp-form-title').textContent = "Редактировать сотрудника";
    document.getElementById('emp-edit-id').value = emp.id;
    document.getElementById('emp-last-name').value = emp.lastName || '';
    document.getElementById('emp-first-name').value = emp.firstName || '';
    document.getElementById('emp-patronymic').value = emp.patronymic || '';
    document.getElementById('emp-dob').value = emp.dob || '';
    document.getElementById('emp-email').value = emp.email || '';
    
    // --- Логика автоподбора телефона под кастомный селектор стран ---
    const phoneInput = document.getElementById('emp-phone');
    const selectedFlag = document.querySelector('#emp-phone-wrapper .flag-img');
    const prefixSpan = document.querySelector('#emp-phone-wrapper .phone-prefix');
    const listItems = document.querySelectorAll('#emp-phone-wrapper .country-dropdown-list li');
    
    let matched = false;
    if(emp.phone) {
        const sortedItems = Array.from(listItems).sort((a,b) => b.getAttribute('data-code').length - a.getAttribute('data-code').length);
        for(let item of sortedItems) {
            const code = item.getAttribute('data-code');
            if(emp.phone.startsWith(code)) {
                phoneInput.dataset.countryCode = code;
                if(selectedFlag) selectedFlag.src = item.getAttribute('data-img');
                if(prefixSpan) prefixSpan.textContent = item.getAttribute('data-prefix');
                if(item.getAttribute('data-length')) phoneInput.maxLength = item.getAttribute('data-length');
                phoneInput.value = emp.phone.substring(code.length);
                matched = true;
                break;
            }
        }
    }
    if(!matched) {
        phoneInput.dataset.countryCode = '7';
        if(selectedFlag) selectedFlag.src = 'ru.svg';
        if(prefixSpan) prefixSpan.textContent = '+7';
        phoneInput.maxLength = 10;
        phoneInput.value = emp.phone || '';
    }

    updateCustomRoleSelectorDisplay(emp.role || 'employee');
    toggleModal('employee-management-modal', false);
    toggleModal('employee-form-modal', true);
}

async function saveEmployeeData() {
    const uid = auth.currentUser.uid;
    const pvzId = localStorage.getItem('savedPvzId');
    if (!pvzId) {
        showAlert('Критическая ошибка: ID ПВЗ не определен. Перезайдите в систему.', true);
        return;
    }
    
    const idField = document.getElementById('emp-edit-id').value;
    const generatedId = Math.floor(100000000 + Math.random() * 900000000).toString();
    
    const phoneInputEl = document.getElementById('emp-phone');
    const countryCode = phoneInputEl.dataset.countryCode || '7';
    const phoneClean = phoneInputEl.value.replace(/\D/g, '');
    const fullPhone = countryCode + phoneClean;
    
    const empData = {
        id: idField || generatedId,
        lastName: document.getElementById('emp-last-name').value.trim(),
        firstName: document.getElementById('emp-first-name').value.trim(),
        patronymic: document.getElementById('emp-patronymic').value.trim(),
        dob: document.getElementById('emp-dob').value,
        phone: fullPhone,
        email: document.getElementById('emp-email').value.trim(),
        role: document.getElementById('emp-role').value
    };

    if (!empData.lastName || !empData.firstName || !phoneClean) {
        showAlert('Заполните обязательные поля (Фамилия, Имя, Телефон)', true);
        return;
    }

    try {
        // Получаем точный адрес текущего ПВЗ из кэша
        let pvzAddress = 'Адрес ПВЗ';
        if (localUserCache && localUserCache.pvzInfo) {
            const info = localUserCache.pvzInfo;
            if (Array.isArray(info)) {
                const found = info.find(p => p.pvzId === pvzId);
                if (found) pvzAddress = found.address;
            } else if (info.pvzId === pvzId) {
                pvzAddress = info.address;
            } else {
                const pvzArray = Object.values(info);
                const found = pvzArray.find(p => p.pvzId === pvzId);
                if (found) pvzAddress = found.address;
            }
        }

        // 1. СТРОГАЯ ПРОВЕРКА: У ПВЗ может быть только один собственник
        if (empData.role === 'owner') {
            const employeesSnap = await database.ref(`users/${uid}/employees/${pvzId}`).once('value');
            if (employeesSnap.exists()) {
                const employees = employeesSnap.val();
                for (const key in employees) {
                    if (employees[key].role === 'owner' && employees[key].id !== empData.id) {
                        showAlert('У этого ПВЗ уже есть собственник! У каждого ПВЗ может быть только один собственник.', true);
                        return;
                    }
                }
            }
        }

        const empRef = database.ref(`users/${uid}/employees/${pvzId}/${empData.id}`);
        const snap = await empRef.once('value');

        // 2. СТРОГАЯ ПРОВЕРКА: Запрет на понижение текущего собственника до менеджера
        if (empData.role === 'employee' && snap.exists()) {
            const oldData = snap.val();
            if (oldData.role === 'owner') {
                showAlert('Этот номер принадлежит собственнику ПВЗ! Вы не можете изменить его роль на менеджера.', true);
                return;
            }
        }

        const checkPhoneRef = await database.ref(`phoneIndex/${empData.phone}`).once('value');

        // Логика, если сотрудник — Собственник
        if (empData.role === 'owner') {
            if (checkPhoneRef.exists() && checkPhoneRef.val() !== uid && typeof checkPhoneRef.val() === 'string') {
                showAlert('Этот номер телефона уже привязан к другому ПВЗ!', true);
                return;
            }
            
            if (snap.exists()) {
                const oldData = snap.val();
                if (oldData.phone !== empData.phone && oldData.phone) {
                    await database.ref(`phoneIndex/${oldData.phone}`).remove();
                }
            }
            await database.ref(`phoneIndex/${empData.phone}`).set(uid);
            await database.ref(`users/${uid}/phone`).set(empData.phone);
        } 
        // Логика для обычного сотрудника (Менеджера)
        else {
            let phoneIndexData = {};
            if (checkPhoneRef.exists()) {
                const existingData = checkPhoneRef.val();
                // Блокируем попытку использовать номер, если он в системе числится за собственником
                if (typeof existingData === 'string') {
                    showAlert('Этот номер принадлежит собственнику ПВЗ! Используйте другой номер.', true);
                    return;
                }
                phoneIndexData = existingData;
            }

            // Удаляем привязку старого номера сотрудника, если он был изменен
            if (snap.exists()) {
                const oldData = snap.val();
                if (oldData.phone !== empData.phone && oldData.phone) {
                    await database.ref(`phoneIndex/${oldData.phone}/pvzs/${pvzId}`).remove();
                }
            }

            // Создаем структуру pvzs, если это первый ПВЗ для данного менеджера
            if (!phoneIndexData.pvzs) {
                phoneIndexData.pvzs = {};
            }
            
            // Добавляем текущий ПВЗ в список разрешенных для этого менеджера
            phoneIndexData.pvzs[pvzId] = {
                pvzId: pvzId,
                address: pvzAddress,
                uid: uid
            };

            // Обновляем общую базу для авторизации
            await database.ref(`phoneIndex/${empData.phone}`).update(phoneIndexData);
        }

        // Сохраняем карточку сотрудника в профиле владельца
        await database.ref(`users/${uid}/employees/${pvzId}/${empData.id}`).set(empData);
        
        showAlert('Сотрудник сохранен', false);
        toggleModal('employee-form-modal', false);
        toggleModal('employee-management-modal', true);
        loadEmployeesToModal();
    } catch (e) {
        showAlert('Ошибка сохранения: ' + e.message, true);
    }
}


function showDeleteConfirmation(empId) {
    toggleModal('confirm-delete-modal', true);
    const btnConfirm = document.getElementById('confirm-delete-action-btn');
    const btnCancel = document.getElementById('cancel-delete-btn');
    
    const newConfirm = btnConfirm.cloneNode(true);
    btnConfirm.parentNode.replaceChild(newConfirm, btnConfirm);
    const newCancel = btnCancel.cloneNode(true);
    btnCancel.parentNode.replaceChild(newCancel, btnCancel);
    
    newCancel.addEventListener('click', () => { toggleModal('confirm-delete-modal', false); });
    newConfirm.addEventListener('click', () => { 
        toggleModal('confirm-delete-modal', false); 
        executeDeleteEmployee(empId); 
    });
}

async function executeDeleteEmployee(empId) {
    const uid = auth.currentUser.uid;
    const pvzId = localStorage.getItem('savedPvzId');
    try {
        await database.ref(`users/${uid}/employees/${pvzId}/${empId}`).remove();
        showAlert('Сотрудник удален', false);
        loadEmployeesToModal();
    } catch (e) {
        showAlert('Ошибка удаления', true);
    }
}

function toggleModal(modalId, show) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    if (show) {
        if (modalId === 'help-menu') {
            modal.classList.add('visible');
        } else {
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('visible'), 10);
        }
    } else {
        if (modalId === 'help-menu') {
            modal.classList.remove('visible');
        } else {
            modal.classList.remove('visible');
            setTimeout(() => { modal.style.display = 'none'; }, 300);
            if (modalId === 'search-modal') {
                const searchInput = document.getElementById('search-item-code');
                const searchResult = document.getElementById('search-result-container');
                if (searchInput) searchInput.value = '';
                if (searchResult) searchResult.innerHTML = '';
            }
        }
    }
}

function showAlert(message, isError = false) {
    if (!isError) return;

    const existingAlert = document.querySelector('.alert-message');
    if (existingAlert) existingAlert.remove();

    const alert = document.createElement('div'); 
    alert.className = 'alert-message'; 
    
    alert.innerHTML = `
        <img src="error.svg" alt="Ошибка" class="alert-icon">
        <span class="alert-text">${message}</span>
    `;

    if (typeof playErrorSound === 'function') playErrorSound();
    
    document.body.appendChild(alert);
    
    setTimeout(() => { 
        if (document.body.contains(alert)) document.body.removeChild(alert); 
    }, 5000);
}

function showHelpModal(event) {
    const topic = event.currentTarget.dataset.helpTopic;
    const helpContent = {
        'issue': { title: 'Выдача', text: '1. Отсканируйте QR-код клиента или введите 4 цифры его телефона и 5 цифр кода из приложения.<br>2. Программа покажет ячейку и состав заказа.<br>3. Пройдите быструю проверку товаров (можно пропустить).<br>4. Выберите товары для выдачи. Вы можете снять выбор со-всех товаров, если клиент от всего отказывается.<br>5. Нажмите "Выдать".'},
        'reception': { title: 'Приёмка', text: '1. Перейдите в раздел Приёмка -> Товары.<br>2. Сканируйте ШК товаров. Система автоматически присвоит ячейку и озвучит её номер.<br>3. История последних принятых товаров отображается внизу экрана.'},
        'returns': { title: 'Возвраты', text: '1. Перейдите в Возврат -> Товары.<br>2. Здесь находятся все товары, от которых отказались клиенты.<br>3. Перейдите в раздел Коробки, выберите коробку и добавляйте туда товары для возврата.'},
    };
    const content = helpContent[topic];
    if (!content) return;
    let modal = document.getElementById('help-content-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'help-content-modal'; modal.className = 'fullscreen-modal';
        document.body.appendChild(modal);
    }
    modal.innerHTML = `<div class="modal-content" style="text-align: left;"><button class="close-modal-btn">&times;</button><h2>${content.title}</h2><p class="help-text" style="font-size: 1rem; line-height: 1.6;">${content.text}</p></div>`;
    modal.querySelector('.close-modal-btn').onclick = () => toggleModal('help-content-modal', false);
    toggleModal('help-content-modal', true);
}

function updateAllBadges() {
    const userData = getUserData();
    const activeOrders = userData.activeOrders || [];
    updateBadge('order-count-badge', activeOrders.length);
    const unprocessedReturns = (userData.returnsItems || []).filter(item => !item.confirmed);
    const allItems = userData.receptionItems || [];
    const fourteenDaysAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
    const itemsToDispose = allItems.filter(item => new Date(item.date).getTime() < fourteenDaysAgo);
    const unprocessedReturnsCount = unprocessedReturns.length;
    const itemsToDisposeCount = itemsToDispose.length;
    const totalReturnCount = unprocessedReturnsCount + itemsToDisposeCount;
    if (totalReturnCount > 0) { 
        const badgeText = `${unprocessedReturnsCount}/${itemsToDisposeCount}`;
        updateBadge('returns-nav-badge', badgeText);
    } else { 
        updateBadge('returns-nav-badge', 0);
    }
    updateBadge('returns-sidebar-badge', unprocessedReturnsCount);
    updateBadge('disposal-sidebar-badge', itemsToDisposeCount);
}

function updateBadge(badgeId, content) {
    const badge = document.getElementById(badgeId);
    if (badge) {
        const hasContent = (typeof content === 'number' && content > 0) || (typeof content === 'string' && content.length > 0 && content !== '0');
        if (hasContent) { 
            badge.textContent = content;
            badge.style.display = 'flex'; 
        } else { 
            badge.style.display = 'none';
        }
    }
}

const productData = [
    {
        "name": "City Umbrella/Зонт черный автомат антиветер",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol2129/part212953/212953101/images/big/1.webp",
        "price": 19.01,
        "size": "D купола 100 см",
        "color": "Черный",
        "packageContents": "Зонт, чехол",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/212953101/detail.aspx"
    },
    {
        "name": "ONE HOME/Кружка для чая и кофе керамическая 200мл",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol4687/part468792/468792941/images/big/1.webp",
        "price": 24.52,
        "size": "200 мл",
        "color": "Белый с рисунком",
        "packageContents": "Кружка керамическая",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/468792941/detail.aspx"
    },
    {
        "name": "DianaShop/рюкзак городской тканьевый школьный для повседневки",
        "image": "https://mns-basket-cdn-05.geobasket.net/vol3760/part376000/376000942/images/big/1.webp",
        "price": 27.17,
        "size": "40х30х15 см",
        "color": "Серый",
        "packageContents": "Рюкзак 1 шт.",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/376000942/detail.aspx"
    },
    {
        "name": "Цейс-видео/Флешка 128 гб usb 2.0 мини для компьютера красивая маленькая",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol3114/part311481/311481511/images/big/1.webp",
        "price": 24.95,
        "size": "128 ГБ",
        "color": "Серебристый",
        "packageContents": "USB-накопитель 1 шт.",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/311481511/detail.aspx"
    },
    {
        "name": "SmartX/Наушники беспроводные с микрофоном Pro 2",
        "image": "https://mns-basket-cdn-06.geobasket.net/vol4784/part478434/478434213/images/big/1.webp",
        "price": 47.61,
        "size": "Универсальный",
        "color": "Белый",
        "packageContents": "Наушники, зарядный кейс, кабель, амбушюры",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/478434213/detail.aspx"
    },
    {
        "name": "Winnetou/Термос 1 литр с датчиком температуры, для чая и кофе",
        "image": "https://mns-basket-cdn-06.geobasket.net/vol3673/part367356/367356138/images/big/1.webp",
        "price": 60.13,
        "size": "1 л",
        "color": "Черный",
        "packageContents": "Термос 1 шт.",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/367356138/detail.aspx"
    },
    {
        "name": "ТВОЕ/Плотная базовая классическая футболка",
        "image": "https://mns-basket-cdn-06.geobasket.net/vol2403/part240385/240385498/images/hq/1.webp",
        "price": 19.25,
        "size": "M (46)",
        "color": "Белый",
        "packageContents": "Футболка 1 шт.",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/240385498/detail.aspx"
    },
    {
        "name": "BAASPLOA/Кроссовки летние дышащие сетка для бега и зала",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol6586/part658634/658634206/images/big/1.webp",
        "price": 275.04,
        "size": "42",
        "color": "Серый",
        "packageContents": "Кроссовки 1 пара, фирменная коробка",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/658634206/detail.aspx"
    },
    {
        "name": "ILUUS/Солнцезащитные очки квадратные",
        "image": "https://mns-basket-cdn-05.geobasket.net/vol2239/part223976/223976992/images/big/1.webp",
        "price": 3.88,
        "size": "Универсальный",
        "color": "Черный",
        "packageContents": "Очки, салфетка для стекол",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/223976992/detail.aspx"
    },
    {
        "name": "PROFIT/Смарт часы умные Smart Watch 10 оригинал",
        "image": "https://mns-basket-cdn-02.geobasket.net/vol3319/part331961/331961479/images/big/1.webp",
        "price": 59.66,
        "size": "Универсальный",
        "color": "Черный",
        "packageContents": "Смарт-часы, ремешок, магнитная зарядка",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/331961479/detail.aspx"
    },
    {
        "name": "GEMBIRD/Клавиатура игровая с подсветкой круглые клавиши",
        "image": "https://mns-basket-cdn-05.geobasket.net/vol126/part12620/12620087/images/big/1.webp",
        "price": 23.37,
        "size": "Стандартный",
        "color": "Черный",
        "packageContents": "Клавиатура проводная 1 шт.",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/12620087/detail.aspx"
    },
    {
        "name": "HerLer/Мышь беспроводная бесшумная с аккумулятором и подсветкой",
        "image": "https://mns-basket-cdn-06.geobasket.net/vol1556/part155604/155604983/images/big/1.webp",
        "price": 11.15,
        "size": "Универсальный",
        "color": "Белый",
        "packageContents": "Мышь, USB-ресивер, кабель зарядки",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/155604983/detail.aspx"
    },
    {
        "name": "GameTime/Игровая приставка для телевизора смарт консоль game stick",
        "image": "https://mns-basket-cdn-02.geobasket.net/vol3293/part329363/329363084/images/big/1.webp",
        "price": 111.22,
        "size": "Компактный",
        "color": "Черный",
        "packageContents": "Консоль, 2 геймпада, кабель HDMI, кабель питания",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/329363084/detail.aspx"
    },
    {
        "name": "Красивый мир/Гидрогелевые патчи для глаз от отеков и мешков с золотом 24К",
        "image": "https://basket-24.wbbasket.ru/vol4222/part422273/422273330/images/big/1.webp",
        "price": 6.30,
        "size": "60 шт",
        "color": "Золотистый",
        "packageContents": "Банка с патчами, лопаточка",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/422273330/detail.aspx"
    },
    {
        "name": "BILBON/Тканевые маски для лица, набор 10 шт",
        "image": "https://basket-10.wbbasket.ru/vol1539/part153930/153930212/images/big/1.webp",
        "price": 10.27,
        "size": "10 шт",
        "color": "Разноцветный",
        "packageContents": "Набор масок 10 шт.",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/153930212/detail.aspx"
    },
    {
        "name": "MARKELL/Сыворотка для роста бровей и ресниц 10 мл",
        "image": "https://basket-28.wbbasket.ru/vol5434/part543460/543460737/images/big/1.webp",
        "price": 16.72,
        "size": "10 мл",
        "color": "Прозрачный",
        "packageContents": "Флакон с кисточкой",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/543460737/detail.aspx"
    },
    {
        "name": "Красотка/Бейби браш щеточки для ресниц и бровей",
        "image": "https://basket-18.wbbasket.ru/vol2969/part296932/296932598/images/big/1.webp",
        "price": 7.94,
        "size": "50 шт",
        "color": "Розовый",
        "packageContents": "Набор щеточек",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/296932598/detail.aspx"
    },
    {
        "name": "GreenEra/Твердый шампунь для роста и укрепления волос, от выпадения",
        "image": "https://mns-basket-cdn-02.geobasket.net/vol112/part11209/11209209/images/big/1.webp",
        "price": 16.41,
        "size": "50 гр",
        "color": "Зеленый",
        "packageContents": "Твердый брусок шампуня",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/11209209/detail.aspx"
    },
    {
        "name": "Fito Cosmetic/Увлажняющий бальзам для восстановления губ Пантенол форте 4г",
        "image": "https://mns-basket-cdn-03.geobasket.net/vol1483/part148370/148370930/images/big/1.webp",
        "price": 5.36,
        "size": "4 гр",
        "color": "Прозрачный",
        "packageContents": "Бальзам в стике",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/148370930/detail.aspx"
    },
    {
        "name": "A&O/Спонж мини для макияжа на кончик пальца",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol1830/part183083/183083556/images/big/1.webp",
        "price": 7.94,
        "size": "Мини",
        "color": "Розовый",
        "packageContents": "Спонж 1 шт.",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/183083556/detail.aspx"
    },
    {
        "name": "Гардероб Тим/Набор двусторонних кистей для макияжа",
        "image": "https://mns-basket-cdn-05.geobasket.net/vol4665/part466502/466502837/images/big/1.webp",
        "price": 28.35,
        "size": "Набор",
        "color": "Черный",
        "packageContents": "Кисти двусторонние",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/466502837/detail.aspx"
    },
    {
        "name": "MIZON/Пилинг для лица скатка яблочная",
        "image": "https://mns-basket-cdn-02.geobasket.net/vol2608/part260845/260845089/images/big/1.webp",
        "price": 56.16,
        "size": "100 мл",
        "color": "Зеленый",
        "packageContents": "Туба с пилингом",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/260845089/detail.aspx"
    },
    {
        "name": "LEMISA/Скраб для тела Кокос",
        "image": "https://mns-basket-cdn-06.geobasket.net/vol1826/part182667/182667948/images/big/1.webp",
        "price": 16.81,
        "size": "250 гр",
        "color": "Белый",
        "packageContents": "Банка со скрабом",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/182667948/detail.aspx"
    },
    {
        "name": "Secrets Lan/Дезодорант кристалл без запаха 2 шт",
        "image": "https://mns-basket-cdn-02.geobasket.net/vol1545/part154528/154528069/images/big/1.webp",
        "price": 12.81,
        "size": "2 шт",
        "color": "Прозрачный",
        "packageContents": "Дезодорант кристалл 2 шт.",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/154528069/detail.aspx"
    },
    {
        "name": "E-COSMETIC/Шампунь для волос OLLIN CARE ежедневный уход 1000 мл",
        "image": "https://mns-basket-cdn-06.geobasket.net/vol296/part29611/29611773/images/big/1.webp",
        "price": 40.84,
        "size": "1000 мл",
        "color": "Белый",
        "packageContents": "Флакон с дозатором",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/29611773/detail.aspx"
    },
    {
        "name": "Я Самая/Ватные диски 600 шт с веревочкой (5уп по 120шт)",
        "image": "https://mns-basket-cdn-02.geobasket.net/vol275/part27541/27541349/images/big/1.webp",
        "price": 18.78,
        "size": "600 шт",
        "color": "Белый",
        "packageContents": "Упаковки по 120шт - 5 шт.",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/27541349/detail.aspx"
    },
    {
        "name": "ECOLIVE/Бомбочки для ванны подарочный набор 12 штук",
        "image": "https://mns-basket-cdn-02.geobasket.net/vol7014/part701405/701405344/images/big/1.webp",
        "price": 30.60,
        "size": "12 шт",
        "color": "Разноцветный",
        "packageContents": "Подарочная коробка, 12 бомбочек",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/701405344/detail.aspx"
    },
    {
        "name": "EPSOM.PRO/Магниевая соль для ванн для детей 500 гр",
        "image": "https://mns-basket-cdn-05.geobasket.net/vol1896/part189657/189657357/images/big/1.webp",
        "price": 15.72,
        "size": "500 гр",
        "color": "Белый",
        "packageContents": "Пакет с солью",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/189657357/detail.aspx"
    },
    {
        "name": "MissLor/Массажер Гуаша микротоковый для лица и тела",
        "image": "https://mns-basket-cdn-03.geobasket.net/vol7636/part763656/763656740/images/big/1.webp",
        "price": 86.17,
        "size": "Универсальный",
        "color": "Розовый",
        "packageContents": "Массажер, USB кабель",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/763656740/detail.aspx"
    },
    {
        "name": "Chew/Отбеливающая зубная паста в таблетках",
        "image": "https://mns-basket-cdn-03.geobasket.net/vol1574/part157445/157445900/images/big/1.webp",
        "price": 12.84,
        "size": "60 шт",
        "color": "Мятный",
        "packageContents": "Баночка с таблетками",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/157445900/detail.aspx"
    },
    {
        "name": "Secret Showcase/Мицеллярная вода для снятия макияжа с глаз и лица",
        "image": "https://mns-basket-cdn-02.geobasket.net/vol7655/part765585/765585869/images/big/1.webp",
        "price": 11.72,
        "size": "400 мл",
        "color": "Прозрачный",
        "packageContents": "Флакон 1 шт.",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/765585869/detail.aspx"
    },
    {
        "name": "OfficeClean/Жидкое мыло для рук, набор 3 по 500мл",
        "image": "https://mns-basket-cdn-06.geobasket.net/vol2713/part271319/271319193/images/big/1.webp",
        "price": 12.03,
        "size": "3х500 мл",
        "color": "Разноцветный",
        "packageContents": "Флакон с дозатором 3 шт.",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/271319193/detail.aspx"
    },
    {
        "name": "Цифровой Рай/Повербанк 10000 powerbank с проводами для телефона",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol3585/part358566/358566751/images/big/1.webp",
        "price": 34.90,
        "size": "10000 mAh",
        "color": "Черный",
        "packageContents": "Внешний аккумулятор, встроенные провода",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/358566751/detail.aspx"
    },
    {
        "name": "MarketHub/Внешний аккумулятор Acefast M16 Power Bank Черный",
        "image": "https://mns-basket-cdn-06.geobasket.net/vol5021/part502176/502176053/images/big/1.webp",
        "price": 112.67,
        "size": "10000 mAh",
        "color": "Черный",
        "packageContents": "Повербанк, кабель зарядки",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/502176053/detail.aspx"
    },
    {
        "name": "Baseus/Кабель Display Type-C - Type-C 100 Вт, 2м",
        "image": "https://mns-basket-cdn-05.geobasket.net/vol5861/part586165/586165097/images/big/1.webp",
        "price": 44.48,
        "size": "2 м",
        "color": "Черный",
        "packageContents": "Кабель 1 шт.",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/586165097/detail.aspx"
    },
    {
        "name": "KRKA/Селафорт 6% капли от блох д/кошек 2,6-7,5кг 0,75мл(45мг) №1",
        "image": "https://mns-basket-cdn-05.geobasket.net/vol3708/part370844/370844257/images/big/1.webp",
        "price": 19.20,
        "size": "0,75 мл",
        "color": "Прозрачный",
        "packageContents": "Пипетка 1 шт.",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/370844257/detail.aspx"
    },
    {
        "name": "Dr.Zubareva/Магний В6 хелат глицинат бисглицинат",
        "image": "https://mns-basket-cdn-05.geobasket.net/vol8206/part820603/820603402/images/big/1.webp",
        "price": 42.61,
        "size": "90 капсул",
        "color": "Белый",
        "packageContents": "Банка с БАД",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/820603402/detail.aspx"
    },
    {
        "name": "Органик Микс/Универсальное удобрение для рассады овощей Морской коктейль",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol3429/part342956/342956246/images/big/1.webp",
        "price": 13.08,
        "size": "500 мл",
        "color": "Коричневый",
        "packageContents": "Флакон с удобрением",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/342956246/detail.aspx"
    },
    {
        "name": "UZcotton/Футболка базовая хлопок L",
        "image": "https://mns-basket-cdn-02.geobasket.net/vol269/part26990/26990809/images/big/1.webp",
        "price": 18.17,
        "size": "L (48)",
        "color": "Белый",
        "packageContents": "Футболка 1 шт.",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/26990809/detail.aspx"
    },
    {
        "name": "Nutley/Конфеты без сахара Ассорти Полезный и вкусный подарок 1кг",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol2153/part215380/215380836/images/big/1.webp",
        "price": 21.45,
        "size": "1 кг",
        "color": "Разноцветный",
        "packageContents": "Коробка конфет",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/215380836/detail.aspx"
    },
    {
        "name": "UZcotton/Футболка коричневая хлопок S",
        "image": "https://mns-basket-cdn-03.geobasket.net/vol132/part13212/13212370/images/big/1.webp",
        "price": 18.72,
        "size": "S (44)",
        "color": "Коричневый",
        "packageContents": "Футболка 1 шт.",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/13212370/detail.aspx"
    },
    {
        "name": "YeSiMi/Маски для лица тканевые набор 30 шт",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol1613/part161341/161341156/images/big/1.webp",
        "price": 23.27,
        "size": "30 шт",
        "color": "Разноцветный",
        "packageContents": "Набор масок 30 шт.",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/161341156/detail.aspx"
    },
    {
        "name": "Bona Forte/Удобрение для клубники и ягод гранулы 1 раз в сезон, 800 г",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol1407/part140700/140700836/images/big/1.webp",
        "price": 17.12,
        "size": "800 гр",
        "color": "Белый",
        "packageContents": "Пакет с гранулами",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/140700836/detail.aspx"
    },
    {
        "name": "LingLong/шины летние 175/70 R13 82T",
        "image": "https://mns-basket-cdn-05.geobasket.net/vol2186/part218686/218686542/images/big/1.webp",
        "price": 106.67,
        "size": "175/70 R13",
        "color": "Черный",
        "packageContents": "Шина автомобильная 1 шт.",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/218686542/detail.aspx"
    },
    {
        "name": "STEPWEEK/Слипоны повседневные 41",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol256/part25624/25624221/images/big/1.webp",
        "price": 23.66,
        "size": "41",
        "color": "Синий",
        "packageContents": "Слипоны 1 пара",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/25624221/detail.aspx"
    },
    {
        "name": "CROCS/Сабо для пляжа кроксы черные 44-45",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol8729/part872996/872996606/images/big/1.webp",
        "price": 54.91,
        "size": "44-45",
        "color": "Черный",
        "packageContents": "Сабо 1 пара",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/872996606/detail.aspx"
    },
    {
        "name": "BEST/Шлепки тапки резиновые домашние 41",
        "image": "https://mns-basket-cdn-02.geobasket.net/vol968/part96808/96808074/images/big/1.webp",
        "price": 26.88,
        "size": "41",
        "color": "Серый",
        "packageContents": "Тапки 1 пара",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/96808074/detail.aspx"
    },
    {
        "name": "Obba/Замшевые туфли лодочки на шпильке",
        "image": "https://mns-basket-cdn-03.geobasket.net/vol5673/part567381/567381350/images/big/1.webp",
        "price": 156.61,
        "size": "38",
        "color": "Бордовый",
        "packageContents": "Туфли 1 пара, коробка",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/567381350/detail.aspx"
    },
    {
        "name": "Xiaomi/Зарядное устройство xiaomi 33w оригинал",
        "image": "https://mns-basket-cdn-05.geobasket.net/vol7447/part744734/744734347/images/big/1.webp",
        "price": 51.13,
        "size": "33 Вт",
        "color": "Белый",
        "packageContents": "Блок питания",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/744734347/detail.aspx"
    },
    {
        "name": "Яндекс/Умная колонка Станция Лайт 2 с Алисой, фиолетовая",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol3038/part303802/303802236/images/big/1.webp",
        "price": 188.25,
        "size": "Универсальный",
        "color": "Фиолетовый",
        "packageContents": "Колонка, адаптер питания, кабель",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/303802236/detail.aspx"
    },
    {
        "name": "DOHEALTH/Зубная щетка электрическая звуковая",
        "image": "https://mns-basket-cdn-03.geobasket.net/vol5492/part549228/549228610/images/big/1.webp",
        "price": 51.04,
        "size": "Универсальный",
        "color": "Белый",
        "packageContents": "Щетка, насадки 2 шт, зарядная база",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/549228610/detail.aspx"
    },
    {
        "name": "Hatber/Скетчбук для рисования А5, блокнот",
        "image": "https://mns-basket-cdn-02.geobasket.net/vol1180/part118073/118073084/images/big/1.webp",
        "price": 6.88,
        "size": "А5",
        "color": "Разноцветный",
        "packageContents": "Скетчбук 1 шт.",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/118073084/detail.aspx"
    },
    {
        "name": "АРТформат/Карандаши цветные Blackwood 24 цвета мягкие для рисования",
        "image": "https://mns-basket-cdn-03.geobasket.net/vol143/part14344/14344295/images/big/1.webp",
        "price": 18.07,
        "size": "24 цвета",
        "color": "Разноцветный",
        "packageContents": "Упаковка карандашей",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/14344295/detail.aspx"
    },
    {
        "name": "Brauberg/Точилка для карандашей электрическая на батарейках для школы",
        "image": "https://mns-basket-cdn-05.geobasket.net/vol1740/part174048/174048487/images/big/1.webp",
        "price": 16.39,
        "size": "Универсальный",
        "color": "Синий",
        "packageContents": "Точилка электрическая",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/174048487/detail.aspx"
    },
    {
        "name": "WALKER/Наушники беспроводные с микрофоном для телефона",
        "image": "https://mns-basket-cdn-03.geobasket.net/vol4344/part434460/434460365/images/big/1.webp",
        "price": 45.66,
        "size": "Универсальный",
        "color": "Черный",
        "packageContents": "Наушники, кейс, кабель зарядки",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/434460365/detail.aspx"
    },
    {
        "name": "Gerlax/Повербанк с быстрой зарядкой для телефона",
        "image": "https://mns-basket-cdn-03.geobasket.net/vol6090/part609015/609015050/images/big/1.webp",
        "price": 48.86,
        "size": "10000 mAh",
        "color": "Белый",
        "packageContents": "Повербанк, кабель",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/609015050/detail.aspx"
    },
    {
        "name": "HOCO/Кабель type-c usb для зарядки android",
        "image": "https://mns-basket-cdn-03.geobasket.net/vol1606/part160613/160613840/images/big/1.webp",
        "price": 12.71,
        "size": "1 м",
        "color": "Красный",
        "packageContents": "Кабель Type-C",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/160613840/detail.aspx"
    },
    {
        "name": "Dway/Видеорегистратор для автомобиля 2 в 1 с камерой заднего вида",
        "image": "https://mns-basket-cdn-06.geobasket.net/vol6119/part611984/611984758/images/big/1.webp",
        "price": 106.05,
        "size": "Универсальный",
        "color": "Черный",
        "packageContents": "Регистратор, камера заднего вида, проводка",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/611984758/detail.aspx"
    },
    {
        "name": "STIMAXON/Пылесос для автомобиля беспроводной мощный",
        "image": "https://mns-basket-cdn-06.geobasket.net/vol1537/part153738/153738788/images/big/1.webp",
        "price": 52.43,
        "size": "Универсальный",
        "color": "Серый",
        "packageContents": "Пылесос, набор насадок, зарядный кабель",
        "isReturnable": false,
        "productLink": "https://www.wildberries.ru/catalog/153738788/detail.aspx"
    },
    {
        "name": "AREON/Ароматизатор в машину картонный Дыня",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol7202/part720237/720237951/images/big/1.webp",
        "price": 5.13,
        "size": "Стандартный",
        "color": "Желтый",
        "packageContents": "Ароматизатор картонный",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/720237951/detail.aspx"
    },
    {
        "name": "listoff/Ежедневник недатированный А5 136 л. кожаный для работы",
        "image": "https://mns-basket-cdn-06.geobasket.net/vol5319/part531926/531926608/images/big/1.webp",
        "price": 11.89,
        "size": "А5",
        "color": "Черный",
        "packageContents": "Ежедневник 1 шт.",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/531926608/detail.aspx"
    },
    {
        "name": "Pensan/Ручки шариковые синие набор для школы и офиса Global 12шт",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol1051/part105108/105108321/images/big/1.webp",
        "price": 10.04,
        "size": "Синий стержень",
        "color": "Синий",
        "packageContents": "Набор ручек 12 шт.",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/105108321/detail.aspx"
    },
    {
        "name": "BG/Блочная тетрадь на кольцах со сменными блоками 120 листов",
        "image": "https://mns-basket-cdn-02.geobasket.net/vol4339/part433912/433912719/images/big/1.webp",
        "price": 11.36,
        "size": "120 л",
        "color": "Разноцветный",
        "packageContents": "Тетрадь со сменным блоком",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/433912719/detail.aspx"
    },
    {
        "name": "H&S/Набор маркеров для скетчинга 60 штук",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol405/part40528/40528891/images/big/1.webp",
        "price": 23.66,
        "size": "60 шт",
        "color": "Разноцветный",
        "packageContents": "Тканевая сумка, маркеры 60 шт.",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/40528891/detail.aspx"
    },
    {
        "name": "Феникс/Книга теней : Книги саморазвитие",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol4937/part493796/493796516/images/big/1.webp",
        "price": 5.86,
        "size": "Стандартный",
        "color": "Темный",
        "packageContents": "Книга 1 шт.",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/493796516/detail.aspx"
    },
    {
        "name": "Berlingo/Папка органайзер для документов семейная, А4",
        "image": "https://mns-basket-cdn-05.geobasket.net/vol484/part48478/48478802/images/big/1.webp",
        "price": 9.35,
        "size": "А4",
        "color": "Серый",
        "packageContents": "Папка-органайзер 1 шт.",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/48478802/detail.aspx"
    },
    {
        "name": "Berlingo/Клей-карандаш канцелярский pvp, набор 3 штуки по 8 гр",
        "image": "https://mns-basket-cdn-05.geobasket.net/vol4814/part481420/481420807/images/big/1.webp",
        "price": 5.81,
        "size": "3х8 гр",
        "color": "Прозрачный",
        "packageContents": "Клей-карандаш 3 шт.",
        "isReturnable": true,
        "productLink": "https://www.wildberries.ru/catalog/481420807/detail.aspx"
    },
    {
        "name": "MamiDA/Приправа для шашлыка МамиДА, 140г",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol136/part13612/13612189/images/big/1.webp",
        "price": 11.51,
        "size": "140 гр",
        "color": "-",
        "packageContents": "Приправа для шашлыка; стеклянная банка",
        "isReturnable": false,
        "productLink": "https://www.wildberries.by/catalog/13612189/detail.aspx"
    },
    {
        "name": "Sen Soy/Соевый соус классический 2 шт по 1 литру",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol4681/part468125/468125479/images/big/1.webp",
        "price": 29.14,
        "size": "-",
        "color": "-",
        "packageContents": "2 шт",
        "isReturnable": false,
        "productLink": "https://www.wildberries.by/catalog/468125479/detail.aspx"
    },
    {
        "name": "PASTA NAPOLETANA/Макароны, Спагетти, 4 штуки по 400 г, гр. А",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol2511/part251174/251174242/images/big/1.webp",
        "price": 9.65,
        "size": "1600 г",
        "color": "-",
        "packageContents": "4",
        "isReturnable": false,
        "productLink": "https://www.wildberries.by/catalog/251174242/detail.aspx"
    },
    {
        "name": "ЭТОНОВО/Овсяные хлопья без глютена без сахара цельнозерновые, 700г",
        "image": "https://mns-basket-cdn-03.geobasket.net/vol1720/part172011/172011936/images/big/1.webp",
        "price": 18.37,
        "size": "700 г",
        "color": "-",
        "packageContents": "Овсяные хлопья без глютена - 1 шт.",
        "isReturnable": false,
        "productLink": "https://www.wildberries.by/catalog/172011936/detail.aspx"
    },
    {
        "name": "Dads material/Набор разделочных деревянных кухонных досок",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol1631/part163110/163110469/images/big/1.webp",
        "price": 61.14,
        "size": "2 шт",
        "color": "коричневый",
        "packageContents": "разделочные деревянные доски",
        "isReturnable": true,
        "productLink": "https://www.wildberries.by/catalog/163110469/detail.aspx"
    },
    {
        "name": "ToyQ/Кукла LOL Surprise Earth Love Day 585947",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol2724/part272422/272422846/images/big/1.webp",
        "price": 27.52,
        "size": "-",
        "color": "розовый",
        "packageContents": "Кукла - 1шт; аксессуары",
        "isReturnable": true,
        "productLink": "https://www.wildberries.by/catalog/272422846/detail.aspx"
    },
    {
        "name": "GT/Губки для мытья посуды набор 10 штук",
        "image": "https://mns-basket-cdn-02.geobasket.net/vol9850/part985044/985044497/images/big/1.webp",
        "price": 5.49,
        "size": "10 шт",
        "color": "красный; желтый; оранжевый; зеленый; синий",
        "packageContents": "губки для мытья - 10 шт",
        "isReturnable": true,
        "productLink": "https://www.wildberries.by/catalog/985044497/detail.aspx"
    },
    {
        "name": "Touch Raven/Набор маркеров для скетчинга 80шт",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol1667/part166734/166734940/images/big/1.webp",
        "price": 39.70,
        "size": "-",
        "color": "голубой",
        "packageContents": "-",
        "isReturnable": true,
        "productLink": "https://www.wildberries.by/catalog/166734940/detail.aspx"
    },
    {
        "name": "Estares/Светодиодная лента гибкий неон 5 метров с пультом RGB",
        "image": "https://mns-basket-cdn-03.geobasket.net/vol9326/part932653/932653290/images/big/1.webp",
        "price": 27.80,
        "size": "-",
        "color": "красный; синий; зеленый",
        "packageContents": "инструкция; гибкий неон; упаковка; монтажный набор",
        "isReturnable": true,
        "productLink": "https://www.wildberries.by/catalog/932653290/detail.aspx"
    },
    {
        "name": "MONGE/Корм для стерилизованных кошек курица 10 кг",
        "image": "https://mns-basket-cdn-03.geobasket.net/vol2301/part230104/230104767/images/big/1.webp",
        "price": 147.58,
        "size": "1 шт",
        "color": "-",
        "packageContents": "1 шт.",
        "isReturnable": false,
        "productLink": "https://www.wildberries.by/catalog/230104767/detail.aspx"
    },
    {
        "name": "MAXIM/Кошелек из натуральной кожи тонкий на магните",
        "image": "https://mns-basket-cdn-03.geobasket.net/vol8590/part859013/859013133/images/big/1.webp",
        "price": 57.11,
        "size": "-",
        "color": "черный",
        "packageContents": "кошелек женский,кошелек клатч,кошелек картхолдер,портмоне женский натуральная кожа",
        "isReturnable": true,
        "productLink": "https://www.wildberries.by/catalog/859013133/detail.aspx"
    },
    {
        "name": "Плюшевые игрушки/Мягкая игрушка Гусь Обнимусь",
        "image": "https://mns-basket-cdn-02.geobasket.net/vol1704/part170457/170457113/images/big/1.webp",
        "price": 21.59,
        "size": "-",
        "color": "-",
        "packageContents": "Игрушка Гусь обнимусь 190см или 240см или 160см или 130см или 90см или 50см",
        "isReturnable": true,
        "productLink": "https://www.wildberries.by/catalog/170457113/detail.aspx"
    },
    {
        "name": "Happyfox/Рубашка льняная с коротким рукавом",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol4308/part430830/430830523/images/big/1.webp",
        "price": 50.62,
        "size": "50",
        "color": "черный",
        "packageContents": "мужская рубашка 1 шт",
        "isReturnable": true,
        "productLink": "https://www.wildberries.by/catalog/430830523/detail.aspx?size=612639016"
    },
    {
        "name": "Eclips/Капсулы для стирки детских вещей Eclips Sensitive 30 шт",
        "image": "https://mns-basket-cdn-04.geobasket.net/vol6181/part618197/618197578/images/big/1.webp",
        "price": 32.16,
        "size": "30 шт",
        "color": "0",
        "packageContents": "1 упаковка; 30шт",
        "isReturnable": true,
        "productLink": "https://www.wildberries.by/catalog/618197578/detail.aspx"
    },
    {
        "name": "Finish/Таблетки для посудомоечной машины Power All in 1, 100 шт",
        "image": "https://mns-basket-cdn-03.geobasket.net/vol10515/part1051599/1051599999/images/big/1.webp",
        "price": 45.71,
        "size": "100 шт",
        "color": "0",
        "packageContents": "Таблетки для посудомоечной машины Finish Powerball Power All in 1; 50 шт - 2 упаковки; Набор - 100 шт",
        "isReturnable": true,
        "productLink": "https://www.wildberries.by/catalog/1051599999/detail.aspx"
    },
    {
        "name": "Sportberry/Протеиновые батончики без сахара ассорти набор TRUE 10 шт х 40г",
        "image": "https://mns-basket-cdn-03.geobasket.net/vol6384/part638460/638460453/images/big/1.webp",
        "price": 44.35,
        "size": "10 шт",
        "color": "0",
        "packageContents": "Батончики протеиновые; коробка",
        "isReturnable": true,
        "productLink": "https://www.wildberries.by/catalog/638460453/dЦейс-виде"
    }
];

const adultProductData = [
    {
        "name": "MERLO/Вино белое",
        "image": "https://placehold.co/1200x800/png?text=Wine+White",
        "price": 14.34,
        "isAdult": true,
        "size": "0.75 л",
        "color": "Светло-соломенный",
        "packageContents": "Стеклянная бутылка 1 шт.",
        "isReturnable": false,
        "productLink": "#"
    },
    {
        "name": "ALTO/Вино красное",
        "image": "https://placehold.co/1200x800/png?text=Wine+Red",
        "price": 20.64,
        "isAdult": true,
        "size": "0.75 л",
        "color": "Рубиновый",
        "packageContents": "Стеклянная бутылка 1 шт.",
        "isReturnable": false,
        "productLink": "#"
    }
];

// --- ИНТЕГРАЦИЯ МОБИЛЬНОГО СКАНЕРА ЧЕРЕЗ FIREBASE ---
let activeScannerSession = localStorage.getItem('wb_scanner_session');
let scanListenerRef = null;

window.initFirebaseScannerBridge = function() {
    const statusIcon = document.getElementById('connection-status');
    if (!activeScannerSession) {
        if (statusIcon) statusIcon.classList.remove('connected');
        return;
    }

    if (statusIcon) statusIcon.classList.add('connected');
    
    if (scanListenerRef) {
        database.ref('scans/' + activeScannerSession).off('child_added', scanListenerRef);
    }

    scanListenerRef = database.ref('scans/' + activeScannerSession).on('child_added', async (snapshot) => {
        const data = snapshot.val();
        if (data && data.code) {
            
            if (typeof showAlert === 'function') {
                showAlert('Отсканировано: ' + data.code, false);
            }

            snapshot.ref.remove().catch(e => console.error("Не удалось удалить скан", e));

            const scannedCode = data.code;
            
            const createKeyEv = (type, key, code, keyCode) => {
                const ev = new KeyboardEvent(type, { key: key, code: code, bubbles: true, cancelable: true });
                Object.defineProperty(ev, 'keyCode', { get: () => keyCode });
                Object.defineProperty(ev, 'which', { get: () => keyCode });
                return ev;
            };

            for (let i = 0; i < scannedCode.length; i++) {
                const char = scannedCode[i];
                const charCode = char.charCodeAt(0);
                const activeElement = document.activeElement || document.body;

                activeElement.dispatchEvent(createKeyEv('keydown', char, 'Key' + char.toUpperCase(), charCode));
                activeElement.dispatchEvent(createKeyEv('keypress', char, 'Key' + char.toUpperCase(), charCode));

                if ((activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') && !activeElement.readOnly && !activeElement.disabled) {
                    const maxLength = activeElement.getAttribute('maxlength');
                    if (!maxLength || activeElement.value.length < parseInt(maxLength, 10)) {
                        activeElement.value += char;
                        activeElement.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }

                activeElement.dispatchEvent(createKeyEv('keyup', char, 'Key' + char.toUpperCase(), charCode));
                await new Promise(resolve => setTimeout(resolve, 15));
            }

            const finalElement = document.activeElement || document.body;
            
            const enterDown = createKeyEv('keydown', 'Enter', 'Enter', 13);
            finalElement.dispatchEvent(enterDown);
            
            finalElement.dispatchEvent(createKeyEv('keypress', 'Enter', 'Enter', 13));
            if (finalElement.tagName === 'INPUT' || finalElement.tagName === 'TEXTAREA') {
                finalElement.dispatchEvent(new Event('change', { bubbles: true }));
                if (finalElement.form && !enterDown.defaultPrevented) {
                    const submitEv = new Event('submit', { bubbles: true, cancelable: true });
                    finalElement.form.dispatchEvent(submitEv);
                }
            }
            
            finalElement.dispatchEvent(createKeyEv('keyup', 'Enter', 'Enter', 13));
            document.dispatchEvent(new CustomEvent('scan', { detail: { code: scannedCode } }));
        }
    });
};

window.openScannerSetupModal = function() {
    if (!activeScannerSession) {
        activeScannerSession = Math.floor(100000 + Math.random() * 900000).toString();
        localStorage.setItem('wb_scanner_session', activeScannerSession);
    }
    
    const baseUrl = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
    const scannerUrl = `${baseUrl}/mobile_scanner.html?session=${activeScannerSession}`;
    
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(scannerUrl)}`;
    const modal = document.getElementById('scanner-setup-modal');
    if (modal) {
        modal.innerHTML = `
            <div class="modal-content" style="text-align: center;">
                <button class="close-modal-btn">&times;</button>
                <h2 style="margin-bottom: 15px;"><i class="fas fa-mobile-alt"></i> Подключение телефона</h2>
                <p style="color: var(--text-secondary-color); margin-bottom: 20px;">
                    Отсканируйте этот QR-код стандартной камерой вашего телефона.
                </p>
                <img src="${qrCodeUrl}" alt="QR Code" style="width: 250px; height: 250px; border-radius: 8px; box-shadow: var(--shadow-sm); margin-bottom: 20px;">
                
                <div class="info-box-blue" style="text-align: left; margin-bottom: 20px;">
                    <i class="fas fa-info-circle"></i>
                    <div>Соединение сохраняется при переходе между страницами. Телефон будет отправлять данные прямо в программу в активное поле ввода.</div>
                </div>
                
                <button class="secondary-btn full-width-btn" id="disconnect-scanner-btn" style="color: var(--error); border-color: var(--error);">
                    <i class="fas fa-unlink"></i> Отключить текущий телефон
                </button>
            </div>
        `;
        modal.querySelector('.close-modal-btn').addEventListener('click', () => {
            modal.classList.remove('visible');
            setTimeout(() => { modal.style.display = 'none'; }, 300);
        });
        document.getElementById('disconnect-scanner-btn').addEventListener('click', () => {
            if (scanListenerRef) {
                database.ref('scans/' + activeScannerSession).off('child_added', scanListenerRef);
            }
            database.ref('scans/' + activeScannerSession).remove(); 
            localStorage.removeItem('wb_scanner_session');
            activeScannerSession = null;
            document.getElementById('connection-status').classList.remove('connected');
            
            modal.classList.remove('visible');
            setTimeout(() => { modal.style.display = 'none'; }, 300);
            showAlert('Сканер отключен', false);
        });
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('visible'), 10);
        initFirebaseScannerBridge();
    }
};
;