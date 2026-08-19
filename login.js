// Глобальные переменные для состояний многошаговой авторизации
window.currentLoginId = null;
window.phoneData = null;
window.isLegacyOwner = false;

// Глобальные переменные для работы с ПИН-кодом
window.currentOwnerUid = null;
window.currentPvzId = null;
window.currentSelectedEmp = null;
window.currentEmpPin = null;
window.pinMode = 'enter'; // 'enter', 'setup', 'reset'
window.resettingPinForEmpId = null;

document.addEventListener('DOMContentLoaded', () => {
    const isLoginPage = !!document.getElementById('next-phone-btn');
    const isRegisterPage = !!document.getElementById('register-btn');

    if (isLoginPage) {
        initCountrySelector('login-phone-wrapper');

        // Обработка возврата после перехода по ссылке из письма
        if (firebase.auth().isSignInWithEmailLink(window.location.href)) {
            handleEmailLinkSignIn();
        }

        // Обработчики шагов авторизации
        document.getElementById('next-phone-btn').addEventListener('click', handlePhoneNext);
        document.getElementById('login-id').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handlePhoneNext();
        });

        document.getElementById('back-to-phone-btn').addEventListener('click', () => {
            document.getElementById('step-email-confirm').style.display = 'none';
            document.getElementById('step-phone').style.display = 'block';
        });

        // --- Обработчики экрана ПИН КОДА ---
        document.getElementById('pin-submit-btn').addEventListener('click', submitPin);
        document.getElementById('pin-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') submitPin();
        });
        document.getElementById('forgot-pin-link').addEventListener('click', handleForgotPin);
        document.getElementById('back-to-managers-btn').addEventListener('click', () => {
            document.getElementById('pin-screen').style.display = 'none';
            document.getElementById('manager-selection-screen').style.display = 'block';
            window.resettingPinForEmpId = null;
        });

        document.getElementById('pvz-not-found-btn')?.addEventListener('click', () => {
             alert("Извините за временное неудобство! Возможно мы не активировали ваш ПВЗ в системе Wildberries, если ПВЗ не появится в течении 15 минут, сообщите об этом нам на сайте pvz.wb.ru в разделе помощник!");
        });

        // Авто-авторизация (старая сессия Firebase или новая сессия сотрудника)
        firebase.auth().onAuthStateChanged(async user => {
            if (user && window.location.pathname.includes('login.html') && !firebase.auth().isSignInWithEmailLink(window.location.href)) {
                checkSavedSessionsAndRedirect(user.uid);
            }
        });
        
        const empPhoneSession = localStorage.getItem('employeePhone') || sessionStorage.getItem('employeePhone');
        if (!firebase.auth().currentUser && empPhoneSession && !firebase.auth().isSignInWithEmailLink(window.location.href)) {
             checkSavedSessionsAndRedirect(null);
        }

    } else if (isRegisterPage) {
        initCountrySelector('reg-phone-wrapper');
        initCountrySelector('owner-phone-wrapper');
        setupRegisterLogic();
    }
});

// Завершение входа по Email-ссылке
async function handleEmailLinkSignIn() {
    let email = window.localStorage.getItem('emailForSignIn');
    if (!email) {
        email = window.prompt('Пожалуйста, введите ваш email для подтверждения входа');
    }
    
    if (!email) return;

    try {
        await firebase.auth().signInWithEmailLink(email, window.location.href);
        window.localStorage.removeItem('emailForSignIn');
        
        // Очищаем URL от параметров токена
        window.history.replaceState(null, '', window.location.pathname);

        const pvzListRaw = JSON.parse(window.localStorage.getItem('pendingPvzs') || '[]');
        const loginId = window.localStorage.getItem('employeePhone');
        const rememberMe = window.localStorage.getItem('pendingRememberMe') === 'true';
        
        if (loginId) {
            window.currentLoginId = loginId;
            if (rememberMe) {
                localStorage.setItem('employeePhone', loginId);
            } else {
                sessionStorage.setItem('employeePhone', loginId);
            }
        }
        
        if (pvzListRaw && pvzListRaw.length > 0) {
            document.getElementById('main-auth-form').style.display = 'none';
            showPvzSelectionScreen(pvzListRaw);
        } else {
            checkSavedSessionsAndRedirect(firebase.auth().currentUser.uid);
        }
    } catch (error) {
        console.error('Ошибка входа по ссылке', error);
        alert('Ошибка при входе по ссылке: ' + error.message);
    }
}

