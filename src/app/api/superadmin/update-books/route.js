// app/api/superadmin/update-books/route.js
import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import pool from '@/lib/db';

export async function POST(req) {
  const connection = await pool.getConnection();
  
  try {
    const token = req.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    
    // Check if user is superadmin
    if (decoded.role_id !== 1) {
      return NextResponse.json({ success: false, error: 'Unauthorized - Admin access required' }, { status: 403 });
    }

    const { bookIds, updates } = await req.json();
    // bookIds: array of book IDs to update (if length > 1, it means update all books in clone tree)
    // updates: { topics: [...], subtopics: [...], pages: [...], bookTitle: '...' }
    
    // NEW LOGIC: If bookIds has more than 1 ID, we need to find ALL books in the clone tree
    let allBookIdsToUpdate = [...bookIds];
    
    if (bookIds.length > 1) {
      // This means "update all books" was selected
      // Walk the clone tree and find all related books
      const sourceBookId = bookIds[0]; // The book being edited
      const bookIdsSet = new Set();
      
      // Helper function to walk up the tree to find root
      async function findRoot(bookId) {
        const [book] = await connection.query(
          'SELECT id, clone_id FROM books WHERE id = ?',
          [bookId]
        );
        
        if (!book || book.length === 0) return bookId;
        
        if (book[0].clone_id === null) {
          return book[0].id; // This is the root
        } else {
          return await findRoot(book[0].clone_id); // Walk up
        }
      }
      
      // Helper function to find all descendants
      async function findAllDescendants(rootId, visited = new Set()) {
        if (visited.has(rootId)) return [];
        visited.add(rootId);
        
        const descendants = [rootId];
        
        // Find all books that have clone_id = rootId
        const [children] = await connection.query(
          'SELECT id FROM books WHERE clone_id = ?',
          [rootId]
        );
        
        for (const child of children) {
          const childDescendants = await findAllDescendants(child.id, visited);
          descendants.push(...childDescendants);
        }
        
        return descendants;
      }
      
      // Find the root of the tree
      const rootId = await findRoot(sourceBookId);
      
      // Find all books in the tree (root + all descendants)
      const allRelatedBooks = await findAllDescendants(rootId);
      
      allBookIdsToUpdate = [...new Set(allRelatedBooks)];
      
      console.log('\n========== CLONE TREE UPDATE ==========');
      console.log('Source book ID:', sourceBookId);
      console.log('Root book ID:', rootId);
      console.log('All books to update:', allBookIdsToUpdate);
    }

    console.log('\n========== UPDATE-BOOKS REQUEST ==========');
    console.log('Original bookIds:', bookIds);
    console.log('All books to update:', allBookIdsToUpdate);
    console.log('updates.bookTitle:', updates.bookTitle);
    console.log('updates.topics:', JSON.stringify(updates.topics, null, 2));

    if (!allBookIdsToUpdate || allBookIdsToUpdate.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Book IDs array is required' 
      }, { status: 400 });
    }

    await connection.beginTransaction();

    // Update book titles if provided
    if (updates.bookTitle) {
      for (const bookId of allBookIdsToUpdate) {
        await connection.query(
          'UPDATE books SET title = ? WHERE id = ?',
          [updates.bookTitle, bookId]
        );
      }
    }

    // Process updates for each book
    for (const bookId of allBookIdsToUpdate) {
      console.log('\n=== Processing bookId:', bookId, '===');
      
      // Store ALL pages with their topic/subtopic structure before deletion
      // We'll map by index position instead of names to handle renames
      const topicPagesArray = []; // Array of {topicName, pages: [...], subtopics: [{name, pages: [...]}]}
      
      // Get all topics for this book (ordered by creation)
      const [existingTopics] = await connection.query(
        'SELECT id, name FROM topics WHERE book_id = ? ORDER BY id',
        [bookId]
      );
      console.log('Found', existingTopics.length, 'existing topics for book', bookId);

      for (const topic of existingTopics) {
        const topicData = {
          name: topic.name,
          pages: [],
          subtopics: []
        };
        
        // Store pages for this topic (pages directly under topic, not subtopic)
        const [topicPages] = await connection.query(
          'SELECT * FROM pages WHERE topic_id = ? AND subtopic_id IS NULL ORDER BY id',
          [topic.id]
        );
        console.log(`[Book ${bookId}] Topic "${topic.name}" has ${topicPages.length} direct pages`);
        topicData.pages = topicPages;
        
        // Get subtopics for this topic
        const [subtopics] = await connection.query(
          'SELECT id, name FROM subtopics WHERE topic_id = ? ORDER BY id',
          [topic.id]
        );

        for (const subtopic of subtopics) {
          // Store pages for this subtopic
          const [subtopicPages] = await connection.query(
            'SELECT * FROM pages WHERE subtopic_id = ? ORDER BY id',
            [subtopic.id]
          );
          console.log(`[Book ${bookId}] Subtopic "${topic.name} > ${subtopic.name}" has ${subtopicPages.length} pages`);
          topicData.subtopics.push({
            name: subtopic.name,
            pages: subtopicPages
          });
        }

        topicPagesArray.push(topicData);
        await connection.query('DELETE FROM subtopics WHERE topic_id = ?', [topic.id]);
      }

      // Delete old pages and topics
      await connection.query('DELETE FROM pages WHERE topic_id IN (SELECT id FROM topics WHERE book_id = ?)', [bookId]);
      await connection.query('DELETE FROM topics WHERE book_id = ?', [bookId]);

      // Get author_id for the book
      const [books] = await connection.query(
        'SELECT author_id FROM books WHERE id = ?',
        [bookId]
      );

      if (books.length === 0) {
        await connection.rollback();
        return NextResponse.json({ 
          success: false, 
          error: `Book with ID ${bookId} not found` 
        }, { status: 404 });
      }

      const authorId = books[0].author_id;

      // Create new topics, subtopics, and pages based on updates
      if (updates.topics && Array.isArray(updates.topics)) {
        console.log(`[Book ${bookId}] Creating ${updates.topics.length} topics from updates`);
        console.log(`[Book ${bookId}] Have ${topicPagesArray.length} topics with preserved pages`);
        
        for (let topicIndex = 0; topicIndex < updates.topics.length; topicIndex++) {
          const topic = updates.topics[topicIndex];
          
          // Insert topic
          const [topicResult] = await connection.query(
            'INSERT INTO topics (name, description, book_id) VALUES (?, ?, ?)',
            [topic.name, topic.description || null, bookId]
          );

          const newTopicId = topicResult.insertId;

          // Restore pages directly under this topic (if any were preserved at this index)
          const preservedTopicData = topicPagesArray[topicIndex];
          if (preservedTopicData && preservedTopicData.pages.length > 0) {
            console.log(`[Book ${bookId}] Restoring ${preservedTopicData.pages.length} pages for topic "${topic.name}" (index ${topicIndex}, was "${preservedTopicData.name}")`);
            for (const page of preservedTopicData.pages) {
              await connection.query(
                'INSERT INTO pages (topic_id, subtopic_id, content, created_at) VALUES (?, ?, ?, ?)',
                [newTopicId, null, page.content, page.created_at]
              );
            }
          } else {
            console.log(`[Book ${bookId}] No preserved pages for topic "${topic.name}" at index ${topicIndex}`);
          }

          // Insert pages from updates if provided (these would be NEW pages added via frontend)
          if (topic.pages && Array.isArray(topic.pages)) {
            console.log(`[Book ${bookId}] Adding ${topic.pages.length} NEW pages from updates for topic "${topic.name}"`);
            for (const page of topic.pages) {
              await connection.query(
                'INSERT INTO pages (topic_id, subtopic_id, content) VALUES (?, ?, ?)',
                [newTopicId, null, page.content]
              );
            }
          }

          // Insert subtopics if any
          if (topic.subtopics && Array.isArray(topic.subtopics)) {
            for (let subtopicIndex = 0; subtopicIndex < topic.subtopics.length; subtopicIndex++) {
              const subtopic = topic.subtopics[subtopicIndex];
              
              const [subtopicResult] = await connection.query(
                'INSERT INTO subtopics (name, description, topic_id, book_id, author_id) VALUES (?, ?, ?, ?, ?)',
                [subtopic.name, subtopic.description || null, newTopicId, bookId, authorId]
              );

              const newSubtopicId = subtopicResult.insertId;

              // Restore pages for this subtopic (if any were preserved at this index)
              const preservedSubtopic = preservedTopicData?.subtopics[subtopicIndex];
              if (preservedSubtopic && preservedSubtopic.pages.length > 0) {
                console.log(`[Book ${bookId}] Restoring ${preservedSubtopic.pages.length} pages for subtopic "${topic.name} > ${subtopic.name}" (index ${topicIndex},${subtopicIndex}, was "${preservedSubtopic.name}")`);
                for (const page of preservedSubtopic.pages) {
                  await connection.query(
                    'INSERT INTO pages (topic_id, subtopic_id, content, created_at) VALUES (?, ?, ?, ?)',
                    [newTopicId, newSubtopicId, page.content, page.created_at]
                  );
                }
              } else {
                console.log(`[Book ${bookId}] No preserved pages for subtopic "${topic.name} > ${subtopic.name}" at index ${topicIndex},${subtopicIndex}`);
              }

              // Insert pages from updates if provided
              if (subtopic.pages && Array.isArray(subtopic.pages)) {
                console.log(`[Book ${bookId}] Adding ${subtopic.pages.length} NEW pages from updates for subtopic "${topic.name} > ${subtopic.name}"`);
                for (const page of subtopic.pages) {
                  await connection.query(
                    'INSERT INTO pages (topic_id, subtopic_id, content) VALUES (?, ?, ?)',
                    [newTopicId, newSubtopicId, page.content]
                  );
                }
              }
            }
          }
        }
      }
    }

    await connection.commit();

    return NextResponse.json({ 
      success: true, 
      message: `Successfully updated ${allBookIdsToUpdate.length} book(s) in the clone tree`
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error updating books:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to update books: ' + error.message 
    }, { status: 500 });
  } finally {
    connection.release();
  }
}
