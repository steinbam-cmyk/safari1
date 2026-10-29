
# Personal Assistant — Build Spec
2026-10-28 · @amit
## Overview
A personal assistant for a BGU electrical-engineering student, used as a web app on computer, iPad and phone. Its main tab is a calendar synced two-way with Google Calendar. It also tracks missed lectures (makeups), personal tasks with step-by-step flows, and Moodle deadlines and recordings. The user can also talk to it in Hebrew through the Claude app, which connects as a custom connector (a remote MCP server) and makes the same changes.
Core principles:
- The web app and Claude do the same things. Anything done in chat shows up in the web app on every device, and the other way round.
- No Claude API inside. The server makes no LLM calls; language understanding happens in the Claude app. Server logic is deterministic and testable.
- The user decides where things go. The app suggests free windows; the user picks one or leaves the item for later. Claude creates or moves events only after the user picks or approves.
- Never touch the timetable. The מערכת שעות calendar is read-only.
- Hebrew first. All user-facing text is Hebrew and right-to-left; code and identifiers are English.
- Private. One user, behind Cloudflare Access.
## Architecture and tech stack
One Python app serves the web app and the Claude connector on top of one database, and reaches the internet only through a Cloudflare Tunnel.
You reach the server two ways: in the web app from any device, or by chatting with Claude, which calls the connector tools. Reminders reach your phone through Google Calendar's own notifications.
- Language: Python 3.12; time zones with zoneinfo (Asia/Jerusalem).
- Connector: the official MCP Python SDK with the Streamable HTTP transport, mounted at /mcp in the same app.
- Web app: FastAPI with Jinja2 templates and htmx; FullCalendar for the calendar tab and Cytoscape.js for flow tasks. Installable to the home screen on iPhone and iPad.
- Database: SQLite with SQLAlchemy and Alembic migrations.
- Background jobs: APScheduler inside the app.
- Google: google-api-python-client with offline OAuth.
- Moodle: plain HTTP calls with httpx to Moodle's web service API.
- Hosting: Docker Compose with two services, the app and cloudflared (Cloudflare Tunnel). It runs the same on a home computer or a cloud server, with no open ports.
## Google Calendars and colours
The app reads the timetable, owns three calendars, and shows them all in its calendar tab in day, week and month views.
Calendar
Colour
Access
Holds
מערכת שעות
Blue
Read only
Lectures and tutorials, maintained by the user
השלמות
Orange
Read and write, created by the app
Scheduled makeups for missed classes
אישי
Green
Read and write, created by the app
Personal events not related to studies
משימות
To decide
Read and write, created by the app
Tasks placed at a time, and deadline markers
- Colours are set on the Google calendars themselves, so Google Calendar and the web app match.
- Busy time for free windows = all the calendars above + any other Google calendars the user marks as busy.
- Recording links: the timetable can't be edited, so each class's recording link is stored in the app's database and shown on the class in the web app. Tapping a class opens its recording.
- Event tagging: every app-created event stores its database ids in the event's private extended properties. Sync matches events by these ids, never by title.
- Reminders: popup reminders on app-created events, delivered by the Google Calendar app. Makeups and timed tasks: 10 minutes before. Deadline markers: per category, default 3 days, 1 day and 3 hours before.
- Two-way sync every 5 minutes, using sync tokens. Changes made in Google Calendar (moved, deleted or new events) show up in the web app, and the other way round.
- Course matching: classes in מערכת שעות are matched to courses by a title pattern stored on each course.
- Done means gone: watched makeups and done tasks are deleted from Google Calendar. The database keeps the history.
- Auth: Google OAuth with offline access and the full Calendar scope, which creating calendars requires.
## Data model
Twelve tables in SQLite. Times are stored in UTC and shown in Asia/Jerusalem.
Table
Key fields
Notes
Category
name, default reminders, default estimate
Seeded with אוניברסיטה and אישי; user can add more
Course
name, Moodle course id, timetable title pattern
Links Moodle, the timetable and makeups
Task
title, type, category, course?, deadline?, estimate (minutes)?, status, source, link?, notes
Type: regular or flow. Status: open, scheduled, done, cancelled. Source: manual, moodle
Step
task, title, notes, done, box?, order
A checklist item in a regular task, or a node in a flow
Box
task, title?
Groups flow steps that clear a blocker; done when all its steps are done
Arrow
task, from (step or box), to (step or box)
Must stay acyclic; a cycle is rejected with a Hebrew error
Slot
task or makeup, start, end, Google event id, status
A time the user placed an item in; any length
Makeup
course, class event id, lesson date, duration, recording link?, status
Status: to schedule, scheduled, watched
Recording
course, class event id, date, link
Filled by the daily Moodle sync
Proposal
kind, payload (JSON), Hebrew summary, status, created at
For changes Claude suggests to several items, submissions and emails
HabitLog
item, category, course, estimate, actual, windows offered, window chosen
Feeds habit learning
Settings
key, value
Hours, days off, colours, brief times
How flow tasks work:
- A regular task is steps with no boxes or arrows: a checklist.
- In a flow task, a step or box is locked until everything with an arrow into it is done. A box is done when all its steps are done.
- Steps usually run in one line, but a step or box can have two or more incoming arrows.
- Every step has notes (what to ask, what's needed), so the user always sees where they stopped and what comes next.
- Placing a task in the calendar needs an estimate; Claude or the web app asks for one if it's missing.
## Free windows and suggestions
Nothing is placed automatically. For any item the app finds free windows and suggests a few, and the user picks one or leaves it for later.
Free time
- Working window: Sunday to Thursday, 08:00 to 24:00 (sleep 00:00 to 08:00). Friday and Saturday are off by default.
- Subtract busy events from every calendar marked as busy. A window is offered only if it fits the item's full length.
- Items keep their real length; there are no fixed work blocks.
Suggestions
- Each item has a length (makeup = lecture length; task = its estimate) and a target: a makeup before the course's next lecture, a task 1 day before its deadline.
- The app finds every free window that fits that length before the target.
- It offers 3 options (the earliest, plus windows at hours the user usually picks) and highlights all free windows in the calendar.
- The user picks one, which creates the event, or chooses "אחר כך", which keeps the item in the "לשבץ" list.
- If nothing fits, it says so and offers Friday or a time after the target.
Changes later
- A scheduled makeup or task whose time passes undone goes back to "לשבץ" and appears in the morning brief.
- If a new event overlaps a scheduled item, the app flags it and offers new windows.
- The user can drag any item to another time in the calendar; drags apply at once.
With Claude
- The user asks, e.g. "פספסתי היום את ההרצאה בחשמל, מתי אני יכול להשלים?".
- Claude calls suggest_slots and reads out the options.
- The user picks one or says later. Claude creates the event only after the user picks.
- When Claude suggests placing several items at once, it saves one pending Proposal, approved in chat or in the web app. A proposal expires after 24 hours.
## Makeups (השלמות)
A missed class becomes an orange makeup with its recording link in two taps, and disappears once watched.
- In the calendar tab, the user taps a lecture or tutorial and chooses "השלמה". Or the user tells Claude, which calls mark_missed_class; if the class is unclear, the tool returns that day's classes so Claude can ask.
- The class is copied, with its length and course, to the "לשבץ" list as an orange makeup. The original class is not touched.
- The recording link comes from the daily Moodle sync, or the user pastes it (phase 1).
- The app highlights free windows and suggests 3 options. The user picks one, or leaves it in "לשבץ" for later.
- Once placed, the makeup appears in orange in Google Calendar and in the web app, with the recording link.
- Tapping "צפיתי" (or telling Claude) closes it and deletes it from Google Calendar.
Rules:
- No automatic attendance check. A makeup exists only when the user marks a class.
- Open makeups appear in the morning brief and the weekly summary until watched.
- If a placed makeup's time passes unwatched, it goes back to "לשבץ".
- To confirm: a count of open makeups per course, and a reminder when a makeup is still open as the course's next lecture approaches.
## Moodle integration
Use Moodle's web service API, the same one the official Moodle phone app uses (which works with BGU's Moodle). No page scraping.
Auth
- Get a token once during setup from /login/token.php?service=moodle_mobile_app with the user's username and password. Store only the token in the server's secrets, never the password.
- If BGU signs in through a single sign-on page and token.php refuses, fall back to letting the user paste a token. Check this first.
- At setup, call core_webservice_get_site_info, log which functions are enabled, and turn off features whose functions are missing.
Deadline sync (every 3 hours)
- core_enrol_get_users_courses → courses (creates Course rows; the user sets each course's timetable title pattern once).
- mod_assign_get_assignments and core_calendar_get_action_events_by_timesort → assignments and due dates.
- New item → task in inbox (source moodle, course, deadline, link). Claude asks for an estimate.
- Changed due date → task updated and a reschedule proposal. Already submitted on Moodle → task marked done.
Recording links (daily at 22:00)
- For each lecture and tutorial that day, call core_course_get_contents for its course and match modules whose name or date fits the class.
- Store the link in Recording and show it on the class in the web app. A makeup for that class gets the same link.
- If no recording is found, try again each night for 3 days, then leave it for the user to paste.
- Best effort: recordings may sit in an external video system linked from Moodle. Store whatever link Moodle exposes.
Assignment submission (phase 3)
- prepare_submission returns a one-time upload link in the web app, where the user uploads the file from phone or computer. Files attached in the Claude chat can't be handed to the server directly.
- The server builds a Proposal: course, assignment, file name, size, deadline. Claude shows it and waits for "שלח".
- On approval: upload to the draft area (/webservice/upload.php), then mod_assign_save_submission, then mod_assign_submit_for_grading when the assignment requires a final submit.
- Confirm with mod_assign_get_submission_status and report the result in Hebrew. On any failure, report it and never retry silently.
Email to a TA (phase 3): Gmail API with the same proposal flow (recipient, subject, body, attachment, then "שלח").
## Claude connector tools
The server exposes these MCP tools; Claude picks them from the user's Hebrew requests.
Tool
What it does
Phase
get_calendar
Events, makeups and tasks for a day, week or month
1
add_event, update_event, delete_event
Personal events in the green calendar
1
mark_missed_class
Turns a class into a makeup in "לשבץ"
1
suggest_slots
Free windows and 3 options for a makeup or task
1
schedule_item
Places a makeup or task in the window the user picked
1
list_makeups, mark_watched, set_recording_link
Manage makeups
1
add_task, update_task, list_tasks, complete_task
Regular and flow tasks
1
add_step, update_step, complete_step
Steps and their notes; completing one returns what just unlocked
1
add_box, add_arrow, remove_arrow
Build a flow; rejects cycles
1
suggest_plan, apply_proposal, reject_proposal
Windows for several items at once, as one proposal
1
daily_brief, weekly_summary
Morning brief and Saturday-night planning
1
get_settings, update_settings
Read and change settings
1
sync_moodle, suggest_estimate
Runs the Moodle sync now; estimate from past tasks
2
prepare_submission, draft_email
Submission and TA email proposals
3
Rules for every tool:
- Tool descriptions tell Claude to reply in Hebrew, to call schedule_item only with a window the user picked, and to call apply_proposal only after the user explicitly approves.
- Each result has a short Hebrew summary plus structured data.
- Read-only tools carry the MCP read-only hint; tools that write to the calendar, Moodle or email carry the destructive hint.
- Errors come back as a Hebrew sentence saying what to do next, never a stack trace.
- schedule_item and apply_proposal are idempotent: a repeat call changes nothing.
## Web app
A Hebrew, right-to-left web app with three tabs that works the same on phone, iPad and computer, and can be added to the home screen.
יומן (calendar)
- Day, week and month views, synced two-way with Google Calendar.
- Blue lectures, orange makeups, green personal events, plus tasks placed at a time and deadline markers.
- Tap a class to open its recording or choose "השלמה".
- A "לשבץ" side list holds unscheduled makeups and tasks. Choosing one highlights the free windows and shows 3 suggested options: tap one, drag the item onto a window, or leave it for later.
- Add and edit personal events directly.
- Suggested library: FullCalendar (Hebrew locale, right-to-left, day, week and month views, dragging from an outside list).
משימות (tasks)
- Regular task: a card with a checklist of steps.
- Flow task: a flowchart. Steps that clear a blocker sit together in a box, and an arrow runs from the box to what it unlocks. Locked steps are greyed out and open as soon as everything before them is done.
- Each step shows its notes (what to ask, what's needed), so it's clear where you stopped.
- Build a flow by adding steps, grouping them into a box, and dragging an arrow from one node to another.
- Suggested library: Cytoscape.js (its compound nodes draw the boxes).
השלמות
- Open makeups grouped by course, each with its recording link and a "צפיתי" button.
Also: pending proposals from Claude appear as a banner on the calendar tab with approve and reject buttons, and phase 3 adds the one-time upload page for submission files.
Tech: FastAPI with Jinja2 templates and htmx, plus the two libraries from a CDN. No separate frontend build step, so the whole project stays Python.
## Habit learning
The assistant learns from what the user actually does, but a learned habit changes behavior only after the user approves it.
- Estimates: Claude asks for an estimate when a task is placed. After 3 or more finished tasks of the same course and category, suggest_estimate offers the median actual time ("בדרך כלל זה לוקח לך שעתיים, לקבוע שעתיים?"). The user's answer is what gets saved.
- Preferred windows: the app records which suggested windows the user picks or skips, and later suggestions put the user's usual hours first. A firm rule, such as never suggesting mornings, is set only after the user approves it.
- Category defaults: if the user changes a category's reminders the same way 3 times in a row, Claude offers to change the default.
Simple counts and medians only, no machine learning. Every learned rule is listed in settings and can be removed.
## Settings and defaults
All of these live in the Settings table and can be changed by chat or in the web app.
Setting
Value
Decided by
Free-window hours
Sunday to Thursday, 08:00 to 24:00 (sleep 00:00 to 08:00)
User
Friday and Saturday
Off; Friday as a backup day is still open
User
Item length
Real length, no fixed blocks
User
Placing items
App suggests 3 windows; user picks or leaves for later
User
Claude changes
Only after the user picks or approves
User
Submissions and emails
Always confirm first
User
Colours
Timetable blue, makeups orange, personal green
User
Categories
אוניברסיטה, אישי; more can be added
User
University assignment
Target 1 day before deadline; reminders 3 days, 1 day, 3 hours before
Default
Exam
Reminder to start studying 14 days before
Default
Personal task
Reminder on the morning of
Default
Makeup
Lecture length, suggested before the course's next lecture
User
Recording sync
Daily at 22:00
Default
Attendance check
Off
User
Access
Cloudflare Access, user's email only, one-time code per device
User
Morning brief
07:30, Sunday to Thursday
Default
Weekly planning
Saturday 21:00
Default
The morning brief and weekly planning run as scheduled tasks in the Claude app that call daily_brief and weekly_summary. Fallback if that doesn't work: the server creates a short 07:30 event in משימות with the brief in its description.
## Build phases
Build one phase at a time and use it for a week before starting the next.
Phase
Includes
Done when
1 – core
Cloudflare Tunnel and Access; Claude connector; calendar tab (day, week, month, colours, two-way Google sync); personal events; makeups with free-window suggestions, pasted recording links and "צפיתי"; regular and flow tasks; brief tools
From the phone: tap a lecture, choose "השלמה", pick a suggested window, and an orange event appears in Google Calendar. The same works by telling Claude. Finishing a box in a flow unlocks the next step
2 – Moodle
Daily recording links; Moodle deadlines as tasks; makeup counters and reminders; habit-based suggestions
A day's recordings show on its classes by the next morning, and a new Moodle assignment appears as a task within 3 hours
3 – submitting
Moodle submission and TA email, both with confirmation
A test file submitted to an assignment that allows resubmission is confirmed by Moodle's submission status
Later
Lab report helper: background drafts from the lab booklets, data analysis and graphs
To be specified
## Hosting, security and testing
The server holds calendar access and a Moodle token, so only the user can reach it, from day one.
Access
- Cloudflare Tunnel (cloudflared) connects the server to the user's Cloudflare domain. There are no open ports, and it works the same on a home computer or a cloud server.
- Cloudflare Access protects the web app: only the user's email may enter, with a one-time email code once per device and a session of up to a month.
- The app also checks the Cloudflare Access token on every web request, so traffic that skipped Access is refused.
- The /mcp path gets its own Access application set to bypass, because Claude can't complete an email login. It is protected by OAuth instead; allow both callback URLs, https://claude.ai/api/mcp/auth_callback and https://claude.com/api/mcp/auth_callback (source). The OAuth login uses one strong password with optional authenticator-app 2FA.
- Secrets (Google client and refresh token, Moodle token, session key) live in a .env file outside git, readable only by the app's user, never logged. Commit a .env.example with names only.
- Upload links are single-use and expire after 30 minutes.
Testing
- pytest unit tests for the free-window finder (days off, full days, overlaps, nothing fits) and for flow locking (boxes, two incoming arrows, cycle rejection).
- Google and Moodle clients sit behind interfaces with fakes for tests, plus one manual smoke-test script against the real services.
- A dry-run setting where calendar writes are logged instead of made, for the first days of use.
Operations
- Docker Compose with two services, the app and cloudflared, both restarting automatically.
- Background jobs inside the app (APScheduler): Google sync every 5 minutes, recordings daily at 22:00, Moodle deadlines every 3 hours, proposal expiry hourly, SQLite backup daily (keep 14).
- On a home computer: turn off sleep and start the containers at boot.
- Structured logs without secrets, and a health-check endpoint.
## Open questions
None of these block phase 1; the defaults in Settings apply until they are answered.
- Which server: a home computer or a cloud server? Both work the same with Cloudflare Tunnel.
- Should your other Google calendars count as busy time?
- What colour for tasks placed in the calendar (משימות)?
- Personal calendar: a new green אישי calendar, or one you already have in Google?
- Should tasks with a deadline show on the deadline day in the calendar?
- Do you want the open-makeup count per course and the reminder before the next lecture?
- Should free windows leave travel time before and after campus days?
- Does BGU's Moodle login go through a single sign-on page? This decides the token setup.
- Keep the morning brief at 07:30 and weekly planning on Saturday at 21:00?
- Any categories beyond אוניברסיטה and אישי?
## How to start the build with Claude Code
Hand Claude Code this spec as a file and have it plan phase 1 before writing any code.
- Export this doc as Markdown and save it as SPEC.md in an empty project folder.
- Open Claude Code in that folder and send: "Read SPEC.md. Build phase 1 only. First show me a plan (folder structure, libraries, build order) and wait for my OK before writing code."
- Build in this order: the free-window finder and flow-locking logic with their tests (no Google yet), then Google Calendar sync, then the calendar tab, then tasks, then the connector tools.
- Run it locally first and test the connector with the MCP Inspector.
- Set up Cloudflare Tunnel and Access on the server, then add the connector as a custom connector in claude.ai on the web. Custom connectors can't be added from the phone, but once added they work in the phone app (source).
- Ask Claude Code to keep a CLAUDE.md with the project's commands and conventions, so later sessions pick up where the last one stopped.
Setup steps done by hand, with Claude Code guiding: a Google Cloud project with the Calendar API and an OAuth client, the Moodle token, and a Cloudflare Tunnel with an Access policy for your email.