async function checkSavedSessionsAndRedirect(ownerUid) {
    const hasPvz = localStorage.getItem('savedPvzId');
    const savedOwner = localStorage.getItem('savedOwnerUid') || ownerUid;
    const hasManager = sessionStorage.getItem('currentManager');

    if (hasPvz && hasManager) {
        window.location.href = 'index.html';
    } else if (hasPvz && savedOwner && !hasManager) {
        // FAST LOGIN: Переходим к списку менеджеров, минуя ввод телефона и подтверждения
        document.getElementById('main-auth-form').style.display = 'none';
        loadEmployeesForFastLogin(savedOwner, hasPvz);
    } else if (ownerUid) {
        document.getElementById('main-auth-form').style.display = 'none';
        const pvzSnap = await firebase.database().ref('users/' + ownerUid + '/pvzInfo').once('value');
        showPvzSelectionScreen(pvzSnap.val());
    }
}

function initCountrySelector(wrapperId) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
    
    const selector = wrapper.querySelector('.custom-country-selector');
    const selectedFlag = wrapper.querySelector('.flag-img');
    const list = wrapper.querySelector('.country-dropdown-list');
    const prefixSpan = wrapper.querySelector('.phone-prefix');
    const phoneInput = wrapper.querySelector('.phone-input');

    phoneInput.dataset.countryCode = '7'; 
    phoneInput.maxLength = 10;

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

// ШАГ 1: Ввод номера телефона и отправка ссылки на почту нужного сотрудника
async function handlePhoneNext() {
    const phoneInputEl = document.getElementById('login-id');
    const countryCode = phoneInputEl.dataset.countryCode || '7';
    const phoneInput = phoneInputEl.value.trim();
    const cleanPhoneInput = phoneInput.replace(/\D/g, ''); 
    const loginId = countryCode + cleanPhoneInput;
    const rememberMe = document.getElementById('remember-me').checked;

    const errorEl = document.getElementById('error-message-phone');
    const nextBtn = document.getElementById('next-phone-btn');

    if (!cleanPhoneInput) {
        errorEl.textContent = 'Пожалуйста, введите номер телефона.';
        errorEl.style.display = 'block';
        return;
    }

    nextBtn.disabled = true;
    nextBtn.innerHTML = `<div class="button-spinner"></div> <span>Отправка ссылки...</span>`;
    errorEl.style.display = 'none';

    try {
        const phoneIndexRef = firebase.database().ref('phoneIndex/' + loginId);
        const phoneSnapshot = await phoneIndexRef.once('value');
        
        if (!phoneSnapshot.exists()) {
            throw new Error("Номер не найден в базе данных.");
        }

        window.currentLoginId = loginId;
        window.phoneData = phoneSnapshot.val();
        window.isLegacyOwner = (typeof window.phoneData === 'string');

        let targetEmail = null;
        let pvzList = [];

        if (window.isLegacyOwner) {
            // Если старая система регистрации
            const uid = window.phoneData;
            const userSnap = await firebase.database().ref('users/' + uid).once('value');
            const userData = userSnap.val();
            
            if (userData && userData.email) targetEmail = userData.email;
            else if (userData && userData.pvzInfo && userData.pvzInfo.email) targetEmail = userData.pvzInfo.email;
            
            if (userData.pvzInfo && typeof userData.pvzInfo === 'object') {
                if (Array.isArray(userData.pvzInfo)) pvzList = userData.pvzInfo;
                else if (userData.pvzInfo.pvzId) pvzList = [userData.pvzInfo]; 
                else pvzList = Object.values(userData.pvzInfo);
            }
        } else {
            // Если новая структура — ищем email КОНКРЕТНОГО СОТРУДНИКА
            if (window.phoneData.pvzs) {
                pvzList = Object.values(window.phoneData.pvzs);
                
                for (let pvz of pvzList) {
                    if (pvz.uid && pvz.pvzId) {
                        const empsSnap = await firebase.database().ref(`users/${pvz.uid}/employees/${pvz.pvzId}`).once('value');
                        const emps = empsSnap.val();
                        if (emps) {
                            for (let empId in emps) {
                                if (emps[empId].phone === loginId && emps[empId].email) {
                                    targetEmail = emps[empId].email;
                                    break;
                                }
                            }
                        }
                    }
                    if (targetEmail) break;
                }
            }
        }

        if (!targetEmail) {
            throw new Error("У данного сотрудника не привязана электронная почта. Обратитесь к владельцу ПВЗ.");
        }

        // Подготовка Firebase Email Link Auth
        const actionCodeSettings = {
            url: window.location.origin + window.location.pathname,
            handleCodeInApp: true
        };

        await firebase.auth().sendSignInLinkToEmail(targetEmail, actionCodeSettings);

        // Сохраняем стейт в localStorage, чтобы использовать после перехода по ссылке
        window.localStorage.setItem('emailForSignIn', targetEmail);
        window.localStorage.setItem('employeePhone', loginId);
        window.localStorage.setItem('pendingPvzs', JSON.stringify(pvzList));
        window.localStorage.setItem('pendingRememberMe', rememberMe.toString());

        document.getElementById('step-phone').style.display = 'none';
        document.getElementById('step-email-confirm').style.display = 'block';

    } catch (error) {
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
    } finally {
        nextBtn.disabled = false;
        nextBtn.innerHTML = `<span>Далее</span>`;
    }
}

