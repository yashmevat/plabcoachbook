// app/api/superadmin/sync-changes/route.js
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
    
    // Check if user is superadmin
    if (decoded.role_id !== 1) {
      return NextResponse.json({ success: false, error: 'Unauthorized - Admin access required' }, { status: 403 });
    }

    const { changes, clonedTopics, currentTopics } = await req.json();
    
    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      let updatedCount = 0;
      const superadminId = decoded.userId;

      // First, sync topic/subtopic name and description changes
      if (changes && Array.isArray(changes)) {
        for (const change of changes) {
          const { type, id, originalId, data, syncToOriginal } = change;

          if (!syncToOriginal) {
            continue;
          }

          if (type === 'topic') {
            await connection.query(
              'UPDATE topics SET name = ?, description = ? WHERE id = ?',
              [data.name, data.description || null, originalId]
            );
            updatedCount++;
          } else if (type === 'subtopic') {
            await connection.query(
              'UPDATE subtopics SET name = ?, description = ? WHERE id = ?',
              [data.name, data.description || null, originalId]
            );
            updatedCount++;
          }
        }
      }

      // Handle manually added subtopics for cloned topics
      if (clonedTopics && Array.isArray(clonedTopics) && currentTopics && Array.isArray(currentTopics)) {
        for (const clonedTopic of clonedTopics) {
          const { newTopicId, originalTopicId, subtopics: clonedSubtopics } = clonedTopic;
          
          // Find corresponding current topic to check for manually added subtopics
          const currentTopic = currentTopics.find(t => t.topicId === newTopicId && t.isCloned);
          
          if (currentTopic && currentTopic.subtopics) {
            // Get list of cloned subtopic IDs
            const clonedSubtopicIds = new Set(
              (clonedSubtopics || []).map(s => s.newSubtopicId).filter(id => id)
            );
            
            // Find manually added subtopics (not in cloned list and not cloned)
            const manuallyAddedSubtopics = currentTopic.subtopics.filter(
              s => s.subtopicId && !s.isCloned && !clonedSubtopicIds.has(s.subtopicId)
            );
            
            // Create manually added subtopics in original book
            for (const manualSubtopic of manuallyAddedSubtopics) {
              // Get the subtopic details from new book
              const [subtopicDetails] = await connection.query(
                'SELECT name, description FROM subtopics WHERE id = ?',
                [manualSubtopic.subtopicId]
              );
              
              if (subtopicDetails.length > 0) {
                const subtopicData = subtopicDetails[0];
                
                // Create in original book
                const [insertResult] = await connection.query(
                  'INSERT INTO subtopics (name, book_id, topic_id, author_id, description) VALUES (?, (SELECT book_id FROM topics WHERE id = ?), ?, ?, ?)',
                  [subtopicData.name, originalTopicId, originalTopicId, superadminId, subtopicData.description]
                );
                
                const newOriginalSubtopicId = insertResult.insertId;
                updatedCount++;
                
                // Copy pages from manually added subtopic to original book
                const [manualSubtopicPages] = await connection.query(
                  'SELECT content FROM pages WHERE subtopic_id = ? ORDER BY id',
                  [manualSubtopic.subtopicId]
                );
                
                for (const page of manualSubtopicPages) {
                  await connection.query(
                    'INSERT INTO pages (topic_id, subtopic_id, content) VALUES (?, ?, ?)',
                    [originalTopicId, newOriginalSubtopicId, page.content]
                  );
                  updatedCount++;
                }
                
                // Update the clonedTopic's subtopics array to include this new mapping
                if (!clonedTopic.subtopics) {
                  clonedTopic.subtopics = [];
                }
                clonedTopic.subtopics.push({
                  newSubtopicId: manualSubtopic.subtopicId,
                  originalSubtopicId: newOriginalSubtopicId
                });
              }
            }
          }
        }
      }

      // Handle deleted subtopics for cloned topics
      if (clonedTopics && Array.isArray(clonedTopics) && currentTopics && Array.isArray(currentTopics)) {
        for (const clonedTopic of clonedTopics) {
          const { newTopicId, originalTopicId, subtopics: clonedSubtopics } = clonedTopic;
          
          // Find corresponding current topic
          const currentTopic = currentTopics.find(t => t.topicId === newTopicId && t.isCloned);
          
          if (currentTopic && clonedSubtopics && Array.isArray(clonedSubtopics)) {
            // Get current subtopic IDs in the new book
            const currentSubtopicIds = new Set(
              (currentTopic.subtopics || []).map(s => s.subtopicId).filter(id => id)
            );
            
            // Find deleted subtopics (were in original clone but not in current)
            const deletedSubtopics = clonedSubtopics.filter(
              s => s.newSubtopicId && !currentSubtopicIds.has(s.newSubtopicId) && s.originalSubtopicId
            );
            
            // Delete these subtopics from original book
            for (const deletedSubtopic of deletedSubtopics) {
              // First delete all pages for this subtopic
              await connection.query(
                'DELETE FROM pages WHERE subtopic_id = ?',
                [deletedSubtopic.originalSubtopicId]
              );
              
              // Then delete the subtopic itself
              await connection.query(
                'DELETE FROM subtopics WHERE id = ?',
                [deletedSubtopic.originalSubtopicId]
              );
              
              updatedCount++;
            }
          }
        }
      }

      // Now sync all pages for cloned topics
      if (clonedTopics && Array.isArray(clonedTopics)) {
        for (const clonedTopic of clonedTopics) {
          const { newTopicId, originalTopicId, subtopics } = clonedTopic;

          // Sync pages for the topic itself (pages without subtopic)
          const [newTopicPages] = await connection.query(
            'SELECT id, content FROM pages WHERE topic_id = ? AND subtopic_id IS NULL ORDER BY id',
            [newTopicId]
          );

          const [originalTopicPages] = await connection.query(
            'SELECT id, content FROM pages WHERE topic_id = ? AND subtopic_id IS NULL ORDER BY id',
            [originalTopicId]
          );

          // Delete pages from original that don't exist in new (if new has fewer pages)
          if (originalTopicPages.length > newTopicPages.length) {
            for (let i = newTopicPages.length; i < originalTopicPages.length; i++) {
              await connection.query('DELETE FROM pages WHERE id = ?', [originalTopicPages[i].id]);
              updatedCount++;
            }
          }

          // Update existing pages and add new ones
          for (let i = 0; i < newTopicPages.length; i++) {
            if (i < originalTopicPages.length) {
              // Update existing page
              await connection.query(
                'UPDATE pages SET content = ? WHERE id = ?',
                [newTopicPages[i].content, originalTopicPages[i].id]
              );
              updatedCount++;
            } else {
              // Add new page
              await connection.query(
                'INSERT INTO pages (topic_id, subtopic_id, content) VALUES (?, NULL, ?)',
                [originalTopicId, newTopicPages[i].content]
              );
              updatedCount++;
            }
          }

          // Sync pages for each subtopic
          if (subtopics && Array.isArray(subtopics)) {
            for (const subtopic of subtopics) {
              const { newSubtopicId, originalSubtopicId } = subtopic;

              if (!originalSubtopicId) continue;

              const [newSubtopicPages] = await connection.query(
                'SELECT id, content FROM pages WHERE subtopic_id = ? ORDER BY id',
                [newSubtopicId]
              );

              const [originalSubtopicPages] = await connection.query(
                'SELECT id, content FROM pages WHERE subtopic_id = ? ORDER BY id',
                [originalSubtopicId]
              );

              // Delete pages from original that don't exist in new
              if (originalSubtopicPages.length > newSubtopicPages.length) {
                for (let i = newSubtopicPages.length; i < originalSubtopicPages.length; i++) {
                  await connection.query('DELETE FROM pages WHERE id = ?', [originalSubtopicPages[i].id]);
                  updatedCount++;
                }
              }

              // Update existing pages and add new ones
              for (let i = 0; i < newSubtopicPages.length; i++) {
                if (i < originalSubtopicPages.length) {
                  // Update existing page
                  await connection.query(
                    'UPDATE pages SET content = ? WHERE id = ?',
                    [newSubtopicPages[i].content, originalSubtopicPages[i].id]
                  );
                  updatedCount++;
                } else {
                  // Add new page
                  await connection.query(
                    'INSERT INTO pages (topic_id, subtopic_id, content) VALUES (?, ?, ?)',
                    [originalTopicId, originalSubtopicId, newSubtopicPages[i].content]
                  );
                  updatedCount++;
                }
              }
            }
          }
        }
      }

      await connection.commit();
      connection.release();

      return NextResponse.json({ 
        success: true, 
        message: `Successfully synced ${updatedCount} changes to original book(s)`,
        updatedCount
      });

    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }

  } catch (error) {
    console.error('Error syncing changes:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to sync changes: ' + error.message 
    }, { status: 500 });
  }
}
