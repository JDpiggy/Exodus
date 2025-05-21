document.addEventListener('DOMContentLoaded', () => {
    // Auth state is primarily handled by auth.js.
    // This script assumes if it runs on index.html, the user should be authenticated.
    const userRole = localStorage.getItem('exodusUserRole');
    const userUID = localStorage.getItem('exodusUserUID');

    if (!userRole || !userUID) {
        // This is a fallback. auth.js should have redirected.
        // If a user somehow gets here without auth.js running first or clearing localStorage,
        // they will be redirected by auth.js's onAuthStateChanged listener.
        console.warn("User role or UID not found in localStorage. Auth listener should redirect.");
        // To be safe, you could force redirect, but it might conflict with auth.js
        // window.location.href = 'login.html';
        // return; // Stop execution if redirecting here
    }

    const monthYearDisplay = document.getElementById('monthYearDisplay');
    const calendarGrid = document.getElementById('calendarGrid');
    const prevMonthBtn = document.getElementById('prevMonthBtn');
    const nextMonthBtn = document.getElementById('nextMonthBtn');
    const addEventBtn = document.getElementById('addEventBtn');

    const eventModal = document.getElementById('eventModal');
    const closeModalBtn = document.querySelector('.modal .close-btn');
    const eventForm = document.getElementById('eventForm');
    const eventModalTitle = document.getElementById('eventModalTitle');
    const eventIdInput = document.getElementById('eventId'); // Hidden input for Firestore doc ID
    const eventDateInput = document.getElementById('eventDate');
    const startTimeInput = document.getElementById('startTime');
    const endTimeInput = document.getElementById('endTime');
    const locationInput = document.getElementById('location');
    const descriptionInput = document.getElementById('description');
    const deleteEventBtn = document.getElementById('deleteEventBtn');
    const saveEventBtn = document.getElementById('saveEventBtn');


    // --- CONFIGURATION ---
    const emptyDayBackgrounds = [
        'images/bg-empty-1.jpg', // Make sure these images exist in public/images/
        'images/bg-empty-2.jpg',
        'images/bg-empty-3.jpg',
        // Add more image paths as needed
    ];
    let bgIndex = 0; // To cycle through background images

    let currentDate = new Date();
    let currentMonthEvents = []; // To store events for the currently viewed month from Firestore

    // Firestore collection reference
    const eventsCollection = db.collection('events');

    // --- UI Initialization based on Role ---
    if (addEventBtn) {
        if (userRole === 'admin') {
            addEventBtn.style.display = 'inline-block';
        } else {
            addEventBtn.style.display = 'none';
        }
    }

    // --- Firestore Event Fetching (Real-time) ---
    function fetchAndListenForEvents(year, month) {
        // Dates in Firestore are best stored as Firestore Timestamps or YYYY-MM-DD strings for querying.
        // For simplicity with month view, we'll query based on YYYY-MM string prefix if dates are YYYY-MM-DD.
        // Or, fetch a slightly wider range and filter client-side.
        // Here, we'll use onSnapshot for real-time updates.
        
        // For more precise querying, store a 'yearMonth' field (e.g., "2023-11") in your event documents.
        // Or query for dates within the month's start and end timestamp.
        // This example fetches all events and filters client-side. Not ideal for huge datasets.
        eventsCollection.orderBy("date").onSnapshot(snapshot => {
            currentMonthEvents = [];
            snapshot.forEach(doc => {
                const event = { id: doc.id, ...doc.data() };
                // Assuming event.date is stored as "YYYY-MM-DD"
                const eventDateObj = new Date(event.date + "T00:00:00"); // Ensure correct parsing
                if (eventDateObj.getFullYear() === year && eventDateObj.getMonth() === month) {
                    currentMonthEvents.push(event);
                }
            });
            renderCalendar(currentDate);
        }, error => {
            console.error("Error fetching events: ", error);
            // Optionally, display an error to the user on the calendar page
        });
    }

    // --- Calendar Rendering ---
    function renderCalendar(dateToRender) {
        if (!calendarGrid || !monthYearDisplay) {
            console.error("Calendar grid or month display element not found.");
            return;
        }
        calendarGrid.innerHTML = ''; // Clear previous grid
        bgIndex = 0; // Reset background image index for new month render
        const year = dateToRender.getFullYear();
        const month = dateToRender.getMonth(); // 0-indexed

        monthYearDisplay.textContent = `${dateToRender.toLocaleString('default', { month: 'long' })} ${year}`;

        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);
        const daysInMonth = lastDayOfMonth.getDate();
        const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 for Sunday, 1 for Monday...

        // Add day headers (Sun, Mon, Tue...)
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayNames.forEach(dayName => {
            const dayHeaderEl = document.createElement('div');
            dayHeaderEl.classList.add('calendar-day-header');
            dayHeaderEl.textContent = dayName;
            calendarGrid.appendChild(dayHeaderEl);
        });

        // Add empty cells for days before the first day of the month
        for (let i = 0; i < startingDayOfWeek; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.classList.add('calendar-day', 'other-month');
            calendarGrid.appendChild(emptyCell);
        }

        // Add day cells
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
                dayEvents.sort((a, b) => a.startTime.localeCompare(b.startTime)); // Sort events by start time
                dayEvents.forEach(event => {
                    const eventEl = document.createElement('div');
                    eventEl.classList.add('event-item');
                    eventEl.innerHTML = `
                        <span class="event-time">${event.startTime} - ${event.endTime}</span>
                        <span class="event-title">${event.description.substring(0, 20)}${event.description.length > 20 ? '...' : ''}</span>
                    `;
                    eventEl.dataset.eventId = event.id;
                    eventEl.addEventListener('click', (e) => {
                        e.stopPropagation(); // Prevent day cell click when clicking event
                        openEventModal(event);
                    });
                    eventListEl.appendChild(eventEl);
                });
            } else {
                dayCell.classList.add('empty-day');
                if (emptyDayBackgrounds.length > 0) {
                    dayCell.style.backgroundImage = `url('${emptyDayBackgrounds[bgIndex % emptyDayBackgrounds.length]}')`;
                    bgIndex++;
                }
            }
            dayCell.appendChild(eventListEl);

            if (userRole === 'admin') {
                dayCell.classList.add('admin-clickable');
                dayCell.addEventListener('click', (e) => {
                    // Only trigger if clicking on the day cell background or number, not an event item
                    if (e.target === dayCell || e.target === dayNumberEl) {
                        openEventModal(null, cellDateStr); // Pass date for new event
                    }
                });
            }
            calendarGrid.appendChild(dayCell);
        }
    }

    // --- Event Modal Logic ---
    function openEventModal(event = null, dateForNewEvent = null) {
        eventForm.reset();
        eventIdInput.value = ''; // Clear any previous event ID
        deleteEventBtn.style.display = 'none'; // Hide delete button by default

        if (event) { // Viewing or Editing existing event
            eventModalTitle.textContent = userRole === 'admin' ? 'Edit Event' : 'View Event';
            eventIdInput.value = event.id;
            eventDateInput.value = event.date;
            startTimeInput.value = event.startTime;
            endTimeInput.value = event.endTime;
            locationInput.value = event.location || '';
            descriptionInput.value = event.description;

            if (userRole === 'admin') {
                deleteEventBtn.style.display = 'inline-block';
                setFormEditable(true);
            } else { // Viewer
                setFormEditable(false);
            }
        } else { // Adding new event (only admins can do this)
            eventModalTitle.textContent = 'Add New Event';
            if (dateForNewEvent) {
                eventDateInput.value = dateForNewEvent;
            }
            setFormEditable(true); // Form is for adding, so it's editable
        }
        eventModal.style.display = 'block';
    }

    function setFormEditable(isEditable) {
        eventDateInput.disabled = !isEditable;
        startTimeInput.disabled = !isEditable;
        endTimeInput.disabled = !isEditable;
        locationInput.disabled = !isEditable;
        descriptionInput.disabled = !isEditable;
        saveEventBtn.style.display = isEditable ? 'inline-block' : 'none';
        if (!isEditable) { // If not editable, also hide delete button
            deleteEventBtn.style.display = 'none';
        } else if (eventIdInput.value) { // Editable and there's an event ID (editing)
             deleteEventBtn.style.display = 'inline-block';
        }
    }

    function closeEventModal() {
        if(eventModal) eventModal.style.display = 'none';
    }

    // Handle Event Form Submission (Admin only)
    if (eventForm && userRole === 'admin') {
        eventForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const eventData = {
                date: eventDateInput.value,
                startTime: startTimeInput.value,
                endTime: endTimeInput.value,
                location: locationInput.value,
                description: descriptionInput.value,
                // Optional: Add who created/updated it and when
                // createdByUID: userUID,
                // lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            };

            const currentEventId = eventIdInput.value;

            if (currentEventId) { // Editing existing event
                eventsCollection.doc(currentEventId).update(eventData)
                    .then(() => {
                        console.log("Event updated successfully!");
                        closeEventModal();
                        // Real-time listener will update the UI
                    })
                    .catch(error => {
                        console.error("Error updating event: ", error);
                        alert("Error updating event: " + error.message);
                    });
            } else { // Adding new event
                eventsCollection.add(eventData)
                    .then(()_ => {
                        console.log("Event added successfully!");
                        closeEventModal();
                        // Real-time listener will update the UI
                    })
                    .catch(error => {
                        console.error("Error adding event: ", error);
                        alert("Error adding event: " + error.message);
                    });
            }
        });
    }

    // Handle Delete Event (Admin only)
    if (deleteEventBtn && userRole === 'admin') {
        deleteEventBtn.addEventListener('click', () => {
            const currentEventId = eventIdInput.value;
            if (currentEventId && confirm('Are you sure you want to delete this event?')) {
                eventsCollection.doc(currentEventId).delete()
                    .then(() => {
                        console.log("Event deleted successfully!");
                        closeEventModal();
                        // Real-time listener will update the UI
                    })
                    .catch(error => {
                        console.error("Error deleting event: ", error);
                        alert("Error deleting event: " + error.message);
                    });
            }
        });
    }

    // --- Event Listeners for Calendar Navigation & Modal ---
    if (prevMonthBtn) {
        prevMonthBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            fetchAndListenForEvents(currentDate.getFullYear(), currentDate.getMonth());
        });
    }

    if (nextMonthBtn) {
        nextMonthBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            fetchAndListenForEvents(currentDate.getFullYear(), currentDate.getMonth());
        });
    }

    if (addEventBtn && userRole === 'admin') {
        addEventBtn.addEventListener('click', () => openEventModal(null, new Date().toISOString().split('T')[0])); // Open with today's date
    }

    if (closeModalBtn) closeModalBtn.addEventListener('click', closeEventModal);
    
    window.addEventListener('click', (event) => { // Close modal if click outside
        if (event.target == eventModal) {
            closeEventModal();
        }
    });

    // --- Initial Load ---
    // Start listening for events for the current month as soon as the DOM is ready
    // and the user role is confirmed.
    if (userRole && userUID) { // Ensure we have user context before fetching
        fetchAndListenForEvents(currentDate.getFullYear(), currentDate.getMonth());
    } else {
        // This case should ideally be handled by the auth.js redirection.
        // If it's reached, it means the page loaded without proper auth context.
        console.log("Waiting for authentication state...");
    }
});
