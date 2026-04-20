# Smart Campus Navigation System
## An-Najah National University — Faculty of Engineering

**Graduation Project | Computer Engineering Department | 2025–2026**

---

## Project Team

| Name | Student ID |
|------|-----------|
| Amr Sami Salah Jamhour | 12143698 |
| Ihab Ghassan Ayash Habash | 12144054 |

**Academic Supervisor:** Dr. Abdullah Rashid

---

## Project Overview

The Smart Campus Navigation System is a comprehensive digital platform developed specifically for An-Najah National University. The system addresses a common challenge faced by students, faculty, and visitors — navigating a large and complex university campus efficiently.

The platform integrates interactive campus maps, academic scheduling, AI-powered assistance, and real-time room status into a unified system accessible through both a web browser and a mobile application.

---

## Motivation

Large university campuses present significant navigation challenges, especially for new students and visitors. Finding a specific room, locating an instructor's office, or knowing whether a room is currently available requires either prior knowledge or asking someone for help. This project aims to solve these challenges through a modern, intelligent digital solution that is always available and easy to use.

---

## Objectives

- Provide students with an interactive, digital map of the university campus
- Enable real-time tracking of room availability and class schedules
- Offer AI-powered assistance for campus-related queries in Arabic and English
- Give administrators a powerful management panel to control all aspects of the system
- Deliver a consistent experience across both web and mobile platforms

---

## System Architecture

The system is built on a three-tier architecture:

**Presentation Layer**
The user-facing interface is delivered through two platforms — a web application accessible from any browser, and a mobile application for Android and iOS devices. Both platforms share the same design language and provide identical functionality.

**Application Layer**
A RESTful API server handles all business logic, authentication, data processing, and AI integration. It serves both the web and mobile clients from a single unified backend.

**Data Layer**
A relational database stores all system data including user accounts, campus maps, room information, schedules, notifications, and announcements.

---

## Core Features

### Interactive Campus Map
The map system provides a digitally accurate representation of the university campus buildings and floors. Each room is represented on the map with its exact location, type, and capacity. Users can click on any room to view its details and current availability status.

The map is built from precise floor plans and supports multiple floors per building. As additional floor maps are finalized through the AutoCAD design process, they are uploaded through the admin panel and become immediately available to all users.

### Pathfinding and Navigation
The system implements Dijkstra's shortest path algorithm to calculate the optimal route between any two rooms on the same floor. When a user requests directions, the system highlights the shortest path on the map, making navigation intuitive and effortless.

### Real-Time Room Availability
Each room on the map displays its current occupancy status. When a class is in session, the room shows the course name, instructor, and scheduled time. This feature allows students to quickly identify available rooms and plan their campus activities accordingly.

### AI Campus Assistant
The integrated AI chatbot serves as a 24/7 campus guide. It understands natural language questions in both Arabic and English and provides accurate, instant responses about room locations, schedules, instructor offices, and general campus information. The chatbot also supports voice input and voice output, making it accessible and convenient for all users.

### Academic Schedule Management
Students can view their personalized daily and weekly class schedules through the system. Each scheduled class is linked to its room on the campus map, allowing students to navigate directly to their next class with a single tap.

### Notifications and Announcements
The system includes a full notification system through which administrators can broadcast important announcements to all students or specific groups. Announcements support rich text and images, making them suitable for official university communications.

### Admin Management Panel
University administrators have access to a comprehensive management dashboard from which they can manage all aspects of the system. This includes managing user accounts, uploading and editing floor maps, placing rooms on maps, managing academic schedules, and sending notifications.

---

## Technology Choices

The project uses a modern, industry-standard technology stack chosen for its reliability, scalability, and widespread adoption in professional software development.

The web frontend is built with React.js, the most widely used JavaScript framework for building user interfaces. The mobile application uses React Native with Expo, allowing the same codebase logic to run on both Android and iOS. The backend API is built with Node.js and Express, providing a fast and scalable server environment. PostgreSQL was chosen as the database for its robustness and advanced support for relational data.

The AI capabilities are powered by Google Gemini, one of the most advanced large language models available, integrated through a secure API connection.

---

## Future Work

The following enhancements are planned for future development phases:

**Real-Time Room Booking System**
Integration with the university's existing room booking infrastructure to provide live updates on room availability and allow students to reserve rooms directly through the platform.

**Complete Campus Map Coverage**
As AutoCAD floor plans for all buildings are finalized, they will be digitized and added to the system. The current release includes the Ground Floor of the Engineering Faculty, with all remaining floors to follow.

**Indoor Positioning System**
Integration with Bluetooth beacons or Wi-Fi positioning to provide real-time "you are here" navigation, guiding users turn-by-turn to their destination.

**Smart Timetable Recommendations**
An AI-driven module that analyzes a student's schedule and campus position to recommend optimal routes between consecutive classes, accounting for travel time and building distances.

**Integration with University Information System**
Connecting the platform with the university's official academic information system to automatically synchronize course registrations, instructor assignments, and exam schedules.

**Augmented Reality Navigation**
A future mobile feature using the device camera to overlay directional arrows and room labels onto the real physical environment, providing an immersive navigation experience.

**Analytics Dashboard**
A data analytics module for administrators to gain insights into campus usage patterns, peak occupancy times, and popular routes, supporting data-driven facility management decisions.

**Multi-Campus Support**
Extending the platform to support multiple campuses of An-Najah National University, including the New Campus, under a single unified system.

---

## Project Status

| Component | Status |
|-----------|--------|
| Backend API | Complete |
| Web Application | Complete |
| Mobile Application | Complete |
| AI Chatbot (Arabic + English) | Complete |
| Ground Floor Map | Complete |
| Admin Dashboard | Complete |
| Notification System | Complete |
| Additional Floor Maps | In Progress (AutoCAD) |
| Real-Time Room Booking | Planned |
| Indoor Positioning | Planned |

---

## Acknowledgements

We would like to express our sincere gratitude to **Dr. Abdullah Rashid** for his continuous guidance, support, and valuable feedback throughout the development of this project.

We also thank the **Faculty of Engineering** at An-Najah National University for providing the resources and environment that made this project possible.

---

*An-Najah National University — Nablus, Palestine*  
*جامعة النجاح الوطنية — نابلس، فلسطين*