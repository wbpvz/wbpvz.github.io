/* =============================================================================
   returns.js — страница «Возврат → Товары» (returns.html)
   Точка входа: window.initVozvratTovaryPage() — её вызывает p_shared.js

   Данные (userData = getUserData()):
     userData.returnsItems  — массив товаров на возврат (confirmed:false = ещё не в коробке)
     userData.returnBoxes   — возвратные коробки (id вида TRBX + 10 цифр, см. r2.js)
     userData.issuedHistory — история выдачи (источник для «Возврат от клиента»)

   Товар возврата (поля, которые используются на карточке):
     code        — ШК товара (10 цифр): первые 6 серые, последние 4 чёрные
     barcode     — баркод
     cell        — ячейка
     name, size, color, image, isAdult
     isDefective — отметка о браке (красная лента, как в приёмке)
     defectiveInfo { filled, reason, comment, photos, filledAt } — форма о браке:
                    filled=true — форму заполнили; photos — всегда прочерк '—' (сами фото не храним)

   Что делает страница:
     • карточки товаров (как в приёмке, но вертикальным прямоугольником);
     • plus.svg (справа внизу карточки) → окно с описанием товара (как в выдаче) + «Добавлен в возвраты»;
     • кнопка «Действия с товаром» → меню открывается ВНУТРИ картинки именно этой карточки:
       Вернуть без ШК / Отметить брак (или Добавить фото брака → Изменить форму, когда форма заполнена) /
       Снять отметку о браке (отметка брака — БЕЗ звука);
     • форма о браке: фото грузятся в Cloudinary так же, как в register.js, в базу пишутся ссылки;
     • «Вернуть без ШК» → окно занимает место списка: сайдбар слева и верхняя навигационная панель
       (на телефоне — нижняя навигация) ВСЕГДА остаются на экране, а в основной части — белый
       прямоугольник со слегка скруглёнными углами, внутри которого всё содержимое. 2 шага:
       шаг 1 (в начале звучит scan_box_sticker.mp3) — стикер открытой коробки TRBX + 10 цифр →
       шаг 2 — проверка и «Добавить товар» (товар попадает в коробку);
     • «Возврат от клиента»: любые 6 цифр → любые 10 цифр → любой товар (50% без брака / 50% с браком,
       форма брака уже заполнена клиентом) → подтверждение; при открытии окна звучит scan_client_code.mp3;
       излишки, которые ОСТАЛИСЬ в возвратах (userData.surplusItems, status 'unassigned': проверка прошла, ячейки нет)
       — полноценные карточки: «Действия с товаром» (Вернуть без ШК / Отметить брак / форма брака / Снять отметку),
       кнопка plus.svg (описание товара) и тот же поток «Вернуть без ШК», как у обычных товаров.
       Ячейка «-», на картинке «Товар - излишек». Настоящих данных у излишка нет: везде (карточка, окно plus, проверка,
       коробка) он просто «Товар излишек». Когда такой излишек попал в возвратную коробку — он удаляется
       из surplusItems. Излишки «на проверке» (status 'checking') остаются без действий — пока идёт проверка, их нельзя трогать;
       на КАРТИНКЕ карточки слева сверху просто иконка home.svg 24×24 (без обводки); у такого товара в меню
       «Действия с товаром» доступна только «Вернуть без ШК»; когда возврат завершён и модалка закрылась —
       звучит return_accepted.mp3.
   ============================================================================= */