// ШАГ 3: Отображение пунктов выдачи
function showPvzSelectionScreen(pvzListRaw) {
    document.getElementById('main-auth-form').style.display = 'none';
    document.getElementById('manager-selection-screen').style.display = 'none';
    document.getElementById('pin-screen').style.display = 'none';
    
    const listContainer = document.getElementById('pvz-list-container');
    listContainer.innerHTML = '';

    let pvzList = [];
    if (pvzListRaw && typeof pvzListRaw === 'object') {
        if (Array.isArray(pvzListRaw)) pvzList = pvzListRaw;
        else if (pvzListRaw.pvzId) pvzList = [pvzListRaw]; 
        else pvzList = Object.values(pvzListRaw);
    }

    if (pvzList.length > 0) {
        pvzList.forEach(pvz => {
            const btn = document.createElement('div');
            btn.className = 'pvz-select-item';
            btn.innerHTML = `<div><strong>ID: ${pvz.pvzId || 'Не указан'}</strong><span style="color: var(--text-secondary-color); font-size: 0.9rem;">${pvz.address || 'Адрес не указан'}</span></div><i class="fas fa-chevron-right" style="color: var(--gray-medium);"></i>`;
            btn.addEventListener('click', () => selectPvzAndProceed(pvz));
            listContainer.appendChild(btn);
        });
    } else {
        listContainer.innerHTML = '<p style="text-align:center; padding: 20px;">ПВЗ не найдены.</p>';
    }
    
    document.getElementById('pvz-selection-screen').style.display = 'block';
}

// ШАГ 4: Выбор ПВЗ и переход к списку сотрудников
async function selectPvzAndProceed(selectedPvz) {
    if(selectedPvz.pvzId) {
        localStorage.setItem('savedPvzId', selectedPvz.pvzId);
    }
    
    document.getElementById('pvz-selection-screen').style.display = 'none';

    let ownerUid = selectedPvz.uid;
    if (!ownerUid && firebase.auth().currentUser) {
        ownerUid = firebase.auth().currentUser.uid;
    }

    if (!ownerUid) {
        alert("Системная ошибка: Не удалось определить владельца ПВЗ.");
        return;
    }
    
    // Сохраняем UID владельца для дальнейших быстрых входов
    localStorage.setItem('savedOwnerUid', ownerUid);
    const pvzId = selectedPvz.pvzId;

    loadEmployeesForFastLogin(ownerUid, pvzId);
}

