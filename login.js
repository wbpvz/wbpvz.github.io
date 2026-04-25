document.addEventListener('DOMContentLoaded', () => {
    const isLoginPage = !!document.getElementById('login-btn');
    const isRegisterPage = !!document.getElementById('register-btn');

    document.querySelectorAll('.password-group').forEach(group => {
        const toggleBtn = group.querySelector('.password-toggle');
        const passwordInput = group.querySelector('input[type="password"]');
        if(toggleBtn && passwordInput) {
            toggleBtn.addEventListener('click', () => {
                const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                passwordInput.setAttribute('type', type);
                toggleBtn.innerHTML = type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
            });
        }
    });

    if (isLoginPage) {
        initCountrySelector('login-phone-wrapper');

        document.getElementById('login-btn').addEventListener('click', handleLogin);
        document.getElementById('login-password').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLogin();
        });

        document.getElementById('forgot-password-link').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('recovery-step1').style.display = 'block';
            document.getElementById('recovery-step2').style.display = 'none';
            document.getElementById('recovery-email').value = '';
            toggleModal('recovery-modal', true);
        });
        
        document.getElementById('check-recovery-email-btn').addEventListener('click', handleCheckRecoveryEmail);
        document.getElementById('recovery-confirm-yes').addEventListener('click', sendRecoveryLink);
        document.getElementById('recovery-confirm-no').addEventListener('click', () => {
            toggleModal('recovery-modal', false);
        });
        
        document.querySelector('#recovery-modal .close-modal-btn')?.addEventListener('click', () => {
             toggleModal('recovery-modal', false);
        });

        document.getElementById('pvz-not-found-btn')?.addEventListener('click', () => {
             alert("Извините за временное неудобство! Возможно мы не активировали ваш ПВЗ в системе WB, если ПВЗ не появится в течении 15 минут, сообщите об этом нас на сайте pvz.wb.ru в разделе помощник!");
        });

        // Авторизация
        firebase.auth().onAuthStateChanged(async user => {
            if (user && window.location.pathname.includes('login.html')) {
                const hasPvz = localStorage.getItem('savedPvzId'); // ПВЗ запомнен навсегда
                const hasManager = sessionStorage.getItem('currentManager'); // Менеджер сбрасывается каждую сессию

                if (hasPvz && hasManager) {
                    window.location.href = 'index.html';
                } else if (hasPvz && !hasManager) {
                    // ПВЗ есть, но менеджера нет
                    document.getElementById('main-auth-form').style.display = 'none';
                    
                    const pvzSnap = await firebase.database().ref('users/' + user.uid + '/pvzInfo').once('value');
                    let pvzList = [];
                    const pvzInfo = pvzSnap.val();
                    if (pvzInfo && typeof pvzInfo === 'object') {
                        if (Array.isArray(pvzInfo)) pvzList = pvzInfo;
                        else if (pvzInfo.pvzId) pvzList = [pvzInfo]; 
                        else pvzList = Object.values(pvzInfo);
                    }
                    
                    const savedPvz = pvzList.find(p => p.pvzId === hasPvz) || pvzList[0];
                    if (savedPvz) {
                        selectPvzAndProceed(savedPvz);
                    } else {
                        showPvzSelectionScreen(pvzInfo);
                    }
                } else {
                    document.getElementById('main-auth-form').style.display = 'none';
                    const pvzSnap = await firebase.database().ref('users/' + user.uid + '/pvzInfo').once('value');
                    showPvzSelectionScreen(pvzSnap.val());
                }
            }
        });

    } else if (isRegisterPage) {
        initCountrySelector('reg-phone-wrapper');
        initCountrySelector('owner-phone-wrapper');
        setupRegisterLogic();
    }
});

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

async function handleLogin() {
    const phoneInputEl = document.getElementById('login-id');
    const countryCode = phoneInputEl.dataset.countryCode || '7';
    const phoneInput = phoneInputEl.value.trim();
    const cleanPhoneInput = phoneInput.replace(/\D/g, ''); 
    const loginId = countryCode + cleanPhoneInput;
    
    const password = document.getElementById('login-password').value;
    const rememberMe = document.getElementById('remember-me').checked;
    const errorEl = document.getElementById('error-message');
    const loginBtn = document.getElementById('login-btn');

    if (!cleanPhoneInput || !password) {
        errorEl.textContent = 'Пожалуйста, заполните все поля.';
        errorEl.style.display = 'block';
        return;
    }

    loginBtn.disabled = true;
    loginBtn.innerHTML = `<div class="button-spinner"></div> <span>Вход...</span>`;
    errorEl.style.display = 'none';

    try {
        const phoneIndexRef = firebase.database().ref('phoneIndex/' + loginId);
        const phoneSnapshot = await phoneIndexRef.once('value');
        
        if (!phoneSnapshot.exists()) {
            throw new Error("Пользователь с таким номером не найден.");
        }
        const uid = phoneSnapshot.val();

        let email = null;
        const userRef = firebase.database().ref('users/' + uid);
        const userSnap = await userRef.once('value');
        const userData = userSnap.val();
        
        if(userData && userData.email) {
            email = userData.email;
        } else if (userData && userData.pvzInfo && userData.pvzInfo.email) {
            email = userData.pvzInfo.email;
        } else if (userData && userData.pvzInfo && typeof userData.pvzInfo === 'object') {
            const firstPvz = Object.values(userData.pvzInfo)[0];
            if (firstPvz && firstPvz.email) email = firstPvz.email;
        }
        
        if (!email) throw new Error("Ошибка данных аккаунта. Email не найден.");
        
        const persistence = rememberMe ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION;
        await firebase.auth().setPersistence(persistence);
        localStorage.setItem('rememberMe', rememberMe); 
        
        await firebase.auth().signInWithEmailAndPassword(email, password);
        showPvzSelectionScreen(userData.pvzInfo);
        
        loginBtn.disabled = false;
        loginBtn.innerHTML = `<span>Войти</span>`;

    } catch (error) {
        errorEl.textContent = error.code === 'auth/wrong-password' ? 'Неверный пароль.' : (error.message || 'Ошибка входа.');
        errorEl.style.display = 'block';
        loginBtn.disabled = false;
        loginBtn.innerHTML = `<span>Войти</span>`;
    }
}

