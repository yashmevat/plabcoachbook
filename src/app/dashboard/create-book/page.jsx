'use client';
import { useState, useEffect } from 'react';

const CreateBookPage = () => {
  const [authors, setAuthors] = useState([]);
  const [expandedAuthors, setExpandedAuthors] = useState({});
  const [expandedBooks, setExpandedBooks] = useState({});
  const [expandedTopics, setExpandedTopics] = useState({});
  const [expandedSubtopics, setExpandedSubtopics] = useState({});
  
  const [newBook, setNewBook] = useState({
    title: '',
    author_id: null,
    topics: []
  });
  
  const [showChangePopup, setShowChangePopup] = useState(false);
  const [pendingChange, setPendingChange] = useState(null);
  const [loading, setLoading] = useState(false);

  // Fetch all authors with their books, topics, subtopics, and pages
  useEffect(() => {
    fetchAuthorsData();
  }, []);

  // Helper to parse API responses which typically return { success, data }
  const parseApi = async (res) => {
    let body;
    try {
      body = await res.json();
    } catch (e) {
      throw new Error('Invalid JSON response from API');
    }

    if (!res.ok) {
      throw new Error(body?.error || JSON.stringify(body));
    }

    if (body && typeof body === 'object' && 'success' in body) {
      if (!body.success) throw new Error(body.error || 'API returned success=false');
      return body.data ?? [];
    }

    return body;
  };

  const fetchAuthorsData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/authors');
      const authorsData = await parseApi(response);
      
      // Fetch books for each author
      const authorsWithBooks = await Promise.all(
        authorsData.map(async (author) => {
          const booksRes = await fetch(`/api/books?author_id=${author.id}`);
          const books = await parseApi(booksRes);
          
          // Fetch topics, subtopics, and pages for each book
          const booksWithDetails = await Promise.all(
            books.map(async (book) => {
              const topicsRes = await fetch(`/api/author/topics?book_id=${book.id}`);
              const topics = await parseApi(topicsRes);
              
              const topicsWithDetails = await Promise.all(
                topics.map(async (topic) => {
                  // Fetch direct pages under topic
                  const topicPagesRes = await fetch(`/api/author/pages?topic_id=${topic.id}`);
                  const topicPages = await parseApi(topicPagesRes);
                  
                  // Fetch subtopics under topic
                  const subtopicsRes = await fetch(`/api/author/subtopics?topic_id=${topic.id}`);
                  const subtopics = await parseApi(subtopicsRes);
                  
                  const subtopicsWithPages = await Promise.all(
                    subtopics.map(async (subtopic) => {
                      const subtopicPagesRes = await fetch(`/api/author/pages?subtopic_id=${subtopic.id}`);
                      const subtopicPages = await parseApi(subtopicPagesRes);
                      return { ...subtopic, pages: subtopicPages };
                    })
                  );
                  
                  return { ...topic, pages: topicPages, subtopics: subtopicsWithPages };
                })
              );
              
              return { ...book, topics: topicsWithDetails };
            })
          );
          
          return { ...author, books: booksWithDetails };
        })
      );
      
      setAuthors(authorsWithBooks);
    } catch (error) {
      console.error('Error fetching authors data:', error);
      alert('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const toggleAuthor = (authorId) => {
    setExpandedAuthors(prev => ({ ...prev, [authorId]: !prev[authorId] }));
  };

  const toggleBook = (bookId) => {
    setExpandedBooks(prev => ({ ...prev, [bookId]: !prev[bookId] }));
  };

  const toggleTopic = (topicId) => {
    setExpandedTopics(prev => ({ ...prev, [topicId]: !prev[topicId] }));
  };

  const toggleSubtopic = (subtopicId) => {
    setExpandedSubtopics(prev => ({ ...prev, [subtopicId]: !prev[subtopicId] }));
  };

  // Clone entire book
  const cloneBook = async (book, authorId) => {
    try {
      setLoading(true);
      
      const clonedBookData = {
        title: `${book.title} (Copy)`,
        author_id: authorId,
        source_book_id: book.id
      };
      
      // Create new book
      const bookRes = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clonedBookData)
      });
      
      const newBookData = await parseApi(bookRes);
      const newBookId = newBookData.id;
      
      // Clone all topics
      for (const topic of book.topics) {
        const topicRes = await fetch('/api/topics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: topic.title,
            book_id: newBookId,
            source_topic_id: topic.id
          })
        });
        
        const newTopic = await parseApi(topicRes);
        
        // Clone direct pages under topic
        for (const page of topic.pages) {
          await fetch('/api/author/pages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              topic_id: newTopic.id,
              subtopic_id: null,
              content: page.content,
              source_page_id: page.id
            })
          });
        }
        
        // Clone subtopics and their pages
        for (const subtopic of topic.subtopics) {
          const subtopicRes = await fetch('/api/topics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: subtopic.title,
              book_id: newBookId,
              topic_id: newTopic.id,
              source_subtopic_id: subtopic.id
            })
          });
          
          const newSubtopic = await parseApi(subtopicRes);
          
          for (const page of subtopic.pages) {
            await fetch('/api/author/pages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                topic_id: newTopic.id,
                subtopic_id: newSubtopic.id,
                content: page.content,
                source_page_id: page.id
              })
            });
          }
        }
      }
      
      alert(`Book "${book.title}" cloned successfully!`);
      fetchAuthorsData(); // Refresh data
    } catch (error) {
      console.error('Error cloning book:', error);
      alert('Failed to clone book');
    } finally {
      setLoading(false);
    }
  };

  // Add topic to new book
  const addTopicToNewBook = (topic, bookId) => {
    setNewBook(prev => ({
      ...prev,
      topics: [...prev.topics, { ...topic, source_book_id: bookId, source_topic_id: topic.id }]
    }));
  };

  // Add subtopic to new book
  const addSubtopicToNewBook = (subtopic, topicId, bookId) => {
    setNewBook(prev => ({
      ...prev,
      topics: [...prev.topics, { 
        ...subtopic, 
        source_book_id: bookId, 
        source_topic_id: topicId,
        source_subtopic_id: subtopic.id,
        isSubtopic: true 
      }]
    }));
  };

  // Save new book with selected topics/subtopics
  const saveNewBook = async () => {
    if (!newBook.title || !newBook.author_id || newBook.topics.length === 0) {
      alert('Please enter book title, select author, and add at least one topic/subtopic');
      return;
    }
    
    try {
      setLoading(true);
      
      // Create new book
      const bookRes = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newBook.title,
          author_id: newBook.author_id
        })
      });
      
      const createdBook = await parseApi(bookRes);
      
      // Add selected topics/subtopics
      for (const item of newBook.topics) {
        if (item.isSubtopic) {
          // Add as subtopic
          const subtopicRes = await fetch('/api/topics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: item.title,
              book_id: createdBook.id,
              source_subtopic_id: item.source_subtopic_id
            })
          });
          
          const newSubtopic = await parseApi(subtopicRes);
          
          // Clone pages
          for (const page of item.pages) {
            await fetch('/api/author/pages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                subtopic_id: newSubtopic.id,
                content: page.content,
                source_page_id: page.id
              })
            });
          }
        } else {
          // Add as topic
          const topicRes = await fetch('/api/topics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: item.title,
              book_id: createdBook.id,
              source_topic_id: item.source_topic_id
            })
          });
          
          const newTopic = await parseApi(topicRes);
          
          // Clone pages and subtopics
          for (const page of item.pages) {
            await fetch('/api/author/pages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                topic_id: newTopic.id,
                content: page.content,
                source_page_id: page.id
              })
            });
          }
          
          for (const subtopic of item.subtopics || []) {
            const subtopicRes = await fetch('/api/topics', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: subtopic.title,
                book_id: createdBook.id,
                topic_id: newTopic.id,
                source_subtopic_id: subtopic.id
              })
            });
            
            const newSubtopic = await parseApi(subtopicRes);
            
            for (const page of subtopic.pages) {
              await fetch('/api/author/pages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  topic_id: newTopic.id,
                  subtopic_id: newSubtopic.id,
                  content: page.content,
                  source_page_id: page.id
                })
              });
            }
          }
        }
      }
      
      alert('New book created successfully!');
      setNewBook({ title: '', author_id: null, topics: [] });
      fetchAuthorsData();
    } catch (error) {
      console.error('Error creating new book:', error);
      alert('Failed to create book');
    } finally {
      setLoading(false);
    }
  };

  // Handle change with popup
  const handleChangeWithPopup = (changeData) => {
    setPendingChange(changeData);
    setShowChangePopup(true);
  };

  // Apply change everywhere or only in new book
  const applyChange = async (everywhere) => {
    if (!pendingChange) return;
    
    try {
      setLoading(true);
      
      if (everywhere && pendingChange.source_id) {
        // Update both new and source
        await fetch(`/api/${pendingChange.type}/${pendingChange.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pendingChange.data)
        });
        
        await fetch(`/api/${pendingChange.type}/${pendingChange.source_id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pendingChange.data)
        });
      } else {
        // Update only new book
        await fetch(`/api/${pendingChange.type}/${pendingChange.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pendingChange.data)
        });
      }
      
      alert('Changes saved successfully!');
      fetchAuthorsData();
    } catch (error) {
      console.error('Error applying changes:', error);
      alert('Failed to save changes');
    } finally {
      setLoading(false);
      setShowChangePopup(false);
      setPendingChange(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">📚 Create/Clone Book</h1>
        
        {loading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-700">Processing...</p>
            </div>
          </div>
        )}

        {/* New Book Builder Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">🆕 Build New Book</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Book Title</label>
              <input
                type="text"
                value={newBook.title}
                onChange={(e) => setNewBook(prev => ({ ...prev, title: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                placeholder="Enter book title..."
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Author</label>
              <select
                value={newBook.author_id || ''}
                onChange={(e) => setNewBook(prev => ({ ...prev, author_id: parseInt(e.target.value) }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
              >
                <option value="">Choose an author...</option>
                {authors.map(author => (
                  <option key={author.id} value={author.id}>{author.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          {newBook.topics.length > 0 && (
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Selected Topics/Subtopics:</h3>
              <ul className="space-y-2">
                {newBook.topics.map((topic, idx) => (
                  <li key={idx} className="flex items-center justify-between bg-blue-50 p-3 rounded-lg">
                    <span className="text-gray-800">
                      {topic.isSubtopic ? '📑' : '📖'} {topic.title}
                    </span>
                    <button
                      onClick={() => setNewBook(prev => ({
                        ...prev,
                        topics: prev.topics.filter((_, i) => i !== idx)
                      }))}
                      className="text-red-600 hover:text-red-800"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          <button
            onClick={saveNewBook}
            disabled={!newBook.title || !newBook.author_id || newBook.topics.length === 0}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            💾 Save New Book
          </button>
        </div>

        {/* Authors, Books, Topics Accordion */}
        <div className="space-y-4">
          {authors.map(author => (
            <div key={author.id} className="bg-white rounded-lg shadow-md overflow-hidden">
              <button
                onClick={() => toggleAuthor(author.id)}
                className="w-full px-6 py-4 flex items-center justify-between bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
              >
                <span>👤 {author.name} ({author.books?.length || 0} books)</span>
                <span className="text-2xl">{expandedAuthors[author.id] ? '−' : '+'}</span>
              </button>
              
              {expandedAuthors[author.id] && author.books && (
                <div className="p-4 space-y-3">
                  {author.books.map(book => (
                    <div key={book.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between bg-gray-100 px-4 py-3">
                        <button
                          onClick={() => toggleBook(book.id)}
                          className="flex-1 text-left font-medium text-gray-800 hover:text-blue-600"
                        >
                          📚 {book.title} ({book.topics?.length || 0} topics)
                        </button>
                        <button
                          onClick={() => cloneBook(book, author.id)}
                          className="ml-4 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 text-sm font-semibold"
                        >
                          📋 Clone Book
                        </button>
                        <button
                          onClick={() => toggleBook(book.id)}
                          className="ml-2 text-2xl text-gray-600"
                        >
                          {expandedBooks[book.id] ? '−' : '+'}
                        </button>
                      </div>
                      
                      {expandedBooks[book.id] && book.topics && (
                        <div className="p-4 space-y-2 bg-gray-50">
                          {book.topics.map(topic => (
                            <div key={topic.id} className="border border-gray-300 rounded-lg overflow-hidden bg-white">
                              <div className="flex items-center justify-between bg-green-50 px-4 py-2">
                                <button
                                  onClick={() => toggleTopic(topic.id)}
                                  className="flex-1 text-left font-medium text-gray-700 hover:text-green-600"
                                >
                                  📖 {topic.title}
                                </button>
                                <button
                                  onClick={() => addTopicToNewBook(topic, book.id)}
                                  className="ml-4 bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600"
                                >
                                  ➕ Add to New Book
                                </button>
                                <button
                                  onClick={() => toggleTopic(topic.id)}
                                  className="ml-2 text-xl text-gray-600"
                                >
                                  {expandedTopics[topic.id] ? '−' : '+'}
                                </button>
                              </div>
                              
                              {expandedTopics[topic.id] && (
                                <div className="p-3 space-y-2">
                                  {/* Direct Pages under Topic */}
                                  {topic.pages && topic.pages.length > 0 && (
                                    <div className="mb-2">
                                      <p className="text-sm font-semibold text-gray-600 mb-1">Direct Pages:</p>
                                      <ul className="space-y-1">
                                        {topic.pages.map(page => (
                                          <li key={page.id} className="text-sm text-gray-700 bg-yellow-50 px-3 py-1 rounded">
                                            📄 Page {page.id}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  
                                  {/* Subtopics */}
                                  {topic.subtopics && topic.subtopics.length > 0 && (
                                    <div>
                                      <p className="text-sm font-semibold text-gray-600 mb-1">Subtopics:</p>
                                      {topic.subtopics.map(subtopic => (
                                        <div key={subtopic.id} className="border border-gray-200 rounded mb-2 overflow-hidden">
                                          <div className="flex items-center justify-between bg-purple-50 px-3 py-2">
                                            <button
                                              onClick={() => toggleSubtopic(subtopic.id)}
                                              className="flex-1 text-left text-sm font-medium text-gray-700 hover:text-purple-600"
                                            >
                                              📑 {subtopic.title}
                                            </button>
                                            <button
                                              onClick={() => addSubtopicToNewBook(subtopic, topic.id, book.id)}
                                              className="ml-2 bg-purple-500 text-white px-2 py-1 rounded text-xs hover:bg-purple-600"
                                            >
                                              ➕ Add
                                            </button>
                                            <button
                                              onClick={() => toggleSubtopic(subtopic.id)}
                                              className="ml-2 text-lg text-gray-600"
                                            >
                                              {expandedSubtopics[subtopic.id] ? '−' : '+'}
                                            </button>
                                          </div>
                                          
                                          {expandedSubtopics[subtopic.id] && subtopic.pages && (
                                            <div className="p-2 bg-purple-25">
                                              <p className="text-xs font-semibold text-gray-600 mb-1">Pages:</p>
                                              <ul className="space-y-1">
                                                {subtopic.pages.map(page => (
                                                  <li key={page.id} className="text-xs text-gray-700 bg-white px-2 py-1 rounded">
                                                    📄 Page {page.id}
                                                  </li>
                                                ))}
                                              </ul>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Change Popup */}
        {showChangePopup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full">
              <h3 className="text-2xl font-bold text-gray-900 mb-4">🔄 Apply Changes</h3>
              <p className="text-gray-700 mb-6">
                Do you want to apply this change everywhere (including the original source) or only in the new book?
              </p>
              
              <div className="flex gap-4">
                <button
                  onClick={() => applyChange(true)}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700"
                >
                  🌍 Change Everywhere
                </button>
                <button
                  onClick={() => applyChange(false)}
                  className="flex-1 bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700"
                >
                  📘 Only New Book
                </button>
              </div>
              
              <button
                onClick={() => {
                  setShowChangePopup(false);
                  setPendingChange(null);
                }}
                className="w-full mt-4 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateBookPage;