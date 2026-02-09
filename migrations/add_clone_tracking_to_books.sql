-- Add clone tracking fields to books table
-- clone_id: stores the ID of the book this was cloned from (NULL for original books)
-- has_clones: indicates if this book has been cloned (for optimization)

ALTER TABLE books
  ADD COLUMN clone_id INT DEFAULT NULL AFTER author_id,
  ADD COLUMN has_clones BOOLEAN DEFAULT FALSE AFTER clone_id,
  ADD CONSTRAINT fk_books_clone_id FOREIGN KEY (clone_id) REFERENCES books(id) ON DELETE SET NULL;

-- Add index for faster clone tree queries
CREATE INDEX idx_books_clone_id ON books(clone_id);
CREATE INDEX idx_books_has_clones ON books(has_clones);
