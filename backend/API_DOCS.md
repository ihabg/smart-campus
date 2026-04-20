# Smart Campus API — Complete Documentation

## Base URL
```
http://localhost:5000/api
```

## Authentication
All protected routes require a Bearer JWT token in the Authorization header:
```
Authorization: Bearer <accessToken>
```

Roles: `student` · `admin` · `super_admin`

---

## Auth Endpoints

### POST /auth/register
Register a new student account.

**Body:**
```json
{
  "first_name": "Ahmad",
  "last_name": "Hasan",
  "email": "ahasan@najah.edu",
  "password": "SecurePass1",
  "student_id": "20201234",
  "department": "Computer Engineering",
  "year_of_study": 3
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "user": { "id": "uuid", "first_name": "Ahmad", ... },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

---

### POST /auth/login
**Body:** `{ "email": "...", "password": "..." }`
**Response 200:** Same structure as register.

---

### POST /auth/refresh
Refresh expired access token.
**Body:** `{ "refreshToken": "eyJ..." }`
**Response:** `{ "accessToken": "...", "refreshToken": "..." }`

---

### POST /auth/logout
🔒 Protected. Clears refresh token.

---

### GET /auth/me
🔒 Protected. Returns current user profile.

---

### PATCH /auth/me/password
🔒 Protected.
**Body:** `{ "current_password": "...", "new_password": "..." }`

---

### PATCH /auth/me/fcm-token
🔒 Protected. Update Firebase push notification token.
**Body:** `{ "fcm_token": "firebase_token_here" }`

---

## User Endpoints

### GET /users
🔒 Admin only. List all users.
**Query:** `role` · `status` · `department` · `search` · `page` · `limit`

### GET /users/stats
🔒 Admin only. Dashboard statistics.

### GET /users/:id
🔒 Admin only.

### PATCH /users/me/profile
🔒 Protected. Update own profile.
**Body:** `{ "first_name", "last_name", "department", "year_of_study" }`

### POST /users/me/avatar
🔒 Protected. Upload avatar image.
**Form-data:** `avatar` (image file)

### PATCH /users/:id
🔒 Admin only. Update user role/status.
**Body:** `{ "role": "admin", "status": "active" }`

### DELETE /users/:id
🔒 Super admin only.

---

## Building & Floor Endpoints

### GET /floors/buildings
Public. Returns all active buildings.

**Response:**
```json
{
  "data": {
    "buildings": [
      { "id": "uuid", "code": "597", "name": "Engineering Block 597", "floor_count": 5 }
    ]
  }
}
```

---

### GET /floors
Public. Returns all floors.
**Query:** `building_id` · `active_only` (default true)

---

### GET /floors/:id
Public. Returns floor + all its rooms with adjacency data.

---

### POST /floors
🔒 Admin only.
**Body:** `{ "building_id", "floor_number", "floor_label", "name", "display_order" }`

---

### PATCH /floors/:id
🔒 Admin only.

---

### POST /floors/:id/map
🔒 Admin only. Upload floor map image.
**Form-data:** `map` (image file — JPEG/PNG/SVG, max 10MB)

---

### DELETE /floors/:id
🔒 Admin only. Also deletes associated map file.

---

## Room Endpoints

### GET /rooms
Public. Returns rooms for a floor.
**Query:** `floor_id` (required) · `type` · `active_only`

---

### GET /rooms/:id
Public. Returns room + today's schedule + current status.

**Response:**
```json
{
  "data": {
    "room": { "id": "uuid", "room_number": "161", "name": "Computer Lab 161", "type": "lab", ... },
    "schedule": [ { "course_name": "OS Lab", "start_time": "08:00", "end_time": "10:00", ... } ],
    "status": "in_session"
  }
}
```

---

### POST /rooms
🔒 Admin only.
**Body:** `{ "floor_id", "room_number", "name", "type", "department", "capacity", "coord_x", "coord_y", "coord_width", "coord_height", "is_accessible" }`

---

### PATCH /rooms/bulk-coordinates
🔒 Admin only. Bulk update room positions.
**Body:** `{ "rooms": [{ "id", "coord_x", "coord_y", "coord_width", "coord_height" }] }`

---

### PATCH /rooms/adjacency
🔒 Admin only. Set bidirectional adjacency edge.
**Body:** `{ "room_a_id", "room_b_id", "weight", "is_active" }`

---

### PATCH /rooms/:id
🔒 Admin only. Update room details.

---

### DELETE /rooms/:id
🔒 Admin only.

---

## Schedule Endpoints

### GET /schedule/my
🔒 Protected (student). Returns enrolled sections.
**Query:** `semester` · `academic_year`

**Response:**
```json
{
  "data": {
    "sections": [ { "course_code": "CE201", "course_name": "Data Structures", "start_time": "08:00", "room_number": "103", ... } ],
    "by_day": { "0": [...], "1": [...] },
    "total": 5
  }
}
```

---

### GET /schedule/today
🔒 Protected. Returns today's sections with is_current/is_past/is_upcoming flags.

---

### GET /schedule
Public. Returns all sections.
**Query:** `room_id` · `floor_id` · `course_id` · `instructor_id` · `semester` · `academic_year` · `day` · `page` · `limit`

---

### POST /schedule
🔒 Admin only.
**Body:** `{ "course_id", "instructor_id", "room_id", "semester", "academic_year", "section_number", "day_of_week": [0,2,4], "start_time": "08:00", "end_time": "09:30", "max_capacity" }`

**Conflict checking:** Returns 409 if room is already booked in the same time slot.

---

### PATCH /schedule/:id
🔒 Admin only.

### DELETE /schedule/:id
🔒 Admin only.

### POST /schedule/enroll
🔒 Protected (student).
**Body:** `{ "section_id": "uuid" }`

### DELETE /schedule/enroll/:section_id
🔒 Protected (student). Drop a section.

---

## Search Endpoints

### GET /search
Public. Full-text search across rooms, courses, instructors, announcements.
**Query:** `q` (required, min 2 chars) · `type` (room|course|instructor|announcement) · `building_id` · `floor_id` · `limit`

**Response:**
```json
{
  "data": {
    "query": "data structures",
    "total": 8,
    "results": {
      "rooms": [...],
      "courses": [...],
      "instructors": [...],
      "announcements": [...]
    }
  }
}
```

---

### GET /search/rooms
Public. Quick room search for map highlight.
**Query:** `q` · `floor_id` · `limit`

---

### GET /search/graph
Public. Returns pathfinding graph for a floor.
**Query:** `floor_id`

**Response:**
```json
{
  "data": {
    "graph": { "room_uuid": [{ "id": "other_uuid", "weight": 1.0 }] },
    "nodes": { "room_uuid": { "id": "uuid", "number": "101", "name": "Office", "x": 35.5, "y": 42.0 } }
  }
}
```

---

## Notification Endpoints

### GET /notifications
🔒 Protected. Returns user's notifications.
**Query:** `page` · `limit` · `unread_only`

### PATCH /notifications/read-all
🔒 Protected. Mark all as read.

### PATCH /notifications/:id/read
🔒 Protected.

### GET /notifications/all
🔒 Admin only. All notifications with delivery stats.

### POST /notifications
🔒 Admin only.
**Body:** `{ "title", "body", "type", "target_role", "target_dept", "send_push": true }`

### DELETE /notifications/:id
🔒 Admin only.

---

## Announcement Endpoints

### GET /announcements
Public. Returns published, non-expired announcements.
**Query:** `page` · `limit` · `pinned_only`

### GET /announcements/:id
Public.

### POST /announcements
🔒 Admin only.
**Form-data:** `title` · `content` · `is_pinned` · `is_published` · `expires_at` · `image` (optional)

### PATCH /announcements/:id
🔒 Admin only.

### DELETE /announcements/:id
🔒 Admin only.

---

## Map Editor Endpoints

### GET /map-editor/:floor_id
🔒 Admin only. Returns floor + rooms + adjacency for editing.

### POST /map-editor/:floor_id/layout
🔒 Admin only. Save full floor layout (rooms + adjacency).
**Body:** `{ "rooms": [...], "adjacency": [{ "room_a_id", "room_b_id", "weight" }] }`

### PATCH /map-editor/rooms/:room_id/position
🔒 Admin only. Quick-save single room position (after drag).
**Body:** `{ "coord_x", "coord_y", "coord_width", "coord_height" }`

---

## Course Endpoints

### GET /courses
Public. **Query:** `department` · `search` · `page` · `limit`

### GET /courses/departments
Public. Returns distinct department list.

### GET /courses/:id
Public.

### POST /courses
🔒 Admin only.
**Body:** `{ "code", "name", "name_ar", "department", "credit_hours", "description" }`

### PATCH /courses/:id · DELETE /courses/:id
🔒 Admin only.

---

## Instructor Endpoints

### GET /instructors
Public. **Query:** `department` · `search` · `page` · `limit`

### GET /instructors/:id
Public. Returns instructor + their sections.

### POST /instructors
🔒 Admin only.
**Body:** `{ "title", "first_name", "last_name", "email", "department", "office_room_id" }`

### PATCH /instructors/:id · DELETE /instructors/:id
🔒 Admin only.

---

## Error Responses

All errors follow this format:
```json
{
  "success": false,
  "message": "Human-readable error message",
  "errors": [{ "field": "email", "message": "Valid email required" }]
}
```

### HTTP Status Codes
| Code | Meaning |
|------|---------|
| 200  | Success |
| 201  | Created |
| 400  | Bad request / validation error |
| 401  | Unauthenticated |
| 403  | Forbidden (wrong role) |
| 404  | Not found |
| 409  | Conflict (duplicate, booking clash) |
| 413  | File too large |
| 422  | Validation failed |
| 429  | Rate limit exceeded |
| 500  | Server error |

---

## Pagination
All list endpoints support:
```
GET /rooms?page=2&limit=20
```
Response includes:
```json
"pagination": {
  "total": 150,
  "page": 2,
  "limit": 20,
  "totalPages": 8
}
```

---

## Rate Limiting
- Global: 100 requests per 15 minutes per IP
- Auth endpoints: 20 requests per 15 minutes per IP

---

## File Uploads
- **Map images:** POST `/floors/:id/map` — JPEG/PNG/SVG, max 10MB
- **Avatars:** POST `/users/me/avatar` — JPEG/PNG, max 2MB
- **Announcement images:** POST `/announcements` — JPEG/PNG, max 10MB
- Uploaded files served at: `GET /uploads/<category>/<filename>`
