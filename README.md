# GreatNote

A small personal notes app with per-user accounts. Each note has a title and one or more pages. Notes are private — every user only sees their own.

## Stack

- **Backend:** Django 4.2+ / Django REST Framework, SQLite, DRF token authentication
- **Frontend:** React (Create React App), axios

## Project layout

```
Claude_Code_HW4/
├── backend/              # Django project
│   ├── backend/          # settings, urls, wsgi
│   ├── notes/            # main app: models, services, views, urls, tests
│   ├── manage.py
│   └── requirements.txt
└── frontend/             # React app
    ├── src/
    │   ├── components/   # NoteEditor, NoteList, SearchBar, FilterPanel, LoginRegister
    │   ├── hooks/        # useDebounce
    │   ├── services/     # apiClient, authService, noteService, pageService
    │   └── App.js
    └── package.json
```

## Features

- Register and log in with username + password (DRF token auth, token kept in `localStorage`)
- Each user only sees their own notes; the API rejects unauthenticated requests with 401
- Create, rename, delete notes; mark favorites
- Multi-page notes — insert / delete pages, autosaved on edit
- Search matches a note's title, body, and the body of any of its pages
- Filter notes by created / modified date range
- Logout button in the sidebar; a 401 anywhere clears the session and returns to the login screen

## First-time setup

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate    # optional but recommended
pip install -r requirements.txt
python manage.py migrate

# Frontend
cd ../frontend
npm install
```

## Running the app

Open two terminals.

**Terminal 1 — backend (port 8000):**
```bash
cd backend
python manage.py runserver
```

**Terminal 2 — frontend (port 3000):**
```bash
cd frontend
npm start
```

Then open http://localhost:3000 in your browser.

## Usage

1. **Register** — on first visit you'll see a login screen. Click *Don't have an account? Register*, pick a username and password, submit.
2. **Create a note** — click *+ New note* in the sidebar. A blank note opens with one empty page.
3. **Edit** — type a title (autosaves after a brief pause) and content into the page body.
4. **Add pages** — use the page controls in the editor to insert or delete pages.
5. **Favorite** — click the star next to a note to favorite it; the *★ Favorites* sidebar toggle filters to favorites only.
6. **Search** — type into the search box at the top of the sidebar. Matches the title and any page content.
7. **Filter by date** — click *Filters* to expand the date range controls.
8. **Logout** — click *Log out* in the sidebar header. Your token is invalidated server-side and cleared locally.

## API reference

All `/api/notes/...` endpoints require `Authorization: Token <token>`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST   | `/api/auth/register/` | Create account, returns `{token, username}` |
| POST   | `/api/auth/login/`    | Log in, returns `{token, username}` |
| POST   | `/api/auth/logout/`   | Invalidate current token |
| GET    | `/api/auth/me/`       | Returns `{username}` for the bearer |
| GET    | `/api/notes/`         | List notes; supports `?q=`, `?favorites=true`, `?created_after=`, `?created_before=`, `?modified_after=`, `?modified_before=` |
| POST   | `/api/notes/`         | Create note |
| GET    | `/api/notes/<id>/`    | Get note |
| PATCH  | `/api/notes/<id>/`    | Update title / body / `is_favorite` |
| DELETE | `/api/notes/<id>/`    | Delete note |
| GET    | `/api/notes/<id>/pages/`         | List pages |
| POST   | `/api/notes/<id>/pages/`         | Insert page (optional `after_page_id`) |
| PATCH  | `/api/notes/<id>/pages/<pid>/`   | Update page body |
| DELETE | `/api/notes/<id>/pages/<pid>/`   | Delete page (cannot delete the last page of a note) |

## Tests

Service-layer tests live in `backend/notes/tests.py`.

```bash
cd backend
python manage.py test                                  # run all
python manage.py test notes.tests.AuthServiceTests     # one class
python manage.py test notes.tests.NoteServiceTests.test_search_notes_matches_page_body
```

## Troubleshooting

- **Port already in use** — find the process with `lsof -i :8000` (or `:3000`) and kill it.
- **Stuck on the login screen after restarting the backend** — your token may have been wiped; just log in again.
- **CORS errors in the browser** — confirm the backend is reachable at `http://localhost:8000` and that `CORS_ALLOWED_ORIGINS` in `backend/backend/settings.py` includes `http://localhost:3000`.