(function () {
    'use strict';

    const RT_DEADLINE_HOURS = 24;          // срок добавления в коробку
    const RT_MAX_BOX_ITEMS = 60;           // как MAX_ITEMS_IN_BOX в r2.js
    const RT_BOX_RE = /^TRBX\d{10}$/;      // коробка: TRBX + 10 цифр
    const RT_BOX_MAX = 14;                 // длина стикера: 4 буквы + 10 цифр
    const RT_MAX_PHOTOS = 4;               // фото брака
    const RT_CLOUD_NAME = 'gj7aiofx';      // Cloudinary — те же данные, что в register.js
    const RT_UPLOAD_PRESET = 'wb_pvz_photos';
    const RT_DEFECT_REASONS = [
        'Биологические пятна', 'Вещи из разных комплектов', 'Дефект ткани', 'Дефект швов',
        'Деформация/Вмятины', 'Дыры', 'Загрязнения', 'Залито', 'Запайка',
        'Испорчено грызунами', 'Косметические пятна', 'Маркер/ручка', 'Недокомплект',
        'Некачественная фурнитура', 'Неполный набор', 'Отклонения в размерах',
        'Отсутствие аксессуара/декора', 'Отсутствие русскоязычной маркировки',
        'Перекос и натяжение', 'Подмена', 'Порез', 'Потёртости/царапины', 'Пыль/грязь',
        'Разнопарка', 'Разрежение ткани', 'Разрыв строчки в ткани', 'Разрыв шва',
        'Следы разметки', 'Упаковка - неотъемлемая часть товара, нарушена',
        'Химические пятна', 'Цвет и структура', 'Другое'
    ];

    // Комментарии, которые «оставил клиент» при возврате бракованного товара
    const RT_CLIENT_DEFECT_COMMENTS = [
        'Клиент заявил брак при примерке', 'Брак обнаружен клиентом после получения',
        'Клиент приложил фото брака в приложении', 'Клиент указал дефект при оформлении возврата'
    ];
    function randomOf(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    let rtInited = false;
    let rtVisible = [];                    // товары, показанные сейчас в сетке
    let rtCandidates = [];                 // товары из истории клиента (для шага 2 «Возврата от клиента»)
    const rtState = { clientCode: null, cand: null };
    let rtMenuCode = null;                                  // ШК товара, у которого сейчас открыто меню «Действия с товаром»
    const rtFlow = { item: null, boxId: null, step: 1 };    // «Вернуть без ШК»
    const rtDefect = { item: null, photos: [], saving: false };   // форма о браке; photos: [{file?, url?, previewUrl}]

    const RT_SOURCE_LABELS = {
        refusal: 'Отказ клиента', refused: 'Отказ клиента',
        cancel: 'Автоотмена', autocancel: 'Автоотмена',
        surplus: 'Излишек', customer: 'Возврат от клиента', home: 'Возврат от клиента'
    };

    /* ---------- утилиты ---------- */
    function esc(v) {
        return String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }
    function pick(obj, keys, def) {
        if (!obj) return def;
        for (const k of keys) {
            if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
        }
        return def;
    }
    function digits(v) { return String(v === undefined || v === null ? '' : v).replace(/\D/g, ''); }
    // Firebase превращает массивы с «дырками» в объекты — приводим обратно
    function toArray(v) {
        if (Array.isArray(v)) return v.filter(x => x !== null && x !== undefined);
        if (v && typeof v === 'object') return Object.values(v).filter(x => x !== null && x !== undefined);
        return [];
    }
    // код для «Возврата от клиента» (как было раньше)
    function itemCode(it) { return String(pick(it, ['barcode', 'code', 'shk', 'sku', 'article'], '')); }
    // ШК товара (10 цифр) — то, что показывается на карточке
    function itemShk(it) { return String(pick(it, ['code', 'shk'], pick(it, ['barcode', 'sku', 'article'], ''))); }
    function itemBarcode(it) { return String(pick(it, ['barcode'], '')); }
    function itemName(it) { return String(pick(it, ['name', 'title', 'productName'], 'Товар')); }
    function itemBrand(it) { return String(pick(it, ['brand', 'brandName'], '')); }
    function itemImg(it) { return String(pick(it, ['img', 'image', 'imageUrl', 'photo', 'picture', 'thumbnail'], '')); }
    function itemSize(it) { return String(pick(it, ['size'], '')); }
    function itemColor(it) { return String(pick(it, ['color', 'colour'], '')); }
    function itemPrice(it) {
        const p = Number(pick(it, ['price', 'cost', 'sum', 'amount'], NaN));
        return isNaN(p) ? null : p;
    }
    // Ячейка с учётом перенаправлений (cellChanges), как в приёмке
    function itemCell(it) {
        const raw = pick(it, ['cell', 'cellNumber'], '');
        if (raw === '') return '—';
        const changes = (getUserData().cellChanges) || {};
        const actual = changes[raw] ? changes[raw] : raw;
        const n = parseInt(actual, 10);
        return isNaN(n) ? String(actual) : String(n);
    }
    function itemTime(it) {
        const v = pick(it, ['date', 'timestamp', 'createdAt', 'addedAt', 'refusedAt'], null);
        if (v === null) return null;
        if (typeof v === 'number') return v;
        if (/^\d{10,}$/.test(String(v))) return Number(v);
        const t = Date.parse(v);
        return isNaN(t) ? null : t;
    }
    // Излишек, который остался в «Возвратах» (userData.surplusItems, status 'unassigned') либо старая запись returnsItems с source 'surplus'
    function isSurplusItem(it) {
        return !!(it && (it.source === 'surplus' || it.status === 'unassigned'));
    }
    // ячейка для показа: у излишка без ячейки — «-»
    function cellText(it) {
        const c = itemCell(it);
        return (c === '—' && isSurplusItem(it)) ? '-' : c;
    }
    function surplusFoundTime(it) {
        const t = Number(it && it.foundAt);
        return t > 0 ? t : itemTime(it);
    }
    function fmtDate(ms) {
        if (!ms) return '—';
        return typeof window.formatEpochToMSK === 'function' ? window.formatEpochToMSK(ms) : new Date(ms).toLocaleString('ru-RU');
    }
    function fmtPrice(p) { return p === null ? '' : p.toLocaleString('ru-RU') + ' ₽'; }
    function itemReason(it) {
        return String(it.reason || RT_SOURCE_LABELS[it.source] || 'Возврат');
    }
    // «1234567890» → первые 6 серые, пробел, последние 4 чёрные (как в приёмке)
    function fmtShk(code) {
        const s = String(code || '');
        if (!s) return '<b>—</b>';
        const splitAt = Math.max(s.length - 4, 0);
        if (splitAt > 0) return `${esc(s.slice(0, splitAt))} <b>${esc(s.slice(splitAt))}</b>`;
        return `<b>${esc(s)}</b>`;
    }
    function deadlineInfo(it) {
        const explicit = Number(it.deadline);
        const start = itemTime(it);
        const deadline = explicit > 0 ? explicit : (start ? start + RT_DEADLINE_HOURS * 3600000 : null);
        if (!deadline) return null;
        const left = deadline - Date.now();
        if (left <= 0) return { expired: true, text: 'Срок истёк', deadline };
        const h = Math.floor(left / 3600000);
        const m = Math.floor((left % 3600000) / 60000);
        return { expired: false, text: `Осталось ${h} ч ${m} мин`, deadline };
    }
    // Форма о браке заполнена? (filled:true; для старых записей — есть и причина, и комментарий)
    function isFormFilled(it) {
        const di = it && it.defectiveInfo;
        if (!di || typeof di !== 'object') return false;
        if (di.filled === true) return true;
        if (di.filled === false) return false;
        return !!(di.reason && di.comment && di.reason !== '—');
    }
    // Время приёмки товара: своё поле → запись в receptionItems по ШК
    function receptionTime(it) {
        const own = pick(it, ['receptionDate', 'receivedAt', 'acceptedAt'], null);
        if (own) {
            const t = typeof own === 'number' ? own : Date.parse(own);
            if (!isNaN(t)) return t;
        }
        const shk = String(itemShk(it));
        const rec = toArray(getUserData().receptionItems).find(r => r && String(r.code) === shk);
        if (rec && rec.date) {
            const t = Date.parse(rec.date);
            if (!isNaN(t)) return t;
        }
        return null;
    }
    function fmtRuDate(ms) {
        if (!ms) return 'Неизвестно';
        return new Date(ms).toLocaleString('ru-RU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }
    function playSound(id) {
        try {
            const el = document.getElementById(id);
            if (el) { el.currentTime = 0; const p = el.play(); if (p && p.catch) p.catch(() => {}); }
        } catch (e) { /* звук не критичен */ }
    }
    function playScanSound() { playSound('scanner-sound'); }
    // сначала failScan, потом голосовой маркер (как в коробках)
    function playTwoSounds(firstId, secondId) {
        const first = document.getElementById(firstId);
        const second = document.getElementById(secondId);
        if (first && second) {
            first.currentTime = 0;
            const p = first.play(); if (p && p.catch) p.catch(() => {});
            first.onended = () => { playSound(secondId); first.onended = null; };
        } else if (second) {
            playSound(secondId);
        }
    }
    // Показ/скрытие модалок с отменой отложенного скрытия (иначе toggleModal(false) → toggleModal(true)
    // подряд приводит к тому, что окно через 0.3 с «схлопывается» само)
    const rtModalTimers = {};
    function rtShowModal(id) {
        const m = document.getElementById(id);
        if (!m) return;
        if (rtModalTimers[id]) { clearTimeout(rtModalTimers[id]); rtModalTimers[id] = null; }
        m.style.display = 'flex';
        setTimeout(() => m.classList.add('visible'), 10);
    }
    function rtHideModal(id) {
        const m = document.getElementById(id);
        if (!m) return;
        m.classList.remove('visible');
        if (rtModalTimers[id]) clearTimeout(rtModalTimers[id]);
        rtModalTimers[id] = setTimeout(() => { m.style.display = 'none'; rtModalTimers[id] = null; }, 300);
    }
    function rtToggle(id, show) { if (show) rtShowModal(id); else rtHideModal(id); }
    function rtIsShown(id) {
        const m = document.getElementById(id);
        return !!(m && (m.classList.contains('visible') || m.style.display === 'flex'));
    }
    // ссылки на фото брака, сохранённые в форме (в базе: массив ссылок или прочерк '—')
    function defectPhotoUrls(it) {
        const p = it && it.defectiveInfo && it.defectiveInfo.photos;
        return toArray(p).filter(x => typeof x === 'string' && /^(https?:|blob:|data:)/.test(x));
    }
    function err(msg) { showAlert(msg, true); }
    function persist() { saveUserData(getUserData()); }
    function refreshBadges() { if (typeof updateAllBadges === 'function') updateAllBadges(); }
    function imgHtml(it, cls) {
        const src = itemImg(it);
        return src
            ? `<img class="${cls}" src="${esc(src)}" alt="" onerror="this.style.visibility='hidden'">`
            : `<div class="${cls} rt-noimg"><i class="fas fa-box"></i></div>`;
    }
    // Картинка товара для новой карточки: 18+ — заглушка, настоящую не показываем
    function cardImgHtml(it) {
        if (isSurplusItem(it)) return '<div class="rt-surplus-text">Товар - излишек</div>';
        const adult = !!it.isAdult;
        const src = adult ? 'adult.svg' : itemImg(it);
        return src
            ? `<img class="rt-pimg-el${adult ? ' rt-adult' : ''}" src="${esc(src)}" alt="" draggable="false" onerror="this.style.visibility='hidden'">`
            : `<div class="rt-noimg rt-pimg-ph"><i class="fas fa-box"></i></div>`;
    }
    // Лента брака — ровно как в приёмке (классы rc-defect-* из styles.css)
    function ribbonHtml(it) {
        return it.isDefective ? `<div class="rc-defect-ribbon"><span>${'БРАК '.repeat(40)}</span></div>` : '';
    }

    /* ---------- стили (rt-*, чтобы не зависеть от styles.css) ---------- */
    function injectStyles() {
        if (document.getElementById('rt-styles')) return;
        const st = document.createElement('style');
        st.id = 'rt-styles';
        st.textContent = `
        /* --- старые элементы (окно деталей, «Возврат от клиента») --- */
        .rt-card{display:flex;gap:12px;padding:12px;border:1px solid var(--border-color,#e5e5ea);border-radius:var(--radius-sm,10px);cursor:pointer;color:var(--text-primary-color,inherit);box-shadow:var(--shadow-sm,none);text-align:left}
        .rt-card:hover{border-color:var(--primary,#a73afd)}
        .rt-thumb{width:88px;height:88px;border-radius:8px;object-fit:cover;flex-shrink:0}
        .rt-noimg{display:flex;align-items:center;justify-content:center;background:rgba(128,128,128,.15);color:var(--text-secondary-color,#888);font-size:1.4rem}
        .rt-body{min-width:0;flex:1;display:flex;flex-direction:column;gap:3px}
        .rt-name{font-weight:600;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
        .rt-sub{font-size:.85rem;color:var(--text-secondary-color,#888)}
        .rt-empty{grid-column:1/-1;text-align:center;padding:40px 10px;color:var(--text-secondary-color,#888)}
        .rt-detail{display:flex;flex-direction:column;gap:12px;text-align:left}
        .rt-detail-img{width:100%;max-height:260px;object-fit:contain;border-radius:10px}
        .rt-detail-img.rt-noimg{height:160px}
        .rt-row{display:flex;justify-content:space-between;gap:12px;font-size:.95rem;border-bottom:1px solid var(--border-color,#e5e5ea);padding:6px 0}
        .rt-row span:first-child{color:var(--text-secondary-color,#888)}
        .rt-row span:last-child{text-align:right;font-weight:500}
        .rt-pick{width:100%}

        /* --- сетка и карточки товаров (компактные) --- */
        #returns-unprocessed-container.product-cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;align-content:start;padding:0 0 24px;overflow:visible;flex-grow:0}
        .rt-pcard{container-type:inline-size;display:flex;flex-direction:column;gap:10px;padding:12px;min-width:0;position:relative;overflow:hidden;text-align:left;background:var(--content-bg-color,#fff);border:1px solid var(--gray-medium,#e0e0e0);border-radius:var(--radius-md,12px);box-shadow:var(--shadow-sm,none);color:var(--text-primary-color,#212121)}
        /* ячейка — как в выдаче (левая панель заказа): серый блок справа, подпись .85rem, число тонкое и крупное */
        .rt-pcell{position:relative;display:flex;flex-direction:column;align-items:flex-end;text-align:right;padding:10px 14px;background:var(--gray-lightest,#F8F9FA);border:1px solid var(--border-color,#E0E0E0);border-radius:var(--radius-md,12px);flex-shrink:0}
        /* home.svg — просто иконка 24×24 на картинке карточки, слева сверху (без обводки и подложки) */
        .rt-home-ico{position:absolute;top:10px;left:10px;z-index:25;width:24px;height:24px;display:block;object-fit:contain;pointer-events:none}
        .rt-pcell-label{font-size:.85rem;color:var(--text-secondary-color,#757575);margin-bottom:2px}
        .rt-pcell-num{font-size:clamp(2.6rem,26cqw,4rem);font-weight:300;line-height:1;color:var(--text-primary-color,#212121);margin-top:5px;white-space:nowrap}
        .rt-pimg{position:relative;width:100%;aspect-ratio:1/1;flex-shrink:0;overflow:hidden;border-radius:10px;background:var(--gray-lightest,#f8f9fa)}
        .rt-pimg>img.rt-pimg-el{display:block;width:100%;height:100%;object-fit:cover}
        .rt-pimg>img.rt-adult{object-fit:contain}
        .rt-pimg>.rt-pimg-ph{width:100%;height:100%;font-size:3rem}
        .rt-pimg .rc-defect-ribbon>span{font-size:clamp(.9rem,7.5cqw,1.4rem);letter-spacing:2px}
        .rt-plus-btn{position:absolute;right:10px;bottom:10px;width:38px;height:38px;padding:9px;box-sizing:border-box;background:rgba(255,255,255,.95);border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.3);cursor:pointer;z-index:30;transition:transform .2s}
        .rt-plus-btn:hover{transform:scale(1.12)}
        .rt-actions-btn{position:absolute;left:10px;bottom:10px;z-index:30;display:inline-flex;align-items:center;gap:5px;max-width:calc(100% - 66px);padding:7px 11px;background:#fff;color:#000;border:1.5px solid #000;border-radius:999px;font:inherit;font-size:clamp(.72rem,4.4cqw,.9rem);font-weight:600;line-height:1.1;white-space:nowrap;cursor:pointer}
        .rt-actions-btn img{width:14px;height:14px;flex-shrink:0;display:block}
        .rt-actions-btn span{overflow:hidden;text-overflow:ellipsis}
        .rt-pcode{font-family:'Roboto Mono',monospace;font-size:clamp(1rem,8.5cqw,1.4rem);line-height:1.1;font-weight:500;color:#b5b5b5;white-space:nowrap;overflow:hidden;flex-shrink:0}
        .rt-pcode b{color:#000;font-weight:700}
        .rt-pname{font-size:.95rem;font-weight:500;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;flex-shrink:0}
        .rt-pbarcode{font-size:.82rem;line-height:1.3;color:var(--text-secondary-color,#757575);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0}
        .rt-pbarcode b{color:var(--text-primary-color,#000)}

        /* меню «Действия с товаром» — лежит внутри картинки этой карточки (поверх ленты брака и кнопок) */
        .rt-menu{position:absolute;inset:0;z-index:40;display:none;flex-direction:column;gap:8px;padding:10px 10px 54px;box-sizing:border-box;background:rgba(0,0,0,.58);overflow-y:auto}
        .rt-menu.open{display:flex;animation:rtMenuIn .16s ease}
        .rt-menu>:first-child{margin-top:auto}
        @keyframes rtMenuIn{from{opacity:0}to{opacity:1}}
        .rt-menu-btn{flex-shrink:0;width:100%;padding:10px 12px;background:#fff;color:#000;border:1.5px solid #000;border-radius:12px;font:inherit;font-size:.86rem;font-weight:600;line-height:1.2;cursor:pointer}
        .rt-menu-btn.rt-red{border-color:#D32F2F;color:#D32F2F}
        /* «Скрыть» встаёт ровно на место «Действия с товаром» (та же позиция, тот же размер шрифта) */
        .rt-hide-btn{position:absolute;left:10px;bottom:10px;z-index:41;display:none;align-items:center;gap:5px;max-width:calc(100% - 66px);padding:7px 11px;background:#000;color:#fff;border:1.5px solid #000;border-radius:999px;font:inherit;font-size:clamp(.72rem,4.4cqw,.9rem);font-weight:600;line-height:1.1;white-space:nowrap;cursor:pointer}
        .rt-pcard.menu-open .rt-hide-btn{display:inline-flex}
        .rt-pcard.menu-open .rt-actions-btn,.rt-pcard.menu-open .rt-plus-btn{visibility:hidden}
        .rt-hide-btn img{width:14px;height:14px;flex-shrink:0;display:block;filter:brightness(0) invert(1)}

        /* фото брака в окне деталей */
        .rt-dthumbs{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}
        .rt-dthumb{width:44px;height:44px;object-fit:cover;border-radius:6px;cursor:zoom-in;border:1px solid var(--border-color,#e0e0e0)}

        /* окно деталей — на узком экране колонки друг под другом */
        @media (max-width:640px){#product-details-modal .pd-layout{flex-direction:column;gap:16px}#product-details-modal .pd-image-col{width:100%}#product-details-modal .product-details-content{padding:24px 18px;max-height:92vh;overflow-y:auto}}

        /* --- «Вернуть без ШК»: второй слой поверх всей страницы (старое не видно; слева остаётся сайдбар) --- */
        /* Окно лежит ВНУТРИ .main-content и занимает место списка товаров:
           сайдбар (слева) и верхняя навигационная панель остаются на месте, а в основной части —
           белый прямоугольник со слегка скруглёнными углами, внутри которого всё содержимое */
        .main-content.rt-flow-on>.returns-workspace,.main-content.rt-flow-on>.rt-mtabs{display:none !important}
        .rt-flow{display:none;flex:1 1 auto;min-width:0;min-height:0;box-sizing:border-box}
        .rt-flow.show{display:flex;animation:rtFlowIn .22s ease-out}
        @keyframes rtFlowIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        .rt-flow-panel{flex:1 1 auto;width:100%;min-width:0;min-height:0;display:flex;flex-direction:column;overflow-y:auto;box-sizing:border-box;padding:22px 26px;background:#fff;color:#000;border:1px solid var(--gray-medium,#e0e0e0);border-radius:12px}
        .rt-back{align-self:flex-start;display:inline-flex;align-items:center;gap:10px;padding:6px 0;background:none;border:none;font:inherit;font-size:1rem;font-weight:500;color:#000;cursor:pointer}
        .rt-stepper{display:flex;align-items:center;justify-content:center;margin:18px 0 22px}
        .rt-circle{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--light-purple-bg,#F3E5F5);color:var(--primary,#A73AFD);font-size:1.1rem;font-weight:700;flex-shrink:0}
        .rt-circle.done{background:var(--primary,#A73AFD);color:#fff}
        .rt-line{width:72px;height:3px;border-radius:2px;background:var(--primary-light,#E1BEE7)}
        .rt-stepper.s2 .rt-line{background:var(--primary,#A73AFD)}
        .rt-flow-title{margin:0 0 16px;text-align:center;font-size:1.15rem;font-weight:700;line-height:1.3;color:#000}
        .rt-title-row{display:flex;align-items:center;justify-content:center;gap:12px;margin:0 0 18px}
        .rt-title-row .rt-flow-title{margin:0}
        .rt-arrow{flex:0 0 auto;width:40px;height:40px;border-radius:50%;border:1px solid var(--border-color,#e0e0e0);background:#fff;color:#000;font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center}
        .rt-flow-video{display:block;width:min(260px,70%);margin:0 auto 18px;background:transparent;border:none;border-radius:0;mix-blend-mode:multiply;pointer-events:none}
        .rt-box-row{display:flex;align-items:center;gap:10px;width:100%;max-width:420px;margin:0 auto}
        .rt-box-input{flex:1;min-width:0;padding:14px;border:1px solid var(--border-color,#e0e0e0);border-radius:12px;background:#f8f9fa;outline:none;font-family:'Roboto Mono',monospace;font-size:1.1rem;letter-spacing:1px;text-align:center;text-transform:uppercase}
        .rt-box-input:focus{border-color:var(--primary,#a73afd);background:#fff}
        .rt-box-ok{flex:0 0 auto;width:52px;height:52px;border:none;border-radius:12px;background:var(--primary,#a73afd);color:#fff;font-size:1.2rem;cursor:pointer}
        .rt-check{display:flex;align-items:stretch;gap:14px;width:100%;max-width:520px;margin:0 auto;padding:12px;box-sizing:border-box;background:#fff;border:1px solid var(--gray-medium,#e0e0e0);border-radius:16px;box-shadow:0 4px 15px rgba(0,0,0,.05)}
        .rt-check-img{position:relative;flex:0 0 42%;max-width:170px;aspect-ratio:3/4;overflow:hidden;border-radius:10px;background:var(--gray-lightest,#f8f9fa)}
        .rt-check-img>img{display:block;width:100%;height:100%;object-fit:cover}
        .rt-check-img>img.rt-adult{object-fit:contain}
        .rt-check-img>.rt-noimg{width:100%;height:100%}
        .rt-check-img .rc-defect-ribbon>span{font-size:.85rem;line-height:1.9;letter-spacing:2px}
        .rt-check-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;text-align:left}
        .rt-check-info .rt-pcode{font-size:clamp(.95rem,4.6vw,1.3rem)}
        .rt-check-name{font-size:1rem;font-weight:500;line-height:1.25;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
        .rt-check-sc{font-size:.85rem;color:var(--text-secondary-color,#757575);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rt-check-sc b{color:#000;font-weight:600}
        .rt-pill-btn{align-self:flex-start;margin-top:auto;padding:11px 22px;border:none;border-radius:999px;background:var(--primary,#a73afd);color:#fff;font:inherit;font-size:.95rem;font-weight:600;cursor:pointer}

        /* --- форма о браке --- */
        .rt-label{display:block;margin-bottom:8px;font-weight:bold;color:var(--text-secondary-color,#757575)}
        .rt-select{appearance:none;width:100%;padding:12px 15px;font-size:16px;color:#374151;border:2px solid #e5e7eb;border-radius:10px;background-color:#f9fafb;cursor:pointer;outline:none;transition:all .3s ease;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 15px center;background-size:16px}
        .rt-select:focus,.rt-select:hover{border-color:#a855f7;background-color:#fff;box-shadow:0 0 0 4px rgba(168,85,247,.1)}
        .rt-textarea{width:100%;height:80px;resize:vertical;padding:12px;font:inherit;font-size:14px;border:2px solid #e5e7eb;border-radius:10px;background-color:#f9fafb;outline:none;transition:all .3s ease;box-sizing:border-box}
        .rt-textarea:focus{border-color:#a855f7;background-color:#fff;box-shadow:0 0 0 4px rgba(168,85,247,.1)}

        .rt-photo-del{position:absolute;top:4px;right:4px;z-index:2;width:22px;height:22px;padding:0;display:flex;align-items:center;justify-content:center;border:none;border-radius:50%;background:rgba(0,0,0,.68);color:#fff;font-size:.7rem;cursor:pointer}

        /* --- мобильные вкладки (Товары / Коробки) --- */
        .rt-mtabs{display:none;gap:8px;margin-bottom:10px;flex-shrink:0}
        .rt-mtabs a{flex:1;padding:10px 8px;text-align:center;text-decoration:none;font-size:.9rem;font-weight:600;color:var(--text-secondary-color,#757575);background:#fff;border:1px solid var(--border-color,#e0e0e0);border-radius:999px}
        .rt-mtabs a.active{color:#fff;background:var(--primary,#a73afd);border-color:var(--primary,#a73afd)}

        /* --- телефон: карточки на всю ширину экрана, вся страница прокручивается --- */
        @media (max-width:768px){
            .rt-mtabs{display:flex}
            .main-content{display:flex;flex-direction:column;padding:10px 12px}
            .returns-workspace{flex:1 1 auto;height:auto;min-height:0;flex-direction:column;gap:10px;overflow-y:auto;-webkit-overflow-scrolling:touch}
            .return-left-control-panel{display:contents}
            .return-left-control-panel>div[style*="flex-grow"]{display:none}
            .rl-grey-header.compact{order:1;width:100%;box-sizing:border-box;flex-shrink:0;flex-direction:row;justify-content:space-between;align-items:center}
            #customer-return-btn{order:2;width:100%;margin:0 !important;padding:12px !important;flex-shrink:0}
            .returns-grid-wrapper{order:3;flex:0 0 auto;overflow:visible;padding-right:0}
            .info-warning-banner{order:4;margin:0 !important;flex-shrink:0}
            #returns-unprocessed-container.product-cards-grid{grid-template-columns:minmax(0,1fr);gap:14px}
            .rt-pimg{aspect-ratio:1/.85}
            /* «Вернуть без ШК» на телефоне: нижняя навигация остаётся, белый прямоугольник — на всю основную часть */
            .rt-flow-panel{padding:14px 14px 18px;border-radius:12px}
        }
        /* --- излишек на проверке (карточка в «Возвратах») --- */
        .rt-surplus-card .rt-pimg{display:flex;align-items:center;justify-content:center}
        .rt-surplus-text{font-size:clamp(1.1rem,9cqw,1.6rem);font-weight:600;line-height:1.2;color:var(--text-primary-color,#212121);text-align:center;padding:0 14px}
        .rt-check-img.rt-check-sp{display:flex;align-items:center;justify-content:center}
        .rt-check-img.rt-check-sp .rt-surplus-text{font-size:1rem;padding:0 8px}
        .rt-surplus-badge{position:absolute;top:8px;left:8px;z-index:2;background:#FF9800 !important;color:#fff !important;font-weight:700;font-size:.82rem;line-height:1.1;padding:6px 10px;border-radius:2px !important;box-shadow:0 1px 3px rgba(0,0,0,.2)}
        `;
        document.head.appendChild(st);
    }

    /* ---------- список товаров ---------- */
    function getUnprocessed() {
        const ud = getUserData();
        return toArray(ud.returnsItems).filter(i => i && typeof i === 'object' && !i.confirmed);
    }

    // Товар пришёл через «Возврат от клиента»
    function isClientReturn(it) {
        return /^(customer|home)$/.test(String(it && it.source || ''));
    }

    // Кнопки меню «Действия с товаром» (зависят от того, отмечен ли брак и заполнена ли форма)
    function menuButtonsHtml(it) {
        let h = '<button type="button" class="rt-menu-btn" data-act="noshk">Вернуть без ШК</button>';
        // возврат от клиента: доступна ТОЛЬКО «Вернуть без ШК» (ни «Отметить брак», ни «Добавить фото брака»,
        // ни «Изменить форму», ни «Снять отметку о браке»)
        if (isClientReturn(it)) return h;
        if (!it.isDefective) {
            h += '<button type="button" class="rt-menu-btn rt-red" data-act="mark">Отметить брак</button>';
        } else {
            h += `<button type="button" class="rt-menu-btn" data-act="form">${isFormFilled(it) ? 'Изменить форму' : 'Добавить фото брака'}</button>`;
            h += '<button type="button" class="rt-menu-btn" data-act="unmark">Снять отметку о браке</button>';
        }
        return h;
    }

    function cardHtml(it, idx) {
        const bc = itemBarcode(it);
        const shk = String(itemShk(it));
        const open = rtMenuCode !== null && rtMenuCode === shk;
        const fromClient = /^(customer|home)$/.test(String(it.source || ''));
        const sp = isSurplusItem(it);
        const shownName = sp ? 'Товар излишек' : itemName(it);
        return `
        <div class="rt-pcard${sp ? ' rt-surplus-card' : ''}${open ? ' menu-open' : ''}" data-idx="${idx}" data-code="${esc(shk)}">
            <div class="rt-pcell">
                <span class="rt-pcell-label">Ячейка</span>
                <span class="rt-pcell-num">${esc(cellText(it))}</span>
            </div>
            <div class="rt-pimg">
                ${cardImgHtml(it)}
                ${ribbonHtml(it)}
                ${fromClient ? '<img src="home.svg" class="rt-home-ico" width="24" height="24" alt="Возврат от клиента" title="Возврат от клиента" draggable="false" onerror="this.style.visibility=\'hidden\'">' : ''}
                <button type="button" class="rt-actions-btn">
                    <img src="vertical_dots.svg" alt="" draggable="false">
                    <span>Действия с товаром</span>
                </button>
                ${it.isAdult && !sp ? '' : '<img src="plus.svg" class="rt-plus-btn" alt="Подробнее" title="Подробнее" draggable="false">'}
                <div class="rt-menu${open ? ' open' : ''}">
                    ${menuButtonsHtml(it)}
                </div>
                <button type="button" class="rt-hide-btn"><img src="close.svg" alt="" draggable="false"><span>Скрыть</span></button>
            </div>
            <div class="rt-pcode">${fmtShk(shk)}</div>
            <div class="rt-pname${it.isAdult && !sp ? ' adult-blur-text' : ''}" ${it.isAdult && !sp ? '' : `title="${esc(shownName)}"`}>${esc(shownName)}</div>
            <div class="rt-pbarcode">${bc && !sp ? `Баркод: <b>${esc(bc)}</b>` : '&nbsp;'}</div>
        </div>`;
    }

    // Излишки на проверке и излишки без назначенной ячейки (userData.surplusItems, status 'checking' / 'unassigned'): ячейка «-», вместо картинки текст «Товар - излишек».
    // 'checking' — слева сверху оранжевая плашка «Излишек на проверке», действий нет (идёт проверка, в коробку не добавить).
    // 'unassigned' — проверка прошла, ячейки нет: полноценная карточка (cardHtml) с «Действиями с товаром» и кнопкой plus.svg.
    function getSurplusChecking() {
        return toArray(getUserData().surplusItems)
            .filter(s => s && typeof s === 'object' && (s.status === 'checking' || s.status === 'unassigned'))
            .sort((a, b) => (b.foundAt || 0) - (a.foundAt || 0));
    }

    function surplusCardHtml(s) {
        return `
        <div class="rt-pcard rt-surplus-card" data-surplus="${esc(String(s.code))}">
            <div class="rt-pcell">
                <span class="rt-pcell-label">Ячейка</span>
                <span class="rt-pcell-num">-</span>
            </div>
            <div class="rt-pimg">
                ${s.status === 'checking' ? '<div class="rt-surplus-badge">Излишек на проверке</div>' : ''}
                <div class="rt-surplus-text">Товар - излишек</div>
            </div>
            <div class="rt-pcode">${fmtShk(String(s.code))}</div>
            <div class="rt-pname" title="Товар излишек">Товар излишек</div>
            <div class="rt-pbarcode">&nbsp;</div>
        </div>`;
    }

    function renderReturnsItems() {
        const container = document.getElementById('returns-unprocessed-container');
        const countEl = document.getElementById('left-panel-total-count');
        const items = getUnprocessed().sort((a, b) => (itemTime(b) || 0) - (itemTime(a) || 0));
        const surplus = getSurplusChecking();
        // излишки, оставшиеся в возвратах (ячейки нет), — обычные карточки с действиями и кнопкой plus
        const surplusOpen = surplus.filter(s => s.status === 'unassigned');
        rtVisible = surplusOpen.concat(items);
        const total = items.length + surplus.length;
        if (countEl) countEl.textContent = String(total);
        if (!container) return;
        container.innerHTML = total
            ? surplus.map(s => s.status === 'unassigned' ? cardHtml(s, rtVisible.indexOf(s)) : surplusCardHtml(s)).join('')
              + items.map(it => cardHtml(it, rtVisible.indexOf(it))).join('')
            : '<div class="rt-empty">Нет товаров для возврата</div>';
    }

    // Окно «Подробнее» — та же вёрстка (pd-layout), что и в выдаче, плюс строка «Добавлен в возвраты»
    function openDetails(it) {
        const box = document.getElementById('pd-modal-content');
        if (!box) return;
        if (it.isAdult && !isSurplusItem(it)) return;   // для 18+ окно не открываем (как в выдаче); у излишка 18+ нет

        const paidClass = it.isPaid ? 'success-bg' : 'error-bg';
        const paidText = it.isPaid ? 'Оплачено' : 'Не оплачено';
        const src = itemImg(it);
        const imageContent = isSurplusItem(it)
            ? '<div class="rt-surplus-text" style="min-height:160px;display:flex;align-items:center;justify-content:center;">Товар - излишек</div>'
            : (src ? `<img src="${esc(src)}" style="width:100%; object-fit:contain;" alt="">` : '📦');
        const retIcon = it.isReturnable ? 'return.svg' : 'no_return.svg';
        const retText = it.isReturnable ? 'Возвратный товар' : 'Невозвратный';
        const retClass = it.isReturnable ? 'success-text' : 'error-text';
        const price = itemPrice(it);
        const di = it.defectiveInfo;
        const sp = isSurplusItem(it);
        const defReason = it.isDefective ? (isFormFilled(it) && di.reason ? di.reason : 'Отмечен') : '';
        const defPhotos = it.isDefective ? defectPhotoUrls(it) : [];
        const defPhotosHtml = defPhotos.length
            ? `<div class="pd-row" style="align-items:flex-start;"><span class="pd-label">Фото брака:</span><span class="pd-value rt-dthumbs">${defPhotos.map(u => `<img class="rt-dthumb" src="${esc(u)}" alt="" data-full="${esc(u)}">`).join('')}</span></div>`
            : '';

        box.innerHTML = `
        <div class="pd-layout">
            <div class="pd-image-col"><div class="pd-image-wrapper">${imageContent}</div></div>
            <div class="pd-info-col">
                ${sp ? '' : `<div class="pd-header-row">
                    <div class="pd-return-status ${retClass}"><img src="${retIcon}" alt="">${retText}</div>
                    <span class="pd-badge ${paidClass}">${paidText}</span>
                </div>`}
                <div class="pd-row"><span class="pd-label">${sp ? 'Найден как излишек:' : 'Время приемки:'}</span><span class="pd-value">${esc(fmtRuDate(sp ? surplusFoundTime(it) : receptionTime(it)))}</span></div>
                <div class="pd-row"><span class="pd-label">Добавлен в возвраты:</span><span class="pd-value">${esc(fmtRuDate(sp ? (Number(it.checkedAt) || surplusFoundTime(it)) : itemTime(it)))}</span></div>
                <div class="pd-row"><span class="pd-label">Ячейка:</span><span class="pd-value">${esc(cellText(it))}</span></div>
                <div class="pd-row"><span class="pd-label">ШК:</span><span class="pd-value" style="font-family: 'Roboto Mono', monospace;">${esc(itemShk(it) || '—')}</span></div>
                ${it.isDefective ? `<div class="pd-row"><span class="pd-label">Брак:</span><span class="pd-value" style="color:var(--error,#D32F2F)">${esc(defReason)}</span></div>` : ''}
                ${defPhotosHtml}
                ${sp ? '' : `<div class="pd-price-row">${(price === null ? 0 : price).toFixed(2)} <span class="byn-icon-css"></span></div>`}
                <div class="pd-desc-block"><div class="pd-label">Описание:</div><div class="pd-desc-text">${esc(sp ? 'Товар излишек' : (itemName(it) || 'Товар без описания'))}</div></div>
                ${sp ? '' : '<a href="https://www.wildberries.by" target="_blank" class="pd-link-btn">Перейти к товару</a>'}
            </div>
        </div>`;
        toggleModal('product-details-modal', true);
    }

    /* =========================================================================
       Меню «Действия с товаром» — внутри картинки конкретной карточки
       ========================================================================= */
    function closeMenus() {
        rtMenuCode = null;
        document.querySelectorAll('#returns-unprocessed-container .rt-menu.open').forEach(m => m.classList.remove('open'));
        document.querySelectorAll('#returns-unprocessed-container .rt-pcard.menu-open').forEach(c => c.classList.remove('menu-open'));
    }

    function toggleMenu(card) {
        const menu = card.querySelector('.rt-menu');
        if (!menu) return;
        const wasOpen = menu.classList.contains('open');
        closeMenus();                                   // одновременно открыто только одно меню
        if (!wasOpen) { menu.classList.add('open'); card.classList.add('menu-open'); rtMenuCode = card.dataset.code; }
    }

    function onMenuAction(it, act) {
        if (!it) return;
        if (isClientReturn(it) && act !== 'noshk') return;   // у возврата от клиента доступна только «Вернуть без ШК»
        if (act === 'noshk') {
            openFlow(it);
        } else if (act === 'mark') {
            it.isDefective = true;                          // красная лента на карточке
            it.defectMarkedAt = new Date().toISOString();
            // в базу: брак отмечен, но форму ещё не заполняли
            it.defectiveInfo = { filled: false, reason: '—', comment: '—', photos: '—' };
            persist();                                      // звука здесь нет — так и должно быть
            renderReturnsItems();
        } else if (act === 'unmark') {
            it.isDefective = false;                         // лента пропадает, форма в базе очищается
            delete it.defectiveInfo;
            delete it.defectMarkedAt;
            persist();
            renderReturnsItems();
        } else if (act === 'form') {
            openDefectModal(it);                            // «Добавить фото брака» / «Изменить форму»
        }
    }

    /* =========================================================================
       Форма о браке (как в коробках) — результат пишется в базу
       ========================================================================= */
    function releasePhotos() {
        rtDefect.photos.forEach(p => { if (p && p.file && p.previewUrl) { try { URL.revokeObjectURL(p.previewUrl); } catch (e) { /* не критично */ } } });
        rtDefect.photos = [];
    }

    function openDefectModal(it) {
        rtDefect.item = it;
        rtDefect.saving = false;
        releasePhotos();

        const select = document.getElementById('rt-defect-reason');
        const other = document.getElementById('rt-defect-reason-other');
        const comment = document.getElementById('rt-defect-comment');
        const title = document.getElementById('rt-defect-title');
        const filled = isFormFilled(it);
        if (select) {
            select.innerHTML = '<option value="">Выберите причину</option>' +
                RT_DEFECT_REASONS.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
        }
        if (other) { other.style.display = 'none'; other.value = ''; }
        if (comment) comment.value = '';
        if (title) title.textContent = filled ? 'Изменить форму о браке' : 'Заполните форму о браке';

        // если форма уже заполнялась — подставляем причину, комментарий и уже сохранённые фото
        const di = it.defectiveInfo;
        if (filled && di && select) {
            if (di.reason && RT_DEFECT_REASONS.includes(di.reason)) {
                select.value = di.reason;
            } else if (di.reason) {
                select.value = 'Другое';
                if (other) { other.style.display = 'block'; other.value = di.reason; }
            }
            if (comment && di.comment) comment.value = di.comment;
            defectPhotoUrls(it).slice(0, RT_MAX_PHOTOS).forEach(u => rtDefect.photos.push({ url: u, previewUrl: u }));
        }

        renderPhotoGrid();
        toggleModal('rt-defect-modal', true);
    }

    // Фото выбираем так же, как в регистрации: храним сам файл + локальный предпросмотр
    function onPhotoSelect(e) {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (!files.length) return;
        if (files.some(f => !/^image\/(png|jpe?g)$/i.test(f.type))) { err('Допустимы только png/jpg/jpeg'); return; }
        if (rtDefect.photos.length + files.length > RT_MAX_PHOTOS) { err('Максимум ' + RT_MAX_PHOTOS + ' фото'); return; }
        files.forEach(file => {
            rtDefect.photos.push({ file: file, previewUrl: URL.createObjectURL(file) });
        });
        renderPhotoGrid();
    }

    function removePhoto(index) {
        const p = rtDefect.photos[index];
        if (!p) return;
        if (p.file && p.previewUrl) { try { URL.revokeObjectURL(p.previewUrl); } catch (e) { /* не критично */ } }
        rtDefect.photos.splice(index, 1);
        renderPhotoGrid();
    }

    function renderPhotoGrid() {
        for (let i = 0; i < RT_MAX_PHOTOS; i++) {
            const slot = document.getElementById('rt-p-slot-' + i);
            if (!slot) continue;
            slot.innerHTML = '';
            const photo = rtDefect.photos[i];
            if (photo) {
                const img = document.createElement('img');
                img.src = photo.previewUrl;
                img.alt = '';
                img.onclick = () => {
                    const full = document.getElementById('rt-full-image');
                    if (full) { full.src = photo.previewUrl; toggleModal('rt-image-viewer', true); }
                };
                const del = document.createElement('button');
                del.type = 'button';
                del.className = 'rt-photo-del';
                del.innerHTML = '<i class="fas fa-times"></i>';
                del.onclick = ev => { ev.stopPropagation(); removePhoto(i); };
                slot.appendChild(img);
                slot.appendChild(del);
                slot.classList.add('filled');
            } else {
                slot.classList.remove('filled');
            }
        }
        const addBtn = document.getElementById('rt-add-photo-btn');
        if (addBtn) addBtn.style.visibility = rtDefect.photos.length >= RT_MAX_PHOTOS ? 'hidden' : 'visible';
    }

    // ЗАГРУЗКА ФОТО В CLOUDINARY — как в register.js (в базу уходят ссылки secure_url).
    // Но в отличие от регистрации запасного варианта нет: если хоть одно фото не загрузилось,
    // выбрасываем ошибку и форма НЕ сохраняется. Уже сохранённые раньше фото (есть url) не загружаем повторно.
    async function uploadPhotosToServer(list) {
        const uploadPromises = list.map(item => {
            if (item.url) return Promise.resolve(item.url);
            const formData = new FormData();
            formData.append('file', item.file);
            formData.append('upload_preset', RT_UPLOAD_PRESET);

            const ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
            const timer = ctrl ? setTimeout(() => ctrl.abort(), 30000) : null;
            return fetch(`https://api.cloudinary.com/v1_1/${RT_CLOUD_NAME}/image/upload`, {
                method: 'POST',
                body: formData,
                signal: ctrl ? ctrl.signal : undefined
            })
            .then(res => res.json())
            .then(data => {
                if (timer) clearTimeout(timer);
                if (data && data.secure_url) return data.secure_url;
                console.error('Cloudinary Error:', data && data.error);
                throw new Error('Ошибка сервиса изображений');
            })
            .catch(e => {
                if (timer) clearTimeout(timer);
                throw e;
            });
        });
        return Promise.all(uploadPromises);
    }

    async function saveDefectForm() {
        const it = rtDefect.item;
        if (!it) { err('Товар не выбран'); return; }
        if (rtDefect.saving) return;

        let reason = document.getElementById('rt-defect-reason').value;
        if (!reason) { err('Выберите причину'); return; }
        if (reason === 'Другое') {
            const otherVal = document.getElementById('rt-defect-reason-other').value.trim();
            if (!otherVal) { err('Укажите причину'); return; }
            reason = otherVal;
        }
        if (rtDefect.photos.length < RT_MAX_PHOTOS) { err('Необходимо ' + RT_MAX_PHOTOS + ' фотографии'); return; }
        const commentVal = document.getElementById('rt-defect-comment').value.trim();
        if (!commentVal) { err('Добавьте комментарий к браку (обязательно)'); return; }

        const btn = document.getElementById('rt-defect-save-btn');
        rtDefect.saving = true;
        if (btn) { btn.classList.add('loading-spinner-inside'); btn.disabled = true; }
        try {
            let photoUrls;
            try {
                photoUrls = await uploadPhotosToServer(rtDefect.photos);
            } catch (uploadErr) {
                console.error(uploadErr);
                err('Не удалось загрузить фото — сервис изображений недоступен. Форма о браке не сохранена, попробуйте ещё раз');
                return;                                     // ничего не меняем и не сохраняем
            }

            // В базу уходит: форма заполнена (filled:true), причина, комментарий и ссылки на фото.
            it.isDefective = true;
            it.defectiveInfo = {
                filled: true,
                reason: reason,
                comment: commentVal,
                photos: photoUrls,
                filledAt: new Date().toISOString()
            };
            persist();

            toggleModal('rt-defect-modal', false);
            playSound('success-sound');
            rtDefect.item = null;
            releasePhotos();
            renderReturnsItems();
        } catch (e) {
            console.error(e);
            err('Не удалось сохранить форму. Попробуйте ещё раз');
        } finally {
            rtDefect.saving = false;
            if (btn) { btn.classList.remove('loading-spinner-inside'); btn.disabled = false; }
        }
    }

    /* =========================================================================
       «Вернуть без ШК»: шаг 1 — стикер коробки, шаг 2 — проверка и добавление
       ========================================================================= */
    function sanitizeBox(v) {
        return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, RT_BOX_MAX);
    }

    function stepperHtml(step) {
        return `
        <div class="rt-stepper${step === 2 ? ' s2' : ''}">
            <div class="rt-circle${step === 2 ? ' done' : ''}">1</div>
            <div class="rt-line"></div>
            <div class="rt-circle">2</div>
        </div>`;
    }

    function ensureFlow() {
        let el = document.getElementById('rt-flow');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'rt-flow';
        el.className = 'rt-flow';
        // внутрь основной части: сайдбар и верхняя навигационная панель остаются видимыми
        (document.querySelector('.main-content') || document.body).appendChild(el);

        el.addEventListener('click', e => {
            if (e.target.closest('#rt-flow-close')) { closeFlow(); return; }
            if (e.target.closest('#rt-flow-prev')) { rtFlow.step = 1; rtFlow.boxId = null; renderFlow(); return; }
            if (e.target.closest('#rt-box-ok')) { submitBox(); return; }
            if (e.target.closest('#rt-add-btn')) { addToBox(); return; }
        });
        el.addEventListener('input', e => {
            if (e.target.id === 'rt-box-input') e.target.value = sanitizeBox(e.target.value);
        });
        el.addEventListener('keydown', e => {
            if (e.key === 'Enter' && e.target.id === 'rt-box-input') { e.preventDefault(); submitBox(); }
        });
        return el;
    }

    // Прячем список (и мобильные вкладки), чтобы на их месте было окно; позицию прокрутки списка запоминаем
    let rtScrollSave = null;
    function setFlowLayout(on) {
        const mc = document.querySelector('.main-content');
        if (!mc) return;
        const ws = mc.querySelector('.returns-workspace');
        const gw = mc.querySelector('.returns-grid-wrapper');
        if (on) {
            rtScrollSave = { ws: ws ? ws.scrollTop : 0, gw: gw ? gw.scrollTop : 0 };
            mc.classList.add('rt-flow-on');
        } else {
            mc.classList.remove('rt-flow-on');
            if (rtScrollSave) {
                if (ws) ws.scrollTop = rtScrollSave.ws;
                if (gw) gw.scrollTop = rtScrollSave.gw;
                rtScrollSave = null;
            }
        }
    }

    function isFlowOpen() {
        const el = document.getElementById('rt-flow');
        return !!(el && el.classList.contains('show') && rtFlow.item);
    }

    function openFlow(it) {
        rtFlow.item = it;
        rtFlow.boxId = null;
        rtFlow.step = 1;
        const el = ensureFlow();
        renderFlow();
        setFlowLayout(true);
        el.classList.add('show');
        playSound('sound-scan-box');            // scan_box_sticker.mp3 — сразу в начале шага 1
    }

    function closeFlow() {
        const el = document.getElementById('rt-flow');
        if (el) { el.classList.remove('show'); el.innerHTML = ''; }   // innerHTML очищаем, чтобы остановить видео
        setFlowLayout(false);
        rtFlow.item = null;
        rtFlow.boxId = null;
        rtFlow.step = 1;
    }

    function renderFlow() {
        const el = ensureFlow();
        const it = rtFlow.item;
        if (!it) return;

        if (rtFlow.step === 1) {
            el.innerHTML = `<div class="rt-flow-panel">
                <button type="button" class="rt-back" id="rt-flow-close">
                    <i class="fas fa-arrow-left"></i><span>Вернуться к списку возвратов</span>
                </button>
                ${stepperHtml(1)}
                <h2 class="rt-flow-title">Отсканируйте наклейку открытой возвратной коробки</h2>
                <video class="rt-flow-video" src="an.mp4" autoplay loop muted playsinline></video>
                <div class="rt-box-row">
                    <input type="text" id="rt-box-input" class="rt-box-input" placeholder="TRBX0000000000"
                           maxlength="14" autocomplete="off" autocapitalize="characters" spellcheck="false">
                    <button type="button" class="rt-box-ok" id="rt-box-ok" title="Подтвердить"><i class="fas fa-check"></i></button>
                </div>
            </div>`;
            const v = el.querySelector('video');
            if (v) { v.muted = true; const p = v.play(); if (p && p.catch) p.catch(() => {}); }
            setTimeout(() => { const inp = document.getElementById('rt-box-input'); if (inp) inp.focus(); }, 150);
            return;
        }

        // шаг 2
        const sp = isSurplusItem(it);                  // излишек: как на карточке — «Товар - излишек» вместо картинки
        const adult = !!it.isAdult && !sp;
        const src = adult ? 'adult.svg' : itemImg(it);
        const imgTag = sp
            ? '<div class="rt-surplus-text">Товар - излишек</div>'
            : (src
                ? `<img src="${esc(src)}" alt="" class="${adult ? 'rt-adult' : ''}" onerror="this.style.visibility='hidden'">`
                : '<div class="rt-noimg"><i class="fas fa-box"></i></div>');
        const size = sp ? '' : itemSize(it);
        const color = sp ? '' : itemColor(it);
        const sc = [];
        if (size) sc.push(`Размер: <b>${esc(size)}</b>`);
        if (color) sc.push(`Цвет: <b>${esc(color)}</b>`);
        const bc = sp ? '' : itemBarcode(it);

        el.innerHTML = `<div class="rt-flow-panel">
            ${stepperHtml(2)}
            <div class="rt-title-row">
                <button type="button" class="rt-arrow" id="rt-flow-prev" title="Назад"><i class="fas fa-arrow-left"></i></button>
                <h2 class="rt-flow-title">Проверьте и добавьте товар в возвратную коробку</h2>
            </div>
            <div class="rt-check">
                <div class="rt-check-img${sp ? ' rt-check-sp' : ''}">
                    ${imgTag}
                    ${ribbonHtml(it)}
                </div>
                <div class="rt-check-info">
                    <div class="rt-pcode">${fmtShk(itemShk(it))}</div>
                    <div class="rt-check-name${adult ? ' adult-blur-text' : ''}">${esc(sp ? 'Товар излишек' : itemName(it))}</div>
                    ${sc.length ? `<div class="rt-check-sc">${sc.join(' · ')}</div>` : ''}
                    ${bc ? `<div class="rt-check-sc">Баркод: <b>${esc(bc)}</b></div>` : ''}
                    <button type="button" class="rt-pill-btn" id="rt-add-btn">Добавить товар</button>
                </div>
            </div>
        </div>`;
    }

    // Шаг 1: проверяем, что такая открытая коробка есть
    function submitBox() {
        if (!isFlowOpen() || rtFlow.step !== 1) return;
        const inp = document.getElementById('rt-box-input');
        if (!inp) return;
        const val = sanitizeBox(inp.value);

        if (!RT_BOX_RE.test(val)) {
            showAlert('Некорректный стикер. Формат: TRBX и 10 цифр', true, true);
            playTwoSounds('error-sound', 'sound-incorrect-sticker');
            return;
        }
        const ud = getUserData();
        const box = toArray(ud.returnBoxes).find(b => String(b.id).toUpperCase() === val);
        if (!box) { err('Открытая коробка ' + val + ' не найдена'); return; }
        if (box.isClosed) { err('Коробка ' + val + ' уже закрыта'); return; }
        if (toArray(box.items).length >= RT_MAX_BOX_ITEMS) { err('Коробка полная. Закройте коробку!'); return; }

        rtFlow.boxId = box.id;
        rtFlow.step = 2;
        renderFlow();
    }

    // Шаг 2: «Добавить товар» — товар кладётся в коробку
    function addToBox() {
        if (!isFlowOpen() || rtFlow.step !== 2) return;
        const it = rtFlow.item;
        const sp = isSurplusItem(it) && it.status === 'unassigned';     // излишек из userData.surplusItems
        if (it.confirmed) { err('Этот товар уже добавлен в коробку'); closeFlow(); renderReturnsItems(); return; }

        const ud = getUserData();
        if (sp && !toArray(ud.surplusItems).some(x => x && String(x.code) === String(it.code) && x.status === 'unassigned')) {
            err('Этот излишек уже обработан'); closeFlow(); renderReturnsItems(); return;
        }
        const boxes = toArray(ud.returnBoxes);
        const box = boxes.find(b => b.id === rtFlow.boxId);
        if (!box) { err('Коробка не найдена'); return; }
        if (box.isClosed) { err('Коробка ' + box.id + ' уже закрыта'); return; }
        box.items = toArray(box.items);
        if (box.items.length >= RT_MAX_BOX_ITEMS) { err('Коробка полная. Закройте коробку!'); return; }

        // Копия товара в формате r2.js (в т.ч. isDefective и defectiveInfo — форма о браке уходит в базу)
        const boxItem = JSON.parse(JSON.stringify(Object.assign({}, it, {
            newCode: '',
            safePackage: 'Без пакета',
            returnedWithoutBarcode: true,
            confirmed: true,
            placedInBoxId: box.id,
            placedAt: new Date().toISOString()
        })));
        if (isSurplusItem(it)) {
            // излишку ничего реально не присваиваем: в коробке он просто «Товар излишек» (с браком или без)
            boxItem.source = 'surplus';
            boxItem.name = 'Товар излишек';
            boxItem.isAdult = false;
            boxItem.cell = '';
            ['status', 'outcome', 'checkUntil', 'checkedAt', 'readyAt', 'barcode', 'image', 'img', 'size', 'color',
             'packageContents', 'productLink', 'price', 'isReturnable', 'isPaid', 'isFragile'].forEach(k => delete boxItem[k]);
        }
        box.items.unshift(boxItem);
        ud.returnBoxes = boxes;                 // Firebase мог отдать объект — сохраняем массивом

        if (sp) {
            // излишек ушёл в коробку — убираем его из излишков (в «Возвратах» его больше нет)
            ud.surplusItems = toArray(ud.surplusItems)
                .filter(x => !(x && String(x.code) === String(it.code) && x.status === 'unassigned'));
        } else {
            it.confirmed = true;                // товар больше не в списке возвратов
            it.placedInBoxId = box.id;
        }

        saveUserData(ud);
        playSound('success-sound');
        closeFlow();
        renderReturnsItems();
        refreshBadges();
    }

    /* =========================================================================
       «Возврат от клиента»: любые 6 цифр → любые 10 цифр → любой товар → подтверждение
       ========================================================================= */
    // Все коды (ШК и баркод) товаров, которые уже лежат в списке возвратов
    function existingReturnCodes() {
        const existing = new Set();
        toArray(getUserData().returnsItems).forEach(r => {
            [digits(itemShk(r)), digits(itemBarcode(r))].filter(Boolean).forEach(c => existing.add(c));
        });
        return existing;
    }

    // Товары из истории выдачи, которые клиент может вернуть.
    function getClientCandidates() {
        const ud = getUserData();
        const existing = existingReturnCodes();
        const result = [];
        toArray(ud.issuedHistory).forEach(entry => {
            if (!entry || typeof entry !== 'object') return;
            const st = String(entry.status || entry.type || '').toLowerCase();
            if (/refus|отказ|cancel|return|возврат/.test(st)) return;
            const nested = toArray(entry.items || entry.products || entry.goods);
            (nested.length ? nested : [entry]).forEach(obj => {
                if (!obj || typeof obj !== 'object' || obj.returnRequested) return;
                const shk = digits(itemShk(obj));
                const bc = digits(itemBarcode(obj));
                const codes = [shk, bc].filter(Boolean);
                if (!codes.length || codes.some(c => existing.has(c))) return;
                result.push({ src: obj, code: codes[0], codes: codes, cell: entry.cell, issuedAt: entry.date });
            });
        });
        return result;
    }

    function shuffled(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // Запасной вариант, когда в истории выдачи пусто: любые товары ПВЗ (приёмка) или условный товар.
    // Это копии — исходные данные не трогаем (synthetic:true).
    function fallbackCandidates(code, limit) {
        const ud = getUserData();
        const existing = existingReturnCodes();
        const pool = toArray(ud.receptionItems).filter(r => {
            if (!r || typeof r !== 'object') return false;
            const shk = digits(itemShk(r));
            return shk && !existing.has(shk);
        });
        const picked = shuffled(pool).slice(0, limit).map(r => {
            const copy = JSON.parse(JSON.stringify(r));
            const shk = digits(itemShk(copy));
            return { src: copy, code: shk, codes: [shk, digits(itemBarcode(copy))].filter(Boolean), cell: copy.cell, issuedAt: null, synthetic: true };
        });
        if (picked.length) return picked;

        let demoCode = digits(code);
        while (demoCode.length !== 10 || existing.has(demoCode)) {
            demoCode = String(Math.floor(1000000000 + Math.random() * 9000000000));
        }
        const demo = {
            code: demoCode, barcode: '', name: 'Товар', size: '', color: '',
            cell: String(1 + Math.floor(Math.random() * 60)),
            isReturnable: true, isPaid: true, isAdult: false
        };
        return [{ src: demo, code: demoCode, codes: [demoCode], cell: demo.cell, issuedAt: null, synthetic: true }];
    }

    // Любой введённый код → показываем любой подходящий товар (если код совпал с товаром клиента — именно его)
    function pickAnyProduct(code) {
        const cands = getClientCandidates();
        const exact = cands.find(c => c.codes.includes(code));
        if (exact) return exact;
        if (cands.length) return cands[Math.floor(Math.random() * cands.length)];
        return fallbackCandidates(code, 1)[0];
    }

    function resetFlow() {
        rtState.clientCode = null;
        rtState.cand = null;
        rtCandidates = [];
        ['cr-step1-input', 'cr-step2-input'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }
    function focusLater(id) {
        setTimeout(() => { const el = document.getElementById(id); if (el) el.focus(); }, 150);
    }
    // закрываем только те окна, которые реально открыты
    function closeAllFlowModals() {
        ['cr-step1-modal', 'cr-step2-modal', 'cr-select-item-modal', 'cr-step3-modal'].forEach(id => {
            if (rtIsShown(id)) rtHideModal(id);
        });
    }

    function startCustomerReturn() {
        resetFlow();
        closeAllFlowModals();
        rtShowModal('cr-step1-modal');
        playSound('sound-scan-client-code');   // scan_client_code.mp3 — при открытии окна «Возврат от клиента»
        focusLater('cr-step1-input');
    }

    // Шаг 1: подходят любые 6 цифр
    function step1Next() {
        const code = digits(document.getElementById('cr-step1-input').value);
        if (code.length !== 6) { err('Введите 6 цифр кода из клиентского приложения'); return; }
        rtState.clientCode = code;
        playScanSound();
        rtHideModal('cr-step1-modal');
        rtShowModal('cr-step2-modal');
        focusLater('cr-step2-input');
    }

    // Шаг 2: подходят любые 10 цифр — после этого выбивает любой товар
    function step2Next() {
        const code = digits(document.getElementById('cr-step2-input').value);
        if (code.length !== 10) { err('Введите 10 цифр штрихкода товара'); return; }
        const cand = pickAnyProduct(code);
        playScanSound();
        rtHideModal('cr-step2-modal');
        showStep3(cand);
    }

    function step2NoBarcode() {
        rtCandidates = getClientCandidates();
        if (!rtCandidates.length) rtCandidates = fallbackCandidates('', 6);
        const list = document.getElementById('cr-select-list');
        if (!list) return;
        list.innerHTML = rtCandidates.map((c, i) => `
            <div class="rt-card rt-pick" data-cidx="${i}">
                ${imgHtml(c.src, 'rt-thumb')}
                <div class="rt-body">
                    <div class="rt-name">${esc(itemName(c.src))}</div>
                    ${itemBrand(c.src) ? `<div class="rt-sub">${esc(itemBrand(c.src))}</div>` : ''}
                    <div class="rt-sub">ШК: ${esc(itemShk(c.src))}${itemPrice(c.src) !== null ? ' · ' + esc(fmtPrice(itemPrice(c.src))) : ''}</div>
                </div>
            </div>`).join('');
        rtHideModal('cr-step2-modal');
        rtShowModal('cr-select-item-modal');
    }

    // Шаг 3: проверяем товар и подтверждаем
    function showStep3(cand) {
        // 50% товаров — без брака, 50% — с браком; форму брака уже заполнил клиент, заполнять её не нужно
        cand.defect = Math.random() < 0.5
            ? { reason: randomOf(RT_DEFECT_REASONS.filter(r => r !== 'Другое')), comment: randomOf(RT_CLIENT_DEFECT_COMMENTS) }
            : null;
        rtState.cand = cand;
        const card = document.getElementById('cr-step3-product-card');
        if (card) {
            const it = cand.src;
            const adult = !!it.isAdult;
            const src = adult ? 'adult.svg' : itemImg(it);
            const imgTag = src
                ? `<img src="${esc(src)}" alt="" class="${adult ? 'rt-adult' : ''}" onerror="this.style.visibility='hidden'">`
                : '<div class="rt-noimg"><i class="fas fa-box"></i></div>';
            const sc = [];
            if (itemSize(it)) sc.push(`Размер: <b>${esc(itemSize(it))}</b>`);
            if (itemColor(it)) sc.push(`Цвет: <b>${esc(itemColor(it))}</b>`);
            const bc = itemBarcode(it);
            card.innerHTML = `
            <div class="rt-check" style="max-width:none;">
                <div class="rt-check-img">${imgTag}${cand.defect ? ribbonHtml({ isDefective: true }) : ''}</div>
                <div class="rt-check-info">
                    <div class="rt-pcode">${fmtShk(itemShk(it))}</div>
                    <div class="rt-check-name${adult ? ' adult-blur-text' : ''}">${esc(itemName(it))}</div>
                    ${cand.defect ? `<div class="rt-check-sc">Брак (указан клиентом): <b>${esc(cand.defect.reason)}</b></div>` : ''}
                    ${itemBrand(it) ? `<div class="rt-check-sc">${esc(itemBrand(it))}</div>` : ''}
                    ${sc.length ? `<div class="rt-check-sc">${sc.join(' · ')}</div>` : ''}
                    ${bc ? `<div class="rt-check-sc">Баркод: <b>${esc(bc)}</b></div>` : ''}
                    ${itemPrice(it) !== null ? `<div class="rt-check-sc"><b>${esc(fmtPrice(itemPrice(it)))}</b></div>` : ''}
                </div>
            </div>`;
        }
        rtHideModal('cr-select-item-modal');
        rtShowModal('cr-step3-modal');
    }

    function step3Add() {
        const cand = rtState.cand;
        if (!cand) return;
        const ud = getUserData();
        ud.returnsItems = toArray(ud.returnsItems);
        const shkNew = digits(itemShk(cand.src));
        if (ud.returnsItems.some(r => digits(itemShk(r)) === shkNew)) {
            err('Этот товар уже добавлен в список возвратов');
            return;
        }
        const now = Date.now();
        // чистая копия товара (Firebase не принимает undefined), без следов прошлого брака и коробки
        const base = JSON.parse(JSON.stringify(cand.src));
        ['returnRequested', 'defectiveInfo', 'defectMarkedAt', 'placedInBoxId', 'placedAt', 'newCode', 'returnedWithoutBarcode'].forEach(k => delete base[k]);
        base.isDefective = false;
        const issuedAt = cand.issuedAt ? Date.parse(cand.issuedAt) : itemTime(cand.src);

        const newItem = Object.assign(base, {
            id: 'ret_' + now + '_' + Math.random().toString(36).substr(2, 5),
            code: String(itemShk(cand.src) || cand.code),
            cell: pick(cand.src, ['cell', 'cellNumber'], cand.cell !== undefined ? cand.cell : ''),
            receptionDate: cand.src.date || null,                      // время приёмки (до перезаписи date)
            date: new Date(now).toISOString(),                         // «Добавлен в возвраты»
            issuedDate: issuedAt && !isNaN(issuedAt) ? new Date(issuedAt).toISOString() : null,
            confirmed: false,
            source: 'customer',
            reason: 'Возврат от клиента',
            clientCode: rtState.clientCode
        });
        if (cand.defect) {
            // форма брака уже заполнена клиентом
            newItem.isDefective = true;
            newItem.defectMarkedAt = new Date(now).toISOString();
            newItem.defectiveInfo = {
                filled: true,
                reason: cand.defect.reason,
                comment: cand.defect.comment,
                photos: '—',
                filledAt: new Date(now).toISOString(),
                filledBy: 'client'
            };
        }
        ud.returnsItems.unshift(JSON.parse(JSON.stringify(newItem)));
        if (!cand.synthetic) cand.src.returnRequested = true;          // чтобы не вернуть один и тот же товар дважды
        saveUserData(ud);
        rtHideModal('cr-step3-modal');
        resetFlow();
        renderReturnsItems();
        refreshBadges();
        playSound('sound-return-accepted');    // return_accepted.mp3 — возврат от клиента завершён, модалка закрылась
    }

    function step3Cancel() {
        rtHideModal('cr-step3-modal');
        resetFlow();
    }

    /* ---------- инициализация страницы ---------- */
    window.initVozvratTovaryPage = function () {
        if (rtInited) { renderReturnsItems(); return; }
        rtInited = true;
        injectStyles();
        window.onSurplusChanged = renderReturnsItems;   // p_shared.js зовёт, когда проверка излишка закончилась

        const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };

        // клик по карточке: «Действия с товаром» → меню внутри картинки этой карточки, «+» → детали товара
        const grid = document.getElementById('returns-unprocessed-container');
        if (grid) {
            grid.addEventListener('click', e => {
                const card = e.target.closest('.rt-pcard');
                if (!card) return;
                // товар именно этой карточки (по ШК, запасной вариант — по номеру)
                const it = rtVisible.find(x => String(itemShk(x)) === card.dataset.code) || rtVisible[Number(card.dataset.idx)];
                if (!it) return;
                if (e.target.closest('.rt-actions-btn')) { e.stopPropagation(); toggleMenu(card); return; }
                const mb = e.target.closest('.rt-menu-btn');
                if (mb) { e.stopPropagation(); closeMenus(); onMenuAction(it, mb.dataset.act); return; }
                if (e.target.closest('.rt-hide-btn') || e.target.classList.contains('rt-menu')) { e.stopPropagation(); closeMenus(); return; }
                if (e.target.closest('.rt-plus-btn')) { e.stopPropagation(); openDetails(it); return; }
            });
        }
        // клик мимо открытого меню — закрываем его
        document.addEventListener('click', e => {
            if (rtMenuCode === null) return;
            if (e.target.closest('.rt-menu') || e.target.closest('.rt-actions-btn') || e.target.closest('.rt-hide-btn')) return;
            closeMenus();
        });
        // фото брака в окне деталей — открыть крупно
        const pdBox = document.getElementById('pd-modal-content');
        if (pdBox) {
            pdBox.addEventListener('click', e => {
                const t = e.target.closest('.rt-dthumb');
                const full = document.getElementById('rt-full-image');
                if (t && full) { full.src = t.dataset.full; toggleModal('rt-image-viewer', true); }
            });
        }
        // выбор товара вручную (без ШК) в «Возврате от клиента»
        const pickList = document.getElementById('cr-select-list');
        if (pickList) {
            pickList.addEventListener('click', e => {
                const card = e.target.closest('[data-cidx]');
                if (!card) return;
                const cand = rtCandidates[Number(card.dataset.cidx)];
                if (cand) showStep3(cand);
            });
        }

        on('customer-return-btn', 'click', startCustomerReturn);
        on('cr-step1-next-btn', 'click', step1Next);
        on('cr-step2-next-btn', 'click', step2Next);
        on('cr-step2-no-barcode-btn', 'click', step2NoBarcode);
        on('cr-step3-add-btn', 'click', step3Add);
        on('cr-step3-cancel-btn', 'click', step3Cancel);

        // форма о браке
        on('rt-defect-save-btn', 'click', saveDefectForm);
        on('rt-add-photo-btn', 'click', () => { const f = document.getElementById('rt-photo-input'); if (f) f.click(); });
        on('rt-photo-input', 'change', onPhotoSelect);
        on('rt-defect-reason', 'change', e => {
            const other = document.getElementById('rt-defect-reason-other');
            if (other) other.style.display = e.target.value === 'Другое' ? 'block' : 'none';
        });

        // нижнее меню «Еще» (телефон)
        const moreBtn = document.getElementById('mobile-more-btn');
        const moreMenu = document.getElementById('mobile-more-menu-content');
        if (moreBtn && moreMenu) {
            moreBtn.addEventListener('click', e => { e.stopPropagation(); moreMenu.classList.toggle('visible'); });
            document.addEventListener('click', e => {
                if (!moreBtn.contains(e.target) && !moreMenu.contains(e.target)) moreMenu.classList.remove('visible');
            });
        }
        on('mobile-exit-btn', 'click', () => {
            if (typeof performFullLogout === 'function') performFullLogout();
            else if (window.firebase && firebase.auth) firebase.auth().signOut();
        });

        // только цифры + Enter (так же отправляет код мобильный сканер)
        [['cr-step1-input', step1Next], ['cr-step2-input', step2Next]].forEach(([id, fn]) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', () => { el.value = el.value.replace(/\D/g, ''); });
            el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); fn(); } });
        });

        // сканер: p_shared печатает код в активное поле и шлёт событие 'scan'
        document.addEventListener('scan', e => {
            const code = e.detail && e.detail.code ? String(e.detail.code) : '';

            // «Вернуть без ШК», шаг 1: стикер коробки
            if (isFlowOpen()) {
                if (rtFlow.step === 1) {
                    const inp = document.getElementById('rt-box-input');
                    if (code.length > RT_BOX_MAX) { err('Неверный код. Ожидается TRBX и 10 цифр'); return; }
                    // если поле в фокусе — код уже введён и отправлен по Enter, второй раз не обрабатываем
                    if (inp && document.activeElement !== inp) { inp.value = sanitizeBox(code); submitBox(); }
                }
                return;
            }

            // «Возврат от клиента»: шаги 1 и 2
            [['cr-step1-modal', step1Next], ['cr-step2-modal', step2Next]].forEach(([mid, next]) => {
                const modal = document.getElementById(mid);
                const input = modal ? modal.querySelector('input') : null;
                if (!modal || !input || !modal.classList.contains('visible')) return;
                if (code.length > input.maxLength) { err('Неверный код. Ожидается ' + input.maxLength + ' цифр'); return; }
                // поле в фокусе — p_shared уже ввёл код и нажал Enter; если фокус потерян — вводим сами
                if (document.activeElement !== input) { input.value = digits(code); next(); }
            });
        });

        renderReturnsItems();
        // обновляем таймеры «осталось ...» (в деталях) и данные
        setInterval(() => { if (rtMenuCode === null && !isFlowOpen()) renderReturnsItems(); }, 60000);
    };
})();
