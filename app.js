// Daily Standup Picker - ALF Team
// Reads Excel capacity file, filters ALF team, picks random person
// Caches file in IndexedDB so it auto-loads next time

(function () {
    'use strict';

    // --- STATE ---
    let teamData = [];
    let weekColumns = [];
    let currentWeek = null;

    // Excluded from picking (leader + devs on other projects)
    const EXCLUDED_MEMBERS = [
        'Kamila Molas',
        'Adrian Słabicki',
        'Szymon Bartnik'
    ];

    const DB_NAME = 'DailyPickerDB';
    const DB_STORE = 'files';
    const DB_KEY = 'capacity-file';

    // --- DOM REFS ---
    const uploadSection = document.getElementById('uploadSection');
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');
    const pickerSection = document.getElementById('pickerSection');
    const weekSelect = document.getElementById('weekSelect');
    const membersList = document.getElementById('membersList');
    const pickBtn = document.getElementById('pickBtn');
    const resultSection = document.getElementById('resultSection');
    const resultName = document.getElementById('resultName');
    const rerollBtn = document.getElementById('rerollBtn');
    const historySection = document.getElementById('historySection');
    const historyList = document.getElementById('historyList');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const updateFileBtn = document.getElementById('updateFileBtn');

    // --- INDEXED DB (file cache) ---
    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(DB_STORE)) {
                    db.createObjectStore(DB_STORE);
                }
            };
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async function saveFileToDB(arrayBuffer, fileName) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, 'readwrite');
            const store = tx.objectStore(DB_STORE);
            store.put({
                data: arrayBuffer,
                name: fileName,
                savedAt: new Date().toISOString()
            }, DB_KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    async function loadFileFromDB() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, 'readonly');
            const store = tx.objectStore(DB_STORE);
            const request = store.get(DB_KEY);
            request.onsuccess = (e) => resolve(e.target.result || null);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async function deleteFileFromDB() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, 'readwrite');
            const store = tx.objectStore(DB_STORE);
            store.delete(DB_KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    // --- EXCEL PARSING ---
    function parseExcelBuffer(arrayBuffer) {
        try {
            const data = new Uint8Array(arrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });

            const sheetName = workbook.SheetNames.find(
                n => n.toLowerCase().includes('capacity')
            ) || workbook.SheetNames[0];

            const sheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

            processSheetData(json);
        } catch (err) {
            alert('Błąd parsowania pliku: ' + err.message);
            console.error(err);
        }
    }

    function parseExcelFile(file) {
        const reader = new FileReader();
        reader.onload = async function (e) {
            const arrayBuffer = e.target.result;
            // Save to IndexedDB (replaces previous)
            await saveFileToDB(arrayBuffer, file.name);
            parseExcelBuffer(arrayBuffer);
        };
        reader.readAsArrayBuffer(file);
    }

    function processSheetData(rows) {
        let headerRowIndex = -1;
        let nameCol = -1, surnameCol = -1, fullNameCol = -1, skillsetCol = -1, teamCol = -1;

        for (let i = 0; i < Math.min(rows.length, 20); i++) {
            const row = rows[i].map(c => String(c).trim().toUpperCase());
            const ni = row.indexOf('NAME');
            const si = row.indexOf('SURNAME');
            const ti = row.findIndex(c => c === 'TEAM');

            if (ni !== -1 && si !== -1 && ti !== -1) {
                headerRowIndex = i;
                nameCol = ni;
                surnameCol = si;
                teamCol = ti;
                fullNameCol = row.indexOf('FULL NAME');
                skillsetCol = row.indexOf('SKILLSET');
                break;
            }
        }

        if (headerRowIndex === -1) {
            alert('Nie znaleziono nagłówków (NAME, SURNAME, TEAM) w pliku.');
            return;
        }

        const headerRow = rows[headerRowIndex];
        weekColumns = [];

        const dateColIndex = headerRow.findIndex(
            c => String(c).trim().toUpperCase() === 'DATE'
        );
        const startCol = dateColIndex !== -1 ? dateColIndex + 1 : teamCol + 1;

        for (let c = startCol; c < headerRow.length; c++) {
            const val = headerRow[c];
            if (val !== '' && val !== undefined && val !== null) {
                let label = '';
                if (typeof val === 'number' && val > 40000) {
                    const date = excelDateToJS(val);
                    label = formatDateLabel(date);
                } else {
                    label = String(val).trim();
                }
                if (label) {
                    weekColumns.push({ label, colIndex: c });
                }
            }
        }

        teamData = [];
        for (let i = headerRowIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            const name = String(row[nameCol] || '').trim();
            const surname = String(row[surnameCol] || '').trim();
            const team = String(row[teamCol] || '').trim().toUpperCase();

            if (!name || !team) continue;
            if (team !== 'ALF') continue;

            const fullName = fullNameCol !== -1
                ? String(row[fullNameCol] || '').trim() || `${name} ${surname}`
                : `${name} ${surname}`;
            const skillset = skillsetCol !== -1
                ? String(row[skillsetCol] || '').trim()
                : '';

            const weeks = {};
            weekColumns.forEach(wc => {
                const cellValue = row[wc.colIndex];
                weeks[wc.label] = parseAvailability(cellValue);
            });

            teamData.push({ name, surname, fullName, skillset, team, weeks });
        }

        if (teamData.length === 0) {
            alert('Nie znaleziono członków zespołu ALF w pliku.');
            return;
        }

        showPickerSection();
    }

    function parseAvailability(cellValue) {
        if (cellValue === null || cellValue === undefined || cellValue === '') return 0;
        const str = String(cellValue).trim();
        if (str.endsWith('%')) {
            return parseFloat(str) / 100;
        }
        const num = parseFloat(str);
        if (!isNaN(num)) {
            return num > 1 ? num / 100 : num;
        }
        return 0;
    }

    function excelDateToJS(serial) {
        const utcDays = Math.floor(serial - 25569);
        return new Date(utcDays * 86400 * 1000);
    }

    function formatDateLabel(date) {
        const day = date.getDate();
        const months = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze',
            'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
        return `${day} ${months[date.getMonth()]}`;
    }

    // --- WEEK DETECTION ---
    function findCurrentWeek() {
        const today = new Date();
        let bestMatch = weekColumns.length - 1;

        for (let i = 0; i < weekColumns.length; i++) {
            const label = weekColumns[i].label;
            const weekDate = parseDateLabel(label);
            if (weekDate) {
                const nextWeekDate = i + 1 < weekColumns.length
                    ? parseDateLabel(weekColumns[i + 1].label)
                    : new Date(9999, 0, 1);

                if (today >= weekDate && today < (nextWeekDate || new Date(9999, 0, 1))) {
                    bestMatch = i;
                    break;
                }
            }
        }
        return bestMatch;
    }

    function parseDateLabel(label) {
        const months = { 'sty': 0, 'lut': 1, 'mar': 2, 'kwi': 3, 'maj': 4, 'cze': 5,
            'lip': 6, 'sie': 7, 'wrz': 8, 'paź': 9, 'lis': 10, 'gru': 11 };
        const parts = label.toLowerCase().split(/\s+/);
        if (parts.length >= 2) {
            const day = parseInt(parts[0]);
            const month = months[parts[1]];
            if (!isNaN(day) && month !== undefined) {
                const year = new Date().getFullYear();
                return new Date(year, month, day);
            }
        }
        return null;
    }

    // --- UI RENDERING ---
    function showPickerSection() {
        uploadSection.classList.add('hidden');
        pickerSection.classList.remove('hidden');
        historySection.classList.remove('hidden');

        weekSelect.innerHTML = '';
        weekColumns.forEach((wc, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = wc.label;
            weekSelect.appendChild(opt);
        });

        const currentIdx = findCurrentWeek();
        weekSelect.value = currentIdx;
        currentWeek = weekColumns[currentIdx]?.label;

        renderMembers();
        renderHistory();
    }

    function renderMembers() {
        membersList.innerHTML = '';
        const history = getWeekHistory();
        const usedNames = history.map(h => h.name);

        const available = getAvailableMembers();

        if (available.length === 0) {
            membersList.innerHTML = '<p class="empty-state">Brak dostępnych osób w tym tygodniu</p>';
            pickBtn.disabled = true;
            return;
        }

        available.forEach(member => {
            const chip = document.createElement('span');
            const isUsed = usedNames.includes(member.fullName);
            chip.className = `member-chip${isUsed ? ' used' : ''}`;
            chip.textContent = `${member.fullName}${isUsed ? ' ✓' : ''}`;
            membersList.appendChild(chip);
        });

        const unusedAvailable = available.filter(m => !usedNames.includes(m.fullName));
        if (unusedAvailable.length === 0) {
            pickBtn.disabled = true;
            pickBtn.textContent = '✅ Wszyscy już prowadzili!';
        } else {
            pickBtn.disabled = false;
            pickBtn.innerHTML = '<span class="btn-icon">🎲</span> Losuj osobę!';
        }
    }

    function getAvailableMembers() {
        if (!currentWeek) return [];
        return teamData.filter(m => {
            const availability = m.weeks[currentWeek];
            const isExcluded = EXCLUDED_MEMBERS.some(
                ex => m.fullName.toLowerCase() === ex.toLowerCase()
            );
            return !isExcluded && availability && availability > 0;
        });
    }

    function getEligibleMembers() {
        const available = getAvailableMembers();
        const history = getWeekHistory();
        const usedNames = history.map(h => h.name);
        return available.filter(m => !usedNames.includes(m.fullName));
    }

    // --- RANDOM PICK ---
    function pickRandom() {
        const eligible = getEligibleMembers();
        if (eligible.length === 0) return null;
        const randomIndex = Math.floor(Math.random() * eligible.length);
        return eligible[randomIndex];
    }

    function animatePick(callback) {
        pickerSection.classList.add('picking');
        resultSection.classList.remove('hidden');
        resultName.textContent = '...';

        const eligible = getEligibleMembers();
        let count = 0;
        const maxIterations = 15;
        const interval = setInterval(() => {
            const randomMember = eligible[Math.floor(Math.random() * eligible.length)];
            resultName.textContent = randomMember.fullName;
            count++;
            if (count >= maxIterations) {
                clearInterval(interval);
                pickerSection.classList.remove('picking');
                callback();
            }
        }, 100);
    }

    function doPick() {
        const picked = pickRandom();
        if (!picked) {
            alert('Wszyscy dostępni członkowie zespołu już prowadzili daily w tym tygodniu!');
            return;
        }
        animatePick(() => {
            resultName.textContent = picked.fullName;
            addToHistory(picked.fullName);
            renderMembers();
            renderHistory();
        });
    }

    // --- HISTORY (localStorage) ---
    function getStorageKey() {
        return `daily-picker-history-${currentWeek || 'unknown'}`;
    }

    function getWeekHistory() {
        const key = getStorageKey();
        try {
            const stored = localStorage.getItem(key);
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    }

    function addToHistory(name) {
        const key = getStorageKey();
        const history = getWeekHistory();
        const today = new Date();
        const dateStr = today.toLocaleDateString('pl-PL', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });
        history.push({ name, date: dateStr, timestamp: today.toISOString() });
        localStorage.setItem(key, JSON.stringify(history));
    }

    function clearWeekHistory() {
        const key = getStorageKey();
        localStorage.removeItem(key);
        renderMembers();
        renderHistory();
        resultSection.classList.add('hidden');
    }

    function renderHistory() {
        const history = getWeekHistory();
        if (history.length === 0) {
            historyList.innerHTML = '<p class="empty-state">Brak historii — nikt jeszcze nie losował w tym tygodniu</p>';
            return;
        }
        historyList.innerHTML = history.map((h, idx) => `
            <div class="history-item">
                <span class="name">${idx + 1}. ${h.name}</span>
                <span class="date">${h.date}</span>
            </div>
        `).join('');
    }

    // --- EVENT HANDLERS ---
    uploadBtn.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('click', (e) => {
        if (e.target === uploadArea || e.target.closest('.upload-area')) {
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) parseExcelFile(file);
    });

    // Drag & Drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) parseExcelFile(file);
    });

    weekSelect.addEventListener('change', (e) => {
        currentWeek = weekColumns[e.target.value]?.label;
        renderMembers();
        renderHistory();
        resultSection.classList.add('hidden');
    });

    pickBtn.addEventListener('click', doPick);

    rerollBtn.addEventListener('click', () => {
        const key = getStorageKey();
        const history = getWeekHistory();
        if (history.length > 0) {
            history.pop();
            localStorage.setItem(key, JSON.stringify(history));
        }
        renderMembers();
        doPick();
    });

    clearHistoryBtn.addEventListener('click', () => {
        if (confirm('Czy na pewno chcesz wyczyścić historię tego tygodnia?')) {
            clearWeekHistory();
        }
    });

    // "Update file" button — shown when picker is active, allows re-upload
    if (updateFileBtn) {
        updateFileBtn.addEventListener('click', () => {
            fileInput.click();
        });
    }

    // --- AUTO-LOAD FROM CACHE ON STARTUP ---
    async function init() {
        try {
            const cached = await loadFileFromDB();
            if (cached && cached.data) {
                console.log('Loaded cached file:', cached.name, 'saved at:', cached.savedAt);
                parseExcelBuffer(cached.data);
            }
        } catch (err) {
            console.warn('Could not load cached file:', err);
        }
    }

    init();

})();