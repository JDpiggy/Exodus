// docs/js/calendar.js

// Helper function to convert "HH:MM" (24-hour) to "H:MM AM/PM"
function formatTime12Hour(timeString24) {
    if (!timeString24 || typeof timeString24 !== 'string' || !timeString24.includes(':')) {
        return "";
    }
    const [hoursString, minutesString] = timeString24.split(':');
    const hours24 = parseInt(hoursString, 10);
    const minutes = parseInt(minutesString, 10);

    if (isNaN(hours24) || isNaN(minutes)) {
        return timeString24;
    }

    const ampm = hours24 >= 12 ? 'PM' : 'AM';
    let hours12 = hours24 % 12;
    hours12 = hours12 ? hours12 : 12;
    const minutesPadded = String(minutes).padStart(2, '0');
    return `${hours12}:${minutesPadded} ${ampm}`;
}


document.addEventListener('DOMContentLoaded', () => {
    console.log("calendar.js: DOMContentLoaded event fired.");

    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        console.error("CRITICAL: Firebase or db object is not available in calendar.js. Check script loading order and firebase-config.js.");
        alert("Essential services for the calendar are not loaded. The application may not function correctly. Please check the console for errors.");
        return;
    }

    // --- DOM Elements ---
    // Helper to get element and log if not found
    function getElem(id, isCritical = true) {
        const elem = document.getElementById(id);
        if (!elem && isCritical) {
            console.error(`calendar.js: CRITICAL - DOM Element with ID '${id}' not found!`);
        } else if (!elem) {
            console.warn(`calendar.js: DOM Element with ID '${id}' not found (non-critical).`);
        }
        return elem;
    }

    const monthYearDisplay = getElem('monthYearDisplay');
    const calendarGrid = getElem('calendarGrid');
    const prevMonthBtn = getElem('prevMonthBtn');
    const nextMonthBtn = getElem('nextMonthBtn');
    const addEventBtn = getElem('addEventBtn', false); // Not critical if user is viewer

    const eventModal = getElem('eventModal');
    const closeModalBtn = eventModal ? eventModal.querySelector('.modal .close-btn') : null;
    if (eventModal && !closeModalBtn) console.warn("calendar.js: Close button (.close-btn) not found inside #eventModal.");
    
    const eventForm = getElem('eventForm', !!eventModal); // Critical only if modal exists
    const eventModalTitle = getElem('eventModalTitle', !!eventModal);
    const eventIdInput = getElem('eventId', !!eventModal);
    const eventDateInput = getElem('eventDate', !!eventModal);
    const startTimeInput = getElem('startTime', !!eventModal);
    const endTimeInput = getElem('endTime', !!eventModal);
    const locationInput = getElem('location', !!eventModal);
    const descriptionInput = getElem('description', !!eventModal);
    const deleteEventBtn = getElem('deleteEventBtn', !!eventModal);
    const saveEventBtn = getElem('saveEventBtn', !!eventModal);


    // --- Announcement DOM Elements ---
    const announcementsList = getElem('announcementsList', false); // Not critical for core calendar
    const announcementForm = getElem('announcementForm', false);
    const announcementMessageInput = getElem('announcementMessage', !!announcementForm);
    const postAnnouncementBtn = getElem('postAnnouncementBtn', !!announcementForm);


    // --- CONFIGURATION & STATE ---
    const emptyDayBackgrounds = [ 'images/yo-gurt' ]; // Ensure path/extension correct
    let bgIndex = 0;
    let currentDate = new Date();
    let currentMonthEvents = [];
    let currentMonthHolidays = [];
    let unsubscribeFirestoreListener = null;
    let unsubscribeAnnouncementsListener = null;

    const eventsCollection = db.collection('events');
    const announcementsCollection = db.collection('announcements');


    // --- UI Initialization based on Role ---
    function initializeUIForRole() {
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

    // Listen for role updates from auth.js
    window.addEventListener('exodusUserRoleUpdated', (event) => {
        console.log("calendar.js: Received exodusUserRoleUpdated event, new role:", event.detail.role);
        initializeUIForRole();
        if (event.detail.role && event.detail.role !== "pending") {
             fetchAndListenForEvents(currentDate.getFullYear(), currentDate.getMonth());
             if(announcementsList) fetchAndListenForAnnouncements(); // Only if element exists
             fetchJewishHolidays(currentDate.getFullYear(), currentDate.getMonth());
        } else {
            if (unsubscribeFirestoreListener) unsubscribeFirestoreListener();
            if (unsubscribeAnnouncementsListener) unsubscribeAnnouncementsListener();
            currentMonthEvents = [];
            currentMonthHolidays = [];
            if(calendarGrid) calendarGrid.innerHTML = "<p style='text-align:center;'>Please log in to view calendar.</p>";
            if(announcementsList) announcementsList.innerHTML = "<p style='text-align:center;'>Log in to see announcements.</p>";
            if(monthYearDisplay) monthYearDisplay.textContent = "Calendar";
        }
    });

    // --- HEBCAL API HOLIDAY FETCHING ---
    async function fetchJewishHolidays(year, month) { /* ... (function as provided before) ... */
        const hebcalMonth = month + 1;
        const url = `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&year=${year}&month=${hebcalMonth}&lg=s`;
        console.log(`calendar.js: Fetching Jewish holidays from Hebcal for ${year}-${hebcalMonth}`);
        try {
            const response = await fetch(url);
            if (!response.ok) { throw new Error(`Hebcal API request failed: ${response.status}`); }
            const data = await response.json();
            if (data && data.items) {
                currentMonthHolidays = data.items.map(item => ({ date: item.date, name: item.title, category: item.category }));
            } else { currentMonthHolidays = []; }
        } catch (error) {
            console.error("calendar.js: Error fetching Jewish holidays:", error);
            currentMonthHolidays = [];
        }
        renderCalendar(currentDate);
    }

    // --- Firestore Event Fetching ---
    function fetchAndListenForEvents(year, month) { /* ... (function as provided before) ... */
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
                console.log("calendar.js: Event snapshot received, count:", snapshot.docs.length);
                currentMonthEvents = [];
                snapshot.forEach(doc => { currentMonthEvents.push({ id: doc.id, ...doc.data() }); });
                currentMonthEvents.sort((a,b) => (a.startTime || "00:00").localeCompare(b.startTime || "00:00"));
                renderCalendar(currentDate);
            }, error => {
                console.error("calendar.js: Error fetching events: ", error);
                if (calendarGrid) calendarGrid.innerHTML = "<p style='color:red;text-align:center;'>Error loading events.</p>";
            });
    }

    // --- Calendar Rendering ---
    function renderCalendar(dateToRender) {
        if (!calendarGrid || !monthYearDisplay) {
            console.error("calendar.js: renderCalendar - Calendar grid or month display element not found.");
            return;
        }
        console.log("calendar.js: Rendering calendar for", dateToRender.toLocaleDateString());
        // ... (rest of renderCalendar logic as provided before, including current day and holiday display) ...
        calendarGrid.innerHTML = ''; bgIndex = 0;
        const year = dateToRender.getFullYear(); const month = dateToRender.getMonth();
        monthYearDisplay.textContent = `${dateToRender.toLocaleString('default', { month: 'long' })} ${year}`;
        const todayObj = new Date(); todayObj.setHours(0,0,0,0);
        const firstDayOfMonthDateObj = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startingDayOfWeek = firstDayOfMonthDateObj.getDay();
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayNames.forEach(dayName => { const el=document.createElement('div'); el.className='calendar-day-header'; el.textContent=dayName; calendarGrid.appendChild(el); });
        for (let i = 0; i < startingDayOfWeek; i++) { const el=document.createElement('div'); el.className='calendar-day other-month'; calendarGrid.appendChild(el); }

        for (let day = 1; day <= daysInMonth; day++) {
            const dayCell = document.createElement('div'); dayCell.className='calendar-day';
            const currentDateObj = new Date(year, month, day); currentDateObj.setHours(0,0,0,0);
            if (currentDateObj.getTime() === todayObj.getTime()) { dayCell.classList.add('current-day'); }
            const dayNumberEl = document.createElement('span'); dayNumberEl.className='day-number'; dayNumberEl.textContent=day; dayCell.appendChild(dayNumberEl);
            const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const holidaysOnThisDay = currentMonthHolidays.filter(h => h.date === cellDateStr);
            if (holidaysOnThisDay.length > 0) {
                dayCell.classList.add('holiday-day');
                holidaysOnThisDay.forEach(holiday => { const el=document.createElement('div'); el.className='holiday-name'; el.textContent=holiday.name; dayCell.appendChild(el); });
            }
            const dayEvents = currentMonthEvents.filter(event => event.date === cellDateStr);
            const eventListEl = document.createElement('div'); eventListEl.className='event-list';
            if (dayEvents.length > 0) {
                 dayEvents.forEach(event => {
                    const eventEl = document.createElement('div'); eventEl.className='event-item';
                    const startTime12 = event.startTime ? formatTime12Hour(event.startTime) : '';
                    const endTime12 = event.endTime ? formatTime12Hour(event.endTime) : '';
                    let timeDisplay = startTime12; if (endTime12) { timeDisplay += ` - ${endTime12}`; }
                    eventEl.innerHTML = `<span class="event-time">${timeDisplay}</span><span class="event-title">${(event.description || 'Event').substring(0,20)}${(event.description || '').length > 20 ? '...' : ''}</span>`;
                    eventEl.dataset.eventId = event.id;
                    eventEl.addEventListener('click', (e) => {
                        console.log("calendar.js: Event item clicked, event data:", event); // DEBUG
                        e.stopPropagation();
                        openEventModal(event);
                    });
                    eventListEl.appendChild(eventEl);
                });
            } else if (holidaysOnThisDay.length === 0) {
                dayCell.classList.add('empty-day');
                if (emptyDayBackgrounds.length > 0 && emptyDayBackgrounds[0]) {
                    dayCell.style.backgroundImage = `url('${emptyDayBackgrounds[bgIndex % emptyDayBackgrounds.length]}')`;
                    bgIndex++;
                }
            }
            dayCell.appendChild(eventListEl);
            const currentRoleOnRender = localStorage.getItem('exodusUserRole');
            if (currentRoleOnRender === 'uploader') {
                dayCell.classList.add('uploader-clickable');
                dayCell.addEventListener('click', (e) => {
                    if (e.target === dayCell || e.target === dayNumberEl || e.target.classList.contains('holiday-name')) {
                        console.log("calendar.js: Empty day/holiday name clicked by uploader for date:", cellDateStr); //DEBUG
                        openEventModal(null, cellDateStr);
                    }
                });
            }
            calendarGrid.appendChild(dayCell);
        }
    }

    // --- Event Modal Logic ---
    function openEventModal(event = null, dateForNewEvent = null) {
        console.log("calendar.js: openEventModal called. Event:", event, "Date for new:", dateForNewEvent); // DEBUG

        // Critical check for modal elements
        if (!eventModal || !eventForm || !eventModalTitle || !eventIdInput || !eventDateInput || !startTimeInput || !endTimeInput || !locationInput || !descriptionInput || !deleteEventBtn || !saveEventBtn) {
            console.error("calendar.js: CRITICAL - One or more modal DOM elements are missing. Cannot open modal.");
            alert("Error: Event details cannot be displayed because some page elements are missing.");
            return;
        }

        const currentRoleForModal = localStorage.getItem('exodusUserRole');
        eventForm.reset();
        eventIdInput.value = '';
        deleteEventBtn.style.display = 'none'; // Default hide

        if (event) { // Viewing or Editing existing event
            console.log("calendar.js: Populating modal for existing event:", event);
            eventModalTitle.textContent = currentRoleForModal === 'uploader' ? 'Edit Event' : 'View Event';
            eventIdInput.value = event.id || '';
            eventDateInput.value = event.date || '';
            startTimeInput.value = event.startTime || '';
            endTimeInput.value = event.endTime || '';
            locationInput.value = event.location || '';
            descriptionInput.value = event.description || '';

            if (currentRoleForModal === 'uploader') {
                deleteEventBtn.style.display = 'inline-block';
                setFormEditable(true);
            } else {
                setFormEditable(false);
            }
        } else { // Adding new event
            console.log("calendar.js: Populating modal for new event on date:", dateForNewEvent);
            eventModalTitle.textContent = 'Add New Event';
            if (dateForNewEvent) eventDateInput.value = dateForNewEvent;
            // Ensure time fields are empty or default for new event
            startTimeInput.value = ''; 
            endTimeInput.value = '';
            locationInput.value = '';
            descriptionInput.value = '';
            setFormEditable(true); // Assumes only 'uploader' can trigger this path
        }
        eventModal.style.display = 'block';
        console.log("calendar.js: Event modal display set to 'block'.");
    }

    function setFormEditable(isEditable) {
        if(!eventDateInput) { console.warn("setFormEditable: eventDateInput not found"); return; }
        console.log("calendar.js: setFormEditable called with:", isEditable);
        eventDateInput.disabled = !isEditable;
        startTimeInput.disabled = !isEditable;
        endTimeInput.disabled = !isEditable;
        locationInput.disabled = !isEditable;
        descriptionInput.disabled = !isEditable;
        
        if(saveEventBtn) saveEventBtn.style.display = isEditable ? 'inline-block' : 'none';
        
        const currentEventId = eventIdInput ? eventIdInput.value : null;
        const currentRoleForEdit = localStorage.getItem('exodusUserRole');
        if (isEditable && currentEventId && currentRoleForEdit === 'uploader') {
             if(deleteEventBtn) deleteEventBtn.style.display = 'inline-block';
        } else {
            if(deleteEventBtn) deleteEventBtn.style.display = 'none';
        }
    }

    function closeEventModal() { 
         if(eventModal) {
            eventModal.style.display = 'none';
            console.log("calendar.js: Event modal closed.");
         }
    }

    if (eventForm) {
        eventForm.addEventListener('submit', (e) => { /* ... (submit logic as before) ... */ 
            e.preventDefault();
            const currentRoleForSubmit = localStorage.getItem('exodusUserRole');
            if (currentRoleForSubmit !== 'uploader') { return; }
            const eventData = { 
                date: eventDateInput.value, startTime: startTimeInput.value,
                endTime: endTimeInput.value || null, location: locationInput.value,
                description: descriptionInput.value,
            };
            const currentEventIdVal = eventIdInput.value;
            if (currentEventIdVal) {
                eventsCollection.doc(currentEventIdVal).update(eventData)
                    .then(() => { closeEventModal(); }).catch(error => { console.error("Error updating event: ", error); alert("Error: " + error.message); });
            } else {
                eventsCollection.add(eventData)
                    .then(() => { closeEventModal(); }).catch(error => { console.error("Error adding event: ", error); alert("Error: " + error.message); });
            }
        });
    } else if(eventModal) { // If modal exists but form doesn't, it's an issue.
        console.error("calendar.js: #eventForm not found within the #eventModal!");
    }


    if (deleteEventBtn) {
        deleteEventBtn.addEventListener('click', () => { /* ... (delete logic as before) ... */ 
            const currentRoleForDelete = localStorage.getItem('exodusUserRole');
            if (currentRoleForDelete !== 'uploader') { return; }
            const currentEventIdVal = eventIdInput.value;
            if (currentEventIdVal && confirm('Delete this event?')) {
                eventsCollection.doc(currentEventIdVal).delete()
                    .then(() => { closeEventModal(); }).catch(error => { console.error("Error deleting event: ", error); alert("Error: " + error.message); });
            }
        });
    }

    // --- Announcement Functions ---
    function fetchAndListenForAnnouncements() { /* ... (function as provided before) ... */
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
                snapshot.forEach(doc => { 
                    const announcement = doc.data(); const item = document.createElement('div'); item.className='announcement-item';
                    //let ts = 'Processing...'; if(announcement.timestamp?.toDate) ts = announcement.timestamp.toDate().toLocaleString([],{m:'short',d:'numeric',h:'numeric',minute:'2-digit',hour12:true});
                    //else if(announcement.timestamp) ts = new Date(announcement.timestamp).toLocaleString([],{m:'short',d:'numeric',h:'numeric',minute:'2-digit',hour12:true});
                    let ts = 'Processing...';
                    const options = {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                    };
                    
                    if (announcement.timestamp?.toDate) {
                        ts = announcement.timestamp.toDate().toLocaleString([], options);
                    } else if (announcement.timestamp) {
                        ts = new Date(announcement.timestamp).toLocaleString([], options);
                    }

                    item.innerHTML = `<div class="announcement-author">${announcement.authorDisplayName||'System'}</div><div class="announcement-timestamp">${ts}</div><div class="announcement-message">${(announcement.message||'').replace(/\n/g,'<br>')}</div>`;
                    announcementsList.appendChild(item);
                });
            }, error => { console.error("Error fetching announcements:", error); if(announcementsList) announcementsList.innerHTML = '<p style="color:red;">Error loading announcements.</p>';});
    }

    if (postAnnouncementBtn && announcementMessageInput) { /* ... (post announcement logic as before) ... */
        postAnnouncementBtn.addEventListener('click', () => {
            const msg = announcementMessageInput.value.trim(); const dispName = localStorage.getItem('userDisplayName');
            const uid = localStorage.getItem('exodusUserUID'); const role = localStorage.getItem('exodusUserRole');
            if(role!=='uploader'||!msg||!dispName||!uid) {alert(role!=='uploader'?"No permission":"Info missing"); return;}
            announcementsCollection.add({ message:msg, authorDisplayName:dispName, authorUID:uid, timestamp:firebase.firestore.FieldValue.serverTimestamp()})
            .then(()=>{announcementMessageInput.value='';}).catch(err=>{console.error("Err post announce:",err);alert("Err:"+err.message);});
        });
    }


    // --- Event Listeners for Calendar Navigation & Modal ---
    if (prevMonthBtn) { prevMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); fetchAndListenForEvents(currentDate.getFullYear(), currentDate.getMonth()); fetchJewishHolidays(currentDate.getFullYear(), currentDate.getMonth()); }); }
    if (nextMonthBtn) { nextMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); fetchAndListenForEvents(currentDate.getFullYear(), currentDate.getMonth()); fetchJewishHolidays(currentDate.getFullYear(), currentDate.getMonth()); }); }
    if (addEventBtn) { addEventBtn.addEventListener('click', () => { if(localStorage.getItem('exodusUserRole')==='uploader'){const t=new Date(),ts=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;openEventModal(null,ts);}}); }
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeEventModal);
    window.addEventListener('click', (event) => { if (eventModal && event.target == eventModal) { closeEventModal(); } });

    // --- Initial Load ---
    console.log("calendar.js: Performing initial load checks.");
    const initialUID = localStorage.getItem('exodusUserUID');
    const initialRole = localStorage.getItem('exodusUserRole');
    if (initialUID && initialRole && initialRole !== 'pending') {
        console.log("calendar.js: User UID and valid role found on initial load, initializing UI and fetching data. Role:", initialRole);
        initializeUIForRole();
        fetchAndListenForEvents(currentDate.getFullYear(), currentDate.getMonth());
        if(announcementsList) fetchAndListenForAnnouncements();
        fetchJewishHolidays(currentDate.getFullYear(), currentDate.getMonth());
    } else if (initialRole === 'pending') {
        console.log("calendar.js: User account is pending approval (initial load).");
        if(calendarGrid) calendarGrid.innerHTML = "<p style='text-align:center;'>Your account is awaiting approval.</p>";
        if(announcementsList) announcementsList.innerHTML = "<p style='text-align:center;'>Account pending approval.</p>";
        initializeUIForRole(); // Hide uploader features
    } else {
        console.log("calendar.js: No user UID or role is pending on initial load. Waiting for auth state update from auth.js.");
        if(calendarGrid) calendarGrid.innerHTML = "<p style='text-align:center;'>Please log in to view calendar.</p>";
        if(announcementsList) announcementsList.innerHTML = "<p style='text-align:center;'>Log in to see announcements.</p>";
        // UI should be in default (viewer/logged-out) state here. auth.js event will trigger updates.
    }
});