// Функция для загрузки сотрудников
async function loadEmployeesForFastLogin(ownerUid, pvzId) {
    const empRef = firebase.database().ref(`users/${ownerUid}/employees/${pvzId}`);
    const snap = await empRef.once('value');
    let employees = [];

    if (snap.exists()) {
        employees = Object.values(snap.val());
    } else {
        // Создаем дефолтного сотрудника, если пусто (Собственник)
        const defaultEmp = {
            id: Math.floor(100000000 + Math.random() * 900000000).toString(),
            lastName: 'Собственник',
            firstName: 'ПВЗ',
            patronymic: '',
            role: 'owner',
            phone: window.currentLoginId || ''
        };
        await empRef.child(defaultEmp.id).set(defaultEmp);
        employees.push(defaultEmp);
    }

    const list = document.querySelector('.manager-list');
    list.innerHTML = '';
    
    if (employees.length === 0) {
        list.innerHTML = '<p style="text-align:center; padding: 20px;">Сотрудники не найдены.</p>';
    }

    employees.forEach(emp => {
        const item = document.createElement('div');
        item.className = 'manager-item';
        item.innerHTML = `<strong>${emp.lastName} ${emp.firstName}</strong><span>${emp.role === 'owner' ? 'Собственник ПВЗ' : 'Менеджер'}</span>`;
        item.addEventListener('click', () => {
            handleEmployeeClick(emp, ownerUid, pvzId);
        });
        list.appendChild(item);
    });

    document.getElementById('pvz-selection-screen').style.display = 'none';
    document.getElementById('manager-selection-screen').style.display = 'block';
}

// ШАГ 5: Обработка клика по сотруднику (Логика первичной авторизации и ПИН-кода)
async function handleEmployeeClick(emp, ownerUid, pvzId) {
    let authEmps = JSON.parse(localStorage.getItem('authDeviceEmps') || '{}');
    let isAuthorized = authEmps[emp.id] === true;
    
    // Проверяем, совпадает ли введенный при текущем логине номер с номером сотрудника
    let phoneMatches = false;
    if (window.currentLoginId && emp.phone) {
        phoneMatches = window.currentLoginId === emp.phone;
    }

    // Если сотрудник еще не авторизован на этом устройстве И мы не зашли сейчас под его номером
    if (!isAuthorized && !phoneMatches) {
        // Требуется первичная авторизация!
        document.getElementById('manager-selection-screen').style.display = 'none';
        document.getElementById('main-auth-form').style.display = 'block';
        document.getElementById('step-email-confirm').style.display = 'none';
        document.getElementById('step-phone').style.display = 'block';

        const warningEl = document.getElementById('primary-auth-warning');
        warningEl.style.display = 'flex';
        
        // Очищаем контекст логина, чтобы заставить ввести номер
        window.currentLoginId = null;
        return;
    }

    // Если проверку прошли - готовим экран ПИН-кода
    window.currentSelectedEmp = emp;
    window.currentOwnerUid = ownerUid;
    window.currentPvzId = pvzId;

    document.getElementById('manager-selection-screen').style.display = 'none';
    document.getElementById('pin-screen').style.display = 'block';

    const empRef = firebase.database().ref(`users/${ownerUid}/employees/${pvzId}/${emp.id}`);
    const snap = await empRef.once('value');
    const empData = snap.val();
    window.currentEmpPin = empData.pin || null;

    const pinTitle = document.getElementById('pin-title');
    const pinInput = document.getElementById('pin-input');
    const forgotLink = document.getElementById('forgot-pin-link');
    const pinError = document.getElementById('pin-error-message');

    pinInput.value = '';
    pinError.style.display = 'none';

    if (window.resettingPinForEmpId === emp.id) {
        // Установка НОВОГО пин кода после нажатия "Не помню"
        pinTitle.textContent = 'Установите новый пин код';
        forgotLink.style.display = 'none';
        document.getElementById('pin-submit-btn').innerHTML = '<span>Сохранить и войти</span>';
        window.pinMode = 'reset';
    } else if (!window.currentEmpPin) {
        // Установка пин кода ПЕРВЫЙ РАЗ
        pinTitle.textContent = 'Установите пин код';
        forgotLink.style.display = 'none';
        document.getElementById('pin-submit-btn').innerHTML = '<span>Сохранить и войти</span>';
        window.pinMode = 'setup';
    } else {
        // Стандартный вход
        pinTitle.textContent = 'Введите пин код';
        forgotLink.style.display = 'block';
        document.getElementById('pin-submit-btn').innerHTML = '<span>Войти</span>';
        window.pinMode = 'enter';
    }
}