function showPvzSelectionScreen(pvzInfo) {
    document.getElementById('main-auth-form').style.display = 'none';
    document.getElementById('manager-selection-screen').style.display = 'none';
    
    const listContainer = document.getElementById('pvz-list-container');
    listContainer.innerHTML = '';

    let pvzList = [];
    if (pvzInfo && typeof pvzInfo === 'object') {
        if (Array.isArray(pvzInfo)) pvzList = pvzInfo;
        else if (pvzInfo.pvzId) pvzList = [pvzInfo]; 
        else pvzList = Object.values(pvzInfo);
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

async function selectPvzAndProceed(selectedPvz) {
    if(selectedPvz.pvzId) {
        localStorage.setItem('savedPvzId', selectedPvz.pvzId);
    }
    
    document.getElementById('pvz-selection-screen').style.display = 'none';

    const uid = firebase.auth().currentUser.uid;
    const pvzId = selectedPvz.pvzId;
    
    const empRef = firebase.database().ref(`users/${uid}/employees/${pvzId}`);
    const snap = await empRef.once('value');
    let employees = [];

    if (snap.exists()) {
        employees = Object.values(snap.val());
    } else {
        const defaultEmp = {
            id: selectedPvz.employeeId || Math.floor(100000000 + Math.random() * 900000000).toString(),
            lastName: 'Собственник',
            firstName: 'ПВЗ',
            patronymic: '',
            role: 'owner',
            phone: selectedPvz.phone || ''
        };
        await empRef.child(defaultEmp.id).set(defaultEmp);
        employees.push(defaultEmp);
    }

    const list = document.querySelector('.manager-list');
    list.innerHTML = '';
    employees.forEach(emp => {
        const item = document.createElement('div');
        item.className = 'manager-item';
        item.innerHTML = `<strong>${emp.lastName} ${emp.firstName}</strong><span>${emp.role === 'owner' ? 'Собственник ПВЗ' : 'Менеджер'}</span>`;
        item.addEventListener('click', () => {
            sessionStorage.setItem('currentManager', `${emp.firstName} ${emp.lastName}`);
            sessionStorage.setItem('currentManagerId', emp.id);
            sessionStorage.setItem('currentManagerRole', emp.role);
            sessionStorage.setItem('showServerLoading', 'true'); // <-- Вот этот флаг моментально включит загрузку
            window.location.href = 'index.html';
        });
        list.appendChild(item);
    });

    document.getElementById('manager-selection-screen').style.display = 'block';
}

let recoveryTargetEmail = '';

async function handleCheckRecoveryEmail() {
    const email = document.getElementById('recovery-email').value.trim();
    const errorEl = document.getElementById('recovery-error-message');
    const btn = document.getElementById('check-recovery-email-btn');
    
    if (!email) { errorEl.textContent = 'Введите Email.'; errorEl.style.display = 'block'; return; }
    errorEl.style.display = 'none'; 
    btn.disabled = true;

    try {
        const usersRef = firebase.database().ref('users');
        const snapshot = await usersRef.orderByChild('email').equalTo(email).once('value');
        
        if (snapshot.exists()) {
            const usersData = snapshot.val();
            const uid = Object.keys(usersData)[0];
            const userData = usersData[uid];
            
            let address = 'Адрес скрыт или не указан';
            if(userData.pvzInfo && userData.pvzInfo.address) address = userData.pvzInfo.address;
            
            recoveryTargetEmail = email;
            
            document.getElementById('recovery-step1').style.display = 'none';
            document.getElementById('recovery-step2').style.display = 'block';
            document.getElementById('recovery-pvz-address').textContent = address;
        } else {
            errorEl.textContent = 'Пользователь с таким Email не найден.'; 
            errorEl.style.display = 'block';
        }
    } catch (error) {
        errorEl.textContent = 'Ошибка проверки базы данных.'; 
        errorEl.style.display = 'block';
        console.error(error);
    } finally { 
        btn.disabled = false; 
    }
}

async function sendRecoveryLink() {
    if(!recoveryTargetEmail) return;
    try {
        await firebase.auth().sendPasswordResetEmail(recoveryTargetEmail);
        toggleModal('recovery-modal', false);
        alert('На вашу почту отправлено письмо с восстановлением пароля. Не забудьте также проверить папку "Спам" в вашем почтовом клиенте.');
    } catch (e) {
        alert('Ошибка при отправке письма: ' + e.message);
    }
}

function setupRegisterLogic() {
    document.getElementById('next-btn-step1').addEventListener('click', () => {
        const phone = document.getElementById('reg-phone').value.trim();
        const pass = document.getElementById('reg-password').value;
        const err = document.getElementById('error-message-step1');
        
        if (phone.length < 7 || pass.length < 8) {
            err.textContent = 'Проверьте корректность данных (пароль мин. 8 символов)';
            err.style.display = 'block';
            return;
        }
        err.style.display = 'none';
        document.getElementById('step1').classList.remove('active');
        document.getElementById('step2').classList.add('active');
    });

    document.getElementById('next-btn-step2').addEventListener('click', () => {
        const address = document.getElementById('reg-address').value.trim();
        const fittingRooms = document.getElementById('reg-fitting-rooms').value;
        const workHours = document.getElementById('reg-work-hours').value.trim();
        const errorStep2 = document.getElementById('error-message-step2');

        if (!address || !fittingRooms || !workHours) {
            errorStep2.textContent = 'Заполните все поля о ПВЗ'; 
            errorStep2.style.display = 'block'; 
            return;
        }
        errorStep2.style.display = 'none';
        document.getElementById('step2').classList.remove('active');
        document.getElementById('step3').classList.add('active');
    });

    document.getElementById('register-btn').addEventListener('click', handleRegister);
}

async function handleRegister() {
    const loginPhoneEl = document.getElementById('reg-phone');
    const loginCountryCode = loginPhoneEl.dataset.countryCode || '7';
    const loginPhoneClean = loginPhoneEl.value.replace(/\D/g, '');
    const loginIdFull = loginCountryCode + loginPhoneClean;
    const password = document.getElementById('reg-password').value;

    const address = document.getElementById('reg-address').value.trim();
    const fittingRooms = document.getElementById('reg-fitting-rooms').value;
    const workHours = document.getElementById('reg-work-hours').value.trim();
    
    const lName = document.getElementById('owner-last-name').value.trim();
    const fName = document.getElementById('owner-first-name').value.trim();
    const pName = document.getElementById('owner-patronymic').value.trim();
    const dob = document.getElementById('owner-dob').value;
    const email = document.getElementById('owner-email').value.trim();
    
    const ownerPhoneEl = document.getElementById('owner-phone');
    const ownerCountryCode = ownerPhoneEl.dataset.countryCode || '7';
    const ownerPhoneClean = ownerPhoneEl.value.replace(/\D/g, '');
    const ownerPhoneFull = ownerCountryCode + ownerPhoneClean;

    const errorStep3 = document.getElementById('error-message-step3');

    if (!lName || !fName || !dob || !email || !ownerPhoneClean) {
        errorStep3.textContent = 'Заполните все обязательные поля'; 
        errorStep3.style.display = 'block'; 
        return;
    }

    document.getElementById('step3').classList.remove('active');
    document.getElementById('step-loading').classList.add('active');

    try {
        const phoneRef = firebase.database().ref('phoneIndex/' + loginIdFull);
        const snap = await phoneRef.once('value');
        if (snap.exists()) throw new Error("Этот номер для входа уже зарегистрирован.");

        const userCred = await firebase.auth().createUserWithEmailAndPassword(email, password);
        const uid = userCred.user.uid;

        const pvzId = Math.floor(100000 + Math.random() * 900000).toString();
        const empId = Math.floor(100000000 + Math.random() * 900000000).toString(); 

        const pvzInfo = { pvzId, address, fittingRooms, workHours, email, phone: loginIdFull, employeeId: empId };

        await firebase.database().ref('users/' + uid).set({
            phone: loginIdFull, 
            email: email, 
            pvzInfo: pvzInfo, 
            data: {}
        });

        await firebase.database().ref(`users/${uid}/employees/${pvzId}/${empId}`).set({
            id: empId, 
            lastName: lName, 
            firstName: fName, 
            patronymic: pName, 
            dob: dob,
            role: 'owner', 
            phone: ownerPhoneFull, 
            email: email
        });

        await phoneRef.set(uid);

        document.getElementById('step-loading').classList.remove('active');
        document.getElementById('step-success').classList.add('active');

        document.getElementById('new-login-id').textContent = loginIdFull;
        document.getElementById('new-login-password').textContent = password;
        document.getElementById('new-pvz-id').textContent = pvzId;

        await firebase.auth().signOut(); 
    } catch (error) {
        document.getElementById('step-loading').classList.remove('active');
        document.getElementById('step3').classList.add('active');
        errorStep3.textContent = error.message; 
        errorStep3.style.display = 'block';
    }
}

function toggleModal(modalId, show) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    if (show) { modal.style.display = 'flex'; setTimeout(() => modal.classList.add('visible'), 10); } 
    else { modal.classList.remove('visible'); setTimeout(() => { modal.style.display = 'none'; }, 300); }
}