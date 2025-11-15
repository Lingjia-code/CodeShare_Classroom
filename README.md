# CodeShare_Classroom
```
codeshare-classroom/
│
├── server/          
│   │
│   ├── app.js                        # Express app entry point (sets routes, DB, static files)
│   ├── socket.js                     # Socket.IO real-time handlers (P1)
│   │
│   ├── routes/                       # REST API routes
│   │   ├── auth.js                   # Azure authentication routes
│   │   ├── classrooms.js             # Create classroom, join classroom, fetch students
│   │   └── code.js                   # Save code, refresh code, fetch code
│   │
│   ├── models/                       # Mongoose schemas
│   │   ├── User.js                   # User model: username, role (student/instructor)
│   │   └── Classroom.js              # Classroom model: roomCode, students, files
│   │
│   ├── middleware/
│   │   └── auth.js 
│   │
│   └── utils/
│
├── client/        
│   │
│   ├── login.html                    # Landing page: choose Student or Instructor
│   ├── instructor.html               # Instructor dashboard: create class, list classes
│   ├── instructorClass.html          # Classroom view: list students in a class
│   ├── studentJoin.html              # Student enters join code to access workspace
│   ├── studentWorkspace.html         # Student coding page (Monaco Editor)
│   │
│   ├── js/                           # All frontend JavaScript logic
│   │   ├── login.js                  # Handles role selection and redirects
│   │   ├── instructor.js             # Classroom creation & loading instructor classrooms
│   │   ├── instructorClass.js        # Load students and open student workspace
│   │   ├── studentJoin.js            # Student joins a classroom via join code
│   │   ├── studentWorkspace.js       # Save/refresh code for a given classroom
│   │   └── editor.js                 # Monaco Editor initialization and helpers
```