// Забыли ПИН-код: возврат в начало (Шаг 1)
function handleForgotPin() {
    window.resettingPinForEmpId = window.currentSelectedEmp.id;
    document.getElementById('pin-screen').style.display = 'none';
    document.getElementById('main-auth-form').style.display = 'block';
    document.getElementById('step-email-confirm').style.display = 'none';
    document.getElementById('step-phone').style.display = 'block';

    // Скрываем желтое уведомление, если оно висело
    document.getElementById('primary-auth-warning').style.display = 'none';

    // Подставляем номер сотрудника
    const phoneInput = document.getElementById('login-id');
    if (window.currentSelectedEmp.phone) {
        const cleanPhone = window.currentSelectedEmp.phone.replace(/\D/g, '').slice(-10);
        phoneInput.value = cleanPhone;
    }
}

// Отправка/Проверка ПИН-кода
async function submitPin() {
    const pin = document.getElementById('pin-input').value;
    const errorEl = document.getElementById('pin-error-message');
    const submitBtn = document.getElementById('pin-submit-btn');

    if (!pin || pin.length > 5) {
        errorEl.textContent = 'Пин код должен содержать до 5 цифр.';
        errorEl.style.display = 'block';
        return;
    }

    errorEl.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<div class="button-spinner"></div>`;

    try {
        if (window.pinMode === 'setup' || window.pinMode === 'reset') {
            // Сохраняем новый ПИН в БД (пароль больше не требуется)
            const empRef = firebase.database().ref(`users/${window.currentOwnerUid}/employees/${window.currentPvzId}/${window.currentSelectedEmp.id}`);
            await empRef.child('pin').set(pin);
            window.currentEmpPin = pin;
            
            // Сбрасываем флаг восстановления
            window.resettingPinForEmpId = null;

        } else if (window.pinMode === 'enter') {
            if (pin !== window.currentEmpPin) {
                throw new Error('Неверный пин код.');
            }
        }

        // Авторизуем устройство для этого сотрудника навсегда
        let authEmps = JSON.parse(localStorage.getItem('authDeviceEmps') || '{}');
        authEmps[window.currentSelectedEmp.id] = true;
        localStorage.setItem('authDeviceEmps', JSON.stringify(authEmps));

        // Выполняем вход в рабочую область
        sessionStorage.setItem('currentManager', `${window.currentSelectedEmp.firstName} ${window.currentSelectedEmp.lastName}`);
        sessionStorage.setItem('currentManagerId', window.currentSelectedEmp.id);
        sessionStorage.setItem('currentManagerRole', window.currentSelectedEmp.role);
        sessionStorage.setItem('showServerLoading', 'true');
        
        window.location.href = 'index.html';

    } catch (e) {
        errorEl.textContent = e.message;
        errorEl.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = window.pinMode === 'enter' ? `<span>Войти</span>` : `<span>Сохранить и войти</span>`;
    }
}