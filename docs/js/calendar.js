// docs/js/calendar.js

// Helper function to convert "HH:MM" (24-hour) to "H:MM AM/PM"
function formatTime12Hour(timeString24) { /* ... (as before) ... */
    if (!timeString24 || typeof timeString24 !== 'string' || !timeString24.includes(':')) {
        return "";
    }
    const [hoursString, minutesString] = timeString24.split(':');
    const hours24 = parseInt(hoursString, 10);
    const minutes = parseInt(minutesString, 10);
    if (isNaN(hours24) || isNaN(minutes)) { return timeString24; }
    const ampm = hours24 >= 12 ? 'PM' : 'AM';
    let hours12 = hours24 % 12;
    hours12 = hours12 ? hours12 : 12;
    const minutesPadded = String(minutes).padStart(2, '0');
    return `${hours12}:${minutesPadded} ${ampm}`;
}


document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        console.error("CRITICAL: Firebase or db object is not available in calendar.js.");
        return;
    }

    // --- DOM Elements ---
    // ... (all your existing DOM element selections for calendar, modal, announcements) ...
    const monthYearDisplay = document.getElementById('monthYearDisplay');
    const calendarGrid = document.getElementById('calendarGrid');
    const prevMonthBtn = document.getElementById('prevMonthBtn');
    const nextMonthBtn = document.getElementById('nextMonthBtn');
    const addEventBtn = document.getElementById('addEventBtn');
    const announcementsList = document.getElementById('announcementsList');
    const announcementForm = document.getElementById('announcementForm');
    const announcementMessageInput = document.getElementById('announcementMessage');
    const postAnnouncementBtn = document.getElementById('postAnnouncementBtn');
    const eventModal = document.getElementById('eventModal'); // Ensure all modal elements are selected too

    // --- CONFIGURATION & STATE ---
    // ... (emptyDayBackgrounds, bgIndex, currentDate as before) ...
    const emptyDayBackgrounds = [ 'images/yo-gurt' ];
    let bgIndex = 0;
    let currentDate = new Date();
    let currentMonthEvents = [];
    let currentMonthHolidays = []; // NEW: To store fetched Jewish holidays
    let unsubscribeFirestoreListener = null;
    let unsubscribeAnnouncementsListener = null;

    const eventsCollection = db.collection('events');
    const announcementsCollection = db.collection('announcements');


    // --- UI Initialization based on Role ---
    function initializeUIForRole() { /* ... (as before) ... */
        const currentRole = localStorage.getItem('exodusUserRole');
        console.log("calendar.js: Initializing/Updating UI for role:", currentRole);
        if (addEventBtn) {
            if (currentRole === 'uploader') { addEventBtn.style.display = 'inline-block'; }
            else { addEventBtn.style.display = 'none'; }
        }
        if (announcementForm) {
            if (currentRole === 'uploader') { announcementForm.style.display = 'block'; }
            else { announcementForm.style.display = 'none'; }
        }
    }

    // --- HEBCAL API HOLIDAY FETCHING ---
    async function fetchJewishHolidays(year, month) { // month is 0-indexed (0-11)
        // Hebcal API uses 1-indexed month
        const hebcalMonth = month + 1;
        // Fetch major holidays for the given Gregorian month and year
        // cfg=json&maj=on gives major holidays. You can add &min=on for minor, &nx=on for Rosh Chodesh etc.
        // &lg=h for Hebrew holiday names (optional, default is English)
        // More options: https://www.hebcal.com/home/developer-apis
        const url = `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&year=${year}&month=${hebcalMonth}&lg=s`; // lg=s for shorter Ashkenazic transliterations

        console.log(`calendar.js: Fetching Jewish holidays from Hebcal for ${year}-${hebcalMonth}`);
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Hebcal API request failed with status ${response.status}`);
            }
            const data = await response.json();
            if (data && data.items) {
                currentMonthHolidays = data.items.map(item => ({
                    date: item.date, // This is already in YYYY-MM-DD format
                    name: item.title,
                    category: item.category, // e.g., "holiday", "roshchodesh"
                    hebrewName: item.hebrew // Optional: Hebrew name
                }));
                console.log("calendar.js: Jewish holidays fetched:", currentMonthHolidays);
            } else {
                currentMonthHolidays = [];
                console.log("calendar.js: No holiday items found in Hebcal response or unexpected format.");
            }
        } catch (error) {
            console.error("calendar.js: Error fetching Jewish holidays:", error);
            currentMonthHolidays = []; // Clear holidays on error
        }
        renderCalendar(currentDate); // Re-render calendar with new holiday data
    }


    // Listen for role updates from auth.js
    window.addEventListener('exodusUserRoleUpdated', (event) => {
        console.log("calendar.js: Received exodusUserRoleUpdated event, new role:", event.detail.role);
        initializeUIForRole();
        if (event.detail.role && event.detail.role !== "pending") {
             fetchAndListenForEvents(currentDate.getFullYear(), currentDate.getMonth());
             fetchAndListenForAnnouncements();
             fetchJewishHolidays(currentDate.getFullYear(), currentDate.getMonth()); // Fetch holidays too
        } else {
            if (unsubscribeFirestoreListener) unsubscribeFirestoreListener();
            if (unsubscribeAnnouncementsListener) unsubscribeAnnouncementsListener();
            currentMonthEvents = [];
            currentMonthHolidays = []; // Clear holidays on logout
            if(calendarGrid) calendarGrid.innerHTML = "<p style='text-align:center;'>Please log in to view calendar.</p>";
            if(announcementsList) announcementsList.innerHTML = "<p style='text-align:center;'>Log in to see announcements.</p>";
            if(monthYearDisplay) monthYearDisplay.textContent = "Calendar";
        }
    });

    // --- Firestore Event Fetching ---
    function fetchAndListenForEvents(year, month) { /* ... (as before) ... */
        if (!localStorage.getItem('exodusUserUID')) {
            if(calendarGrid) calendarGrid.innerHTML = "<p style='text-align:center;'>Please log in to view events.</p>";
            return;
        }
        console.log(`calendar.js: Fetching events for ${year}-${month + 1}`);
        if (unsubscribeFirestoreListener) { unsubscribeFirestoreListener(); }
        const monthPadded = String(month + 1).padStart(2, '0');
        const firstDayOfMonthStr = `${year}-${monthPadded}-01`;
        const daysInThisMonth = new Date(year, month + 1, 0).getDate();
        const lastDayOfMonthStr = `${year}-${monthPadded}-${String(daysInThisMonth).padStart(2, '0')}`;
        unsubscribeFirestoreListener = eventsCollection
            .where('date', '>=', firstDayOfMonthStr).where('date', '<=', lastDayOfMonthStr).orderBy('date')
            .onSnapshot(snapshot => {
                console.log("calendar.js: Event snapshot received.");
                currentMonthEvents = [];
                snapshot.forEach(doc => { currentMonthEvents.push({ id: doc.id, ...doc.data() }); });
                currentMonthEvents.sort((a,b) => (a.startTime || "00:00").localeCompare(b.startTime || "00:00"));
                renderCalendar(currentDate); // This will now also consider holidays
            }, error => {
                console.error("calendar.js: Error fetching events from Firestore: ", error);
                if (calendarGrid) calendarGrid.innerHTML = "<p style='color:red;text-align:center;'>Error loading events.</p>";
            });
    }


    // --- Calendar Rendering ---
    function renderCalendar(dateToRender) {
        if (!calendarGrid || !monthYearDisplay) { return; }
        console.log("calendar.js: Rendering calendar for", dateToRender.toLocaleDateString());
        calendarGrid.innerHTML = '';
        bgIndex = 0;
        const year = dateToRender.getFullYear();
        const month = dateToRender.getMonth(); // 0-indexed
        monthYearDisplay.textContent = `${dateToRender.toLocaleString('default', { month: 'long' })} ${year}`;
        
        const todayObj = new Date();
        todayObj.setHours(0,0,0,0); // Normalize today for date comparison

        const firstDayOfMonthDateObj = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startingDayOfWeek = firstDayOfMonthDateObj.getDay();
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayNames.forEach(dayName => { /* ... (day header creation as before) ... */ 
            const dayHeaderEl = document.createElement('div');
            dayHeaderEl.classList.add('calendar-day-header');
            dayHeaderEl.textContent = dayName;
            calendarGrid.appendChild(dayHeaderEl);
        });
        for (let i = 0; i < startingDayOfWeek; i++) { /* ... (empty cell creation as before) ... */ 
            const emptyCell = document.createElement('div');
            emptyCell.classList.add('calendar-day', 'other-month');
            calendarGrid.appendChild(emptyCell);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dayCell = document.createElement('div');
            dayCell.classList.add('calendar-day');
            const currentDateObj = new Date(year, month, day);
            currentDateObj.setHours(0,0,0,0); // Normalize current cell date

            if (currentDateObj.getTime() === todayObj.getTime()) { // Compare normalized dates
                dayCell.classList.add('current-day');
            }
            
            const dayNumberEl = document.createElement('span');
            dayNumberEl.classList.add('day-number');
            dayNumberEl.textContent = day;
            dayCell.appendChild(dayNumberEl);

            const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            // --- HOLIDAY DISPLAY ---
            const holidaysOnThisDay = currentMonthHolidays.filter(h => h.date === cellDateStr);
            if (holidaysOnThisDay.length > 0) {
                dayCell.classList.add('holiday-day'); // Add class for pink highlighting
                holidaysOnThisDay.forEach(holiday => {
                    const holidayNameEl = document.createElement('div');
                    holidayNameEl.classList.add('holiday-name');
                    holidayNameEl.textContent = holiday.name;
                    dayCell.appendChild(holidayNameEl); // Append below day number, before event list
                });
            }
            // --- END HOLIDAY DISPLAY ---

            const dayEvents = currentMonthEvents.filter(event => event.date === cellDateStr);
            const eventListEl = document.createElement('div');
            eventListEl.classList.add('event-list');
            if (dayEvents.length > 0) { /* ... (event rendering as before, using formatTime12Hour) ... */ 
                 dayEvents.forEach(event => {
                    const eventEl = document.createElement('div');
                    eventEl.classList.add('event-item');
                    const startTime12 = event.startTime ? formatTime12Hour(event.startTime) : '';
                    const endTime12 = event.endTime ? formatTime12Hour(event.endTime) : '';
                    let timeDisplay = startTime12;
                    if (endTime12) { timeDisplay += ` - ${endTime12}`; }
                    eventEl.innerHTML = `
                        <span class="event-time">${timeDisplay}</span>
                        <span class="event-title">${(event.description || 'No Title').substring(0, 20)}${(event.description || '').length > 20 ? '...' : ''}</span>
                    `;
                    eventEl.dataset.eventId = event.id;
                    eventEl.addEventListener('click', (e) => { e.stopPropagation(); openEventModal(event); });
                    eventListEl.appendChild(eventEl);
                });
            } else if (holidaysOnThisDay.length === 0) { // Only apply empty day background if no events AND no holidays
                dayCell.classList.add('empty-day');
                if (emptyDayBackgrounds.length > 0 && emptyDayBackgrounds[0]) {
                    dayCell.style.backgroundImage = `url('${emptyDayBackgrounds[bgIndex % emptyDayBackgrounds.length]}')`;
                    bgIndex++;
                }
            }
            dayCell.appendChild(eventListEl); // Append event list after holiday names

            const currentRoleOnRender = localStorage.getItem('exodusUserRole');
            if (currentRoleOnRender === 'uploader') {
                dayCell.classList.add('uploader-clickable');
                dayCell.addEventListener('click', (e) => {
                    if (e.target === dayCell || e.target === dayNumberEl || e.target.classList.contains('holiday-name')) { // Allow click if on holiday name too
                        openEventModal(null, cellDateStr);
                    }
                });
            }
            calendarGrid.appendChild(dayCell);
        }
    }

    // --- Event Modal Logic ---
    // ... (openEventModal, setFormEditable, closeEventModal, form submit, delete event logic as before) ...
    // ... (No changes needed here for holiday display) ...
    function openEventModal(event = null, dateForNewEvent = null) { /* ... as before ... */ }
    function setFormEditable(isEditable) { /* ... as before ... */ }
    function closeEventModal() { /* ... as before ... */ }
    if (eventForm) { eventForm.addEventListener('submit', (e) => { /* ... as before ... */ }); }
    if (deleteEventBtn) { deleteEventBtn.addEventListener('click', () => { /* ... as before ... */ }); }


    // --- Announcement Functions ---
    function fetchAndListenForAnnouncements() { /* ... (as before) ... */
        if (!announcementsList || !localStorage.getItem('exodusUserUID')) {
            if(announcementsList) announcementsList.innerHTML = "<p style='text-align:center;'>Log in to see announcements.</p>";
            return;
        }
        console.log("calendar.js: Fetching announcements...");
        if (unsubscribeAnnouncementsListener) { unsubscribeAnnouncementsListener(); }
        unsubscribeAnnouncementsListener = announcementsCollection
            .orderBy('timestamp', 'desc').limit(20)
            .onSnapshot(snapshot => {
                if (!announcementsList) return;
                announcementsList.innerHTML = '';
                if (snapshot.empty) { announcementsList.innerHTML = '<p>No announcements yet.</p>'; return; }
                snapshot.forEach(doc => { /* ... (announcement item creation as before) ... */ 
                    const announcement = doc.data();
                    const item = document.createElement('div');
                    item.classList.add('announcement-item');
                    let timestampStr = 'Processing...';
                    if (announcement.timestamp && typeof announcement.timestamp.toDate === 'function') {
                        timestampStr = announcement.timestamp.toDate().toLocaleString([], { month:'short', day:'numeric', hour: 'numeric', minute:'2-digit', hour12: true });
                    } else if (announcement.timestamp) { 
                        timestampStr = new Date(announcement.timestamp).toLocaleString([], { month:'short', day:'numeric', hour: 'numeric', minute:'2-digit', hour12: true });
                    }
                    item.innerHTML = `
                        <div class="announcement-author">${announcement.authorDisplayName || 'System'}</div>
                        <div class="announcement-timestamp">${timestampStr}</div>
                        <div class="announcement-message">${(announcement.message || '').replace(/\n/g, '<br>')}</div>
                    `;
                    announcementsList.appendChild(item);
                });
            }, error => {
                console.error("Error fetching announcements:", error);
                if(announcementsList) announcementsList.innerHTML = '<p style="color:red;">Error loading announcements.</p>';
            });
    }
    if (postAnnouncementBtn && announcementMessageInput) { /* ... (post announcement logic as before) ... */ 
        postAnnouncementBtn.addEventListener('click', () => {
            const message = announcementMessageInput.value.trim();
            const userDisplayName = localStorage.getItem('userDisplayName');
            const userUID = localStorage.getItem('exodusUserUID');
            const userRole = localStorage.getItem('exodusUserRole');
            if (userRole !== 'uploader' || !message || !userDisplayName || !userUID) { /* ... alert/return ... */ return; }
            announcementsCollection.add({
                message: message, authorDisplayName: userDisplayName, authorUID: userUID,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            }).then(() => { announcementMessageInput.value = ''; }).catch(error => { console.error("Error posting announcement:", error);});
        });
    }

    // --- Event Listeners for Calendar Navigation & Modal ---
    if (prevMonthBtn) { 
        prevMonthBtn.addEventListener('click', () => { 
            currentDate.setMonth(currentDate.getMonth() - 1); 
            // Fetch events and holidays for the new month
            fetchAndListenForEvents(currentDate.getFullYear(), currentDate.getMonth());
            fetchJewishHolidays(currentDate.getFullYear(), currentDate.getMonth()); // Call after events to ensure renderCalendar is called with holidays
        }); 
    }
    if (nextMonthBtn) { 
        nextMonthBtn.addEventListener('click', () => { 
            currentDate.setMonth(currentDate.getMonth() + 1); 
            fetchAndListenForEvents(currentDate.getFullYear(), currentDate.getMonth());
            fetchJewishHolidays(currentDate.getFullYear(), currentDate.getMonth());
        }); 
    }
    // ... (addEventBtn, closeModalBtn, window click listeners as before) ...
    if (addEventBtn) { addEventBtn.addEventListener('click', () => { /* ... as before ... */ }); }
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeEventModal);
    window.addEventListener('click', (event) => { if (eventModal && event.target == eventModal) { closeEventModal(); } });


    // --- Initial Load ---
    // The 'exodusUserRoleUpdated' event listener now handles initial data fetching
    // This check is a fallback for direct page loads where localStorage might already be set
    // before the onAuthStateChanged in auth.js fully processes and dispatches the event.
    if (localStorage.getItem('exodusUserUID') && localStorage.getItem('exodusUserRole') !== 'pending') {
        console.log("calendar.js: User UID and valid role found on initial load, initializing UI and fetching data.");
        initializeUIForRole();
        fetchAndListenForEvents(currentDate.getFullYear(), currentDate.getMonth());
        fetchAndListenForAnnouncements();
        fetchJewishHolidays(currentDate.getFullYear(), currentDate.getMonth()); // Fetch initial holidays
    } else if (localStorage.getItem('exodusUserRole') === 'pending') {
        console.log("calendar.js: User account is pending approval.");
        if(calendarGrid) calendarGrid.innerHTML = "<p style='text-align:center;'>Your account is awaiting approval.</p>";
        if(announcementsList) announcementsList.innerHTML = "<p style='text-align:center;'>Account pending approval.</p>";
        initializeUIForRole();
    } else {
        console.log("calendar.js: No user UID or role is pending on initial load. Waiting for auth state update.");
        if(calendarGrid) calendarGrid.innerHTML = "<p style='text-align:center;'>Please log in to view calendar.</p>";
        if(announcementsList) announcementsList.innerHTML = "<p style='text-align:center;'>Log in to see announcements.</p>";
    }
});
