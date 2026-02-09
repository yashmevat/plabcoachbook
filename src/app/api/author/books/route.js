// app/api/author/books/route.js
import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import pool from '@/lib/db';

export async function POST(req) {
  try {
    const token = req.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    const authorId = decoded.userId;

    const { title } = await req.json();

    if (!title) {
      return NextResponse.json({ 
        success: false, 
        error: 'Title is required' 
      }, { status: 400 });
    }

    // Insert book
    const [bookResult] = await pool.query(
      'INSERT INTO books (title, author_id) VALUES (?, ?)',
      [title, authorId]
    );

    const bookId = bookResult.insertId;

    return NextResponse.json({ 
      success: true, 
      message: 'Book created successfully',
      bookId 
    });

  } catch (error) {
    console.error('Error creating book:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to create book' 
    }, { status: 500 });
  }
}

// app/api/author/books/route.js - GET method
export async function GET(req) {
  try {
    const token = req.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    const authorId = decoded.userId;

    // Get books with their topics
    const [books] = await pool.query(`
      SELECT 
        b.id,
        b.title,
        b.created_at
      FROM books b
      WHERE b.author_id = ?
      ORDER BY b.created_at DESC
    `, [authorId]);

    // Get topics for each book with subtopic count
    for (let book of books) {
      const [topics] = await pool.query(`
        SELECT 
          t.id,
          t.name,
          (SELECT COUNT(*) FROM subtopics WHERE topic_id = t.id) as subtopic_count
        FROM topics t
        WHERE t.book_id = ?
        ORDER BY t.created_at
      `, [book.id]);
      
      // Get subtopics for each topic
      for (let topic of topics) {
        const [subtopics] = await pool.query(`
          SELECT 
            id,
            name,
            description
          FROM subtopics
          WHERE topic_id = ?
          ORDER BY created_at
        `, [topic.id]);
        
        topic.subtopics = subtopics;
      }
      
      book.topics = topics;
    }

    return NextResponse.json({ success: true, data: books });

  } catch (error) {
    console.error('Error fetching books:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch books' 
    }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    const token = req.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    const authorId = decoded.userId;

    const { id, title } = await req.json();

    if (!id || !title) {
      return NextResponse.json({ 
        success: false, 
        error: 'Book ID and title are required' 
      }, { status: 400 });
    }

    // Update book
    const [result] = await pool.query(
      'UPDATE books SET title = ? WHERE id = ? AND author_id = ?',
      [title, id, authorId]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Book not found or unauthorized' 
      }, { status: 404 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Book updated successfully' 
    });

  } catch (error) {
    console.error('Error updating book:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to update book' 
    }, { status: 500 });
  }
}

export async function DELETE(req) {
  let connection;
  try {
    const token = req.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    const authorId = decoded.userId;

    const { searchParams } = new URL(req.url);
    const bookId = searchParams.get('id');

    if (!bookId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Book ID required' 
      }, { status: 400 });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Lock and fetch the book to be deleted
    const [books] = await connection.query(
      'SELECT id, clone_id FROM books WHERE id = ? AND author_id = ? FOR UPDATE',
      [bookId, authorId]
    );

    if (!books || books.length === 0) {
      await connection.rollback();
      connection.release();
      return NextResponse.json({ 
        success: false, 
        error: 'Book not found or unauthorized' 
      }, { status: 404 });
    }

    const bookRow = books[0];
    const parentId = bookRow.clone_id; // may be null

    // Delete the book (topics/pages cascade if configured)
    const [result] = await connection.query(
      'DELETE FROM books WHERE id = ? AND author_id = ?',
      [bookId, authorId]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      connection.release();
      return NextResponse.json({ 
        success: false, 
        error: 'Book not found or unauthorized' 
      }, { status: 404 });
    }

    // If deleted book was a clone, recompute has_clones for its parent
    if (parentId) {
      const [[{ cnt }]] = await connection.query(
        'SELECT COUNT(*) AS cnt FROM books WHERE clone_id = ?',
        [parentId]
      );
      await connection.query(
        'UPDATE books SET has_clones = ? WHERE id = ?',
        [cnt > 0 ? 1 : 0, parentId]
      );
    } else {
      // Deleted was an original/root. Reparent its direct children: make them roots.
      await connection.query(
        'UPDATE books SET clone_id = NULL WHERE clone_id = ?',
        [bookId]
      );

      // Recompute has_clones for all books (cheap with index) to keep consistency
      await connection.query(`
        UPDATE books o
        LEFT JOIN (
          SELECT clone_id, COUNT(*) AS cnt
          FROM books
          WHERE clone_id IS NOT NULL
          GROUP BY clone_id
        ) t ON t.clone_id = o.id
        SET o.has_clones = CASE WHEN IFNULL(t.cnt,0) > 0 THEN 1 ELSE 0 END
      `);
    }

    await connection.commit();
    connection.release();

    return NextResponse.json({ 
      success: true, 
      message: 'Book deleted successfully' 
    });

  } catch (error) {
    console.error('Error deleting book:', error);
    if (connection) {
      try { await connection.rollback(); } catch (e) {}
      try { connection.release(); } catch (e) {}
    }
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to delete book' 
    }, { status: 500 });
  }
}
