// docs/js/calendar.js

document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        console.error("CRITICAL: Firebase or db object is not available in calendar.js.");
        return;
    }

    // --- DOM Elements ---
    const monthYearDisplay = document.getElementById('monthYearDisplay');
    const calendarGrid = document.getElementById('calendarGrid');
    const prevMonthBtn = document.getElementById('prevMonthBtn');
    const nextMonthBtn = document.getElementById('nextMonthBtn');
    const addEventBtn = document.getElementById('addEventBtn');

    const eventModal = document.getElementById('eventModal');
    const closeModalBtn = eventModal ? eventModal.querySelector('.modal .close-btn') : null;
    const eventForm = document.getElementById('eventForm');
    const eventModalTitle = document.getElementById('eventModalTitle');
    const eventIdInput = document.getElementById('eventId');
    const eventDateInput = document.getElementById('eventDate');
    const startTimeInput = document.getElementById('startTime');
    const endTimeInput = document.getElementById('endTime');
    const locationInput = document.getElementById('location');
    const descriptionInput = document.getElementById('description');
    const deleteEventBtn = document.getElementById('deleteEventBtn');
    const saveEventBtn = document.getElementById('saveEventBtn');

    // --- CONFIGURATION & STATE ---
    const emptyDayBackgrounds = [ 'images/yo-gurt' /*, more images */ ]; // Ensure correct path & extension
    let bgIndex = 0;
    let currentDate = new Date();
    let currentMonthEvents = [];
    let unsubscribeFirestoreListener = null;

    const eventsCollection = db.collection('events');

    // --- UI Initialization based on Role ---
    function initializeUIForRole() {
        const currentRole = localStorage.getItem('exodusUserRole');
        console.log("calendar.js: Initializing/Updating UI for role:", currentRole);
        if (addEventBtn) {
            if (currentRole === 'uploader') { // Check for "uploader"
                addEventBtn.style.display = 'inline-block';
            } else {
                addEventBtn.style.display = 'none';
            }
        }
    }

    // Listen for role updates from auth.js
    window.addEventListener('exodusUserRoleUpdated', (event) => {
        console.log("calendar.js: Received exodusUserRoleUpdated event, new role:", event.detail.role);
        initializeUIForRole();
        // If role changed from viewer to uploader, might need to re-render calendar day click handlers
        // For simplicity, a full re-render or re-attachment of admin-specific listeners might be easier
        // or ensure renderCalendar() checks role when adding dayCell click listeners.
        if (event.detail.role) { // If user is logged in (role is not null)
             fetchAndListenForEvents(currentDate.getFullYear(), currentDate.getMonth());
        } else { // User logged out
            if (unsubscribeFirestoreListener) unsubscribeFirestoreListener();
            currentMonthEvents = [];
            if(calendarGrid) calendarGrid.innerHTML = "<p style='text-align:center;'>Please log in to view events.</p>";
            if(monthYearDisplay) monthYearDisplay.textContent = "Calendar";
        }
    });


    // --- Firestore Event Fetching ---
    function fetchAndListenForEvents(year, month) {
        // ... (fetchAndListenForEvents function remains largely the same as the last correct version)
        // ... it should already use `currentMonthEvents` and call `renderCalendar` on snapshot.
        // Ensure it's properly unsubscribing from previous listeners.
        console.log(`calendar.js: Fetching events for ${year}-${month + 1}`);
        if (unsubscribeFirestoreListener) {
            unsubscribeFirestoreListener();
            console.log("calendar.js: Unsubscribed from previous Firestore listener.");
        }
        const monthPadded = String(month + 1).padStart(2, '0');
        const firstDayOfMonthStr = `${year}-${monthPadded}-01`;
        const daysInThisMonth = new Date(year, month + 1, 0).getDate();
        const lastDayOfMonthStr = `${year}-${monthPadded}-${String(daysInThisMonth).padStart(2, '0')}`;

        unsubscribeFirestoreListener = eventsCollection
            .where('date', '>=', firstDayOfMonthStr)
            .where('date', '<=', lastDayOfMonthStr)
            .orderBy('date')
            .onSnapshot(snapshot => {
                console.log("calendar.js: Firestore snapshot received.");
                currentMonthEvents = [];
                snapshot.forEach(doc => {
                    currentMonthEvents.push({ id: doc.id, ...doc.data() });
                });
                currentMonthEvents.sort((a,b) => (a.startTime || "00:00").localeCompare(b.startTime || "00:00"));
                renderCalendar(currentDate);
            }, error => {
                console.error("calendar.js: Error fetching events from Firestore: ", error);
                if (calendarGrid) calendarGrid.innerHTML = "<p style='color:red;text-align:center;'>Error loading events. Check console.</p>";
            });
    }

    // --- Calendar Rendering ---
    function renderCalendar(dateToRender) {
        // ... (renderCalendar function remains largely the same)
        // IMPORTANT CHANGE: Inside the loop for day cells, when adding click listener for admins:
        // const currentRoleOnRender = localStorage.getItem('exodusUserRole');
        // if (currentRoleOnRender === 'uploader') { /* add admin-clickable class and event listener */ }
        if (!calendarGrid || !monthYearDisplay) { /* ... */ return; }
        console.log("calendar.js: Rendering calendar for", dateToRender.toLocaleDateString());
        calendarGrid.innerHTML = '';
        bgIndex = 0;
        const year = dateToRender.getFullYear();
        const month = dateToRender.getMonth();
        monthYearDisplay.textContent = `${dateToRender.toLocaleString('default', { month: 'long' })} ${year}`;
        const firstDayOfMonthDateObj = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startingDayOfWeek = firstDayOfMonthDateObj.getDay();
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayNames.forEach(dayName => { /* ... */ 
            const dayHeaderEl = document.createElement('div');
            dayHeaderEl.classList.add('calendar-day-header');
            dayHeaderEl.textContent = dayName;
            calendarGrid.appendChild(dayHeaderEl);
        });
        for (let i = 0; i < startingDayOfWeek; i++) { /* ... */ 
            const emptyCell = document.createElement('div');
            emptyCell.classList.add('calendar-day', 'other-month');
            calendarGrid.appendChild(emptyCell);
        }
        for (let day = 1; day <= daysInMonth; day++) {
            const dayCell = document.createElement('div');
            dayCell.classList.add('calendar-day');
            const dayNumberEl = document.createElement('span');
            dayNumberEl.classList.add('day-number');
            dayNumberEl.textContent = day;
            dayCell.appendChild(dayNumberEl);
            const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayEvents = currentMonthEvents.filter(event => event.date === cellDateStr);
            const eventListEl = document.createElement('div');
            eventListEl.classList.add('event-list');
            if (dayEvents.length > 0) {
                dayEvents.forEach(event => { /* ... eventEl creation and append ... */ 
                    const eventEl = document.createElement('div');
                    eventEl.classList.add('event-item');
                    eventEl.innerHTML = `
                        <span class="event-time">${event.startTime || ''} - ${event.endTime || ''}</span>
                        <span class="event-title">${(event.description || 'No Title').substring(0, 20)}${(event.description || '').length > 20 ? '...' : ''}</span>
                    `;
                    eventEl.dataset.eventId = event.id;
                    eventEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openEventModal(event);
                    });
                    eventListEl.appendChild(eventEl);
                });
            } else {
                dayCell.classList.add('empty-day');
                if (emptyDayBackgrounds.length > 0 && emptyDayBackgrounds[0]) {
                    dayCell.style.backgroundImage = `url('${emptyDayBackgrounds[bgIndex % emptyDayBackgrounds.length]}')`;
                    bgIndex++;
                }
            }
            dayCell.appendChild(eventListEl);
            const currentRoleOnRender = localStorage.getItem('exodusUserRole'); // Get current role
            if (currentRoleOnRender === 'uploader') { // Check for 'uploader'
                dayCell.classList.add('admin-clickable'); // 'admin-clickable' for CSS if needed
                dayCell.addEventListener('click', (e) => {
                    if (e.target === dayCell || e.target === dayNumberEl) {
                        openEventModal(null, cellDateStr);
                    }
                });
            }
            calendarGrid.appendChild(dayCell);
        }
    }

    // --- Event Modal Logic ---
    function openEventModal(event = null, dateForNewEvent = null) {
        // ... (openEventModal function remains largely the same)
        // IMPORTANT CHANGE: Check for 'uploader' role to enable editing/deleting.
        // const currentRoleForModal = localStorage.getItem('exodusUserRole');
        // if (currentRoleForModal === 'uploader') { /* enable form, show delete btn */ } else { /* disable form */ }
        if (!eventModal || !eventForm /*... other elements ...*/) { return; }
        const currentRoleForModal = localStorage.getItem('exodusUserRole');
        eventForm.reset();
        eventIdInput.value = '';
        deleteEventBtn.style.display = 'none';
        if (event) {
            eventModalTitle.textContent = currentRoleForModal === 'uploader' ? 'Edit Event' : 'View Event'; // Check 'uploader'
            eventIdInput.value = event.id;
            eventDateInput.value = event.date;
            startTimeInput.value = event.startTime;
            endTimeInput.value = event.endTime;
            locationInput.value = event.location || '';
            descriptionInput.value = event.description;
            if (currentRoleForModal === 'uploader') { // Check 'uploader'
                deleteEventBtn.style.display = 'inline-block';
                setFormEditable(true);
            } else {
                setFormEditable(false);
            }
        } else {
            eventModalTitle.textContent = 'Add New Event';
            if (dateForNewEvent) eventDateInput.value = dateForNewEvent;
            setFormEditable(true); // Assumes only 'uploader' can trigger this path
        }
        eventModal.style.display = 'block';
    }

    function setFormEditable(isEditable) {
        // ... (setFormEditable remains largely the same)
        // ... but ensure deleteEventBtn logic considers 'uploader' role for its visibility if called independently.
        eventDateInput.disabled = !isEditable;
        startTimeInput.disabled = !isEditable;
        endTimeInput.disabled = !isEditable;
        locationInput.disabled = !isEditable;
        descriptionInput.disabled = !isEditable;
        saveEventBtn.style.display = isEditable ? 'inline-block' : 'none';
        const currentEventId = eventIdInput.value;
        const currentRoleForEdit = localStorage.getItem('exodusUserRole');
        if (isEditable && currentEventId && currentRoleForEdit === 'uploader') {
             deleteEventBtn.style.display = 'inline-block';
        } else {
            deleteEventBtn.style.display = 'none';
        }
    }

    function closeEventModal() { /* ... as before ... */ 
         if(eventModal) eventModal.style.display = 'none';
    }

    // Handle Event Form Submission (check for 'uploader' role)
    if (eventForm) {
        eventForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const currentRoleForSubmit = localStorage.getItem('exodusUserRole');
            if (currentRoleForSubmit !== 'uploader') { // Check for 'uploader'
                console.warn("calendar.js: Non-uploader tried to submit event form.");
                return;
            }
            // ... (rest of submit logic as before, using eventsCollection.doc().update() or .add()) ...
            const eventData = { /* ... */ 
                date: eventDateInput.value,
                startTime: startTimeInput.value,
                endTime: endTimeInput.value,
                location: locationInput.value,
                description: descriptionInput.value,
            };
            const currentEventIdVal = eventIdInput.value;
            if (currentEventIdVal) {
                eventsCollection.doc(currentEventIdVal).update(eventData)
                    .then(() => { console.log("Event updated!"); closeEventModal(); })
                    .catch(error => { console.error("Error updating event: ", error); alert("Error: " + error.message); });
            } else {
                eventsCollection.add(eventData)
                    .then(() => { console.log("Event added!"); closeEventModal(); })
                    .catch(error => { console.error("Error adding event: ", error); alert("Error: " + error.message); });
            }
        });
    }

    // Handle Delete Event (check for 'uploader' role)
    if (deleteEventBtn) {
        deleteEventBtn.addEventListener('click', () => {
            const currentRoleForDelete = localStorage.getItem('exodusUserRole');
            if (currentRoleForDelete !== 'uploader') { // Check for 'uploader'
                console.warn("calendar.js: Non-uploader tried to delete event.");
                return;
            }
            // ... (rest of delete logic as before) ...
            const currentEventIdVal = eventIdInput.value;
            if (currentEventIdVal && confirm('Are you sure you want to delete this event?')) {
                eventsCollection.doc(currentEventIdVal).delete()
                    .then(() => { console.log("Event deleted!"); closeEventModal(); })
                    .catch(error => { console.error("Error deleting event: ", error); alert("Error: " + error.message); });
            }
        });
    }

    // --- Event Listeners for Calendar Navigation & Modal ---
    // ... (Prev/Next month button listeners remain the same, calling fetchAndListenForEvents) ...
    if (prevMonthBtn) { prevMonthBtn.addEventListener('click', () => { /* ... */ currentDate.setMonth(currentDate.getMonth() - 1); fetchAndListenForEvents(currentDate.getFullYear(), currentDate.getMonth()); }); }
    if (nextMonthBtn) { nextMonthBtn.addEventListener('click', () => { /* ... */ currentDate.setMonth(currentDate.getMonth() + 1); fetchAndListenForEvents(currentDate.getFullYear(), currentDate.getMonth()); }); }

    if (addEventBtn) {
        addEventBtn.addEventListener('click', () => {
            const currentRoleForAdd = localStorage.getItem('exodusUserRole');
            if (currentRoleForAdd === 'uploader') { // Check for 'uploader'
                const today = new Date();
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                openEventModal(null, todayStr);
            }
        });
    }

    if (closeModalBtn) closeModalBtn.addEventListener('click', closeEventModal);
    window.addEventListener('click', (event) => { /* ... as before ... */ 
        if (eventModal && event.target == eventModal) {
            closeEventModal();
        }
    });

    // --- Initial Load ---
    // UI for role and initial event fetch will now be triggered by the 'exodusUserRoleUpdated' event
    // or if the page loads and user is already "logged in" (i.e., localStorage has role).
    // However, to handle direct page loads where localStorage might already be set:
    if (localStorage.getItem('exodusUserUID')) {
        console.log("calendar.js: User UID found on initial load, initializing UI and fetching events.");
        initializeUIForRole();
        fetchAndListenForEvents(currentDate.getFullYear(), currentDate.getMonth());
    } else {
        console.log("calendar.js: No user UID in localStorage on initial load. Waiting for auth state.");
        if(calendarGrid) calendarGrid.innerHTML = "<p style='text-align:center;'>Please log in to view events.</p>";
    }
});
