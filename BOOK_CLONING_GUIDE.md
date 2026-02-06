# Book Cloning Feature - User Guide

## Overview
The book cloning feature allows superadmins to create new books by cloning existing books with all their content (topics, subtopics, and pages).

## How to Use

### 1. Access the Clone Page
- Navigate to `/dashboard/create-book` as a superadmin
- You'll see a list of all available books in the system

### 2. Clone a Book
- Browse through the available books
- Click the **"Clone Book"** button on any book you want to duplicate
- The system will:
  - Create a new book entry with title "[Original Book Name] (Clone)"
  - Clone all topics with their new book ID
  - Clone all subtopics with their new topic IDs
  - Clone all pages with their appropriate references

### 3. Edit the Cloned Book
- After cloning, you'll be automatically redirected to the edit page
- The UI is similar to the author's book edit page
- You can:
  - Change the book title
  - Add/remove/edit topics
  - Add/remove/edit subtopics
  - Add pages to topics or subtopics
  - Modify any content

### 4. Save Changes - Dual Update Option
When you click "Save Changes", a popup will appear with two options:

#### Option 1: Both Books
- Updates the cloned book AND the original book
- All changes you made will be applied to both books
- Use this when you want to:
  - Update the original book with improvements
  - Keep both books synchronized

#### Option 2: Only This Book
- Updates only the cloned book
- The original book remains unchanged
- Use this when you want to:
  - Create a completely independent variation
  - Make book-specific changes

## API Routes Created

### 1. GET `/api/superadmin/books`
- Lists all books in the system (superadmin only)
- Returns books with topics, subtopics, and page counts

### 2. POST `/api/superadmin/clone-book`
- Clones a book with all its content
- Parameters:
  - `bookId`: ID of the book to clone
  - `newTitle` (optional): Custom title for the cloned book

### 3. POST `/api/superadmin/update-books`
- Updates one or multiple books simultaneously
- Parameters:
  - `bookIds`: Array of book IDs to update
  - `updates`: Object containing book title, topics, subtopics, and pages

## File Structure

```
src/
├── app/
│   ├── api/
│   │   └── superadmin/
│   │       ├── books/
│   │       │   └── route.js          # List all books
│   │       ├── clone-book/
│   │       │   └── route.js          # Clone book endpoint
│   │       └── update-books/
│   │           └── route.js          # Dual update endpoint
│   └── dashboard/
│       ├── create-book/
│       │   └── page.jsx              # Book list with clone buttons
│       └── edit-cloned-book/
│           └── [bookId]/
│               └── page.jsx          # Edit cloned book page
```

## Features

✅ Clone books with all content intact
✅ Edit cloned books using familiar UI
✅ Dual-update functionality (both books or single book)
✅ Automatic ID mapping for all resources
✅ Transaction-based cloning (all or nothing)
✅ Responsive design for mobile and desktop
✅ Real-time topic/subtopic auto-save
✅ Expandable/collapsible view of book structure

## Database Schema

The cloning process maintains referential integrity across:
- `books` table
- `topics` table (references book_id)
- `subtopics` table (references topic_id and book_id)
- `pages` table (references topic_id or subtopic_id)

## Notes

- Only superadmins can access these pages
- Cloning is a transactional operation (if any step fails, the entire clone is rolled back)
- The cloned book data is temporarily stored in localStorage during editing
- All original content and structure are preserved in the clone
