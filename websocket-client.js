function initWebSocket() {
    const currentUserInfo = localUserCache ? localUserCache.pvzInfo : {};
    const pvzIdForScanner = currentUserInfo.employeeId;

    if (!pvzIdForScanner) {
        console.log("WebSocket: ID сотрудника не найден, подключение не будет установлено.");
        return;
    }

    const SERVER_IP = window.location.hostname || 'localhost'; 
    let ws = null;

    const statusIcon = document.getElementById('connection-status');

    function connect() {
        if (!statusIcon) {
            console.warn('WebSocket: Иконка статуса соединения не найдена.');
            return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        ws = new WebSocket(`${protocol}://${SERVER_IP}:8080`);

        ws.onopen = () => {
            console.log('WebSocket: Соединение установлено');
            ws.send(JSON.stringify({ type: 'register_pvz', code: pvzIdForScanner }));
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.type === 'scan_data' && data.code) {
                    document.dispatchEvent(new CustomEvent('scan', {
                        detail: { code: data.code }
                    }));
                } else if (data.type === 'scanner_connected') {
                    statusIcon.classList.add('connected');
                    showAlert(`Сканер ${data.scannerCode} подключен`, false);
                } else if (data.type === 'scanner_disconnected') {
                    statusIcon.classList.remove('connected');
                    showAlert('Сканер отключен', true);
                }

            } catch (e) {
                console.error('WebSocket: Ошибка при обработке сообщения:', e);
            }
        };

        ws.onclose = () => {
            console.log("WebSocket: Соединение закрыто. Попытка переподключения через 3 секунды...");
            if (statusIcon) statusIcon.classList.remove('connected');
            setTimeout(connect, 3000);
        };

        ws.onerror = (error) => {
            console.error('WebSocket: Ошибка соединения:', error);
            ws.close();
        };
    }

    connect();
}